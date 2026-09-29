import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin, Tooltip } from '../../../src/ful/index.mjs';
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
        const trigger = tooltip.querySelector('.ful-tip');

        const described = (control.getAttribute('aria-describedby') ?? '').split(' ');
        assert.include(described, note.id, 'the note is part of the description');
        assert.strictEqual(described.length, 2, 'beside the field error region, which keeps its own entry');
        assert.strictEqual(trigger.tabIndex, -1, 'the marker is no longer a tab stop');

        //the marker still opens the note: only sequential focus was taken away
        trigger.click();
        assert.isTrue(note.matches(':popover-open'));
        note.hidePopover();

        assert.isFalse(field.describedBy(null), 'a field takes nothing rather than everything');
    });
    it('stays readable inside a disabled fieldset', async () => {
        const [fs] = await mount(
            '<fieldset disabled><ful-input name="vat">VAT<ful-tooltip slot="info">eleven digits</ful-tooltip></ful-input></fieldset>',
        );
        const tooltip = fs.querySelector('ful-tooltip');
        const note = tooltip.querySelector('[popover]');
        const trigger = tooltip.querySelector('.ful-tip');

        assert.isFalse(trigger.matches(':disabled'), 'the marker is not a form control, so the fieldset does not reach it');
        assert.strictEqual(trigger.tabIndex, 0, 'and it keeps its tab stop');

        trigger.click();
        assert.isTrue(note.matches(':popover-open'), 'a refused field still explains itself');
        note.hidePopover();
    });
    it('opens the note from the keyboard', async () => {
        const [tooltip] = await mount('<ful-tooltip>eleven digits</ful-tooltip>');
        const note = tooltip.querySelector('[popover]');
        const trigger = tooltip.querySelector('.ful-tip');

        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        assert.isTrue(note.matches(':popover-open'), 'Enter opens it, as it would a button');
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        assert.isFalse(note.matches(':popover-open'), 'and Space closes it again');
    });
    it('keeps its tab stop where nothing took the note', async () => {
        const [tooltip] = await mount('<ful-tooltip describes>eleven digits</ful-tooltip>');
        const trigger = tooltip.querySelector('.ful-tip');

        assert.strictEqual(trigger.tabIndex, 0, 'a note nothing carries stays reachable through the marker');
    });
    it('is not described unless it says so', async () => {
        const [field] = await mount(
            '<ful-input name="vat">VAT<ful-tooltip slot="info">eleven digits</ful-tooltip></ful-input>',
        );
        const control = field.querySelector('input');
        const note = field.querySelector('ful-tooltip [popover]');

        assert.notInclude(control.getAttribute('aria-describedby').split(' '), note.id);
        assert.strictEqual(field.querySelector('ful-tooltip .ful-tip').tabIndex, 0);
    });
    it('renders an icon marker wired to a popover carrying the explanation', async () => {
        const [tooltip, container] = await mount('<ful-tooltip>explains the label</ful-tooltip>');
        //the default placement is above, and the placing clamps into the
        //viewport rather than flipping, so the trigger needs room over it
        container.style.marginTop = '200px';
        const button = tooltip.querySelector('.ful-tip');
        const popover = tooltip.querySelector('[popover]');

        assert.strictEqual(button.getAttribute('aria-label'), 'More information');
        assert.isNull(button.getAttribute('popovertarget'), 'a marker is not a form control, so it drives the note from script');
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
        const button = tooltip.querySelector('.ful-tip');
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

        const button = label.querySelector('ful-tooltip .ful-tip').getBoundingClientRect();

        //vertical-align: middle alone puts it on the midpoint of the x-height,
        //about a tenth of an em low. The tolerance covers the whole pixel the
        //engines round the measured ascent to
        assert.closeTo((button.top + button.bottom) / 2, textCentre, 1, 'the trigger rides the text it explains');
    });

    it('draws a callout pointing back at the trigger, which the popover overflow would otherwise clip', async () => {
        const [tooltip, container] = await mount('<ful-tooltip>explains the label</ful-tooltip>');
        container.style.marginTop = '200px';
        const button = tooltip.querySelector('.ful-tip');
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
        const button = tooltip.querySelector('.ful-tip');
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
        const button = tooltip.querySelector('.ful-tip');
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
        const button = tooltip.querySelector('.ful-tip');
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
        const button = tooltip.querySelector('.ful-tip');
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
        const button = tooltip.querySelector('.ful-tip');
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
        const button = tooltip.querySelector('.ful-tip');
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

describe('Tooltip subclass reuse', () => {
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
});
