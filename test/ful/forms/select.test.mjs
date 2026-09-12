import { tick, settle } from '../../tick.mjs';
import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';
import { appended } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

/** the dropdown opens on the throttle's leading edge, this only lets the loader resolve */
const opened = async () => {
    for (let i = 0; i !== 10; ++i) {
        await tick();
    }
};

describe('Select & Dropdown Combobox ARIA Compliance', () => {
    beforeEach(() => {
        registry.defineComponent('loaders:select', {
            create: () => ({ prefetch: async () => {}, load: async () => [] }),
        });
    });

    it('parses and behaves the same way when multiple is toggled after the render', async () => {
        const container = appended(`<ful-select><template slot="options"><option value="k1">One</option><option value="k2">Two</option></template></ful-select>`);
        const el = container.querySelector('ful-select');
        await Rendering.waitFor(el);

        //the csvm mapper reads the multiple attribute to decide whether a value
        //parses as a list or a scalar, while the element used to freeze its own
        //copy at render: the two could disagree for the life of the page
        assert.isFalse(el.multiple);
        el.setAttribute('multiple', '');
        assert.isTrue(el.multiple);
        el.setAttribute('value', 'k1,k2');
        await settle();
        assert.deepEqual(el.value, ['k1', 'k2']);

        el.removeAttribute('multiple');
        assert.isFalse(el.multiple);
        el.setAttribute('value', 'k1');
        await settle();
        assert.equal(el.value, 'k1');

    });

    it('should establish standard ARIA roles on mounting', async () => {
        const container = appended(`<ful-select></ful-select>`);

        const selectEl = container.querySelector('ful-select');

        await Rendering.waitFor(selectEl);

        const input = selectEl.querySelector('input');

        assert.strictEqual(input.getAttribute('role'), 'combobox');
        assert.strictEqual(input.getAttribute('aria-autocomplete'), 'list');
        assert.strictEqual(input.getAttribute('aria-haspopup'), 'listbox');
        assert.strictEqual(input.getAttribute('aria-expanded'), 'false');

    });

    it('should dynamically update aria-expanded state when dropdown visibility shifts', async () => {
        const container = appended(`<ful-select></ful-select>`);

        const selectEl = container.querySelector('ful-select');
        await tick();

        const input = selectEl.querySelector('input');

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await tick();
        assert.strictEqual(input.getAttribute('aria-expanded'), 'true');

        input.dispatchEvent(new Event('blur'));
        assert.strictEqual(input.getAttribute('aria-expanded'), 'false');

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
            create: () => ({
                prefetch: async () => {
                    throw new Error('boom');
                },
                load: async () => [],
            }),
        });
        const container = appended(`<ful-select></ful-select>`);

        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);

        assert.isNotNull(selectEl.querySelector('input[role=combobox]'));
        assert.isTrue(warns.some((args) => String(args[0]).includes('prefetch')));
    });

    it('hides the dropdown and reports the rejection when load fails', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                load: async () => {
                    throw new Error('boom');
                },
            }),
        });
        const container = appended(`<ful-select></ful-select>`);

        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await tick();

        const rejectionsBefore = rejections.length;
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        const dropdown = selectEl.querySelector('ful-dropdown');
        assert.isFalse(dropdown.shown);
        assert.strictEqual(
            selectEl.querySelector('input[role=combobox]').getAttribute('aria-expanded'),
            'false',
            'a failed open leaves the combobox collapsed',
        );
        assert.strictEqual(rejections.length, rejectionsBefore + 1);
        assert.isTrue(errors.some((args) => String(args[0]).includes('boom')));
    });

    it('reports the rejection and keeps the requested keys when exact lookup fails', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                load: async () => [],
                exact: async () => {
                    throw new Error('boom');
                },
            }),
        });
        const container = appended(`<ful-select value="k1"></ful-select>`);

        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        const rejectionsBefore = rejections.length;
        //the rejection is reported by a platform task: give it turns and a little wall time
        await settle(3, 10);

        assert.strictEqual(rejections.length, rejectionsBefore + 1);
        assert.strictEqual(selectEl.value, 'k1', 'the requested key is kept');
        assert.isTrue(warns.length === 0);
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
            await tick();
        }
    };
    const mount = (html) => {
        const container = appended(html);
        return [container.querySelector('ful-select'), container];
    };
    const keydown = (input, code, options = {}) => {
        input.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...options }));
    };
    beforeEach(() => {
        uncaught.length = 0;
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                exact: async () => [],
                load: async () => [
                    { key: 'k1', label: 'Label 1' },
                    { key: 'k2', label: 'Label 2' },
                ],
            }),
        });
    });

    it('ignores Enter before the dropdown is rendered', async () => {
        const [selectEl] = mount(`<ful-select></ful-select>`);
        await Rendering.waitFor(selectEl);

        keydown(selectEl.querySelector('input'), 'Enter');

        assert.deepStrictEqual(uncaught, []);
    });

    it('ignores Enter when the dropdown was never opened', async () => {
        const [selectEl] = mount(`<ful-select></ful-select>`);
        await Rendering.waitFor(selectEl);
        await settle();

        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));
        keydown(selectEl.querySelector('input'), 'Enter');

        assert.deepStrictEqual(uncaught, []);
        assert.deepStrictEqual(changes, []);
        assert.isNull(selectEl.value);
    });

    it('ignores arrow keys when the shown dropdown has no options', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({ prefetch: async () => {}, exact: async () => [], load: async () => [] }),
        });
        const [selectEl] = mount(`<ful-select></ful-select>`);
        await Rendering.waitFor(selectEl);
        await settle();

        const input = selectEl.querySelector('input');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        assert.isTrue(selectEl.querySelector('ful-dropdown').shown);

        keydown(input, 'ArrowDown');
        keydown(input, 'ArrowUp');
        keydown(input, 'PageDown');
        keydown(input, 'PageUp');
        keydown(input, 'Enter');

        assert.deepStrictEqual(uncaught, []);
        assert.isNull(selectEl.value);
    });

    it('says no results when the search matches nothing', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({ prefetch: async () => {}, exact: async () => [], load: async () => [] }),
        });
        const [selectEl] = mount(`<ful-select></ful-select>`);
        await Rendering.waitFor(selectEl);
        await settle();

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        const empty = selectEl.querySelector('ful-dropdown p[data-ref=empty]');
        assert.isFalse(empty.hidden, 'the message replaces the empty list');
        assert.strictEqual(empty.innerText, 'No results');
        assert.isTrue(selectEl.querySelector('menu').hidden, 'no empty listbox is exposed');
    });

    it('keeps the message hidden while there are options', async () => {
        const [selectEl] = mount(`<ful-select></ful-select>`);
        await Rendering.waitFor(selectEl);
        await settle();

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        assert.isTrue(selectEl.querySelector('ful-dropdown p[data-ref=empty]').hidden);
        assert.isFalse(selectEl.querySelector('menu').hidden);
    });

    it('accepts the highlighted option on Enter', async () => {
        const [selectEl] = mount(`<ful-select></ful-select>`);
        await Rendering.waitFor(selectEl);
        await settle();

        const input = selectEl.querySelector('input');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));
        keydown(input, 'Enter');

        assert.deepStrictEqual(uncaught, []);
        assert.strictEqual(selectEl.value, 'k1');
        assert.strictEqual(changes.length, 1);
        assert.strictEqual(changes[0].label, 'Label 1');
        assert.isFalse(selectEl.querySelector('ful-dropdown').shown);
    });

    it('announces its own value in the change detail, with the entry beside it', async () => {
        //every field's detail carries its value, so a listener can rely on
        //el.value === evt.detail.value whatever the field is; the select adds
        //the labeled selection rather than replacing the value with it
        const [selectEl] = mount(`<ful-select></ful-select>`);
        await Rendering.waitFor(selectEl);
        await settle();

        const details = [];
        selectEl.addEventListener('change', (e) => details.push(e.detail));
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        keydown(selectEl.querySelector('input'), 'Enter');

        assert.lengthOf(details, 1);
        assert.strictEqual(details[0].value, selectEl.value, 'the detail is the value the property answers');
        assert.strictEqual(details[0].value, 'k1');
        assert.strictEqual(details[0].entry.label, 'Label 1', 'the labeled selection rides beside it');
    });

    it('points the combobox at a listbox the announcement can resolve in', async () => {
        //aria-activedescendant names an option; without aria-controls and a named
        //listbox the name resolves to nothing and the active option reaches no one
        const [selectEl] = mount(`<ful-select></ful-select>`);
        await Rendering.waitFor(selectEl);
        await settle();
        const input = selectEl.querySelector('input');
        const controls = input.getAttribute('aria-controls');

        assert.isNotNull(controls, 'the combobox names what it controls');
        const listbox = selectEl.querySelector(`#${controls}`);
        assert.isNotNull(listbox, 'and that name resolves');
        assert.strictEqual(listbox.getAttribute('role'), 'listbox');

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        const active = input.getAttribute('aria-activedescendant');
        assert.isNotNull(active);
        assert.isNotNull(listbox.querySelector(`#${active}`), 'the active option lives inside the listbox');
    });

    it('announces the highlighted option through aria-activedescendant', async () => {
        const [selectEl] = mount(`<ful-select></ful-select>`);
        await Rendering.waitFor(selectEl);
        await settle();
        const input = selectEl.querySelector('input');
        const active = () => input.getAttribute('aria-activedescendant');
        const highlighted = () => selectEl.querySelector('menu li[selected]')?.id;

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        assert.strictEqual(active(), highlighted(), 'the highlighted option is the announced one');

        keydown(input, 'ArrowDown');
        assert.strictEqual(active(), highlighted(), 'moving the highlight moves the announcement');

        keydown(input, 'Enter');
        assert.isNull(active(), 'the announcement leaves with the dropdown');

        keydown(input, 'ArrowDown', { altKey: true });
        await opened();
        assert.strictEqual(active(), highlighted());
        input.dispatchEvent(new FocusEvent('blur'));
        assert.isNull(active(), 'blur drops the announcement too');
    });

    it('toggles the dropdown when the input itself is clicked', async () => {
        const [selectEl] = mount(`<ful-select></ful-select>`);
        await Rendering.waitFor(selectEl);
        await settle();
        const input = selectEl.querySelector('input');

        input.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        assert.isTrue(selectEl.querySelector('ful-dropdown').shown);
        assert.strictEqual(input.getAttribute('aria-expanded'), 'true');

        input.dispatchEvent(new Event('click', { bubbles: true }));
        assert.isFalse(selectEl.querySelector('ful-dropdown').shown);
        assert.strictEqual(input.getAttribute('aria-expanded'), 'false');
    });

    it('offers the whole list when opened from rest, the label is not a needle', async () => {
        const needles = [];
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
                load: async (needle) => {
                    needles.push(needle);
                    return [{ key: 'k1', label: 'Label 1' }];
                },
            }),
        });
        const [selectEl] = mount(`<ful-select value="k1"></ful-select>`);
        await settle();
        const input = selectEl.querySelector('input');
        assert.strictEqual(input.value, 'Label k1');

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        assert.deepStrictEqual(needles, [''], 'the label must not filter the list');
    });

    it('opens highlighting the current selection', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
                load: async () => [
                    { key: 'k1', label: 'Label 1' },
                    { key: 'k2', label: 'Label 2' },
                ],
            }),
        });
        const [selectEl] = mount(`<ful-select value="k2"></ful-select>`);
        await settle();
        const input = selectEl.querySelector('input');

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        assert.strictEqual(selectEl.querySelector('menu li[selected]').textContent.trim(), 'Label 2');

        keydown(input, 'Enter');
        assert.strictEqual(selectEl.value, 'k2', 're-accepting the highlighted selection keeps it');
    });

    it('opens highlighting a first-entry selection over a custom template default', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
                load: async () => [
                    { key: 'k1', label: 'Label 1' },
                    { key: 'k2', label: 'Label 2' },
                ],
            }),
        });
        //the custom template carries its own default highlight, as the stock one
        //marks index 0: the picked key must beat it wherever it sits, index 0 included
        const [selectEl] = mount(`<ful-select value="k1">
            <template slot="dropdown">
                <li data-tpl-each="self" data-tpl-selected="index == 1" data-tpl-value="index" role="option" data-tpl-aria-selected="index == 1 ? 'true' : 'false'">{{ label }}</li>
            </template>
        </ful-select>`);
        await settle();
        const input = selectEl.querySelector('input');

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        assert.strictEqual(selectEl.querySelector('menu li[selected]').textContent.trim(), 'Label 1');

        keydown(input, 'Enter');
        assert.strictEqual(selectEl.value, 'k1', 're-accepting the highlighted selection keeps it');
    });

    it('jumps to the last option on End and back on Home', async () => {
        const [selectEl] = mount(`<ful-select></ful-select>`);
        await Rendering.waitFor(selectEl);
        await settle();
        const input = selectEl.querySelector('input');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        keydown(input, 'End');
        keydown(input, 'Enter');
        assert.strictEqual(selectEl.value, 'k2');

        keydown(input, 'ArrowDown', { altKey: true });
        await opened();
        keydown(input, 'End');
        keydown(input, 'Home');
        keydown(input, 'Enter');
        assert.strictEqual(selectEl.value, 'k1');
    });

    it('pages through the options with PageDown and PageUp', async () => {
        const [selectEl] = mount(`<ful-select></ful-select>`);
        await Rendering.waitFor(selectEl);
        await settle();
        const input = selectEl.querySelector('input');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        keydown(input, 'PageDown');
        keydown(input, 'Enter');
        assert.strictEqual(selectEl.value, 'k2', 'a page down lands past the first option');
    });

    it('opens with Alt+ArrowDown and closes with Alt+ArrowUp', async () => {
        const [selectEl] = mount(`<ful-select></ful-select>`);
        await Rendering.waitFor(selectEl);
        await settle();
        const input = selectEl.querySelector('input');

        keydown(input, 'ArrowDown', { altKey: true });
        await opened();
        assert.isTrue(selectEl.querySelector('ful-dropdown').shown);
        assert.strictEqual(input.getAttribute('aria-expanded'), 'true');

        keydown(input, 'ArrowUp', { altKey: true });
        assert.isFalse(selectEl.querySelector('ful-dropdown').shown);
        assert.strictEqual(input.getAttribute('aria-expanded'), 'false');
    });
});

