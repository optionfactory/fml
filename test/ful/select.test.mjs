import { assert } from '@esm-bundle/chai';
import { registry, Rendering } from '../../dist/ftl.mjs';
import { Plugin } from '../../dist/ful.mjs';


registry.plugin(new Plugin()).configure();

describe('Select & Dropdown Combobox ARIA Compliance', () => {
    beforeEach(() => {
        registry.defineComponent('loaders:select', {
            create: () => ({ prefetch: async () => { }, load: async () => [] })
        });
    });

    it('should establish standard ARIA roles on mounting', async () => {
        const container = document.createElement('div');
        container.innerHTML = `<ful-select></ful-select>`;
        document.body.appendChild(container);

        const selectEl = container.querySelector('ful-select');

        await Rendering.waitForChildren(selectEl);

        const input = selectEl.querySelector('input');

        assert.strictEqual(input.getAttribute('role'), 'combobox');
        assert.strictEqual(input.getAttribute('aria-autocomplete'), 'list');
        assert.strictEqual(input.getAttribute('aria-haspopup'), 'listbox');
        assert.strictEqual(input.getAttribute('aria-expanded'), 'false');

        container.remove();
    });

    it('should dynamically update aria-expanded state when dropdown visibility shifts', async () => {
        const container = document.createElement('div');
        container.innerHTML = `<ful-select></ful-select>`;
        document.body.appendChild(container);

        const selectEl = container.querySelector('ful-select');
        await new Promise(resolve => setTimeout(resolve, 0));

        const input = selectEl.querySelector('input');

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.strictEqual(input.getAttribute('aria-expanded'), 'true');

        input.dispatchEvent(new Event('blur'));
        assert.strictEqual(input.getAttribute('aria-expanded'), 'false');

        //wait for throttling
        await new Promise(resolve => setTimeout(resolve, 500));

        container.remove();
    });
});