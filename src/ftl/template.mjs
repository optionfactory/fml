import { nodes } from './ast.mjs';
import { Attributes, Fragments } from './dom.mjs';
import { Expressions, ExpressionEvaluator } from './expressions.mjs';

class NodeOperations {
    #forRemoval;
    constructor() {
        this.#forRemoval = [];
    }
    removed(node) {
        return this.#forRemoval.includes(node);
    }
    remove(node) {
        node.replaceChildren?.();
        Object.keys(node.dataset || {})
            .filter((k) => k.startsWith('tpl'))
            .forEach((k) => delete node.dataset[k]);
        this.#forRemoval.push(node);
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
        while (this.#forRemoval.length) {
            this.#forRemoval.pop().remove();
        }
    }
}

class CommandsHandler {
    static ORDERED_COMMANDS = [
        'tplIf',
        'tplWith',
        'tplEach',
        'tplWhen',
        'tplClassAppend',
        'tplAttrAppend',
        'tplText',
        'tplHtml',
        'tplRemove',
        'tplVerbatim',
    ];
    static tplIf(node, expression, ops, modules, dataStack) {
        const accept = Expressions.interpret(modules, dataStack, expression);
        if (!accept) {
            ops.remove(node);
        }
    }
    static tplWith(node, expression, ops, modules, dataStack) {
        const evaluated = Expressions.interpret(modules, dataStack, expression);
        const varName = ops.popData(node, 'tplVar');
        const newNode = new Template(node, modules, dataStack)
            .withOverlay(varName ? { [varName]: evaluated } : evaluated)
            .render();
        ops.replace(node, newNode);
    }
    static tplEach(node, expression, ops, modules, dataStack) {
        const varName = ops.popData(node, 'tplVar');
        const template = new Template(node, modules, dataStack);
        const evaluated = Expressions.interpret(modules, dataStack, expression);
        if (!evaluated?.[Symbol.iterator]) {
            throw new Error(`Expected an iterable got '${evaluated}'`);
        }
        for (const v of evaluated) {
            ops.prepend(node, template.withOverlay(varName ? { [varName]: v } : v).render());
        }
        ops.remove(node);
    }
    static tplWhen(node, expression, ops, modules, dataStack) {
        const accept = Expressions.interpret(modules, dataStack, expression);
        if (!accept) {
            ops.remove(node);
        }
    }
    static tplVerbatim(node, expression, ops, modules, dataStack) {
        const newNode = node.cloneNode(true);
        ops.replace(node, newNode);
    }
    static tplRemove(node, value, ops, modules, dataStack) {
        switch (value.toLowerCase()) {
            case 'tag':
                const fragment = new DocumentFragment();
                fragment.append(...node.childNodes);
                if ('tplVerbatim' in node.dataset) {
                    //we are removing the parent element so we have to handle the lower priority commands
                    ops.popData(node, 'tplVerbatim');
                    ops.replace(node, fragment);
                } else {
                    ops.append(node, fragment);
                    ops.remove(node);
                }
                break;
            case 'body':
                node.replaceChildren();
                break;
            case 'all':
                ops.remove(node);
                break;
        }
    }
    static tplText(node, expression, ops, modules, dataStack) {
        const text = Expressions.interpret(modules, dataStack, expression);
        const newNode = node.cloneNode();
        newNode.replaceChildren(text == null ? '' : text);
        ops.replace(node, newNode);
    }
    static tplHtml(node, expression, ops, modules, dataStack) {
        const html = Expressions.interpret(modules, dataStack, expression);
        const newNode = node.cloneNode();
        newNode.innerHTML = html == null ? '' : html;
        ops.replace(node, newNode);
    }
    static tplClassAppend(node, expression, ops, modules, dataStack) {
        const classes = Expressions.interpret(modules, dataStack, expression);
        if (!classes) {
            return;
        }
        const classesAsArray = Array.isArray(classes) ? classes : [classes];
        const cleanClasses = classesAsArray
            .flatMap(c => typeof c === 'string' ? c.split(' ') : c)
            .filter(Boolean);
        if (cleanClasses.length === 0) {
            return;
        }
        node.classList.add(...cleanClasses);
    }
    static tplAttrAppend(node, expression, ops, modules, dataStack) {
        const attributesAndValues = Expressions.interpret(modules, dataStack, expression);
        if (!attributesAndValues || attributesAndValues.length === 0) {
            return;
        }
        const tuples = Array.isArray(attributesAndValues[0]) ? attributesAndValues : [attributesAndValues];
        tuples.forEach(([k, v]) => {
            node.setAttribute(k, v);
        });
    }
    static textNode(node, expression, ops, modules, dataStack) {
        for (const v of Expressions.interpret(modules, dataStack, expression, Expressions.MODE_TEMPLATED)) {
            if (v.value == null) {
                continue;
            }
            switch (v.type) {
                case nodes.dom.t:
                    ops.prepend(node, document.createTextNode(v.value));
                    break;
                case nodes.dom.h:
                    ops.prepend(node, Fragments.fromHtml(v.value));
                    break;
                case nodes.dom.n:
                    ops.prepend(node, v.value);
                    break;
            }
        }
        ops.remove(node);
    }
}

// Module-isolated string cache for dataset-to-attribute conversions
const attributeCache = new Map();

/**
 * Converts a tpl camelCase dataset key into a kebab-case attribute name.
 * Uses a cache lookup to avoid repetitive regex/string splitting.
 * @param {string} dataSetKey
 * @returns {string}
 */
