import { Localization, ParsedElement } from '../../ftl/index.mjs';

const SEVERITIES = ['info', 'success', 'warning', 'error'];

const REGIONS = new Set();
let listenerWired = false;

/**
 * @typedef {object} ToastOptions
 * @property {'info'|'success'|'warning'|'error'} [severity] the theme class and
 * the announcement, `info` when absent or unknown
 * @property {number} [timeout] the milliseconds before the toast retires, the
 * region's own timeout when absent
 * @property {{ label: any, onClick?: () => void }} [action] a button labelled
 * with `label` as text, beside the message
 */

/**
 * A region of transient messages, with `role="region"` and a localized
 * `aria-label`. Each `show()` appends a `ful-toast` that retires on its own
 * timer, so concurrent toasts stack.
 *
 * The region is a manual popover, whatever `popover` the page declared, and
 * each `show()` shows it again, so it is on top of the top layer when a toast
 * arrives: above a modal dialog or drawer opened before it. While a modal is
 * open the page outside it is inert, the region included: its toasts show and
 * retire on their timers, and their buttons answer once the modal closes.
 *
 * `timeout` is the region's default timer in milliseconds, 5000 when absent
 * or zero.
 *
 * A `show-toast` event dispatched on the document, or bubbling to it, shows its
 * `detail` in every connected region that has rendered, `detail.message` being
 * the message and the other fields the `ToastOptions`. The document listener is
 * added once, so a second region shows each toast once, and an event with no
 * detail is ignored.
 */
class Toasts extends ParsedElement {
    static attributes = ['timeout:number'];
    #timeout;
    /** Upgrades the region, and makes a re-attached one answer `show-toast` again. */
    connectedCallback() {
        super.connectedCallback();
        if (this.rendered) {
            REGIONS.add(this);
        }
    }
    /** Stops the region answering `show-toast` while it is out of the document. */
    disconnectedCallback() {
        REGIONS.delete(this);
    }
    render() {
        this.#timeout = this.declared('timeout') || 5000;
        this.setAttribute('role', 'region');
        this.setAttribute('tabindex', '-1');
        this.setAttribute('aria-label', Localization.of().t('toast.region'));
        this.setAttribute('popover', 'manual');
        if (!listenerWired) {
            listenerWired = true;
            document.addEventListener('show-toast', (/** @type any */ e) => {
                if (!e.detail) {
                    return;
                }
                for (const region of REGIONS) {
                    region.show(e.detail.message, e.detail);
                }
            });
        }
        REGIONS.add(this);
    }
    /**
     * Appends a `ful-toast` holding the message as text, a `Failure` showing
     * its problems' reasons one per line and anything else its string form
     * (`''` for null or undefined). The toast carries the severity as a class
     * and has `role="alert"` for `error` and `role="status"` otherwise.
     *
     * The toast retires when its timer runs out, when its localized dismiss
     * button is clicked, or when its action button is clicked, after
     * `action.onClick` runs. The timer pauses while the pointer is over the
     * toast or the focus is inside it, and resumes with the time that was left
     * once both have gone. A retiring toast holding the focus moves it to the
     * region, which has `tabindex="-1"` for this. The toast is removed once its
     * `ful-toast-out` animation ends, or at once where the user prefers reduced
     * motion or no animation runs.
     *
     * A connected region is shown again as a popover, which puts it above
     * whatever opened in the top layer since; the focus stays where it was.
     * @param {any} message
     * @param {ToastOptions} [options]
     * @returns {HTMLElement} the toast, already in the region
     */
    show(message, options = {}) {
        const severity = /** @type {string} */ (
            SEVERITIES.includes(/** @type {string} */ (options.severity)) ? options.severity : 'info'
        );
        const item = document.createElement('ful-toast');
        item.classList.add(severity);
        item.setAttribute('role', severity === 'error' ? 'alert' : 'status');
        const body = document.createElement('div');
        body.textContent = Localization.of().failure(message);
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.setAttribute('aria-label', Localization.of().t('toast.dismiss'));
        const icon = document.createElement('ful-icon');
        icon.setAttribute('name', 'x-lg');
        icon.setAttribute('aria-hidden', 'true');
        dismiss.append(icon);
        item.append(body);
        let remaining = options.timeout ?? this.#timeout;
        let startedAt = performance.now();
        let timer = 0;
        const retire = () => {
            clearTimeout(timer);
            if (item.contains(document.activeElement)) {
                /** @type HTMLElement */ (this).focus();
            }
            if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
                item.remove();
                return;
            }
            item.classList.add('ful-toast-out');
            if (item.getAnimations().length === 0) {
                item.remove();
            }
        };
        if (options.action?.label) {
            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'ful-toast-action';
            action.textContent = String(options.action.label);
            action.addEventListener('click', () => {
                /** @type {NonNullable<ToastOptions['action']>} */ (options.action).onClick?.();
                retire();
            });
            item.append(action);
        }
        item.append(dismiss);
        item.addEventListener('animationend', () => {
            if (item.classList.contains('ful-toast-out')) {
                item.remove();
            }
        });
        let holds = 0;
        const hold = () => {
            if (holds === 0) {
                clearTimeout(timer);
                remaining = Math.max(0, remaining - (performance.now() - startedAt));
            }
            ++holds;
        };
        const release = () => {
            if (holds === 0) {
                return;
            }
            if (--holds === 0) {
                startedAt = performance.now();
                timer = setTimeout(retire, remaining);
            }
        };
        item.addEventListener('mouseenter', hold);
        item.addEventListener('mouseleave', release);
        item.addEventListener('focusin', hold);
        item.addEventListener('focusout', release);
        dismiss.addEventListener('click', retire);
        this.append(item);
        this.#raise();
        timer = setTimeout(retire, remaining);
        return item;
    }
    #raise() {
        if (!this.isConnected) {
            return;
        }
        if (this.matches(':popover-open')) {
            this.hidePopover();
        }
        this.showPopover();
    }
}

export { Toasts };
