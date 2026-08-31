import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';


registry.plugin(new Plugin()).configure();

/** the dropdown opens on the throttle's leading edge, this only lets the loader resolve */
const opened = async () => {
    for (let i = 0; i !== 10; ++i) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
};

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

        await Rendering.waitFor(selectEl);

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
        await Rendering.waitFor(selectEl);

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
        await Rendering.waitFor(selectEl);
        await new Promise(resolve => setTimeout(resolve, 0));

        const rejectionsBefore = rejections.length;
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

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
        await Rendering.waitFor(selectEl);
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
        await Rendering.waitFor(selectEl);

        keydown(selectEl.querySelector('input'), 'Enter');

        assert.deepStrictEqual(uncaught, []);
        container.remove();
    });

    it('ignores Enter when the dropdown was never opened', async () => {
        const [selectEl, container] = mount(`<ful-select></ful-select>`);
        await Rendering.waitFor(selectEl);
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
        await Rendering.waitFor(selectEl);
        await settle();

        const input = selectEl.querySelector('input');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
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
        await Rendering.waitFor(selectEl);
        await settle();

        const input = selectEl.querySelector('input');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

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
        await Rendering.waitFor(selectEl);
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
        await Rendering.waitFor(selectEl);
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

});

describe('Select key types', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    };
    const filtering = (data) => ({
        prefetch: async () => { },
        load: async () => data,
        exact: async (...keys) => data.filter(([k]) => keys.some((r) => r == k)),
    });
    const numeric = () => filtering([[16, 'Label 16'], [17, 'Label 17']]);
    const booleany = () => filtering([[true, 'Yes'], [false, 'No']]);
    const echoing = () => ({
        prefetch: async () => { },
        load: async () => [],
        exact: async (...keys) => keys.map((k) => [k, `Label ${k}`]),
    });
    const mount = async (html, loader) => {
        registry.defineComponent('loaders:select', { create: () => loader });
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };

    it('keeps a string assignment selected when the loader keys are numbers', async () => {
        const [selectEl, container] = await mount(`<ful-select value="16"></ful-select>`, numeric());

        assert.strictEqual(selectEl.value, '16');
        assert.strictEqual(selectEl.querySelector('badge').innerText, 'Label 16');
        container.remove();
    });

    it('coerces a javascript assignment of a number to a string key', async () => {
        const [selectEl, container] = await mount(`<ful-select></ful-select>`, numeric());

        selectEl.value = 16;
        await settle();

        assert.strictEqual(selectEl.value, '16');
        assert.strictEqual(selectEl.querySelector('badge').innerText, 'Label 16');
        container.remove();
    });

    it('exposes number keys when k-type is number', async () => {
        const [selectEl, container] = await mount(`<ful-select k-type="number" value="16"></ful-select>`, numeric());

        assert.strictEqual(selectEl.value, 16);
        assert.strictEqual(selectEl.querySelector('badge').innerText, 'Label 16');
        assert.deepStrictEqual(selectEl.entry, [16, ['Label 16']]);
        container.remove();
    });

    it('coerces every key of a multiple assignment', async () => {
        const [selectEl, container] = await mount(`<ful-select k-type="number" multiple value="16,17"></ful-select>`, numeric());

        assert.deepStrictEqual(selectEl.value, [16, 17]);
        container.remove();
    });

    it('exposes boolean keys when k-type is boolean', async () => {
        const [selectEl, container] = await mount(`<ful-select k-type="boolean" value="true"></ful-select>`, booleany());

        assert.strictEqual(selectEl.value, true);
        assert.strictEqual(selectEl.querySelector('badge').innerText, 'Yes');
        container.remove();
    });

    it('keeps a key that does not decode as it is', async () => {
        const [selectEl, container] = await mount(`<ful-select k-type="number" value="abc"></ful-select>`, echoing());

        assert.strictEqual(selectEl.value, 'abc');
        assert.strictEqual(selectEl.querySelector('badge').innerText, 'Label abc');
        container.remove();
    });

    it('reports an option picked from the dropdown as a string by default', async () => {
        const [selectEl, container] = await mount(`<ful-select></ful-select>`, numeric());

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        selectEl.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));

        assert.strictEqual(selectEl.value, '16');
        assert.strictEqual(selectEl.querySelector('badge').innerText, 'Label 16');
        container.remove();
    });

    it('coerces an option picked from the dropdown when k-type is number', async () => {
        const [selectEl, container] = await mount(`<ful-select k-type="number"></ful-select>`, numeric());

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        selectEl.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));

        assert.strictEqual(selectEl.value, 16);
        assert.strictEqual(selectEl.querySelector('badge').innerText, 'Label 16');
        container.remove();
    });
});