describe('Select value resolution', () => {
    const settle = async () => {
        for (let i = 0; i !== 20; ++i) {
            await tick();
        }
    };
    let exactCalls = [];
    const mount = async (html) => {
        const container = appended(html);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };
    beforeEach(() => {
        exactCalls = [];
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                load: async () => [],
                exact: async (...keys) => {
                    exactCalls.push(keys);
                    return keys.map((k) => ({ key: k, label: `Label ${k}` }));
                },
            }),
        });
    });

    it('does not query the loader when there is no value', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`);

        assert.deepStrictEqual(exactCalls, []);
        assert.isNull(selectEl.value);
    });

    it('does not query the loader when a multiple select has no value', async () => {
        const [selectEl] = await mount(`<ful-select multiple></ful-select>`);

        assert.deepStrictEqual(exactCalls, []);
        assert.deepStrictEqual(selectEl.value, []);
    });

    it('still resolves an empty key, which an <option value=""> can carry', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`);
        assert.deepStrictEqual(exactCalls, []);

        selectEl.value = '';
        await settle();

        assert.deepStrictEqual(exactCalls, [['']]);
        assert.strictEqual(selectEl.value, '');
    });

    it('resolves the declared keys', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);

        assert.deepStrictEqual(exactCalls, [['k1', 'k2']]);
        assert.deepStrictEqual(selectEl.value, ['k1', 'k2']);
    });

    it('clears without querying the loader when the value attribute is removed', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1"></ful-select>`);
        assert.deepStrictEqual(exactCalls, [['k1']]);

        selectEl.removeAttribute('value');
        await settle();

        assert.deepStrictEqual(exactCalls, [['k1']]);
        assert.deepStrictEqual(selectEl.value, []);
    });
});

