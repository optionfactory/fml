import { Attributes, Fragments } from '../../ftl/index.mjs';
import { Field } from './field.mjs';

class RadioGroup extends Field {
    static observed = ['value', 'readonly:presence', 'required:presence'];
    static slots = true;
    static ROLE = 'radiogroup';
    static template = `
        <fieldset>
            <legend>
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
    #fieldset;
    #firstRadio;
    #booleanType;
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

        radioEls.forEach((el) => {
            el.remove();
        });
        this.template().withOverlay({ name, slots, inputsAndLabels }).renderTo(this);
        this.#fieldset = this.firstElementChild;
        this.disabled = disabled;
        this.readonly = observed.readonly;
        this.required = observed.required;
        this.value = observed.value;
        //the host itself is described: there is no single control to name, the
        //legend is a fieldset's own label
        const fieldError = /** @type HTMLElement */ (this.querySelector('ful-field-error'));
        this.ariaDescribedByElements = [fieldError];
        this.#firstRadio = this.querySelector('input[type=radio]');
        this._adopt(this.#firstRadio, fieldError);
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
    //radios have no editable text to preserve: readonly freezes the whole group,
    //so the fieldset inerts instead of the base's native readOnly
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
        return super.disabled;
    }
    set disabled(d) {
        super.disabled = d;
        //the group disables through its own fieldset, which carries the claim like
        //a native input would: a disabled outer ancestry is left to the browser,
        //which reaches the radios as descendants and re-enables them on its own
        this.#fieldset.disabled = d;
    }
    //the announcement lives on the group's fieldset, not on the first radio the
    //base would reach
    get required() {
        return this.#fieldset.getAttribute('aria-required') === 'true';
    }
    set required(d) {
        Attributes.set(this.#fieldset, 'aria-required', d ? 'true' : null);
        this.reflect(() => {
            Attributes.toggle(this, 'required', d);
        });
    }
}

export { RadioGroup };
