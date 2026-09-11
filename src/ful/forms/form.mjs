import { Attributes, ParsedElement } from '../../ftl/index.mjs';
import { Failure } from '../../httpc/index.mjs';
import { Bindings } from './bindings.mjs';
import { AsyncEvents } from '../events/async.mjs';

class RemoteJsonFormLoader {
    #http;
    #url;
    #method;
    #requestMapper;
    #responseMapper;
    constructor(http, url, method, requestMapper, responseMapper) {
        this.#http = http;
        this.#url = url;
        this.#method = method;
        this.#requestMapper = requestMapper;
        this.#responseMapper = responseMapper;
    }
    prepare(values, form) {
        return this.#requestMapper(values, form);
    }
    async submit(values, form) {
        return await this.#http.request(this.#method, this.#url).json(values).fetch();
    }
    transform(response, form) {
        return this.#responseMapper(response, form);
    }
}

class LocalFormLoader {
    #requestMapper;
    #responseMapper;
    constructor(requestMapper, responseMapper) {
        this.#requestMapper = requestMapper;
        this.#responseMapper = responseMapper;
    }
    async prepare(values, form) {
        return await this.#requestMapper(values, form);
    }
    async submit(values, form, response) {
        return response;
    }
    async transform(response, form) {
        return await this.#responseMapper(response, form);
    }
}

/** Builds the form's loader from its attributes: a local one when no action is declared, a json post to it otherwise. */
class FormLoader {
    static create(el, conf) {
        const http = el.component('http-client');
        const requestMapper = el.hasAttribute('request-mapper')
            ? el.component(el.getAttribute('request-mapper'))
            : (v) => v;
        const responseMapper = el.hasAttribute('response-mapper')
            ? el.component(el.getAttribute('response-mapper'))
            : (v) => v;
        const url = el.getAttribute('action');
        if (!url) {
            return new LocalFormLoader(requestMapper, responseMapper);
        }
        const method = el.getAttribute('method') ?? 'POST';
        return new RemoteJsonFormLoader(http, url, method, requestMapper, responseMapper);
    }
}

/**
 * Wraps its fields in a native form, extracts their values on submit and hands
 * them to a loader (loaders:form, or the action url as a json post),
 * announcing failures through the errors setter.
 */
class Form extends ParsedElement {
    form;
    render() {
        const form = document.createElement('form');
        this.form = form;
        //the submit must travel regardless of validity: the server is the validation
        //authority, and the browser's own gate would block a resubmit behind
        //internals messages custom elements have no default UI for
        form.setAttribute('novalidate', '');
        Attributes.forward('form-', this, form);
        form.replaceChildren(...this.childNodes);
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await this.submit(e.submitter ?? undefined);
        });
        if (this.hasAttribute('clear-invalid-on-change')) {
            this.addEventListener('change', (/** @type any */ evt) => {
                evt.target.setCustomValidity?.('');
            });
        }
        this.replaceChildren(form);
    }
    #submitting = false;
    /**
     * Submits once: a submit while one is in flight is dropped before the
     * values are even extracted, so nothing fires and nothing travels; the
     * settled exchange re-arms the form. A write must not double behind a
     * second Enter or a programmatic call racing the first.
     * @param {HTMLElement} [submitter]
     * @returns
     */
    async submit(submitter) {
        if (this.#submitting) {
            return;
        }
        this.#submitting = true;
        this.spinner(true);
        //one try: building the loader and preparing the request are as much part of a
        //submit as sending it, and a mapper that throws is how a caller reports a
        //problem with the values
        let values;
        let request;
        try {
            const loader = this.component(this.getAttribute('loader') ?? 'loaders:form').create(this);
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
            }
            console.warn('failed to submit form', this, 'reason:', e);
        } finally {
            this.#submitting = false;
            this.spinner(false);
        }
    }
    /** The native reset, routing every field through its own value semantics. */
    reset() {
        this.form.reset();
    }
    #spinning = 0;
    /** Shows the spinners and disables the submit buttons, overlapping spins sharing one claim. */
    spinner(spin) {
        //spins can overlap (a caller's own spin may wrap a submit): only the
        //outermost one saves and restores the button states
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
        this.querySelectorAll('ful-spinner').forEach((el) => {
            const hel = /** @type HTMLElement */ (el);
            hel.hidden = !spin;
        });
        this.querySelectorAll('input,button').forEach((el) => {
            const hel = /** @type HTMLButtonElement|HTMLInputElement */ (el);
            if (hel.type !== 'submit' && hel.type !== 'reset') {
                return;
            }
            if (spin) {
                hel.dataset.wd = String(hel.disabled);
                hel.disabled = true;
            } else {
                //a button that joined mid-spin was never saved: its authored state stands
                if (hel.dataset.wd === undefined) {
                    return;
                }
                hel.disabled = hel.dataset.wd === 'true';
                delete hel.dataset.wd;
            }
        });
    }
    /** The values of the fields the form contains, extracted and filled back through Bindings. */
    set values(vs) {
        Bindings.mutateIn(this.form, vs);
    }
    get values() {
        return Bindings.extractFrom(this.form);
    }
    /** Pins problems to the fields they name, the banner taking the nameless ones. */
    set errors(es) {
        Bindings.errors(this.form, es, this.hasAttribute('scroll-on-error'));
    }
}

export { FormLoader, Form };
