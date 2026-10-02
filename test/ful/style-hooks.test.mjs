import { assert } from 'chai';
import '../../../src/ful/index.mjs';
import { appended } from '../harness.mjs';

const attach = (html) => {
    const container = appended(html);
    return container;
};

describe('The cascade contract', () => {
    const withSheet = (css, run) => {
        const sheet = document.createElement('style');
        sheet.textContent = css;
        document.head.appendChild(sheet);
        try {
            run();
        } finally {
            sheet.remove();
        }
    };

    it('lets an unlayered rule beat the library at any specificity', () => {
        const container = attach('<span class="ful-tip">?</span>');
        assert.strictEqual(
            getComputedStyle(container.querySelector('.ful-tip')).display,
            'inline-flex',
            'without a page rule the library lays the tip out inline-flex',
        );

        withSheet('.ful-tip { display: block }', () => {
            assert.strictEqual(
                getComputedStyle(container.querySelector('.ful-tip')).display,
                'block',
                'one unlayered class beats the library',
            );
        });
    });

    it('hides with the last layer rather than with an important, so a page can still show', () => {
        const container = attach('<ful-spinner hidden>x</ful-spinner>');
        assert.strictEqual(
            getComputedStyle(container.firstElementChild).display,
            'none',
            "the hidden attribute hides the spinner through the library's last layer",
        );

        withSheet('ful-spinner[hidden] { display: inline-flex }', () => {
            assert.strictEqual(
                getComputedStyle(container.firstElementChild).display,
                'inline-flex',
                'a plain rule is enough to show it again',
            );
        });
    });

    it('still hides a part the chrome lays out with a stronger selector', () => {
        const container = attach('<ful-spinner class="centered" hidden>x</ful-spinner>');

        assert.strictEqual(
            getComputedStyle(container.firstElementChild).display,
            'none',
            'the hidden layer comes after the components layer, so it beats the component chrome whatever its specificity',
        );
    });
});