describe('Select enter key inside a form', () => {
    let submits = [];
    const settle = async () => {
        for (let i = 0; i !== 20; ++i) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    };
    const mount = async (html) => {
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };
    const enter = (selectEl) => {
        selectEl.querySelector('input').dispatchEvent(
            new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }),
        );
    };
    beforeEach(() => {
        submits = [];
        registry.defineComponent('loaders:form', {
            create: () => ({
                prepare: async (v) => v,
                submit: async (values) => { submits.push(values); return {}; },
                transform: async (r) => r,
            })
        });
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => { },
                exact: async (...keys) => keys.map((k) => [k, `Label ${k}`]),
                load: async () => [['k1', 'Label 1']],
            })
        });
    });

    it('submits the form when the dropdown is closed', async () => {
        const [selectEl, container] = await mount(`
            <ful-form>
                <ful-select name="s">label</ful-select>
                <button type="submit">go</button>
            </ful-form>`);

        enter(selectEl);
        await settle();

        assert.strictEqual(submits.length, 1, 'enter reaches the form');
        container.remove();
    });

    it('accepts the highlighted option instead of submitting when the dropdown is open', async () => {
        const [selectEl, container] = await mount(`
            <ful-form>
                <ful-select name="s">label</ful-select>
                <button type="submit">go</button>
            </ful-form>`);

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        enter(selectEl);
        await settle();

        assert.strictEqual(selectEl.value, 'k1', 'the option is taken');
        assert.strictEqual(submits.length, 0, 'the form is not submitted');
        container.remove();
    });

    it('does nothing on enter outside a form', async () => {
        const [selectEl, container] = await mount(`<ful-select name="s">label</ful-select>`);

        enter(selectEl);
        await settle();

        assert.strictEqual(submits.length, 0);
        container.remove();
    });
});

