import { Attributes, BoundedCache } from '../../ftl/index.mjs';
import { Field } from './field.mjs';

//a null entry is a pattern that did not compile: cached like any other so the
//warning is printed once rather than on every keystroke
const patternCache = new BoundedCache(100);
const compiled = (attr, pattern) =>
    patternCache.getOrCompute(`${attr}:${pattern}`, () => {
        try {
            return new RegExp(pattern, 'g');
        } catch (/** @type any */ e) {
            console.warn(`invalid ${attr} attribute`, pattern, e);
            return null;
        }
    });

/**
 * The keystroke filter an input declares, as one function of the text.
 *
 * `keep` names the characters that survive and `reject` the ones that do not,
 * which are the same statement from either side: `keep="[0-9]"` and
 * `reject="[^0-9]"` both leave the digits. Keeping is the one worth reaching for,
 * the rejecting spelling of an allowed set being a double negative.
 */
const warnedBoth = new WeakSet();
const filterOf = (el) => {
    const keep = el.getAttribute('keep');
    const reject = el.getAttribute('reject');
    if (keep !== null && reject !== null && !warnedBoth.has(el)) {
        //the filter is read per keystroke, so the complaint is held per element
        warnedBoth.add(el);
        console.warn('a ful-input declares both keep and reject: keep is applied, reject is ignored', el);
    }
    if (keep !== null) {
        const re = compiled('keep', keep);
        //every match, concatenated: the attribute is a pattern rather than a
        //character class, so the kept text cannot be found by negating it
        return re && ((v) => (v.match(re) ?? []).join(''));
    }
    if (reject !== null) {
        const re = compiled('reject', reject);
        return re && ((v) => v.replace(re, ''));
    }
    return null;
};

/** A labelled text input over any native type or textarea; the temporal inputs are its subclasses. */
class Input extends Field {
    static observed = ['placeholder'];
    static slots = true;
    static template = `
        <label>{{{{ slots.default }}}}</label>
        {{{{ slots.info }}}}
        <ful-control-group>
            <ful-affix data-tpl-if="slots.before">{{{{ slots.before }}}}</ful-affix>
            <input data-tpl-if="type != 'textarea'" data-tpl-type="type" placeholder=" " form="">
            <textarea data-tpl-if="type == 'textarea'" placeholder=" " form=""></textarea>
            <ful-affix data-tpl-if="slots.after">{{{{ slots.after }}}}</ful-affix>
        </ful-control-group>
        <ful-field-error></ful-field-error>
    `;
    _input;
    _type() {
        //a numeric value wants the numeric widget (decimal normalization, the
        //right keyboard): v-type=number defaults the type, a declared one wins
        return this.getAttribute('type') ?? (this.getAttribute('v-type') === 'number' ? 'number' : 'text');
    }
    _build({ slots }) {
        const type = this._type();
        const fragment = this.template().withOverlay({ type, slots }).render();
        this._input = fragment.querySelector('input,textarea');

        Attributes.forward('input-', this, this._input);
        this._input.addEventListener('keydown', (evt) => {
            //a file field's Enter opens the picker, as a native file input's would,
            //and never submits
            if (evt.key !== 'Enter' || this._type() === 'textarea' || this._type() === 'file') {
                return;
            }
            this._requestSubmit();
        });
        this._input.addEventListener('input', (evt) => {
            const strip = filterOf(this);
            if (!strip) {
                return;
            }
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
            this._notifyChange();
        });
        return {
            fragment,
            control: this._input,
            error: fragment.querySelector('ful-field-error'),
            label: fragment.querySelector('label'),
        };
    }
    get value() {
        const uppercase = this.hasAttribute('uppercase');
        const trim = this.hasAttribute('trim');
        const v = this._input.value;
        const uppercased = uppercase ? v.toUpperCase() : v;
        const trimmed = trim ? uppercased.trim() : uppercased;
        if (trimmed === '') {
            return null;
        }
        if (this.getAttribute('v-type') === 'number') {
            //typed values are an explicit opt in, as the select's k-type: blank
            //stays null, and a value that does not decode is kept as it is
            const n = Number(trimmed);
            return Number.isNaN(n) ? trimmed : n;
        }
        return trimmed;
    }
    set value(value) {
        this._input.value = value === '' || value === undefined ? null : value;
    }
    get placeholder() {
        const v = this._input.getAttribute('placeholder');
        return v === ' ' ? null : v;
    }
    set placeholder(d) {
        //without a placeholder :placeholder-shown never matches, and floating labels
        //rely on it, so a blank one stands in for none
        Attributes.set(this._input, 'placeholder', d ?? ' ');
        this.reflectTo('placeholder', d);
    }
}

export { Input };
