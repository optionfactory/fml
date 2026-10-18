import { Attributes, Localization, ParsedElement, Rendering } from '../../ftl/index.mjs';
import { Failure } from '../../httpc/index.mjs';
import { Bindings } from './bindings.mjs';
import { AsyncEvents } from '../events/async.mjs';
import { PageLeave } from '../events/leave.mjs';

/** Sends a form's request as a json body to a url, mapping the request and the response through the configured mappers. */
class RemoteJsonFormLoader {
    #http;
    #url;
    #method;
    #requestMapper;
    #responseMapper;
    /**
     * @param {{ request(method: string, url: string): { json(body: any): { fetch(): Promise<any> } } }} http the `http-client` component
     * @param {string} url
     * @param {string} method
     * @param {(value: any, form: Form) => any} requestMapper
     * @param {(value: any, form: Form) => any} responseMapper
     */
    constructor(http, url, method, requestMapper, responseMapper) {
        this.#http = http;
        this.#url = url;
        this.#method = method;
        this.#requestMapper = requestMapper;
        this.#responseMapper = responseMapper;
    }
    /**
     * @param {any} values
     * @param {Form} form
     * @returns {any} what the request mapper returns
     */
    prepare(values, form) {
        return this.#requestMapper(values, form);
    }
    /**
     * @param {any} request
     * @param {Form} form
     * @returns {Promise<any>} what the client's `fetch()` resolves to: with the
     * library's client, the `Response` of a 2xx status, rejecting with an
     * `HttpClientError` (a `Failure`) otherwise
     */
    async submit(request, form) {
        return await this.#http.request(this.#method, this.#url).json(request).fetch();
    }
    /**
     * @param {any} response
     * @param {Form} form
     * @returns {any} what the response mapper returns
     */
    transform(response, form) {
        return this.#responseMapper(response, form);
    }
}

/** Submits a form without a request: the request mapper produces the result the response mapper then reads, for a form handled entirely on the page. */
class LocalFormLoader {
    #requestMapper;
    #responseMapper;
    /**
     * @param {(value: any, form: Form) => any} requestMapper
     * @param {(value: any, form: Form) => any} responseMapper
     */
    constructor(requestMapper, responseMapper) {
        this.#requestMapper = requestMapper;
        this.#responseMapper = responseMapper;
    }
    /**
     * @param {any} values
     * @param {Form} form
     * @returns {Promise<any>} what the request mapper returns or resolves to
     */
    async prepare(values, form) {
        return await this.#requestMapper(values, form);
    }
    /**
     * Sends nothing.
     * @param {any} request
     * @param {Form} form
     * @param {any} response what a `submit:requested` listener answered
     * @returns {Promise<any>} `response`, unchanged
     */
    async submit(request, form, response) {
        return response;
    }
    /**
     * @param {any} response
     * @param {Form} form
     * @returns {Promise<any>} what the response mapper returns or resolves to
     */
    async transform(response, form) {
        return await this.#responseMapper(response, form);
    }
}

/**
 * Builds the form's loader from its attributes: a local one when no action is
 * declared, a json post to it otherwise.
 *
 * A component registered under the `loader` attribute replaces this one and
 * must implement three methods, called in this order:
 *
 * - `prepare(values, form)` turns the extracted values into the request to send
 * - `submit(request, form, response)` performs it and returns the response. The
 *   third argument is whatever a `submit:requested` listener already answered,
 *   which is how a loader with nothing to send returns it unchanged
 * - `transform(response, form)` turns that response into the `response` of the
 *   `submit:success` detail
 *
 * A rejection from any of the three is reported as a `submit:failure`.
 */
class FormLoader {
    /**
     * The `request-mapper` and `response-mapper` attributes name registry
     * components called as `(value, form)`; each defaults to the identity. A
     * remote loader sends through the `http-client` component, with the
     * `method` attribute or `POST`.
     * @param {Form} el the form submitting
     * @param {unknown} [conf] not read
     * @returns {LocalFormLoader | RemoteJsonFormLoader}
     */
    static create(el, conf) {
        const http = el.component('http-client');
        const requestMapper = el.declared('request-mapper') ? el.component(el.declared('request-mapper')) : (v) => v;
        const responseMapper = el.declared('response-mapper') ? el.component(el.declared('response-mapper')) : (v) => v;
        const url = el.declared('action');
        if (!url) {
            return new LocalFormLoader(requestMapper, responseMapper);
        }
        const method = el.declared('method') ?? 'POST';
        return new RemoteJsonFormLoader(http, url, method, requestMapper, responseMapper);
    }
}