describe('Select value assignment', () => {
    const settle = async () => {
        for (let i = 0; i !== 20; ++i) {
            await tick();
        }
    };
    const mount = async (html, loader) => {
        registry.defineComponent('loaders:select', { create: () => loader });
        const container = appended(html);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };
    const labelling = (delays = {}) => ({
        prefetch: async () => {},
        load: async () => [],
        exact: async (...keys) => {
            await new Promise((resolve) => setTimeout(resolve, delays[keys[0]] ?? 0));
            return keys.map((k) => ({ key: k, label: `Label ${k}` }));
        },
    });

    it('exposes the assigned keys synchronously', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`, labelling());

        selectEl.value = 'k1';

        assert.strictEqual(selectEl.value, 'k1', 'value must not lag behind the assignment');
        await settle();
        assert.strictEqual(selectEl.value, 'k1');
    });

    it('labels the field once the loader resolves them', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`, labelling({ k1: 20 }));
        const input = selectEl.querySelector('input');

        selectEl.value = 'k1';
        assert.strictEqual(input.value, 'k1', 'the key stands in for its label');
        assert.isNull(selectEl.querySelector('ful-control > ful-badge'), 'a single select carries no badge');

        await new Promise((resolve) => setTimeout(resolve, 30));
        await settle();
        assert.strictEqual(input.value, 'Label k1');
    });

    it('restores the label in the field when the dropdown leaves', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`, labelling());
        const input = selectEl.querySelector('input');
        selectEl.value = 'k1';
        await settle();

        input.value = 'ty';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        assert.strictEqual(input.value, 'ty', 'the typed needle owns the field while editing');

        input.dispatchEvent(new FocusEvent('blur'));

        assert.strictEqual(input.value, 'Label k1', 'blur brings the label back');
    });

    it('keeps the newest assignment when an older lookup resolves late', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`, labelling({ slow: 40 }));

        selectEl.value = 'slow';
        selectEl.value = 'fast';
        await settle();

        assert.strictEqual(selectEl.value, 'fast');
        assert.strictEqual(selectEl.querySelector('input').value, 'Label fast');
    });

    it('carries its value as soon as the upgrade completes, labels follow', async () => {
        registry.defineComponent('loaders:select', { create: () => labelling({ k1: 20 }) });
        const container = appended(`<ful-select value="k1"></ful-select>`);
        const selectEl = container.querySelector('ful-select');

        await Rendering.waitFor(selectEl);

        assert.strictEqual(selectEl.value, 'k1', 'the value does not wait for the loader');
        await new Promise((resolve) => setTimeout(resolve, 30));
        await settle();
        assert.strictEqual(selectEl.querySelector('input').value, 'Label k1');
    });

    it('does not hold up the upgrade when the loader never answers', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({ prefetch: async () => {}, load: async () => [], exact: () => new Promise(() => {}) }),
        });
        const container = appended(`<ful-select value="k1"></ful-select>`);
        const selectEl = container.querySelector('ful-select');

        const outcome = await Promise.race([
            Rendering.waitFor(selectEl).then(() => 'upgraded'),
            new Promise((resolve) => setTimeout(() => resolve('still waiting'), 300)),
        ]);

        assert.strictEqual(outcome, 'upgraded');
        assert.strictEqual(selectEl.value, 'k1');
    });
});

describe('Select key types', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };
    const filtering = (data) => ({
        prefetch: async () => {},
        load: async () => data,
        exact: async (...keys) => data.filter(({ key }) => keys.some((r) => r == key)),
    });
    const numeric = () =>
        filtering([
            { key: 16, label: 'Label 16', metadata: undefined },
            { key: 17, label: 'Label 17', metadata: undefined },
        ]);
    const booleany = () =>
        filtering([
            { key: true, label: 'Yes', metadata: undefined },
            { key: false, label: 'No', metadata: undefined },
        ]);
    const echoing = () => ({
        prefetch: async () => {},
        load: async () => [],
        exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
    });
    const mount = async (html, loader) => {
        registry.defineComponent('loaders:select', { create: () => loader });
        const container = appended(html);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };

    it('keeps a string assignment selected when the loader keys are numbers', async () => {
        const [selectEl] = await mount(`<ful-select value="16"></ful-select>`, numeric());

        assert.strictEqual(selectEl.value, '16');
        assert.strictEqual(selectEl.querySelector('input').value, 'Label 16');
    });

    it('coerces a javascript assignment of a number to a string key', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`, numeric());

        selectEl.value = 16;
        await settle();

        assert.strictEqual(selectEl.value, '16');
        assert.strictEqual(selectEl.querySelector('input').value, 'Label 16');
    });

    it('exposes number keys when k-type is number', async () => {
        const [selectEl] = await mount(`<ful-select k-type="number" value="16"></ful-select>`, numeric());

        assert.strictEqual(selectEl.value, 16);
        assert.strictEqual(selectEl.querySelector('input').value, 'Label 16');
        assert.deepStrictEqual(selectEl.entry, { key: 16, label: 'Label 16', metadata: undefined });
    });

    it('coerces every key of a multiple assignment', async () => {
        const [selectEl] = await mount(
            `<ful-select k-type="number" multiple value="16,17"></ful-select>`,
            numeric(),
        );

        assert.deepStrictEqual(selectEl.value, [16, 17]);
    });

    it('exposes boolean keys when k-type is boolean', async () => {
        const [selectEl] = await mount(
            `<ful-select k-type="boolean" value="true"></ful-select>`,
            booleany(),
        );

        assert.strictEqual(selectEl.value, true);
        assert.strictEqual(selectEl.querySelector('input').value, 'Yes');
    });

    it('keeps a key that does not decode as it is', async () => {
        const [selectEl] = await mount(`<ful-select k-type="number" value="abc"></ful-select>`, echoing());

        assert.strictEqual(selectEl.value, 'abc');
        assert.strictEqual(selectEl.querySelector('input').value, 'Label abc');
    });

    it('reports an option picked from the dropdown as a string by default', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`, numeric());

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        selectEl.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));

        assert.strictEqual(selectEl.value, '16');
        assert.strictEqual(selectEl.querySelector('input').value, 'Label 16');
    });

    it('coerces an option picked from the dropdown when k-type is number', async () => {
        const [selectEl] = await mount(`<ful-select k-type="number"></ful-select>`, numeric());

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        selectEl.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));

        assert.strictEqual(selectEl.value, 16);
        assert.strictEqual(selectEl.querySelector('input').value, 'Label 16');
    });
});

