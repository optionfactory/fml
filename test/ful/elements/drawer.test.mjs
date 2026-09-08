import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Failure } from '../../../src/httpc/index.mjs';
import { Plugin, Drawer } from '../../../src/ful/index.mjs';

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

describe('Drawer', () => {
    it('renders the title, the localized close button and the slotted body', async () => {
        const [drawer, container] = await mount('<ful-drawer title="the title">the body</ful-drawer>');

        assert.strictEqual(drawer.querySelector('[data-ref=title]').textContent, 'the title');
        assert.strictEqual(drawer.querySelector('[data-ref=close]').getAttribute('aria-label'), 'Close');
        assert.include(drawer.querySelector('[data-ref=content]').textContent, 'the body');
        assert.isFalse(drawer.querySelector('dialog').open);
        container.remove();
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
        container.remove();
    });

    it('update() shows the loading state, then the delivered content', async () => {
        const [drawer, container] = await mount('<ful-drawer title="t">old</ful-drawer>');
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
        container.remove();
    });

    it('update() reports a rejecting callback in the error section and rethrows', async () => {
        const [drawer, container] = await mount('<ful-drawer title="t">body</ful-drawer>');
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
        container.remove();
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
        const [panel, container] = await mount('<x-side-panel title="t" placement="start">body</x-side-panel>');

        const dialog = panel.querySelector('dialog');
        assert.isTrue(dialog.classList.contains('ful-drawer'));
        assert.strictEqual(dialog.getAttribute('placement'), 'start');
        const content = await panel.update('the panel', () => document.createElement('p'));
        assert.strictEqual(content.querySelector('p').localName, 'p');
        panel.close();
        container.remove();
    });
});
