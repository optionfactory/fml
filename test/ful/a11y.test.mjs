import { assert } from 'chai';
import { registry, Rendering } from '../../src/ftl/index.mjs';
import { Plugin } from '../../src/ful/index.mjs';
import 'axe-core/axe.js';

registry.plugin(new Plugin()).configure();

const axe = /** @type any */ (window).axe;

const settle = async () => {
    for (let i = 0; i !== 20; ++i) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
};

describe('Accessibility audit', () => {
    before(() => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                exact: async (...keys) => keys.map((k) => [k, `Label ${k}`]),
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