describe('Select enter key inside a form', () => {
    let submits = [];
    const settle = async () => {
        for (let i = 0; i !== 20; ++i) {
            await tick();
        }
    };
    const mount = async (html) => {
        const container = appended(html);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };
    const enter = (selectEl) => {
        selectEl.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
    };
    beforeEach(() => {
        submits = [];
        registry.defineComponent('loaders:form', {
            create: () => ({
                prepare: async (v) => v,
                submit: async (values) => {
                    submits.push(values);
                    return {};
                },
                transform: async (r) => r,
            }),
        });
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
                load: async () => [{ key: 'k1', label: 'Label 1' }],
            }),
        });
    });

    it('submits the form when the dropdown is closed', async () => {
        const [selectEl] = await mount(`
            <ful-form>
                <ful-select name="s">label</ful-select>
                <button type="submit">go</button>
            </ful-form>`);

        enter(selectEl);
        await settle();

        assert.strictEqual(submits.length, 1, 'enter reaches the form');
    });

    it('accepts the highlighted option instead of submitting when the dropdown is open', async () => {
        const [selectEl] = await mount(`
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
    });

    it('does nothing on enter outside a form', async () => {
        const [selectEl] = await mount(`<ful-select name="s">label</ful-select>`);

        enter(selectEl);
        await settle();

        assert.strictEqual(submits.length, 0);
    });
});

describe('Select selection removal', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };
    const labelling = () => ({
        prefetch: async () => {},
        load: async () => [{ key: 'k1', label: 'Label 1' }],
        exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
    });
    const mount = async (html, loader) => {
        registry.defineComponent('loaders:select', { create: () => loader ?? labelling() });
        const container = appended(html);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };
    const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
    const badges = (selectEl) => [...selectEl.querySelectorAll('ful-control > ful-badge')];
    const items = (selectEl) => [...selectEl.querySelectorAll('ful-item-list > ful-item')];

    it('drops the entry whose badge was clicked, keeping the others', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2,k3"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));

        click(badges(selectEl)[1]);

        assert.deepStrictEqual(selectEl.value, ['k1', 'k3'], 'the clicked badge is the one removed');
        assert.strictEqual(changes.length, 1);
        assert.deepStrictEqual(
            changes[0].map((v) => v.key),
            ['k1', 'k3'],
        );
        assert.deepStrictEqual(
            badges(selectEl).map((b) => b.innerText),
            ['Label k1', 'Label k3'],
        );
        assert.deepStrictEqual(
            items(selectEl).map((i) => i.getAttribute('data-key')),
            ['k1', 'k3'],
        );
    });

    it('drops the entry whose item remove button was clicked', async () => {
        const [selectEl] = await mount(`<ful-select multiple itemlist value="k1,k2,k3"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));

        click(items(selectEl)[2].querySelector('button'));

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2']);
        assert.strictEqual(changes.length, 1);
        assert.deepStrictEqual(
            changes[0].map((v) => v.key),
            ['k1', 'k2'],
        );
        assert.deepStrictEqual(
            items(selectEl).map((i) => i.getAttribute('data-key')),
            ['k1', 'k2'],
        );
        assert.deepStrictEqual(
            badges(selectEl).map((b) => b.innerText),
            ['Label k1', 'Label k2'],
        );
    });

    it('renders the item list from a slotted items template, removals still working', async () => {
        const [selectEl] = await mount(`
            <ful-select multiple itemlist value="k1,k2">
                pick
                <template slot="items">
                    <ful-item data-tpl-each="entries" data-tpl-var="entry" data-tpl-data-key="entry.key">
                        <div><em>{{ entry.label }}</em><button type="button" data-tpl-aria-label="#l10n:t('select.remove')"><ful-icon name="x-lg" aria-hidden="true"></ful-icon></button></div>
                    </ful-item>
                </template>
            </ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));

        assert.deepStrictEqual(
            items(selectEl).map((i) => i.querySelector('em')?.textContent),
            ['Label k1', 'Label k2'],
            'the slotted template shapes each entry',
        );

        click(items(selectEl)[0].querySelector('button'));

        assert.deepStrictEqual(selectEl.value, ['k2']);
        assert.deepStrictEqual(
            items(selectEl).map((i) => i.querySelector('em')?.textContent),
            ['Label k2'],
        );
    });

    it('removes nothing when the click misses both a badge and a remove button', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));

        click(selectEl.querySelector('ful-control'));
        click(items(selectEl)[0].querySelector('div'));

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2']);
        assert.deepStrictEqual(changes, []);
    });

    it('keeps the selection when a disabled select is clicked', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));
        selectEl.disabled = true;

        click(badges(selectEl)[0]);
        click(items(selectEl)[0].querySelector('button'));

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2']);
        assert.deepStrictEqual(changes, []);
    });

    it('keeps the selection when a readonly select is clicked', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));
        selectEl.readonly = true;

        click(badges(selectEl)[0]);
        click(items(selectEl)[0].querySelector('button'));

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2']);
        assert.deepStrictEqual(changes, []);
    });

    it('keeps the selection when a claim lands while the dropdown is open on a pick', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));
        const dropdown = selectEl.querySelector('ful-dropdown');
        //a pick arriving from a dropdown that was open before the claim landed
        selectEl.readonly = true;
        dropdown.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                cancelable: false,
                detail: { index: 'k9', data: ['k9', 'k9'] },
            }),
        );

        assert.deepStrictEqual(selectEl.value, ['k1'], 'the pick is not applied');
        assert.deepStrictEqual(changes, []);
        assert.isFalse(dropdown.shown, 'the leftover dropdown is closed');
    });

    it('reports a single select as empty once backspace clears its label', async () => {
        const [selectEl] = await mount(`<ful-select value="k1"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));
        const input = selectEl.querySelector('input');
        input.setSelectionRange(0, 0);

        input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace', bubbles: true }));

        assert.isNull(selectEl.value);
        assert.deepStrictEqual(changes, [null], 'a single select reports no selection as null');
        assert.deepStrictEqual(badges(selectEl), []);
        assert.strictEqual(input.value, '');
    });
});