/**
 * The form owning an element: its `form` property, or `internals.form` for a
 * form-associated element that has none. An element no form can own answers
 * undefined, its internals, which every ParsedElement holds, throwing on a
 * read of `form` unless the element is form-associated.
 * @param {any} el
 * @returns {HTMLFormElement|null|undefined}
 */
const ownerOf = (el) =>
    el.form !== undefined ? el.form : el.constructor?.formAssociated ? el.internals?.form : undefined;

/**
 * Moves its children into a native `<form novalidate>`, extracts their values
 * on submit and hands them to a loader, reporting problems through `errors`.
 * Being `novalidate`, the form submits whatever the validity of its fields:
 * the browser does not block a submit on a field still marked invalid.
 *
 * Attributes on the host starting with `form-` are forwarded, without the
 * prefix, to the native form. `autocomplete` is copied onto the native form as
 * well and stays on the host, the fields reading it from either; a
 * `form-autocomplete` has the last word on the native form.
 * `clear-invalid-on-change` clears the custom validity of a field of this form
 * when a `change` event bubbles from it; the field's form is read from its
 * `form` property, or from `internals.form` for a form-associated element
 * that has none. `scroll-on-error` is passed to `Bindings.errors` as
 * `scrollOnError`.
 *
 * A native submit, by a button or by Enter in a field, is stopped and runs
 * `submit` instead.
 *
 * `track-changes` keeps track of the edits not saved yet (see `dirty`), and
 * `guard-leave`, which implies it, asks before the page is left while there
 * are any.
 */
