import { Attributes, ParsedElement } from '../../ftl/index.mjs';

class Input extends ParsedElement {
    static observed = ['value', 'readonly:presence', 'required:presence', 'placeholder'];
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
            const mask = this.getAttribute('mask');
            if (!mask) {
                return;
            }
            const strip = (v) => v.replace(new RegExp(mask, 'g'), '');
            const before = evt.target.value;
            const after = strip(before);
            if (before === after) {
                return;
            }
            const start = evt.target.selectionStart;
            evt.target.value = after;
            if (start === null) {
                //email, number and the date types have no selection to restore
                return;
            }
            //the caret keeps its place among the characters that survived, so only the
            //ones stripped before it count
            const caret = strip(before.slice(0, start)).length;
            evt.target.setSelectionRange(caret, caret);
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
        if (!skipObservedSetup) {
            // biome-ignore lint/complexity/noUselessThisAlias: keeps checkJs from seeing these as class fields
            const el = this;
            el.disabled = disabled;
            el.readonly = observed.readonly;
            el.required = observed.required;
            el.placeholder = observed.placeholder;
            el.value = observed.value;
        }
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
    get placeholder() {
        const v = this._input.getAttribute('placeholder');
        return v === ' ' ? null : v;
    }
    set placeholder(d) {
        //without a placeholder :placeholder-shown never matches, and floating labels
        //rely on it, so a blank one stands in for none
        Attributes.set(this._input, 'placeholder', d ?? ' ');
        this.reflect(() => {
            Attributes.set(this, 'placeholder', d);
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
