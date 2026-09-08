import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin, Tooltip, Dialog } from '../../../src/ful/index.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const settle = async () => {
    for (let i = 0; i !== 20; ++i) {
        await new Promise((r) => setTimeout(r, 0));
    }
};
const mount = async (html) => {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    await Rendering.waitFor(container);
    await settle();
    return [container.firstElementChild, container];
};

describe('Tooltip', () => {
    it('renders an icon button wired to a popover carrying the explanation', async () => {
        const [tooltip, container] = await mount('<ful-tooltip>explains the label</ful-tooltip>');
        const button = tooltip.querySelector('button');
        const popover = tooltip.querySelector('[popover]');

        assert.strictEqual(button.getAttribute('aria-label'), 'More information');
        assert.strictEqual(button.getAttribute('popovertarget'), popover.id);
        assert.strictEqual(button.getAttribute('aria-expanded'), 'false');
        assert.include(popover.textContent, 'explains the label');

        button.click();
        assert.isTrue(popover.matches(':popover-open'));
        await settle();
        assert.strictEqual(button.getAttribute('aria-expanded'), 'true');

        button.click();
        assert.isFalse(popover.matches(':popover-open'));
        await settle();
        assert.strictEqual(button.getAttribute('aria-expanded'), 'false');
        container.remove();
    });
});

describe('Dialog', () => {
    it('shows the header, the body and the localized acknowledge button', async () => {
        const [dialog, container] = await mount('<ful-dialog header="the header">the body</ful-dialog>');

        assert.isNotNull(dialog.querySelector('header h2')?.textContent.match(/the header/));
        assert.include(dialog.querySelector("[data-ref='body']").textContent, 'the body');
        assert.strictEqual(dialog.querySelector('[data-ref=acknowledge]').textContent, 'Got it');
        container.remove();
    });

    it('ask() resolves with the acknowledge result', async () => {
        const [dialog, container] = await mount('<ful-dialog>body</ful-dialog>');
        const asked = dialog.ask();

        assert.isTrue(dialog.querySelector('dialog').open);
        dialog.querySelector('[data-ref=acknowledge]').click();
        assert.strictEqual(await asked, 'acknowledged');
        assert.isFalse(dialog.querySelector('dialog').open);
        container.remove();
    });

    it('ask() resolves with the data-result of the slotted button that closed it', async () => {
        const [dialog, container] = await mount(`
            <ful-dialog>
                body
                <template slot="buttons">
                    <button type="button" data-result="confirmed">Confirm</button>
                    <button type="button" data-result="dismissed">Dismiss</button>
                </template>
            </ful-dialog>`);
        assert.isNull(dialog.querySelector('[data-ref=acknowledge]'), 'no default button beside the slotted ones');

        const asked = dialog.ask();
        dialog.querySelector('button[data-result=dismissed]').click();

        assert.strictEqual(await asked, 'dismissed');
        container.remove();
    });

    it('resolves null when the dialog closes without a result, as Escape does', async () => {
        const [dialog, container] = await mount('<ful-dialog>body</ful-dialog>');
        const asked = dialog.ask();

        dialog.querySelector('dialog').close('');

        assert.isNull(await asked);
        container.remove();
    });

    it('any element carrying dialog-target opens the dialog it names, clones included', async () => {
        const [dialog, container] = await mount(`
            <ful-dialog id="target-dialog" header="h">body</ful-dialog>
            <a dialog-target="target-dialog">Vedi il dettaglio</a>`);
        const trigger = container.querySelector('a');
        const cloned = trigger.cloneNode(true);
        container.appendChild(cloned);

        const opened = dialog.open();
        trigger.click();
        dialog.querySelector('[data-ref=acknowledge]').click();
        assert.strictEqual(await opened, 'acknowledged', 'opening an open dialog is a no-op, not a crash');

        const again = dialog.ask();
        cloned.click();
        assert.isTrue(dialog.querySelector('dialog').open, 'the cloned trigger opens the dialog');
        dialog.querySelector('[data-ref=acknowledge]').click();
        assert.strictEqual(await again, 'acknowledged');
        container.remove();
    });
});

describe('subclass reuse', () => {
    it('a custom tooltip keeps the wiring and the chrome through the structural hooks', async () => {
        class HelpTip extends Tooltip {
            static template = `
                <button type="button" class="ful-tip" data-ref="trigger" aria-label="help">?</button>
                <ful-note popover data-ref="content">{{{{ slots.default }}}}</ful-note>
            `;
        }
        registry.defineElement('x-help-tip', HelpTip);
        const [tip, container] = await mount('<x-help-tip placement="top">custom note</x-help-tip>');
        const button = tip.querySelector('button');
        const note = tip.querySelector('ful-note');

        assert.isTrue(button.classList.contains('ful-tip'));
        button.click();
        assert.isTrue(note.matches(':popover-open'));
        await settle();
        assert.strictEqual(button.getAttribute('aria-expanded'), 'true');
        assert.strictEqual(note.getAttribute('placement'), 'top');
        container.remove();
    });

    it('a custom dialog keeps the card chrome through the class on the native dialog', async () => {
        class ConfirmDialog extends Dialog {
            static template = `
                <dialog data-ref="dialog" class="ful-dialog"><slot></slot></dialog>
            `;
        }
        registry.defineElement('x-confirm-dialog', ConfirmDialog);
        const [dialog, container] = await mount('<x-confirm-dialog>body</x-confirm-dialog>');

        assert.isTrue(dialog.querySelector('dialog').classList.contains('ful-dialog'));
        const asked = dialog.ask();
        assert.isTrue(dialog.querySelector('dialog').open);
        dialog.close('done');
        assert.strictEqual(await asked, 'done');
        container.remove();
    });
});
