import { tick } from '../tick.mjs';
import { assert } from 'chai';
import { registry, Rendering } from '../../src/ftl/index.mjs';
import { Plugin } from '../../src/ful/index.mjs';
import 'axe-core/axe.js';

registry.plugin(new Plugin({ language: 'en' })).configure();

const axe = /** @type any */ (window).axe;

const settle = async () => {
    for (let i = 0; i !== 20; ++i) {
        await tick();
    }
};

describe('Accessibility audit', () => {
    before(() => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
                load: async () => [],
            }),
        });
        registry.defineComponent('loaders:table', {
            create: () => ({
                load: async () => ({ data: [{ a: 1, b: 2 }], size: 30 }),
            }),
        });
    });

    const fixtures = /** @type [string, string][] */ ([
        ['ful-input', `<ful-input name="i" value="v">text</ful-input>`],
        ['ful-input textarea', `<ful-input type="textarea" name="ta">text</ful-input>`],
        ['ful-input-local-date', `<ful-input-local-date name="d">date</ful-input-local-date>`],
        ['ful-input-file', `<ful-input-file name="f">file</ful-input-file>`],
        ['ful-checkbox', `<ful-checkbox name="c" value="true">check</ful-checkbox>`],
        ['ful-checkbox switch', `<ful-checkbox name="s" type="switch" value="true">switch</ful-checkbox>`],
        [
            'ful-radio-group',
            `<ful-radio-group name="r">pick<ful-radio value="a">a</ful-radio><ful-radio value="b">b</ful-radio></ful-radio-group>`,
        ],
        [
            'ful-select',
            `<ful-select name="sel" value="k1"><select slot="options"><option value="k1">one</option><option value="k2">two</option></select>pick</ful-select>`,
        ],
        [
            'ful-select multiple',
            `<ful-select multiple name="selm" value="k1,k2"><select slot="options"><option value="k1">one</option><option value="k2">two</option></select>pick</ful-select>`,
        ],
        ['ful-filter-text', `<ful-filter-text name="ft">ft</ful-filter-text>`],
        ['ful-filter-local-date', `<ful-filter-local-date name="fd">fd</ful-filter-local-date>`],
        ['ful-filter-instant', `<ful-filter-instant name="fi">fi</ful-filter-instant>`],
        ['ful-filter-number', `<ful-filter-number name="fn">fn</ful-filter-number>`],
        ['ful-filter-boolean', `<ful-filter-boolean name="fb">fb</ful-filter-boolean>`],
        ['ful-input-instant', `<ful-input-instant name="ii">instant</ful-input-instant>`],
        ['ful-input-local-time', `<ful-input-local-time name="lt">time</ful-input-local-time>`],
        ['ful-local-date', `<ful-local-date name="ld">2026-09-07</ful-local-date>`],
        ['ful-instant', `<ful-instant name="in">2026-09-07T10:30:00Z</ful-instant>`],
        ['ful-spinner', `<ful-spinner name="sp">spin</ful-spinner>`],
        ['ful-tooltip', `<ful-tooltip name="t">a short explanation</ful-tooltip>`],
        ['ful-dialog', `<ful-dialog header="the header">body</ful-dialog>`],
        ['ful-drawer', `<ful-drawer title="the title">body</ful-drawer>`],
        ['ful-toasts', `<ful-toasts></ful-toasts>`],
        [
            'ful-tabs',
            `<ful-tabs><template slot="tabs"><tab>First</tab><tab>Second</tab></template><section>one</section><section>two</section></ful-tabs>`,
        ],
        [
            'ful-accordion',
            `<ful-accordion exclusive><details><summary>first</summary>one</details><details open><summary>second</summary>two</details></ful-accordion>`,
        ],
        [
            'ful-wizard',
            `<ful-wizard><template slot="steps"><step>One</step><step>Two</step></template><section data-step="one">first</section><section data-step="two">second</section></ful-wizard>`,
        ],
        [
            'ful-form',
            `<ful-form name="frm"><ful-input name="fi">inside a form</ful-input><button type="submit">submit</button></ful-form>`,
        ],
        ['ful-pagination', `<ful-pagination current="0" total="3"></ful-pagination>`],
        [
            'ful-table',
            `
            <ful-table autoload page-size="10">
                <template slot="schema">
                    <schema>
                        <column title="A" sorter="a" order="asc">{{ a }}</column>
                        <column title="B">{{ b }}</column>
                    </schema>
                </template>
            </ful-table>`,
        ],
    ]);

    for (const [name, html] of fixtures) {
        it(`passes the axe audit: ${name}`, async () => {
            const container = document.createElement('section');
            container.innerHTML = html;
            document.body.appendChild(container);
            await Rendering.waitForChildren(container);
            await settle();

            const results = await axe.run(container);
            const summary = results.violations.map(
                (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.html).join(' | ')}`,
            );
            assert.deepStrictEqual(results.violations.map((v) => v.id).sort(), [], `\n${summary.join('\n')}`);
            container.remove();
        });
    }
});

describe('Accessibility: async state is announced', () => {
    it('gives every spinner text to announce', async () => {
        //role=status on an empty element is a live region with nothing to read:
        //the ring is a css pseudo-element, so the message is its own child
        const container = document.createElement('section');
        container.innerHTML = `<ful-table><template slot="schema"><schema><column title="A">{{ a }}</column></schema></template></ful-table>`;
        document.body.appendChild(container);
        await Rendering.waitForChildren(container);
        await settle();

        const spinner = container.querySelector('ful-spinner[role=status]');
        assert.isNotNull(spinner, 'the table renders a spinner');
        assert.strictEqual(spinner.textContent.trim(), 'Loading…');
        container.remove();
    });

    it('declares the table busy only while the load it owns is in flight', async () => {
        const pending = [];
        registry.defineComponent('loaders:table', {
            create: () => ({
                load: () => {
                    const resolvers = /** @type any */ (Promise.withResolvers());
                    pending.push(resolvers);
                    return resolvers.promise;
                },
            }),
        });
        const container = document.createElement('section');
        container.innerHTML = `<ful-table autoload><template slot="schema"><schema><column title="A">{{ a }}</column></schema></template></ful-table>`;
        document.body.appendChild(container);
        const table = container.querySelector('ful-table');
        await Rendering.waitForChildren(container);
        await settle();

        assert.strictEqual(table.getAttribute('aria-busy'), 'true', 'busy while loading');
        pending[0].resolve({ data: [], size: 0 });
        await settle();
        assert.isNull(table.getAttribute('aria-busy'), 'the busy state is lifted when the load settles');
        container.remove();
    });
});
