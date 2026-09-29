/** Creates, serializes and inspects DocumentFragments. */
class Fragments {
    /**
     * Parses html into a DocumentFragment adopted by the document, each piece
     * trimmed and the pieces joined.
     * @param {...string} html
     * @returns {DocumentFragment}
     */
    static fromHtml(...html) {
        const el = document.createElement('template');
        el.innerHTML = html.map((h) => h.trim()).join('');
        return document.adoptNode(el.content);
    }
    /**
     * Serializes a fragment, or a single node, to html, consuming it: the nodes
     * are moved out, not copied, and a fragment is left empty. Pass
     * `fragment.cloneNode(true)` to keep the original usable.
     * @param {DocumentFragment|Node} fragment
     * @returns {string}
     */
    static toHtml(fragment) {
        var el = document.createElement('template');
        el.content.appendChild(fragment);
        return el.innerHTML;
    }
    /**
     * Whether a fragment holds no element and no text but whitespace.
     * @param {DocumentFragment} fragment
     * @returns {boolean}
     */
    static isBlank(fragment) {
        return fragment.childElementCount === 0 && fragment.textContent.trim() === '';
    }
    /**
     * Moves the nodes, in order, into a new DocumentFragment.
     * @param {...Node} nodes
     * @returns {DocumentFragment}
     */
    static from(...nodes) {
        const fragment = new DocumentFragment();
        for (const node of nodes) {
            fragment.appendChild(node);
        }
        return fragment;
    }
    /**
     * Moves the children of a node into a new DocumentFragment, leaving the
     * node empty.
     * @param {Node} el
     * @returns {DocumentFragment}
     */
    static fromChildNodes(el) {
        const fragment = new DocumentFragment();
        while (el.firstChild) {
            fragment.appendChild(el.firstChild);
        }
        return fragment;
    }
}

/** Attribute helpers: unique ids, defaults, prefixed forwarding, and writes where a nullish value removes the attribute. */
class Attributes {
    static id = 0;
    /**
     * A page-unique id under the prefix, as `prefix-n`.
     * @param {string} prefix
     * @returns {string}
     */
    static uid(prefix) {
        return `${prefix}-${++Attributes.id}`;
    }
    /**
     * Sets an attribute when the element does not carry it.
     * @param {Element} el
     * @param {string} k
     * @param {string} v
     * @returns {string|null} the attribute's value afterwards
     */
    static defaultValue(el, k, v) {
        if (!el.hasAttribute(k)) {
            el.setAttribute(k, v);
        }
        return el.getAttribute(k);
    }
    /**
     * Copies every attribute whose name starts with the prefix onto another
     * element, under the name without the prefix. `<prefix>class` adds its
     * classes to the target's instead of replacing them.
     * @param {string} prefix
     * @param {Element} from
     * @param {Element} to
     */
    static forward(prefix, from, to) {
        from.getAttributeNames()
            .filter((a) => a.startsWith(prefix))
            .forEach((a) => {
                const target = a.substring(prefix.length);
                if (target === 'class') {
                    const classes =
                        from
                            .getAttribute(`${prefix}class`)
                            ?.split(/\s+/)
                            .filter((a) => a.length) ?? [];
                    to.classList.add(...classes);
                    return;
                }
                to.setAttribute(target, /** @type {string} */ (from.getAttribute(a)));
            });
    }
    /**
     * Sets an attribute, or removes it when the value is nullish.
     * @param {Element} el
     * @param {string} attr
     * @param {string | null | undefined} value
     */
    static set(el, attr, value) {
        if (value == null) {
            el.removeAttribute(attr);
        } else {
            el.setAttribute(attr, value);
        }
    }
}

/**
 * Reads an element's light-dom slots: the named `<template slot=…>` and
 * `[slot=…]` children are removed and collected by name, and the remaining
 * children become the default slot. fml renders into the light dom, so this
 * replaces the slotting a shadow root would do.
 */
