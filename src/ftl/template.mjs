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
    /**
     * The order the commands run in on one element, each seeing the node as the
     * ones before left it: tplIf gates before tplWith and tplEach push their
     * overlay, tplWhen gates after, inside the scope that overlay opened.
     */
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
    /** Removes the node when the expression is falsy, evaluated before tplWith and tplEach open their overlay. */
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
    /**
     * Renders the node once per entry, in place of the node. A Map iterates as
     * `{ key, value }` entries in its own order, a plain object as `{ key, value }`
     * entries in `Object.entries` order, and any other iterable as itself; a
     * value that is none of these throws. Each render sees its entry under
     * `data-tpl-var`, or as the whole overlay without one. `data-tpl-stat` names
     * an overlay beneath the entry carrying `index`, `count`, `size`, `first`,
     * `last`, `even` and `odd`, so an entry property of the same name wins; the
     * size, and so `last`, is null for a collection that knows neither its
     * `length` nor its `size`, which is never consumed to learn it.
     */
    static tplEach(node, expression, ops, evaluator) {
        const varName = ops.popData(node, 'tplVar');
        const statName = ops.popData(node, 'tplStat');
        const template = new Template(node, evaluator);
        const evaluated = evaluator.evaluateExpression(expression);
        const proto = evaluated === null || typeof evaluated !== 'object' ? undefined : Object.getPrototypeOf(evaluated);
        const plain = !evaluated?.[Symbol.iterator] && (proto === Object.prototype || proto === null);
        const dict = plain ? Object.entries(evaluated) : null;
        const keyed = evaluated instanceof Map ? [...evaluated] : dict;
        const entries = keyed === null ? evaluated : keyed.map(([key, value]) => ({ key, value }));
        if (!entries?.[Symbol.iterator]) {
            throw new Error(`Expected an iterable got '${evaluated}'`);
        }
        const measured = statName ? entries : null;
        const counted = typeof measured?.length === 'number' ? measured.length : measured?.size;
        const size = typeof counted === 'number' ? counted : null;
        let index = 0;
        for (const v of entries) {
            const item = varName ? { [varName]: v } : v;
            const stat = {
                index,
                count: index + 1,
                size,
                first: index === 0,
                last: size === null ? null : index === size - 1,
                even: index % 2 === 0,
                odd: index % 2 === 1,
            };
            const layers = statName ? [{ [statName]: stat }, item] : [item];
            ops.prepend(node, template.withOverlay(...layers).render());
            ++index;
        }
        ops.remove(node);
    }
    /** Removes the node when the expression is falsy, evaluated in the overlay tplWith or tplEach opened. */
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
                const fragment = Fragments.fromChildNodes(node);
                if ('tplVerbatim' in node.dataset) {
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

const attributeCache = new BoundedCache(1000);

/**
 * The attribute a `tpl` dataset key targets: `tplAriaLabel` is `aria-label`.
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
     * Creates a template from html.
     * @param {string} html
     * @param {{ [k: string] : any }?} [modules]
     * @param {...*} data the data stack, innermost last
     * @returns {Template}
     */
    static fromHtml(html, modules, ...data) {
        return new Template(Fragments.fromHtml(html), new ExpressionEvaluator(modules, data));
    }

    /**
     * Creates a template from the content of the first element matching the
     * selector, which is adopted: the template element is left empty.
     * @param {string} selector for an HTMLTemplateElement
     * @param {{ [k: string] : any }?} [modules]
     * @param {...*} data the data stack, innermost last
     * @returns {Template}
     * @throws when the selector matches no template element
     */
    static fromSelector(selector, modules, ...data) {
        const templateEl = document.querySelector(selector);
        if (!(templateEl instanceof HTMLTemplateElement)) {
            throw new Error('template selector does not match any template tag');
        }
        return Template.fromTemplate(templateEl, modules, ...data);
    }

    /**
     * Creates a template from the content of a template element, which is
     * adopted: the template element is left empty.
     * @param {HTMLTemplateElement} templateEl
     * @param {{ [k: string] : any }?} [modules]
     * @param {...*} data the data stack, innermost last
     * @returns {Template}
     */
    static fromTemplate(templateEl, modules, ...data) {
        const fragment = document.adoptNode(templateEl.content);
        return new Template(fragment, new ExpressionEvaluator(modules, data));
    }

    /**
     * Creates a template over a fragment, which is imported afresh on every
     * render and never modified.
     * @param {DocumentFragment} fragment
     * @param { { [k: string] : any }? } [modules]
     * @param {...*} data the data stack, innermost last
     * @returns {Template}
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
     * @returns {Template}
     */
    withEvaluator(evaluator) {
        return new Template(this.#fragment, evaluator);
    }
    /**
     * Creates a new Template over another fragment, in the same scope.
     * @param {DocumentFragment} fragment
     * @returns {Template}
     */
    withFragment(fragment) {
        return new Template(fragment, this.#evaluator);
    }
    /**
     * Creates a new Template with a module added, as `ExpressionEvaluator.withModule` does.
     * @param {string?} name
     * @param {{[k: string]: any}} value
     * @returns {Template}
     */
    withModule(name, value) {
        return new Template(this.#fragment, this.#evaluator.withModule(name, value));
    }
    /**
     * Creates a new Template with the data pushed as the innermost overlays.
     * @param {...*} data
     * @returns {Template}
     */
    withOverlay(...data) {
        return new Template(this.#fragment, this.#evaluator.withOverlay(...data));
    }
    /**
     * Evaluates an expression in this template's scope, widened by the overlays.
     * @param {string} expression
     * @param {...*} data
     * @returns {any}
     */
    evaluateExpression(expression, ...data) {
        return this.#evaluator.withOverlay(...data).evaluateExpression(expression);
    }
    /**
     * Evaluates a templated text, the `{{ }}` form, in this template's scope.
     * @param {string} text
     * @param {...*} data
     * @returns {{ type: symbol, value: any }[]} the parts, as `Expressions.MODE_TEMPLATED` describes
     */
    evaluateTemplated(text, ...data) {
        return this.#evaluator.withOverlay(...data).evaluateTemplated(text);
    }
    /**
     * The scope this template renders in.
     * @returns {ExpressionEvaluator}
     */
    evaluator() {
        return this.#evaluator;
    }
    /**
     * Renders the template into a new fragment, applying the `data-tpl-*`
     * commands and bindings and the `{{ }}` interpolations.
     * @returns {DocumentFragment}
     * @throws {RenderError} naming the node and the directive that failed
     */
    render() {
        try {
            const ops = new NodeOperations();
            const imported = document.importNode(this.#fragment, true);
            const fragment = imported.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? imported : Fragments.from(imported);
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
                        throw RenderError.wrap(`Error evaluating data-tpl-${attributeName}="${expression}"`, el, ex);
                    }
                }
            }
            ops.cleanup();
            return fragment;
        } catch (ex) {
            if (ex instanceof RenderError) {
                throw ex;
            }
            throw new RenderError('Error rendering template', this.#fragment, ex);
        }
    }
    /**
     * Renders this template into the element, replacing its children.
     * @param {Element} el
     * @throws {RenderError}
     */
    renderTo(el) {
        el.replaceChildren(this.render());
    }
    /**
     * Renders this template and appends the result to the element.
     * @param {Element} el
     * @throws {RenderError}
     */
    appendTo(el) {
        el.appendChild(this.render());
    }
    /**
     * Renders this template into the first element matching the selector,
     * replacing its children; does nothing when none matches.
     * @param {string} selector
     * @throws {RenderError}
     */
    renderToSelector(selector) {
        const el = document.querySelector(selector);
        if (el) {
            this.renderTo(el);
        }
    }
    /**
     * Renders this template and appends the result to the first element
     * matching the selector; does nothing when none matches.
     * @param {string} selector
     * @throws {RenderError}
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
 * A render failure, one frame per nesting level, chained through `cause` from
 * the outermost frame down to the error that failed the expression. A frame's
 * message names what was being evaluated and the node's open tag, with the
 * attributes it still carries: the directive being evaluated is already off
 * the tag. The subtree is not in the message; `html` serializes it on demand.
 */
class RenderError extends Error {
    /** How many frames a chain keeps: a deeper nesting drops the outermost ones and marks the chain `truncated`. */
    static FRAMES = 3;
    #node;
    #depth;
    /** Whether the chain dropped outer frames to stay within FRAMES. */
    truncated = false;
    /**
     * Frames a failure, unless the chain already holds FRAMES frames: then the
     * cause is returned as it is, marked `truncated`.
     * @param {string} message
     * @param {Node} nodeOrFragment the node that failed
     * @param {any} cause
     * @returns {RenderError}
     */
    static wrap(message, nodeOrFragment, cause) {
        if (cause instanceof RenderError && cause.depth >= RenderError.FRAMES) {
            cause.truncated = true;
            return cause;
        }
        return new RenderError(message, nodeOrFragment, cause);
    }
    /**
     * @param {string} message
     * @param {Node} nodeOrFragment the node that failed
     * @param {any} cause
     */
    constructor(message, nodeOrFragment, cause) {
        super(`${message} in \`${RenderError.describe(nodeOrFragment)}\``, { cause });
        this.name = 'RenderError';
        this.#node = nodeOrFragment;
        this.#depth = (cause instanceof RenderError ? cause.depth : 0) + 1;
    }
    /**
     * How many frames this chain carries, this one included.
     * @returns {number}
     */
    get depth() {
        return this.#depth;
    }
    /**
     * The node the render failed on, live in the fragment being built.
     * @returns {Node}
     */
    get node() {
        return this.#node;
    }
    /**
     * The failed node's markup, whitespace trimmed, serialized on each read.
     * @returns {string}
     */
    get html() {
        return RenderError.stringify(this.#node);
    }
    /**
     * What identifies a node in a frame: an element by its open tag, a text node
     * by its source, a fragment by the open tags of the elements it holds, cut
     * at 120 characters.
     * @param {Node} nodeOrFragment
     * @returns {string}
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
    /**
     * A node's markup with its whitespace-only text dropped and the rest trimmed.
     * @param {Node} nodeOrFragment left untouched: a clone is serialized
     * @returns {string}
     */
    static stringify(nodeOrFragment) {
        return Fragments.toHtml(RenderError.#cleanup(nodeOrFragment.cloneNode(true)));
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
