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
    #claims;
    #freeze;
    #also = [];
    constructor() {
        super();
        this.internals = this.attachInternals();
        this.internals.role = /** @type {typeof Field} */ (this.constructor).ROLE;
    }
    /** every element the claims mirror onto: the claim target, then the extra controls */
    #mirrors() {
        return [this.#claims ?? this.#control, ...this.#also].filter((el) => el);
    }
    /**
     * Takes what the build produced: keeps the pieces the base drives, wires the
     * aria and the label, and mounts the fragment.
     * @param {{fragment: any, control: any, error?: any, label?: any, described?: any,
     *          claims?: any, freeze?: any, also?: any[]}} pieces
     */
    #wire({ fragment, control, error, label = null, described = null, claims = null, freeze = null, also = [] }) {
        this.#control = control;
        this.#fieldError = error;
        this.#claims = claims;
        this.#freeze = freeze;
        this.#also = also;
        //the error region describes the control, or the host where there is no
        //single control to describe (a radio group's legend names its fieldset)
        if (error) {
            (described ?? control).ariaDescribedByElements = [error];
        }
        if (label) {
            control.ariaLabelledByElements = [label];
            //a label that does not natively target the control still focuses it
            label.addEventListener('click', () => this.focus());
        }
        this.replaceChildren(fragment);
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
     * in the detail. Every field announces through this one door, and the detail
     * always carries the field's own `value`, so a listener can rely on
     * `el.value === evt.detail.value` whatever the field is. A field with more to
     * say adds keys beside it; none can replace it.
     * @param {Record<string, any>} [extras]
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
        //the adopted pieces mirror the claim as a native input would: a disabled
        //fieldset ancestry is left to the browser, which reaches them as
        //descendants of the fieldset and re-enables them on its own
        for (const el of this.#mirrors()) {
            el.toggleAttribute('disabled', d);
        }
    }
    /**
     * A field is readonly through its control's native readOnly when it has one:
     * the control stays focusable and its text selectable, only editing is off.
     * Fields whose chrome must freeze too (popovers, buttons, label clicks)
     * override both accessors and inert their container instead, and the claim
     * reflects on the host either way.
     */
    get readonly() {
        if (this.#freeze) {
            return this.#freeze.inert;
        }
        return this.#control?.readOnly ?? false;
    }
    set readonly(v) {
        for (const el of this.#mirrors()) {
            el.readOnly = v;
        }
        if (this.#freeze) {
            this.#freeze.inert = v;
        }
        this.reflect(() => {
            this.toggleAttribute('readonly', v);
        });
    }
    /**
     * A field is required through aria: the claim reflects on the host, the
     * announcement lives on the adopted control.
     */
    get required() {
        return (this.#claims ?? this.#control)?.getAttribute('aria-required') === 'true';
    }
    set required(d) {
        Attributes.set(this.#claims ?? this.#control, 'aria-required', d ? 'true' : null);
        this.reflect(() => {
            this.toggleAttribute('required', d);
        });
    }
    /**
     * The field's render is the base's: the subclass builds its dom in `_build`
     * and hands back what it built, the base wiring the pieces, mounting the
     * fragment and applying the declared state. Nothing in the base is there to
     * be called from a subclass's build. `_build` may be async (a select
     * awaiting its prefetch); a field that builds synchronously stays so.
     */
    render(conf) {
        const built = /** @type {any} */ (this._build(conf));
        if (built instanceof Promise) {
            return built.then((pieces) => this.#settle(pieces, conf));
        }
        this.#settle(built, conf);
        return undefined;
    }
    #settle(pieces, conf) {
        this.#wire(pieces);
        this.#applyObserved(conf.observed);
    }
    /**
     * Builds the field's dom and answers the pieces the base drives. The one
     * method a concrete field implements beside its value pair, and the only
     * place its dom is created; the base does the wiring and the mounting.
     *
     * - `fragment` is mounted on the host
     * - `control` is the focusable target: focus, the aria and, by default, all
     *   three claims reach it
     * - `error` is the field's live region
     * - `label`, when given, names the control and focuses it on click
     * - `described` moves the error's description off the control and onto
     *   another element, the host where no single control can carry it
     * - `claims` moves the three claims onto a wrapper the field disables as a
     *   whole, leaving focus and aria on the control
     * - `freeze` is for a field with no usable native readOnly: the readonly
     *   claim inerts it as well, and answers the getter from it
     * - `also` are further controls mirroring disabled and readOnly beside the
     *   first
     *
     * A subclass extending another field's build spreads the pieces it answered
     * and overrides the keys it owns.
     * @param {{slots: any, observed: Record<string, any>}} conf
     * @returns {any}
     */
    _build(conf) {
        throw new Error(`${this.constructor.name} must implement _build`);
    }
    /**
     * The declared state reaches the properties in declaration order, which the
     * registry composes base first, so the claims land before a subclass's own
     * attributes. `value` is applied last whatever its position: every value
     * setter reads the rest (a select's `itemlist`, a file field's `accept`, a
     * date's `step`), and the base declares it first so a custom field inherits
     * the door.
     * @param {Record<string, any>} observed
     */
    #applyObserved(observed) {
        for (const [name, value] of Object.entries(observed)) {
            if (name === 'value') {
                continue;
            }
            this[name] = value;
        }
        this.value = observed.value;
    }
}

export { Field };
