import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Failure } from '../../../src/httpc/index.mjs';
import { AsyncEvents, Plugin, Drawer } from '../../../src/ful/index.mjs';
import { appended } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const settle = async () => {
    for (let i = 0; i !== 20; ++i) {
        await new Promise((r) => setTimeout(r, 0));
    }
};
const mount = async (html) => {
    const container = appended(html);
    await Rendering.waitFor(container);
    await settle();
    return [container.firstElementChild, container];
};

describe('Drawer', () => {
    it('renders the title, the localized close button and the slotted body', async () => {
        const [drawer] = await mount('<ful-drawer title="the title">the body</ful-drawer>');

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

    it('opens and closes, and any dialog-target element opens it too', async () => {
        const [drawer, container] = await mount(`
            <ful-drawer id="target-drawer" title="t">body</ful-drawer>
            <button type="button" dialog-target="target-drawer">details</button>`);
        const dialog = drawer.querySelector('dialog');

        drawer.open();
        assert.isTrue(dialog.open);

        drawer.close();
        assert.isFalse(dialog.open);

        container.querySelector('[dialog-target]').click();
        assert.isTrue(dialog.open);
        drawer.close();
    });

    it('update() shows the loading state, then the delivered content', async () => {
        const [drawer] = await mount('<ful-drawer title="t">old</ful-drawer>');
        let deliver;
        const updated = drawer.update('Nuova controparte', () => new Promise((resolve) => (deliver = resolve)));

        assert.isTrue(drawer.querySelector('dialog').open);
        assert.isFalse(drawer.querySelector('[data-ref=loading]').hasAttribute('hidden'));
        assert.isTrue(drawer.querySelector('[data-ref=content]').hasAttribute('hidden'));

        const form = document.createElement('form');
        deliver(form);
        const content = await updated;

        assert.strictEqual(drawer.title, 'Nuova controparte');
        assert.isTrue(drawer.querySelector('[data-ref=loading]').hasAttribute('hidden'));
        assert.isFalse(content.hasAttribute('hidden'));
        assert.strictEqual(content.querySelector('form'), form, 'update resolves with the content section');
    });

    it('update() reports a rejecting callback in the error section and rethrows', async () => {
        const [drawer] = await mount('<ful-drawer title="t">body</ful-drawer>');
        const failure = new Failure('invalid', [
            { type: 'FIELD_ERROR', context: null, reason: 'must not be blank' },
            { type: 'GENERIC_PROBLEM', context: null, reason: 'start is after end' },
        ]);
        const failed = drawer.update('title', async () => {
            throw failure;
        });

        await failed.then(
            () => assert.fail('the rejection travels to the caller'),
            (e) => assert.strictEqual(e, failure),
        );

        const error = drawer.querySelector('[data-ref=error]');
        assert.isFalse(error.hasAttribute('hidden'));
        assert.include(error.textContent, 'must not be blank');
        assert.include(error.textContent, 'start is after end');
        assert.isTrue(drawer.querySelector('[data-ref=loading]').hasAttribute('hidden'));
    });

    it('a superseded update owns nothing: its outcome is not painted, a newer one wins', async () => {
        const [drawer] = await mount('<ful-drawer title="t">body</ful-drawer>');
        let deliverFirst;
        const first = drawer.update('first', () => new Promise((resolve) => (deliverFirst = resolve)));
        const second = drawer.update('second', async () => {
            const fresh = document.createElement('p');
            fresh.textContent = 'the newer content';
            return fresh;
        });
        const secondContent = await second;
        assert.include(secondContent.textContent, 'the newer content');

        const stale = document.createElement('p');
        stale.textContent = 'the stale content';
        deliverFirst(stale);
        const firstContent = await first;
        assert.strictEqual(firstContent, secondContent, 'the drawer has one content section, shared by its openings');
        assert.isFalse(stale.isConnected, 'the superseded delivery was never painted');
        assert.include(
            drawer.querySelector('[data-ref=content]').textContent,
            'the newer content',
            'only the newer outcome is painted',
        );
        assert.isTrue(drawer.querySelector('[data-ref=loading]').hasAttribute('hidden'));
    });

    it('answers with a close event, Escape included', async () => {
        const [drawer] = await mount('<ful-drawer title="t">body</ful-drawer>');
        const closes = [];
        drawer.addEventListener('close', () => closes.push('closed'));

        drawer.open();
        drawer.close();
        await new Promise((r) => setTimeout(r));
        assert.deepStrictEqual(closes, ['closed']);
    });

    it('slides in from the inline end side, mirrored in rtl', async () => {
        const [wrapper, rtlContainer] = await mount('<div dir="rtl"><ful-drawer title="t">body</ful-drawer></div>');
        const rtlDrawer = wrapper.querySelector('ful-drawer');
        rtlDrawer.open();
        assert.strictEqual(
            getComputedStyle(rtlDrawer.querySelector('dialog')).animationName,
            'ful-drawer-slide-in-start',
            'rtl end is ltr start',
        );
        rtlDrawer.close();
        rtlContainer.remove();
        const [drawer] = await mount('<ful-drawer title="t">body</ful-drawer>');
        drawer.open();
        assert.strictEqual(
            getComputedStyle(drawer.querySelector('dialog')).animationName,
            'ful-drawer-slide-in',
            'ltr end',
        );
        drawer.close();
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
        const [panel] = await mount('<x-side-panel title="t" placement="start">body</x-side-panel>');

        const dialog = panel.querySelector('dialog');
        assert.isTrue(dialog.classList.contains('ful-drawer'));
        assert.strictEqual(dialog.getAttribute('placement'), 'start');
        const content = await panel.update('the panel', () => document.createElement('p'));
        assert.strictEqual(content.querySelector('p').localName, 'p');
        panel.close();
    });
});

describe('Drawer, the section:requested contract', () => {
    it('fires on the content when opened, not when update() owns the cycle', async () => {
        const [drawer] = await mount('<ful-drawer title="t"></ful-drawer>');
        const seen = [];
        AsyncEvents.asyncOn(drawer, 'section:requested', (e) => {
            seen.push(e.detail.first);
            e.detail.section.append('delivered');
        });

        drawer.open();
        await settle();

        assert.deepStrictEqual(seen, [true]);
        assert.include(drawer.querySelector('[data-ref=content]').textContent, 'delivered');

        drawer.close();
        await settle();
        await drawer.update('title', async () => document.createElement('p'));
        drawer.open();
        await settle();

        assert.deepStrictEqual(seen, [true], 'update() owns its cycle, its open fires nothing');
        drawer.close();
        await settle();

        drawer.open();
        await settle();
        assert.deepStrictEqual(seen, [true, false], 'a later declarative open asks again');
        drawer.close();
    });
});

describe('Drawer, the declarative content against update()', () => {
    const frames = async () => {
        for (let i = 0; i !== 3; ++i) {
            await new Promise((r) => requestAnimationFrame(() => r()));
        }
    };

    it('rests the chrome update() left behind, the delivery landing on a visible content', async () => {
        const [drawer] = await mount('<ful-drawer title="t"></ful-drawer>');
        await drawer
            .update('title', async () => {
                throw new Failure('invalid', [{ type: 'GENERIC', context: null, reason: 'nope' }]);
            })
            .then(
                () => assert.fail('update rejects'),
                () => undefined,
            );
        drawer.close();
        await settle();

        AsyncEvents.asyncOn(drawer, 'section:requested', async (e) => {
            await new Promise((r) => setTimeout(r, 100));
            e.detail.section.append('delivered');
        });
        drawer.open();
        await frames();

        const content = drawer.querySelector('[data-ref=content]');
        const error = drawer.querySelector('[data-ref=error]');
        assert.isFalse(content.hasAttribute('hidden'), 'the content update() hid is visible again');
        assert.isTrue(content.hasAttribute('loading'), 'the ring owns the visible wait');
        assert.isTrue(error.hasAttribute('hidden'), 'the stale update error left with the open');
        await new Promise((r) => setTimeout(r, 300));

        assert.include(content.textContent, 'delivered');
        drawer.close();
    });

    it("a user reopen during an update's wait is a real open", async () => {
        const [drawer] = await mount('<ful-drawer title="t"></ful-drawer>');
        const fired = [];
        AsyncEvents.asyncOn(drawer, 'section:requested', (e) => fired.push(e.detail.first));
        const waiting = drawer.update('title', () => new Promise(() => {}));

        drawer.close();
        await settle();
        drawer.open();
        await settle();

        assert.deepStrictEqual(fired, [true], "the update's own open stays quiet, the user's reopen fires");
        drawer.close();
        void waiting;
    });

    it('refresh re-fires the content request, its failures painted and swallowed', async () => {
        const [drawer] = await mount('<ful-drawer title="t"></ful-drawer>');
        let fail = true;
        AsyncEvents.asyncOn(drawer, 'section:requested', () => {
            if (fail) {
                throw new Error('boom');
            }
        });

        await drawer.refresh();
        assert.isNotNull(drawer.querySelector('[data-ref=content] > .ful-section-error'));

        fail = false;
        await drawer.refresh();
        assert.strictEqual(drawer.querySelector('[data-ref=content] > .ful-section-error'), null);
    });
});
