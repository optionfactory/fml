import { assert } from '@esm-bundle/chai';
import { registry, Rendering } from '../../src/ftl/index.mjs';
import { Plugin } from '../../src/ful/index.mjs';

registry.plugin(new Plugin()).configure();

describe('Table sorting', () => {
    let sorts = [];
    const settle = async () => {
        for (let i = 0; i !== 20; ++i) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    };
    const mount = async (schema) => {
        const container = document.createElement('div');
        container.innerHTML = `
            <ful-table autoload>
                <template slot="schema">
                    <schema>${schema}</schema>
                </template>
            </ful-table>`;
        document.body.appendChild(container);
        const tableEl = container.querySelector('ful-table');
        await Rendering.waitFor(tableEl);
        await settle();
        return [tableEl, container];
    };
    beforeEach(() => {
        sorts = [];
        registry.defineComponent('loaders:table', {
            create: () => ({
                load: async (pageRequest, sortRequest) => {
                    sorts.push(sortRequest);
                    return { data: [{ a: 1, b: 2 }], size: 1 };
                }
            })
        });
    });

    it('exposes the declared order as a property', async () => {
        const [tableEl, container] = await mount(`
            <column title="A" sorter="a" order="asc">{{ a }}</column>
            <column title="B" sorter="b">{{ b }}</column>`);

        const [sorterA, sorterB] = tableEl.querySelectorAll('ful-sorter');
        assert.strictEqual(sorterA.order, 'asc');
        assert.strictEqual(sorterB.order, null);
        assert.deepStrictEqual(sorts[0], { sorter: 'a', order: 'asc' });
        container.remove();
    });

    it('clears the order of the other sorters when a column is sorted', async () => {
        const [tableEl, container] = await mount(`
            <column title="A" sorter="a" order="asc">{{ a }}</column>
            <column title="B" sorter="b">{{ b }}</column>`);

        const [sorterA, sorterB] = tableEl.querySelectorAll('ful-sorter');
        sorterB.dispatchEvent(new Event('click', { bubbles: true }));
        await settle();

        assert.deepStrictEqual(sorts[1], { sorter: 'b', order: 'asc' });
        assert.strictEqual(sorterB.order, 'asc');
        assert.strictEqual(sorterA.order, null);
        assert.isFalse(sorterA.hasAttribute('order'));
        container.remove();
    });

    it('cycles asc, desc and unsorted from the declared order', async () => {
        const [tableEl, container] = await mount(
            `<column title="A" sorter="a" order="asc">{{ a }}</column>`);

        const [sorterA] = tableEl.querySelectorAll('ful-sorter');
        sorterA.dispatchEvent(new Event('click', { bubbles: true }));
        await settle();
        assert.deepStrictEqual(sorts[1], { sorter: 'a', order: 'desc' });
        assert.strictEqual(sorterA.order, 'desc');

        sorterA.dispatchEvent(new Event('click', { bubbles: true }));
        await settle();
        assert.isNull(sorts[2], 'clearing the order must drop the sort request');
        assert.strictEqual(sorterA.order, null);

        sorterA.dispatchEvent(new Event('click', { bubbles: true }));
        await settle();
        assert.deepStrictEqual(sorts[3], { sorter: 'a', order: 'asc' });
        container.remove();
    });
});
