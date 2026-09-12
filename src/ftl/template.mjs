import { nodes } from './ast.mjs';
import { BoundedCache } from './cache.mjs';
import { Fragments } from './dom.mjs';
import { ExpressionEvaluator } from './expressions.mjs';

/**
 * Collects the changes a render makes to the tree it is traversing, deferring
 * those that would break the traversal: a node marked for removal stays in
 * place until the render finishes, so the iteration containing it completes.
 */
class NodeOperations {
    #forRemoval = new Set();
    removed(node) {
        return this.#forRemoval.has(node);
    }
    remove(node) {
        node.replaceChildren?.();
        Object.keys(node.dataset || {})
            .filter((k) => k.startsWith('tpl'))
            .forEach((k) => {
                delete node.dataset[k];
            });
        this.#forRemoval.add(node);
    }
    popData(node, key) {
        const v = node.dataset[key];
        delete node.dataset[key];
        return v;
    }
    prepend(ref, node) {
        ref.parentNode.insertBefore(node, ref);
    }
    append(ref, node) {
        ref.parentNode.insertBefore(node, ref.nextSibling);
    }
    replace(ref, node) {
        this.prepend(ref, node);
        this.remove(ref);
    }
    cleanup() {
        for (const node of this.#forRemoval) {
            node.remove();
        }
        this.#forRemoval.clear();
    }
}

