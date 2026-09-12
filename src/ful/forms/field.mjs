import { Attributes, ParsedElement } from '../../ftl/index.mjs';

/**
 * The base of every form-associated ful field: a form-associated custom element
 * carrying the validity protocol, the field error live region, focus
 * delegation, the label chrome and the disabled, readonly and required claims.
 *
 * A subclass owns its template, its value semantics and its change events. It
 * implements `_build(conf)`, which builds its dom and returns the pieces the
 * base drives: the control, the error region, the label, and the optional
 * `claims`, `announces`, `freeze` and `also`. The base does the wiring,
 * the mounting and the application of the declared state. Nothing in the base
 * is there to be called from a subclass's build.
 *
 * The pieces are the contract: the claim setters, the validity protocol and
 * the aria wiring all act on them, so a field with no native control returns a
 * focusable piece of its own chrome as the control. The getters and `focus()`
 * are the only members that tolerate a not-yet-rendered element, where page
 * code may read a claim or ask for the focus before the upgrade; the
 * properties go live only after the render, as ParsedElement documents. The
 * base references no ful vocabulary, only what its subclasses return to it.
 */
class Field extends ParsedElement {
    static formAssociated = true;
    /**
     * The claim attributes and the value are observed here so every field,
     * including the custom ones, keeps them live after the upgrade: the
     * attribute is a third way to author a claim, beside the markup and the
     * property,
     * exactly as a native input's. The value defaults to the string mapper and
     * every field with its own vocabulary overrides it (`value:bool`,
     * `value:csvm`, `value:json`).
     */
    static observed = ['disabled:presence', 'readonly:presence', 'required:presence', 'value'];
    /** the role the element internals carry, 'presentation' unless the control is its own */
    static ROLE = 'presentation';
    /** the platform's window into form state: shared with subclasses by necessity */
    internals;
    #control;
    #fieldError;
    #claims;
    #announces;
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
            //a field with no usable native readOnly freezes by refusing the
            //gesture, not by inerting its subtree: inert takes the whole thing out
            //of the accessibility tree, so a readonly checkbox, radio group, filter
            //or file list was on screen and unreadable. Capturing, so it lands
            //before the control's own handlers and the platform's activation
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
        //the state rides the control the reader focuses, not only the element
        //internals: the host's role is presentation for most fields, so a
        //validity set there announces nothing where the caret actually is
        Attributes.set(this.#announces ?? this.#control, 'aria-invalid', error ? 'true' : null);
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
     * in the detail. Every field announces through this one method, and the detail
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
        //the claim belongs to the author alone, nothing else ever writes it
        this.reflectTo('disabled', d);
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
     * Fields whose chrome must freeze too (popovers, buttons, label clicks) name
     * a `freeze` piece instead, whose gestures the base refuses while the claim
     * holds; the claim reflects on the host either way.
     */
    get readonly() {
        //the host attribute is the claim, as it is for disabled: every setter
        //reflects it, so one read answers however the field freezes
        return this.hasAttribute('readonly');
    }
    set readonly(v) {
        for (const el of this.#mirrors()) {
            el.readOnly = v;
        }
        //announced on the element whose role accepts it, not on whatever the
        //claims happen to ride: aria-readonly on a fieldset is dropped as invalid
        if (this.#announces) {
            Attributes.set(this.#announces, 'aria-readonly', v ? 'true' : null);
        }
        this.reflectTo('readonly', v);
    }
    /**
     * A field is required through aria: the claim reflects on the host, the
     * announcement lives on the adopted control.
     */
    get required() {
        //the claim, like disabled and readonly: the host attribute rather than
        //the projection, which a field with no role to announce on never carries
        return this.hasAttribute('required');
    }
    set required(d) {
        if (this.#announces) {
            Attributes.set(this.#announces, 'aria-required', d ? 'true' : null);
        }
        this.reflectTo('required', d);
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
            return built.then((pieces) => this.#settle(pieces));
        }
        this.#settle(built);
        return undefined;
    }
    #settle(pieces) {
        this.#wire(pieces);
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
     * - `announces` is the element whose role carries `aria-readonly` and
     *   `aria-required`, the host where the widget role lives there; `null` for a
     *   field whose control has no role that accepts them
     * - `freeze` is for a field with no usable native readOnly: the readonly
     *   claim refuses the gestures inside it, leaving it focusable and readable
     * - `also` are further controls mirroring disabled and readOnly beside the
     *   first
     *
     * A subclass extending another field's build spreads the pieces it answered
     * and overrides the keys it owns.
     * @param {{slots: any}} conf
     * @returns {any}
     */
    _build(conf) {
        throw new Error(`${this.constructor.name} must implement _build`);
    }
}

export { Field };
