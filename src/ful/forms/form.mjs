import { Attributes, Localization, ParsedElement } from '../../ftl/index.mjs';
import { Failure } from '../../httpc/index.mjs';
import { Bindings } from './bindings.mjs';
import { AsyncEvents } from '../events/async.mjs';

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
 * Moves its children into a native `<form novalidate>`, extracts their values
 * on submit and hands them to a loader, reporting problems through `errors`.
 * Being `novalidate`, the form submits whatever the validity of its fields:
 * the browser does not block a submit on a field still marked invalid.
 *
 * Attributes on the host starting with `form-` are forwarded, without the
 * prefix, to the native form. `autocomplete` is copied onto the native form as
 * well and stays on the host, the fields reading it from either.
 * `clear-invalid-on-change` clears the custom validity of a field of this form
 * when a `change` event bubbles from it; the field's form is read from its
 * `form` property, or from `internals.form` for a form-associated element
 * that has none. `scroll-on-error` is passed to `Bindings.errors` as
 * `scrollOnError`.
 *
 * A native submit, by a button or by Enter in a field, is stopped and runs
 * `submit` instead.
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
    ];
    /** The native form holding the fields, created by the render. */
    form;
    /** Builds the native form and moves the element's children into it. */
    render() {
        const form = document.createElement('form');
        this.form = form;
        form.setAttribute('novalidate', '');
        Attributes.forward('form-', this, form);
        Attributes.set(form, 'autocomplete', this.declared('autocomplete'));
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
                if ((evt.target.form ?? evt.target.internals?.form) !== this.form) {
                    return;
                }
                evt.target.setCustomValidity?.('');
            });
        }
        this.replaceChildren(form);
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
     * 7. fires `submit:success` with `{ submitter, values, request, response }`,
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
     * @returns {Promise<void>} settling once the submit has finished, whatever its outcome
     */
    async submit(submitter) {
        if (this.#submitting) {
            return;
        }
        this.#submitting = true;
        this.spinner(true);
        let values;
        let request;
        try {
            const loader = this.component(this.declared('loader') ?? 'loaders:form').create(this);
            values = Bindings.extractFrom(this.form, submitter);
            request = await loader.prepare(values, this);
            const se = new CustomEvent('submit', {
                bubbles: true,
                cancelable: true,
                detail: { submitter, values, request },
            });
            if (!this.dispatchEvent(se)) {
                return;
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
            this.dispatchEvent(
                new CustomEvent('submit:success', {
                    bubbles: true,
                    cancelable: false,
                    detail: { submitter, values, request, response: mapped },
                }),
            );
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
        } finally {
            this.#submitting = false;
            this.spinner(false);
        }
    }
    /** Resets the native form, each field returning to its default value. */
    reset() {
        this.form.reset();
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
