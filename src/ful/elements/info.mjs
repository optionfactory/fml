import { Attributes, ParsedElement } from '../../ftl/index.mjs';

class Tooltip extends ParsedElement {
    static slots = true;
    static config = {
        icon: 'info-circle',
    };
    static template = `
        <button type="button" class="ful-tip" data-ref="trigger" data-tpl-aria-label="#l10n:t('info.tooltip')"><ful-icon data-tpl-name="config.icon" aria-hidden="true"></ful-icon></button>
        <ful-note popover data-ref="content">{{{{ slots.default }}}}</ful-note>
    `;
    render({ slots }) {
        const fragment = this.template().withOverlay({ slots }).render();
        const trigger = fragment.querySelector('[data-ref=trigger]');
        const content = fragment.querySelector('[data-ref=content]');
        const id = Attributes.uid('ful-tooltip');
        trigger.setAttribute('popovertarget', id);
        trigger.setAttribute('aria-expanded', 'false');
        content.id = id;
        const anchor = `--${id}`;
        trigger.style.anchorName = anchor;
        content.style.positionAnchor = anchor;
        const placement = this.getAttribute('placement');
        if (placement) {
            content.setAttribute('placement', placement);
        }
        content.addEventListener('toggle', (/** @type any */ e) => {
            trigger.setAttribute('aria-expanded', e.newState === 'open' ? 'true' : 'false');
        });
        this.replaceChildren(fragment);
    }
}

let targetsWired = false;
const wireTargets = () => {
    if (targetsWired) {
        return;
    }
    targetsWired = true;
    document.addEventListener('click', (/** @type any */ e) => {
        const trigger = e.target.closest?.('[dialog-target]');
        if (!trigger) {
            return;
        }
        /** @type {any} */ (document.getElementById(trigger.getAttribute('dialog-target')))?.open?.();
    });
};

class Dialog extends ParsedElement {
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
    #resolvers = [];
    render({ slots }) {
        const fragment = this
            .template()
            .withOverlay({ slots, header: this.getAttribute('header') ?? '' })
            .render();
        this.#dialog = fragment.querySelector('[data-ref=dialog]');
        this.#dialog.addEventListener('close', () => {
            const resolvers = this.#resolvers;
            this.#resolvers = [];
            for (const resolve of resolvers) {
                resolve(this.#dialog.returnValue === '' ? null : this.#dialog.returnValue);
            }
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
    open() {
        if (!this.#dialog.open) {
            this.#dialog.showModal();
        }
        return this.ask();
    }
    ask() {
        if (!this.#dialog.open) {
            this.#dialog.showModal();
        }
        return new Promise((resolve) => {
            this.#resolvers.push(resolve);
        });
    }
    close(result) {
        this.#dialog.close(result ?? '');
    }
}

export { Tooltip, Dialog, wireTargets };
