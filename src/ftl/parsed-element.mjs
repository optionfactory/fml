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
        /** @type {string[]} */
        OBSERVED: [],
        /** @type {string[]} */
        DECLARED: [],
        /** @type {Record<string, Mapper>} */
        ATTR_TO_MAPPER: {},
        TEMPLATES: {},
    };
    static get observedAttributes() {
        return this.BITS.OBSERVED;
    }
    #parsed = false;
    #started = false;
    /** the attributes whose own reflection is in flight */
    #reflecting = new Set();
    /** the observed snapshot between the upgrade's start and its render's end */
    #pending = /** @type {{ [k: string]: any } | null} */ (null);
    /** the configuration tier, read once at the upgrade and kept for the element's life */
    #frozen = /** @type {{ [k: string]: any }} */ ({});
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
        const target = this.#bits().TEMPLATES[name ?? 'default'];
        if (!target) {
            throw new Error(`no template named '${name ?? 'default'}' on ${this.constructor.name}`);
        }
        let t = target.withEvaluator(this.#bits().registry.evaluator());
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
        //the mute is the attribute being reflected, not the element: a component
        //that legitimately changes another observed attribute while one reflects
        //is a change like any other, and used to be swallowed
        if (this.#reflecting.has(attr)) {
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
        //both tiers are read here: the observed ones forward to a property once
        //the render is done, the rest are the element's configuration, read the
        //one time and never again
        const declared = Object.fromEntries(
            this.#bits().DECLARED.map((attribute) => [
                attribute,
                this.unmarshal(attribute, this.getAttribute(attribute)),
            ]),
        );
        const observedNames = new Set(this.#bits().OBSERVED);
        this.#frozen = Object.fromEntries(Object.entries(declared).filter(([name]) => !observedNames.has(name)));
        this.#pending = declared;
        try {
            await this.render({ slots });
            //the declared state reaches the properties once the dom the setters
            //drive exists, in the order the registry composed the declarations:
            //a base class's attributes before the subclass's own
            for (const name of this.#bits().OBSERVED) {
                this[name] = declared[name];
            }
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
     * Renders the element from its slots alone: it builds the dom its setters
     * drive, and the base applies the declared state onto the properties as
     * soon as it returns. A render needing a declared value while it builds
     * reads it through `declared(name)`. The slots are undefined for an element
     * declaring no slots.
     * @param {{ slots: any }} c
     */
    render(c) {}
    /**
     * The declared value of an attribute, unmarshalled through its mapper.
     *
     * A `static attributes` name is the configuration tier: read once when the
     * upgrade starts and answered unchanged for the element's life, so a later
     * attribute write does not quietly change how the element behaves. An
     * observed name answers the snapshot while the render is pending — kept
     * open to attribute writes landing in that window — and the live attribute
     * afterwards, the property being the live door by then.
     *
     * The snapshot exists rather than a read of the dom because an element may
     * write its own observed attributes while it renders — a reflection, or a
     * value the platform normalizes on the way in — and what the author
     * declared is what the base applies, not what the render left behind.
     * @param {string} name
     */
    declared(name) {
        if (name in this.#frozen) {
            return this.#frozen[name];
        }
        if (this.#pending !== null && name in this.#pending) {
            return this.#pending[name];
        }
        return this.unmarshal(name, this.getAttribute(name));
    }
    /** Whether the element's render completed: the moment its properties became the live door. */
    get rendered() {
        return this.#parsed;
    }
    /**
     * Projects a property back onto its observed attribute, marshalled through
     * the mapper the attribute was declared with: the one door back to the dom,
     * so a setter never has to know how its own type serializes.
     *
     * A value the attribute already carries is not written at all, so reflecting
     * what an attribute write just delivered ends there rather than looping, and
     * only the attribute being written is muted while it happens.
     * @param {string} attr
     * @param {any} value
     */
    reflectTo(attr, value) {
        const marshalled = this.marshal(attr, value);
        if (marshalled === this.getAttribute(attr)) {
            return;
        }
        this.#reflecting.add(attr);
        try {
            Attributes.set(this, attr, marshalled);
        } finally {
            this.#reflecting.delete(attr);
        }
    }
}

export { ParsedElement };