describe('Select chips and picked options', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };
    const mount = async (html) => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                load: async () => [{ key: 'k1', label: 'Label k1' }],
                exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
            }),
        });
        const container = appended(html);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };

    it('marks the picked options selected, leaving the highlight to activedescendant', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1"></ful-select>`);
        selectEl.querySelector('input').dispatchEvent(
            new KeyboardEvent('keydown', { code: 'ArrowDown', altKey: true, bubbles: true }),
        );
        await settle();

        const picked = [...selectEl.querySelectorAll('menu li')].filter(
            (li) => li.getAttribute('aria-selected') === 'true',
        );
        assert.deepStrictEqual(
            picked.map((li) => li.textContent.trim()),
            ['Label k1'],
            'aria-selected says what is picked; the active option is named by aria-activedescendant',
        );
    });

    it('puts one chip in the tab order, so the group is reachable', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);

        const chips = [...selectEl.querySelectorAll('ful-badge')];
        assert.lengthOf(chips, 2);
        assert.deepStrictEqual(
            chips.map((c) => c.getAttribute('tabindex')),
            ['0', '-1'],
            'a roving tab stop, not a group Tab skips entirely',
        );
    });
});

describe('Select chips keyboard access', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };
    const mount = async (html) => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                load: async () => [],
                exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
            }),
        });
        const container = appended(html);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };
    const keydown = (el, code) => {
        el.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    };

    it('hands the focus to the chips when the caret cannot move left', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        const input = selectEl.querySelector('input');
        const [first, second] = [...selectEl.querySelectorAll('ful-control > ful-badge')];
        input.focus();
        input.setSelectionRange(0, 0);

        keydown(input, 'ArrowLeft');
        assert.strictEqual(document.activeElement, second, 'the caret hands over to the last chip');

        keydown(document.activeElement, 'ArrowLeft');
        assert.strictEqual(document.activeElement, first);

        keydown(document.activeElement, 'ArrowRight');
        assert.strictEqual(document.activeElement, second);

        keydown(document.activeElement, 'ArrowRight');
        assert.strictEqual(document.activeElement, input, 'past the last chip the field takes over');
    });

    it('removes the focused chip with Enter or Delete, returning to the field', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));
        const [, second] = [...selectEl.querySelectorAll('ful-control > ful-badge')];

        second.focus();
        keydown(second, 'Enter');
        assert.deepStrictEqual(selectEl.value, ['k1']);
        assert.deepStrictEqual(
            changes[0].map((v) => v.key),
            ['k1'],
        );
        assert.strictEqual(document.activeElement, selectEl.querySelector('input'));

        const survivor = selectEl.querySelector('ful-control > ful-badge');
        survivor.focus();
        keydown(survivor, 'Delete');
        assert.deepStrictEqual(selectEl.value, [], 'the last chip goes too');
        assert.strictEqual(document.activeElement, selectEl.querySelector('input'));
    });

    it('returns to the field from a chip on Escape, removing nothing', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));
        const badge = selectEl.querySelector('ful-control > ful-badge');

        badge.focus();
        keydown(badge, 'Escape');

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2']);
        assert.deepStrictEqual(changes, []);
        assert.strictEqual(document.activeElement, selectEl.querySelector('input'));
    });

    it('leaves a readonly select alone', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        selectEl.readonly = true;
        const badge = selectEl.querySelector('ful-control > ful-badge');

        badge.focus();
        keydown(badge, 'Enter');

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2']);
    });
});

describe('Select backspace', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };
    const mount = async (html) => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                load: async () => [{ key: 'k1', label: 'Label 1' }],
                exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
            }),
        });
        const container = appended(html);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };
    const backspace = (input) =>
        input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace', bubbles: true }));

    it('removes the last selection when the caret sits at the start', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));
        const input = selectEl.querySelector('input');
        input.setSelectionRange(0, 0);

        backspace(input);

        assert.deepStrictEqual(selectEl.value, ['k1'], 'the last entry goes first');
        assert.deepStrictEqual(
            changes[0].map((v) => v.key),
            ['k1'],
        );
        assert.deepStrictEqual(
            [...selectEl.querySelectorAll('ful-control > ful-badge')].map((b) => b.innerText),
            ['Label k1'],
        );
    });

    it('leaves the selection alone while the caret is inside the typed text', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));
        const input = selectEl.querySelector('input');
        input.value = 'ab';
        input.setSelectionRange(2, 2);

        backspace(input);

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2'], 'backspace belongs to the text being typed');
        assert.deepStrictEqual(changes, []);
    });

    it('leaves the selection alone while text is selected from the start', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));
        const input = selectEl.querySelector('input');
        input.value = 'ab';
        input.setSelectionRange(0, 2);

        backspace(input);

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2'], 'backspace deletes the highlighted text');
        assert.deepStrictEqual(changes, []);
    });

    it('does not fire a change when there is nothing to remove', async () => {
        const [selectEl] = await mount(`<ful-select multiple></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));
        const input = selectEl.querySelector('input');
        input.setSelectionRange(0, 0);

        backspace(input);

        assert.deepStrictEqual(selectEl.value, []);
        assert.deepStrictEqual(changes, []);
    });

    it('ignores backspace on a readonly select', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        selectEl.readonly = true;
        const input = selectEl.querySelector('input');
        input.setSelectionRange(0, 0);

        backspace(input);

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2']);
    });
});

describe('Select blur', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };
    const mount = async (html) => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                load: async () => [{ key: 'k1', label: 'Label 1' }],
                exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
            }),
        });
        const container = appended(html);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };

    it('clears the typed text and closes the dropdown when focus leaves', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`);
        const input = selectEl.querySelector('input');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        input.value = 'typed';
        assert.isTrue(selectEl.querySelector('ful-dropdown').shown);

        input.dispatchEvent(new FocusEvent('blur'));

        assert.strictEqual(input.value, '', 'a half typed needle is not kept around');
        assert.strictEqual(input.getAttribute('aria-expanded'), 'false');
        assert.isFalse(selectEl.querySelector('ful-dropdown').shown);
    });

    it('stays open when focus moves to something inside the select', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`);
        const input = selectEl.querySelector('input');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        input.value = 'typed';

        input.dispatchEvent(new FocusEvent('blur', { relatedTarget: selectEl.querySelector('menu') }));

        assert.strictEqual(input.value, 'typed', 'clicking an option must not wipe the needle first');
        assert.strictEqual(input.getAttribute('aria-expanded'), 'true');
        assert.isTrue(selectEl.querySelector('ful-dropdown').shown);
    });

    it('does not let a throttled search reopen the dropdown after blur', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`);
        const input = selectEl.querySelector('input');
        //the leading edge opens it, the second request is queued on the trailing edge
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        input.value = 'ty';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        input.dispatchEvent(new FocusEvent('blur'));
        //the throttle window is 400ms: outlive it to catch a load that was not aborted
        await new Promise((resolve) => setTimeout(resolve, 450));

        assert.isFalse(selectEl.querySelector('ful-dropdown').shown);
        assert.strictEqual(input.getAttribute('aria-expanded'), 'false');
    });
});

