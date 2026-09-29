import { Attributes, LightSlots } from './dom.mjs';
import { registry } from './registry.mjs';
import { Template } from './template.mjs';

/**
 * An attribute Mapper.
 *
 * @typedef {object} Mapper
 * @property {(val: string|null|undefined, name: string, el: Element) => any} unmarshal
 * @property {(val: any, name: string, el: Element) => string|null} marshal
 */

/**
 * The base of every fml element. A subclass declares its attributes, slots and
 * templates in statics and builds its dom in `render`; the base reads the light
 * slots, reads the declared attributes through their mappers, renders once, and
 * then forwards observed attribute writes to the matching properties. An element
 * resolves templates and components through the registry that defined it.
 */
class ParsedElement extends HTMLElement {
    static BITS = {
        registry,
        enqueue: (el) => {},
        SLOTS: false,
        /** @type {object|undefined} */
        CONFIG: undefined,
        /** @type {string[]} */
        OBSERVED: [],
        /** @type {string[]} */
        DECLARED: [],
        /** @type {Record<string, Mapper>} */
        ATTR_TO_MAPPER: {},
        /** @type {Record<string, string>} */
        ATTR_TO_PROPERTY: {},
        TEMPLATES: {},
    };
    static get observedAttributes() {
        return this.BITS.OBSERVED;
    }
    constructor() {
        super();
        this.internals = this.attachInternals();
    }
    /**
     * The element's ElementInternals, attached by the base for every element: a
     * subclass never calls attachInternals itself, since a second call throws.
     * A subclass declaring `static formAssociated` gets the form apis here.
     * A subclass must not redeclare the field: a class field without an
     * initializer assigns undefined after super() returns, wiping it.
     * @type {ElementInternals}
     */
    internals;
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
    #mapper(attr) {
        const mapper = this.#bits().ATTR_TO_MAPPER[attr];
        if (!mapper) {
            throw new Error(
                `${this.constructor.name} declares no attribute '${attr}': declare it in static observed or static attributes, or read it with getAttribute`,
            );
        }
        return mapper;
    }
    /**
     * Reads an attribute value through the mapper it was declared with.
     * @param {string} attr
     * @param {string|null} str
     * @returns {any}
     * @throws when the class declares no such attribute; read undeclared ones with getAttribute
     */
    unmarshal(attr, str) {
        return this.#mapper(attr).unmarshal(str, attr, this);
    }
    /**
     * Writes a value as the attribute string its declared mapper produces.
     * @param {string} attr
     * @param {any} value
     * @returns {string|null} null for a value that removes the attribute
     * @throws when the class declares no such attribute
     */
    marshal(attr, value) {
        return this.#mapper(attr).marshal(value, attr, this);
    }
    /**
     * The registry that defined this element, the page's own for an undefined one.
     * @returns {typeof registry}
     */
    get _registry() {
        return this.#bits().registry;
    }
    /**
     * The component registered under the name on this element's registry, the
     * one every ful loader and mapper resolves through.
     * @param {string} name
     * @returns {any} undefined when none is registered
     */
    component(name) {
        return this.#bits().registry.component(name);
    }
    /**
     * One of the class's templates, bound to its registry's scope with the
     * class's `static config` overlaid as `config`.
     * @param {string} [name] 'default', the `static template`, when omitted
     * @returns {Template}
     * @throws when the class declares no template of that name
     */
    template(name) {
        const target = this.#bits().TEMPLATES[name ?? 'default'];
        if (!target) {
            throw new Error(`no template named '${name ?? 'default'}' on ${this.constructor.name}`);
        }
        const t = target.withEvaluator(this.#bits().registry.evaluator());
        const config = this.#bits().CONFIG;
        return config ? t.withOverlay({ config }) : t;
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
        if (this.#reflecting.has(attr)) {
            return;
        }
        if (!this.#parsed) {
            if (this.#pending !== null && attr in this.#pending) {
                this.#pending[attr] = this.unmarshal(attr, newValue);
            }
            return;
        }
        this[this.#bits().ATTR_TO_PROPERTY[attr]] = this.unmarshal(attr, newValue);
    }
    /**
     * Upgrades once, however often the element is connected: reads the declared
     * attributes, keeps the observed ones open to writes made while the render is
     * pending, renders, then applies the observed values to their properties in
     * the order the registry composed them, a base class's before a subclass's.
     * Only then do attribute writes forward to properties, and the element gains
     * the `rendered` custom state. A render that throws leaves the forwarding
     * shut and the state unset.
     *
     * An observed attribute drives the property the registry's `propertyOf`
     * names, so a hyphenated attribute is authored with its dashes and read as
     * a camelCase property.
     * @returns {Promise<void>} rejecting with what the render threw
     */
    async upgrade() {
        if (this.#started) {
            return;
        }
        this.#started = true;
        const slots = this.#bits().SLOTS ? LightSlots.from(this) : undefined;
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
            const properties = this.#bits().ATTR_TO_PROPERTY;
            for (const name of this.#bits().OBSERVED) {
                this[properties[name]] = declared[name];
            }
            this.#parsed = true;
            this.internals.states.add('rendered');
        } finally {
            this.#pending = null;
        }
    }
    /**
     * Renders the element from its slots alone: it builds the dom its setters
     * drive, and the base applies the declared state onto the properties as
     * soon as it returns. A render needing a declared value while it builds
     * reads it through `declared(name)`. The slots are undefined for an element
     * declaring no slots. It may be async; the upgrade awaits it.
     * @param {{ slots: Record<string, DocumentFragment> | undefined }} c
     * @returns {void | Promise<void>}
     */
    render(c) {}
    /**
     * The declared value of an attribute, unmarshalled through its mapper.
     *
     * A `static attributes` name is the configuration tier: read once when the
     * upgrade starts and answered unchanged for the element's life, so a later
     * attribute write does not quietly change how the element behaves. An
     * observed name answers the snapshot while the render is pending, kept
     * open to attribute writes landing in that window, and the live attribute
     * afterwards, the property being live by then.
     * @param {string} name
     * @returns {any}
     * @throws when the class declares no such attribute
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
    /**
     * Whether the element's render completed: the moment its properties went
     * live, which css reads as `:state(rendered)`. Unlike `:defined`, which holds
     * from the constructor, it is false until the dom exists.
     * @returns {boolean}
     */
    get rendered() {
        return this.#parsed;
    }
    /**
     * Projects a property back onto its observed attribute, marshalled through
     * the mapper the attribute was declared with.
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
