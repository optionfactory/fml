class Fragments {
    /**
     * Creates a DocumentFragment from an string.
     * @param  {...string} html
     * @returns {DocumentFragment} the fragment
     */
    static fromHtml(...html) {
        const el = document.createElement('template');
        el.innerHTML = html.map((h) => h.trim()).join('');
        return document.adoptNode(el.content);
    }
    /**
     * Creates a string representation (HTML) of a DocumentFragment.
     * @param {DocumentFragment} fragment
     * @returns {string} the html
     */
    static toHtml(fragment) {
        var el = document.createElement('template');
        el.content.appendChild(fragment);
        return el.innerHTML;
    }
    /**
     * Checks if a fragment contains only blank text nodes
     * @param {DocumentFragment} fragment
     * @returns {boolean} true if the fragment is blank
     */
    static isBlank(fragment) {
        return fragment.childElementCount === 0 && fragment.textContent.trim() === '';
    }
    /**
     * Creates a DocumentFragment from nodes.
     * @param  {...Node} nodes
     * @returns {DocumentFragment} the fragment
     */
    static from(...nodes) {
        const fragment = new DocumentFragment();
        fragment.append(...nodes);
        return fragment;
    }
    /**
     * Creates a DocumentFragment from childNodes of an element.
     * @param {Node} el
     * @returns {DocumentFragment} the fragment
     */
    static fromChildNodes(el) {
        const fragment = new DocumentFragment();
        fragment.append(...el.childNodes);
        return fragment;
    }
}

class Attributes {
    static id = 0;
    /**
     * Creates a unique id with the given prefix.
     * @param {string} prefix
     * @returns
     */
    static uid(prefix) {
        return `${prefix}-${++Attributes.id}`;
    }
    /**
     * Sets an attribute if not present.
     * @param {Element} el
     * @param {string} k
     * @param {string} v
     * @returns
     */
    static defaultValue(el, k, v) {
        if (!el.hasAttribute(k)) {
            el.setAttribute(k, v);
        }
        return el.getAttribute(k);
    }
    /**
     * Forwards prefixed attributes from an element to another (removing the prefix).
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
                            .getAttribute(prefix + 'class')
                            ?.split(' ')
                            .filter((a) => a.length) ?? [];
                    to.classList.add(...classes);
                    return;
                }
                to.setAttribute(target, /** @type {string} */ (from.getAttribute(a)));
            });
    }
    /**
     * Changes the presence of an attribute.
     * @param {Element} el
     * @param {string} attr
     * @param {boolean} value
     */
    static toggle(el, attr, value) {
        if (value) {
            el.setAttribute(attr, '');
        } else {
            el.removeAttribute(attr);
        }
    }
    /**
     * Changes the presence of an attribute based on its current state.
     * @param {Element} el
     * @param {string} attr
     */
    static flip(el, attr) {
        if (el.hasAttribute(attr)) {
            el.removeAttribute(attr);
        } else {
            el.setAttribute(attr, '');
        }
    }
    /**
     * Sets the value of an attribute. nullish values remove the attribute.
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

class LightSlots {
    /**
     * Extracts light slots from an element. For non default slots in a template tag, the content is extracted.
     * @param {Element} el
     * @returns the slots
     */
    static from(el) {
        /** @type [string, Element|DocumentFragment][] */
        const namedSlots = Array.from(el.children)
            .filter((el) => el.matches('[slot]'))
            .map((el) => {
                el.remove();
                const slot = el.getAttribute('slot') || 'unnamed';
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
    static slotFromNode(el) {
        if (el instanceof HTMLTemplateElement) {
            return document.adoptNode(el.content);
        }
        if (el instanceof HTMLScriptElement && el.type !== '' && el.type !== 'text/javascript') {
            return Fragments.fromHtml(el.innerHTML);
        }
        return el;
    }
}

class Nodes {
    /**
     * Checks if an element is already parsed.
     * @param {Element} el
     * @returns
     */
    static isParsed(el) {
        //@ts-ignore
        for (let c = el; c; c = c.parentNode) {
            if (c.nextSibling) {
                return true;
            }
        }
        return false;
    }

    static waitParsed(el) {
        if (el.ownerDocument.readyState === 'complete' || Nodes.isParsed(el)) {
            return Promise.resolve(el);
        }
        return new Promise((resolve) => {
            const ac = new AbortController();
            const clearAndQueue = () => {
                ac.abort();
                observer.disconnect();
                resolve(el);
            };
            el.ownerDocument.addEventListener('DOMContentLoaded', clearAndQueue, { signal: ac.signal });
            const observer = new MutationObserver(() => {
                if (!Nodes.isParsed(el)) {
                    return;
                }
                clearAndQueue();
            });
            const parent = /** @type {Node} */ (el.parentNode);
            observer.observe(parent, { childList: true });
        });
    }

    /**
     * Returns the first child of the element element (if exists) matching the selector.
     * @param {Element} el
     * @param {string} selector
     * @returns
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
     * Returns all children of the element matching the selector.
     * @param {Element} el
     * @param {string} selector
     * @returns
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
