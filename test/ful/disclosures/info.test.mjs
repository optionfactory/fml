import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { AsyncEvents, Plugin, Tooltip, Dialog } from '../../../src/ful/index.mjs';
import { appended, settle as drain } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const settle = () => drain(20, 80);
const mount = async (html) => {
    const container = appended(html);
    await Rendering.waitFor(container);
    await settle();
    return [container.firstElementChild, container];
};

describe('Tooltip', () => {
    it('shows the configured icon, and the one the icon attribute names', async () => {
        const [plain] = await mount('<ful-tooltip>explains the label</ful-tooltip>');
        assert.strictEqual(plain.querySelector('ful-icon').getAttribute('name'), 'info-circle-fill');

        const [warned] = await mount('<ful-tooltip icon="exclamation-circle">check it</ful-tooltip>');
        assert.strictEqual(warned.querySelector('ful-icon').getAttribute('name'), 'exclamation-circle');
    });
    it('describes the field it stands in and leaves its tab order, under describes', async () => {
        const [field] = await mount(
            '<ful-input name="vat">VAT<ful-tooltip slot="info" describes>eleven digits</ful-tooltip></ful-input>',
        );
        const control = field.querySelector('input');
        const tooltip = field.querySelector('ful-tooltip');
        const note = tooltip.querySelector('[popover]');
        const trigger = tooltip.querySelector('button');

        const described = (control.getAttribute('aria-describedby') ?? '').split(' ');
        assert.include(described, note.id, 'the note is part of the description');
        assert.strictEqual(described.length, 2, 'beside the field error region, which keeps its own entry');
        assert.strictEqual(trigger.tabIndex, -1, 'the marker is no longer a tab stop');

        //the marker still opens the note: only sequential focus was taken away
        trigger.click();
        assert.isTrue(note.matches(':popover-open'));
        note.hidePopover();
    });
    it('keeps its tab stop where nothing took the note', async () => {
        const [tooltip] = await mount('<ful-tooltip describes>eleven digits</ful-tooltip>');
        const trigger = tooltip.querySelector('button');

        assert.strictEqual(trigger.tabIndex, 0, 'a note nothing carries stays reachable through the marker');
    });
    it('is not described unless it says so', async () => {
        const [field] = await mount(
            '<ful-input name="vat">VAT<ful-tooltip slot="info">eleven digits</ful-tooltip></ful-input>',
        );
        const control = field.querySelector('input');
        const note = field.querySelector('ful-tooltip [popover]');

        assert.notInclude(control.getAttribute('aria-describedby').split(' '), note.id);
        assert.strictEqual(field.querySelector('ful-tooltip button').tabIndex, 0);
    });
    it('renders an icon button wired to a popover carrying the explanation', async () => {
        const [tooltip, container] = await mount('<ful-tooltip>explains the label</ful-tooltip>');
        //the default placement is above, and the placing clamps into the
        //viewport rather than flipping, so the trigger needs room over it
        container.style.marginTop = '200px';
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
        assert.isAtMost(
            Math.round(noteBox.bottom),
            Math.round(triggerBox.top) + 1,
            'the note is anchored above the trigger, which is the default placement',
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
    });

    it('anchors the note on the side the placement attribute picks', async () => {
        const [tooltip] = await mount('<ful-tooltip placement="right">side note</ful-tooltip>');
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
    });

    it('centres the trigger on the cap height of the text it sits beside', async () => {
        const [container] = await mount('<div><label id="beside">HEX<ful-tooltip>x</ful-tooltip></label></div>');
        const label = container.querySelector('#beside');
        //the baseline, read off a zero-sized box aligned to it
        const strut = document.createElement('span');
        strut.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
        label.insertBefore(strut, label.firstChild);
        const baseline = strut.getBoundingClientRect().top;
        strut.remove();
        //the ink of the text, from the font rather than from the line box: a
        //line of capitals reads as centred halfway up its cap height
        const style = getComputedStyle(label);
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const ink = ctx.measureText('HEX');
        const textCentre = baseline + (ink.actualBoundingBoxDescent - ink.actualBoundingBoxAscent) / 2;

        const button = label.querySelector('ful-tooltip button').getBoundingClientRect();

        //vertical-align: middle alone puts it on the midpoint of the x-height,
        //about a tenth of an em low. The tolerance covers the whole pixel the
        //engines round the measured ascent to
        assert.closeTo((button.top + button.bottom) / 2, textCentre, 1, 'the trigger rides the text it explains');
    });

    it('draws a callout pointing back at the trigger, which the popover overflow would otherwise clip', async () => {
        const [tooltip, container] = await mount('<ful-tooltip>explains the label</ful-tooltip>');
        container.style.marginTop = '200px';
        const button = tooltip.querySelector('button');
        const note = tooltip.querySelector('[popover]');

        button.click();
        await settle();

        //the platform gives every popover overflow: auto, which cuts the callout
        //back inside the box and leaves a notch where the point should be
        assert.strictEqual(getComputedStyle(note).overflow, 'visible');
        const point = getComputedStyle(note, '::after');
        assert.notStrictEqual(point.content, 'none', 'the note draws a callout');
        assert.include(point.rotate, '45', 'a square turned a corner towards the trigger');
        assert.isBelow(
            parseFloat(point.bottom),
            0,
            'it straddles the edge facing the trigger, which is the bottom edge for a note above it',
        );

        button.click();
    });
});

/**
 * The note is placed by the library on every platform rather than by the anchor
 * css, its callout needing to know where the trigger ended up, so these run
 * against whatever engine is under test with nothing stubbed out.
 */
describe('Tooltip placement', () => {
    it('leaves the css gap between the note and the trigger, and keeps it on every later placing', async () => {
        const [tooltip, container] = await mount('<ful-tooltip>explains the label</ful-tooltip>');
        container.style.marginTop = '200px';
        const button = tooltip.querySelector('button');
        const note = tooltip.querySelector('[popover]');
        //read before the opening: the placing clears the margin it reads the gap
        //from. The closed note carries it as a top margin and the open one, above
        //its trigger, as a bottom margin, both being the same --ful-note-gap
        const gap = parseFloat(getComputedStyle(note).marginTop);
        assert.isAbove(gap, 0, 'the stylesheet declares a gap');
        const distance = () => button.getBoundingClientRect().top - note.getBoundingClientRect().bottom;

        button.click();
        await settle();

        assert.closeTo(distance(), gap, 1, 'the hand placement honours the gap the anchor css leaves');

        //the placing zeroes the margin it reads, so every pass after the first
        //used to read its own zero and pull the note flush against the trigger
        document.dispatchEvent(new Event('scroll'));
        await settle();

        assert.closeTo(distance(), gap, 1, 'and the reflow does not close it');

        button.click();
    });

    it('keeps the callout on the trigger where the viewport pushes the note off it', async () => {
        const [holder] = await mount(
            '<div style="position:absolute;left:40px;top:120px"><ful-tooltip>a rather long explanation, long enough that it cannot be centred on a trigger this close to the edge</ful-tooltip></div>',
        );
        const tooltip = holder.querySelector('ful-tooltip');
        const button = tooltip.querySelector('button');
        const note = tooltip.querySelector('[popover]');

        button.click();
        await settle();

        const b = button.getBoundingClientRect();
        const n = note.getBoundingClientRect();
        const triggerCentre = b.left + b.width / 2;
        assert.isAbove(
            Math.abs(n.left + n.width / 2 - triggerCentre),
            20,
            'the note had to move off its trigger, which is what this is about',
        );

        //the callout's own offset inside the note, which is what has to follow
        const callout = n.left + note.clientLeft + parseFloat(getComputedStyle(note, '::after').left);
        assert.closeTo(callout, triggerCentre, 2, 'the callout still points at the trigger, not at the note');

        button.click();
    });

    it('places the note above the trigger by default, centered on it', async () => {
        const [tooltip, container] = await mount('<ful-tooltip>explains the label</ful-tooltip>');
        container.style.margin = '200px 0 0 200px';
        const button = tooltip.querySelector('button');
        const note = tooltip.querySelector('[popover]');

        button.click();
        await settle();
        const b = button.getBoundingClientRect();
        const n = note.getBoundingClientRect();
        assert.isAtMost(Math.round(n.bottom), Math.round(b.top) + 1, 'the note sits above the trigger');
        assert.closeTo(n.left + n.width / 2, b.left + b.width / 2, 1, 'the note is centered on the trigger');

        button.click();
    });

    it('places the note below the trigger when the placement picks bottom', async () => {
        const [tooltip, container] = await mount('<ful-tooltip placement="bottom">side note</ful-tooltip>');
        container.style.margin = '200px 0 0 200px';
        const button = tooltip.querySelector('button');
        const note = tooltip.querySelector('[popover]');

        button.click();
        await settle();
        const b = button.getBoundingClientRect();
        const n = note.getBoundingClientRect();
        assert.isAtLeast(Math.round(n.top), Math.round(b.bottom) - 1, 'the note sits below the trigger');
        assert.closeTo(n.left + n.width / 2, b.left + b.width / 2, 1, 'the note is centered on the trigger');
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
    });
});

describe('Dialog', () => {
    it('shows the header, the body and the localized acknowledge button', async () => {
        const [dialog] = await mount('<ful-dialog header="the header">the body</ful-dialog>');

        assert.isNotNull(dialog.querySelector('header h2')?.textContent.match(/the header/));
        assert.include(dialog.querySelector("[data-ref='body']").textContent, 'the body');
        assert.strictEqual(dialog.querySelector('[data-ref=acknowledge]').textContent, 'Got it');
    });

    it('ask() resolves with the acknowledge result', async () => {
        const [dialog] = await mount('<ful-dialog>body</ful-dialog>');
        const asked = dialog.ask();

        assert.isTrue(dialog.querySelector('dialog').open);
        dialog.querySelector('[data-ref=acknowledge]').click();
        assert.strictEqual(await asked, 'acknowledged');
        assert.isFalse(dialog.querySelector('dialog').open);
    });

    it('ask() resolves with the data-result of the slotted button that closed it', async () => {
        const [dialog] = await mount(`
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
    });

    it('resolves null when the dialog closes without a result, as Escape does', async () => {
        const [dialog] = await mount('<ful-dialog>body</ful-dialog>');
        const asked = dialog.ask();

        dialog.querySelector('dialog').close();

        assert.isNull(await asked);
    });

    it('an Escape after an earlier answer resolves null, not the earlier answer', async () => {
        const [dialog] = await mount('<ful-dialog>body</ful-dialog>');
        const first = dialog.ask();
        dialog.querySelector('[data-ref=acknowledge]').click();
        assert.strictEqual(await first, 'acknowledged');

        const results = [];
        dialog.addEventListener('close', (e) => results.push(e.detail.result));
        const second = dialog.ask();
        dialog.querySelector('dialog').close();

        assert.isNull(await second, 'the stale acknowledged is not the answer');
        assert.deepStrictEqual(results, [null], 'the close event agrees');
    });

    it('a dialog leaving the document while open answers its waiters with null', async () => {
        const [dialog, container] = await mount('<ful-dialog>body</ful-dialog>');
        const asked = dialog.ask();
        //the removal is the subject of the test, not its teardown
        container.remove();

        assert.isNull(await asked, 'the await does not hang on a destroyed element');
    });

    it('answers with a close event carrying the answer', async () => {
        const [dialog] = await mount('<ful-dialog>body</ful-dialog>');
        const answers = [];
        dialog.addEventListener('close', (e) => answers.push(e.detail.result));

        //the close event is what the test is waiting for: waiting a macrotask
        //instead leaves it one scheduling hiccup away from failing
        const closed = new Promise((r) => dialog.addEventListener('close', r, { once: true }));
        dialog.ask();
        dialog.querySelector('[data-ref=acknowledge]').click();
        await closed;
        assert.deepStrictEqual(answers, ['acknowledged']);
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
    });
});

describe('Subclass reuse', () => {
    it('a custom tooltip keeps the wiring and the chrome through the structural hooks', async () => {
        class HelpTip extends Tooltip {
            static template = `
                <button type="button" class="ful-tip" data-ref="trigger" aria-label="help">?</button>
                <ful-note popover data-ref="content">{{{{ slots.default }}}}</ful-note>
            `;
        }
        registry.defineElement('x-help-tip', HelpTip);
        const [tip] = await mount('<x-help-tip placement="top">custom note</x-help-tip>');
        const button = tip.querySelector('button');
        const note = tip.querySelector('ful-note');

        assert.isTrue(button.classList.contains('ful-tip'));
        button.click();
        assert.isTrue(note.matches(':popover-open'));
        await settle();
        assert.strictEqual(button.getAttribute('aria-expanded'), 'true');
        assert.strictEqual(note.getAttribute('placement'), 'top');
    });

    it('a custom dialog keeps the card chrome through the class on the native dialog', async () => {
        class ConfirmDialog extends Dialog {
            static template = `
                <dialog data-ref="dialog" class="ful-dialog"><slot></slot></dialog>
            `;
        }
        registry.defineElement('x-confirm-dialog', ConfirmDialog);
        const [dialog] = await mount('<x-confirm-dialog>body</x-confirm-dialog>');

        assert.isTrue(dialog.querySelector('dialog').classList.contains('ful-dialog'));
        const asked = dialog.ask();
        assert.isTrue(dialog.querySelector('dialog').open);
        dialog.close('done');
        assert.strictEqual(await asked, 'done');
    });
});

describe('Dialog dismissal', () => {
    it('closes on the header button and answers its waiters with null', async () => {
        const [dialog] = await mount('<ful-dialog header="Publish?">the body</ful-dialog>');
        const close = dialog.querySelector('header button[data-ref=close]');
        assert.strictEqual(close.getAttribute('aria-label'), 'Close');

        const asked = dialog.ask();
        assert.isTrue(dialog.querySelector('dialog').open);
        close.click();

        assert.isNull(await asked, 'a dismissal is not an answer');
        assert.isFalse(dialog.querySelector('dialog').open);
    });
    it('carries a header for the button even with no heading to show', async () => {
        const [dialog] = await mount('<ful-dialog>the body</ful-dialog>');

        assert.strictEqual(dialog.querySelectorAll('header button[data-ref=close]').length, 1);
        assert.strictEqual(dialog.querySelectorAll('header h2').length, 0);
    });
    it('withholds the close button and refuses Escape under requires-answer', async () => {
        const [dialog] = await mount('<ful-dialog requires-answer header="Pick one">the body</ful-dialog>');
        const native = dialog.querySelector('dialog');

        assert.strictEqual(dialog.querySelectorAll('[data-ref=close]').length, 0);

        dialog.ask();
        assert.isTrue(native.open);
        //the platform's own dismissal, which the cancel event is the hook for
        native.dispatchEvent(new Event('cancel', { cancelable: true }));
        assert.isTrue(native.open, 'Escape leaves it open, the button being gone');

        dialog.close('answered');
        assert.isFalse(native.open, 'a result still closes it');
    });
    it('renders no header at all under requires-answer with nothing to head it', async () => {
        const [dialog] = await mount('<ful-dialog requires-answer>the body</ful-dialog>');

        assert.strictEqual(dialog.querySelectorAll('header').length, 0);
    });
    it('styles the chrome through the class wherever it stands, not only as a direct child', async () => {
        const [dialog] = await mount(
            '<ful-dialog header="h"><div><footer class="ful-dialog-footer" data-ref="nested"><button>a</button></footer></div></ful-dialog>',
        );
        const nested = dialog.querySelector('[data-ref=nested]');

        assert.strictEqual(getComputedStyle(nested).display, 'flex');
        assert.strictEqual(getComputedStyle(nested).justifyContent, 'flex-end');
    });
});

describe('Dialog, the section:requested contract', () => {
    it('fires on the body on open, first only the first time', async () => {
        const [dialog] = await mount('<ful-dialog header="h">the body</ful-dialog>');
        const seen = [];
        AsyncEvents.asyncOn(dialog, 'section:requested', (e) => {
            seen.push(e.detail.first);
            e.detail.section.append('delivered');
        });

        dialog.ask();
        await settle();
        assert.deepStrictEqual(seen, [true], 'ask() opens, the request fires');
        assert.include(dialog.querySelector('[data-ref=body]').textContent, 'delivered');

        dialog.close();
        await settle();
        dialog.ask();
        await settle();
        assert.deepStrictEqual(seen, [true, false]);
        dialog.close();
    });
});

describe('Dialog, refresh', () => {
    it('re-fires the body request, its failures painted and swallowed', async () => {
        const [dialog] = await mount('<ful-dialog header="h">the body</ful-dialog>');
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
    });
});
