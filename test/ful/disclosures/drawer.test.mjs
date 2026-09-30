import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Failure } from '../../../src/httpc/index.mjs';
import { AsyncEvents, Plugin, Drawer } from '../../../src/ful/index.mjs';
import { setViewport } from '@web/test-runner-commands';
import { appended, settle as drain } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

before(() => {
    const style = document.createElement('style');
    style.id = 'quick-drawer-slides';
    style.textContent = 'dialog.ful-drawer { animation-duration: 10ms !important; }';
    document.head.append(style);
});
after(() => document.getElementById('quick-drawer-slides')?.remove());

const settle = () => drain();
const closed = async (drawer) => {
    const done = new Promise((resolve) => drawer.addEventListener('close', resolve, { once: true }));
    drawer.close();
    await done;
};
const mount = async (html) => {
    const container = appended(html);
    await Rendering.waitFor(container);
    await settle();
    return [container.firstElementChild, container];
};

describe('Drawer', () => {
    it('renders the title, the localized close button and the slotted body', async () => {
        const [drawer] = await mount('<ful-drawer header="the title">the body</ful-drawer>');

        assert.strictEqual(
            drawer.querySelector('[data-ref=title]').textContent,
            'the title',
            'the header attribute is rendered as the initial title',
        );
        assert.strictEqual(
            drawer.querySelector('[data-ref=close]').getAttribute('aria-label'),
            'Close',
            'the close button is named for assistive technology with the localized Close',
        );
        assert.include(
            drawer.querySelector('[data-ref=content]').textContent,
            'the body',
            'the default slot is rendered as the content',
        );
        assert.isFalse(drawer.querySelector('dialog').open, 'a drawer is not shown until it is opened');
        assert.strictEqual(
            getComputedStyle(drawer.querySelector('dialog')).display,
            'none',
            'a closed drawer stays unseen',
        );
    });

    it('names the drawer through its heading', async () => {
        const [drawer] = await mount('<ful-drawer header="the title">the body</ful-drawer>');
        const heading = drawer.querySelector('[data-ref=title]');
        assert.ok(heading.id, 'the heading is named');
        assert.strictEqual(
            drawer.querySelector('dialog').getAttribute('aria-labelledby'),
            heading.id,
            'the drawer is named by its heading',
        );
    });

    it('closes at once where motion is not wanted', async () => {
        const [drawer] = await mount('<ful-drawer header="t">body</ful-drawer>');
        const dialog = drawer.querySelector('dialog');
        const real = window.matchMedia;
        /** @type any */ (window).matchMedia = (q) =>
            String(q).includes('prefers-reduced-motion') ? { matches: true } : real.call(window, q);
        try {
            drawer.open();
            drawer.close();

            assert.isFalse(dialog.open, 'no animation is waited for');
            assert.isFalse(dialog.hasAttribute('closing'), 'no closing state is written');
        } finally {
            window.matchMedia = real;
        }
    });

    it('closes without an out animation to wait for', async () => {
        const [drawer, container] = await mount('<ful-drawer header="t">body</ful-drawer>');
        const style = document.createElement('style');
        style.textContent = 'dialog.ful-drawer { animation: none !important; }';
        container.prepend(style);
        const dialog = drawer.querySelector('dialog');

        drawer.open();
        drawer.close();

        assert.isFalse(dialog.open, 'no animationend will ever come, the close lands at once');
    });

    it('opens on the inline end side by default, and on the start side when asked', async () => {
        const [drawer] = await mount('<ful-drawer header="t">body</ful-drawer>');
        const [side] = await mount('<ful-drawer header="t" placement="start">body</ful-drawer>');

        drawer.open();
        side.open();

        const end = drawer.querySelector('dialog').getBoundingClientRect();
        const start = side.querySelector('dialog').getBoundingClientRect();
        assert.isAbove(
            end.left - start.left,
            end.width / 2,
            'the two placements sit on opposite edges, not both against the start one',
        );

        drawer.close();
        side.close();
    });

    it('fills a phone screen edge to edge with square corners, on either side', async function () {
        this.timeout(10000);
        const { innerWidth: width, innerHeight: height } = window;
        await setViewport({ width: 400, height: 800 });
        try {
            for (const placement of ['end', 'start']) {
                const [drawer] = await mount(`<ful-drawer header="t" placement="${placement}">body</ful-drawer>`);
                drawer.open();
                const dialog = drawer.querySelector('dialog');
                const style = getComputedStyle(dialog);

                assert.strictEqual(
                    dialog.getBoundingClientRect().width,
                    400,
                    `on a phone the ${placement} drawer spans the whole screen width`,
                );
                assert.deepStrictEqual(
                    [
                        style.borderStartStartRadius,
                        style.borderStartEndRadius,
                        style.borderEndStartRadius,
                        style.borderEndEndRadius,
                    ],
                    ['0px', '0px', '0px', '0px'],
                    `on a phone the ${placement} drawer, touching both edges, has square corners`,
                );
                drawer.close();
            }
        } finally {
            await setViewport({ width, height });
        }
    });

    it('answers with a close event, Escape included', async () => {
        const [drawer] = await mount('<ful-drawer header="t">body</ful-drawer>');
        const closes = [];
        drawer.addEventListener('close', (e) => closes.push(e.detail));

        const closed = new Promise((r) => drawer.addEventListener('close', r, { once: true }));
        drawer.open();
        drawer.close();
        await closed;
        assert.deepStrictEqual(
            closes,
            [{ dismissed: true, response: null }],
            'a close from code is a dismissal carrying no response',
        );
    });

    it('slides in from the inline end side, mirrored in rtl', async () => {
        const [wrapper, rtlContainer] = await mount('<div dir="rtl"><ful-drawer header="t">body</ful-drawer></div>');
        const rtlDrawer = wrapper.querySelector('ful-drawer');
        rtlDrawer.open();
        assert.strictEqual(
            getComputedStyle(rtlDrawer.querySelector('dialog')).animationName,
            'ful-drawer-slide-in-start',
            'under rtl the inline end is the physical left, so the drawer slides in with the start side animation',
        );
        rtlDrawer.close();
        rtlContainer.remove();
        const [drawer] = await mount('<ful-drawer header="t">body</ful-drawer>');
        drawer.open();
        assert.strictEqual(
            getComputedStyle(drawer.querySelector('dialog')).animationName,
            'ful-drawer-slide-in',
            'under ltr the drawer slides in from the inline end, its default placement',
        );
        drawer.close();
    });

    it('slides out before it closes, the close event arriving once, after the animation', async () => {
        const [drawer] = await mount('<ful-drawer header="t">body</ful-drawer>');
        const dialog = drawer.querySelector('dialog');
        const closes = [];
        drawer.addEventListener('close', (e) => closes.push(e.detail));
        drawer.open();

        const done = new Promise((r) => drawer.addEventListener('close', r, { once: true }));
        drawer.close();
        assert.isTrue(dialog.open, 'the panel is still on screen while it slides out');
        assert.strictEqual(
            getComputedStyle(dialog).animationName,
            'ful-drawer-slide-out',
            'the closing drawer runs the slide out animation',
        );
        assert.deepStrictEqual(closes, [], 'nothing is announced before the panel has left');

        drawer.close();
        await done;
        await settle();

        assert.isFalse(dialog.open, 'the native dialog closes once the slide out has ended');
        assert.isFalse(dialog.hasAttribute('closing'), 'the closing state leaves with the close');
        assert.deepStrictEqual(closes, [{ dismissed: true, response: null }], 'one close, not one per call');
    });

    it('slides out on Escape, which the platform delivers as a cancel', async () => {
        const [drawer] = await mount('<ful-drawer header="t">body</ful-drawer>');
        const dialog = drawer.querySelector('dialog');
        const closes = [];
        drawer.addEventListener('close', (e) => closes.push(e.detail));
        drawer.open();

        const done = new Promise((r) => drawer.addEventListener('close', r, { once: true }));
        dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
        assert.isTrue(dialog.open, 'the platform close is refused so the drawer can animate its own');
        assert.strictEqual(
            getComputedStyle(dialog).animationName,
            'ful-drawer-slide-out',
            'the cancel starts the slide out animation instead of the platform close',
        );

        await done;
        assert.isFalse(dialog.open, 'the native dialog closes once the slide out has ended');
        assert.deepStrictEqual(
            closes,
            [{ dismissed: true, response: null }],
            'Escape is a dismissal, announced by one close event',
        );
    });

    it('slides out on a backdrop dismissal and on its own form succeeding', async () => {
        const [drawer] = await mount(`
            <ful-drawer header="Edit" close-on-submit>
                <ful-form><ful-input name="label" value="a">Label</ful-input><button type="submit">Save</button></ful-form>
            </ful-drawer>`);
        const dialog = drawer.querySelector('dialog');
        const form = drawer.querySelector('ful-form');
        AsyncEvents.asyncOn(form, 'submit:requested', async () => ({ id: 7 }));

        drawer.open();
        const dismissed = new Promise((r) => drawer.addEventListener('close', r, { once: true }));
        dialog.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        assert.strictEqual(
            getComputedStyle(dialog).animationName,
            'ful-drawer-slide-out',
            'a backdrop dismissal slides the drawer out rather than closing at once',
        );
        await dismissed;

        drawer.open();
        await settle();
        const saved = new Promise((r) => drawer.addEventListener('close', r, { once: true }));
        form.querySelector('button[type=submit]').click();
        await new Promise((r) => setTimeout(r, 0));
        assert.strictEqual(
            getComputedStyle(dialog).animationName,
            'ful-drawer-slide-out',
            'a successful submit under close-on-submit slides the drawer out rather than closing at once',
        );
        const { detail } = await saved;
        assert.deepStrictEqual(
            detail,
            { dismissed: false, response: { id: 7 } },
            "the submit closes as an answer carrying the form's response",
        );
    });

    it('is put back by a reopen during the slide out, rather than closing under it', async () => {
        const [drawer] = await mount('<ful-drawer header="t">body</ful-drawer>');
        const dialog = drawer.querySelector('dialog');
        const closes = [];
        drawer.addEventListener('close', (e) => closes.push(e.detail));
        drawer.open();

        drawer.close();
        drawer.open();
        assert.isFalse(dialog.hasAttribute('closing'), 'a reopen during the slide out removes the closing state');
        assert.strictEqual(
            getComputedStyle(dialog).animationName,
            'ful-drawer-slide-in',
            'the reopened drawer slides in again',
        );

        await Promise.all(dialog.getAnimations().map((a) => a.finished));
        await settle();

        assert.isTrue(dialog.open, 'the abandoned slide out does not take the reopened drawer with it');
        assert.deepStrictEqual(closes, [], 'a reopened drawer announces no close for the slide out it abandoned');
        await closed(drawer);
    });
});

