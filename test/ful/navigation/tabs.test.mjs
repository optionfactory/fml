import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';

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

describe('Tabs', () => {
    const markup = `
        <ful-tabs>
            <template slot="tabs"><tab>Shipping</tab><tab>Invoices</tab><tab>Claims</tab></template>
            <section id="s1">shipping panel</section>
            <section id="s2">invoices panel</section>
            <section id="s3">claims panel</section>
        </ful-tabs>`;

    it('renders the tab pattern: a tablist of buttons naming tabpanels', async () => {
        const [tabs, container] = await mount(markup);
        const tablist = tabs.querySelector('ful-tablist');
        const buttons = [...tablist.querySelectorAll('button')];

        assert.strictEqual(tablist.getAttribute('role'), 'tablist');
        assert.lengthOf(buttons, 3);
        assert.deepStrictEqual(
            buttons.map((b) => b.textContent),
            ['Shipping', 'Invoices', 'Claims'],
        );
        for (const [i, button] of buttons.entries()) {
            assert.strictEqual(button.getAttribute('role'), 'tab');
            assert.strictEqual(button.getAttribute('aria-selected'), i === 0 ? 'true' : 'false');
            assert.strictEqual(button.tabIndex, i === 0 ? 0 : -1, 'the roving tabindex starts on the active tab');
            const panel = tabs.querySelector(`#${button.getAttribute('aria-controls')}`);
            assert.strictEqual(panel.getAttribute('role'), 'tabpanel');
            assert.strictEqual(panel.getAttribute('aria-labelledby'), button.id);
            assert.strictEqual(panel.hasAttribute('hidden'), i !== 0, 'only the active panel is shown');
        }
        container.remove();
    });

    it('moves the active panel by click and by property, answering with change', async () => {
        const [tabs, container] = await mount(markup);
        const changes = [];
        tabs.addEventListener('change', (e) => changes.push(e.detail));

        tabs.querySelectorAll('button')[1].click();
        assert.strictEqual(tabs.active, 1);
        assert.isTrue(tabs.querySelector('#s2').hidden === false, 'the second panel is the visible one');
        assert.deepStrictEqual(changes, [{ active: 1, previous: 0 }]);

        tabs.active = 2;
        assert.strictEqual(tabs.getAttribute('active'), '2', 'the property reflects to the attribute');
        assert.deepStrictEqual(changes[1], { active: 2, previous: 1 });
        container.remove();
    });

    it('walks the tabs with the keyboard, wrapping around', async () => {
        const [tabs, container] = await mount(markup);
        const buttons = tabs.querySelectorAll('button');
        buttons[0].focus();

        tabs.querySelector('ful-tablist').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
        );
        assert.strictEqual(tabs.active, 1);
        tabs.querySelector('ful-tablist').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }),
        );
        assert.strictEqual(tabs.active, 2);
        tabs.querySelector('ful-tablist').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
        );
        assert.strictEqual(tabs.active, 0, 'the walk wraps');
        assert.strictEqual(document.activeElement, buttons[0], 'the focus follows the walk');
        container.remove();
    });

    it('starts from the active attribute, clamped to the declared panels', async () => {
        const [tabs, container] = await mount(markup.replace('<ful-tabs>', '<ful-tabs active="9">'));

        assert.strictEqual(tabs.active, 2);
        container.remove();
    });
});