describe('Select loader access and entries', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };
    const mount = async (html, loader) => {
        registry.defineComponent('loaders:select', { create: () => loader });
        const container = appended(html);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };
    const updatable = () => {
        let data = [{ key: 'k1', label: 'Label 1' }];
        return {
            prefetch: async () => {},
            load: async () => data,
            exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
            update: (d) => {
                data = d;
                return 'updated';
            },
        };
    };
    const described = () => ({
        prefetch: async () => {},
        load: async () => [],
        exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}`, metadata: { id: k } })),
    });

    it('hands the live loader to withLoader, so the next search sees the new options', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`, updatable());

        const outcome = await selectEl.withLoader((loader) => loader.update([{ key: 'k9', label: 'Nine' }]));

        assert.strictEqual(outcome, 'updated', 'withLoader returns what the caller returns');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        assert.deepStrictEqual(
            [...selectEl.querySelectorAll('menu li')].map((li) => li.textContent.trim()),
            ['Nine'],
        );
    });

    it('reports label and metadata through entry, keys through value', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`, described());

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2']);
        assert.deepStrictEqual(selectEl.entry, [
            { key: 'k1', label: 'Label k1', metadata: { id: 'k1' } },
            { key: 'k2', label: 'Label k2', metadata: { id: 'k2' } },
        ]);
    });

    it('reports the one entry of a single select, and null when it has none', async () => {
        const [selectEl] = await mount(`<ful-select value="k1"></ful-select>`, described());

        assert.deepStrictEqual(selectEl.entry, { key: 'k1', label: 'Label k1', metadata: { id: 'k1' } });

        selectEl.value = null;
        await settle();

        assert.isNull(selectEl.entry);
        assert.isNull(selectEl.value);
    });
});

describe('Select edits made while a lookup is in flight', () => {
    it('does not bring back a selection removed before the labels arrived', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                load: async () => [],
                exact: async (...keys) => {
                    await new Promise((resolve) => setTimeout(resolve, 40));
                    return keys.map((k) => ({ key: k, label: `Label ${k}` }));
                },
            }),
        });
        const container = appended(`<ful-select multiple name="s" value="k1,k2">label</ful-select>`);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);

        selectEl.querySelectorAll('ful-badge')[1].dispatchEvent(new Event('click', { bubbles: true }));
        assert.deepStrictEqual(selectEl.value, ['k1']);

        await new Promise((resolve) => setTimeout(resolve, 120));

        assert.deepStrictEqual(selectEl.value, ['k1'], 'the lookup must not undo the removal');
        assert.strictEqual(selectEl.querySelector('ful-badge').innerText, 'Label k1', 'the survivor is still labelled');
    });
});

describe('Select chips and validity', () => {
    const settle = async () => {
        for (let i = 0; i !== 20; ++i) {
            await tick();
        }
    };
    const keydown = (input, code, options = {}) => {
        input.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...options }));
    };
    const mount = async (html) => {
        const container = appended(html);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };
    const labelling = () => ({
        prefetch: async () => {},
        load: async () => [],
        exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
    });
    beforeEach(() => {
        registry.defineComponent('loaders:select', { create: () => labelling() });
    });

    it('removes the last chip on Backspace at the caret start', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2">labels</ful-select>`);
        const input = selectEl.querySelector('input');
        assert.lengthOf(selectEl.querySelectorAll('ful-badge'), 2, 'two chips are rendered');

        input.setSelectionRange(0, 0);
        keydown(input, 'Backspace');

        assert.deepStrictEqual(selectEl.value, ['k1'], 'the newest chip is gone');
        assert.lengthOf(selectEl.querySelectorAll('ful-badge'), 1);
        assert.strictEqual(selectEl.querySelector('ful-badge').innerText, 'Label k1');
    });

    it('ignores the chip remove button while readonly', async () => {
        const [selectEl] = await mount(
            `<ful-select multiple itemlist readonly value="k1,k2">labels</ful-select>`,
        );

        selectEl.querySelector('ful-item button')?.click();

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2'], 'a readonly select keeps its selection');
    });

    it('closes the open dropdown on Tab without picking anything', async () => {
        const [selectEl] = await mount(`<ful-select>labels</ful-select>`);
        const input = selectEl.querySelector('input');
        registry.defineComponent('loaders:select', {
            create: () => ({ load: async () => [{ key: 'k1', label: 'Label 1' }] }),
        });
        input.dispatchEvent(new Event('click', { bubbles: true }));
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
        assert.strictEqual(input.getAttribute('aria-expanded'), 'true');

        keydown(input, 'Tab');

        assert.strictEqual(input.getAttribute('aria-expanded'), 'false');
        assert.isFalse(selectEl.querySelector('ful-dropdown').shown);
        assert.isNull(selectEl.value);
    });

    it('clears the field error when the custom validity is reset', async () => {
        const [selectEl] = await mount(`<ful-select>labels</ful-select>`);

        selectEl.setCustomValidity('nope');
        assert.strictEqual(selectEl.querySelector('ful-field-error').innerText, 'nope');

        selectEl.setCustomValidity();
        assert.strictEqual(selectEl.querySelector('ful-field-error').innerText, '');
    });
});

describe('Select pointer picking', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };
    const mount = async (html) => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                load: async () => [
                    { key: 'k1', label: 'Label 1' },
                    { key: 'k2', label: 'Label 2' },
                ],
                exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
            }),
        });
        const container = appended(html);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };

    it('picks the clicked option and closes the dropdown', async () => {
        const [selectEl] = await mount(`<ful-select>pick</ful-select>`);
        const input = selectEl.querySelector('input');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        selectEl.querySelectorAll('menu li')[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));

        assert.strictEqual(selectEl.value, 'k2', 'the clicked option is the picked one');
        assert.strictEqual(input.value, 'Label 2');
        assert.isFalse(selectEl.querySelector('ful-dropdown').shown);
        assert.strictEqual(input.getAttribute('aria-expanded'), 'false');
    });

    it('closes without picking when the blank area of the menu is clicked', async () => {
        const [selectEl] = await mount(`<ful-select>pick</ful-select>`);
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        selectEl.querySelector('menu').dispatchEvent(new MouseEvent('click', { bubbles: true }));

        assert.isNull(selectEl.value);
        assert.isFalse(selectEl.querySelector('ful-dropdown').shown);
    });
});

describe('Select dropdown opening', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };
    const mount = async (html) => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                load: async () => [{ key: 'k1', label: 'Label 1' }],
                exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
            }),
        });
        const container = appended(html);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };
    const keydown = (input, code) => {
        input.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    };

    it('opens with a plain ArrowDown, starting from the current selection', async () => {
        const [selectEl] = await mount(`<ful-select value="k1">pick</ful-select>`);
        const input = selectEl.querySelector('input');

        keydown(input, 'ArrowDown');
        await opened();

        assert.isTrue(selectEl.querySelector('ful-dropdown').shown);
        assert.strictEqual(input.getAttribute('aria-expanded'), 'true');
        assert.strictEqual(selectEl.querySelector('menu li[selected]').textContent.trim(), 'Label 1');
    });

    it('closes on Escape, bringing the label of the selection back', async () => {
        const [selectEl] = await mount(`<ful-select value="k1">pick</ful-select>`);
        const input = selectEl.querySelector('input');
        keydown(input, 'ArrowDown');
        await opened();
        input.value = 'needle';

        keydown(input, 'Escape');

        assert.isFalse(selectEl.querySelector('ful-dropdown').shown);
        assert.strictEqual(input.value, 'Label k1', 'escaping an edit restores the resolved label');
    });

    it('does not open when a disabled select is clicked', async () => {
        const [selectEl] = await mount(`<ful-select value="k1">pick</ful-select>`);
        selectEl.disabled = true;

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        assert.isFalse(selectEl.querySelector('ful-dropdown').shown);
        assert.strictEqual(selectEl.querySelector('input').getAttribute('aria-expanded'), 'false');
    });

    it('does not open when a readonly select is clicked', async () => {
        const [selectEl] = await mount(`<ful-select value="k1">pick</ful-select>`);
        selectEl.readonly = true;

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        assert.isFalse(selectEl.querySelector('ful-dropdown').shown);
    });
});