describe('Style hooks', () => {
    it('the tip chrome follows the class on any trigger, not the button tag', () => {
        const container = attach('<span class="ful-tip">?</span>');

        assert.strictEqual(
            getComputedStyle(container.querySelector('.ful-tip')).display,
            'inline-flex',
            'the tip chrome applies to a span carrying the ful-tip class, not only to a button',
        );
    });

    it('the tip chrome also matches the structure: the button before a note', () => {
        const container = attach(
            '<button type="button"><ful-icon name="info-circle"></ful-icon></button><ful-note popover>n</ful-note>',
        );

        assert.strictEqual(
            getComputedStyle(container.querySelector('button')).display,
            'inline-flex',
            'a button followed by a ful-note popover gets the tip chrome without any class',
        );
    });

    it('the note chrome answers to the ful-note tag and the .ful-note class alike', async () => {
        const container = attach('<ful-note popover></ful-note><div class="ful-note" popover></div>');
        const [tagged, classed] = container.children;

        assert.strictEqual(getComputedStyle(tagged).display, 'none', 'the style-only tag rests hidden');
        assert.strictEqual(getComputedStyle(classed).display, 'none', 'the class rests hidden too');

        tagged.showPopover();
        assert.strictEqual(getComputedStyle(tagged).display, 'block', 'the style-only tag opens');
        tagged.hidePopover();
        classed.showPopover();
        assert.strictEqual(getComputedStyle(classed).display, 'block', 'the class opens too');
    });

    it('the dialog and the drawer chrome follow their class onto a bare native dialog, geometry included', () => {
        const container = attach(`
            <dialog class="ful-dialog" style="--ful-dialog-width: 500px"></dialog>
            <dialog class="ful-drawer" style="--ful-drawer-width: 400px"></dialog>`);
        const dialog = container.querySelector('.ful-dialog');
        const drawer = container.querySelector('.ful-drawer');

        dialog.showModal();
        drawer.showModal();
        assert.strictEqual(getComputedStyle(dialog).width, '500px', 'the width is the custom property');
        assert.strictEqual(getComputedStyle(drawer).width, '400px', 'the width is the custom property');
        assert.strictEqual(
            getComputedStyle(drawer).position,
            'fixed',
            'the ful-drawer class alone gives a bare native dialog the fixed side panel chrome',
        );
        dialog.close();
        drawer.close();
    });

    it('the toasts region is whoever hosts the toasts, its width the custom property', () => {
        const container = attach('<div style="--ful-toasts-max-width: 333px"><ful-toast>a toast</ful-toast></div>');
        const region = container.firstElementChild;

        assert.strictEqual(
            getComputedStyle(region).position,
            'fixed',
            'an element hosting a ful-toast gets the fixed region chrome',
        );
        assert.strictEqual(
            getComputedStyle(region).maxWidth,
            '333px',
            "the region's max width is read from the ful-toasts-max-width custom property",
        );
        assert.strictEqual(
            getComputedStyle(region.querySelector('ful-toast')).animationName,
            'ful-toast-in',
            'the item chrome anchors on the tag',
        );
    });

    it('every icon glyph the library names resolves its mask', () => {
        const names = [
            'info-circle',
            'info-circle-fill',
            'x-lg',
            'search',
            'arrow-clockwise',
            'chevron-left',
            'chevron-right',
            'chevron-down',
            'arrow-down',
            'arrow-up',
            'inbox',
            'star',
            'upload',
        ];
        const container = attach(names.map((name) => `<ful-icon name="${name}"></ful-icon>`).join(''));

        for (const icon of container.querySelectorAll('ful-icon')) {
            assert.notStrictEqual(
                getComputedStyle(icon).maskImage,
                'none',
                `${icon.getAttribute('name')} carries its mask`,
            );
        }
    });

    it('the tablist, accordion group and steps chrome follow their style-only tags', () => {
        const container = attach(`
            <div><ful-tablist role="tablist"><button type="button" role="tab" aria-selected="true">a</button></ful-tablist></div>
            <div><ful-accordion-group><details><summary>s</summary>c</details></ful-accordion-group></div>
            <div><ful-steps><ol><li>one</li><li aria-current="step">two</li><li>three</li></ol></ful-steps></div>`);

        assert.strictEqual(
            getComputedStyle(container.querySelector('ful-tablist > button')).fontWeight,
            '600',
            'the selected tab chrome anchors on the tag',
        );
        assert.notStrictEqual(
            getComputedStyle(container.querySelector('details > summary'), '::after').content,
            'none',
            'the summary carries its chevron',
        );
        assert.strictEqual(
            getComputedStyle(container.querySelector('ful-steps ol')).display,
            'flex',
            'the ol inside ful-steps is laid out as a row of steps',
        );
    });

    it('the spinner spins: its keyframes exist, not just their name', () => {
        const container = attach('<ful-spinner>loading</ful-spinner>');
        const spinner = container.querySelector('ful-spinner');

        assert.strictEqual(
            getComputedStyle(spinner, '::after').animationName,
            'ful-spinner-border',
            "the spinner's pseudo-element names the ful-spinner-border keyframes",
        );
        assert.isTrue(
            document.getAnimations().some((a) => a.effect?.target === spinner),
            'an unresolved keyframes name declares an animation that never runs',
        );
    });

    it('the backdrop spinner wears its card over the scrim', () => {
        const container = attach('<ful-spinner class="backdrop" hidden></ful-spinner>');
        const spinner = container.querySelector('ful-spinner');
        spinner.removeAttribute('hidden');

        assert.strictEqual(
            getComputedStyle(spinner).position,
            'fixed',
            'the backdrop spinner is fixed so it covers the whole page',
        );
        const card = getComputedStyle(spinner, '::before');
        assert.strictEqual(
            card.backgroundColor,
            'rgb(255, 255, 255)',
            'the backdrop spinner draws a white card behind its glyph over the scrim',
        );
        assert.strictEqual(card.width, '128px', 'the card is wider than the glyph so it pads around it');
    });

    it('the button classes carry the themed chrome, ghost included', () => {
        const container = attach(
            '<button type="button" class="ful-button">go</button><button type="button" class="ful-button ghost">back</button>',
        );
        const [primary, ghost] = container.children;

        assert.strictEqual(
            getComputedStyle(primary).backgroundColor,
            'rgb(0, 115, 118)',
            'the primary rests on the accent pair',
        );
        assert.strictEqual(
            getComputedStyle(primary).color,
            'rgb(255, 255, 255)',
            "the primary button's text is white on the accent fill",
        );
        assert.strictEqual(getComputedStyle(ghost).backgroundColor, 'rgba(0, 0, 0, 0)', 'the ghost rests on nothing');
        assert.strictEqual(getComputedStyle(ghost).borderColor, 'rgb(0, 115, 118)', 'the ghost outlines the accent');
    });

    it('an anchor can wear the button chrome, disabled through aria-disabled', () => {
        const container = attach(`
            <a class="ful-button" href="https://example.com">go</a>
            <a class="ful-button ghost" href="https://example.com" aria-disabled="true">back</a>`);
        const [link, dimmed] = container.children;

        assert.strictEqual(
            getComputedStyle(link).display,
            'inline-flex',
            'an anchor with the ful-button class is laid out as a button is',
        );
        assert.strictEqual(
            getComputedStyle(link).textDecorationLine,
            'none',
            'an anchor with the ful-button class loses the link underline',
        );
        assert.strictEqual(
            getComputedStyle(link).backgroundColor,
            'rgb(0, 115, 118)',
            'an anchor with the ful-button class carries the accent fill',
        );
        assert.strictEqual(getComputedStyle(dimmed).opacity, '0.5', 'the anchor dims without :disabled');
    });

    it('the input chrome matches whoever presents a bare input in a control group', () => {
        const container = attach('<div uppercase><label>L</label><ful-control-group><input></ful-control-group></div>');

        assert.strictEqual(
            getComputedStyle(container.firstElementChild).display,
            'block',
            'whatever element hosts a control group is laid out as a block',
        );
        assert.strictEqual(
            getComputedStyle(container.querySelector('input')).textTransform,
            'uppercase',
            'the uppercase attribute on the host uppercases its bare input',
        );
    });

    it('the select chrome matches whoever opens a dropdown from its control group', () => {
        const container = attach(`
            <div>
                <ful-control-group>
                    <ful-control></ful-control>
                    <ful-dropdown hidden></ful-dropdown>
                </ful-control-group>
            </div>`);
        const control = container.querySelector('ful-control');

        assert.notStrictEqual(
            getComputedStyle(control, '::after').maskImage,
            'none',
            'the chevron follows the structure',
        );
        assert.strictEqual(
            getComputedStyle(control, '::after').backgroundColor,
            getComputedStyle(control).color,
            'drawn in the text colour',
        );
        assert.strictEqual(
            getComputedStyle(control).cursor,
            'pointer',
            'the control of a group opening a dropdown shows a pointer cursor',
        );
    });

    it('the file chrome matches whoever presents a file input in a control group', () => {
        const container = attach('<div><ful-control-group><input type="file"></ful-control-group></div>');

        assert.strictEqual(
            getComputedStyle(container.querySelector('input[type=file]')).paddingLeft,
            '0px',
            "the file chrome removes the input's own left padding, the file selector button standing at its edge",
        );
    });

    it('the radio group chrome matches whoever hosts a fieldset of radio cards', () => {
        const container = attach(`
            <div>
                <fieldset>
                    <legend>L</legend>
                    <ful-radio-list><label><input type="radio"></label></ful-radio-list>
                </fieldset>
            </div>`);

        assert.strictEqual(
            getComputedStyle(container.querySelector('legend')).fontSize,
            '16px',
            'the legend of a fieldset of radio cards is set at 16px',
        );
        assert.strictEqual(
            getComputedStyle(container.querySelector('ful-radio-list')).display,
            'grid',
            'the ful-radio-list of such a fieldset is laid out as a grid of cards',
        );
    });

    it('the checkbox required marker matches whoever hosts a choice row', () => {
        const container = attach('<div required><ful-choice><label>x</label></ful-choice></div>');

        assert.include(
            getComputedStyle(container.querySelector('label'), '::before').content,
            '*',
            "the required attribute on a choice row's host marks its label with an asterisk",
        );
    });

    it('the table chrome follows the ful-table-wrapper, the pagination its bar', () => {
        const container = attach(`
            <div>
                <ful-table-wrapper><table><thead></thead><tbody><tr><td>x</td></tr></tbody></table></ful-table-wrapper>
            </div>
            <div><ful-pagination-bar><ul><li data-ref="index">p 1 of 2</li><li><button type="button">2</button></li></ul></ful-pagination-bar></div>`);

        assert.strictEqual(
            getComputedStyle(container.querySelector('ful-table-wrapper > table')).borderCollapse,
            'separate',
            "the table under ful-table-wrapper keeps its borders separate, so the sticky header's border moves with it",
        );
        assert.strictEqual(
            getComputedStyle(container.querySelector('ful-pagination-bar > ul')).display,
            'flex',
            'the pagination list under ful-pagination-bar is laid out as a row',
        );
        assert.strictEqual(
            getComputedStyle(container.querySelector('ful-pagination-bar button')).minWidth,
            '36px',
            'the pagination buttons are given a minimum width',
        );
    });

    it('paints the switch knob in the colour the theme puts on the accent', () => {
        const container = attach(`
            <ful-choice switch style="--ful-active-color: rgb(1, 2, 3)"><input type="checkbox"><label>s</label></ful-choice>`);
        const knob = getComputedStyle(container.querySelector('input'), '::before').backgroundColor;

        assert.strictEqual(
            knob,
            'rgb(1, 2, 3)',
            'the knob follows --ful-active-color, so a theme with dark text on its accent gets a matching knob',
        );
    });

    it('keeps the table headers in view, opaque, while the rows scroll under them', () => {
        const rows = Array.from({ length: 40 }, (x, i) => `<tr><td>${i}</td></tr>`).join('');
        const container = attach(`
            <div style="height: 120px; overflow: auto">
                <div>
                    <ful-table-wrapper><table><thead><tr><th>h</th></tr></thead><tbody>${rows}</tbody></table></ful-table-wrapper>
                </div>
            </div>`);
        const box = container.firstElementChild;
        const th = container.querySelector('th');

        box.scrollTop = 300;

        assert.strictEqual(
            th.getBoundingClientRect().top,
            box.getBoundingClientRect().top,
            'the sticky header stays at the top of the scrolled box while the rows scroll',
        );
        assert.notStrictEqual(
            getComputedStyle(th).backgroundColor,
            'rgba(0, 0, 0, 0)',
            'the sticky header has an opaque background so the rows scrolling under it do not show through',
        );
    });
});
