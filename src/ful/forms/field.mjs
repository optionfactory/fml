import { Attributes, ParsedElement } from '../../ftl/index.mjs';

/**
 * The base of every form-associated ful field: a form-associated custom element
 * carrying the validity protocol, the field error live region, focus
 * delegation, the label chrome and the disabled, readonly and required claims.
 *
 * A subclass owns its template, its value semantics and its change events. It
 * implements `_build(conf)`, which builds its dom and returns the pieces the
 * base drives (see `_build`), and the `value` pair. The base wires the pieces,
 * mounts the fragment and applies the declared state. Nothing in the base is
 * there to be called from a subclass's build.
 *
 * The claim setters, the validity protocol and the aria wiring all act on the
 * pieces, so a field with no native control returns a focusable piece of its
 * own chrome as the control. The claim getters and `focus()` are the only
 * members that tolerate a not yet rendered element; the other members need the
 * pieces and so work only after the render.
 *
 * The inner controls carry `form=""`, so the host is the only element the form
 * sees. Enter pressed in an inner `<input>` of any type but `file`, `button`,
 * `submit`, `reset` and `image` submits the field's form through
 * `_requestSubmit()`, as Enter in a native input would. It does not when a
 * listener inside the field already called `preventDefault()` on the keydown,
 * while an input method is composing, or when the input is still associated
 * with the form itself and so submits on its own.
 */
