import { Attributes } from '../../ftl/index.mjs';
import { Field } from './field.mjs';

/**
 * A checkbox, or a switch with the `switch` role under `type="switch"`. The
 * label is the default slot, pointed at the input with `for` and `id`, so a
 * click on it toggles the value. Every `input-*` attribute is forwarded onto
 * the input. The input's native `change` is stopped and republished as the
 * field's own. Readonly freezes the whole choice, label included: no click
 * inside it toggles the value while the claim holds.
 */
class Checkbox extends Field {
    /** @type {string[]} */
    static attributes = ['type'];
    /** @type {string[]} */
    static observed = ['value:bool'];
    static slots = true;
    static template = `
        <ful-choice data-tpl-switch="isSwitch">
            <input type="checkbox" data-tpl-role="isSwitch ? 'switch' : false" form="">
            <label>{{{{ slots.default }}}}</label>
            {{{{ slots.info }}}}
        </ful-choice>
        <ful-field-error></ful-field-error>
    `;
    #container;
    #input;
    /**
     * @param {{ slots: Record<string, DocumentFragment> | undefined }} conf
     * @returns {any} the pieces, the `ful-choice` container being the `freeze` piece
     */
    _build({ slots }) {
        const isSwitch = this.declared('type') === 'switch';
        const fragment = this.template().withOverlay({ slots, isSwitch }).render();
        this.#container = fragment.firstElementChild;
        this.#input = fragment.querySelector('input');
        Attributes.forward('input-', this, this.#input);
        this.#input.addEventListener('change', (evt) => {
            evt.stopPropagation();
            this._notifyChange();
        });
        const label = fragment.querySelector('label');
        return {
            fragment,
            control: this.#input,
            error: fragment.querySelector('ful-field-error'),
            label,
            freeze: this.#container,
        };
    }
    /**
     * Whether the box is checked. The `value` attribute is read with the `bool`
     * mapper, where only the text `true` means checked.
     * @type {boolean}
     */
    get value() {
        return this.#input.checked;
    }
    set value(value) {
        this.#input.checked = value;
    }
}

export { Checkbox };