describe('Select selection removal', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    };
    const labelling = () => ({
        prefetch: async () => { },
        load: async () => [['k1', 'Label 1']],
        exact: async (...keys) => keys.map((k) => [k, `Label ${k}`]),
    });
    const mount = async (html, loader) => {
        registry.defineComponent('loaders:select', { create: () => loader ?? labelling() });
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };
    const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
    const badges = (selectEl) => [...selectEl.querySelectorAll('badges > badge')];
    const items = (selectEl) => [...selectEl.querySelectorAll('ful-item-list > ful-item')];

    it('drops the entry whose badge was clicked, keeping the others', async () => {
        const [selectEl, container] = await mount(`<ful-select multiple value="k1,k2,k3"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.value));

        click(badges(selectEl)[1]);

        assert.deepStrictEqual(selectEl.value, ['k1', 'k3'], 'the clicked badge is the one removed');
        assert.strictEqual(changes.length, 1);
        assert.deepStrictEqual(changes[0].map((v) => v.key), ['k1', 'k3']);
        assert.deepStrictEqual(badges(selectEl).map((b) => b.innerText), ['Label k1', 'Label k3']);
        assert.deepStrictEqual(items(selectEl).map((i) => i.getAttribute('data-key')), ['k1', 'k3']);
        container.remove();
    });

    it('drops the entry whose item remove button was clicked', async () => {
        const [selectEl, container] = await mount(`<ful-select multiple itemlist value="k1,k2,k3"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.value));

        click(items(selectEl)[2].querySelector('button'));

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2']);
        assert.strictEqual(changes.length, 1);
        assert.deepStrictEqual(changes[0].map((v) => v.key), ['k1', 'k2']);
        assert.deepStrictEqual(items(selectEl).map((i) => i.getAttribute('data-key')), ['k1', 'k2']);
        assert.deepStrictEqual(badges(selectEl).map((b) => b.innerText), ['Label k1', 'Label k2']);
        container.remove();
    });

    it('removes nothing when the click misses both a badge and a remove button', async () => {
        const [selectEl, container] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.value));

        click(selectEl.querySelector('badges'));
        click(items(selectEl)[0].querySelector('div'));

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2']);
        assert.deepStrictEqual(changes, []);
        container.remove();
    });

    it('keeps the selection when a disabled select is clicked', async () => {
        const [selectEl, container] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.value));
        selectEl.disabled = true;

        click(badges(selectEl)[0]);
        click(items(selectEl)[0].querySelector('button'));

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2']);
        assert.deepStrictEqual(changes, []);
        container.remove();
    });

    it('keeps the selection when a readonly select is clicked', async () => {
        const [selectEl, container] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.value));
        selectEl.readonly = true;

        click(badges(selectEl)[0]);
        click(items(selectEl)[0].querySelector('button'));

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2']);
        assert.deepStrictEqual(changes, []);
        container.remove();
    });

    it('reports a single select as empty once its only badge is removed', async () => {
        const [selectEl, container] = await mount(`<ful-select value="k1"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.value));

        click(badges(selectEl)[0]);

        assert.isNull(selectEl.value);
        assert.deepStrictEqual(changes, [null], 'a single select reports no selection as null');
        assert.deepStrictEqual(badges(selectEl), []);
        container.remove();
    });
});

describe('Select backspace', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    };
    const mount = async (html) => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => { },
                load: async () => [['k1', 'Label 1']],
                exact: async (...keys) => keys.map((k) => [k, `Label ${k}`]),
            })
        });
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };
    const backspace = (input) => input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace', bubbles: true }));

    it('removes the last selection when the caret sits at the start', async () => {
        const [selectEl, container] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.value));
        const input = selectEl.querySelector('input');
        input.setSelectionRange(0, 0);

        backspace(input);

        assert.deepStrictEqual(selectEl.value, ['k1'], 'the last entry goes first');
        assert.deepStrictEqual(changes[0].map((v) => v.key), ['k1']);
        assert.deepStrictEqual([...selectEl.querySelectorAll('badges > badge')].map((b) => b.innerText), ['Label k1']);
        container.remove();
    });

    it('leaves the selection alone while the caret is inside the typed text', async () => {
        const [selectEl, container] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.value));
        const input = selectEl.querySelector('input');
        input.value = 'ab';
        input.setSelectionRange(2, 2);

        backspace(input);

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2'], 'backspace belongs to the text being typed');
        assert.deepStrictEqual(changes, []);
        container.remove();
    });

    it('leaves the selection alone while text is selected from the start', async () => {
        const [selectEl, container] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.value));
        const input = selectEl.querySelector('input');
        input.value = 'ab';
        input.setSelectionRange(0, 2);

        backspace(input);

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2'], 'backspace deletes the highlighted text');
        assert.deepStrictEqual(changes, []);
        container.remove();
    });

    it('does not fire a change when there is nothing to remove', async () => {
        const [selectEl, container] = await mount(`<ful-select multiple></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.value));
        const input = selectEl.querySelector('input');
        input.setSelectionRange(0, 0);

        backspace(input);

        assert.deepStrictEqual(selectEl.value, []);
        assert.deepStrictEqual(changes, []);
        container.remove();
    });

    it('ignores backspace on a readonly select', async () => {
        const [selectEl, container] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        selectEl.readonly = true;
        const input = selectEl.querySelector('input');
        input.setSelectionRange(0, 0);

        backspace(input);

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2']);
        container.remove();
    });
});