/** The `data-tpl-*` commands, each taking the node it is written on and the scope it evaluates in. */
class CommandsHandler {
    //the order is the semantics: each command sees the node as the ones before
    //it left it, so tplIf gates before tplWith/tplEach push their overlay and
    //tplWhen gates after (inside the sub-render, where the overlay is in scope)
    static ORDERED_COMMANDS = [
        'tplIf',
        'tplWith',
        'tplEach',
        'tplWhen',
        'tplClassAppend',
        'tplAttrAppend',
        'tplRemove',
        'tplVerbatim',
    ];
    //same body as tplWhen: the two differ only in ORDERED_COMMANDS position,
    //if evaluates in the outer scope, before with/each
    static tplIf(node, expression, ops, evaluator) {
        const accept = evaluator.evaluateExpression(expression);
        if (!accept) {
            ops.remove(node);
        }
    }
    static tplWith(node, expression, ops, evaluator) {
        const evaluated = evaluator.evaluateExpression(expression);
        const varName = ops.popData(node, 'tplVar');
        const newNode = new Template(node, evaluator)
            .withOverlay(varName ? { [varName]: evaluated } : evaluated)
            .render();
        ops.replace(node, newNode);
    }
    static tplEach(node, expression, ops, evaluator) {
        const varName = ops.popData(node, 'tplVar');
        const statName = ops.popData(node, 'tplStat');
        const template = new Template(node, evaluator);
        const evaluated = evaluator.evaluateExpression(expression);
        //keyed collections iterate as {key, value} entries: a Map in its own
        //order, a non-iterable plain dict in Object.entries order. Plain alone:
        //a class instance or a response wrapper standing where an array was
        //expected still fails loudly below, and any other iterable (a Set, a
        //generator, an entries() iterator) iterates as itself
        const proto = evaluated === null || typeof evaluated !== 'object' ? undefined : Object.getPrototypeOf(evaluated);
        const keyed =
            evaluated instanceof Map
                ? [...evaluated]
                : !evaluated?.[Symbol.iterator] && (proto === Object.prototype || proto === null)
                  ? Object.entries(evaluated)
                  : null;
        const entries = keyed === null ? evaluated : keyed.map(([key, value]) => ({ key, value }));
        if (!entries?.[Symbol.iterator]) {
            throw new Error(`Expected an iterable got '${evaluated}'`);
        }
        if (!statName) {
            for (const v of entries) {
                ops.prepend(node, template.withOverlay(varName ? { [varName]: v } : v).render());
            }
            ops.remove(node);
            return;
        }
        //the stat rides grouped under its declared name, overlaid below the
        //item, so data can never collide with its fields and an item property
        //sharing the stat's very name wins, as data always does. The size is
        //read where the collection already knows it (arrays and keyed entries
        //by length, sets and the like by size): an arbitrary iterator is never
        //consumed to learn it, so its size and last read null, the unknown
        const size = Array.isArray(entries)
            ? entries.length
            : typeof entries.length === 'number'
              ? entries.length
              : typeof entries.size === 'number'
                ? entries.size
                : null;
        let index = 0;
        for (const v of entries) {
            const stat = {
                index,
                count: index + 1,
                size,
                first: index === 0,
                last: size === null ? null : index === size - 1,
                even: index % 2 === 0,
                odd: index % 2 === 1,
            };
            ops.prepend(
                node,
                template.withOverlay({ [statName]: stat }, varName ? { [varName]: v } : v).render(),
            );
            ++index;
        }
        ops.remove(node);
    }
    //same body as tplIf: the two differ only in ORDERED_COMMANDS position,
    //when evaluates after with/each, in the scope their overlay opened
    static tplWhen(node, expression, ops, evaluator) {
        const accept = evaluator.evaluateExpression(expression);
        if (!accept) {
            ops.remove(node);
        }
    }
    static tplVerbatim(node, expression, ops, evaluator) {
        const newNode = node.cloneNode(true);
        ops.replace(node, newNode);
    }
    static tplRemove(node, value, ops, evaluator) {
        switch (value.toLowerCase()) {
            case 'tag': {
                const fragment = new DocumentFragment();
                while (node.firstChild) {
                    fragment.appendChild(node.firstChild);
                }
                if ('tplVerbatim' in node.dataset) {
                    //we are removing the parent element so we have to handle the lower priority commands
                    ops.popData(node, 'tplVerbatim');
                    ops.replace(node, fragment);
                } else {
                    ops.append(node, fragment);
                    ops.remove(node);
                }
                break;
            }
            case 'body':
                node.replaceChildren();
                break;
            case 'all':
                ops.remove(node);
                break;
        }
    }
    static tplClassAppend(node, expression, ops, evaluator) {
        const classes = evaluator.evaluateExpression(expression);
        if (!classes) {
            return;
        }
        const classesAsArray = Array.isArray(classes) ? classes : [classes];
        const cleanClasses = classesAsArray.flatMap((c) => (typeof c === 'string' ? c.split(' ') : c)).filter(Boolean);
        if (cleanClasses.length === 0) {
            return;
        }
        node.classList.add(...cleanClasses);
    }
    static tplAttrAppend(node, expression, ops, evaluator) {
        const attributesAndValues = evaluator.evaluateExpression(expression);
        if (!attributesAndValues || attributesAndValues.length === 0) {
            return;
        }
        const tuples = Array.isArray(attributesAndValues[0]) ? attributesAndValues : [attributesAndValues];
        tuples.forEach(([k, v]) => {
            node.setAttribute(k, v);
        });
    }
    static textNode(node, expression, ops, evaluator) {
        for (const v of evaluator.evaluateTemplated(expression)) {
            if (v.value == null) {
                continue;
            }
            switch (v.type) {
                case nodes.dom.t:
                    ops.prepend(node, document.createTextNode(v.value));
                    break;
                case nodes.dom.h:
                    ops.prepend(node, Fragments.fromHtml(typeof v.value === 'string' ? v.value : String(v.value)));
                    break;
                case nodes.dom.n:
                    if (!(v.value instanceof Node)) {
                        throw new TypeError(`Expected a Node, got '${typeof v.value}'`);
                    }
                    ops.prepend(node, v.value);
                    break;
            }
        }
        ops.remove(node);
    }
}

// Module-isolated string cache for dataset-to-attribute conversions
const attributeCache = new BoundedCache(1000);

/**
 * Converts a tpl camelCase dataset key into a kebab-case attribute name.
 * Uses a cache lookup to avoid repetitive regex/string splitting.
 * @param {string} dataSetKey
 * @returns {string}
 */
