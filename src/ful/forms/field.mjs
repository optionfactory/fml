import { Attributes, ParsedElement } from '../../ftl/index.mjs';

/**
 * The base of every form-associated ful field: a form-associated custom element
 * carrying the validity protocol, the field error live region, focus delegation,
 * the label chrome and the disabled/readonly/required claim protocols. A
 * subclass owns its template, its value semantics and its change events, and
 * hands its rendered pieces over through _adopt/_wireLabel once its render
 * queried them. _adopt is the contract, not a courtesy: the claim setters,
 * the validity protocol and the aria wiring reach through the adopted pair,
 * so a field with no native control adopts a focusable piece of its chrome
 * or overrides the claim pairs itself (as ful-radio-group does). The getters
 * and focus() alone tolerate the not-yet-rendered element, where page code
 * may still read a claim or ask for the focus: the properties are the
 * post-render live door alone, as ParsedElement documents. The base
 * references no ful vocabulary, only what its subclasses pass it.
 */
class Field extends ParsedElement {
    static formAssociated = true;
    /**
     * The claim attributes and the value are observed here so every field,
     * including the custom ones, keeps them live after the upgrade: the
     * attribute is a third authoring door beside markup and the property,
     * exactly as a native input's. The value defaults to the string mapper and
     * every field with its own vocabulary overrides it (`value:bool`,
     * `value:csvm`, `value:json`).
     */
    static observed = ['value', 'disabled:presence', 'readonly:presence', 'required:presence'];
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
    /**
     * Clears or reports one validation problem: the text lands on the field's
     * live region and the state on the element internals, driving `:invalid`
     * styling. Validation is the server's: the submit travels regardless, and
     * the problems come back pinned here. The error mapping pins on the most
     * specific field name a problem's context reaches, handing over the
     * remaining path ('' on an exact match): the base ignores it, a composite
     * field owning a whole subtree overrides to route the problem to the inner
     * control it names.
     * @param {string} [error]
     * @param {string} [context] the path below this field's name, '' when exact
     */
    setCustomValidity(error, context) {
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
        const candidates = /** @type {NodeListOf<HTMLButtonElement|HTMLInputElement>} */ (
            form.querySelectorAll('button:not(:disabled), input:not(:disabled)')
        );
        form.requestSubmit([...candidates].find((el) => el.type === 'submit' && el.form === form));
    }
    /**
     * Dispatches the field's change event: bubbling, not cancelable, the value
     * in the detail. Every field announces through this one door; a field whose
     * announced value is not its own `value` (the select's labeled selection)
     * passes it explicitly.
     */
    _notifyChange(value = this.value) {
        this.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                cancelable: false,
                detail: { value },
            }),
        );
    }
    /**
     * Whether the field's chrome should answer a gesture. Badges, dropzones,
     * menus and labels are not form controls, so their handlers must ask the
     * effective state: matches(':disabled') covers the fieldset ancestry the
     * disabled property deliberately does not reflect, readonly the field's
     * own claim.
     */
    _interactive() {
        return !this.matches(':disabled') && !this.readonly;
    }
    /**
     * The field's value: every concrete field owns its semantics and overrides
     * this pair. The base pair exists so the form integration (the reset
     * protocol among others) has a member to write through; a custom field
     * forgetting its own keeps the base's inert one.
     * @type {any}
     */
    get value() {
        return undefined;
    }
    set value(v) {}
    /**
     * A reset restores the field's declared value, as a native control's reset
     * restores its markup default: the `value` attribute goes back through the
     * element's own mapper and value setter, so every field resets through its
     * own semantics. A field whose value is not attribute backed overrides this.
     */
    formResetCallback() {
        this.value = this.unmarshal('value', this.getAttribute('value'));
    }
    /**
     * The disabled protocol follows the semantics of a native form control:
     *
     * - the `disabled` attribute on the host is the field's own claim, and nothing
     *   but its author ever writes or removes it, in markup or through the
     *   property. The framework never claims on the form's behalf, so there is
     *   nothing to unclaim and nothing to lose: a field declared disabled inside
     *   a disabled `<fieldset>` stays disabled when the fieldset comes back,
     *   exactly like a native input keeps its attribute.
     * - the effective state is the claim OR a disabled fieldset ancestry, which
     *   the platform maintains on its own: `:disabled` matches both, a disabled
     *   field is left out of the submitted values, and the inner native controls
     *   are reached by the ancestry as descendants of the fieldset.
     * - the property reflects the claim only, like a native input's: a field
     *   disabled by its ancestry reads `false` while `matches(':disabled')`
     *   tells the effective state. Un-claiming inside a disabled fieldset
     *   cannot enable the field.
     * - the inner controls mirror the claim and nothing else: the ancestry state
     *   is never written anywhere, so it can never go stale, and the browser
     *   composes the two on its own when it disables and re-enables a fieldset's
     *   descendants. Subclass setters call super for the claim, then reach their
     *   own controls, which mirror the claim like a native input's would.
     *
     * Because of this, formDisabledCallback carries nothing the framework needs
     * to apply, and the protocol does not define it.
     */
    get disabled() {
        //the claim only, like a native input: the effective state, claim or disabled
        //ancestry, is what :disabled matches
        return this.hasAttribute('disabled');
    }
    set disabled(d) {
        //the claim belongs to the author alone, nothing else ever writes it: the
        //reflection guard keeps the attribute observer out of the property's own
        //write, as the readonly and required claims already do
        this.reflect(() => {
            this.toggleAttribute('disabled', d);
        });
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
            this.toggleAttribute('readonly', v);
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
            this.toggleAttribute('required', d);
        });
    }
}

export { Field };
