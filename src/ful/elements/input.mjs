import { Attributes } from '../../ftl/index.mjs';
import { Field } from './field.mjs';

class Input extends Field {
    static observed = ['value', 'readonly:presence', 'required:presence', 'placeholder'];
    static slots = true;
    static template = `
        <label>{{{{ slots.default }}}}</label>
        {{{{ slots.info }}}}
        <ful-control-group>
            <ful-affix data-tpl-if="slots.ibefore">{{{{ slots.ibefore }}}}</ful-affix>
            {{{{ slots.before }}}}
            <input data-tpl-if="type != 'textarea'" data-tpl-type="type" placeholder=" " form="">
            <textarea data-tpl-if="type == 'textarea'" placeholder=" " form=""></textarea>
            {{{{ slots.after }}}}
            <ful-affix data-tpl-if="slots.iafter">{{{{ slots.iafter }}}}</ful-affix>
        </ful-control-group>
        <ful-field-error></ful-field-error>
    `;
    _input;
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
        this._adopt(this._input, fragment.querySelector('ful-field-error'));
        this._wireLabel(fragment.querySelector('label'));
        this._input.addEventListener('keydown', (evt) => {
            if (evt.key !== 'Enter' || this._type() === 'textarea') {
                return;
            }
            this._requestSubmit();
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
    get disabled() {
        return super.disabled;
    }
    set disabled(d) {
        super.disabled = d;
        //the inner control carries the claim as a native input would: a disabled
        //fieldset ancestry is left to the browser, which reaches the inner control
        //as a descendant of the fieldset and re-enables it on its own
        Attributes.toggle(this._input, 'disabled', d);
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
    formResetCallback() {
        this.value = this.unmarshal('value', this.getAttribute('value'));
    }
}

export { Input };
