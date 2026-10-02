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

        assert.strictEqual(
            list.getAttribute('aria-label'),
            'Progress',
            'the progress list is labelled with the localized wizard.progress text',
        );
        assert.deepStrictEqual(
            steps.map((li) => li.textContent),
            ['Verifica', 'Modifica', 'Conferma'],
            'each declared step becomes a list item carrying its content, in declaration order',
        );
        assert.strictEqual(
            steps[0].getAttribute('aria-current'),
            'step',
            'the first step is current when no section claims the current step in the markup',
        );
        assert.strictEqual(
            wizard.querySelectorAll('section[aria-current=step]').length,
            1,
            'exactly one section carries the current step claim',
        );
        assert.strictEqual(
            wizard.querySelector('section[aria-current=step]').getAttribute('data-step'),
            'verifica',
            'the first section is current along with the first step',
        );
        assert.strictEqual(
            getComputedStyle(wizard.querySelector('[data-step=modifica]')).display,
            'none',
            'the chrome hides the steps ahead',
        );
    });

    it('next, prev and move walk the steps, answering with wizard:change', async () => {
        const [wizard] = await mount(markup);
        const changes = [];
        wizard.addEventListener('wizard:change', (e) => changes.push(e.detail));

        wizard.next();
        assert.strictEqual(wizard.index, 1, 'next moves to the following step');
        assert.strictEqual(wizard.step, 'modifica', 'step answers the data-step of the current section');
        assert.strictEqual(
            document.activeElement,
            wizard.querySelector('[data-step=modifica]'),
            'the focus follows the step',
        );

        wizard.move('conferma');
        assert.strictEqual(wizard.index, 2, 'move goes to the section carrying the given data-step');

        wizard.next();
        assert.strictEqual(wizard.index, 2, 'next at the end stays');

        wizard.prev();
        wizard.prev();
        wizard.prev();
        assert.strictEqual(wizard.index, 0, 'prev at the start stays');

        assert.deepStrictEqual(
            changes,
            [
                { index: 1, step: 'modifica' },
                { index: 2, step: 'conferma' },
                { index: 1, step: 'modifica' },
                { index: 0, step: 'verifica' },
            ],
            'every move that changes the current step dispatches wizard:change with its index and step, and a move that stays dispatches nothing',
        );
    });

    it('does not hand a wizard:change listener the change of a field inside a step', async () => {
        const [wizard] = await mount(`
            <ful-wizard>
                <template slot="steps"><step>Uno</step><step>Due</step></template>
                <section data-step="uno"><ful-input name="a">A</ful-input></section>
                <section data-step="due"><p>due</p></section>
            </ful-wizard>`);
        const heard = [];
        wizard.addEventListener('wizard:change', (e) => heard.push(e.detail));
        const input = wizard.querySelector('ful-input input');

        input.value = 'typed';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        assert.deepStrictEqual(
            heard,
            [],
            'a field change bubbling out of a step is not a move, so it never arrives as one',
        );
    });

    it('a section already carrying the claim keeps it', async () => {
        const [wizard] = await mount(
            markup.replace('<section data-step="modifica">', '<section data-step="modifica" aria-current="step">'),
        );

        assert.strictEqual(
            wizard.index,
            1,
            'a section carrying aria-current=step in the markup stays current at render',
        );
        assert.strictEqual(
            wizard.querySelector('ol').children[1].getAttribute('aria-current'),
            'step',
            'the step paired with the claimed section carries the current step claim too',
        );
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

        assert.deepStrictEqual(
            seen,
            [
                'generic|two|1|true|true|true',
                'index|two',
                'named|1',
                'generic|two|1|false|true|true',
                'index|two',
                'named|1',
            ],
            'entering a section and refreshing it each fire the generic, the indexed and the named request on the host, first true only the first time',
        );
    });

    it('awaits the answers: the delivery is painted when move resolves', async () => {
        const [wizard] = await mount(markup);
        AsyncEvents.asyncOn(wizard, 'section:requested:two', async (e) => {
            await new Promise((r) => setTimeout(r, 20));
            e.detail.section.append('delivered');
        });

        await wizard.move('two');

        assert.include(
            wizard.querySelector('[data-step=two]').textContent,
            'delivered',
            'move resolves only after the answers to its section request have been delivered',
        );
    });

    it('rejects the move with the failure of its delivery', async () => {
        const [wizard] = await mount(markup);
        const failure = { problems: [{ reason: 'unreachable (demo)' }] };
        AsyncEvents.asyncOn(wizard, 'section:requested:two', () => {
            throw failure;
        });

        await wizard.move('two').then(
            () => assert.fail('the rejection travels to the caller'),
            (e) => assert.isTrue(e === failure, 'the move rejects with exactly what the delivery threw'),
        );
    });

    it('shows only the current step by default, the counter hooks left to the page', async () => {
        const [wizard] = await mount(markup);
        const steps = [...wizard.querySelectorAll('ful-steps li')];

        assert.strictEqual(getComputedStyle(steps[0]).display, 'flex', 'by default the current step is displayed');
        assert.strictEqual(
            getComputedStyle(steps[1]).display,
            'none',
            'by default a step ahead of the current one is hidden',
        );
        assert.strictEqual(
            getComputedStyle(steps[2]).display,
            'none',
            'by default the last step, ahead of the current one, is hidden',
        );
        assert.include(
            getComputedStyle(steps[0], '::after').content,
            'none',
            'the current step draws no counter of its own, the counter hooks are left to the page',
        );
    });

    it('linear progress restores the full timeline', async () => {
        const [wizard] = await mount(markup.replace('<ful-wizard>', '<ful-wizard progress="timeline">'));
        const steps = [...wizard.querySelectorAll('ful-steps li')];

        assert.deepStrictEqual(
            steps.map((li) => getComputedStyle(li).display),
            ['flex', 'flex', 'flex'],
            'the timeline progress displays every step',
        );
        assert.notStrictEqual(
            getComputedStyle(steps[2]).borderBottomColor,
            getComputedStyle(steps[0]).borderBottomColor,
            'the timeline draws a future step with a different border colour from the current one',
        );
    });

    it('renders the degenerate shapes without throwing or activating anything', async () => {
        const [orphan] = await mount(`<ful-wizard><template slot="steps"><step>Alone</step></template></ful-wizard>`);
        const [unstepped] = await mount(
            `<ful-wizard><template slot="steps"></template><section data-step="a">a</section></ful-wizard>`,
        );
        const seen = [];
        AsyncEvents.asyncOn(unstepped, 'section:requested', (e) => seen.push(e.detail.name));

        assert.strictEqual(orphan.querySelectorAll('ful-steps li').length, 0, 'the surplus step is left alone');
        assert.strictEqual(
            unstepped.querySelector('[data-step=a]').getAttribute('aria-current'),
            null,
            'a section with no paired step is never made current',
        );
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

        assert.isUndefined(wizard.move('nowhere'), 'a move to a data-step nothing carries answers undefined');
        assert.isUndefined(wizard.refresh('nowhere'), 'a refresh of a data-step nothing carries answers undefined');
        assert.isUndefined(
            wizard.refresh(document.createElement('section')),
            "a refresh of a section that is not one of the wizard's answers undefined",
        );
        assert.strictEqual(
            wizard.querySelector('[data-step=a]').getAttribute('aria-current'),
            'step',
            'a move to a missing step leaves the current step where it is',
        );

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

        assert.isUndefined(
            await wizard.refresh('two'),
            'refresh resolves to undefined when the delivery fails, so the failure rejects nowhere',
        );
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
            'the target is the component that fired the request, the nested ful-tabs included',
        );
    });
});
