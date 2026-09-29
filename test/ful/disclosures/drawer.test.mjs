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

        assert.strictEqual(drawer.querySelector('[data-ref=title]').textContent, 'the title');
        assert.strictEqual(drawer.querySelector('[data-ref=close]').getAttribute('aria-label'), 'Close');
        assert.include(drawer.querySelector('[data-ref=content]').textContent, 'the body');
        assert.isFalse(drawer.querySelector('dialog').open);
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

        //the ua sheet pins both inline insets to 0: without an explicit
        //inset-inline-start: auto the definite width is over-constrained and the
        //drawer lands against the start edge, the opposite side from the default
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

                assert.strictEqual(dialog.getBoundingClientRect().width, 400, placement);
                assert.deepStrictEqual(
                    [
                        style.borderStartStartRadius,
                        style.borderStartEndRadius,
                        style.borderEndStartRadius,
                        style.borderEndEndRadius,
                    ],
                    ['0px', '0px', '0px', '0px'],
                    placement,
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

        //waiting for the event itself, not for a macrotask to have passed
        const closed = new Promise((r) => drawer.addEventListener('close', r, { once: true }));
        drawer.open();
        drawer.close();
        await closed;
        assert.deepStrictEqual(closes, [{ dismissed: true, response: null }]);
    });

    it('slides in from the inline end side, mirrored in rtl', async () => {
        const [wrapper, rtlContainer] = await mount('<div dir="rtl"><ful-drawer header="t">body</ful-drawer></div>');
        const rtlDrawer = wrapper.querySelector('ful-drawer');
        rtlDrawer.open();
        assert.strictEqual(
            getComputedStyle(rtlDrawer.querySelector('dialog')).animationName,
            'ful-drawer-slide-in-start',
            'rtl end is ltr start',
        );
        rtlDrawer.close();
        rtlContainer.remove();
        const [drawer] = await mount('<ful-drawer header="t">body</ful-drawer>');
        drawer.open();
        assert.strictEqual(
            getComputedStyle(drawer.querySelector('dialog')).animationName,
            'ful-drawer-slide-in',
            'ltr end',
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
        assert.strictEqual(getComputedStyle(dialog).animationName, 'ful-drawer-slide-out');
        assert.deepStrictEqual(closes, [], 'nothing is announced before the panel has left');

        drawer.close();
        await done;
        await settle();

        assert.isFalse(dialog.open);
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
        assert.strictEqual(getComputedStyle(dialog).animationName, 'ful-drawer-slide-out');

        await done;
        assert.isFalse(dialog.open);
        assert.deepStrictEqual(closes, [{ dismissed: true, response: null }]);
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
        assert.strictEqual(getComputedStyle(dialog).animationName, 'ful-drawer-slide-out');
        await dismissed;

        drawer.open();
        await settle();
        const saved = new Promise((r) => drawer.addEventListener('close', r, { once: true }));
        form.querySelector('button[type=submit]').click();
        await new Promise((r) => setTimeout(r, 0));
        assert.strictEqual(getComputedStyle(dialog).animationName, 'ful-drawer-slide-out');
        const { detail } = await saved;
        assert.deepStrictEqual(detail, { dismissed: false, response: { id: 7 } });
    });

    it('is put back by a reopen during the slide out, rather than closing under it', async () => {
        const [drawer] = await mount('<ful-drawer header="t">body</ful-drawer>');
        const dialog = drawer.querySelector('dialog');
        const closes = [];
        drawer.addEventListener('close', (e) => closes.push(e.detail));
        drawer.open();

        drawer.close();
        drawer.open();
        assert.isFalse(dialog.hasAttribute('closing'));
        assert.strictEqual(getComputedStyle(dialog).animationName, 'ful-drawer-slide-in');

        await Promise.all(dialog.getAnimations().map((a) => a.finished));
        await settle();

        assert.isTrue(dialog.open, 'the abandoned slide out does not take the reopened drawer with it');
        assert.deepStrictEqual(closes, []);
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
        assert.isTrue(dialog.classList.contains('ful-drawer'));
        assert.strictEqual(dialog.getAttribute('placement'), 'start');
        assert.strictEqual(panel.querySelector('[data-ref=title]').textContent, 't');
        const content = await panel.update('the panel', () => document.createElement('p'));
        assert.strictEqual(content.querySelector('p').localName, 'p');
        assert.strictEqual(panel.querySelector('[data-ref=title]').textContent, 'the panel');
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
                () => assert.fail('update rejects'),
                () => undefined,
            );
        await closed(drawer);
        await settle();

        //the delivery is held open by the test rather than by a timer: a wait
        //measured in frames against a delivery measured in milliseconds is a
        //race, and under a loaded suite the frames are the slower of the two,
        //so the ring this asserts on had already been taken down
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

        assert.include(content.textContent, 'delivered');
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
        assert.strictEqual(el.querySelector('header > h2').textContent, 'Dati Nave');
        assert.strictEqual(el.header, 'Dati Nave', 'the property reads the heading');
        assert.strictEqual(el.querySelectorAll('header > i').length, 1, 'the slot survives the title');
    });

    it('renders no stray node when nothing is slotted', async () => {
        const [el] = await mount('<ful-drawer header="a">body</ful-drawer>');
        assert.strictEqual(el.querySelector('header').firstElementChild.tagName, 'H2');
    });
});
