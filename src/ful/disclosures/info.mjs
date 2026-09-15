import { ParsedElement } from '../../ftl/index.mjs';
import { describable } from '../descriptions.mjs';
import { SectionRequests } from '../events/sections.mjs';
import { Anchors } from './anchors.mjs';
import { wireTargets } from './targets.mjs';

/**
 * An info icon button toggling a popover with a short explanation.
 *
 * The marker is the page's `config.icon`, and the `icon` attribute names a
 * `ful-icon` for the tooltip that means something other than plain information:
 * a caveat, a warning, a setting. A name the library does not paint is the
 * page's own, declared as `ful-icon[name='...'] { mask-image: ... }`.
 *
 * `describes` is for the tooltip standing in a field: the note becomes part of
 * the accessible description of that field's control, so it is announced on
 * reaching the field rather than only on opening the marker, and the marker
 * leaves the tab order, so a form of hinted fields costs no extra keystrokes to
 * walk. The marker stays clickable, and stays a tab stop wherever the note was
 * not taken, a tooltip claiming `describes` outside a field among them: the
 * stop only goes where something else delivers the content.
 */
class Tooltip extends ParsedElement {
    static slots = true;
    static attributes = ['placement', 'icon', 'describes:presence'];
    static config = {
        icon: 'info-circle-fill',
    };
    static template = `
        <button type="button" class="ful-tip" data-ref="trigger" data-tpl-aria-label="#l10n:t('info.tooltip')"><ful-icon data-tpl-name="icon ?? config.icon" aria-hidden="true"></ful-icon></button>
        <ful-note popover data-ref="content">{{{{ slots.default }}}}</ful-note>
    `;
    render({ slots }) {
        const fragment = this.template().withOverlay({ slots, icon: this.declared('icon') }).render();
        const trigger = fragment.querySelector('[data-ref=trigger]');
        const content = fragment.querySelector('[data-ref=content]');
        //placed here rather than by the anchor css: the note draws a callout that
        //has to point at the trigger wherever the viewport left room for the note,
        //which is a measurement the stylesheet cannot make for a pseudo-element
        Anchors.wire(trigger, content, { prefix: 'ful-tooltip', invoke: true, expanded: true, handPlace: true });
        //above the marker by default: a note opening downwards covers the control
        //the marker explains, the marker riding the field's label
        content.setAttribute('placement', this.declared('placement') ?? 'top');
        this.replaceChildren(fragment);
        if (this.declared('describes')) {
            Tooltip.#describe(this, trigger, content);
        }
    }
    /**
     * Offers the note to the field the tooltip stands in, and takes the trigger
     * out of the tab order only where the offer was accepted: a note nothing
     * carries is reachable by the keyboard through the marker alone, so
     * dropping the stop there would leave it reachable by nothing at all.
     *
     * The offer goes through the description protocol rather than naming a
     * field, the library's own arrow running from the forms to the disclosures.
     */
    static #describe(tooltip, trigger, content) {
        if (!describable(tooltip)?.describedBy(content)) {
            console.warn('a ful-tooltip declares describes but stands in nothing that takes a description', tooltip);
            return;
        }
        trigger.tabIndex = -1;
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
