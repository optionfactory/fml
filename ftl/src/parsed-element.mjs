import { Attributes, LightSlots } from "./dom.mjs";
import { registry } from "./registry.mjs";





class ParsedElement extends HTMLElement {
    static BITS = {
        enqueue: (el) => { },
        SLOTS: false,
        OBSERVED: [],
        /** @type {Record<string, import("./registry.mjs").Mapper>} */
        ATTR_TO_MAPPER: {},
        TEMPLATES: {}
    }
    static get observedAttributes() {
        return this.BITS.OBSERVED;
    }
    #parsed = false;
    #reflecting = 0;
    #bits() {
        return /** @type {typeof ParsedElement} */(this.constructor).BITS;
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
    template(name) {
        const { modules, data } = registry.context();
        let t = this.#bits().TEMPLATES[name ?? 'default'].withData(data).withModules(modules);
        for (let k of ['l10n', 'config']) {
            const v = this.constructor[k];
            if (v) {
                t = t.withOverlay({ [k]: v });
            }
        }
        return t;
    }
    connectedCallback() {
        if (this.#parsed) {
            return;
        }
        this.#bits().enqueue(this);
    }
    attributeChangedCallback(attr, oldValue, newValue) {
        if (!this.#parsed || oldValue === newValue) {
            return;
        }
        if (this.#reflecting > 0) {
            return;
        }
        this[attr] = this.unmarshal(attr, newValue);
    }
    #disabledBeforeParsed = null;
    formDisabledCallback(disabled) {
        if (!this.#parsed) {
            this.#disabledBeforeParsed = disabled;
            return;
        }
        Reflect.set(this, 'disabled', disabled);
    }
    async upgrade() {
        if (this.#parsed) {
            return;
        }
        this.#parsed = true;
        const slots = this.#bits().SLOTS ? LightSlots.from(this) : undefined;
        const observed = Object.fromEntries(this.#bits().OBSERVED.map(attribute => [attribute, this.unmarshal(attribute, this.getAttribute(attribute))]));
        const disabled = this.#disabledBeforeParsed ?? false
        await this.render({ slots, observed, disabled });
    }
    render(c) {
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
