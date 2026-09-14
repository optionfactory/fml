import { Attributes } from '../../ftl/index.mjs';
import { Field } from './field.mjs';

/** A checkbox, or a switch under the type=switch claim. */
class Checkbox extends Field {
    static attributes = ['type'];
    static observed = ['value:bool'];
    static slots = true;
    static template = `
        <ful-choice data-tpl-switch="isSwitch">
            <input type="checkbox" data-tpl-role="isSwitch ? 'switch' : false" form="" placeholder=" ">
            <label>{{{{ slots.default }}}}</label>
            {{{{ slots.info }}}}
        </ful-choice>
        <ful-field-error></ful-field-error>
    `;
    #container;
    #input;
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
        //the base points the label at the input with for/id, so the click toggles
        //the way it does in a plain form: the input's own change listener above
        //carries the notification, and readonly is refused by the freeze below
        const label = fragment.querySelector('label');
        //a checkbox has no editable text to preserve, so readonly freezes the
        //whole choice, label click included: the container is the frozen piece
        return {
            fragment,
            control: this.#input,
            error: fragment.querySelector('ful-field-error'),
            label,
            freeze: this.#container,
        };
    }
    get value() {
        return this.#input.checked;
    }
    set value(value) {
        this.#input.checked = value;
    }
}

export { Checkbox };
