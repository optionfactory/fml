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
        assert.strictEqual(
            getComputedStyle(wizard.querySelector('[data-step=modifica]')).display,
            'none',
            'the chrome hides the steps ahead',
        );
        container.remove();
    });

    it('next, prev and move walk the steps, answering with change', async () => {
        const [wizard, container] = await mount(markup);
        const changes = [];
        wizard.addEventListener('change', (e) => changes.push(e.detail));

        wizard.next();
        assert.strictEqual(wizard.index, 1);
        assert.strictEqual(wizard.step, 'modifica');
        assert.strictEqual(
            document.activeElement,
            wizard.querySelector('[data-step=modifica]'),
            'the focus follows the step',
        );

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
        const [wizard, container] = await mount(
            markup.replace('<section data-step="modifica">', '<section data-step="modifica" aria-current="step">'),
        );

        assert.strictEqual(wizard.index, 1);
        assert.strictEqual(wizard.querySelector('ol').children[1].getAttribute('aria-current'), 'step');
        container.remove();
    });
});
