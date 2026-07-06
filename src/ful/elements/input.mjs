import { Attributes, ParsedElement } from '../../ftl/index.mjs';

class Input extends ParsedElement {
    static observed = ['value', 'readonly:presence', 'required:presence'];
    static slots = true;
    static template = `
        <div class="form-label">
            <label>{{{{ slots.default }}}}</label>
            {{{{ slots.info }}}}
        </div>
        <div class="input-group">
            <span data-tpl-if="slots.ibefore" class="input-group-text">{{{{ slots.ibefore }}}}</span>
            {{{{ slots.before }}}}
            <input data-tpl-if="type != 'textarea'" class="form-control" data-tpl-type="type" placeholder=" " form="">
            <textarea data-tpl-if="type == 'textarea'" class="form-control" placeholder=" " form=""></textarea>
            {{{{ slots.after }}}}
            <span data-tpl-if="slots.iafter" class="input-group-text">{{{{ slots.iafter }}}}</span>
        </div>
        <ful-field-error></ful-field-error>
    `;
    static formAssociated = true;
    _input;
    _fieldError;
    constructor() {
        super();
        this.internals = this.attachInternals();
        this.internals.role = 'presentation';
    }
    _type() {
        return this.getAttribute('type') ?? 'text';
    }
    _fragment(type, slots) {
        return this.template().withOverlay({ type, slots }).render();
    }
    render({ slots, observed, disabled, skipObservedSetup }) {
        const type = this._type();
        const fragment = this._fragment(type, slots);
        this._input = fragment.querySelector('input,textarea');

        Attributes.forward('input-', this, this._input);
        if (!skipObservedSetup) {
            this.disabled = disabled;
            this.readonly = observed.readonly;
            this.required = observed.required;
            this.value = observed.value;
        }
        this._input.addEventListener('keydown', (evt) => {
            if (evt.key !== 'Enter' || this._type() === 'textarea') {
                return;
            }
            const form = this.internals.form;
            if (!form) {
                return;
            }
            const candidates = /** @type [HTMLButtonElement|HTMLInputElement] */ (
                Array.from(form.querySelectorAll('button:not(:disabled), input:not(:disabled)'))
            );
            const submitter = candidates.find((el) => el.type === 'submit');
            form.requestSubmit(submitter);
        });
        this._input.addEventListener('input', (evt) => {
            const re = this.getAttribute('mask');
            if (!re) {
                return;
            }
            const before = evt.target.value;
            const after = before.replace(new RegExp(re, 'g'), '');
            if (before === after) {
                return;
            }
            const start = evt.target.selectionStart;
            const offset = before.length - after.length;
            evt.target.value = after;
            evt.target.setSelectionRange(start - offset, start - offset);
        });
        this._input.addEventListener('change', (evt) => {
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
        label.addEventListener('click', () => this.focus());
        this._fieldError = fragment.querySelector('ful-field-error');
        this._input.ariaDescribedByElements = [this._fieldError];
        this._input.ariaLabelledByElements = [label];
        this.replaceChildren(fragment);
    }
    get value() {
        const uppercase = this.hasAttribute('uppercase');
        const trim = this.hasAttribute('trim');
        const v = this._input.value;
        const uppercased = uppercase ? v.toUpperCase() : v;
        const trimmed = trim ? uppercased.trim() : uppercased;
        return trimmed === '' ? null : trimmed;
    }
    set value(value) {
        this._input.value = value === '' ? null : value;
    }
    get readonly() {
        return this._input.readOnly;
    }
    set readonly(v) {
        this._input.readOnly = v;
        this.reflect(() => {
            Attributes.toggle(this, 'readonly', v);
        });
    }
    get disabled() {
        return this._input.hasAttribute('disabled');
    }
    set disabled(d) {
        Attributes.toggle(this._input, 'disabled', d);
    }
    get required() {
        return this._input.getAttribute('aria-required') === 'true';
    }
    set required(d) {
        Attributes.set(this._input, 'aria-required', d ? 'true' : null);
        this.reflect(() => {
            Attributes.toggle(this, 'required', d);
        });
    }
    focus(options) {
        this._input.focus(options);
    }
    setCustomValidity(error) {
        if (!error) {
            this.internals.setValidity({});
            this._fieldError.innerText = '';
            return;
        }
        this.internals.setValidity({ customError: true }, ' ');
        this._fieldError.innerText = error;
    }
    formResetCallback() {
        this.value = this.unmarshal('value', this.getAttribute('value'));
    }
}

export { Input };
