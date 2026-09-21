import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Failure } from '../../../src/httpc/index.mjs';
import { AsyncEvents, Plugin, Drawer } from '../../../src/ful/index.mjs';
import { appended, settle as drain } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const settle = () => drain(20, 80);
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

    it('opens on the inline end side by default, and on the start side when asked', async () => {
        const [drawer] = await mount('<ful-drawer title="t">body</ful-drawer>');
        const [side] = await mount('<ful-drawer title="t" placement="start">body</ful-drawer>');

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
        drawer.addEventListener('close', (e) => closes.push(e.detail));

        //waiting for the event itself, not for a macrotask to have passed
        const closed = new Promise((r) => drawer.addEventListener('close', r, { once: true }));
        drawer.open();
        drawer.close();
        await closed;
        assert.deepStrictEqual(closes, [{ dismissed: true, response: null }]);
    });

    it('dismisses on a click outside the panel, which the backdrop takes for the dialog', async () => {
        const [drawer] = await mount('<ful-drawer title="t">body</ful-drawer>');
        const dialog = drawer.querySelector('dialog');
        const closes = [];
        drawer.addEventListener('close', (e) => closes.push(e.detail));

        const closed = new Promise((r) => drawer.addEventListener('close', r, { once: true }));
        drawer.open();
        dialog.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await closed;
        assert.isFalse(dialog.open);
        assert.deepStrictEqual(closes, [{ dismissed: true, response: null }], 'a backdrop click is a dismissal like any other');
    });

    it('stays open when a click inside it merely ends over the backdrop', async () => {
        const [drawer] = await mount('<ful-drawer title="t"><p data-ref="body">body</p></ful-drawer>');
        const dialog = drawer.querySelector('dialog');
        drawer.open();

        //a selection dragged out of the panel: the press was inside, the release is not
        drawer.querySelector('[data-ref=body]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        assert.isTrue(dialog.open);
        drawer.close();
    });

    it('closes on its own form succeeding, the close event carrying the response', async () => {
        const [drawer] = await mount(`
            <ful-drawer title="Edit" close-on-submit>
                <ful-form data-ref="edit">
                    <ful-input name="label" value="a">Label</ful-input>
                    <button type="submit">Save</button>
                </ful-form>
            </ful-drawer>`);
        const form = drawer.querySelector('ful-form');
        AsyncEvents.asyncOn(form, 'submit:requested', async () => ({ id: 7 }));
        const closes = [];
        drawer.addEventListener('close', (e) => closes.push(e.detail));

        drawer.open();
        const closed = new Promise((r) => drawer.addEventListener('close', r, { once: true }));
        form.querySelector('button[type=submit]').click();
        await closed;

        assert.isFalse(drawer.querySelector('dialog').open);
        assert.deepStrictEqual(closes, [{ dismissed: false, response: { id: 7 } }]);
    });

    it('a save answering with no body at all is still a save, not a dismissal', async () => {
        const [drawer] = await mount(`
            <ful-drawer title="Edit" close-on-submit>
                <ful-form><ful-input name="label" value="a">Label</ful-input><button type="submit">Save</button></ful-form>
            </ful-drawer>`);
        const form = drawer.querySelector('ful-form');
        AsyncEvents.asyncOn(form, 'submit:requested', async () => null);
        const closes = [];
        drawer.addEventListener('close', (e) => closes.push(e.detail));

        drawer.open();
        const closed = new Promise((r) => drawer.addEventListener('close', r, { once: true }));
        form.querySelector('button[type=submit]').click();
        await closed;

        assert.deepStrictEqual(closes, [{ dismissed: false, response: null }]);
    });

    it('stays open on a failed submit, the form keeping the problems', async () => {
        const [drawer] = await mount(`
            <ful-drawer title="Edit" close-on-submit>
                <ful-form><ful-input name="label" value="a">Label</ful-input><button type="submit">Save</button></ful-form>
            </ful-drawer>`);
        const form = drawer.querySelector('ful-form');
        AsyncEvents.asyncOn(form, 'submit:requested', async () => {
            throw new Error('rejected upstream');
        });

        drawer.open();
        form.querySelector('button[type=submit]').click();
        await settle();

        assert.isTrue(drawer.querySelector('dialog').open, 'the problems are of no use behind a closed drawer');
    });

    it('closes on a form update() delivered, the listener outliving every delivery', async () => {
        const [drawer] = await mount('<ful-drawer title="Edit" close-on-submit></ful-drawer>');
        const delivered = document.createElement('ful-form');
        delivered.innerHTML = '<ful-input name="label" value="a">Label</ful-input><button type="submit">Save</button>';

        const content = await drawer.update('Edit', async () => delivered);
        await settle();
        const form = content.querySelector('ful-form');
        AsyncEvents.asyncOn(form, 'submit:requested', async () => ({ id: 9 }));
        const closes = [];
        drawer.addEventListener('close', (e) => closes.push(e.detail));

        const closed = new Promise((r) => drawer.addEventListener('close', r, { once: true }));
        form.querySelector('button[type=submit]').click();
        await closed;

        assert.deepStrictEqual(closes, [{ dismissed: false, response: { id: 9 } }]);
    });

    it('is not closed by a form of its own content: a table searching is not the drawer finishing', async () => {
        const [drawer] = await mount(`
            <ful-drawer title="Pick" close-on-submit>
                <ful-table page-size="5">
                    <div slot="filters">
                        <ful-filter-text name="byName">Name</ful-filter-text>
                        <button type="submit">Search</button>
                    </div>
                    <template slot="schema"><schema><column title="Name">{{ name }}</column></schema></template>
                </ful-table>
            </ful-drawer>`);

        drawer.open();
        drawer.querySelector('ful-table button[type=submit]').click();
        await settle();

        assert.isTrue(drawer.querySelector('dialog').open, "the table's own filter form is not the drawer's");
    });

    it('leaves a drawer that did not ask for it alone', async () => {
        const [drawer] = await mount(`
            <ful-drawer title="Edit">
                <ful-form><ful-input name="label" value="a">Label</ful-input><button type="submit">Save</button></ful-form>
            </ful-drawer>`);
        const form = drawer.querySelector('ful-form');
        AsyncEvents.asyncOn(form, 'submit:requested', async () => ({ id: 7 }));

        drawer.open();
        form.querySelector('button[type=submit]').click();
        await settle();

        assert.isTrue(drawer.querySelector('dialog').open, 'closing on submit is opt in');
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

describe('Drawer header slot', () => {
    it('renders slotted content in the header, before the title', async () => {
        const [el] = await mount(
            '<ful-drawer title="Nave"><i slot="header" class="bi bi-water"></i>body</ful-drawer>',
        );
        const header = el.querySelector('header');
        const icon = header.querySelector('i');
        assert.isNotNull(icon, 'the slot is rendered into the header');
        assert.strictEqual(icon.className, 'bi bi-water');
        assert.strictEqual(
            header.firstElementChild.tagName,
            'I',
            'before the title, where a leading affordance belongs',
        );
    });

    it('keeps it when the title changes, the title being set as text', async () => {
        const [el] = await mount('<ful-drawer title="a"><i slot="header"></i>body</ful-drawer>');
        await el.update('Dati Nave', async () => document.createElement('p'));
        assert.strictEqual(el.querySelector('header > h2').textContent, 'Dati Nave');
        assert.strictEqual(el.querySelectorAll('header > i').length, 1, 'the slot survives the title');
    });

    it('renders no stray node when nothing is slotted', async () => {
        const [el] = await mount('<ful-drawer title="a">body</ful-drawer>');
        assert.strictEqual(el.querySelector('header').firstElementChild.tagName, 'H2');
    });
});