class Field extends ParsedElement {
    static formAssociated = true;
    /**
     * The claim attributes and the value, observed so that every field,
     * including a custom one that never lists them, keeps them live after the
     * upgrade. A subclass's own `static observed` adds to this list. The value
     * is read with the string mapper; a field with another vocabulary redeclares
     * it with its own (`value:bool`, `value:csv`, `value:json`).
     * @type {string[]}
     */
    static observed = ['disabled:presence', 'readonly:presence', 'required:presence', 'value'];
    /**
     * The role set on the element internals at construction. A field whose host
     * is the widget itself overrides it, as `RadioGroup` does with `'radiogroup'`.
     * @type {string}
     */
    static ROLE = 'presentation';
    #control;
    #pendingFocus = /** @type {FocusOptions | null} */ (null);
    #described;
    #descriptions = [];
    #errorId = null;
    #fieldError;
    #claims;
    #announces;
    #also = [];
    /** Sets the internals' role from the subclass's `static ROLE`. */
    constructor() {
        super();
        this.internals.role = /** @type {typeof Field} */ (this.constructor).ROLE;
    }
    #mirrors() {
        return [this.#claims ?? this.#control, ...this.#also].filter((el) => el);
    }
    /**
     * @param {{fragment: any, control: any, error?: any, label?: any, described?: any,
     *          claims?: any, announces?: any, freeze?: any, also?: any[]}} pieces
     */
    #wire({
        fragment,
        control,
        error,
        label = null,
        described = null,
        claims = null,
        announces = control,
        freeze = null,
        also = [],
    }) {
        this.#control = control;
        this.#fieldError = error;
        this.#claims = claims;
        this.#announces = announces;
        this.#also = also;
        if (freeze) {
            freeze.addEventListener(
                'click',
                (evt) => {
                    if (this.readonly) {
                        evt.preventDefault();
                    }
                },
                true,
            );
        }
        this.#described = described ?? control;
        if (error) {
            error.id = error.id || Attributes.uid('ful-field-error');
            this.#errorId = error.id;
        }
        this.#describe();
        if (label) {
            Field.#name(this, label, control);
        }
        this.addEventListener('keydown', (evt) => {
            if (evt.key !== 'Enter' || evt.defaultPrevented || evt.isComposing) {
                return;
            }
            const target = /** @type {HTMLInputElement} */ (evt.target);
            if (target.form === this.form || !Field.#submitsOnEnter(target)) {
                return;
            }
            this._requestSubmit();
        });
        this.replaceChildren(fragment);
        if (this.#pendingFocus !== null) {
            const options = this.#pendingFocus;
            this.#pendingFocus = null;
            control.focus(options);
        }
    }
    /**
     * @param {EventTarget} el
     * @returns {boolean} whether Enter in `el` submits a form on the platform
     */
    static #submitsOnEnter(el) {
        return el instanceof HTMLInputElement && !['file', 'button', 'submit', 'reset', 'image'].includes(el.type);
    }
    /**
     * Adds an element to the accessible description of the field and answers
     * whether the field took it.
     *
     * The field takes a description before its own render as readily as after:
     * one handed over early is written as soon as the field has rendered, so the
     * caller does not need to know which of the two upgraded first. The element
     * is given an id (`ful-described-*`) when it has none, is added once however
     * often it is offered, and is referenced from the `aria-describedby`
     * attribute of the `described` piece (the control by default). The
     * descriptions come in the order they were offered, the error region always
     * last.
     *
     * Pass the element that carries the words rather than a wrapper around it:
     * a hidden element is part of a description only where it is referenced
     * directly, so a popover that is closed until opened must be passed itself.
     *
     * This is the field's half of the description protocol; `describable` in
     * `ful/descriptions.mjs` is the half the content uses to find the field.
     * @param {HTMLElement | null | undefined} el
     * @returns {boolean} false only when `el` is missing
     */
    describedBy(el) {
        if (!el) {
            return false;
        }
        if (!el.id) {
            el.id = Attributes.uid('ful-described');
        }
        if (!this.#descriptions.includes(el.id)) {
            this.#descriptions.push(el.id);
        }
        this.#describe();
        return true;
    }
    #describe() {
        if (!this.#described) {
            return;
        }
        const ids = [...this.#descriptions, this.#errorId].filter((id) => id);
        if (ids.length) {
            this.#described.setAttribute('aria-describedby', ids.join(' '));
        }
    }
    /**
     * Moves the focus to the `control` piece. Asked before the render, the
     * request is kept (the last one wins) and applied once the control is
     * mounted.
     * @param {FocusOptions} [options]
     */
    focus(options) {
        if (this.#control) {
            this.#control.focus(options);
            return;
        }
        this.#pendingFocus = options ?? {};
    }
    /**
     * Clears or reports one validation problem. A message sets a custom error on
     * the element internals, which makes the host match `:invalid`, renders the
     * message into the `error` piece and sets `aria-invalid="true"` on the
     * `announces` piece, or on the `control` when the field announces nowhere.
     * An empty or missing message clears all three.
     *
     * Validation is the server's: the submit is sent regardless, and the form's
     * error mapping calls this with the problems that come back. It calls the
     * field with the most specific name a problem's context reaches and passes
     * the rest of the path as `context`. The base ignores `context`; a composite
     * field owning a whole subtree overrides this to route the message to the
     * inner control the path names.
     *
     * Needs the render: before it there is no error region to write to.
     * @param {string} [error] the message, empty or missing to clear
     * @param {string} [context] the path below this field's name, '' on an exact match
     */
    setCustomValidity(error, context) {
        Attributes.set(this.#announces ?? this.#control, 'aria-invalid', error ? 'true' : null);
        if (!error) {
            this.internals.setValidity({});
            this.#fieldError.innerText = '';
            return;
        }
        this.internals.setValidity({ customError: true }, ' ');
        this.#fieldError.innerText = error;
    }
    /**
     * The form the platform associated the field with, as a native control's
     * own `form`.
     * @returns {HTMLFormElement | null} null outside a form
     */
    get form() {
        return this.internals.form;
    }
    /**
     * Submits the associated form with `requestSubmit`, so constraint validation
     * and the `submit` event run as for a user's submit. The submitter is the
     * first enabled `button` or `input` of type `submit` in the form whose own
     * `form` is that form; with none the form is submitted without one. Does
     * nothing outside a form.
     */
    _requestSubmit() {
        const form = this.form;
        if (!form) {
            return;
        }
        const candidates = /** @type {NodeListOf<HTMLButtonElement|HTMLInputElement>} */ (
            form.querySelectorAll('button:not(:disabled), input:not(:disabled)')
        );
        form.requestSubmit([...candidates].find((el) => el.type === 'submit' && el.form === form));
    }
    /**
     * Dispatches the field's `change` event on the host: bubbling, not
     * cancelable, with `{ value: this.value, ...extras }` as the detail. Call it
     * for a change the user made. Every field in the library announces through this method and
     * passes no `value` key in `extras`, so a listener can rely on
     * `el.value === evt.detail.value`. The extras are spread after `value`, so a
     * `value` key among them would replace it.
     * @param {Record<string, any>} [extras] further detail keys beside `value`
     */
    _notifyChange(extras = {}) {
        this.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                cancelable: false,
                detail: { value: this.value, ...extras },
            }),
        );
    }
    static #LABELABLE = new Set(['BUTTON', 'INPUT', 'METER', 'OUTPUT', 'PROGRESS', 'SELECT', 'TEXTAREA']);
    /**
     * @param {Field} field
     * @param {HTMLElement} label
     * @param {HTMLElement} control
     */
    static #name(field, label, control) {
        const labelable =
            Field.#LABELABLE.has(control.tagName) && control.getAttribute('type') !== 'hidden';
        if (!labelable) {
            if (!label.id) {
                label.id = Attributes.uid('ful-label');
            }
            control.setAttribute('aria-labelledby', label.id);
            label.addEventListener('click', () => field.focus());
            return;
        }
        if (!control.id) {
            control.id = Attributes.uid('ful-control');
        }
        label.setAttribute('for', control.id);
    }
    /**
     * Whether the field's own chrome should act on a gesture. Badges, dropzones,
     * menus and labels are not form controls, so the platform does not disable
     * them: every handler on them asks this first. False while the host matches
     * `:disabled`, which covers a disabled `<fieldset>` ancestry as well as the
     * claim, or while the readonly claim holds.
     * @returns {boolean}
     */
    _interactive() {
        return !this.matches(':disabled') && !this.readonly;
    }
    /**
     * The field's value, `null` when empty. Every concrete field overrides the
     * pair with its own semantics; the form extraction, `values =` assignment,
     * the `change` detail and `formResetCallback` all go through it. The base
     * pair reads `undefined` and ignores writes.
     * @type {any}
     */
    get value() {
        return undefined;
    }
    set value(v) {}
    /**
     * Restores the declared value on a form reset, as a native control restores
     * its markup default: the current `value` attribute is decoded with the
     * element's own mapper and written through the `value` setter. A field whose
     * value is not attribute backed overrides this.
     */
    formResetCallback() {
        this.value = this.unmarshal('value', this.getAttribute('value'));
    }
    /**
     * The field's own disabled claim, which follows a native form control:
     *
     * - the `disabled` attribute on the host is the claim. Only the author writes
     *   or removes it, in markup or through this property; the library never
     *   claims on a form's or fieldset's behalf. A field declared disabled inside
     *   a disabled `<fieldset>` stays disabled when the fieldset is re-enabled.
     * - the effective state is the claim or a disabled `<fieldset>` ancestry:
     *   `:disabled` matches both, and a disabled field is left out of the
     *   submitted values.
     * - the property reads the claim only: a field disabled by its ancestry reads
     *   `false` while `matches(':disabled')` is true. Removing the claim inside a
     *   disabled fieldset does not enable the field.
     * - writing it sets or removes the `disabled` attribute on the `claims`
     *   piece (the control by default) and on every `also` control. The
     *   ancestry is never written anywhere: the browser disables those controls
     *   as descendants of the fieldset. A subclass setter calls super, then
     *   reaches any further controls of its own.
     * @type {boolean}
     */
    get disabled() {
        return this.hasAttribute('disabled');
    }
    set disabled(d) {
        this.reflectTo('disabled', d);
        for (const el of this.#mirrors()) {
            el.toggleAttribute('disabled', d);
        }
    }
    /**
     * The readonly claim, read from the host attribute. Writing it sets
     * `readOnly` on the `claims` piece (the control by default) and on every
     * `also` control, sets `aria-readonly` on the `announces` piece, and
     * reflects the attribute. A text control stays focusable and selectable
     * with only editing off. A field whose control has no usable native
     * `readOnly` names a `freeze` piece, whose clicks are cancelled while the
     * claim holds.
     * @type {boolean}
     */
    get readonly() {
        return this.hasAttribute('readonly');
    }
    set readonly(v) {
        for (const el of this.#mirrors()) {
            el.readOnly = v;
        }
        if (this.#announces) {
            Attributes.set(this.#announces, 'aria-readonly', v ? 'true' : null);
        }
        this.reflectTo('readonly', v);
    }
    /**
     * The required claim, read from the host attribute. Writing it sets
     * `aria-required` on the `announces` piece and reflects the attribute; no
     * native `required` is set, since validation is the server's.
     * @type {boolean}
     */
    get required() {
        return this.hasAttribute('required');
    }
    set required(d) {
        if (this.#announces) {
            Attributes.set(this.#announces, 'aria-required', d ? 'true' : null);
        }
        this.reflectTo('required', d);
    }
    /**
     * Calls `_build(conf)` and wires the pieces it answers. When `_build`
     * returns a promise the pieces are wired once it settles; a field that
     * builds synchronously renders synchronously.
     * @param {{ slots: Record<string, DocumentFragment> | undefined }} conf
     * @returns {void | Promise<void>}
     */
    render(conf) {
        const built = /** @type {any} */ (this._build(conf));
        if (built instanceof Promise) {
            return built.then((pieces) => this.#wire(pieces));
        }
        this.#wire(built);
        return undefined;
    }
    /**
     * Builds the field's dom and answers the pieces the base drives, or a
     * promise of them. The one method a concrete field implements beside its
     * value pair, and the only place its dom is created. A subclass extending
     * another field's build spreads the pieces it answered and overrides the
     * keys it owns.
     *
     * - `fragment` (required) replaces the host's children.
     * - `control` (required) is the focus target of `focus()`. By default it also
     *   carries the description, `aria-invalid`, `aria-readonly`,
     *   `aria-required`, and the mirrored `disabled` and `readOnly`.
     * - `error` (required) is the live region `setCustomValidity` writes into.
     *   It is given an id (`ful-field-error-*`) when it has none and is always
     *   the last entry of the description.
     * - `label` names the control. For a labelable control (`button`, `input`
     *   other than hidden, `meter`, `output`, `progress`, `select`, `textarea`)
     *   the control is given an id when it has none and the label's `for`
     *   points at it, so a click on the label does what it does in a plain
     *   form. For any other control the label is given an id, the control's
     *   `aria-labelledby` points at it, and a click on the label calls `focus()`.
     * - `described` carries `aria-describedby` in place of the control: the
     *   host, for a field with no single control to describe.
     * - `claims` receives the mirrored `disabled` and `readOnly` in place of the
     *   control, for a wrapper such as a `<fieldset>` the field disables as a
     *   whole. Focus and the aria stay on the control.
     * - `announces` carries `aria-readonly`, `aria-required` and `aria-invalid`
     *   in place of the control: the host, where the widget role lives there.
     *   `null` for a field whose control has no role that accepts
     *   `aria-readonly` and `aria-required`; `aria-invalid` then goes on the
     *   control.
     * - `freeze` is for a field with no usable native `readOnly`: a capturing
     *   click listener on it cancels the default action of every click inside
     *   it while the readonly claim holds. It stays focusable and in the
     *   accessibility tree.
     * - `also` are further controls that mirror `disabled` and `readOnly`
     *   beside the claim target.
     * @param {{ slots: Record<string, DocumentFragment> | undefined }} conf
     * @returns {any} the pieces, or a promise of them
     * @throws {Error} when the subclass does not implement it
     */
    _build(conf) {
        throw new Error(`${this.constructor.name} must implement _build`);
    }
}

export { Field };