describe('Select inner control isolation', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };
    const mount = async (html) => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                load: async () => [{ key: 'k1', label: 'Label 1' }],
                exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
            }),
        });
        const container = appended(html);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };

    it('does not re-emit the inner input change as its own', async () => {
        const [selectEl] = await mount(`<ful-select value="k1">pick</ful-select>`);
        const seen = [];
        selectEl.addEventListener('change', (e) => seen.push(e.detail));

        selectEl.querySelector('input').dispatchEvent(new Event('change', { bubbles: true }));

        assert.deepStrictEqual(seen, [], 'only the element announces changes, with tuple details');
    });

    it('ignores typing on a disabled select', async () => {
        const [selectEl] = await mount(`<ful-select>pick</ful-select>`);
        const input = selectEl.querySelector('input');
        selectEl.disabled = true;

        input.value = 'ty';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await opened();

        assert.isFalse(selectEl.querySelector('ful-dropdown').shown, 'a disabled select never searches');
        assert.strictEqual(input.value, 'ty', 'the typed text is left to the platform');
    });

    it('keeps the caret where typing left it when the field regains focus', async () => {
        const [selectEl] = await mount(`<ful-select value="k1">pick</ful-select>`);
        const input = selectEl.querySelector('input');
        input.value = 'ty';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await opened();
        input.setSelectionRange(2, 2);

        input.dispatchEvent(new FocusEvent('focus'));

        assert.strictEqual(input.selectionStart, 2, 'refocusing mid-edit must not select the whole needle');
        assert.strictEqual(input.selectionEnd, 2);
    });
});

describe('Select stray clicks', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };
    const mount = async (html) => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                load: async () => [],
                exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
            }),
        });
        const container = appended(html);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };

    it('removes nothing when a badge nested somewhere else in the control is clicked', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2">pick</ful-select>`);
        //not a direct child of the control: decorative chrome around the field,
        //not one of the selection badges the removal is indexed by
        const wrapper = document.createElement('span');
        const stray = document.createElement('ful-badge');
        stray.innerText = 'decorative';
        wrapper.appendChild(stray);
        selectEl.querySelector('ful-control').appendChild(wrapper);
        const seen = [];
        selectEl.addEventListener('change', (e) => seen.push(e.detail));

        stray.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2']);
        assert.deepStrictEqual(seen, []);
    });

    it('removes nothing when a button outside any item is clicked in the item list', async () => {
        const [selectEl] = await mount(`<ful-select multiple itemlist value="k1,k2">pick</ful-select>`);
        const stray = document.createElement('button');
        stray.type = 'button';
        stray.innerText = 'add all';
        selectEl.querySelector('ful-item-list').appendChild(stray);
        const seen = [];
        selectEl.addEventListener('change', (e) => seen.push(e.detail));

        stray.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2']);
        assert.deepStrictEqual(seen, []);
    });
});

describe('Select failed searches', () => {
    const rejections = [];
    window.addEventListener('unhandledrejection', (e) => {
        rejections.push(e.reason);
        e.preventDefault();
    });
    let originalError;
    let errors;
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };
    const mount = async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                load: async () => {
                    throw new Error('search backend down');
                },
                exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
            }),
        });
        const container = appended(`<ful-select>pick</ful-select>`);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };
    beforeEach(() => {
        originalError = console.error;
        errors = [];
        console.error = (...args) => errors.push(args);
    });
    afterEach(() => {
        console.error = originalError;
    });

    it('keeps the typed needle for another try after a failed search', async () => {
        const [selectEl] = await mount();
        const input = selectEl.querySelector('input');
        const rejectionsBefore = rejections.length;

        input.value = 'ty';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await settle();
        assert.isFalse(selectEl.querySelector('ful-dropdown').shown, 'the failed search closed the dropdown');

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));

        assert.strictEqual(input.value, 'ty', 'clicking back in must not wipe the needle being retried');
        //the throttle window outlives the test: drain it so no load leaks out
        await new Promise((resolve) => setTimeout(resolve, 450));

        assert.isAbove(rejections.length, rejectionsBefore, 'the retried search failed again, as configured');
        assert.isTrue(errors.some((args) => String(args[0]).includes('search backend down')));
    });
});

describe('Select focus and key coercion gaps', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };
    const mount = async (html, loader) => {
        registry.defineComponent('loaders:select', { create: () => loader });
        const container = appended(html);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };

    it('hands its focus to the combobox', async () => {
        const [selectEl] = await mount(
            `<ful-select>pick</ful-select>`,
            (() => ({
                prefetch: async () => {},
                load: async () => [],
                exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
            }))(),
        );

        selectEl.focus();

        assert.strictEqual(document.activeElement, selectEl.querySelector('input'));
    });

    it('coerces false and keeps undecodable keys when k-type is boolean', async () => {
        const booleany = {
            prefetch: async () => {},
            load: async () => [
                [true, 'Yes'],
                [false, 'No'],
            ],
            exact: async (...keys) =>
                [true, false]
                    .filter((r) => keys.some((k) => r == k))
                    .map((r) => ({ key: r, label: r ? 'Yes' : 'No' })),
        };
        const [selectEl, container] = await mount(
            `<ful-select k-type="boolean" value="false">pick</ful-select>`,
            booleany,
        );

        assert.strictEqual(selectEl.value, false, 'the string token decodes to the boolean');
        assert.strictEqual(selectEl.querySelector('input').value, 'No');
        container.remove();

        const echoing = {
            prefetch: async () => {},
            load: async () => [],
            exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
        };
        const [undecodable, undecodableContainer] = await mount(
            `<ful-select k-type="boolean" value="banana">pick</ful-select>`,
            echoing,
        );

        assert.strictEqual(undecodable.value, 'banana', 'what cannot be decoded is left as it is');
        undecodableContainer.remove();
    });

    it('drops the assigned keys the loader does not know', async () => {
        const partial = {
            prefetch: async () => {},
            load: async () => [],
            exact: async (...keys) => keys.filter((k) => k !== 'unknown').map((k) => ({ key: k, label: `Label ${k}` })),
        };
        const [selectEl] = await mount(`<ful-select multiple value="k1,unknown">pick</ful-select>`, partial);

        assert.deepStrictEqual(selectEl.value, ['k1'], 'a key without an entry cannot stay selected');
        assert.deepStrictEqual(
            [...selectEl.querySelectorAll('ful-control > ful-badge')].map((b) => b.innerText),
            ['Label k1'],
        );
    });
});

