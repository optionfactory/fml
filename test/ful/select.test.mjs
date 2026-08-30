import { assert } from '@esm-bundle/chai';
import { registry, Rendering } from '../../src/ftl/index.mjs';
import { Plugin } from '../../src/ful/index.mjs';


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

describe('Select & Dropdown load failure handling', () => {
    const rejections = [];
    window.addEventListener('unhandledrejection', (e) => {
        rejections.push(e.reason);
        e.preventDefault();
    });
    let warns = [];
    let errors = [];
    let originalWarn;
    let originalError;
    beforeEach(() => {
        originalWarn = console.warn;
        originalError = console.error;
        warns = [];
        errors = [];
        console.warn = (...args) => warns.push(args);
        console.error = (...args) => errors.push(args);
    });
    afterEach(() => {
        console.warn = originalWarn;
        console.error = originalError;
    });

    it('renders the select and warns when prefetch fails', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({ prefetch: async () => { throw new Error('boom'); }, load: async () => [] })
        });
        const container = document.createElement('div');
        container.innerHTML = `<ful-select></ful-select>`;
        document.body.appendChild(container);

        const selectEl = container.querySelector('ful-select');
        await Rendering.waitForChildren(selectEl);

        assert.isNotNull(selectEl.querySelector('input[role=combobox]'));
        assert.isTrue(warns.some((args) => String(args[0]).includes('prefetch')));
        container.remove();
    });

    it('hides the dropdown and reports the rejection when load fails', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({ load: async () => { throw new Error('boom'); } })
        });
        const container = document.createElement('div');
        container.innerHTML = `<ful-select></ful-select>`;
        document.body.appendChild(container);

        const selectEl = container.querySelector('ful-select');
        await Rendering.waitForChildren(selectEl);
        await new Promise(resolve => setTimeout(resolve, 0));

        const rejectionsBefore = rejections.length;
        const input = selectEl.querySelector('input');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 500));

        const dropdown = selectEl.querySelector('ful-dropdown');
        assert.isFalse(dropdown.shown);
        assert.strictEqual(rejections.length, rejectionsBefore + 1);
        assert.isTrue(errors.some((args) => String(args[0]).includes('boom')));
        container.remove();
    });

    it('reports the rejection and keeps the requested keys when exact lookup fails', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                load: async () => [],
                exact: async () => { throw new Error('boom'); }
            })
        });
        const container = document.createElement('div');
        container.innerHTML = `<ful-select value="k1"></ful-select>`;
        document.body.appendChild(container);

        const selectEl = container.querySelector('ful-select');
        await Rendering.waitForChildren(selectEl);
        const rejectionsBefore = rejections.length;
        await new Promise(resolve => setTimeout(resolve, 0));

        assert.strictEqual(rejections.length, rejectionsBefore + 1);
        assert.strictEqual(selectEl.value, 'k1', 'the requested key is kept');
        assert.isTrue(warns.length === 0);
        container.remove();
    });
});
describe('Select & Dropdown keyboard interaction', () => {
    const uncaught = [];
    window.addEventListener('error', (e) => {
        uncaught.push(e.error ?? e.message);
        e.preventDefault();
    });
    const settle = async () => {
        for (let i = 0; i !== 20; ++i) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    };
    const mount = (html) => {
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        return [container.querySelector('ful-select'), container];
    };
    const keydown = (input, code) => {
        input.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    };
    beforeEach(() => {
        uncaught.length = 0;
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => { },
                exact: async () => [],
                load: async () => [['k1', 'Label 1'], ['k2', 'Label 2']]
            })
        });
    });

    it('ignores Enter before the dropdown is rendered', async () => {
        const [selectEl, container] = mount(`<ful-select></ful-select>`);
        await Rendering.waitForChildren(selectEl);

        keydown(selectEl.querySelector('input'), 'Enter');

        assert.deepStrictEqual(uncaught, []);
        container.remove();
    });

    it('ignores Enter when the dropdown was never opened', async () => {
        const [selectEl, container] = mount(`<ful-select></ful-select>`);
        await Rendering.waitForChildren(selectEl);
        await settle();

        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.value));
        keydown(selectEl.querySelector('input'), 'Enter');

        assert.deepStrictEqual(uncaught, []);
        assert.deepStrictEqual(changes, []);
        assert.isNull(selectEl.value);
        container.remove();
    });

    it('ignores arrow keys when the shown dropdown has no options', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({ prefetch: async () => { }, exact: async () => [], load: async () => [] })
        });
        const [selectEl, container] = mount(`<ful-select></ful-select>`);
        await Rendering.waitForChildren(selectEl);
        await settle();

        const input = selectEl.querySelector('input');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 500));
        assert.isTrue(selectEl.querySelector('ful-dropdown').shown);

        keydown(input, 'ArrowDown');
        keydown(input, 'ArrowUp');
        keydown(input, 'Enter');

        assert.deepStrictEqual(uncaught, []);
        assert.isNull(selectEl.value);
        container.remove();
    });

    it('accepts the highlighted option on Enter', async () => {
        const [selectEl, container] = mount(`<ful-select></ful-select>`);
        await Rendering.waitForChildren(selectEl);
        await settle();

        const input = selectEl.querySelector('input');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 500));

        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.value));
        keydown(input, 'Enter');

        assert.deepStrictEqual(uncaught, []);
        assert.strictEqual(selectEl.value, 'k1');
        assert.strictEqual(changes.length, 1);
        assert.strictEqual(changes[0].label, 'Label 1');
        assert.isFalse(selectEl.querySelector('ful-dropdown').shown);
        container.remove();
    });
});

