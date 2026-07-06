import { Attributes, Fragments, ParsedElement } from '../../ftl/index.mjs';

class RadioGroup extends ParsedElement {
    static observed = ['value', 'readonly:presence', 'required:presence'];
    static slots = true;
    static template = `
        <fieldset>
            <legend class="form-label">
                {{{{ slots.default }}}}
            </legend>
            <header data-tpl-if="slots.header">
                {{{{ slots.header }}}}
            </header>
            <section>
                <div class="label-wrapper" data-tpl-each="inputsAndLabels" data-tpl-var="ial">
                    <label>
                        {{{{ ial[0] }}}}
                        <div>{{{{ ial[1] }}}}</div>
                    </label>
                </div>
            </section>
            <ful-field-error></ful-field-error>
            <footer data-tpl-if="slots.footer">
                {{{{ slots.footer }}}}
            </footer>
        </fieldset>
    `;
    static formAssociated = true;
    #fieldset;
    #fieldError;
    #firstRadio;
    #booleanType;
    constructor() {
        super();
        this.internals = this.attachInternals();
        this.internals.role = 'radiogroup';
    }
    render({ slots, observed, disabled }) {
        const name = this.getAttribute('name') ?? Attributes.uid('ful-radiogroup');
        const radioEls = Array.from(slots.default.querySelectorAll('ful-radio'));
        const inputsAndLabels = radioEls.map((el) => {
            const input = document.createElement('input');
            input.setAttribute('type', 'radio');
            Attributes.forward('input-', this, input);
            Attributes.forward('', el, input);
            input.setAttribute('name', `${name}-ignore`);
            input.setAttribute('form', ``);
            input.addEventListener('change', (evt) => {
                evt.stopPropagation();
                //change is not cancelable
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
            const label = Fragments.fromChildNodes(el);
            return [input, label];
        });

        radioEls.forEach((el) => el.remove());
        this.template().withOverlay({ name, slots, inputsAndLabels }).renderTo(this);
        this.#fieldset = this.firstElementChild;
        this.disabled = disabled;
        this.readonly = observed.readonly;
        this.required = observed.required;
        this.value = observed.value;
        this.#fieldError = this.querySelector('ful-field-error');
        this.ariaDescribedByElements = [this.#fieldError];
        this.#firstRadio = this.querySelector('input[type=radio]');
        this.#booleanType = this.getAttribute('type') === 'boolean';
    }
    get value() {
        /** @type {HTMLInputElement|null} */
        const checked = this.querySelector('input[type=radio]:checked');
        return checked ? (this.#booleanType ? checked.value === 'true' : checked.value) : null;
    }
    set value(value) {
        if (value === null) {
            this.querySelectorAll(`input[type=radio]`).forEach((el) => {
                /** @type {HTMLInputElement} */ (el).checked = false;
            });
            return;
        }
        /** @type {HTMLInputElement|null} */
        const el = this.querySelector(`input[type=radio][value=${CSS.escape(String(value))}]`);
        if (el) {
            el.checked = true;
        }
    }
    get readonly() {
        return this.#fieldset.inert;
    }
    set readonly(v) {
        this.#fieldset.inert = v;
        this.reflect(() => {
            Attributes.toggle(this, 'readonly', v);
        });
    }
    get disabled() {
        return this.#fieldset.hasAttribute('disabled');
    }
    set disabled(d) {
        Attributes.toggle(this.#fieldset, 'disabled', d);
    }
    get required() {
        return this.#fieldset.getAttribute('aria-required') === 'true';
    }
    set required(d) {
        Attributes.set(this.#fieldset, 'aria-required', d ? 'true' : null);
        this.reflect(() => {
            Attributes.toggle(this, 'required', d);
        });
    }
    focus(options) {
        this.#firstRadio.focus(options);
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

export { RadioGroup };
