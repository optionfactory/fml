import { Attributes, ParsedElement } from '../../ftl/index.mjs';
import { discardEdits } from './dialog.mjs';
import { DialogSections } from './dialog-sections.mjs';
import { wireTargets } from './targets.mjs';

/**
 * A side panel on the native `<dialog>`, shown as a modal: a header holding
 * the title and a localized close button, then loading, error and content
 * sections, the default slot being the content.
 *
 * The `header` attribute is the initial title, rendered as an `h2` that names
 * the panel through `aria-labelledby`. The `header` slot is rendered in the
 * header before the title and outside it, so setting the title as text does
 * not remove it. `placement` is copied onto the native dialog: `end` (the
 * default, when absent) or `start`, following the writing direction.
 *
 * The close button, Escape, and a press and release both on the backdrop all
 * go through `dismiss(reason)`, the reason being `button`, `backdrop` or
 * `escape`: before it closes the drawer, the element dispatches a cancelable,
 * non-bubbling `drawer:dismiss` with `detail: { reason }`, and a listener
 * calling `preventDefault()` keeps it open. Under `guard-dismiss`, a dismissal
 * nobody refused, while a `ful-form` of the drawer holds unsaved edits (see
 * `Form.dirty`), first asks the user, through `Dialog.confirm`, whether to
 * close and drop them. A `data-result` button, `close-on-submit`, `close()`
 * and `update()` are answers or the page deciding: they dispatch nothing and
 * ask nothing. The platform lets a page refuse Escape once per user
 * interaction: a second Escape with no click or keystroke in between closes
 * the drawer at once, without the slide, `guard-dismiss` included, and its
 * `drawer:dismiss` is then not cancelable.
 *
 * Any button inside the drawer carrying `data-result` closes it with that
 * result, an empty one being a dismissal. Every close dispatches a
 * non-bubbling `close` event on the element carrying the `DialogOutcome` as
 * `detail`, before the pending `ask()` calls resolve.
 *
 * `close-on-submit` closes the drawer when a `ful-form` that is a direct child
 * of the content section dispatches `submit:success`, carrying its
 * `detail.response`, which may be null. A form deeper in the content, such as
 * the filter form of a `ful-table`, does not close it. The listener sits on
 * the content section, so a form delivered by `update()` is covered as well.
 *
 * An element anywhere in the page carrying `dialog-target` set to the
 * element's id calls `open()` on click.
 */
