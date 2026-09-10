import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { AsyncEvents, Plugin, Tooltip, Dialog } from '../../../src/ful/index.mjs';

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
        const triggerBox = button.getBoundingClientRect();
        const noteBox = popover.getBoundingClientRect();
        assert.isAtLeast(
            Math.round(noteBox.top),
            Math.round(triggerBox.bottom) - 1,
            'the note is anchored below the trigger',
        );
        assert.isBelow(
            Math.round(noteBox.left),
            Math.round(triggerBox.right),
            'the note overlaps the trigger horizontally',
        );

        button.click();
        assert.isFalse(popover.matches(':popover-open'));
        await settle();
        assert.strictEqual(button.getAttribute('aria-expanded'), 'false');
        container.remove();
    });

    it('anchors the note on the side the placement attribute picks', async () => {
        const [tooltip, container] = await mount('<ful-tooltip placement="right">side note</ful-tooltip>');
        const button = tooltip.querySelector('button');
        const popover = tooltip.querySelector('[popover]');

        button.click();
        await settle();
        const triggerBox = button.getBoundingClientRect();
        const noteBox = popover.getBoundingClientRect();
        assert.isAtLeast(
            Math.round(noteBox.left),
            Math.round(triggerBox.right) - 1,
            'the note is anchored after the trigger',
        );
        container.remove();
    });
});

describe('Tooltip, where the platform lacks CSS anchor positioning', () => {
    //the engine under test carries the anchor css: the supports probe is
    //stubbed out and the note's position-area neutralized
    let supports;
    let area;
    before(() => {
        supports = CSS.supports;
        CSS.supports = () => false;
        area = document.createElement('style');
        area.textContent = 'ful-note, .ful-note { position-area: none !important; }';
        document.head.append(area);
    });
    after(() => {
        CSS.supports = supports;
        area.remove();
    });

    it('places the note below the trigger, centered on it', async () => {
        const [tooltip, container] = await mount('<ful-tooltip>explains the label</ful-tooltip>');
        container.style.marginLeft = '200px';
        const button = tooltip.querySelector('button');
        const note = tooltip.querySelector('[popover]');

        button.click();
        await settle();
        const b = button.getBoundingClientRect();
        const n = note.getBoundingClientRect();
        assert.isAtLeast(Math.round(n.top), Math.round(b.bottom) - 1, 'the note sits below the trigger');
        assert.closeTo(n.left + n.width / 2, b.left + b.width / 2, 1, 'the note is centered on the trigger');

        button.click();
        container.remove();
    });

    it('places the note above the trigger when the placement picks top', async () => {
        const [tooltip, container] = await mount('<ful-tooltip placement="top">side note</ful-tooltip>');
        container.style.margin = '200px 0 0 200px';
        const button = tooltip.querySelector('button');
        const note = tooltip.querySelector('[popover]');

        button.click();
        await settle();
        const b = button.getBoundingClientRect();
        const n = note.getBoundingClientRect();
        assert.isAtMost(Math.round(n.bottom), Math.round(b.top) + 1, 'the note sits above the trigger');
        assert.closeTo(n.left + n.width / 2, b.left + b.width / 2, 1, 'the note is centered on the trigger');
        container.remove();
    });

    it("keeps an edge-hugging trigger's note clear of the viewport edge", async () => {
        const [tooltip, container] = await mount('<ful-tooltip>explains the label</ful-tooltip>');
        container.style.marginLeft = 'calc(100vw - 3rem)';
        const button = tooltip.querySelector('button');
        const note = tooltip.querySelector('[popover]');

        button.click();
        await settle();
        const n = note.getBoundingClientRect();
        assert.isAtMost(
            Math.round(n.right),
            document.documentElement.clientWidth - 7,
            'the note stays inside the viewport',
        );
        container.remove();
    });

    it('follows the trigger while the page scrolls', async () => {
        const [tooltip, container] = await mount('<ful-tooltip>explains the label</ful-tooltip>');
        container.style.marginTop = '300px';
        const spacer = document.createElement('div');
        spacer.style.height = '200vh';
        container.append(spacer);
        const button = tooltip.querySelector('button');
        const note = tooltip.querySelector('[popover]');

        button.click();
        await settle();
        const before = note.getBoundingClientRect().top;
        window.scrollBy(0, 100);
        await settle();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        assert.closeTo(note.getBoundingClientRect().top, before - 100, 2, 'the note follows its trigger');

        window.scrollTo(0, 0);
        button.click();
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

        dialog.querySelector('dialog').close();

        assert.isNull(await asked);
        container.remove();
    });

    it('an Escape after an earlier answer resolves null, not the earlier answer', async () => {
        const [dialog, container] = await mount('<ful-dialog>body</ful-dialog>');
        const first = dialog.ask();
        dialog.querySelector('[data-ref=acknowledge]').click();
        assert.strictEqual(await first, 'acknowledged');

        const results = [];
        dialog.addEventListener('close', (e) => results.push(e.detail.result));
        const second = dialog.ask();
        dialog.querySelector('dialog').close();

        assert.isNull(await second, 'the stale acknowledged is not the answer');
        assert.deepStrictEqual(results, [null], 'the close event agrees');
        container.remove();
    });

    it('a dialog leaving the document while open answers its waiters with null', async () => {
        const [dialog, container] = await mount('<ful-dialog>body</ful-dialog>');
        const asked = dialog.ask();

        container.remove();
        assert.isNull(await asked, 'the await does not hang on a destroyed element');
    });

    it('answers with a close event carrying the answer', async () => {
        const [dialog, container] = await mount('<ful-dialog>body</ful-dialog>');
        const answers = [];
        dialog.addEventListener('close', (e) => answers.push(e.detail.result));

        dialog.ask();
        dialog.querySelector('[data-ref=acknowledge]').click();
        await new Promise((r) => setTimeout(r));
        assert.deepStrictEqual(answers, ['acknowledged']);
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

describe('Dialog, the section:requested door', () => {
    it('fires on the body on open, first only the first time', async () => {
        const [dialog, container] = await mount('<ful-dialog header="h">the body</ful-dialog>');
        const seen = [];
        AsyncEvents.asyncOn(dialog, 'section:requested', (e) => {
            seen.push(e.detail.first);
            e.detail.section.append('delivered');
        });

        dialog.ask();
        await settle();
        assert.deepStrictEqual(seen, [true], 'ask() opens, the door fires');
        assert.include(dialog.querySelector('[data-ref=body]').textContent, 'delivered');

        dialog.close();
        await settle();
        dialog.ask();
        await settle();
        assert.deepStrictEqual(seen, [true, false]);
        dialog.close();
        container.remove();
    });
});

describe('Dialog, the refresh door', () => {
    it('re-fires the body door, its failures painted and swallowed', async () => {
        const [dialog, container] = await mount('<ful-dialog header="h">the body</ful-dialog>');
        let fail = true;
        AsyncEvents.asyncOn(dialog, 'section:requested', () => {
            if (fail) {
                throw new Error('boom');
            }
        });

        await dialog.refresh();
        assert.isNotNull(dialog.querySelector('[data-ref=body] > .ful-section-error'));

        fail = false;
        await dialog.refresh();
        assert.strictEqual(dialog.querySelector('[data-ref=body] > .ful-section-error'), null);
        container.remove();
    });
});
