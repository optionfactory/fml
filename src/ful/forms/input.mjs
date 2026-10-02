import { Attributes, BoundedCache } from '../../ftl/index.mjs';
import { Field } from './field.mjs';

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

const inheritedAutocomplete = (el) => el.closest('form')?.getAttribute('autocomplete') ?? null;

const INPUT_MODES = { numeric: 'numeric', decimal: 'decimal' };

const signed = (v, digits) => (v.startsWith('-') ? '-' : '') + digits(v);

const NUMERIC_DIGITS = {
    numeric: (t) => t.replace(/\D/g, ''),
    decimal: (t) => {
        const kept = t.replace(/[^\d.,]/g, '');
        const at = kept.search(/[.,]/);
        return at === -1 ? kept : kept.slice(0, at + 1) + kept.slice(at + 1).replace(/[.,]/g, '');
    },
};

const numericFilter = (type, unsigned) => {
    const digits = NUMERIC_DIGITS[type];
    if (!digits) {
        return null;
    }
    return unsigned ? digits : (v) => signed(v, digits);
};

const filterOf = (el) => {
    const keep = el.declared('keep');
    const reject = el.declared('reject');
    if (keep !== null && reject !== null) {
        console.warn('a ful-input declares both keep and reject: keep is applied, reject is ignored', el);
    }
    if (keep !== null) {
        const re = compiled('keep', keep);
        return re && ((v) => (v.match(re) ?? []).join(''));
    }
    if (reject !== null) {
        const re = compiled('reject', reject);
        return re && ((v) => v.replace(re, ''));
    }
    return numericFilter(el._type(), el.declared('unsigned'));
};

/**
 * A labelled text input over any native input type, or a `<textarea>` under
 * `type="textarea"`; the temporal inputs are its subclasses. The label is the
 * default slot, `info` follows it, and `before` and `after` are rendered as
 * affixes around the control. Every `input-*` attribute is forwarded onto the
 * control, after everything the field sets there, so it has the last word.
 *
 * `type`, `v-type`, `keep`, `reject`, `uppercase`, `trim`, `unsigned` and
 * `autocomplete` are configuration: read once at the upgrade, so a later write
 * to them changes nothing. `placeholder` stays live.
 *
 * - `type="numeric"` and `type="decimal"` render a text input carrying that
 *   `inputmode`, so the native `min`, `max` and `step` do not apply. Typing is
 *   filtered to digits and a leading minus; a decimal also keeps its first `.`
 *   or `,` and drops any later one; `unsigned` drops the minus.
 * - `keep` and `reject` are regular expressions filtering what is typed:
 *   `keep` leaves every match, concatenated, and `reject` removes every match.
 *   Either replaces the type's own filter, and `keep` wins over `reject` with a
 *   warning. A pattern that does not compile is warned about once and filters
 *   nothing. The caret stays next to the same character when text before it
 *   is removed.
 * - `autocomplete` is put on the control. Without one the field takes the
 *   `autocomplete` attribute of the nearest enclosing `<form>`, which the
 *   platform does not pass on because the control carries `form=""`.
 * - `uppercase`, `trim` and `v-type` shape the value as it is read; see `value`.
 *
 * The control's native `change` is stopped and republished as the field's own.
 *
 * A subclass template may render more than one control, as the compare filters
 * render the two bounds of a range: the first is `_input`, the one the field is
 * named by and whose `change` it republishes, and every one of them gets the
 * inputmode, `autocomplete`, the `input-` passthrough, the keystroke filter and
 * the placeholder. The passthrough leaves `input-id` to the first alone, so no
 * two controls share an id.
 */
