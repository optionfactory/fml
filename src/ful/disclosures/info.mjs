import { Nodes, ParsedElement } from '../../ftl/index.mjs';
import { Claims } from '../claims.mjs';
import { describable } from '../descriptions.mjs';
import { SectionRequests } from '../events/sections.mjs';
import { Failure } from '../../httpc/index.mjs';
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

/**
 * A modal dialog on the native platform, open()/ask() resolving with the
 * closer's data-result.
 *
 * The header carries a close button, as the drawer's does: Escape dismisses a
 * modal on its own, but nothing says so, and a dialog whose only exit is a key
 * you have to know about leaves a pointer with nowhere to go. It answers the way
 * Escape does, with null.
 *
 * `requires-answer` is for the dialog that must be answered: the close button is not
 * rendered and Escape is refused, so the only way out is a button that carries a
 * result. It has to be both, a close button withheld while Escape still worked
 * being decoration rather than a rule.
 *
 * The chrome is reachable by class as well as by tag, so a plain `<dialog
 * class="ful-dialog">` written by a page gets the same look whatever its
 * structure: the tag form matches a direct child, and `ful-dialog-header`,
 * `ful-dialog-body` and `ful-dialog-footer` match at any depth, which is what a
 * dialog whose content is wrapped in a form needs.
 */
/**
 * How a dialog ended: `dismissed` tells a cancel from an answer, `result` carries
 * the `data-result` of the button that closed it and `response` what a submit
 * answered with, the one that did not happen being null.
 * @typedef {{ dismissed: boolean, result: string|null, response: any }} DialogOutcome
 */

