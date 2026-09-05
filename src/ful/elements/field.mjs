import { Attributes, ParsedElement } from '../../ftl/index.mjs';

/**
 * The base of every form-associated ful field: a form-associated custom element
 * carrying the validity protocol, the field error live region, focus delegation,
 * the label chrome and the disabled/readonly/required claim protocols. A
 * subclass owns its template, its value semantics and its change events, and
 * hands its rendered pieces over through _adopt/_wireLabel once its render
 * queried them. The base references no ful vocabulary, only what its
 * subclasses pass it.
 */
class Field extends ParsedElement {
    static formAssociated = true;
    /** the role the element internals carry, 'presentation' unless the control is its own */
    static ROLE = 'presentation';
    /** the platform's window into form state: shared with subclasses by necessity */
    internals;
    #control;
    #fieldError;
    constructor() {
        super();
        this.internals = this.attachInternals();
        this.internals.role = /** @type {typeof Field} */ (this.constructor).ROLE;
    }
    /**
     * Hands the native control everything delegates to, and the error live
     * region, to the base. One way: a subclass needing them keeps its own
     * refs, these copies only power the base behavior.
     */
    _adopt(control, fieldError) {
        this.#control = control;
        this.#fieldError = fieldError;
    }
    /** The label names the control, the error region describes it. */
    _wireLabel(label) {
        label.addEventListener('click', () => this.focus());
        this._wireA11y(label);
    }
    /** The aria wiring alone, for fields whose label click does more than focus. */
    _wireA11y(label) {
        this.#control.ariaDescribedByElements = [this.#fieldError];
        this.#control.ariaLabelledByElements = [label];
    }
    focus(options) {
        this.#control?.focus(options);
    }
    /** Clears or reports one validation problem, keeping the form's submit gate in sync. */
    setCustomValidity(error) {
        if (!error) {
            this.internals.setValidity({});
            this.#fieldError.innerText = '';
            return;
        }
        this.internals.setValidity({ customError: true }, ' ');
        this.#fieldError.innerText = error;
    }
    /** Submits the associated form through its first submitter, as Enter on a native control would. */
    _requestSubmit() {
        const form = this.internals.form;
        if (!form) {
            return;
        }
        const candidates = /** @type [HTMLButtonElement|HTMLInputElement] */ (
            form.querySelectorAll('button:not(:disabled), input:not(:disabled)')
        );
        form.requestSubmit([...candidates].find((el) => el.type === 'submit'));
    }
    /**
     * The disabled protocol follows native semantics: the attribute is the field's own
     * claim, and nothing but its author ever writes it, in markup or through the
     * property. The effective state is the claim OR a disabled fieldset ancestry,
     * which the platform maintains on its own: `:disabled` matches both, a disabled
     * field is left out of the submitted values, and the browser composes claim and
     * ancestry when it disables and re-enables a fieldset's descendants.
     * Subclass setters call super for the claim, then reach their own inner controls,
     * which mirror the claim like a native input's would.
     */
    get disabled() {
        //the claim only, like a native input: the effective state, claim or disabled
        //ancestry, is what :disabled matches
        return this.hasAttribute('disabled');
    }
    set disabled(d) {
        //the claim belongs to the author alone, nothing else ever writes it
        Attributes.toggle(this, 'disabled', d);
    }
    /**
     * A field is readonly through its control's native readOnly when it has one:
     * the control stays focusable and its text selectable, only editing is off.
     * Fields whose chrome must freeze too (popovers, buttons, label clicks)
     * override both accessors and inert their container instead, and the claim
     * reflects on the host either way.
     */
    get readonly() {
        return this.#control?.readOnly ?? false;
    }
    set readonly(v) {
        this.#control.readOnly = v;
        this.reflect(() => {
            Attributes.toggle(this, 'readonly', v);
        });
    }
    /**
     * A field is required through aria: the claim reflects on the host, the
     * announcement lives on the adopted control.
     */
    get required() {
        return this.#control?.getAttribute('aria-required') === 'true';
    }
    set required(d) {
        Attributes.set(this.#control, 'aria-required', d ? 'true' : null);
        this.reflect(() => {
            Attributes.toggle(this, 'required', d);
        });
    }
}

export { Field };
