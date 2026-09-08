import { Localization, ParsedElement } from '../../ftl/index.mjs';

const SEVERITIES = ['info', 'success', 'warning', 'error'];

class Toasts extends ParsedElement {
    #timeout;
    render() {
        this.classList.add('ful-toasts');
        this.#timeout = Number(this.getAttribute('timeout')) || 5000;
        this.setAttribute('role', 'region');
        this.setAttribute('aria-label', Localization.of().t('toast.region'));
        document.addEventListener('show-toast', (/** @type any */ e) => {
            this.show(e.detail.message, e.detail);
        });
    }
    show(message, options = {}) {
        const severity = SEVERITIES.includes(options.severity) ? options.severity : 'info';
        const item = document.createElement('div');
        item.className = `ful-toast ${severity}`;
        item.setAttribute('role', severity === 'error' ? 'alert' : 'status');
        const body = document.createElement('div');
        body.textContent = message?.problems ? message.problems.map((p) => `${p.reason}`).join('\n') : `${message ?? ''}`;
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
            if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
                item.remove();
                return;
            }
            item.classList.add('ful-toast-out');
        };
        dismiss.addEventListener('click', retire);
        this.append(item);
        setTimeout(retire, options.timeout ?? this.#timeout);
        return item;
    }
}

export { Toasts };
