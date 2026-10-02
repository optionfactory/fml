import { Attributes, ParsedElement } from '../../ftl/index.mjs';
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
 * go through `close()`, once a cancelable, non-bubbling `drawer:dismiss` with
 * `detail: { reason }` (`button`, `backdrop` or `escape`) has been dispatched
 * on the element and no listener prevented it: `preventDefault()` keeps the
 * drawer open, to guard unsaved edits. `close()` and `close-on-submit`
 * dispatch none. The platform lets a page refuse Escape once per user
 * interaction: a second Escape with no click or keystroke in between closes
 * the drawer at once, without the slide, and its `drawer:dismiss` is then not
 * cancelable. Every close dispatches a non-bubbling `close` event on
 * the element with `detail: { dismissed, response }`: `{ dismissed: false,
 * response }` when a form closed it under `close-on-submit`, and
 * `{ dismissed: true, response: null }` for any other close.
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
    static attributes = ['header', 'placement', 'close-on-submit:presence'];
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
    /** @type {{ dismissed: boolean, response: any }|null} */
    #answer = null;
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
        const dismiss = (/** @type {'button'|'backdrop'|'escape'} */ reason, platformCloses = false) =>
            this.#sections.dismiss(
                new CustomEvent('drawer:dismiss', { cancelable: !platformCloses, detail: { reason } }),
                () => this.close(),
            );
        /** @type {HTMLElement} */ (fragment.querySelector('[data-ref=close]')).addEventListener('click', () =>
            dismiss('button'),
        );
        this.#sections.onBackdrop(() => dismiss('backdrop'));
        this.#dialog.addEventListener('cancel', (e) => {
            if (!e.cancelable) {
                this.#stopSlidingOut();
                dismiss('escape', true);
                return;
            }
            e.preventDefault();
            dismiss('escape');
        });
        this.#dialog.addEventListener('close', () => {
            this.dispatchEvent(
                new CustomEvent('close', { detail: this.#answer ?? { dismissed: true, response: null } }),
            );
        });
        if (this.declared('close-on-submit')) {
            this.#sections.onSubmitted((response) => {
                this.#answer = { dismissed: false, response };
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
    /**
     * Shows the drawer as a modal. On a drawer already open nothing happens,
     * except that one sliding out stops and stays open.
     *
     * The call that opens the drawer resets the outcome of the previous
     * opening, hides the error and loading sections, and dispatches
     * `section:requested` on the element (bubbling, with
     * `detail: { section, first, name: null, index: null }`, `section` being
     * the content section and `first` true only on the first answered request),
     * so a listener can fill the content. A failed request is painted into the
     * content section.
     */
    open() {
        if (!this.#show()) {
            return;
        }
        this.#sections.restChrome();
        this.#sections.request();
    }
    /**
     * Slides the drawer out and closes it when the animation ends, setting the
     * `closing` attribute on the native dialog meanwhile; the `close` event is
     * dispatched then, after this call has returned. Where the user prefers
     * reduced motion, or no animation runs, it closes at once. Does nothing on
     * a drawer that is closed or already sliding out.
     */
    close() {
        if (this.#closing || !this.#dialog.open) {
            return;
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