class LightSlots {
    /**
     * Takes an element's children apart into slots, leaving the element empty.
     * A named child is removed and contributes what `slotFromNode` answers;
     * children sharing a name are gathered in order. A child with an empty
     * `slot` belongs to the default slot, in document order among the rest.
     * @param {Element} el
     * @returns {Record<string, DocumentFragment>} the slots by name, `default` always present
     */
    static from(el) {
        for (const child of el.children) {
            if (child.matches('[slot=""]')) {
                child.removeAttribute('slot');
            }
        }
        /** @type [string, Element|DocumentFragment][] */
        const namedSlots = Array.from(el.children)
            .filter((el) => el.matches('[slot]'))
            .map((el) => {
                el.remove();
                const slot = /** @type {string} */ (el.getAttribute('slot'));
                el.removeAttribute('slot');
                return [slot, LightSlots.slotFromNode(el)];
            });
        const slots = {};
        slots.default = new DocumentFragment();
        slots.default.append(...el.childNodes);
        for (const [name, el] of namedSlots) {
            if (!(name in slots)) {
                slots[name] = new DocumentFragment();
            }
            slots[name].append(el);
        }
        return slots;
    }
    /**
     * What a slotted node contributes: a template's content, the parsed markup
     * of a `<script type="text/html">`, or the node itself.
     * @param {Element} el
     * @returns {Element|DocumentFragment}
     */
    static slotFromNode(el) {
        if (el instanceof HTMLTemplateElement) {
            return document.adoptNode(el.content);
        }
        if (el instanceof HTMLScriptElement && el.type === 'text/html') {
            return Fragments.fromHtml(el.innerHTML);
        }
        return el;
    }
}

/** Waits on the parser and the document, and queries an element's own children. */
class Nodes {
    /**
     * Whether the parser has moved past the element: the element, or one of
     * its ancestors, has a next sibling.
     * @param {Element} el
     * @returns {boolean}
     */
    static isParsed(el) {
        for (let c = /** @type {Node | null} */ (el); c; c = c.parentNode) {
            if (c.nextSibling) {
                return true;
            }
        }
        return false;
    }

    /**
     * Waits for the document's DOMContentLoaded. Resolves at once when that
     * moment already passed, and for a document with no view, which receives
     * no events. Never resolves early for a document still running its
     * deferred scripts.
     * @param {Document} doc
     * @returns {Promise<void>}
     */
    static waitDomContentLoaded(doc) {
        if (doc.readyState === 'loading') {
            return new Promise((resolve) => {
                doc.addEventListener('DOMContentLoaded', () => resolve(undefined), { once: true });
            });
        }
        if (doc.readyState === 'complete') {
            return Promise.resolve();
        }
        const win = doc.defaultView;
        if (win === null) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            const done = () => {
                win.removeEventListener('DOMContentLoaded', done);
                win.removeEventListener('load', done);
                resolve(undefined);
            };
            win.addEventListener('DOMContentLoaded', done);
            win.addEventListener('load', done);
        });
    }

    /**
     * Waits for the element's closing tag to be parsed: one MutationObserver
     * resolves once the element, or any of its ancestors, gains a next sibling,
     * which is the parser having moved past this subtree. The document's
     * DOMContentLoaded is the deadline. Resolves immediately for an element
     * that is already parsed.
     * @param {Element} el
     * @returns {Promise<Element>} the element
     */
    static waitParsed(el) {
        if (Nodes.isParsed(el)) {
            return Promise.resolve(el);
        }
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                if (!Nodes.isParsed(el)) {
                    return;
                }
                observer.disconnect();
                resolve(el);
            });
            for (let c = el.parentNode; c; c = c.parentNode) {
                observer.observe(c, { childList: true });
            }
            Nodes.waitDomContentLoaded(el.ownerDocument).then(() => {
                observer.disconnect();
                resolve(el);
            });
        });
    }

    /**
     * The first child element matching the selector, descendants excluded.
     * @param {Element|DocumentFragment} el
     * @param {string} selector
     * @returns {Element|null}
     */
    static queryChildren(el, selector) {
        for (const c of el.children) {
            if (c.matches(selector)) {
                return c;
            }
        }
        return null;
    }
    /**
     * Every child element matching the selector, descendants excluded.
     * @param {Element|DocumentFragment} el
     * @param {string} selector
     * @returns {Element[]}
     */
    static queryChildrenAll(el, selector) {
        const r = [];
        for (const c of el.children) {
            if (c.matches(selector)) {
                r.push(c);
            }
        }
        return r;
    }
}

export { Fragments, Attributes, LightSlots, Nodes };