class Input extends Field {
    /** @type {string[]} */
    static observed = ['placeholder'];
    /** @type {string[]} */
    static attributes = [
        'type',
        'v-type',
        'keep',
        'reject',
        'uppercase:presence',
        'trim:presence',
        'unsigned:presence',
        'autocomplete',
    ];
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
    /**
     * The inner control, set by `_build`: the `<input>`, or the `<textarea>`
     * under `type="textarea"`. A subclass reads and writes it for the
     * attributes it adds. Typed `any` so that a subclass can treat it as the
     * one of the two it renders.
     * @type {any}
     */
    _input;
    /** @type {(HTMLInputElement|HTMLTextAreaElement)[]} */
    #controls = [];
    /**
     * The type the field renders, which a subclass overrides to wrap another
     * native type. The base answers the declared `type`, else `number` under
     * `v-type="number"`, else `text`. It is also what selects the keystroke
     * filter of `numeric` and `decimal` and the separator handling of `value`.
     * @returns {string}
     */
    _type() {
        return this.declared('type') ?? (this.declared('v-type') === 'number' ? 'number' : 'text');
    }
    /**
     * @param {{ slots: Record<string, DocumentFragment> | undefined }} conf
     * @returns {{fragment: DocumentFragment, control: any, error: Element | null, label: HTMLLabelElement | null}}
     */
    _build({ slots }) {
        const declared = this._type();
        const mode = INPUT_MODES[declared];
        const type = mode ? 'text' : declared;
        const fragment = this.template().withOverlay({ type, slots }).render();
        this.#controls = /** @type {(HTMLInputElement|HTMLTextAreaElement)[]} */ ([
            ...fragment.querySelectorAll(':is(ful-control-group, ful-control) > :is(input, textarea)'),
        ]);
        this._input = this.#controls[0];
        const autocomplete = this.declared('autocomplete') ?? inheritedAutocomplete(this);
        const strip = filterOf(this);
        for (const control of this.#controls) {
            this.#configure(control, mode, autocomplete, strip);
        }
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
    /**
     * @param {HTMLInputElement|HTMLTextAreaElement} control
     * @param {string|undefined} mode the inputmode the type names
     * @param {string|null} autocomplete
     * @param {((text: string) => string)|null} strip the keystroke filter
     */
    #configure(control, mode, autocomplete, strip) {
        if (mode) {
            Attributes.set(control, 'inputmode', mode);
        }
        Attributes.set(control, 'autocomplete', autocomplete);
        const id = control.id;
        Attributes.forward('input-', this, control);
        if (control !== this._input) {
            Attributes.set(control, 'id', id || null);
        }
        control.addEventListener('input', () => {
            if (!strip) {
                return;
            }
            const before = control.value;
            const after = strip(before);
            if (before === after) {
                return;
            }
            const start = control.selectionStart;
            control.value = after;
            if (start === null) {
                return;
            }
            const caret = strip(before.slice(0, start)).length;
            control.setSelectionRange(caret, caret);
        });
    }
    /**
     * The control's text, shaped in this order: upper cased under `uppercase`,
     * trimmed under `trim`, `null` when that leaves it empty, every `,` read as
     * `.` for `type="decimal"`, and decoded to a number under
     * `v-type="number"`, where text that does not decode is answered as it is.
     * Writing `null`, `undefined` or `''` empties the control; anything else is
     * written as its string. Writing the text the control already holds leaves
     * it untouched, so a date or time control keeps the segments being typed.
     * Answers a `string`, a `number` or `null`; typed `any` because subclasses
     * answer other values.
     * @type {any}
     */
    get value() {
        const uppercase = this.declared('uppercase');
        const trim = this.declared('trim');
        const v = this._input.value;
        const uppercased = uppercase ? v.toUpperCase() : v;
        const trimmed = trim ? uppercased.trim() : uppercased;
        if (trimmed === '') {
            return null;
        }
        const normalized = this._type() === 'decimal' ? trimmed.replaceAll(',', '.') : trimmed;
        if (this.declared('v-type') === 'number') {
            const n = Number(normalized);
            return Number.isNaN(n) ? normalized : n;
        }
        return normalized;
    }
    set value(value) {
        const text = value === '' || value === undefined || value === null ? '' : `${value}`;
        if (this._input.value === text) {
            return;
        }
        this._input.value = text;
    }
    /**
     * The control's placeholder, `null` when there is none. The control always
     * carries one, a single space standing in for none, so `:placeholder-shown`
     * matches an empty control and a floating label can rely on it; the blank
     * one is neither answered here nor reflected onto the host.
     * @type {string | null}
     */
    get placeholder() {
        const v = this._input.getAttribute('placeholder');
        return v === ' ' ? null : v;
    }
    set placeholder(d) {
        for (const control of this.#controls) {
            Attributes.set(control, 'placeholder', d ?? ' ');
        }
        this.reflectTo('placeholder', d);
    }
}

export { Input };