class Dialog extends ParsedElement {
    static attributes = ['header', 'requires-answer:presence', 'close-on-submit:presence'];
    static slots = true;
    static template = `
        <dialog data-ref="dialog" class="ful-dialog">
            <header data-tpl-if="header || slots.header || !requiresAnswer" class="ful-dialog-header">
                {{{{ slots.header }}}}
                <h2 data-tpl-if="header">{{ header }}</h2>
                <button data-tpl-if="!requiresAnswer" type="button" data-ref="close" data-tpl-aria-label="#l10n:t('dialog.close')"><ful-icon name="x-lg" aria-hidden="true"></ful-icon></button>
            </header>
            <section data-ref="loading" hidden><ful-spinner class="centered" role="status"><span class="ful-sr-only">{{ #l10n:t('spinner.loading') }}</span></ful-spinner></section>
            <section data-ref="error" role="alert" hidden></section>
            <div data-ref="body" class="ful-dialog-body">{{{{ slots.default }}}}</div>
            <footer class="ful-dialog-footer">
                <button type="button" data-ref="acknowledge" data-result="acknowledged" data-tpl-if="!slots.buttons && !closeOnSubmit" data-tpl-aria-label="#l10n:t('dialog.acknowledge')">{{ #l10n:t('dialog.acknowledge') }}</button>
                {{{{ slots.buttons }}}}
            </footer>
        </dialog>
    `;
    #dialog;
    #body;
    #loading;
    #error;
    #requests = new SectionRequests();
    #updates = new Claims();
    #resolvers = [];
    //the answer a submit closed the dialog with, which the return value cannot
    //carry: it is a string, and a response is whatever the server sent
    /** @type {DialogOutcome|null} */
    #answer = null;
    render({ slots }) {
        const requiresAnswer = this.declared('requires-answer');
        const closeOnSubmit = this.declared('close-on-submit');
        const fragment = this.template()
            .withOverlay({ slots, header: this.declared('header') ?? '', requiresAnswer, closeOnSubmit })
            .render();
        this.#dialog = fragment.querySelector('[data-ref=dialog]');
        this.#body = fragment.querySelector('[data-ref=body]');
        this.#loading = fragment.querySelector('[data-ref=loading]');
        this.#error = fragment.querySelector('[data-ref=error]');
        this.#dialog.addEventListener('close', () => {
            const outcome = this.#outcome();
            this.dispatchEvent(new CustomEvent('close', { detail: outcome }));
            this.#settle(outcome);
        });
        this.#dialog.addEventListener('click', (/** @type any */ e) => {
            const result = e.target.closest('button[data-result]')?.dataset.result;
            if (result !== undefined) {
                this.#dialog.close(result);
            }
        });
        //dismissal, not an answer: the waiters are settled with a dismissal, as
        //Escape does. Optional because a subclass overriding the template owns
        //what it renders
        fragment
            .querySelector('[data-ref=close]')
            ?.addEventListener('click', () => this.#dialog.close(''));
        if (closeOnSubmit) {
            //delegated on the body rather than bound to the form, so a body
            //delivered later by update() is covered by the same listener. The
            //form must be the body's own: a ful-table wraps its filters in a
            //ful-form of its own, and a search in a table the dialog holds is
            //not the dialog being answered
            this.#body.addEventListener('submit:success', (/** @type any */ e) => {
                if (e.target !== Nodes.queryChildren(this.#body, 'ful-form')) {
                    return;
                }
                this.#answer = { dismissed: false, result: null, response: e.detail.response };
                this.#dialog.close('submitted');
            });
        }
        if (requiresAnswer) {
            //the platform's own dismissal, refused where the dialog must be
            //answered: cancel fires for Escape and for a close request the
            //browser makes on its own, and preventing it leaves the dialog open
            this.#dialog.addEventListener('cancel', (/** @type any */ e) => e.preventDefault());
        }
        this.replaceChildren(fragment);
        wireTargets();
    }
    /**
     * How the dialog ended, in one shape for every way it can end: `dismissed`
     * alone tells a cancel from an answer, so a submit answering with no body at
     * all (a 204) is still an answer, where a bare `null` could not say which it
     * was. `result` carries the `data-result` of the button that closed it and
     * `response` what a submit answered with; the one that did not happen is null.
     */
    #outcome() {
        if (this.#answer) {
            return this.#answer;
        }
        //a render that threw adopted no dialog, and a removal still owes its
        //waiters an answer: reading through it would raise a second, unrelated
        //failure over the one already reported
        const result = this.#dialog?.returnValue ?? '';
        return result === ''
            ? { dismissed: true, result: null, response: null }
            : { dismissed: false, result, response: null };
    }
    //answers every waiter with the dialog's own answer: a dismissal while still
    //open or closed without a result, which is also the unanswered answer a
    //dialog leaving the document owes its waiters instead of hanging them
    #settle(outcome) {
        const resolvers = this.#resolvers;
        this.#resolvers = [];
        for (const resolve of resolvers) {
            resolve(outcome);
        }
    }
    disconnectedCallback() {
        this.#settle(this.#outcome());
    }
    open() {
        return this.ask();
    }
    ask() {
        if (this.#show()) {
            this.#restChrome();
            this.#request();
        }
        return new Promise((resolve) => {
            this.#resolvers.push(resolve);
        });
    }
    /**
     * Opens the dialog and waits for the callback, as `ful-drawer`'s does: a
     * resolved value paints the body (which is returned), a rejection paints the
     * problems and travels to the caller, and an update superseded by a newer one
     * paints nothing. The title is the `header` attribute, configuration like the
     * rest of the dialog's chrome, so what update() owns is the body alone.
     */
    async update(cb) {
        //the claim detaches any update still in flight: its outcome belongs to
        //an abandoned opening and must neither be painted nor own the dialog
        const claim = this.#updates.take();
        this.#body.replaceChildren();
        this.#restChrome();
        this.#loading?.removeAttribute('hidden');
        this.#body.setAttribute('hidden', '');
        //update owns its own open-answer-deliver cycle, so it shows the dialog
        //without going through ask(): a user reopen during the wait is a real
        //open and goes through ask()
        this.#show();
        try {
            const delivered = await cb();
            if (claim.stale) {
                return this.#body;
            }
            this.#body.replaceChildren(delivered);
            this.#loading?.setAttribute('hidden', '');
            this.#body.removeAttribute('hidden');
            return this.#body;
        } catch (/** @type any */ e) {
            if (!claim.stale) {
                //revealed before it is filled, so the live region announces the
                //change rather than being revealed already holding it
                this.#error?.removeAttribute('hidden');
                if (this.#error) {
                    this.#error.textContent = Failure.problemsText(e);
                }
                this.#loading?.setAttribute('hidden', '');
                this.#body.setAttribute('hidden', '');
            }
            throw e;
        }
    }
    #request() {
        this.#requests.request(this, this.#body, null, null)?.catch(() => undefined);
    }
    /**
     * Re-fires section:requested on the body, open or closed: the explicit
     * request for a body that wants refreshing. A failed refresh paints its
     * problems, nothing rejects: update() stays the rejecting call.
     */
    refresh() {
        return this.#requests.request(this, this.#body, null, null)?.then(undefined, () => undefined);
    }
    close(result) {
        this.#dialog.close(result ?? '');
    }
    /** Shows the modal, answering whether this call is the one that opened it. */
    #show() {
        if (this.#dialog.open) {
            return false;
        }
        //an opening owes nothing to the one before it: the platform keeps
        //returnValue across a close with no result, and the answer a submit
        //left is just as stale
        this.#dialog.returnValue = '';
        this.#answer = null;
        this.#dialog.showModal();
        return true;
    }
    #restChrome() {
        this.#error?.replaceChildren();
        this.#error?.setAttribute('hidden', '');
        this.#loading?.setAttribute('hidden', '');
        this.#body?.removeAttribute('hidden');
    }
}

export { Tooltip, Dialog };
