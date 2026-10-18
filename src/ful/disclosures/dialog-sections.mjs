import { Localization, Nodes } from '../../ftl/index.mjs';
import { Claims } from '../claims.mjs';
import { SectionRequests } from '../events/sections.mjs';

/**
 * The sections a modal disclosure renders inside its native `<dialog>`: the
 * content section a caller fills, and the loading and error sections shown
 * while `update()` waits and when it fails. It also wires the gestures the
 * dialog and the drawer share: a dismissal on a press and release both on the
 * backdrop, and an answer on a `ful-form` submit in the content.
 *
 * The element owning it keeps the opening, the closing and the outcome; the
 * sections only paint and request.
 */
class DialogSections {
    #host;
    #dialog;
    #section;
    #loading;
    #error;
    #requests = new SectionRequests();
    #updates = new Claims();
    /** @type {Promise<boolean>|null} */
    #confirming = null;
    /**
     * @param {HTMLElement} host the element the section requests are dispatched on
     * @param {DocumentFragment} fragment the rendered template, holding a
     * `[data-ref=dialog]` and, optionally, the content section and the
     * `[data-ref=loading]` and `[data-ref=error]` sections: a subclass template
     * without a content section can be opened and closed, but not updated
     * @param {string} content the `data-ref` of the content section
     */
    constructor(host, fragment, content) {
        this.#host = host;
        this.#dialog = /** @type {HTMLDialogElement} */ (fragment.querySelector('[data-ref=dialog]'));
        this.#section = /** @type {HTMLElement} */ (fragment.querySelector(`[data-ref=${content}]`));
        this.#loading = fragment.querySelector('[data-ref=loading]');
        this.#error = fragment.querySelector('[data-ref=error]');
    }
    /** @returns {HTMLDialogElement} */
    get dialog() {
        return this.#dialog;
    }
    /** @returns {HTMLElement} the content section */
    get section() {
        return this.#section;
    }
    /**
     * Whether a `ful-form` of this dialog, not one of a dialog nested in it,
     * holds unsaved edits (see `Form.dirty`).
     * @returns {boolean}
     */
    get dirty() {
        return Array.from(this.#dialog.querySelectorAll('ful-form')).some(
            (form) => form.closest('dialog') === this.#dialog && /** @type {any} */ (form).dirty,
        );
    }
    /**
     * Dispatches the dismissal on the host and calls `close` unless a listener
     * prevented it or, with `confirm` given and the dialog `dirty`, `confirm`
     * answers false. A dismissal that is not cancelable announces a close the
     * platform makes whatever the page does, so nothing is asked and `close` is
     * not called for it. While `confirm` is pending a further dismissal waits
     * for the same answer, and a dialog closed meanwhile is not closed again.
     * @param {CustomEvent} asked
     * @param {() => void} close
     * @param {(() => Promise<boolean>)|null} confirm asks whether to drop the unsaved edits
     * @returns {Promise<boolean>} whether the dismissal closes the dialog
     */
    dismiss(asked, close, confirm) {
        if (this.#confirming) {
            return this.#confirming;
        }
        if (!this.#host.dispatchEvent(asked)) {
            return Promise.resolve(false);
        }
        if (!asked.cancelable) {
            return Promise.resolve(true);
        }
        if (!confirm || !this.dirty) {
            close();
            return Promise.resolve(true);
        }
        this.#confirming = confirm()
            .then((drop) => {
                if (drop && this.#dialog.open) {
                    close();
                }
                return drop;
            })
            .finally(() => {
                this.#confirming = null;
            });
        return this.#confirming;
    }
    /**
     * Calls `dismiss` when a press and its release both land on the backdrop,
     * so a selection dragged out of the panel and released outside does not.
     * @param {() => void} dismiss
     */
    onBackdrop(dismiss) {
        let pressedOutside = false;
        this.#dialog.addEventListener('mousedown', (e) => {
            pressedOutside = e.target === this.#dialog;
        });
        this.#dialog.addEventListener('click', (e) => {
            if (pressedOutside && e.target === this.#dialog) {
                dismiss();
            }
        });
    }
    /**
     * Calls `answer` with `detail.response` when a `ful-form` that is a direct
     * child of the content section dispatches `submit:success`. The listener sits
     * on the section, so a form delivered by `update()` is covered, and a form
     * deeper in the content, such as a `ful-table`'s filters, is not.
     * @param {(response: any) => void} answer
     */
    onSubmitted(answer) {
        this.#section.addEventListener('submit:success', (/** @type any */ e) => {
            if (e.target !== Nodes.queryChildren(this.#section, 'ful-form')) {
                return;
            }
            answer(e.detail.response);
        });
    }
    /** Hides and empties the error section, hides the loading one and shows the content. */
    restChrome() {
        this.#error?.replaceChildren();
        this.#error?.setAttribute('hidden', '');
        this.#loading?.setAttribute('hidden', '');
        this.#section?.removeAttribute('hidden');
    }
    /**
     * Dispatches `section:requested` for the content section on the host. A
     * failed request is painted into the section.
     * @returns {Promise<any[]|undefined>} the listeners' answers, undefined when
     * nobody answered or the request failed; it never rejects
     */
    request() {
        return this.#requests.request(this.#host, this.#section, null, null).catch(() => undefined);
    }
    /**
     * Empties and hides the content section, shows the loading section, calls
     * `show`, and fills the content with what the callback resolves to. A
     * rejection is shown, as the problems' reasons, in the error section, and
     * the content is hidden. When a newer `update()` starts before the callback
     * settles, this call paints nothing and resolves `null`, the section being
     * the newer call's; it still rejects with the callback's error.
     * @param {() => Node|string|Promise<Node|string>} cb producing the content
     * @param {() => void} show opens the dialog when it is closed
     * @returns {Promise<HTMLElement|null>} the content section, or `null` for a
     * call a newer one overtook
     * @throws {any} what the callback threw or rejected with
     */
    async update(cb, show) {
        const claim = this.#updates.take();
        this.#section.replaceChildren();
        this.restChrome();
        this.#loading?.removeAttribute('hidden');
        this.#section.setAttribute('hidden', '');
        show();
        try {
            const delivered = await cb();
            if (claim.stale) {
                return null;
            }
            this.#section.replaceChildren(delivered);
            this.#loading?.setAttribute('hidden', '');
            this.#section.removeAttribute('hidden');
            return this.#section;
        } catch (/** @type any */ e) {
            if (!claim.stale) {
                this.#error?.removeAttribute('hidden');
                if (this.#error) {
                    this.#error.textContent = Localization.of().failure(e);
                }
                this.#loading?.setAttribute('hidden', '');
                this.#section.setAttribute('hidden', '');
            }
            throw e;
        }
    }
}

export { DialogSections };
