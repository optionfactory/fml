import { Attributes } from '../../ftl/index.mjs';
import { Field } from './field.mjs';

class Checkbox extends Field {
    static observed = ['value:bool', 'readonly:presence', 'required:presence'];
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
    render({ slots, observed, disabled }) {
        const isSwitch = this.getAttribute('type') === 'switch';
        const fragment = this.template().withOverlay({ slots, isSwitch }).render();
        this.#container = fragment.firstElementChild;
        this.#input = fragment.querySelector('input');
        Attributes.forward('input-', this, this.#input);
        this._adopt(this.#input, fragment.querySelector('ful-field-error'));
        this.disabled = disabled;
        this.readonly = observed.readonly;
        this.required = observed.required;
        this.value = observed.value;
        this.#input.addEventListener('change', (evt) => {
            evt.stopPropagation();
            this.dispatchEvent(
                new CustomEvent('change', {
                    bubbles: true,
                    cancelable: false,
                    detail: {
                        value: this.value,
                    },
                }),
            );
        });
        const label = fragment.querySelector('label');
        this._wireA11y(label);
        label.addEventListener('click', () => {
            this.focus();
            //a label is not a form control, the guard must ask the effective state
            if (this.matches(':disabled') || this.readonly) {
                return;
            }
            this.value = !this.value;
            this.dispatchEvent(
                new CustomEvent('change', {
                    bubbles: true,
                    cancelable: false,
                    detail: {
                        value: this.value,
                    },
                }),
            );
        });
        this.replaceChildren(fragment);
    }
    get value() {
        return this.#input.checked;
    }
    set value(value) {
        this.#input.checked = value;
    }
    //a checkbox has no editable text to preserve: readonly freezes the whole
    //choice, label click included, so the container inerts instead of the base's
    //native readOnly
    get readonly() {
        return this.#container.inert;
    }
    set readonly(v) {
        this.#container.inert = v;
        this.reflect(() => {
            Attributes.toggle(this, 'readonly', v);
        });
    }
    get disabled() {
        return super.disabled;
    }
    set disabled(d) {
        super.disabled = d;
        //the inner control carries the claim as a native input would: a disabled
        //fieldset ancestry is left to the browser, which reaches the inner control
        //as a descendant of the fieldset and re-enables it on its own
        Attributes.toggle(this.#input, 'disabled', d);
    }
}

export { Checkbox };
