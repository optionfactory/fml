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

        tabs.querySelector('ful-tablist').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
        assert.strictEqual(tabs.active, 1);
        tabs.querySelector('ful-tablist').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
        assert.strictEqual(tabs.active, 2);
        tabs.querySelector('ful-tablist').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
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

describe('Accordion', () => {
    const markup = `
        <ful-accordion>
            <details><summary>First</summary>one</details>
            <details open><summary>Second</summary>two</details>
            <details><summary>Third</summary>three</details>
        </ful-accordion>`;

    it('renders the disclosures inside the group, untouched', async () => {
        const [accordion, container] = await mount(markup);
        const details = accordion.querySelectorAll('ful-accordion-group > details');

        assert.lengthOf(details, 3);
        assert.isNull(details[0].getAttribute('name'), 'a free accordion assigns no name');
        assert.isTrue(details[1].open, 'the author-claimed open panel stays open');
        container.remove();
    });

    it('the exclusive claim names the group: opening one closes the others', async () => {
        const [accordion, container] = await mount(markup.replace('<ful-accordion>', '<ful-accordion exclusive>'));
        const details = [...accordion.querySelectorAll('ful-accordion-group > details')];

        assert.strictEqual(details[0].getAttribute('name'), details[2].getAttribute('name'), 'one shared name for the whole group');
        assert.isTrue(details[1].open);

        details[0].open = true;
        await settle();
        assert.isFalse(details[1].open, 'the platform closed the other named panel');
        container.remove();
    });

    it('the exclusive claim is a live door', async () => {
        const [accordion, container] = await mount(markup);
        const details = [...accordion.querySelectorAll('details')];

        accordion.exclusive = true;
        assert.strictEqual(details[0].getAttribute('name'), details[1].getAttribute('name'));
        assert.strictEqual(accordion.getAttribute('exclusive'), '');

        accordion.exclusive = false;
        assert.isNull(details[0].getAttribute('name'));
        container.remove();
    });
});

describe('Wizard', () => {
    const markup = `
        <ful-wizard>
            <template slot="steps"><step>Verifica</step><step>Modifica</step><step>Conferma</step></template>
            <section data-step="verifica"><p>verifica panel</p></section>
            <section data-step="modifica"><p>modifica panel</p></section>
            <section data-step="conferma"><p>conferma panel</p></section>
        </ful-wizard>`;

    it('renders the localized progress and shows only the first section', async () => {
        const [wizard, container] = await mount(markup);
        const list = wizard.querySelector('ful-steps ol');
        const steps = [...list.children];

        assert.strictEqual(list.getAttribute('aria-label'), 'Progress');
        assert.deepStrictEqual(
            steps.map((li) => li.textContent),
            ['Verifica', 'Modifica', 'Conferma'],
        );
        assert.strictEqual(steps[0].getAttribute('aria-current'), 'step');
        assert.strictEqual(wizard.querySelectorAll('section[aria-current=step]').length, 1);
        assert.strictEqual(wizard.querySelector('section[aria-current=step]').getAttribute('data-step'), 'verifica');
        assert.strictEqual(getComputedStyle(wizard.querySelector('[data-step=modifica]')).display, 'none', 'the chrome hides the steps ahead');
        container.remove();
    });

    it('next, prev and move walk the steps, answering with change', async () => {
        const [wizard, container] = await mount(markup);
        const changes = [];
        wizard.addEventListener('change', (e) => changes.push(e.detail));

        wizard.next();
        assert.strictEqual(wizard.index, 1);
        assert.strictEqual(wizard.step, 'modifica');
        assert.strictEqual(document.activeElement, wizard.querySelector('[data-step=modifica]'), 'the focus follows the step');

        wizard.move('conferma');
        assert.strictEqual(wizard.index, 2);

        wizard.next();
        assert.strictEqual(wizard.index, 2, 'next at the end stays');

        wizard.prev();
        wizard.prev();
        wizard.prev();
        assert.strictEqual(wizard.index, 0, 'prev at the start stays');

        assert.deepStrictEqual(changes, [
            { index: 1, step: 'modifica' },
            { index: 2, step: 'conferma' },
            { index: 1, step: 'modifica' },
            { index: 0, step: 'verifica' },
        ]);
        container.remove();
    });

    it('a section already carrying the claim keeps it', async () => {
        const [wizard, container] = await mount(markup.replace('<section data-step="modifica">', '<section data-step="modifica" aria-current="step">'));

        assert.strictEqual(wizard.index, 1);
        assert.strictEqual(wizard.querySelector('ol').children[1].getAttribute('aria-current'), 'step');
        container.remove();
    });
});
