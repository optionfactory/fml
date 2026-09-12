import { Attributes, Fragments } from '../../ftl/index.mjs';
import { Field } from './field.mjs';

/** A group of radios declared as ful-radio children, a fieldset carrying the group semantics. */
class RadioGroup extends Field {
    static attributes = ['name', 'type'];
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
            <ful-radio-list>
                <div class="label-wrapper" data-tpl-each="inputsAndLabels" data-tpl-var="ial">
                    <label>
                        {{{{ ial[0] }}}}
                        <div>{{{{ ial[1] }}}}</div>
                    </label>
                </div>
            </ful-radio-list>
            <ful-field-error></ful-field-error>
            <footer data-tpl-if="slots.footer">
                {{{{ slots.footer }}}}
            </footer>
        </fieldset>
    `;
    #fieldset;
    #firstRadio;
    #booleanType;
    /**
     * @param {{slots: any}} conf
     * @returns {any}
     */
    _build({ slots }) {
        const name = this.declared('name') ?? Attributes.uid('ful-radiogroup');
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
                this._notifyChange();
            });
            const label = Fragments.fromChildNodes(el);
            return [input, label];
        });

        radioEls.forEach((el) => {
            el.remove();
        });
        const fragment = this.template().withOverlay({ name, slots, inputsAndLabels }).render();
        this.#fieldset = /** @type HTMLElement */ (fragment.firstElementChild);
        this.#firstRadio = fragment.querySelector('input[type=radio]');
        this.#booleanType = this.declared('type') === 'boolean';
        //the group claims through its own fieldset, which carries disabled like a
        //native control, inerts for readonly (radios have no editable text to
        //preserve) and announces the requirement; focus stays on the first radio,
        //and the host itself is described, there being no single control to name
        //and the legend being a fieldset's own label
        return {
            fragment,
            control: this.#firstRadio,
            error: fragment.querySelector('ful-field-error'),
            described: this,
            claims: this.#fieldset,
            //the radiogroup role is the host's, so the claims announce there: a
            //fieldset is a group, which accepts neither aria-readonly nor
            //aria-required
            announces: this,
            freeze: this.#fieldset,
        };
    }
    get value() {
        /** @type {HTMLInputElement|null} */
        const checked = this.querySelector('input[type=radio]:checked');
        return checked ? (this.#booleanType ? checked.value === 'true' : checked.value) : null;
    }
    set value(value) {
        const radios = this.querySelectorAll(`input[type=radio]`);
        const clear = () => {
            radios.forEach((el) => {
                /** @type {HTMLInputElement} */ (el).checked = false;
            });
        };
        if (value === null) {
            clear();
            return;
        }
        /** @type {HTMLInputElement|null} */
        const el = this.querySelector(`input[type=radio][value=${CSS.escape(String(value))}]`);
        //an unknown key clears, like a null assignment and like the select's
        //unknown keys: a stale radio must not keep answering for it
        if (el === null) {
            clear();
            return;
        }
        el.checked = true;
    }
}

export { RadioGroup };
