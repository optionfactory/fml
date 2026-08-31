import { Attributes, ParsedElement } from '../../ftl/index.mjs';

class Checkbox extends ParsedElement {
    static observed = ['value:bool', 'readonly:presence', 'required:presence'];
    static slots = true;
    static template = `
        <div data-tpl-class="klass">
            <div class="input-container">
                <input class="form-check-input" type="checkbox" data-tpl-role="isSwitch ? 'switch' : false" form="" placeholder=" ">
            </div>
            <div class="form-check-label">
                <label>{{{{ slots.default }}}}</label>
                {{{{ slots.info }}}}
            </div>
        </div>
        <ful-field-error></ful-field-error>
    `;
    #container;
    #input;
    #fieldError;
    static formAssociated = true;
    constructor() {
        super();
        this.internals = this.attachInternals();
        this.internals.role = 'presentation';
    }
    render({ slots, observed, disabled }) {
        const isSwitch = this.getAttribute('type') === 'switch';
        const klass = isSwitch ? 'form-check form-switch' : 'form-check';
        const fragment = this.template().withOverlay({ slots, klass, isSwitch }).render();
        this.#container = fragment.firstElementChild;
        this.#input = fragment.querySelector('input');
        Attributes.forward('input-', this, this.#input);
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
        this.#fieldError = fragment.querySelector('ful-field-error');
        this.#input.ariaDescribedByElements = [this.#fieldError];
        this.#input.ariaLabelledByElements = [label];
        this.replaceChildren(fragment);
    }
    get value() {
        return this.#input.checked;
    }
    set value(value) {
        this.#input.checked = value;
    }
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
        //the claim only, like a native input: the effective state, claim or disabled
        //ancestry, is what :disabled matches
        return this.hasAttribute('disabled');
    }
    set disabled(d) {
        //the claim belongs to the author alone, nothing else ever writes it
        Attributes.toggle(this, 'disabled', d);
        //the inner control carries the claim as a native input would: a disabled
        //fieldset ancestry is left to the browser, which reaches the inner control
        //as a descendant of the fieldset and re-enables it on its own
        Attributes.toggle(this.#input, 'disabled', d);
    }
    get required() {
        return this.#input.getAttribute('aria-required') === 'true';
    }
    set required(d) {
        Attributes.set(this.#input, 'aria-required', d ? 'true' : null);
        this.reflect(() => {
            Attributes.toggle(this, 'required', d);
        });
    }
    focus(options) {
        this.#input.focus(options);
    }
    setCustomValidity(error) {
        if (!error) {
            this.internals.setValidity({});
            this.#fieldError.innerText = '';
            return;
        }
        this.internals.setValidity({ customError: true }, ' ');
        this.#fieldError.innerText = error;
    }
}

export { Checkbox };
