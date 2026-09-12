import { ParsedElement } from '../../ftl/index.mjs';
import { SectionRequests } from '../events/sections.mjs';
import { wireAnchoredPopover } from './anchors.mjs';
import { wireTargets } from './targets.mjs';

/** An info icon button toggling a popover with a short explanation. */
class Tooltip extends ParsedElement {
    static slots = true;
    static attributes = ['placement'];
    static config = {
        icon: 'info-circle-fill',
    };
    static template = `
        <button type="button" class="ful-tip" data-ref="trigger" data-tpl-aria-label="#l10n:t('info.tooltip')"><ful-icon data-tpl-name="config.icon" aria-hidden="true"></ful-icon></button>
        <ful-note popover data-ref="content">{{{{ slots.default }}}}</ful-note>
    `;
    render({ slots }) {
        const fragment = this.template().withOverlay({ slots }).render();
        const trigger = fragment.querySelector('[data-ref=trigger]');
        const content = fragment.querySelector('[data-ref=content]');
        wireAnchoredPopover(trigger, content, { prefix: 'ful-tooltip', invoke: true, expanded: true });
        const placement = this.declared('placement');
        if (placement) {
            content.setAttribute('placement', placement);
        }
        this.replaceChildren(fragment);
    }
}

/** A modal dialog on the native platform, open()/ask() resolving with the closer's data-result. */
class Dialog extends ParsedElement {
    static attributes = ['header'];
    static slots = true;
    static template = `
        <dialog data-ref="dialog" class="ful-dialog">
            <header data-tpl-if="header"><h2>{{ header }}</h2></header>
            <div data-ref="body">{{{{ slots.default }}}}</div>
            <footer>
                <button type="button" data-ref="acknowledge" data-result="acknowledged" data-tpl-if="!slots.buttons" data-tpl-aria-label="#l10n:t('dialog.acknowledge')">{{ #l10n:t('dialog.acknowledge') }}</button>
                {{{{ slots.buttons }}}}
            </footer>
        </dialog>
    `;
    #dialog;
    #body;
    #requests = new SectionRequests();
    #resolvers = [];
    render({ slots }) {
        const fragment = this.template()
            .withOverlay({ slots, header: this.declared('header') ?? '' })
            .render();
        this.#dialog = fragment.querySelector('[data-ref=dialog]');
        this.#body = fragment.querySelector('[data-ref=body]');
        this.#dialog.addEventListener('close', () => {
            this.dispatchEvent(
                new CustomEvent('close', {
                    detail: { result: this.#dialog.returnValue === '' ? null : this.#dialog.returnValue },
                }),
            );
            this.#settle();
        });
        this.#dialog.addEventListener('click', (/** @type any */ e) => {
            const result = e.target.closest('button[data-result]')?.dataset.result;
            if (result !== undefined) {
                this.#dialog.close(result);
            }
        });
        this.replaceChildren(fragment);
        wireTargets();
    }
    //answers every waiter with the dialog's own answer: null while still open
    //or closed without a result, which is also the unanswered answer a dialog
    //leaving the document owes its waiters instead of hanging them
    #settle() {
        const resolvers = this.#resolvers;
        this.#resolvers = [];
        for (const resolve of resolvers) {
            resolve(this.#dialog.returnValue === '' ? null : this.#dialog.returnValue);
        }
    }
    disconnectedCallback() {
        this.#settle();
    }
    open() {
        return this.ask();
    }
    ask() {
        if (!this.#dialog.open) {
            this.#dialog.returnValue = '';
            this.#dialog.showModal();
            this.#request();
        }
        return new Promise((resolve) => {
            this.#resolvers.push(resolve);
        });
    }
    #request() {
        this.#requests.request(this, this.#body, null, null)?.catch(() => undefined);
    }
    /**
     * Re-fires section:requested on the body, open or closed: the explicit
     * request for a body that wants refreshing. A failed refresh paints its
     * problems, nothing rejects: there is no caller to reject towards.
     */
    refresh() {
        return this.#requests.request(this, this.#body, null, null)?.then(undefined, () => undefined);
    }
    close(result) {
        this.#dialog.close(result ?? '');
    }
}

export { Tooltip, Dialog };