function toAttr(dataSetKey) {
    return attributeCache.getOrCompute(dataSetKey, (k) =>
        k
            .substring(3)
            .split(/(?=[A-Z])/)
            .join('-')
            .toLowerCase(),
    );
}

/**
 * A compiled fragment together with the scope it renders in. Both are
 * immutable: adding data or replacing the scope returns a new Template, so one
 * piece of compiled markup can be rendered against any number of scopes and a
 * registry can reuse a single template for every element that requests it.
 */
class Template {
    /**
     * Creates a template from a string.
     * @param {string} html
     * @param {{ [k: string] : any }?} [modules]
     * @param {...*} data
     * @returns the template
     */
    static fromHtml(html, modules, ...data) {
        return new Template(Fragments.fromHtml(html), new ExpressionEvaluator(modules, data));
    }

    /**
     * Creates a template from the content of the first template element matching the selector.
     * @param {string} selector for an HTMLTemplateElement
     * @param {{ [k: string] : any }?} [modules]
     * @param {...*} data
     * @returns the template
     */
    static fromSelector(selector, modules, ...data) {
        const templateEl = document.querySelector(selector);
        if (!(templateEl instanceof HTMLTemplateElement)) {
            throw new Error('template selector does not match any template tag');
        }
        const fragment = document.adoptNode(templateEl.content);
        return new Template(fragment, new ExpressionEvaluator(modules, data));
    }

    /**
     * Creates a template from the content of an HTMLTemplateElement.
     * @param {HTMLTemplateElement} templateEl
     * @param {{ [k: string] : any }?} [modules]
     * @param {...*} data
     * @returns the template
     */
    static fromTemplate(templateEl, modules, ...data) {
        const fragment = document.adoptNode(templateEl.content);
        return new Template(fragment, new ExpressionEvaluator(modules, data));
    }

