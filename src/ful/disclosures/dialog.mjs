import { Attributes, Localization, ParsedElement, Rendering } from '../../ftl/index.mjs';
import { DialogSections } from './dialog-sections.mjs';
import { wireTargets } from './targets.mjs';

/**
 * How a dialog ended. `dismissed` is true for Escape, the close button, a
 * backdrop click, a `data-result=""` button, `close()` without a result and a
 * removal from the document; `result` is the `data-result` of the button, or
 * the argument of `close(result)`, that answered; `response` is what the form
 * answered with under `close-on-submit`. Whichever of `result` and `response`
 * did not answer is null, as both are on a dismissal.
 * @typedef {{ dismissed: boolean, result: string|null, response: any }} DialogOutcome
 */

/**
 * A modal dialog on the native `<dialog>`, rendered with a header, a body and
 * a footer. `open()` and `ask()` show it and resolve with a `DialogOutcome`.
 *
 * The `header` attribute is the title, rendered as an `h2` that names the
 * dialog through `aria-labelledby`; without it the dialog is unnamed. The
 * `header` slot is rendered in the header before the title, the default slot
 * is the body, and the `buttons` slot is rendered in the footer. Without a
 * `buttons` slot, and without `close-on-submit`, the footer holds a localized
 * acknowledge button answering `acknowledged`.
 *
 * Any button inside the dialog carrying `data-result` closes it with that
 * result, an empty one being a dismissal. The header carries a close button,
 * and a press and release both on the backdrop close the dialog, each as a
 * dismissal, as Escape does.
 *
 * Before any of those three gestures closes it, the element dispatches a
 * cancelable, non-bubbling `dialog:dismiss` with `detail: { reason }`, the
 * reason being `button`, `backdrop` or `escape`; a listener calling
 * `preventDefault()` keeps it open, to guard unsaved edits. A `data-result`
 * button, `close-on-submit` and `close()` answer rather than dismiss, and
 * dispatch none.
 *
 * The platform lets a page refuse Escape once per user interaction: a second
 * Escape with no click or keystroke in between closes the dialog whatever the
 * page does, `requires-answer` included. That close is still announced by a
 * `dialog:dismiss`, which is then not cancelable.
 *
 * `requires-answer` withholds the close button and refuses Escape and the
 * backdrop, so the dialog is closed only by a button carrying `data-result`
 * or from code through `close()`.
 *
 * `close-on-submit` closes the dialog when a `ful-form` that is a direct child
 * of the body dispatches `submit:success`, answering with its
 * `detail.response`. A form deeper in the body, such as the filter form of a
 * `ful-table`, does not close it. The listener sits on the body, so a form
 * delivered by `update()` is covered as well.
 *
 * Every close dispatches a non-bubbling `close` event on the element carrying
 * the `DialogOutcome` as `detail`, before the pending `ask()` calls resolve.
 * An element anywhere in the page carrying `dialog-target` set to the
 * element's id opens it on click.
 *
 * The chrome is styled by class as well as by tag, so a plain `<dialog
 * class="ful-dialog">` written by a page gets the same look: the tag form
 * matches a direct child, and `ful-dialog-header`, `ful-dialog-body` and
 * `ful-dialog-footer` match at any depth, as a dialog whose content is wrapped
 * in a form needs.
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
    #sections;
    #resolvers = [];
    /** @type {DialogOutcome|null} */
    #answer = null;
    /**
     * @param {{ slots: Record<string, DocumentFragment> }} c
     */
    render({ slots }) {
        const requiresAnswer = this.declared('requires-answer');
        const closeOnSubmit = this.declared('close-on-submit');
        const fragment = this.template()
            .withOverlay({ slots, header: this.declared('header') ?? '', requiresAnswer, closeOnSubmit })
            .render();
        this.#sections = new DialogSections(this, fragment, 'body');
        this.#dialog = this.#sections.dialog;
        const heading = fragment.querySelector('h2');
        if (heading) {
            heading.id ||= Attributes.uid('ful-dialog-title');
            this.#dialog.setAttribute('aria-labelledby', heading.id);
        }
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
        const dismiss = (/** @type {'button'|'backdrop'|'escape'} */ reason, platformCloses = false) =>
            this.#sections.dismiss(
                new CustomEvent('dialog:dismiss', { cancelable: !platformCloses, detail: { reason } }),
                () => this.#dialog.close(''),
            );
        if (!requiresAnswer) {
            this.#sections.onBackdrop(() => dismiss('backdrop'));
        }
        fragment.querySelector('[data-ref=close]')?.addEventListener('click', () => dismiss('button'));
        if (closeOnSubmit) {
            this.#sections.onSubmitted((response) => {
                this.#answer = { dismissed: false, result: null, response };
                this.#dialog.close('submitted');
            });
        }
        this.#dialog.addEventListener('cancel', (/** @type any */ e) => {
            if (!e.cancelable) {
                this.#dialog.returnValue = '';
                dismiss('escape', true);
                return;
            }
            e.preventDefault();
            if (!requiresAnswer) {
                dismiss('escape');
            }
        });
        this.replaceChildren(fragment);
        wireTargets();
    }
    /** @returns {DialogOutcome} */
    #outcome() {
        if (this.#answer) {
            return this.#answer;
        }
        const result = this.#dialog?.returnValue ?? '';
        return result === ''
            ? { dismissed: true, result: null, response: null }
            : { dismissed: false, result, response: null };
    }
    /** @param {DialogOutcome} outcome */
    #settle(outcome) {
        const resolvers = this.#resolvers;
        this.#resolvers = [];
        for (const resolve of resolvers) {
            resolve(outcome);
        }
    }
    /**
     * Resolves every pending `ask()` and `open()` with the outcome so far,
     * a dismissal for a dialog still open, so that no caller waits on a dialog
     * that left the document. The native dialog is not closed and no `close`
     * event is dispatched.
     */
    disconnectedCallback() {
        this.#settle(this.#outcome());
    }
    /**
     * The same as `ask()`.
     * @returns {Promise<DialogOutcome>}
     */
    open() {
        return this.ask();
    }
    /**
     * Shows the dialog as a modal and resolves with how it ends.
     *
     * The call that opens the dialog resets the outcome of the previous
     * opening, hides the error and loading sections, and dispatches
     * `section:requested` on the element (bubbling, with
     * `detail: { section, first, name: null, index: null }`, `section` being
     * the body and `first` true only on the first answered request), so a
     * listener can fill the body. A failed request is painted into the body
     * and does not reject. On a dialog already open nothing is shown or
     * requested, and the call waits for the same ending as the calls before it.
     * @returns {Promise<DialogOutcome>} resolving on close, or on removal from
     * the document with a dismissal
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
     * Empties and hides the body, shows the loading section, opens the dialog
     * if it is closed, and fills the body with what the callback resolves to.
     * A rejection is shown, as the problems' reasons, in the error section,
     * which has `role="alert"`, and the body is hidden. The title stays the
     * `header` attribute.
     *
     * No `section:requested` is dispatched, and no `ask()` waiter is added:
     * listen for the `close` event to learn how the dialog ended. When a newer
     * `update()` starts before the callback settles, this call paints nothing:
     * it resolves with the body regardless, and still rejects with the
     * callback's error.
     * @param {() => Node|string|Promise<Node|string>} cb producing the body content
     * @returns {Promise<Element>} the body section, in the document
     * @throws {any} what the callback threw or rejected with
     */
    async update(cb) {
        return await this.#sections.update(cb, () => this.#show());
    }
    /**
     * Dispatches `section:requested` for the body again, as `ask()` does,
     * whether the dialog is open or closed. A failed request is painted into
     * the body.
     * @returns {Promise<any[]|undefined>} the listeners' answers, undefined when
     * nobody answered or the request failed; it never rejects
     */
    refresh() {
        return this.#sections.request();
    }
    /**
     * Closes an open dialog, doing nothing on a closed one. A non-empty result
     * answers as the button carrying that `data-result` would; no result, or
     * an empty one, is a dismissal.
     * @param {string} [result]
     */
    close(result) {
        this.#dialog.close(result ?? '');
    }
    /** @returns {boolean} whether this call is the one that opened the modal */
    #show() {
        if (this.#dialog.open) {
            return false;
        }
        this.#dialog.returnValue = '';
        this.#answer = null;
        this.#dialog.showModal();
        return true;
    }
    /**
     * Appends a new `ful-dialog` to `document.body`, asks it, and removes it
     * once it is answered or its render fails.
     *
     * A string body is set as text and never parsed as markup; a node is
     * appended as it is. Each button is either a `[result, label, className?]`
     * tuple, rendered as a `button` carrying `data-result`, or a node the
     * caller built, placed in the footer in the order given. With no buttons
     * the dialog shows its localized acknowledge button.
     * @param {string} header the title
     * @param {string|Node} body
     * @param {([string, string, string?]|Node)[]} [buttons]
     * @param {{ className?: string }} [options] `className` is set as the class
     * of the `ful-dialog` element
     * @returns {Promise<DialogOutcome>} rejecting with what the render threw
     */
    static async ask(header, body, buttons = [], { className } = {}) {
        const dialog = document.createElement('ful-dialog');
        dialog.setAttribute('header', header);
        if (className) {
            dialog.className = className;
        }
        if (typeof body === 'string') {
            dialog.textContent = body;
        } else if (body) {
            dialog.append(body);
        }
        if (buttons.length > 0) {
            const choices = document.createElement('template');
            choices.setAttribute('slot', 'buttons');
            for (const choice of buttons) {
                if (choice instanceof Node) {
                    choices.content.append(choice);
                    continue;
                }
                const [result, label, buttonClass] = choice;
                const button = document.createElement('button');
                button.type = 'button';
                button.dataset.result = result;
                if (buttonClass) {
                    button.className = buttonClass;
                }
                button.textContent = label;
                choices.content.append(button);
            }
            dialog.append(choices);
        }
        document.body.append(dialog);
        try {
            await Rendering.waitFor(dialog);
            return await /** @type {Dialog} */ (dialog).ask();
        } finally {
            dialog.remove();
        }
    }
    /**
     * Asks a yes/no question through `Dialog.ask`, with a cancel button and a
     * confirm button carrying the `ful-button` class.
     * @param {string} header the title
     * @param {string|Node} body as `Dialog.ask` takes it
     * @param {{ confirm?: string, cancel?: string }} [labels] the button labels,
     * `dialog.confirm` and `dialog.cancel` localized by default
     * @param {{ className?: string }} [options] as `Dialog.ask` takes them
     * @returns {Promise<boolean>} true only for the confirm button; the cancel
     * button, the close button and Escape answer false
     */
    static async confirm(header, body, labels = {}, options = {}) {
        const outcome = await Dialog.ask(
            header,
            body,
            [
                ['cancel', labels.cancel ?? Localization.of().t('dialog.cancel')],
                ['confirm', labels.confirm ?? Localization.of().t('dialog.confirm'), 'ful-button'],
            ],
            options,
        );
        return !outcome.dismissed && outcome.result === 'confirm';
    }
}

export { Dialog };
