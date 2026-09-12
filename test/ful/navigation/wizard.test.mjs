import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { AsyncEvents, Plugin } from '../../../src/ful/index.mjs';
import { appended, settle as drain } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

//the clamped loop this replaces billed about 4ms a turn once nested, so
//the floor keeps the wall time these tests were written against: the turn
//count alone would drain in a tenth of it
const settle = () => drain(20, 80);
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
    const frames = async () => {
        for (let i = 0; i !== 3; ++i) {
            await new Promise((r) => requestAnimationFrame(() => r()));
        }
    };

    it('fires the generic, named and index events on the entered section, first only once', async () => {
        const [wizard] = await mount(markup);
        const seen = [];
        AsyncEvents.asyncOn(wizard, 'section:requested', (e) => seen.push(['generic', e.detail.name, e.detail.first]));
        AsyncEvents.asyncOn(wizard, 'section:requested:two', (e) =>
            seen.push(['named', e.detail.name, e.detail.index]),
        );
        AsyncEvents.asyncOn(wizard, 'section:requested:#1', (e) => seen.push(['index', e.detail.name]));

        await wizard.move('two');
        await wizard.refresh('two');

        assert.deepStrictEqual(seen, [
            ['generic', 'two', true],
            ['index', 'two'],
            ['named', 'two', 1],
            ['generic', 'two', false],
            ['index', 'two'],
            ['named', 'two', 1],
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

    it('resolves without waiting when nobody listens, nothing painted', async () => {
        const [wizard] = await mount(markup);

        await wizard.move('two');

        assert.isFalse(wizard.querySelector('[data-step=two]').hasAttribute('loading'));
        assert.strictEqual(wizard.querySelector('[data-step=two] > .ful-section-error'), null);
        assert.strictEqual(wizard.querySelector('[data-step=two]').textContent, '');
    });

    it('shows the loading chrome while an answer pends, and drops it when it lands', async () => {
        const [wizard] = await mount(markup);
        let land;
        AsyncEvents.asyncOn(wizard, 'section:requested:two', () => new Promise((r) => (land = r)));
        const moving = wizard.move('two');
        await frames();

        assert.isTrue(wizard.querySelector('[data-step=two]').hasAttribute('loading'));
        land();
        await moving;

        assert.isFalse(wizard.querySelector('[data-step=two]').hasAttribute('loading'));
    });

    it('paints the problems of a failed delivery and rejects the move', async () => {
        const [wizard] = await mount(markup);
        const failure = { problems: [{ reason: 'unreachable (demo)' }] };
        AsyncEvents.asyncOn(wizard, 'section:requested:two', () => {
            throw failure;
        });

        await wizard.move('two').then(
            () => assert.fail('the rejection travels to the caller'),
            (e) => assert.strictEqual(e, failure),
        );

        const error = wizard.querySelector('[data-step=two] > .ful-section-error');
        assert.isNotNull(error);
        assert.include(error.textContent, 'unreachable (demo)');
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

    it('does not spend first when nobody listened', async () => {
        const [wizard] = await mount(markup);
        await wizard.move('two');
        const seen = [];
        AsyncEvents.asyncOn(wizard, 'section:requested', (e) => seen.push(e.detail.name));

        await wizard.prev();

        assert.deepStrictEqual(seen, ['one'], 'the unanswered activation of section one did not spend its first');
    });

    it('refresh paints and swallows a failure, the retry clearing the stale error under aria-busy', async () => {
        const [wizard] = await mount(markup);
        let fail = true;
        AsyncEvents.asyncOn(wizard, 'section:requested:two', () => {
            if (fail) {
                throw new Error('boom');
            }
            return new Promise((resolve) => setTimeout(resolve, 150));
        });

        await wizard.refresh('two');
        assert.isNotNull(wizard.querySelector('[data-step=two] > .ful-section-error'));

        fail = false;
        const retrying = wizard.refresh('two');
        assert.strictEqual(
            wizard.querySelector('[data-step=two] > .ful-section-error'),
            null,
            'the stale error leaves with the retry',
        );
        await frames();
        assert.strictEqual(wizard.querySelector('[data-step=two]').getAttribute('aria-busy'), 'true');
        await retrying;
        assert.strictEqual(wizard.querySelector('[data-step=two]').hasAttribute('aria-busy'), false);
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