describe('Select blur', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    };
    const mount = async (html) => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => { },
                load: async () => [['k1', 'Label 1']],
                exact: async (...keys) => keys.map((k) => [k, `Label ${k}`]),
            })
        });
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };

    it('clears the typed text and closes the dropdown when focus leaves', async () => {
        const [selectEl, container] = await mount(`<ful-select></ful-select>`);
        const input = selectEl.querySelector('input');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        input.value = 'typed';
        assert.isTrue(selectEl.querySelector('ful-dropdown').shown);

        input.dispatchEvent(new FocusEvent('blur'));

        assert.strictEqual(input.value, '', 'a half typed needle is not kept around');
        assert.strictEqual(input.getAttribute('aria-expanded'), 'false');
        assert.isFalse(selectEl.querySelector('ful-dropdown').shown);
        container.remove();
    });

    it('stays open when focus moves to something inside the select', async () => {
        const [selectEl, container] = await mount(`<ful-select></ful-select>`);
        const input = selectEl.querySelector('input');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        input.value = 'typed';

        input.dispatchEvent(new FocusEvent('blur', { relatedTarget: selectEl.querySelector('menu') }));

        assert.strictEqual(input.value, 'typed', 'clicking an option must not wipe the needle first');
        assert.strictEqual(input.getAttribute('aria-expanded'), 'true');
        assert.isTrue(selectEl.querySelector('ful-dropdown').shown);
        container.remove();
    });

    it('does not let a throttled search reopen the dropdown after blur', async () => {
        const [selectEl, container] = await mount(`<ful-select></ful-select>`);
        const input = selectEl.querySelector('input');
        //the leading edge opens it, the second request is queued on the trailing edge
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        input.value = 'ty';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        input.dispatchEvent(new FocusEvent('blur'));
        //the throttle window is 400ms: outlive it to catch a load that was not aborted
        await new Promise(resolve => setTimeout(resolve, 450));

        assert.isFalse(selectEl.querySelector('ful-dropdown').shown);
        assert.strictEqual(input.getAttribute('aria-expanded'), 'false');
        container.remove();
    });
});

describe('Select loader access and entries', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    };
    const mount = async (html, loader) => {
        registry.defineComponent('loaders:select', { create: () => loader });
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };
    const updatable = () => {
        let data = [['k1', 'Label 1']];
        return {
            prefetch: async () => { },
            load: async () => data,
            exact: async (...keys) => keys.map((k) => [k, `Label ${k}`]),
            update: (d) => { data = d; return 'updated'; },
        };
    };
    const described = () => ({
        prefetch: async () => { },
        load: async () => [],
        exact: async (...keys) => keys.map((k) => [k, `Label ${k}`, { id: k }]),
    });

    it('hands the live loader to withLoader, so the next search sees the new options', async () => {
        const [selectEl, container] = await mount(`<ful-select></ful-select>`, updatable());

        const outcome = await selectEl.withLoader((loader) => loader.update([['k9', 'Nine']]));

        assert.strictEqual(outcome, 'updated', 'withLoader returns what the caller returns');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        assert.deepStrictEqual(
            [...selectEl.querySelectorAll('menu li')].map((li) => li.textContent.trim()),
            ['Nine'],
        );
        container.remove();
    });

    it('reports label and metadata through entry, keys through value', async () => {
        const [selectEl, container] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`, described());

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2']);
        assert.deepStrictEqual(selectEl.entry, [
            ['k1', ['Label k1', { id: 'k1' }]],
            ['k2', ['Label k2', { id: 'k2' }]],
        ]);
        container.remove();
    });

    it('reports the one entry of a single select, and null when it has none', async () => {
        const [selectEl, container] = await mount(`<ful-select value="k1"></ful-select>`, described());

        assert.deepStrictEqual(selectEl.entry, ['k1', ['Label k1', { id: 'k1' }]]);

        selectEl.value = null;
        await settle();

        assert.isNull(selectEl.entry);
        assert.isNull(selectEl.value);
        container.remove();
    });
});

describe('Select edits made while a lookup is in flight', () => {
    it('does not bring back a selection removed before the labels arrived', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => { },
                load: async () => [],
                exact: async (...keys) => {
                    await new Promise((resolve) => setTimeout(resolve, 40));
                    return keys.map((k) => [k, `Label ${k}`]);
                },
            })
        });
        const container = document.createElement('div');
        container.innerHTML = `<ful-select multiple name="s" value="k1,k2">label</ful-select>`;
        document.body.appendChild(container);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);

        selectEl.querySelectorAll('badge')[1].dispatchEvent(new Event('click', { bubbles: true }));
        assert.deepStrictEqual(selectEl.value, ['k1']);

        await new Promise((resolve) => setTimeout(resolve, 120));

        assert.deepStrictEqual(selectEl.value, ['k1'], 'the lookup must not undo the removal');
        assert.strictEqual(selectEl.querySelector('badge').innerText, 'Label k1', 'the survivor is still labelled');
        container.remove();
    });
});
