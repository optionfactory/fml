import { ParsedElement } from '../../ftl/index.mjs';
import { Claims } from '../claims.mjs';
import { SectionRequests } from '../events/sections.mjs';
import { Failure } from '../../httpc/index.mjs';
import { wireTargets } from './targets.mjs';

/** A side panel drawer on the native dialog platform, update() owning its open-deliver cycle. */
class Drawer extends ParsedElement {
    static slots = true;
    static template = `
        <dialog data-ref="dialog" class="ful-drawer">
            <header>
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
    #loading;
    #error;
    #content;
    #requests = new SectionRequests();
    #updates = new Claims();
    render({ slots }) {
        const fragment = this.template()
            .withOverlay({ slots, title: this.getAttribute('title') ?? '' })
            .render();
        this.#dialog = fragment.querySelector('[data-ref=dialog]');
        this.#title = fragment.querySelector('[data-ref=title]');
        this.#loading = fragment.querySelector('[data-ref=loading]');
        this.#error = fragment.querySelector('[data-ref=error]');
        this.#content = fragment.querySelector('[data-ref=content]');
        const placement = this.getAttribute('placement');
        if (placement) {
            this.#dialog.setAttribute('placement', placement);
        }
        fragment.querySelector('[data-ref=close]').addEventListener('click', () => this.close());
        this.#dialog.addEventListener('close', () => {
            this.dispatchEvent(new CustomEvent('close'));
        });
        this.replaceChildren(fragment);
        wireTargets();
    }
    get title() {
        return this.#title.textContent;
    }
    set title(v) {
        this.#title.textContent = v ?? '';
    }
    /**
     * Opens the drawer under the given title and waits for the callback: a
     * resolved value paints the content section (which is returned), a
     * rejection paints the problems and travels to the caller, and an update
     * superseded by a newer one paints nothing.
     */
    async update(title, cb) {
        //the claim detaches any update still in flight: its outcome belongs to
        //an abandoned opening and must neither be painted nor own the drawer
        const claim = this.#updates.take();
        this.title = title;
        this.#content.replaceChildren();
        this.#restChrome();
        this.#loading.removeAttribute('hidden');
        this.#content.setAttribute('hidden', '');
        //update owns its own open-answer-deliver cycle, so it shows the dialog
        //without asking the section door: a user reopen during the wait is a
        //real open and goes through open()
        this.#show();
        try {
            const delivered = await cb();
            if (claim.stale) {
                return this.#content;
            }
            this.#content.replaceChildren(delivered);
            this.#loading.setAttribute('hidden', '');
            this.#content.removeAttribute('hidden');
            return this.#content;
        } catch (/** @type any */ e) {
            if (!claim.stale) {
                //revealed before it is filled, so the live region announces the
                //change rather than being revealed already holding it
                this.#error.removeAttribute('hidden');
                this.#error.textContent = Failure.problemsText(e);
                this.#loading.setAttribute('hidden', '');
                this.#content.setAttribute('hidden', '');
            }
            throw e;
        }
    }
    /**
     * Re-fires section:requested on the content, open or closed: the explicit
     * door for a body that wants refreshing. A failed refresh paints its
     * problems, nothing rejects — update() stays the rejecting door.
     */
    refresh() {
        return this.#requests.request(this, this.#content, null, null)?.then(undefined, () => undefined);
    }
    open() {
        if (!this.#show()) {
            return;
        }
        this.#restChrome();
        this.#requests.request(this, this.#content, null, null)?.catch(() => undefined);
    }
    close() {
        this.#dialog.close();
    }
    /** Shows the modal, answering whether this call is the one that opened it. */
    #show() {
        if (this.#dialog.open) {
            return false;
        }
        this.#dialog.showModal();
        return true;
    }
    #restChrome() {
        this.#error.replaceChildren();
        this.#error.setAttribute('hidden', '');
        this.#loading.setAttribute('hidden', '');
        this.#content.removeAttribute('hidden');
    }
}

export { Drawer };