describe('Select value resolution', () => {
    const settle = async () => {
        for (let i = 0; i !== 20; ++i) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    };
    let exactCalls = [];
    const mount = async (html) => {
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitForChildren(selectEl);
        await settle();
        return [selectEl, container];
    };
    beforeEach(() => {
        exactCalls = [];
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => { },
                load: async () => [],
                exact: async (...keys) => {
                    exactCalls.push(keys);
                    return keys.map((k) => [k, `Label ${k}`]);
                }
            })
        });
    });

    it('does not query the loader when there is no value', async () => {
        const [selectEl, container] = await mount(`<ful-select></ful-select>`);

        assert.deepStrictEqual(exactCalls, []);
        assert.isNull(selectEl.value);
        container.remove();
    });

    it('does not query the loader when a multiple select has no value', async () => {
        const [selectEl, container] = await mount(`<ful-select multiple></ful-select>`);

        assert.deepStrictEqual(exactCalls, []);
        assert.deepStrictEqual(selectEl.value, []);
        container.remove();
    });

    it('still resolves an empty key, which an <option value=""> can carry', async () => {
        const [selectEl, container] = await mount(`<ful-select></ful-select>`);
        assert.deepStrictEqual(exactCalls, []);

        selectEl.value = '';
        await settle();

        assert.deepStrictEqual(exactCalls, [['']]);
        assert.strictEqual(selectEl.value, '');
        container.remove();
    });

    it('resolves the declared keys', async () => {
        const [selectEl, container] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);

        assert.deepStrictEqual(exactCalls, [['k1', 'k2']]);
        assert.deepStrictEqual(selectEl.value, ['k1', 'k2']);
        container.remove();
    });

    it('clears without querying the loader when the value attribute is removed', async () => {
        const [selectEl, container] = await mount(`<ful-select multiple value="k1"></ful-select>`);
        assert.deepStrictEqual(exactCalls, [['k1']]);

        selectEl.removeAttribute('value');
        await settle();

        assert.deepStrictEqual(exactCalls, [['k1']]);
        assert.deepStrictEqual(selectEl.value, []);
        container.remove();
    });
});

describe('Select value assignment', () => {
    const rejections = [];
    window.addEventListener('unhandledrejection', (e) => {
        rejections.push(e.reason);
        e.preventDefault();
    });
    const settle = async () => {
        for (let i = 0; i !== 20; ++i) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    };
    const mount = async (html, loader) => {
        registry.defineComponent('loaders:select', { create: () => loader });
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitForChildren(selectEl);
        await settle();
        return [selectEl, container];
    };
    const labelling = (delays = {}) => ({
        prefetch: async () => { },
        load: async () => [],
        exact: async (...keys) => {
            await new Promise(resolve => setTimeout(resolve, delays[keys[0]] ?? 0));
            return keys.map((k) => [k, `Label ${k}`]);
        }
    });

    it('exposes the assigned keys synchronously', async () => {
        const [selectEl, container] = await mount(`<ful-select></ful-select>`, labelling());

        selectEl.value = 'k1';

        assert.strictEqual(selectEl.value, 'k1', 'value must not lag behind the assignment');
        await settle();
        assert.strictEqual(selectEl.value, 'k1');
        container.remove();
    });

    it('labels the badges once the loader resolves them', async () => {
        const [selectEl, container] = await mount(`<ful-select></ful-select>`, labelling({ k1: 20 }));

        selectEl.value = 'k1';
        assert.strictEqual(selectEl.querySelector('badge').innerText, 'k1', 'the key stands in for its label');

        await settle();
        assert.strictEqual(selectEl.querySelector('badge').innerText, 'Label k1');
        container.remove();
    });

    it('keeps the newest assignment when an older lookup resolves late', async () => {
        const [selectEl, container] = await mount(`<ful-select></ful-select>`, labelling({ slow: 40 }));

        selectEl.value = 'slow';
        selectEl.value = 'fast';
        await settle();

        assert.strictEqual(selectEl.value, 'fast');
        assert.strictEqual(selectEl.querySelector('badge').innerText, 'Label fast');
        container.remove();
    });

    it('carries its value as soon as the upgrade completes, labels follow', async () => {
        registry.defineComponent('loaders:select', { create: () => labelling({ k1: 20 }) });
        const container = document.createElement('div');
        container.innerHTML = `<ful-select value="k1"></ful-select>`;
        document.body.appendChild(container);
        const selectEl = container.querySelector('ful-select');

        await Rendering.waitFor(selectEl);

        assert.strictEqual(selectEl.value, 'k1', 'the value does not wait for the loader');
        await settle();
        assert.strictEqual(selectEl.querySelector('badge').innerText, 'Label k1');
        container.remove();
    });

    it('does not hold up the upgrade when the loader never answers', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({ prefetch: async () => { }, load: async () => [], exact: () => new Promise(() => { }) })
        });
        const container = document.createElement('div');
        container.innerHTML = `<ful-select value="k1"></ful-select>`;
        document.body.appendChild(container);
        const selectEl = container.querySelector('ful-select');

        const outcome = await Promise.race([
            Rendering.waitFor(selectEl).then(() => 'upgraded'),
            new Promise((resolve) => setTimeout(() => resolve('still waiting'), 300)),
        ]);

        assert.strictEqual(outcome, 'upgraded');
        assert.strictEqual(selectEl.value, 'k1');
        container.remove();
    });

    it('does not swallow a failure of its own rendering', async () => {
        const [selectEl, container] = await mount(`<ful-select></ful-select>`, {
            prefetch: async () => { },
            load: async () => [],
            //a malformed response is a bug, not an expected lookup failure
            exact: async () => 'not an array'
        });
        const rejectionsBefore = rejections.length;

        selectEl.value = 'k1';
        await settle();

        assert.strictEqual(rejections.length, rejectionsBefore + 1, 'the failure must surface');
        container.remove();
    });
});
