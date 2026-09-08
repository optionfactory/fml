import { ParsedElement } from '../../ftl/index.mjs';
import { wireTargets } from './info.mjs';

class Drawer extends ParsedElement {
    static slots = true;
    static template = `
        <dialog data-ref="dialog" class="ful-drawer">
            <header>
                <h2 data-ref="title">{{ title }}</h2>
                <button type="button" data-ref="close" data-tpl-aria-label="#l10n:t('drawer.close')"><ful-icon name="x-lg" aria-hidden="true"></ful-icon></button>
            </header>
            <section data-ref="loading" hidden><ful-spinner class="centered"></ful-spinner></section>
            <section data-ref="error" role="alert" hidden></section>
            <section data-ref="content">{{{{ slots.default }}}}</section>
        </dialog>
    `;
    #dialog;
    #title;
    #loading;
    #error;
    #content;
    render({ slots }) {
        const fragment = this.template().withOverlay({ slots, title: this.getAttribute('title') ?? '' }).render();
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
        this.replaceChildren(fragment);
        wireTargets();
    }
    get title() {
        return this.#title.textContent;
    }
    set title(v) {
        this.#title.textContent = v ?? '';
    }
    async update(title, cb) {
        this.title = title;
        this.#error.replaceChildren();
        this.#content.replaceChildren();
        this.#loading.removeAttribute('hidden');
        this.#content.setAttribute('hidden', '');
        this.#error.setAttribute('hidden', '');
        this.open();
        try {
            const delivered = await cb();
            this.#content.replaceChildren(delivered);
            this.#loading.setAttribute('hidden', '');
            this.#content.removeAttribute('hidden');
            return this.#content;
        } catch (/** @type any */ e) {
            this.#error.textContent = e?.problems ? e.problems.map((p) => `${p.reason}`).join('\n') : `${e?.message ?? e}`;
            this.#error.removeAttribute('hidden');
            this.#loading.setAttribute('hidden', '');
            this.#content.setAttribute('hidden', '');
            throw e;
        }
    }
    open() {
        if (!this.#dialog.open) {
            this.#dialog.showModal();
        }
    }
    close() {
        this.#dialog.close();
    }
}

export { Drawer };