function toAttr(dataSetKey) {
    let cached = attributeCache.get(dataSetKey);
    if (!cached) {
        cached = dataSetKey
            .substring(3)
            .split(/(?=[A-Z])/)
            .join('-')
            .toLowerCase();
        attributeCache.set(dataSetKey, cached);
    }
    return cached;
}

class Template {
    /**
     * Creates a template from a string.
     * @param {string} html
     * @param {{ [k: string] : any }?} [modules]
     * @param {...*} data
     * @returns the template
     */
    static fromHtml(html, modules, ...data) {
        return new Template(Fragments.fromHtml(html), modules, data);
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
        return new Template(fragment, modules, data);
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
        return new Template(fragment, modules, data);
    }

    /**
     * Creates a template from a DocumentFragment.
     * @param {DocumentFragment} fragment
     * @param { { [k: string] : any }? } [modules]
     * @param {...*} data
     * @returns the template
     */
    static fromFragment(fragment, modules, ...data) {
        return new Template(fragment, modules, data);
    }
    #fragment;
    #modules;
    #dataStack;
    /**
     * Creates a template.
     * @param {DocumentFragment} fragment
     * @param {{ [x: string]: any; } | null | undefined} modules
     * @param {any[]} dataStack
     */
    constructor(fragment, modules, dataStack) {
        this.#fragment = fragment;
        this.#modules = modules;
        this.#dataStack = dataStack;
    }
    /**
     * Creates a new Template replacing the modules and dataStack from a context.
     * @param {{modules: { [x: string]: any; } | null | undefined, data: any[]}} context
     */
    withContext({ modules, data }) {
        return new Template(this.#fragment, modules, data);
    }
    /**
     * Creates a new Template replacing the modules and dataStack from a registry.
     * @param any registry
     */
    withContextFrom(registry) {
        return this.withContext(registry.context());
    }
    /**
     * Creates a new Template replacing the fragment.
     * @param {DocumentFragment} fragment
     */
    withFragment(fragment) {
        return new Template(fragment, this.#modules, this.#dataStack);
    }
    /**
     * Creates a new Template with a new module added.
     * @param {string?} name
     * @param {{[k: string]: any}} value
     */
    withModule(name, value) {
        const module = name ? { [name]: value } : value;
        return new Template(this.#fragment, { ...this.#modules, ...module }, this.#dataStack);
    }
    /**
     * Creates a new Template replacing the modules.
     * @param {{ [x: string]: any; }?} modules
     */
    withModules(modules) {
        return new Template(this.#fragment, modules, this.#dataStack);
    }
    /**
     * Creates a new Template replacing the data stack.
     * @param {any[]} dataStack the dataStack
     */
    withData(dataStack) {
        return new Template(this.#fragment, this.#modules, dataStack);
    }
    /**
     * Creates a new Template with new a data overlay added to the stack.
     * @param {...*} data
     */
    withOverlay(...data) {
        return new Template(
            this.#fragment,
            this.#modules,
            data.length === 0 ? this.#dataStack : [...this.#dataStack, ...data],
        );
    }
    /**
     * Evaluates an expression using the configured modules and data.
     * @param {string} expression
     * @param {(typeof Expressions.MODE_EXPRESSION | typeof Expressions.MODE_TEMPLATED)?} [mode]
     * @param {...*} data
     */
    evaluate(expression, mode, ...data) {
        new ExpressionEvaluator(this.#modules, this.#dataStack).withOverlay(...data).evaluate(expression, mode);
    }
    /**
     * Returns an expression evaluator with bound modules and dataStack.
     */
    evaluator() {
        return new ExpressionEvaluator(this.#modules, this.#dataStack);
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
                        CommandsHandler.textNode(node, node.nodeValue, ops, this.#modules, this.#dataStack);
                    } catch (ex) {
                        throw new RenderError('Error evaluating text node', node, ex);
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
                        CommandsHandler[command](el, value, ops, this.#modules, this.#dataStack);
                    } catch (ex) {
                        throw new RenderError(`Error evaluating command ${command}`, el, ex);
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
                    try {
                        const expression = ops.popData(el, dataSetKey);
                        const evaluated = Expressions.interpret(this.#modules, this.#dataStack, expression);
                        if (typeof evaluated === 'boolean') {
                            Attributes.toggle(el, attributeName, evaluated);
                            continue;
                        }
                        if (evaluated !== null && evaluated !== undefined) {
                            el.setAttribute(attributeName, evaluated);
                        }
                    } catch (ex) {
                        throw new RenderError(`Error evaluating command ${dataSetKey}`, el, ex);
                    }
                }
            }
            ops.cleanup();
            return fragment;
        } catch (ex) {
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
     * Renders this template appending the resulting fragment to the first Element maching the selector, if exists.
     * @param {string} selector
     */
    renderToSelector(selector) {
        const el = document.querySelector(selector);
        if (el) {
            this.renderTo(el);
        }
    }
    /**
     * Renders this template appending the resulting fragment to the Element maching the selector, if exists.
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

class RenderError extends Error {
    constructor(message, nodeOrFragment, cause) {
        super(`${message} in \`${RenderError.stringify(nodeOrFragment)}\``, { cause });
        this.name = 'RenderError';
        this.node = nodeOrFragment.cloneNode(true);
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
        for (var n = 0; n < node.childNodes.length; n++) {
            var child = node.childNodes[n];
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