class Form extends ParsedElement {
    /** Read once at the upgrade: changing one afterwards has no effect. */
    static attributes = [
        'action',
        'method',
        'loader',
        'request-mapper',
        'response-mapper',
        'clear-invalid-on-change:presence',
        'scroll-on-error:presence',
        'autocomplete',
        'track-changes:presence',
        'guard-leave:presence',
    ];
    /** The native form holding the fields, created by the render. */
    form;
    /** Builds the native form and moves the element's children into it. */
    render() {
        const form = document.createElement('form');
        this.form = form;
        form.setAttribute('novalidate', '');
        Attributes.set(form, 'autocomplete', this.declared('autocomplete'));
        Attributes.forward('form-', this, form);
        form.replaceChildren(...this.childNodes);
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await this.submit(e.submitter ?? undefined);
        });
        this.addEventListener(
            'click',
            (evt) => {
                const target = /** @type Element */ (evt.target);
                if (!target.closest?.('[aria-disabled="true"]')) {
                    return;
                }
                evt.preventDefault();
                evt.stopImmediatePropagation();
            },
            true,
        );
        if (this.declared('clear-invalid-on-change')) {
            this.addEventListener('change', (/** @type any */ evt) => {
                if (ownerOf(evt.target) !== this.form) {
                    return;
                }
                evt.target.setCustomValidity?.('');
            });
        }
        this.replaceChildren(form);
        this.#tracking = this.declared('track-changes') || this.declared('guard-leave');
        if (!this.#tracking) {
            return;
        }
        this.addEventListener('input', (evt) => this.#touch(evt.target));
        this.addEventListener('change', (evt) => this.#touch(evt.target));
        this.addEventListener('focusin', (evt) => this.#focus(evt.target));
        Rendering.waitForChildren(this)
            .catch(() => undefined)
            .then(() => this.commit());
        this.#guard();
    }
    connectedCallback() {
        super.connectedCallback();
        if (this.#tracking) {
            this.#guard();
        }
    }
    disconnectedCallback() {
        this.#leave?.abort();
        this.#leave = null;
    }
    #submitting = false;
    /**
     * Runs the submit pipeline, with the spinner up for its whole length:
     *
     * 1. builds the loader: the component the `loader` attribute names
     *    (`loaders:form` by default), called as `create(form)`
     * 2. extracts the values with `Bindings.extractFrom` and has the loader
     *    `prepare` them into the request
     * 3. fires a cancelable `submit` with `{ submitter, values, request }`.
     *    Cancelling it ends the submit there, reporting nothing and leaving the
     *    problems shown; a listener may replace `values` or `request` on the detail
     * 4. clears the problems shown
     * 5. fires `submit:requested` through `AsyncEvents.fireAsync` in `pipeline`
     *    mode: at most one async listener, whose answer is handed to the
     *    loader's `submit` as its third argument. A listener may replace
     *    `request` on the detail
     * 6. has the loader `submit` the request and `transform` the response
     * 7. under `track-changes`, commits the values extracted at step 2 (see
     *    `commit`): an edit made while the submit was in flight stays unsaved
     * 8. fires `submit:success` with `{ submitter, values, request, response }`,
     *    `response` being the transformed one
     *
     * Anything thrown from step 1 on, a missing loader or a throwing mapper
     * included, fires `submit:failure` with `{ submitter, values, request,
     * exception }` instead; the returned promise does not reject. A `Failure`
     * has its problems shown through `errors`, anything else is logged with
     * `console.warn`. The `values` of both outcome events are the extracted
     * ones, not a replacement a `submit` listener put on its detail.
     *
     * A call while a submit is in flight returns at once, doing nothing.
     * @param {HTMLElement} [submitter] the button that submitted, if any; it is
     * the only button whose name and value are submitted
     * @returns {Promise<boolean>} settling once the submit has finished: true
     * after `submit:success`, false when it failed, was cancelled or was dropped
     * for one in flight
     */
    async submit(submitter) {
        if (this.#submitting) {
            return false;
        }
        this.#submitting = true;
        this.spinner(true);
        let values;
        let request;
        try {
            const loader = this.component(this.declared('loader') ?? 'loaders:form').create(this);
            values = Bindings.extractFrom(this.form, submitter);
            const submitted = this.#tracking ? { saved: this.#snapshot(), upTo: this.#sequence } : null;
            request = await loader.prepare(values, this);
            const se = new CustomEvent('submit', {
                bubbles: true,
                cancelable: true,
                detail: { submitter, values, request },
            });
            if (!this.dispatchEvent(se)) {
                return false;
            }
            this.errors = [];
            const sre = new CustomEvent('submit:requested', {
                bubbles: true,
                cancelable: false,
                detail: { submitter, values: se.detail.values, request: se.detail.request },
            });
            let response = await AsyncEvents.fireAsync(this, sre, { mode: 'pipeline' });
            request = sre.detail.request;

            response = await loader.submit(request, this, response);
            const mapped = await loader.transform(response, this);
            if (submitted) {
                this.#commitFrom(submitted.saved, submitted.upTo);
            }
            this.dispatchEvent(
                new CustomEvent('submit:success', {
                    bubbles: true,
                    cancelable: false,
                    detail: { submitter, values, request, response: mapped },
                }),
            );
            return true;
        } catch (e) {
            this.dispatchEvent(
                new CustomEvent('submit:failure', {
                    bubbles: true,
                    cancelable: false,
                    detail: { submitter, values, request, exception: e },
                }),
            );
            if (e instanceof Failure) {
                this.errors = e.problems;
            } else {
                console.warn('failed to submit form', this, 'reason:', e);
            }
            return false;
        } finally {
            this.#submitting = false;
            this.spinner(false);
        }
    }
    /**
     * Saves the unsaved edits, for a page action that would lose them, such as
     * one reloading the page: under `track-changes` it submits only while the
     * form is dirty, and without it always submits.
     * @param {HTMLElement} [submitter] as `submit` takes it
     * @returns {Promise<boolean>} whether no unsaved edit is left: false when
     * the submit did not succeed, or when the user edited the form while it
     * was in flight
     */
    async save(submitter) {
        if (this.#tracking && !this.dirty) {
            return true;
        }
        return (await this.submit(submitter)) && !this.dirty;
    }
    /**
     * Resets the native form, each field returning to its default value. Under
     * `track-changes` every control counts as edited: the form is dirty if the
     * defaults differ from what was last committed.
     */
    reset() {
        this.form.reset();
        if (!this.#tracking) {
            return;
        }
        for (const name of new Set([...this.#saved.keys(), ...this.#snapshot().keys()])) {
            this.#edits.set(name, ++this.#sequence);
        }
        this.#refresh();
    }
    /** name → the serialized values the last commit recorded */
    #saved = new Map();
    /** name → the serialized values when first focused, for a name the last commit did not see */
    #focused = new Map();
    /** name → the sequence number of its latest edit since the last commit */
    #edits = new Map();
    #sequence = 0;
    #wasDirty = false;
    #frame = 0;
    /** @type {AbortController|null} */
    #leave = null;
    #tracking = false;
    /**
     * Whether, under `track-changes`, a control the user edited since the last
     * commit holds a value other than the one committed. An edit is what the
     * controls report as one: an `input` or a `change` bubbling from a control
     * of this form (0019), so assigning `value`, a select's vocabulary dropping
     * a key or a section delivering its fields is not one, and an edit undone
     * is no longer dirty. A control the last commit did not see compares with
     * its value when it was first focused. Always false without
     * `track-changes`.
     *
     * While dirty, the host matches `:state(dirty)` and the submit buttons of
     * this form carry `data-ful-dirty`; a change of the state dispatches
     * `dirty:change` with `{ dirty }`. Both are refreshed at the next frame
     * after an edit, while the property is exact at any time.
     * @returns {boolean}
     */
    get dirty() {
        if (!this.#tracking) {
            return false;
        }
        for (const name of this.#edits.keys()) {
            const now = this.#valuesOf(name);
            if (!this.#saved.has(name) && now === '[]') {
                continue;
            }
            const was = this.#saved.get(name) ?? this.#focused.get(name);
            if (was !== now) {
                return true;
            }
        }
        return false;
    }
    /**
     * Records the values of the controls as saved, so that the form is no
     * longer dirty. A submit commits by itself on success, and the form
     * commits once its fields have rendered: a page calls this for a save of
     * its own, or after writing the values it loaded. Does nothing without
     * `track-changes`.
     */
    commit() {
        if (this.#tracking) {
            this.#commitFrom(this.#snapshot(), this.#sequence);
        }
    }
    /**
     * Counts controls as edited by the user, for values the page writes on
     * the user's behalf: assigning `value` reports nothing, as 0019 wants.
     * @param {...Element} els each a control, or an element inside one
     */
    edited(...els) {
        for (const el of els) {
            this.#touch(el);
        }
    }
    /**
     * @param {Map<string, string>} saved
     * @param {number} upTo the sequence number of the latest edit the values include
     */
    #commitFrom(saved, upTo) {
        this.#saved = saved;
        for (const [name, sequence] of this.#edits) {
            if (sequence <= upTo) {
                this.#edits.delete(name);
            }
        }
        for (const name of this.#focused.keys()) {
            if (saved.has(name)) {
                this.#focused.delete(name);
            }
        }
        this.#refresh();
    }
    /**
     * The named control of this form `target` is or sits in, if any: a field's
     * inner control is unnamed or carries `form=""`, a control of a form nested
     * in this one, like a table's filters, belongs to that form, and a
     * form-associated element with no `form` property answers its owner
     * through `internals.form`.
     * @param {any} target
     * @returns {string|null} its name
     */
    #nameOf(target) {
        for (let el = target; el && el !== this; el = el.parentElement) {
            if (ownerOf(el) === this.form && el.hasAttribute('name')) {
                return el.getAttribute('name');
            }
        }
        return null;
    }
    /** @param {EventTarget|null} target */
    #touch(target) {
        if (!this.#tracking) {
            return;
        }
        const name = this.#nameOf(target);
        if (name === null) {
            return;
        }
        this.#edits.set(name, ++this.#sequence);
        if (this.#frame === 0) {
            this.#frame = requestAnimationFrame(() => this.#refresh());
        }
    }
    /** @param {EventTarget|null} target */
    #focus(target) {
        const name = this.#nameOf(target);
        if (name !== null && !this.#saved.has(name) && !this.#focused.has(name)) {
            this.#focused.set(name, this.#valuesOf(name));
        }
    }
    /**
     * The controls that contribute to the values, as `Bindings.extractFrom`
     * reads them, with no submitter.
     * @returns {any[]}
     */
    #contributing() {
        return Array.from(this.form.elements).filter(
            (el) =>
                el.hasAttribute('name') &&
                !['submit', 'reset', 'button'].includes(/** @type {any} */ (el).type) &&
                !el.matches(':disabled'),
        );
    }
    /** @returns {Map<string, string>} each name to its serialized values */
    #snapshot() {
        /** @type {Map<string, any[]>} */
        const values = new Map();
        for (const el of this.#contributing()) {
            const name = el.getAttribute('name');
            values.set(name, [...(values.get(name) ?? []), Bindings.extract(el)]);
        }
        return new Map(Array.from(values, ([name, vs]) => [name, JSON.stringify(vs)]));
    }
    /**
     * @param {string} name
     * @returns {string} the serialized values of the controls carrying it
     */
    #valuesOf(name) {
        return JSON.stringify(
            this.#contributing()
                .filter((el) => el.getAttribute('name') === name)
                .map((el) => Bindings.extract(el)),
        );
    }
    #refresh() {
        cancelAnimationFrame(this.#frame);
        this.#frame = 0;
        const dirty = this.dirty;
        this.querySelectorAll('button').forEach((el) => {
            const button = /** @type HTMLButtonElement */ (el);
            if (button.form === this.form && button.type === 'submit') {
                button.toggleAttribute('data-ful-dirty', dirty);
            }
        });
        if (dirty === this.#wasDirty) {
            return;
        }
        this.#wasDirty = dirty;
        if (dirty) {
            this.internals.states.add('dirty');
        } else {
            this.internals.states.delete('dirty');
        }
        this.dispatchEvent(
            new CustomEvent('dirty:change', {
                bubbles: true,
                cancelable: false,
                detail: { dirty },
            }),
        );
    }
    #guard() {
        if (!this.declared('guard-leave') || this.#leave) {
            return;
        }
        this.#leave = new AbortController();
        PageLeave.guard(() => this.dirty, this.#leave.signal);
    }
    #spinning = 0;
    /**
     * @param {HTMLElement} el
     */
    #announce(el) {
        Attributes.defaultValue(el, 'role', 'status');
        el.hidden = false;
        if (el.textContent.trim() !== '') {
            return;
        }
        const label = document.createElement('span');
        label.className = 'ful-sr-only';
        label.dataset.ref = 'spinner-label';
        el.append(label);
        label.textContent = Localization.of().t('spinner.loading');
    }
    /**
     * Marks the form busy or releases it. Calls nest: only the first
     * `spinner(true)` and the matching last `spinner(false)` act, so a caller's
     * own spin may wrap a submit.
     *
     * Busy, the host carries `aria-busy="true"` and each `ful-spinner` of this
     * form is revealed; one without text of its own is given `role="status"`
     * (unless it has a role) and a visually hidden localized `spinner.loading`
     * label. Each submit and reset button of this form is held off with
     * `aria-disabled="true"`, keeping its focus, and a click on it is refused
     * ahead of any listener on the button. Holding the buttons off does not
     * stop a programmatic `submit`.
     *
     * Released, the spinners are hidden and lose the label they were given, and
     * each held button gets back the `aria-disabled` it had. A button that
     * joined the form while it was busy keeps its own state.
     * @param {boolean} spin
     */
    spinner(spin) {
        if (spin) {
            ++this.#spinning;
            if (this.#spinning !== 1) {
                return;
            }
        } else {
            this.#spinning = Math.max(0, this.#spinning - 1);
            if (this.#spinning !== 0) {
                return;
            }
        }
        Attributes.set(this, 'aria-busy', spin ? 'true' : null);
        this.querySelectorAll('ful-spinner').forEach((el) => {
            if (el.closest('form') !== this.form) {
                return;
            }
            const hel = /** @type HTMLElement */ (el);
            if (spin) {
                this.#announce(hel);
                return;
            }
            hel.hidden = true;
            hel.querySelector(':scope > [data-ref=spinner-label]')?.remove();
        });
        this.querySelectorAll('input,button').forEach((el) => {
            const hel = /** @type HTMLButtonElement|HTMLInputElement */ (el);
            if (hel.form !== this.form || (hel.type !== 'submit' && hel.type !== 'reset')) {
                return;
            }
            if (spin) {
                hel.dataset.wd = hel.getAttribute('aria-disabled') ?? '';
                hel.setAttribute('aria-disabled', 'true');
            } else {
                if (hel.dataset.wd === undefined) {
                    return;
                }
                Attributes.set(hel, 'aria-disabled', hel.dataset.wd || null);
                delete hel.dataset.wd;
            }
        });
    }
    /**
     * Writes a nested object onto the fields of this form through
     * `Bindings.mutateIn`: fields the object does not name keep their values.
     * @param {{ [x: string]: any; }} vs
     */
    set values(vs) {
        Bindings.mutateIn(this.form, vs);
    }
    /**
     * The fields of this form read into a nested object by
     * `Bindings.extractFrom`, with no submitter, so no button contributes.
     * @returns {any}
     */
    get values() {
        return Bindings.extractFrom(this.form);
    }
    /**
     * Shows problems through `Bindings.errors`, replacing the ones shown
     * before: each is pinned to the field it names, and the rest go to the
     * form's `ful-errors` banners. An empty array clears them.
     * @param {{ type: string; context?: string | null; reason: string; }[]} es
     */
    set errors(es) {
        Bindings.errors(this.form, es, this.declared('scroll-on-error'));
    }
}

export { FormLoader, Form };
