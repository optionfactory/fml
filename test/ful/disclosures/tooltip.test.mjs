import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin, Tooltip } from '../../../src/ful/index.mjs';
import { appended, settle as drain } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const settle = () => drain();
const mount = async (html) => {
    const container = appended(html);
    await Rendering.waitFor(container);
    await settle();
    return [container.firstElementChild, container];
};

describe('Tooltip', () => {
    it('shows the configured icon, and the one the icon attribute names', async () => {
        const [plain] = await mount('<ful-tooltip>explains the label</ful-tooltip>');
        assert.strictEqual(
            plain.querySelector('ful-icon').getAttribute('name'),
            'info-circle-fill',
            'without an icon attribute the marker is the icon the page-wide config names',
        );

        const [warned] = await mount('<ful-tooltip icon="exclamation-circle">check it</ful-tooltip>');
        assert.strictEqual(
            warned.querySelector('ful-icon').getAttribute('name'),
            'exclamation-circle',
            'the icon attribute names the marker for this one tooltip',
        );
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

        trigger.click();
        assert.isTrue(note.matches(':popover-open'), "a described tooltip's marker still opens the note on click");
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

        assert.isFalse(
            trigger.matches(':disabled'),
            'the marker is not a form control, so the fieldset does not reach it',
        );
        assert.strictEqual(trigger.tabIndex, 0, 'and it keeps its tab stop');

        trigger.click();
        assert.isTrue(note.matches(':popover-open'), 'a refused field still explains itself');
        note.hidePopover();
    });
    it('wraps its note inside an affix, whose own text never wraps', async () => {
        const [field] = await mount(
            `<ful-input name="q">Search<ful-tooltip slot="before">${'a long explanation of the search syntax '.repeat(4)}</ful-tooltip></ful-input>`,
        );
        const note = field.querySelector('ful-affix ful-tooltip [popover]');
        note.showPopover();

        const lineHeight = parseFloat(getComputedStyle(note).lineHeight);
        assert.isAbove(
            note.getBoundingClientRect().height,
            2 * lineHeight,
            'a note longer than its max-width breaks into lines instead of running off on one',
        );
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

        assert.notInclude(
            control.getAttribute('aria-describedby').split(' '),
            note.id,
            "a tooltip without describes does not add its note to the control's description",
        );
        assert.strictEqual(
            field.querySelector('ful-tooltip .ful-tip').tabIndex,
            0,
            'a tooltip without describes keeps its marker as a tab stop',
        );
    });
    it('renders an icon marker wired to a popover carrying the explanation', async () => {
        const [tooltip, container] = await mount('<ful-tooltip>explains the label</ful-tooltip>');
        container.style.marginTop = '200px';
        const button = tooltip.querySelector('.ful-tip');
        const popover = tooltip.querySelector('[popover]');

        assert.strictEqual(
            button.getAttribute('aria-label'),
            'More information',
            'the marker is named with the localized More information label',
        );
        assert.isNull(
            button.getAttribute('popovertarget'),
            'a marker is not a form control, so it drives the note from script',
        );
        assert.strictEqual(
            button.getAttribute('aria-expanded'),
            'false',
            'the marker says aria-expanded false while the note is closed',
        );
        assert.include(popover.textContent, 'explains the label', "the default slot is the note's text");

        button.click();
        assert.isTrue(popover.matches(':popover-open'), 'a click on the marker opens the note');
        await settle();
        assert.strictEqual(
            button.getAttribute('aria-expanded'),
            'true',
            "the marker's aria-expanded follows the note to open",
        );
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
        assert.isFalse(popover.matches(':popover-open'), 'a second click on the marker closes the note');
        await settle();
        assert.strictEqual(
            button.getAttribute('aria-expanded'),
            'false',
            "the marker's aria-expanded follows the note back to closed",
        );
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
        const strut = document.createElement('span');
        strut.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
        label.insertBefore(strut, label.firstChild);
        const baseline = strut.getBoundingClientRect().top;
        strut.remove();
        const style = getComputedStyle(label);
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const ink = ctx.measureText('HEX');
        const textCentre = baseline + (ink.actualBoundingBoxDescent - ink.actualBoundingBoxAscent) / 2;

        const button = label.querySelector('ful-tooltip .ful-tip').getBoundingClientRect();

        assert.closeTo((button.top + button.bottom) / 2, textCentre, 1, 'the trigger rides the text it explains');
    });

    it('draws a callout pointing back at the trigger, which the popover overflow would otherwise clip', async () => {
        const [tooltip, container] = await mount('<ful-tooltip>explains the label</ful-tooltip>');
        container.style.marginTop = '200px';
        const button = tooltip.querySelector('.ful-tip');
        const note = tooltip.querySelector('[popover]');

        button.click();
        await settle();

        assert.strictEqual(
            getComputedStyle(note).overflow,
            'visible',
            'the open note does not clip its overflow, so the callout drawn outside its box stays visible',
        );
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

describe('Tooltip placement', () => {
    it('leaves the css gap between the note and the trigger, and keeps it on every later placing', async () => {
        const [tooltip, container] = await mount('<ful-tooltip>explains the label</ful-tooltip>');
        container.style.marginTop = '200px';
        const button = tooltip.querySelector('.ful-tip');
        const note = tooltip.querySelector('[popover]');
        const gap = parseFloat(getComputedStyle(note).marginTop);
        assert.isAbove(gap, 0, 'the stylesheet declares a gap');
        const distance = () => button.getBoundingClientRect().top - note.getBoundingClientRect().bottom;

        button.click();
        await settle();

        assert.closeTo(distance(), gap, 1, 'the hand placement honours the gap the anchor css leaves');

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

        assert.isTrue(
            button.classList.contains('ful-tip'),
            "the subclass template's ful-tip class is kept on the marker",
        );
        button.click();
        assert.isTrue(
            note.matches(':popover-open'),
            'a subclass marker carrying data-ref trigger still opens its note on click',
        );
        await settle();
        assert.strictEqual(
            button.getAttribute('aria-expanded'),
            'true',
            "the subclass marker's aria-expanded follows the note to open",
        );
        assert.strictEqual(
            note.getAttribute('placement'),
            'top',
            "the placement attribute is copied onto the subclass's note",
        );
    });
});
