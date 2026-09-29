import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { AsyncEvents, Plugin } from '../../../src/ful/index.mjs';
import { appended, captureConsole, settle as drain } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const settle = () => drain();
const mount = async (html) => {
    const container = appended(html);
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
        const [wizard] = await mount(markup);
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
    });

    it('next, prev and move walk the steps, answering with change', async () => {
        const [wizard] = await mount(markup);
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
    });

    it('a section already carrying the claim keeps it', async () => {
        const [wizard] = await mount(
            markup.replace('<section data-step="modifica">', '<section data-step="modifica" aria-current="step">'),
        );

        assert.strictEqual(wizard.index, 1);
        assert.strictEqual(wizard.querySelector('ol').children[1].getAttribute('aria-current'), 'step');
    });
});

describe('Wizard, async sections', () => {
    const markup = `
        <ful-wizard>
            <template slot="steps"><step>One</step><step>Two</step><step>Three</step></template>
            <section data-step="one">first</section>
            <section data-step="two"></section>
            <section data-step="three"></section>
        </ful-wizard>`;

    it('fires the section requests on the component for the entered section, and again on refresh', async () => {
        const [wizard] = await mount(markup);
        const section = wizard.querySelector('[data-step=two]');
        const seen = [];
        AsyncEvents.asyncOn(wizard, 'section:requested', (e) =>
            seen.push(
                `generic|${e.detail.name}|${e.detail.index}|${e.detail.first}|${e.detail.section === section}|${e.target === wizard}`,
            ),
        );
        AsyncEvents.asyncOn(wizard, 'section:requested:#1', (e) => seen.push(`index|${e.detail.name}`));
        AsyncEvents.asyncOn(wizard, 'section:requested:two', (e) => seen.push(`named|${e.detail.index}`));

        await wizard.move('two');
        await wizard.refresh('two');

        assert.deepStrictEqual(seen, [
            'generic|two|1|true|true|true',
            'index|two',
            'named|1',
            'generic|two|1|false|true|true',
            'index|two',
            'named|1',
        ]);
    });

    it('awaits the answers: the delivery is painted when move resolves', async () => {
        const [wizard] = await mount(markup);
        AsyncEvents.asyncOn(wizard, 'section:requested:two', async (e) => {
            await new Promise((r) => setTimeout(r, 20));
            e.detail.section.append('delivered');
        });

        await wizard.move('two');

        assert.include(wizard.querySelector('[data-step=two]').textContent, 'delivered');
    });

    it('rejects the move with the failure of its delivery', async () => {
        const [wizard] = await mount(markup);
        const failure = { problems: [{ reason: 'unreachable (demo)' }] };
        AsyncEvents.asyncOn(wizard, 'section:requested:two', () => {
            throw failure;
        });

        await wizard.move('two').then(
            () => assert.fail('the rejection travels to the caller'),
            (e) => assert.isTrue(e === failure),
        );
    });

    it('shows only the current step by default, the counter hooks left to the page', async () => {
        const [wizard] = await mount(markup);
        const steps = [...wizard.querySelectorAll('ful-steps li')];

        assert.strictEqual(getComputedStyle(steps[0]).display, 'flex');
        assert.strictEqual(getComputedStyle(steps[1]).display, 'none');
        assert.strictEqual(getComputedStyle(steps[2]).display, 'none');
        assert.include(getComputedStyle(steps[0], '::after').content, 'none', 'no counter of its own');
    });

    it('linear progress restores the full timeline', async () => {
        const [wizard] = await mount(markup.replace('<ful-wizard>', '<ful-wizard progress="timeline">'));
        const steps = [...wizard.querySelectorAll('ful-steps li')];

        assert.deepStrictEqual(
            steps.map((li) => getComputedStyle(li).display),
            ['flex', 'flex', 'flex'],
        );
        assert.notStrictEqual(
            getComputedStyle(steps[2]).borderBottomColor,
            getComputedStyle(steps[0]).borderBottomColor,
            'the future steps mute',
        );
    });

    it('renders the degenerate shapes without throwing or activating anything', async () => {
        const [orphan] = await mount(
            `<ful-wizard><template slot="steps"><step>Alone</step></template></ful-wizard>`,
        );
        const [unstepped] = await mount(
            `<ful-wizard><template slot="steps"></template><section data-step="a">a</section></ful-wizard>`,
        );
        const seen = [];
        AsyncEvents.asyncOn(unstepped, 'section:requested', (e) => seen.push(e.detail.name));

        assert.strictEqual(orphan.querySelectorAll('ful-steps li').length, 0, 'the surplus step is left alone');
        assert.strictEqual(unstepped.querySelector('[data-step=a]').getAttribute('aria-current'), null);
        unstepped.next();
        await settle();

        assert.deepStrictEqual(seen, [], 'a section with no step is never activated');
    });

    it('says so when asked to move or refresh a step nothing carries', async () => {
        const warnings = captureConsole('warn');
        const [wizard] = await mount(`
            <ful-wizard>
                <template slot="steps"><step>One</step><step>Two</step></template>
                <section data-step="a">a</section>
                <section data-step="b">b</section>
            </ful-wizard>`);

        assert.isUndefined(wizard.move('nowhere'));
        assert.isUndefined(wizard.refresh('nowhere'));
        assert.isUndefined(wizard.refresh(document.createElement('section')));
        assert.strictEqual(wizard.querySelector('[data-step=a]').getAttribute('aria-current'), 'step');

        assert.isTrue(
            warnings.some((w) => w.includes('no section carries data-step="nowhere"')),
            `expected the move complaint, saw ${JSON.stringify(warnings)}`,
        );
        assert.isTrue(
            warnings.some((w) => w.includes('no section answers to')),
            `expected the refresh complaint, saw ${JSON.stringify(warnings)}`,
        );
    });

    it('refresh swallows a failed delivery', async () => {
        const [wizard] = await mount(markup);
        AsyncEvents.asyncOn(wizard, 'section:requested:two', () => {
            throw new Error('boom');
        });

        assert.isUndefined(await wizard.refresh('two'));
    });
});

describe('Wizard, the event target', () => {
    const nested = `
        <ful-wizard id="outer">
            <template slot="steps"><step>One</step><step>Two</step></template>
            <section data-step="one"></section>
            <section data-step="two">
                <ful-tabs>
                    <template slot="tabs"><tab>A</tab><tab>B</tab></template>
                    <section>inner a</section>
                    <section>inner b</section>
                </ful-tabs>
            </section>
        </ful-wizard>`;

    it('targets the component, its own sections told from a nested one by currentTarget', async () => {
        const [wizard] = await mount(nested);
        const own = [];
        const seen = [];
        AsyncEvents.asyncOn(wizard, 'section:requested', (e) => {
            seen.push(e.target.localName);
            if (e.target === e.currentTarget) {
                own.push(e.detail.name);
            }
        });

        await wizard.move('two');
        const inner = wizard.querySelector('ful-tabs');
        AsyncEvents.asyncOn(inner, 'section:requested', (e) => seen.push(e.target.localName));
        inner.active = 1;
        await settle();

        assert.deepStrictEqual(own, ['two'], "only the wizard's own sections pass the guard");
        assert.deepStrictEqual(
            seen,
            ['ful-wizard', 'ful-tabs', 'ful-tabs'],
            'the target names the family, nested events included',
        );
    });
});
