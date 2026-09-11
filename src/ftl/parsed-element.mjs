import { Attributes, LightSlots } from './dom.mjs';
import { registry } from './registry.mjs';

/**
 * An attribute Mapper.
 *
 * @typedef {object} Mapper
 * @property {(val: string|null|undefined, name: string, el: Element) => any} unmarshal
 * @property {(val: any, name: string, el: Element) => string|null} marshal
 */

class ParsedElement extends HTMLElement {
    static BITS = {
        //an element the registry never defined still answers the page's own
        registry,
        enqueue: (el) => {},
        SLOTS: false,
        OBSERVED: [],
        /** @type {Record<string, Mapper>} */
        ATTR_TO_MAPPER: {},
        TEMPLATES: {},
    };
    static get observedAttributes() {
        return this.BITS.OBSERVED;
    }
    #parsed = false;
    #started = false;
    #reflecting = 0;
    /** the observed snapshot between the upgrade's start and its render's end */
    #pending = /** @type {{ [k: string]: any } | null} */ (null);
    #bits() {
        return /** @type {typeof ParsedElement} */ (this.constructor).BITS;
    }
    unmarshal(attr, str) {
        return this.#bits().ATTR_TO_MAPPER[attr].unmarshal(str, attr, this);
    }
    marshal(attr, value) {
        return this.#bits().ATTR_TO_MAPPER[attr].marshal(value, attr, this);
    }
    /**
     * @param {string} [name] - The name of the template target, defaults to 'default'
     */
    /** The registry that defined this element, the page's own for an undefined one. */
    get _registry() {
        return this.#bits().registry;
    }
    /**
     * The component registered under the name on this element's registry, the
     * door every ful loader and mapper resolves through.
     * @param {string} name
     */
    component(name) {
        return this.#bits().registry.component(name);
    }
    template(name) {
        const { modules, data } = this.#bits().registry.context();
        const target = this.#bits().TEMPLATES[name ?? 'default'];
        if (!target) {
            throw new Error(`no template named '${name ?? 'default'}' on ${this.constructor.name}`);
        }
        let t = target.withData(data).withModules(modules);
        for (const k of ['config']) {
            const v = this.constructor[k];
            if (v) {
                t = t.withOverlay({ [k]: v });
            }
        }
        return t;
    }
    connectedCallback() {
        if (this.#started) {
            return;
        }
        this.#bits().enqueue(this);
    }
    attributeChangedCallback(attr, oldValue, newValue) {
        if (oldValue === newValue) {
            return;
        }
        if (this.#reflecting > 0) {
            return;
        }
        //the properties are the post-render live door alone: before the render,
        //an attribute write lands in the observed snapshot and the render applies
        //it with the rest of the declared state
        if (!this.#parsed) {
            if (this.#pending !== null && attr in this.#pending) {
                this.#pending[attr] = this.unmarshal(attr, newValue);
            }
            return;
        }
        this[attr] = this.unmarshal(attr, newValue);
    }
    /**
     * Upgrades once: captures the observed snapshot, opens it to attribute
     * writes made while the render is pending, and opens the property forward
     * only when the render is done.
     */
    async upgrade() {
        if (this.#started) {
            return;
        }
        this.#started = true;
        const slots = this.#bits().SLOTS ? LightSlots.from(this) : undefined;
        const observed = Object.fromEntries(
            this.#bits().OBSERVED.map((attribute) => [
                attribute,
                this.unmarshal(attribute, this.getAttribute(attribute)),
            ]),
        );
        this.#pending = observed;
        try {
            await this.render({ slots, observed });
            //the live door opens once the render is done: from here on, an
            //attribute write forwards to the property. A render that threw
            //leaves it shut, so a later attribute write cannot reach setters
            //that assume pieces the failed render never adopted
            this.#parsed = true;
        } finally {
            this.#pending = null;
        }
    }
    /**
     * Renders the element from its declared state. The upgrade hands over the
     * slots and the observed snapshot, the pre-render door for every declared
     * attribute: a write made while the render was pending is already in it, so
     * the render is the one place the declared state is applied. The properties
     * are the post-render live door: an attribute write after the render
     * forwards to the property, a property write before the render is not
     * supported. The slots are undefined for an element declaring no slots.
     * @param {{ slots: any, observed: { [k: string]: any } }} c
     */
    render(c) {}
    /** Whether the element's render completed: the moment its properties became the live door. */
    get rendered() {
        return this.#parsed;
    }
    reflect(fn) {
        ++this.#reflecting;
        try {
            fn();
        } finally {
            --this.#reflecting;
        }
    }
    reflectTo(attr, value) {
        ++this.#reflecting;
        try {
            Attributes.set(this, attr, this.marshal(attr, value));
        } finally {
            --this.#reflecting;
        }
    }
}

export { ParsedElement };
