import { assert } from 'chai';
import '../../../src/ful/index.mjs';
import { appended } from '../harness.mjs';

const attach = (html) => {
    const container = appended(html);
    return container;
};

describe('the cascade contract', () => {
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
        //every ful rule lives in a layer, so a page's own rule wins whatever it
        //looks like: this is the whole of the override contract
        const container = attach('<span class="ful-tip">?</span>');
        assert.strictEqual(getComputedStyle(container.querySelector('.ful-tip')).display, 'inline-flex');

        withSheet('.ful-tip { display: block }', () => {
            assert.strictEqual(
                getComputedStyle(container.querySelector('.ful-tip')).display,
                'block',
                'one unlayered class beats the library',
            );
        });
    });

    it('hides with the last layer rather than with an important, so a page can still show', () => {
        //the rule used to carry !important, which layers invert: in a layer an
        //important declaration gets stronger, not weaker, and a page could not
        //have overridden it at all
        const container = attach('<ful-spinner hidden>x</ful-spinner>');
        assert.strictEqual(getComputedStyle(container.firstElementChild).display, 'none');

        withSheet('ful-spinner[hidden] { display: inline-flex }', () => {
            assert.strictEqual(
                getComputedStyle(container.firstElementChild).display,
                'inline-flex',
                'a plain rule is enough to show it again',
            );
        });
    });

    it('still hides a part the chrome lays out with a stronger selector', () => {
        //what the important was for: `ful-spinner.centered` sets display and
        //outranks a bare `[hidden]`, so the select's own hidden spinner showed.
        //ful.hidden coming after ful.components settles it without one
        const container = attach('<ful-spinner class="centered" hidden>x</ful-spinner>');

        assert.strictEqual(getComputedStyle(container.firstElementChild).display, 'none');
    });
});

describe('style hooks', () => {
    it('the tip chrome follows the class on any trigger, not the button tag', () => {
        const container = attach('<span class="ful-tip">?</span>');

        assert.strictEqual(getComputedStyle(container.querySelector('.ful-tip')).display, 'inline-flex');
    });

    it('the tip chrome also matches the structure: the button before a note', () => {
        const container = attach(
            '<button type="button"><ful-icon name="info-circle"></ful-icon></button><ful-note popover>n</ful-note>',
        );

        assert.strictEqual(getComputedStyle(container.querySelector('button')).display, 'inline-flex');
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
        assert.strictEqual(getComputedStyle(drawer).position, 'fixed', 'the drawer chrome applied');
        dialog.close();
        drawer.close();
    });

    it('the toasts region is whoever hosts the toasts, its width the custom property', () => {
        const container = attach('<div style="--ful-toasts-max-width: 333px"><ful-toast>a toast</ful-toast></div>');
        const region = container.firstElementChild;

        assert.strictEqual(getComputedStyle(region).position, 'fixed');
        assert.strictEqual(getComputedStyle(region).maxWidth, '333px');
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
        assert.strictEqual(getComputedStyle(container.querySelector('ful-steps ol')).display, 'flex');
    });

    it('the spinner spins: its keyframes exist, not just their name', () => {
        const container = attach('<ful-spinner>loading</ful-spinner>');
        const spinner = container.querySelector('ful-spinner');

        assert.strictEqual(getComputedStyle(spinner, '::after').animationName, 'spinner-border');
        assert.isTrue(
            document.getAnimations().some((a) => a.effect?.target === spinner),
            'an unresolved keyframes name declares an animation that never runs',
        );
    });

    it('the backdrop spinner wears its card over the scrim', () => {
        const container = attach('<ful-spinner class="backdrop" hidden></ful-spinner>');
        const spinner = container.querySelector('ful-spinner');
        spinner.removeAttribute('hidden');

        assert.strictEqual(getComputedStyle(spinner).position, 'fixed', 'the page overlay');
        const card = getComputedStyle(spinner, '::before');
        assert.strictEqual(card.backgroundColor, 'rgb(255, 255, 255)', 'the card is back');
        assert.strictEqual(card.width, '128px', 'the card pads the glyph');
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
        assert.strictEqual(getComputedStyle(primary).color, 'rgb(255, 255, 255)');
        assert.strictEqual(getComputedStyle(ghost).backgroundColor, 'rgba(0, 0, 0, 0)', 'the ghost rests on nothing');
        assert.strictEqual(getComputedStyle(ghost).borderColor, 'rgb(0, 115, 118)', 'the ghost outlines the accent');
    });

    it('an anchor can wear the button chrome, disabled through aria-disabled', () => {
        const container = attach(`
            <a class="ful-button" href="https://example.com">go</a>
            <a class="ful-button ghost" href="https://example.com" aria-disabled="true">back</a>`);
        const [link, dimmed] = container.children;

        assert.strictEqual(getComputedStyle(link).display, 'inline-flex');
        assert.strictEqual(getComputedStyle(link).textDecorationLine, 'none', 'no anchor underline');
        assert.strictEqual(getComputedStyle(link).backgroundColor, 'rgb(0, 115, 118)', 'the accent fill holds');
        assert.strictEqual(getComputedStyle(dimmed).opacity, '0.5', 'the anchor dims without :disabled');
    });

    it('the input chrome matches whoever presents a bare input in a control group', () => {
        const container = attach('<div uppercase><label>L</label><ful-control-group><input></ful-control-group></div>');

        assert.strictEqual(getComputedStyle(container.firstElementChild).display, 'block');
        assert.strictEqual(getComputedStyle(container.querySelector('input')).textTransform, 'uppercase');
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

        assert.notStrictEqual(getComputedStyle(control).backgroundImage, 'none', 'the chevron follows the structure');
        assert.strictEqual(getComputedStyle(control).cursor, 'pointer');
    });

    it('the file chrome matches whoever presents a file input in a control group', () => {
        const container = attach('<div><ful-control-group><input type="file"></ful-control-group></div>');

        assert.strictEqual(getComputedStyle(container.querySelector('input[type=file]')).paddingLeft, '0px');
    });

    it('the radio group chrome matches whoever hosts a fieldset of radio cards', () => {
        const container = attach(`
            <div>
                <fieldset>
                    <legend>L</legend>
                    <ful-radio-list><label><input type="radio"></label></ful-radio-list>
                </fieldset>
            </div>`);

        assert.strictEqual(getComputedStyle(container.querySelector('legend')).fontSize, '16px');
        assert.strictEqual(getComputedStyle(container.querySelector('ful-radio-list')).display, 'grid');
    });

    it('the checkbox required marker matches whoever hosts a choice row', () => {
        const container = attach('<div required><ful-choice><label>x</label></ful-choice></div>');

        assert.include(getComputedStyle(container.querySelector('label'), '::before').content, '*');
    });

    it('the table chrome follows the ful-table-wrapper, the pagination its bar', () => {
        const container = attach(`
            <div>
                <ful-table-wrapper><table><thead></thead><tbody><tr><td>x</td></tr></tbody></table></ful-table-wrapper>
            </div>
            <div><ful-pagination-bar><ul><li data-ref="index">p 1 of 2</li><li><button type="button">2</button></li></ul></ful-pagination-bar></div>`);

        assert.strictEqual(
            getComputedStyle(container.querySelector('ful-table-wrapper > table')).borderCollapse,
            'collapse',
        );
        assert.strictEqual(getComputedStyle(container.querySelector('ful-pagination-bar > ul')).display, 'flex');
        assert.strictEqual(getComputedStyle(container.querySelector('ful-pagination-bar button')).minWidth, '36px');
    });
});