describe('Select stale searches', () => {
    const keydown = (input, code, options = {}) => {
        input.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...options }));
    };
    const rejections = [];
    const onRejection = (e) => {
        rejections.push(e.reason);
        e.preventDefault();
    };
    window.addEventListener('unhandledrejection', onRejection);
    after(() => {
        window.removeEventListener('unhandledrejection', onRejection);
    });
    let pending = [];
    beforeEach(() => {
        pending = [];
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                load: () =>
                    new Promise((resolve, reject) => {
                        pending.push({ resolve, reject });
                    }),
            }),
        });
    });
    const mount = async () => {
        const container = appended(`<ful-select>pick</ful-select>`);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };

    it('discards a search resolving after a newer open, keeping the newest options', async () => {
        const [selectEl] = await mount();
        const input = selectEl.querySelector('input');
        //alt-down opens without going through the search throttle, so two opens overlap:
        //the first search is still in flight when the closed dropdown is opened again
        keydown(input, 'ArrowDown', { altKey: true });
        keydown(input, 'ArrowUp', { altKey: true });
        keydown(input, 'ArrowDown', { altKey: true });
        pending[1].resolve([{ key: 'k2', label: 'fast' }]);
        await settle();
        const activeDescendant = input.getAttribute('aria-activedescendant');
        pending[0].resolve([{ key: 'k1', label: 'slow' }]);
        await settle();

        const dropdown = selectEl.querySelector('ful-dropdown');
        assert.isTrue(dropdown.shown, 'the newest open owns the dropdown');
        assert.match(dropdown.querySelector('menu').textContent, /fast/);
        assert.notMatch(dropdown.querySelector('menu').textContent, /slow/, 'the stale search renders nothing');
        assert.strictEqual(
            input.getAttribute('aria-activedescendant'),
            activeDescendant,
            'the stale search highlights nothing',
        );
        assert.isTrue(dropdown.querySelector('ful-spinner').hasAttribute('hidden'));
    });

    it('discards a search failing after a newer open, without hiding it nor reporting the failure', async () => {
        const [selectEl] = await mount();
        const input = selectEl.querySelector('input');
        keydown(input, 'ArrowDown', { altKey: true });
        keydown(input, 'ArrowUp', { altKey: true });
        keydown(input, 'ArrowDown', { altKey: true });
        pending[1].resolve([{ key: 'k2', label: 'fast' }]);
        await settle();

        const rejectionsBefore = rejections.length;
        pending[0].reject(new Error('boom'));
        await settle();

        const dropdown = selectEl.querySelector('ful-dropdown');
        assert.isTrue(dropdown.shown, 'a superseded failure must not hide the newer open');
        assert.match(dropdown.querySelector('menu').textContent, /fast/);
        assert.strictEqual(rejections.length, rejectionsBefore, 'a superseded failure is not reported');
    });

    it('keeps a search that lands after a hide from repopulating the hidden dropdown', async () => {
        const [selectEl] = await mount();
        const input = selectEl.querySelector('input');
        keydown(input, 'ArrowDown', { altKey: true });
        input.dispatchEvent(new FocusEvent('blur'));
        pending[0].resolve([{ key: 'k1', label: 'late' }]);
        await settle();

        const dropdown = selectEl.querySelector('ful-dropdown');
        assert.isFalse(dropdown.shown);
        assert.isTrue(dropdown.querySelector('menu').hasAttribute('hidden'), 'the late search renders no options');
        assert.isNull(
            input.getAttribute('aria-activedescendant'),
            'the combobox is not pointed into a hidden dropdown',
        );
    });
});

describe('Select attributes during the async render window', () => {
    const uncaught = [];
    const onError = (e) => {
        uncaught.push(e.error?.message ?? e.message);
        e.preventDefault();
    };
    window.addEventListener('error', onError);
    after(() => {
        window.removeEventListener('error', onError);
    });
    let release = /** @type any */ (null);
    beforeEach(() => {
        uncaught.length = 0;
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: () =>
                    new Promise((resolve) => {
                        release = resolve;
                    }),
                load: async () => [],
                exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
            }),
        });
    });
    const mount = (html = '<form><ful-select name="a">l</ful-select></form>') => {
        const container = appended(html);
        return [container.querySelector('ful-select'), container];
    };
    const inWindow = async (selectEl) => {
        for (let i = 0; i !== 5; ++i) {
            await tick();
        }
        return selectEl;
    };

    it('applies every attribute that landed while the prefetch was in flight', async () => {
        const [selectEl] = await mount();
        await inWindow(selectEl);
        selectEl.setAttribute('value', 'k1');
        selectEl.setAttribute('itemlist', '');
        selectEl.setAttribute('readonly', '');
        selectEl.setAttribute('required', '');
        release();
        await Rendering.waitFor(selectEl);
        await settle();

        const input = selectEl.querySelector('input');
        assert.deepStrictEqual(uncaught, [], 'no attribute crashes on the unrendered field');
        assert.strictEqual(selectEl.value, 'k1', 'the value is applied');
        assert.strictEqual(input.value, 'Label k1', 'the label is resolved');
        assert.isTrue(selectEl.itemlist, 'the item list is on');
        assert.isTrue(input.readOnly, 'the readonly claim reaches the control');
        assert.strictEqual(input.getAttribute('aria-required'), 'true', 'the required claim reaches the control');
        assert.isTrue(selectEl.hasAttribute('readonly'), 'the claim is not un-claimed by the stale snapshot');
    });

    it('keeps a value that changed mid-flight over the markup one', async () => {
        const [selectEl] = await mount('<form><ful-select name="a" value="k0">l</ful-select></form>');
        await inWindow(selectEl);
        selectEl.setAttribute('value', 'k1');
        release();
        await Rendering.waitFor(selectEl);
        await settle();

        assert.strictEqual(selectEl.value, 'k1', 'the live attribute wins over the pre-prefetch snapshot');
        assert.strictEqual(selectEl.querySelector('input').value, 'Label k1');
    });

    it('survives a form reset while the prefetch is in flight', async () => {
        const [selectEl, container] = await mount();
        await inWindow(selectEl);
        container.querySelector('form').reset();
        release();
        await Rendering.waitFor(selectEl);
        await settle();

        assert.deepStrictEqual(uncaught, [], 'the reset does not crash the unrendered field');
        assert.isNull(selectEl.value);
    });
});

describe('Select dropdown anchoring', () => {
    const settle = async () => {
        for (let i = 0; i !== 20; ++i) {
            await tick();
        }
    };
    const mount = async () => {
        const container = appended(`<ful-select></ful-select>`);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await settle();
        return [selectEl, container];
    };
    const open = async (selectEl) => {
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };
    const assertAnchored = (selectEl) => {
        const dd = selectEl.querySelector('ful-dropdown').getBoundingClientRect();
        const group = selectEl.querySelector('ful-control-group').getBoundingClientRect();
        assert.isAtLeast(dd.top, group.bottom, 'the dropdown sits below the control group');
        assert.closeTo(dd.left, group.left, 2, 'the dropdown follows the control group');
        assert.closeTo(dd.width, group.width, 2, 'the dropdown matches the control group width');
    };

    beforeEach(() => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                exact: async () => [],
                load: async () => [
                    { key: 'k1', label: 'Alpha' },
                    { key: 'k2', label: 'Beta' },
                ],
            }),
        });
    });

    it('anchors on its control group, stretched to its width', async () => {
        const [selectEl] = await mount();
        await open(selectEl);

        assertAnchored(selectEl);
    });

    it('keeps the same geometry where the platform lacks the anchor css', async () => {
        const supports = CSS.supports;
        CSS.supports = () => false;
        try {
            const [selectEl, container] = await mount();
            await open(selectEl);

            assertAnchored(selectEl);
            container.remove();
        } finally {
            CSS.supports = supports;
        }
    });
});
