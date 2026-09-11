import { Localization, ParsedElement } from '../../ftl/index.mjs';
import { Failure } from '../../httpc/index.mjs';

const SEVERITIES = ['info', 'success', 'warning', 'error'];

//the regions alive in the document: the show-toast door is wired once and
//forwards to each of them, so a re-hosted or second region never doubles a toast
const REGIONS = new Set();
let doorWired = false;

/** A transient feedback region: each show() stacks a toast that retires on its own timer. */
class Toasts extends ParsedElement {
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
        this.#timeout = Number(this.getAttribute('timeout')) || 5000;
        this.setAttribute('role', 'region');
        //focusable only programmatically, so a retiring toast can hand its focus back
        this.setAttribute('tabindex', '-1');
        this.setAttribute('aria-label', Localization.of().t('toast.region'));
        if (!doorWired) {
            doorWired = true;
            document.addEventListener('show-toast', (/** @type any */ e) => {
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
     * @param {any} message
     * @param {any} [options] severity and timeout
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
        item.append(body, dismiss);
        item.addEventListener('animationend', () => {
            if (item.classList.contains('ful-toast-out')) {
                item.remove();
            }
        });
        const retire = () => {
            //the toast may hold the focus, on its own dismiss button: handing it
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
        dismiss.addEventListener('click', retire);
        this.append(item);
        setTimeout(retire, options.timeout ?? this.#timeout);
        return item;
    }
}

export { Toasts };
