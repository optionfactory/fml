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
    #reflecting = 0;
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
    template(name) {
        const { modules, data } = registry.context();
        let t = this.#bits().TEMPLATES[name ?? 'default'].withData(data).withModules(modules);
        for (const k of ['l10n', 'config']) {
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
    /**
     * The disabled protocol follows the semantics of a native form control:
     *
     * - the `disabled` attribute on the host is the field's own claim, and nothing
     *   but its author ever writes or removes it, in markup or through the property.
     *   The framework never claims on the form's behalf, so there is nothing to
     *   unclaim and nothing to lose: a field declared disabled inside a disabled
     *   `<fieldset>` stays disabled when the fieldset comes back, exactly like a
     *   native input keeps its attribute.
     * - the effective state is the claim OR a disabled fieldset ancestry, which the
     *   platform maintains on its own: `:disabled` matches both, a disabled field is
     *   left out of the submitted values, and the inner native controls are reached
     *   by the ancestry as descendants of the fieldset.
     * - the `disabled` property reflects the claim only, like a native input's: a
     *   field disabled by its ancestry reads `false` while `matches(':disabled')`
     *   tells the effective state. Un-claiming inside a disabled fieldset cannot
     *   enable the field.
     * - the inner controls mirror the claim and nothing else: the ancestry state is
     *   never written anywhere, so it can never go stale, and the browser composes
     *   the two on its own when it disables and re-enables a fieldset's descendants.
     *
     * Because of this, formDisabledCallback carries nothing the framework needs to
     * apply, and the protocol does not define it.
     */
    async upgrade() {
        if (this.#parsed) {
            return;
        }
        this.#parsed = true;
        const slots = this.#bits().SLOTS ? LightSlots.from(this) : undefined;
        const observed = Object.fromEntries(
            this.#bits().OBSERVED.map((attribute) => [
                attribute,
                this.unmarshal(attribute, this.getAttribute(attribute)),
            ]),
        );
        //the declared claim is what render receives: the ancestry state is not
        //passed around, it is already where it needs to be
        await this.render({ slots, observed, disabled: this.hasAttribute('disabled') });
    }
    render(c) {}
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
