import { Attributes, Fragments } from '../../ftl/index.mjs';
import { Field } from './field.mjs';

/**
 * A group of radios declared as `ful-radio` children. Each `ful-radio` becomes
 * a radio input carrying its attributes, labelled by its content; every
 * `input-*` attribute on the group is forwarded onto each radio as well. The
 * default slot is the `<legend>`, and `header` and `footer` slots frame the
 * list. The radios share a name of their own (derived from `name`, or minted
 * when there is none) and carry `form=""`, so the group is the only element
 * the form sees. A radio's native `change` is stopped and republished as the
 * group's own.
 *
 * The host carries the `radiogroup` role, `aria-readonly`, `aria-required`,
 * `aria-invalid` and the description. The disabled and readonly claims act on
 * the group's `<fieldset>`, and readonly refuses every click inside it.
 * `focus()` lands on the first radio.
 */
class RadioGroup extends Field {
    /** @type {string[]} */
    static attributes = ['name', 'type'];
    static slots = true;
    /** @type {string} */
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
     * @returns {any} the pieces: the first radio as the control, the fieldset
     * as the `claims` and `freeze` pieces, and the host as the `described` and
     * `announces` pieces
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
        return {
            fragment,
            control: this.#firstRadio,
            error: fragment.querySelector('ful-field-error'),
            described: this,
            claims: this.#fieldset,
            announces: this,
            freeze: this.#fieldset,
        };
    }
    /**
     * The value of the checked radio, `null` when none is. Under
     * `type="boolean"` it answers `true` for a radio whose value is `true` and
     * `false` for any other. Writing a value checks the radio carrying it, and
     * writing `null` or a value no radio carries clears the selection.
     * @type {string | boolean | null}
     */
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
        if (el === null) {
            clear();
            return;
        }
        el.checked = true;
    }
}

export { RadioGroup };