    /**
     * Creates a template from a DocumentFragment.
     * @param {DocumentFragment} fragment
     * @param { { [k: string] : any }? } [modules]
     * @param {...*} data
     * @returns the template
     */
    static fromFragment(fragment, modules, ...data) {
        return new Template(fragment, new ExpressionEvaluator(modules, data));
    }
    #fragment;
    #evaluator;
    /**
     * Creates a template: a fragment plus the scope it renders in.
     * @param {DocumentFragment} fragment
     * @param {ExpressionEvaluator} evaluator the modules and data stack the expressions resolve against
     */
    constructor(fragment, evaluator) {
        this.#fragment = fragment;
        this.#evaluator = evaluator;
    }
    /**
     * Creates a new Template rendering in another scope: the one way to rebind
     * a compiled template to a registry's modules and data.
     * @param {ExpressionEvaluator} evaluator
     */
    withEvaluator(evaluator) {
        return new Template(this.#fragment, evaluator);
    }
    /**
     * Creates a new Template replacing the fragment.
     * @param {DocumentFragment} fragment
     */
    withFragment(fragment) {
        return new Template(fragment, this.#evaluator);
    }
    /**
     * Creates a new Template with a new module added.
     * @param {string?} name
     * @param {{[k: string]: any}} value
     */
    withModule(name, value) {
        return new Template(this.#fragment, this.#evaluator.withModule(name, value));
    }
    /**
     * Creates a new Template with new a data overlay added to the stack.
     * @param {...*} data
     */
    withOverlay(...data) {
        return new Template(this.#fragment, this.#evaluator.withOverlay(...data));
    }
    /**
     * Evaluates an expression in this template's scope, widened by the overlays.
     * @param {string} expression
     * @param {...*} data
     * @returns the evaluated expression result
     */
    evaluateExpression(expression, ...data) {
        return this.#evaluator.withOverlay(...data).evaluateExpression(expression);
    }
    /**
     * Evaluates a templated text, the `{{ }}` form, in this template's scope.
     * @param {string} text
     * @param {...*} data
     * @returns the parts the text evaluates to
     */
    evaluateTemplated(text, ...data) {
        return this.#evaluator.withOverlay(...data).evaluateTemplated(text);
    }
    /**
     * Returns an expression evaluator with bound modules and dataStack.
     */
    evaluator() {
        return this.#evaluator;
    }
    /**
     * Renders the template.
     * @returns a DocumentFragment
     */
    render() {
        try {
            const ops = new NodeOperations();
            const imported = document.importNode(this.#fragment, true);
            const fragment =
                imported.nodeType === Node.DOCUMENT_FRAGMENT_NODE
                    ? imported
                    : (() => {
                          const d = new DocumentFragment();
                          d.appendChild(imported);
                          return d;
                      })();
            const iterator = document.createNodeIterator(
                fragment,
                NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
                Template.#NODE_FILTER,
            );
            let node;
            while ((node = iterator.nextNode()) !== null) {
                ops.cleanup();
                if (node.nodeType === Node.TEXT_NODE) {
                    try {
                        CommandsHandler.textNode(node, node.nodeValue, ops, this.#evaluator);
                    } catch (ex) {
                        throw RenderError.wrap('Error evaluating text node', node, ex);
                    }
                    continue;
                }
                const el = /** @type {HTMLElement} */ (node);
                for (const command of CommandsHandler.ORDERED_COMMANDS) {
                    if (!(command in el.dataset)) {
                        continue;
                    }
                    const value = ops.popData(el, command);
                    try {
                        CommandsHandler[command](el, value, ops, this.#evaluator);
                    } catch (ex) {
                        //the directive is popped before it runs, so the open tag no
                        //longer carries it: the frame names it and its expression
                        throw RenderError.wrap(`Error evaluating data-tpl-${toAttr(command)}="${value}"`, el, ex);
                    }
                    if (ops.removed(el)) {
                        break;
                    }
                }
                for (const dataSetKey of Object.keys(el.dataset || {})) {
                    if (!dataSetKey.startsWith('tpl')) {
                        continue;
                    }
                    const attributeName = toAttr(dataSetKey);
                    const expression = ops.popData(el, dataSetKey);
                    try {
                        const evaluated = this.#evaluator.evaluateExpression(expression);
                        if (typeof evaluated === 'boolean') {
                            el.toggleAttribute(attributeName, evaluated);
                            continue;
                        }
                        if (evaluated !== null && evaluated !== undefined) {
                            el.setAttribute(attributeName, evaluated);
                        }
                    } catch (ex) {
                        throw RenderError.wrap(`Error evaluating data-tpl-${toAttr(dataSetKey)}="${expression}"`, el, ex);
                    }
                }
            }
            ops.cleanup();
            return fragment;
        } catch (ex) {
            //a command, a text node or a nested render already named the node it
            //failed on: wrapping again would add a frame for the fragment that
            //contains it, one per level, serializing the whole template into the
            //message that survives. Only a failure outside those is framed here
            if (ex instanceof RenderError) {
                throw ex;
            }
            throw new RenderError('Error rendering template', this.#fragment, ex);
        }
    }
    /**
     * Renders this template on the Element (replacing children).
     * @param {Element} el
     */
    renderTo(el) {
        el.replaceChildren(this.render());
    }
    /**
     * Renders this template appending the resulting fragment to the Element.
     * @param {Element} el
     */
    appendTo(el) {
        el.appendChild(this.render());
    }
    /**
     * Renders this template on the first Element matching the selector (replacing children), if exists.
     * @param {string} selector
     */
    renderToSelector(selector) {
        const el = document.querySelector(selector);
        if (el) {
            this.renderTo(el);
        }
    }
    /**
     * Renders this template appending the resulting fragment to the Element matching the selector, if exists.
     * @param {string} selector
     */
    appendToSelector(selector) {
        const el = document.querySelector(selector);
        if (el) {
            this.appendTo(el);
        }
    }
    static #NODE_FILTER(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.nodeValue.includes('{{') && node.nodeValue.includes('}}')
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT;
        }
        for (const attr of node.attributes) {
            if (attr.name.startsWith('data-tpl-')) {
                return NodeFilter.FILTER_ACCEPT;
            }
        }
        return NodeFilter.FILTER_SKIP;
    }
}

/**
 * A render failure, one frame per nesting level. Each frame names the node it
 * failed on and what was being evaluated there, so the chain reads as the path
 * from the template's root down to the offending expression. The frame carries
 * the node's identification only, an open tag rather than its whole subtree:
 * the markup is serialized on demand through `html`, and the live node stays on
 * `node`, so a failure costs no clone and a nested failure does not embed the
 * page in its own message.
 */
class RenderError extends Error {
    /**
     * How many frames a chain keeps. The innermost are the specific ones, so a
     * deeper nesting drops the outer context rather than the failure site: three
     * frames name the offending node and the two levels that hold it, which is
     * the path a reader follows without the page arriving with it.
     */
    static FRAMES = 3;
    #node;
    #depth;
    /** true when the budget dropped the outer frames of this chain */
    truncated = false;
    /**
     * Frames a failure, unless the chain already spent its budget: then the
     * cause travels on, marked so a report can say the outer context was
     * dropped.
     */
    static wrap(message, nodeOrFragment, cause) {
        if (cause instanceof RenderError && cause.depth >= RenderError.FRAMES) {
            cause.truncated = true;
            return cause;
        }
        return new RenderError(message, nodeOrFragment, cause);
    }
    constructor(message, nodeOrFragment, cause) {
        super(`${message} in \`${RenderError.describe(nodeOrFragment)}\``, { cause });
        this.name = 'RenderError';
        this.#node = nodeOrFragment;
        this.#depth = (cause instanceof RenderError ? cause.depth : 0) + 1;
    }
    /** How many frames this chain carries, this one included. */
    get depth() {
        return this.#depth;
    }
    /** The node the render failed on, live: it keeps its place in the fragment being built. */
    get node() {
        return this.#node;
    }
    /** The node's markup, serialized when asked for rather than on every failure. */
    get html() {
        return RenderError.stringify(this.#node);
    }
    /**
     * What identifies a node in a frame: an element by its open tag, a text node
     * by its source, a fragment by the open tags of the elements it holds.
     */
    static describe(nodeOrFragment) {
        if (nodeOrFragment.nodeType === Node.TEXT_NODE) {
            return RenderError.#ellipsize(String(nodeOrFragment.nodeValue).trim());
        }
        if (nodeOrFragment.nodeType === Node.ELEMENT_NODE) {
            const el = /** @type Element */ (nodeOrFragment);
            const attrs = Array.from(el.attributes, (a) => ` ${a.name}="${a.value}"`).join('');
            return RenderError.#ellipsize(`<${el.localName}${attrs}>`);
        }
        const children = Array.from(nodeOrFragment.childNodes)
            .filter((n) => n.nodeType === Node.ELEMENT_NODE || String(n.nodeValue ?? '').trim().length > 0)
            .map((n) => RenderError.describe(n));
        return RenderError.#ellipsize(children.join(''));
    }
    static #ellipsize(text) {
        return text.length > 120 ? `${text.slice(0, 120)}…` : text;
    }
    static stringify(nodeOrFragment) {
        const t = document.createElement('template');
        t.content.appendChild(RenderError.#cleanup(nodeOrFragment.cloneNode(true)));
        return t.innerHTML;
    }
    static #cleanup(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            node.nodeValue = node.nodeValue.trim();
        }
        for (let n = 0; n < node.childNodes.length; n++) {
            const child = node.childNodes[n];
            if (child.nodeType === Node.TEXT_NODE) {
                child.nodeValue = child.nodeValue.trim();
                if (child.nodeValue.length === 0) {
                    node.removeChild(child);
                    n--;
                }
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                RenderError.#cleanup(child);
            }
        }
        return node;
    }
}

export { Template, RenderError };