describe('Drawer subclass reuse', () => {
    it('a custom drawer keeps the side chrome through the class on the native dialog', async () => {
        class SidePanel extends Drawer {
            static template = `
                <dialog data-ref="dialog" class="ful-drawer">
                    <header><h2 data-ref="title">{{ title }}</h2><button type="button" data-ref="close">x</button></header>
                    <section data-ref="loading" hidden></section>
                    <section data-ref="error" role="alert" hidden></section>
                    <section data-ref="content">{{{{ slots.default }}}}</section>
                </dialog>
            `;
        }
        registry.defineElement('x-side-panel', SidePanel);
        const [panel] = await mount('<x-side-panel header="t" placement="start">body</x-side-panel>');

        const dialog = panel.querySelector('dialog');
        assert.isTrue(
            dialog.classList.contains('ful-drawer'),
            "the class written on the subclass's native dialog is kept, and the side chrome is styled by that class",
        );
        assert.strictEqual(
            dialog.getAttribute('placement'),
            'start',
            "the placement attribute is copied onto the subclass's native dialog",
        );
        assert.strictEqual(
            panel.querySelector('[data-ref=title]').textContent,
            't',
            "the header attribute is rendered in the subclass's title",
        );
        const content = await panel.update('the panel', () => document.createElement('p'));
        assert.strictEqual(
            content.querySelector('p').localName,
            'p',
            'update() on a subclass fills its content section with the delivery',
        );
        assert.strictEqual(
            panel.querySelector('[data-ref=title]').textContent,
            'the panel',
            "update() sets the subclass's title from its header argument",
        );
        panel.close();
    });
});

