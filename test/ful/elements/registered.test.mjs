import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';

//records what the plugin registers, so a new element has to be sampled below
const REGISTERED = [];
const defineElement = registry.defineElement.bind(registry);
registry.defineElement = (tag, klass) => {
    REGISTERED.push(tag);
    return defineElement(tag, klass);
};
registry.plugin(new Plugin()).configure();
registry.defineElement = defineElement;

/**
 * Every element registered by the plugin, with markup that mounts it standalone and,
 * for each of its observed attributes, an attribute value and the property value it
 * must expose once rendered. ANY skips the property assertion.
 *
 * The observed map has to cover every observed attribute of the element: a new one
 * fails this suite until it is sampled here, which is what keeps observed attributes
 * from being declared but never applied at render.
 */
const ANY = Symbol('any');
const ELEMENTS = [
    {
        tag: 'ful-spinner',
        html: `<ful-spinner>loading</ful-spinner>`,
        observed: {},
    },
    {
        tag: 'ful-form',
        html: `<ful-form><input name="a"></ful-form>`,
        observed: {},
    },
    {
        tag: 'ful-checkbox',
        html: `<ful-checkbox name="a">label</ful-checkbox>`,
        observed: {
            value: ['true', true],
            readonly: ['', true],
            required: ['', true],
        },
    },
    {
        tag: 'ful-input',
        html: `<ful-input name="a">label</ful-input>`,
        observed: {
            value: ['v', 'v'],
            readonly: ['', true],
            required: ['', true],
            placeholder: ['p', 'p'],
        },
    },
    {
        tag: 'ful-input-file',
        html: `<ful-input-file name="a">label</ful-input-file>`,
        observed: {
            //files cannot be assigned from an attribute, the setter only clears
            value: ['x', null],
            readonly: ['', true],
            required: ['', true],
            placeholder: ['p', 'p'],
            accept: ['.pdf,.png', ['.pdf', '.png']],
            multiple: ['', true],
            itemlist: ['', true],
            dropzone: ['', true],
            maxfiles: ['3', 3],
            maxfilesize: ['10', 10],
            maxtotalsize: ['20', 20],
        },
    },
    {
        tag: 'ful-local-date',
        html: `<ful-local-date>2026-01-02</ful-local-date>`,
        observed: {},
    },
    {
        tag: 'ful-instant',
        html: `<ful-instant>2026-01-02T10:30:00.000Z</ful-instant>`,
        observed: {},
    },
    {
        tag: 'ful-input-local-date',
        html: `<ful-input-local-date name="a">label</ful-input-local-date>`,
        observed: {
            value: ['2026-01-02', '2026-01-02'],
            readonly: ['', true],
            required: ['', true],
            placeholder: ['p', 'p'],
            min: ['2026-01-01', '2026-01-01'],
            max: ['2026-12-31', '2026-12-31'],
            step: ['1', '1'],
        },
    },
    {
        tag: 'ful-input-local-time',
        html: `<ful-input-local-time name="a">label</ful-input-local-time>`,
        observed: {
            value: ['10:30', '10:30'],
            readonly: ['', true],
            required: ['', true],
            placeholder: ['p', 'p'],
            min: ['10:00', '10:00'],
            max: ['18:00', '18:00'],
            step: ['60', '60'],
        },
    },
    {
        tag: 'ful-input-instant',
        html: `<ful-input-instant name="a">label</ful-input-instant>`,
        observed: {
            value: ['2026-01-02T10:30:00.000Z', '2026-01-02T10:30:00.000Z'],
            readonly: ['', true],
            required: ['', true],
            placeholder: ['p', 'p'],
            min: ['2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
            max: ['2026-12-31T00:00:00.000Z', '2026-12-31T00:00:00.000Z'],
            step: ['60', '60'],
        },
    },
    {
        tag: 'ful-radio-group',
        html: `<ful-radio-group name="a">label<ful-radio value="k1">one</ful-radio><ful-radio value="k2">two</ful-radio></ful-radio-group>`,
        observed: {
            value: ['k1', 'k1'],
            readonly: ['', true],
            required: ['', true],
        },
    },
    {
        tag: 'ful-table',
        html: `<ful-table><template slot="schema"><schema><column title="A" sorter="a">{{ a }}</column></schema></template></ful-table>`,
        observed: {},
    },
    {
        tag: 'ful-pagination',
        html: `<ful-pagination></ful-pagination>`,
        observed: {
            total: ['5', 5],
            current: ['2', 2],
        },
    },
    {
        tag: 'ful-sorter',
        html: `<ful-sorter sorter="a">A</ful-sorter>`,
        observed: {
            order: ['asc', 'asc'],
        },
    },
    {
        tag: 'ful-filter-instant',
        html: `<ful-filter-instant name="a">label</ful-filter-instant>`,
        observed: {
            value: ['["EQ","2026-01-02T10:30:00.000Z"]', ['EQ', '2026-01-02T10:30:00.000Z']],
            readonly: ['', true],
            required: ['', true],
            placeholder: ['p', 'p'],
        },
    },
    {
        tag: 'ful-filter-local-date',
        html: `<ful-filter-local-date name="a">label</ful-filter-local-date>`,
        observed: {
            value: ['["EQ","2026-01-02"]', ['EQ', '2026-01-02']],
            readonly: ['', true],
            required: ['', true],
            placeholder: ['p', 'p'],
        },
    },
    {
        tag: 'ful-filter-text',
        html: `<ful-filter-text name="a">label</ful-filter-text>`,
        observed: {
            value: ['["CONTAINS","IGNORE_CASE","x"]', ['CONTAINS', 'IGNORE_CASE', 'x']],
            readonly: ['', true],
            required: ['', true],
            placeholder: ['p', 'p'],
        },
    },
    {
        tag: 'ful-select',
        html: `<ful-select name="a"><template slot="options"><option value="k1">Label 1</option></template>label</ful-select>`,
        observed: {
            value: ['k1', 'k1'],
            readonly: ['', true],
            required: ['', true],
            itemlist: ['', true],
        },
    },
    {
        tag: 'ful-dropdown',
        html: `<ful-dropdown></ful-dropdown>`,
        observed: {},
    },
];

describe('Registered elements', () => {
    const uncaught = [];
    window.addEventListener('error', (e) => {
        uncaught.push(e.error ?? e.message);
        e.preventDefault();
    });
    window.addEventListener('unhandledrejection', (e) => {
        uncaught.push(e.reason);
        e.preventDefault();
    });
    const mount = async (html) => {
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const el = container.firstElementChild;
        //waitFor drains the queue, nested components included, so nothing else to await
        await Rendering.waitFor(el);
        return [el, container];
    };
    const withAttribute = (html, attribute, value) =>
        html.replace('>', ` ${attribute}="${value.replace(/"/g, '&quot;')}">`);

    beforeEach(() => {
        uncaught.length = 0;
    });

    it('covers every element registered by the plugin', () => {
        assert.deepStrictEqual(
            ELEMENTS.map((e) => e.tag).sort(),
            [...REGISTERED].sort(),
            'every registered element must be sampled in this suite',
        );
    });

    for (const spec of ELEMENTS) {
        describe(spec.tag, () => {
            it('mounts and renders without errors', async () => {
                const [el, container] = await mount(spec.html);

                assert.deepStrictEqual(uncaught, [], `${spec.tag} reported errors while mounting`);
                assert.isAbove(el.childNodes.length, 0, `${spec.tag} rendered no content`);
                container.remove();
            });

            it('samples every observed attribute', () => {
                const observed = customElements.get(spec.tag).observedAttributes ?? [];
                assert.deepStrictEqual(
                    Object.keys(spec.observed).sort(),
                    [...observed].sort(),
                    `${spec.tag}: the sampled attributes must match the observed ones`,
                );
            });

            for (const [attribute, [value, expected]] of Object.entries(spec.observed)) {
                it(`applies ${attribute} at render`, async () => {
                    const [el, container] = await mount(withAttribute(spec.html, attribute, value));

                    assert.deepStrictEqual(uncaught, [], `${spec.tag}[${attribute}] reported errors`);
                    if (expected !== ANY) {
                        assert.deepStrictEqual(
                            el[attribute],
                            expected,
                            `${spec.tag}: the ${attribute} attribute is not reflected by the property`,
                        );
                    }
                    container.remove();
                });
            }
        });
    }
});
