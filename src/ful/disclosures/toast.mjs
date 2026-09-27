import { Localization, ParsedElement } from '../../ftl/index.mjs';
import { Failure } from '../../httpc/index.mjs';

const SEVERITIES = ['info', 'success', 'warning', 'error'];

//the regions alive in the document: the show-toast listener is wired once and
//forwards to each of them, so a re-hosted or second region never doubles a toast
const REGIONS = new Set();
let listenerWired = false;

/** A transient feedback region: each show() stacks a toast that retires on its own timer. */
class Toasts extends ParsedElement {
    static attributes = ['timeout:number'];
    #timeout;
    connectedCallback() {
        super.connectedCallback();
        if (this.rendered) {
            REGIONS.add(this);
        }
    }
    disconnectedCallback() {
        REGIONS.delete(this);
    }
    render() {
        this.#timeout = this.declared('timeout') || 5000;
        this.setAttribute('role', 'region');
        //focusable only programmatically, so a retiring toast can hand its focus back
        this.setAttribute('tabindex', '-1');
        this.setAttribute('aria-label', Localization.of().t('toast.region'));
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
     * Appends a toast carrying the message (a Failure shows its problems'
     * reasons, one per line), severity picking the theme and the announcement,
     * the toast retiring through its own timer or its dismiss button.
     *
     * The timer holds while the toast is hovered or holds the focus, so an
     * actionable toast waits for its reader: `action` is `{ label, onClick }`,
     * a button beside the message whose click answers and retires. The same
     * options travel in the `show-toast` event's detail.
     * @param {any} message
     * @param {any} [options] severity, timeout and action
     * @returns {HTMLElement}
     */
    show(message, options = {}) {
        const severity = SEVERITIES.includes(options.severity) ? options.severity : 'info';
        const item = document.createElement('ful-toast');
        item.classList.add(severity);
        item.setAttribute('role', severity === 'error' ? 'alert' : 'status');
        const body = document.createElement('div');
        body.textContent = Failure.problemsText(message, `${message ?? ''}`);
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
            //the toast may hold the focus, on its own buttons: handing it
            //back to the region keeps the reader somewhere rather than on <body>
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
                options.action.onClick?.();
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
        //the pointer and the focus hold independently: a count rather than a
        //flag, so the pointer leaving while the focus stays keeps the hold
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
        timer = setTimeout(retire, remaining);
        return item;
    }
}

export { Toasts };