describe('Drawer, the declarative content against update()', () => {
    const frames = async () => {
        for (let i = 0; i !== 3; ++i) {
            await new Promise((r) => requestAnimationFrame(() => r()));
        }
    };

    it('rests the chrome update() left behind, the delivery landing on a visible content', async () => {
        const [drawer] = await mount('<ful-drawer header="t"></ful-drawer>');
        await drawer
            .update('title', async () => {
                throw new Failure('invalid', [{ type: 'GENERIC', context: null, reason: 'nope' }]);
            })
            .then(
                () => assert.fail('an update whose callback throws rejects its caller'),
                () => undefined,
            );
        await closed(drawer);
        await settle();

        const delivery = Promise.withResolvers();
        AsyncEvents.asyncOn(drawer, 'section:requested', async (e) => {
            await delivery.promise;
            e.detail.section.append('delivered');
        });
        drawer.open();
        await frames();

        const content = drawer.querySelector('[data-ref=content]');
        const error = drawer.querySelector('[data-ref=error]');
        assert.isFalse(content.hasAttribute('hidden'), 'the content update() hid is visible again');
        assert.isTrue(content.hasAttribute('loading'), 'the ring owns the visible wait');
        assert.isTrue(error.hasAttribute('hidden'), 'the stale update error left with the open');

        delivery.resolve();
        await settle();

        assert.include(
            content.textContent,
            'delivered',
            'the declarative delivery is painted into the content section',
        );
        assert.isFalse(content.hasAttribute('loading'), 'the ring leaves with the delivery');
        drawer.close();
    });

    it("a user reopen during an update's wait is a real open", async () => {
        const [drawer] = await mount('<ful-drawer header="t"></ful-drawer>');
        const fired = [];
        AsyncEvents.asyncOn(drawer, 'section:requested', (e) => fired.push(e.detail.first));
        const waiting = drawer.update('title', () => new Promise(() => {}));

        await closed(drawer);
        await settle();
        drawer.open();
        await settle();

        assert.deepStrictEqual(fired, [true], "the update's own open stays quiet, the user's reopen fires");
        drawer.close();
        void waiting;
    });
});

describe('Drawer header slot', () => {
    it('keeps it when the title changes, the title being set as text', async () => {
        const [el] = await mount('<ful-drawer header="a"><i slot="header"></i>body</ful-drawer>');
        await el.update('Dati Nave', async () => document.createElement('p'));
        assert.strictEqual(
            el.querySelector('header > h2').textContent,
            'Dati Nave',
            "update() sets the title as the heading's text",
        );
        assert.strictEqual(el.header, 'Dati Nave', 'the property reads the heading');
        assert.strictEqual(el.querySelectorAll('header > i').length, 1, 'the slot survives the title');
    });

    it('renders no stray node when nothing is slotted', async () => {
        const [el] = await mount('<ful-drawer header="a">body</ful-drawer>');
        assert.strictEqual(
            el.querySelector('header').firstElementChild.tagName,
            'H2',
            'without a header slot the heading is the first element of the header, no empty placeholder before it',
        );
    });
});