class Drawer extends ParsedElement {
    static attributes = ['header', 'placement', 'close-on-submit:presence', 'guard-dismiss:presence'];
    static slots = true;
    static template = `
        <dialog data-ref="dialog" class="ful-drawer">
            <header>
                {{{{ slots.header }}}}
                <h2 data-ref="title">{{ title }}</h2>
                <button type="button" data-ref="close" data-tpl-aria-label="#l10n:t('drawer.close')"><ful-icon name="x-lg" aria-hidden="true"></ful-icon></button>
            </header>
            <section data-ref="loading" hidden><ful-spinner class="centered" role="status"><span class="ful-sr-only">{{ #l10n:t('spinner.loading') }}</span></ful-spinner></section>
            <section data-ref="error" role="alert" hidden></section>
            <section data-ref="content">{{{{ slots.default }}}}</section>
        </dialog>
    `;
    #dialog;
    #title;
    #sections;
    /** @type {{ dismissed: boolean, result: string|null, response: any }|null} */
    #answer = null;
    #resolvers = [];
    #closing = false;
    #slideOutEnded = (/** @type AnimationEvent */ e) => {
        if (e.target === this.#dialog) {
            this.#closeNow();
        }
    };
    /**
     * @param {{ slots: Record<string, DocumentFragment> }} c
     */
    render({ slots }) {
        const fragment = this.template()
            .withOverlay({ slots, title: this.declared('header') ?? '' })
            .render();
        this.#sections = new DialogSections(this, fragment, 'content');
        this.#dialog = this.#sections.dialog;
        this.#title = fragment.querySelector('[data-ref=title]');
        this.#title.id ||= Attributes.uid('ful-drawer-title');
        this.#dialog.setAttribute('aria-labelledby', this.#title.id);
        const placement = this.declared('placement');
        if (placement) {
            this.#dialog.setAttribute('placement', placement);
        }
        /** @type {HTMLElement} */ (fragment.querySelector('[data-ref=close]')).addEventListener('click', () =>
            this.dismiss('button'),
        );
        this.#sections.onBackdrop(() => this.dismiss('backdrop'));
        this.#dialog.addEventListener('cancel', (e) => {
            if (!e.cancelable) {
                this.#stopSlidingOut();
                this.#dismiss('escape', false);
                return;
            }
            e.preventDefault();
            this.dismiss('escape');
        });
        this.#dialog.addEventListener('click', (/** @type any */ e) => {
            const result = e.target.closest('button[data-result]')?.dataset.result;
            if (result !== undefined) {
                this.close(result);
            }
        });
        this.#dialog.addEventListener('close', () => {
            const outcome = this.#outcome();
            this.dispatchEvent(new CustomEvent('close', { detail: outcome }));
            this.#settle(outcome);
        });
        if (this.declared('close-on-submit')) {
            this.#sections.onSubmitted((response) => {
                this.#answer = { dismissed: false, result: null, response };
                this.close();
            });
        }
        this.replaceChildren(fragment);
        wireTargets();
    }
    /**
     * The title, read and written as the heading's text.
     * @type {string}
     */
    get header() {
        return this.#title.textContent;
    }
    /** @param {string|null|undefined} v written as text, `''` for null or undefined */
    set header(v) {
        this.#title.textContent = v ?? '';
    }
    /**
     * Sets the title, empties and hides the content section, shows the loading
     * section, opens the drawer if it is closed (putting back one that is
     * sliding out), and fills the content with what the callback resolves to.
     * A rejection is shown, as the problems' reasons, in the error section,
     * which has `role="alert"`, and the content is hidden.
     *
     * No `section:requested` is dispatched. When a newer `update()` starts
     * before the callback settles, this call paints nothing: it resolves with
     * the content section regardless, and still rejects with the callback's
     * error.
     * @param {string} header the title, set as text
     * @param {() => Node|string|Promise<Node|string>} cb producing the content
     * @returns {Promise<Element>} the content section, in the document
     * @throws {any} what the callback threw or rejected with
     */
    async update(header, cb) {
        this.header = header;
        return await this.#sections.update(cb, () => this.#show());
    }
    /**
     * Dispatches `section:requested` for the content again, as `open()` does,
     * whether the drawer is open or closed. A failed request is painted into
     * the content section.
     * @returns {Promise<any[]|undefined>} the listeners' answers, undefined when
     * nobody answered or the request failed; it never rejects
     */
    refresh() {
        return this.#sections.request();
    }
    /** @returns {{ dismissed: boolean, result: string|null, response: any }} */
    #outcome() {
        return this.#answer ?? { dismissed: true, result: null, response: null };
    }
    /** @param {{ dismissed: boolean, result: string|null, response: any }} outcome */
    #settle(outcome) {
        const resolvers = this.#resolvers;
        this.#resolvers = [];
        for (const resolve of resolvers) {
            resolve(outcome);
        }
    }
    /**
     * Resolves every pending `ask()` and `open()` with the outcome so far,
     * a dismissal for a drawer still open, so that no caller waits on a drawer
     * that left the document. The native dialog is not closed and no `close`
     * event is dispatched.
     */
    disconnectedCallback() {
        this.#settle(this.#outcome());
    }
    /**
     * The same as `ask()`.
     * @returns {Promise<{ dismissed: boolean, result: string|null, response: any }>}
     */
    open() {
        return this.ask();
    }
    /**
     * Shows the drawer as a modal and resolves with how it ends.
     *
     * The call that opens the drawer resets the outcome of the previous
     * opening, hides the error and loading sections, and dispatches
     * `section:requested` on the element (bubbling, with
     * `detail: { section, first, name: null, index: null }`, `section` being
     * the content section and `first` true only on the first answered request),
     * so a listener can fill the content. A failed request is painted into the
     * content section and does not reject. On a drawer already open nothing is
     * shown or requested, except that one sliding out stops and stays open, and
     * the call waits for the same ending as the calls before it, which is how
     * a caller learns the outcome of the opening an `update()` made.
     * @returns {Promise<{ dismissed: boolean, result: string|null, response: any }>} resolving on
     * close, or on removal from the document with a dismissal
     */
    ask() {
        if (this.#show()) {
            this.#sections.restChrome();
            this.#sections.request();
        }
        return new Promise((resolve) => {
            this.#resolvers.push(resolve);
        });
    }
    /**
     * Dismisses the drawer as the user would: dispatches the cancelable
     * `drawer:dismiss` with `detail: { reason }` and, under `guard-dismiss`,
     * asks before dropping unsaved edits, sliding the drawer out as a
     * dismissal unless either refused. Does nothing on a drawer that is closed
     * or already sliding out.
     * @param {string} reason why it is dismissed, such as `navigation`
     * @returns {Promise<boolean>} whether the drawer is closed or closing,
     * false when a listener or the user kept it open
     */
    dismiss(reason) {
        if (this.#closing || !this.#dialog.open) {
            return Promise.resolve(true);
        }
        return this.#dismiss(reason, true);
    }
    /**
     * @param {string} reason
     * @param {boolean} cancelable false for a close the platform makes anyway
     * @returns {Promise<boolean>}
     */
    #dismiss(reason, cancelable) {
        return this.#sections.dismiss(
            new CustomEvent('drawer:dismiss', { cancelable, detail: { reason } }),
            () => this.close(),
            this.declared('guard-dismiss') ? discardEdits : null,
        );
    }
    /**
     * Slides the drawer out and closes it when the animation ends, setting the
     * `closing` attribute on the native dialog meanwhile; the `close` event is
     * dispatched then, after this call has returned. Where the user prefers
     * reduced motion, or no animation runs, it closes at once. A non-empty
     * result answers as the button carrying that `data-result` would; no
     * result, or an empty one, is a dismissal. Does nothing on a drawer that is
     * closed or already sliding out.
     * @param {string} [result]
     */
    close(result) {
        if (this.#closing || !this.#dialog.open) {
            return;
        }
        if (result) {
            this.#answer = { dismissed: false, result, response: null };
        }
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            this.#dialog.close();
            return;
        }
        this.#dialog.setAttribute('closing', '');
        if (this.#dialog.getAnimations().length === 0) {
            this.#closeNow();
            return;
        }
        this.#closing = true;
        this.#dialog.addEventListener('animationend', this.#slideOutEnded);
    }
    #closeNow() {
        this.#stopSlidingOut();
        this.#dialog.close();
    }
    #stopSlidingOut() {
        this.#closing = false;
        this.#dialog.removeEventListener('animationend', this.#slideOutEnded);
        this.#dialog.removeAttribute('closing');
    }
    /** @returns {boolean} whether this call is the one that opened the modal */
    #show() {
        this.#stopSlidingOut();
        if (this.#dialog.open) {
            return false;
        }
        this.#answer = null;
        this.#dialog.showModal();
        return true;
    }
}

export { Drawer };
