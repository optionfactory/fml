import { tick } from '../../tick.mjs';
import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';
import { appended, settle } from '../../harness.mjs';
import { installClock } from '../../clock.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

/** the dropdown opens on the throttle's leading edge, this only lets the loader resolve */
const opened = async () => {
    for (let i = 0; i !== 10; ++i) {
        await tick();
    }
};

/**
 * Mounting for the select suites. `loader` replaces the registered one for the
 * mount that follows; the two stock vocabularies cover the describes that only
 * need options to exist, or to be absent.
 */
const mountSelect = async (html, loader) => {
    if (loader) {
        registry.defineComponent('loaders:select', { create: () => loader });
    }
    const container = appended(html);
    const selectEl = container.querySelector('ful-select');
    await Rendering.waitFor(selectEl);
    await settle();
    return [selectEl, container];
};
const labelKeys = async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` }));
const labelling = (options) => ({
    prefetch: async () => {},
    load: async () => options,
    exact: labelKeys,
});
const ONE_OPTION = [{ key: 'k1', label: 'Label 1' }];

describe('Select and dropdown combobox ARIA compliance', () => {
    beforeEach(() => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                load: async () => [],
                exact: async (...keys) => keys.map((k) => ({ key: k, label: String(k) })),
            }),
        });
    });

    it('parses and behaves the same way when multiple is toggled after the render', async () => {
        const container = appended(
            `<ful-select><template slot="options"><option value="k1">One</option><option value="k2">Two</option></template></ful-select>`,
        );
        const el = container.querySelector('ful-select');
        await Rendering.waitFor(el);

        assert.isFalse(el.multiple, 'a select without the multiple attribute is single');
        el.setAttribute('multiple', '');
        assert.isTrue(el.multiple, 'setting the multiple attribute after the render makes the select multiple');
        el.setAttribute('value', 'k1,k2');
        await settle();
        assert.deepEqual(
            el.value,
            ['k1', 'k2'],
            'a multiple select reads the value attribute as a comma separated list of keys',
        );

        el.removeAttribute('multiple');
        assert.isFalse(el.multiple, 'removing the multiple attribute makes the select single again');
        el.setAttribute('value', 'k1');
        await settle();
        assert.equal(el.value, 'k1', 'a single select reads the value attribute as its one key');
    });

    it('carries the combobox roles from the first render', async () => {
        const container = appended(`<ful-select></ful-select>`);

        const selectEl = container.querySelector('ful-select');

        await Rendering.waitFor(selectEl);

        const input = selectEl.querySelector('input');

        assert.strictEqual(input.getAttribute('role'), 'combobox', 'the input is the combobox');
        assert.strictEqual(
            input.getAttribute('aria-autocomplete'),
            'list',
            'the combobox declares that it completes through a list',
        );
        assert.strictEqual(input.getAttribute('aria-haspopup'), 'listbox', 'the combobox declares a listbox popup');
        assert.strictEqual(input.getAttribute('aria-expanded'), 'false', 'the combobox starts collapsed');
    });

    it('mirrors aria-expanded onto the input as the dropdown opens and closes', async () => {
        const container = appended(`<ful-select></ful-select>`);

        const selectEl = container.querySelector('ful-select');
        await tick();

        const input = selectEl.querySelector('input');

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await tick();
        assert.strictEqual(
            input.getAttribute('aria-expanded'),
            'true',
            'opening the dropdown marks the combobox expanded',
        );

        input.dispatchEvent(new Event('blur'));
        assert.strictEqual(
            input.getAttribute('aria-expanded'),
            'false',
            'blur closes the dropdown and marks the combobox collapsed',
        );
    });
});

describe('Select and dropdown load failure handling', () => {
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
                exact: async (...keys) => keys.map((k) => ({ key: k, label: String(k) })),
            }),
        });
        const container = appended(`<ful-select></ful-select>`);

        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);

        assert.isNotNull(
            selectEl.querySelector('input[role=combobox]'),
            'a failed prefetch does not keep the combobox from rendering',
        );
        assert.isTrue(
            warns.some((args) => String(args[0]).includes('prefetch')),
            'the failed prefetch is warned about on the console',
        );
    });

    it('hides the dropdown and reports the rejection when load fails', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                load: async () => {
                    throw new Error('boom');
                },
                exact: async (...keys) => keys.map((k) => ({ key: k, label: String(k) })),
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
        assert.isFalse(dropdown.shown, 'a failed load hides the dropdown');
        assert.strictEqual(
            selectEl.querySelector('input[role=combobox]').getAttribute('aria-expanded'),
            'false',
            'a failed open leaves the combobox collapsed',
        );
        assert.strictEqual(
            rejections.length,
            rejectionsBefore + 1,
            'the failed load surfaces as one unhandled rejection',
        );
        assert.isTrue(
            rejections.some((r) => String(r?.message ?? r).includes('boom')),
            'the rejection carries the error the loader threw',
        );
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
        await settle(3, 10);

        assert.strictEqual(
            rejections.length,
            rejectionsBefore + 1,
            'a failed lookup surfaces as one unhandled rejection',
        );
        assert.strictEqual(selectEl.value, 'k1', 'the requested key is kept');
        assert.isTrue(warns.length === 0, 'a failed lookup is reported as a rejection, not as a warning');
    });
});
describe('Select and dropdown keyboard interaction', () => {
    const uncaught = [];
    window.addEventListener('error', (e) => {
        uncaught.push(e.error ?? e.message);
        e.preventDefault();
    });
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
                exact: async (...keys) => keys.map((k) => ({ key: k, label: String(k) })),
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

        assert.deepStrictEqual(uncaught, [], 'Enter before the dropdown renders throws nothing');
    });

    it('ignores Enter when the dropdown was never opened', async () => {
        const [selectEl] = mount(`<ful-select></ful-select>`);
        await Rendering.waitFor(selectEl);
        await settle();

        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));
        keydown(selectEl.querySelector('input'), 'Enter');

        assert.deepStrictEqual(uncaught, [], 'Enter with the dropdown never opened throws nothing');
        assert.deepStrictEqual(changes, [], 'Enter with the list closed picks nothing, so no change is dispatched');
        assert.isNull(selectEl.value, 'Enter with the list closed selects nothing');
    });

    it('ignores arrow keys when the shown dropdown has no options', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                exact: async (...keys) => keys.map((k) => ({ key: k, label: String(k) })),
                load: async () => [],
            }),
        });
        const [selectEl] = mount(`<ful-select></ful-select>`);
        await Rendering.waitFor(selectEl);
        await settle();

        const input = selectEl.querySelector('input');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        assert.isTrue(
            selectEl.querySelector('ful-dropdown').shown,
            'a click opens the dropdown even when the loader answers no options',
        );

        keydown(input, 'ArrowDown');
        keydown(input, 'ArrowUp');
        keydown(input, 'PageDown');
        keydown(input, 'PageUp');
        keydown(input, 'Enter');

        assert.deepStrictEqual(uncaught, [], 'moving and accepting over an empty list throws nothing');
        assert.isNull(selectEl.value, 'an empty list offers nothing to accept');
    });

    it('says no results when the search matches nothing', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                exact: async (...keys) => keys.map((k) => ({ key: k, label: String(k) })),
                load: async () => [],
            }),
        });
        const [selectEl] = mount(`<ful-select></ful-select>`);
        await Rendering.waitFor(selectEl);
        await settle();

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        const empty = selectEl.querySelector('ful-dropdown [data-ref=empty]');
        assert.isFalse(empty.hidden, 'the message replaces the empty list');
        assert.strictEqual(empty.innerText, 'No results', 'the empty state reads the localized no results message');
        assert.isTrue(selectEl.querySelector('menu').hidden, 'no empty listbox is exposed');
    });

    it('keeps the message hidden while there are options', async () => {
        const [selectEl] = mount(`<ful-select></ful-select>`);
        await Rendering.waitFor(selectEl);
        await settle();

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        assert.isTrue(
            selectEl.querySelector('ful-dropdown [data-ref=empty]').hidden,
            'the empty state stays hidden while the list has options',
        );
        assert.isFalse(selectEl.querySelector('menu').hidden, 'the listbox is shown while it has options');
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

        assert.deepStrictEqual(uncaught, [], 'accepting on Enter throws nothing');
        assert.strictEqual(
            selectEl.value,
            'k1',
            'Enter accepts the first option, which is highlighted when the list opens',
        );
        assert.strictEqual(changes.length, 1, 'one pick dispatches one change');
        assert.strictEqual(changes[0].label, 'Label 1', 'the change detail carries the picked entry');
        assert.isFalse(selectEl.querySelector('ful-dropdown').shown, 'accepting a pick closes the dropdown');
    });

    it('announces its own value in the change detail, with the entry beside it', async () => {
        const [selectEl] = mount(`<ful-select></ful-select>`);
        await Rendering.waitFor(selectEl);
        await settle();

        const details = [];
        selectEl.addEventListener('change', (e) => details.push(e.detail));
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        keydown(selectEl.querySelector('input'), 'Enter');

        assert.lengthOf(details, 1, 'one pick dispatches one change');
        assert.strictEqual(details[0].value, selectEl.value, 'the detail is the value the property answers');
        assert.strictEqual(details[0].value, 'k1', 'the detail value is the key of the accepted option');
        assert.strictEqual(details[0].entry.label, 'Label 1', 'the labeled selection rides beside it');
    });

    it('points the combobox at a listbox the announcement can resolve in', async () => {
        const [selectEl] = mount(`<ful-select></ful-select>`);
        await Rendering.waitFor(selectEl);
        await settle();
        const input = selectEl.querySelector('input');
        const controls = input.getAttribute('aria-controls');

        assert.isNotNull(controls, 'the combobox names what it controls');
        const listbox = selectEl.querySelector(`#${controls}`);
        assert.isNotNull(listbox, 'the aria-controls id names an element inside the select');
        assert.strictEqual(listbox.getAttribute('role'), 'listbox', 'the controlled element is the listbox');

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        const active = input.getAttribute('aria-activedescendant');
        assert.isNotNull(active, 'opening the list announces an active option');
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
        assert.strictEqual(active(), highlighted(), 'reopening the list announces the highlighted option again');
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
        assert.isTrue(selectEl.querySelector('ful-dropdown').shown, 'a click on the input opens the dropdown');
        assert.strictEqual(
            input.getAttribute('aria-expanded'),
            'true',
            'the open dropdown marks the combobox expanded',
        );

        input.dispatchEvent(new Event('click', { bubbles: true }));
        assert.isFalse(selectEl.querySelector('ful-dropdown').shown, 'a second click on the input closes the dropdown');
        assert.strictEqual(
            input.getAttribute('aria-expanded'),
            'false',
            'the closed dropdown marks the combobox collapsed',
        );
    });

    it('offers the whole list when opened from rest, the label is not a needle', async () => {
        const needles = [];
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                exact: labelKeys,
                load: async (needle) => {
                    needles.push(needle);
                    return [{ key: 'k1', label: 'Label 1' }];
                },
            }),
        });
        const [selectEl] = mount(`<ful-select value="k1"></ful-select>`);
        await settle();
        const input = selectEl.querySelector('input');
        assert.strictEqual(input.value, 'Label k1', 'the assigned key is shown by its label while the list is closed');

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        assert.deepStrictEqual(needles, [''], 'the label must not filter the list');
    });

    it('opens highlighting the current selection', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                exact: labelKeys,
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

        assert.strictEqual(
            selectEl.querySelector('menu li[selected]').textContent.trim(),
            'Label 2',
            'the list opens with the selected entry highlighted',
        );

        keydown(input, 'Enter');
        assert.strictEqual(selectEl.value, 'k2', 're-accepting the highlighted selection keeps it');
    });

    it('opens highlighting a first-entry selection over a custom template default', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                exact: labelKeys,
                load: async () => [
                    { key: 'k1', label: 'Label 1' },
                    { key: 'k2', label: 'Label 2' },
                ],
            }),
        });
        const [selectEl] = mount(`<ful-select value="k1">
            <template slot="dropdown">
                <li data-tpl-each="self" data-tpl-selected="index == 1" data-tpl-value="index" role="option" data-tpl-aria-selected="index == 1 ? 'true' : 'false'">{{ label }}</li>
            </template>
        </ful-select>`);
        await settle();
        const input = selectEl.querySelector('input');

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        assert.strictEqual(
            selectEl.querySelector('menu li[selected]').textContent.trim(),
            'Label 1',
            'the selected entry is highlighted in place of the row the custom template marks selected',
        );

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
        assert.strictEqual(selectEl.value, 'k2', 'End highlights the last option, which Enter accepts');

        keydown(input, 'ArrowDown', { altKey: true });
        await opened();
        keydown(input, 'End');
        keydown(input, 'Home');
        keydown(input, 'Enter');
        assert.strictEqual(selectEl.value, 'k1', 'Home highlights the first option again after End');
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
        assert.isTrue(selectEl.querySelector('ful-dropdown').shown, 'Alt+ArrowDown opens the dropdown');
        assert.strictEqual(
            input.getAttribute('aria-expanded'),
            'true',
            'the open dropdown marks the combobox expanded',
        );

        keydown(input, 'ArrowUp', { altKey: true });
        assert.isFalse(selectEl.querySelector('ful-dropdown').shown, 'Alt+ArrowUp closes the dropdown');
        assert.strictEqual(
            input.getAttribute('aria-expanded'),
            'false',
            'the closed dropdown marks the combobox collapsed',
        );
    });
});

describe('Select value resolution', () => {
    const mount = mountSelect;
    let exactCalls = [];
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

    it('reads the value attribute as a comma separated list whether or not multiple is set', async () => {
        const [single] = await mount(`<ful-select value="it"></ful-select>`);
        const [multi] = await mount(`<ful-select multiple value="it,fr"></ful-select>`);

        assert.strictEqual(single.value, 'it', 'a single select reads the value attribute as one key');
        assert.deepEqual(
            multi.value,
            ['it', 'fr'],
            'a multiple select reads the value attribute as a comma separated list of keys',
        );
    });

    it('warns once for a key carrying a comma, which no key may', async () => {
        const [selectEl] = await mount(`<ful-select value="a,b"></ful-select>`);

        assert.strictEqual(selectEl.value, 'a', 'the attribute reads a list');

        const warnings = [];
        const warn = console.warn;
        console.warn = (...args) => warnings.push(args);
        try {
            selectEl.value = 'a,b';
            await settle();
        } finally {
            console.warn = warn;
        }
        assert.lengthOf(warnings, 1, 'assigning a key with a comma warns once');
        assert.include(
            String(warnings[0][0]),
            'cannot contain a comma',
            'the warning says a key cannot contain a comma',
        );
        assert.strictEqual(selectEl.value, 'a,b', 'the key is kept: splitting here would truncate a single select');
    });

    it('warns once per element, not once for every bad assignment', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`);
        const warnings = [];
        const warn = console.warn;
        console.warn = (...args) => warnings.push(args);
        try {
            selectEl.value = 'a,b';
            selectEl.value = 'c,d';
            await settle();
        } finally {
            console.warn = warn;
        }

        assert.lengthOf(warnings, 1, 'the comma warning is given once per element, however many bad keys are assigned');
    });

    it('trims the keys it reads from the attribute', async () => {
        const [selectEl] = await mount(`<ful-select value=" it "></ful-select>`);

        assert.strictEqual(selectEl.value, 'it', 'keys read from the value attribute are trimmed');
    });

    it('does not query the loader when there is no value', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`);

        assert.deepStrictEqual(exactCalls, [], 'with no value there is no key for the loader to label');
        assert.isNull(selectEl.value, 'a single select with no value answers null');
    });

    it('does not query the loader when a multiple select has no value', async () => {
        const [selectEl] = await mount(`<ful-select multiple></ful-select>`);

        assert.deepStrictEqual(exactCalls, [], 'with no value there is no key for the loader to label');
        assert.deepStrictEqual(selectEl.value, [], 'a multiple select with no value answers an empty array');
    });

    it('still resolves an empty key, which an <option value=""> can carry', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`);
        assert.deepStrictEqual(exactCalls, [], 'with no value the loader is not asked at the upgrade');

        selectEl.value = '';
        await settle();

        assert.deepStrictEqual(
            exactCalls,
            [['']],
            'the empty string is a key like any other, so the loader is asked to label it',
        );
        assert.strictEqual(selectEl.value, '', 'the empty key stays selected');
    });

    it('resolves the declared keys', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);

        assert.deepStrictEqual(exactCalls, [['k1', 'k2']], 'the declared keys are looked up in one exact call');
        assert.deepStrictEqual(selectEl.value, ['k1', 'k2'], 'the declared keys are selected in their declared order');
    });

    it('clears without querying the loader when the value attribute is removed', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1"></ful-select>`);
        assert.deepStrictEqual(exactCalls, [['k1']], 'the declared key is looked up at the upgrade');

        selectEl.removeAttribute('value');
        await settle();

        assert.deepStrictEqual(
            exactCalls,
            [['k1']],
            'removing the value attribute clears the selection without asking the loader',
        );
        assert.deepStrictEqual(selectEl.value, [], 'removing the value attribute empties a multiple selection');
    });
});

describe('Select value assignment', () => {
    const mount = mountSelect;
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
        assert.strictEqual(selectEl.value, 'k1', 'the assigned key stays selected once the lookup has resolved');
    });

    it('labels the field once the loader resolves them', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`, labelling({ k1: 20 }));
        const input = selectEl.querySelector('input');

        selectEl.value = 'k1';
        assert.strictEqual(input.value, 'k1', 'the key stands in for its label');
        assert.isNull(selectEl.querySelector('ful-control > ful-badge'), 'a single select carries no badge');

        await new Promise((resolve) => setTimeout(resolve, 30));
        await settle();
        assert.strictEqual(input.value, 'Label k1', 'the label replaces the key once the loader answers');
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

        assert.strictEqual(selectEl.value, 'fast', 'a later assignment wins over the late answer to an earlier one');
        assert.strictEqual(
            selectEl.querySelector('input').value,
            'Label fast',
            'the field shows the label of the newest assignment, not the late one',
        );
    });

    it('carries its value as soon as the upgrade completes, labels follow', async () => {
        registry.defineComponent('loaders:select', { create: () => labelling({ k1: 20 }) });
        const container = appended(`<ful-select value="k1"></ful-select>`);
        const selectEl = container.querySelector('ful-select');

        await Rendering.waitFor(selectEl);

        assert.strictEqual(selectEl.value, 'k1', 'the value does not wait for the loader');
        await new Promise((resolve) => setTimeout(resolve, 30));
        await settle();
        assert.strictEqual(
            selectEl.querySelector('input').value,
            'Label k1',
            'the label follows once the loader answers',
        );
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

        assert.strictEqual(outcome, 'upgraded', 'the upgrade completes without waiting on the key lookup');
        assert.strictEqual(selectEl.value, 'k1', 'the declared key is selected while the lookup is still pending');
    });
});

describe('Select key types', () => {
    const mount = mountSelect;
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
    const echoing = () => labelling([]);

    it('keeps a string assignment selected when the loader keys are numbers', async () => {
        const [selectEl] = await mount(`<ful-select value="16"></ful-select>`, numeric());

        assert.strictEqual(selectEl.value, '16', 'without k-type the key stays the string the attribute carries');
        assert.strictEqual(
            selectEl.querySelector('input').value,
            'Label 16',
            'the string key is labelled by the loose match against the numeric key',
        );
    });

    it('coerces a javascript assignment of a number to a string key', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`, numeric());

        selectEl.value = 16;
        await settle();

        assert.strictEqual(selectEl.value, '16', 'without k-type an assigned number is coerced to a string key');
        assert.strictEqual(
            selectEl.querySelector('input').value,
            'Label 16',
            'the coerced key is labelled by the loose match against the numeric key',
        );
    });

    it('exposes number keys when k-type is number', async () => {
        const [selectEl] = await mount(`<ful-select k-type="number" value="16"></ful-select>`, numeric());

        assert.strictEqual(selectEl.value, 16, 'k-type number coerces the key to a number');
        assert.strictEqual(
            selectEl.querySelector('input').value,
            'Label 16',
            'the numeric key is labelled by the loader',
        );
        assert.deepStrictEqual(
            selectEl.entry,
            { key: 16, label: 'Label 16', metadata: undefined },
            'the entry carries the numeric key the loader answered with its label',
        );
    });

    it('coerces every key of a multiple assignment', async () => {
        const [selectEl] = await mount(`<ful-select k-type="number" multiple value="16,17"></ful-select>`, numeric());

        assert.deepStrictEqual(selectEl.value, [16, 17], 'k-type coerces every key of a multiple selection');
    });

    it('exposes boolean keys when k-type is boolean', async () => {
        const [selectEl] = await mount(`<ful-select k-type="boolean" value="true"></ful-select>`, booleany());

        assert.strictEqual(selectEl.value, true, 'k-type boolean coerces the key to a boolean');
        assert.strictEqual(selectEl.querySelector('input').value, 'Yes', 'the boolean key is labelled by the loader');
    });

    it('keeps a key that does not decode as it is', async () => {
        const [selectEl] = await mount(`<ful-select k-type="number" value="abc"></ful-select>`, echoing());

        assert.strictEqual(selectEl.value, 'abc', 'a key that does not decode as a number is kept as the string it is');
        assert.strictEqual(
            selectEl.querySelector('input').value,
            'Label abc',
            'the undecoded key is labelled by the loader',
        );
    });

    it('reports an option picked from the dropdown as a string by default', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`, numeric());

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        selectEl.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));

        assert.strictEqual(selectEl.value, '16', 'without k-type a picked key is reported as a string');
        assert.strictEqual(selectEl.querySelector('input').value, 'Label 16', 'the picked entry labels the field');
    });

    it('coerces an option picked from the dropdown when k-type is number', async () => {
        const [selectEl] = await mount(`<ful-select k-type="number"></ful-select>`, numeric());

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        selectEl.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));

        assert.strictEqual(selectEl.value, 16, 'k-type number coerces the picked key to a number');
        assert.strictEqual(selectEl.querySelector('input').value, 'Label 16', 'the picked entry labels the field');
    });
});

describe('Item list focus', () => {
    it('rings a focused row with the theme ring rather than a white halo', async () => {
        const [selectEl] = await mountSelect(
            `<ful-select name="tags" multiple item-list value="k1">labels</ful-select>`,
            labelling(ONE_OPTION),
        );
        const row = selectEl.querySelector('ful-item > div');
        assert.isNotNull(row, 'the list rendered a row to focus');
        assert.strictEqual(getComputedStyle(row).outlineStyle, 'none', 'an unfocused row draws no outline');

        row.querySelector('button').focus();

        const focused = getComputedStyle(row);
        assert.strictEqual(focused.outlineStyle, 'solid', 'the keyboard focus is shown');
        assert.notInclude(
            focused.outlineColor,
            '255, 255, 255',
            'the focus outline is not white, which would not show on a white row',
        );
        assert.notStrictEqual(focused.outlineOffset, '0px', 'set off, so the page shows through the gap');
    });
});

describe('Select enter key inside a form', () => {
    const mount = mountSelect;
    let submits = [];
    const enter = (selectEl, code = 'Enter') => {
        selectEl
            .querySelector('input')
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code, bubbles: true, cancelable: true }));
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
        registry.defineComponent('loaders:select', { create: () => labelling(ONE_OPTION) });
    });

    it('submits the form from the numpad Enter while the dropdown is closed', async () => {
        const [selectEl] = await mount(`
            <ful-form>
                <ful-select name="s">label</ful-select>
                <button type="submit">go</button>
            </ful-form>`);

        enter(selectEl, 'NumpadEnter');
        await settle();

        assert.strictEqual(
            submits.length,
            1,
            'Enter with the dropdown closed submits the enclosing form, from the numpad key too',
        );
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

    it('accepts the highlighted option from the numpad Enter as well', async () => {
        const [selectEl] = await mount(`
            <ful-form>
                <ful-select name="s">label</ful-select>
                <button type="submit">go</button>
            </ful-form>`);

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        enter(selectEl, 'NumpadEnter');
        await settle();

        assert.strictEqual(selectEl.value, 'k1', 'the option is taken');
        assert.strictEqual(submits.length, 0, 'the form is not submitted');
    });

    it('does nothing on enter outside a form', async () => {
        const [selectEl] = await mount(`<ful-select name="s">label</ful-select>`);

        enter(selectEl);
        await settle();

        assert.strictEqual(submits.length, 0, 'Enter outside a form has nothing to submit');
    });
});

describe('Select selection removal', () => {
    const mount = (html) => mountSelect(html, labelling(ONE_OPTION));
    const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));
    const badges = (selectEl) => [...selectEl.querySelectorAll('ful-control > ful-badge')];
    const items = (selectEl) => [...selectEl.querySelectorAll('ful-item-list > ful-item')];

    it('drops the entry whose badge was clicked, keeping the others', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2,k3"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));

        click(badges(selectEl)[1]);

        assert.deepStrictEqual(selectEl.value, ['k1', 'k3'], 'the clicked badge is the one removed');
        assert.strictEqual(changes.length, 1, 'removing a badge dispatches one change');
        assert.deepStrictEqual(
            changes[0].map((v) => v.key),
            ['k1', 'k3'],
            'the change detail carries the entries left after the removal',
        );
        assert.deepStrictEqual(
            badges(selectEl).map((b) => b.innerText),
            ['Label k1', 'Label k3'],
            'the remaining badges show the labels of the remaining entries',
        );
        assert.deepStrictEqual(
            items(selectEl).map((i) => i.getAttribute('data-key')),
            ['k1', 'k3'],
            'the item list follows the selection',
        );
    });

    it('shows a change listener the badges and items of the selection that caused it', async () => {
        const [selectEl] = await mount(`<ful-select multiple item-list value="k1,k2,k3"></ful-select>`);
        const seen = [];
        selectEl.addEventListener('change', () =>
            seen.push({
                badges: badges(selectEl).map((b) => b.getAttribute('value')),
                items: items(selectEl).map((i) => i.getAttribute('data-key')),
            }),
        );

        click(badges(selectEl)[1]);

        assert.deepStrictEqual(
            seen,
            [{ badges: ['k1', 'k3'], items: ['k1', 'k3'] }],
            'the change listener sees the badges and items already updated to the new selection',
        );
    });

    it('drops the entry whose item remove button was clicked', async () => {
        const [selectEl] = await mount(`<ful-select multiple item-list value="k1,k2,k3"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));

        click(items(selectEl)[2].querySelector('button'));

        assert.deepStrictEqual(
            selectEl.value,
            ['k1', 'k2'],
            'the entry whose remove button was clicked is dropped and the others are kept',
        );
        assert.strictEqual(changes.length, 1, 'removing an item dispatches one change');
        assert.deepStrictEqual(
            changes[0].map((v) => v.key),
            ['k1', 'k2'],
            'the change detail carries the entries left after the removal',
        );
        assert.deepStrictEqual(
            items(selectEl).map((i) => i.getAttribute('data-key')),
            ['k1', 'k2'],
            'the item list follows the selection',
        );
        assert.deepStrictEqual(
            badges(selectEl).map((b) => b.innerText),
            ['Label k1', 'Label k2'],
            'the badges follow the selection',
        );
    });

    it('renders the item list from a slotted items template, removals still working', async () => {
        const [selectEl] = await mount(`
            <ful-select multiple item-list value="k1,k2">
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

        assert.deepStrictEqual(selectEl.value, ['k2'], 'the remove button in the slotted template drops its entry');
        assert.deepStrictEqual(
            items(selectEl).map((i) => i.querySelector('em')?.textContent),
            ['Label k2'],
            'the slotted template renders the remaining entry',
        );
    });

    it('removes nothing when the click misses both a badge and a remove button', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));

        click(selectEl.querySelector('ful-control'));
        click(items(selectEl)[0].querySelector('div'));

        assert.deepStrictEqual(
            selectEl.value,
            ['k1', 'k2'],
            'a click on the control or on an item outside its remove button removes no entry',
        );
        assert.deepStrictEqual(changes, [], 'a click that removes nothing dispatches no change');
    });

    it('keeps the selection when a disabled select is clicked', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));
        selectEl.disabled = true;

        click(badges(selectEl)[0]);
        click(items(selectEl)[0].querySelector('button'));

        assert.deepStrictEqual(
            selectEl.value,
            ['k1', 'k2'],
            'a disabled select keeps its selection when a badge or a remove button is clicked',
        );
        assert.deepStrictEqual(changes, [], 'a disabled select dispatches no change');
    });

    it('keeps the selection when a readonly select is clicked', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));
        selectEl.readonly = true;

        click(badges(selectEl)[0]);
        click(items(selectEl)[0].querySelector('button'));

        assert.deepStrictEqual(
            selectEl.value,
            ['k1', 'k2'],
            'a readonly select keeps its selection when a badge or a remove button is clicked',
        );
        assert.deepStrictEqual(changes, [], 'a readonly select dispatches no change');
    });

    it('keeps the selection when a claim lands while the dropdown is open on a pick', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));
        const dropdown = selectEl.querySelector('ful-dropdown');
        selectEl.readonly = true;
        dropdown.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                cancelable: false,
                detail: { index: 'k9', data: ['k9', 'k9'] },
            }),
        );

        assert.deepStrictEqual(selectEl.value, ['k1'], 'the pick is not applied');
        assert.deepStrictEqual(changes, [], 'a pick refused by a claim dispatches no change');
        assert.isFalse(dropdown.shown, 'the leftover dropdown is closed');
    });

    it('reports a single select as empty once backspace clears its label', async () => {
        const [selectEl] = await mount(`<ful-select value="k1"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));
        const input = selectEl.querySelector('input');
        input.setSelectionRange(0, 0);

        input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace', bubbles: true }));

        assert.isNull(selectEl.value, 'Backspace at the start of a single select clears its selection');
        assert.deepStrictEqual(changes, [null], 'a single select reports no selection as null');
        assert.deepStrictEqual(badges(selectEl), [], 'a single select carries no badges');
        assert.strictEqual(input.value, '', 'the field is emptied along with the selection');
    });
});

describe('Select chips and picked options', () => {
    const mount = (html) => mountSelect(html, labelling([{ key: 'k1', label: 'Label k1' }]));

    it('marks the picked options selected, leaving the highlight to activedescendant', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1"></ful-select>`);
        selectEl
            .querySelector('input')
            .dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', altKey: true, bubbles: true }));
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
        assert.lengthOf(chips, 2, 'each selected key has its chip');
        assert.deepStrictEqual(
            chips.map((c) => c.getAttribute('tabindex')),
            ['0', '-1'],
            'a roving tab stop, not a group Tab skips entirely',
        );
    });
});

describe('Select chips keyboard access', () => {
    const mount = (html) => mountSelect(html, labelling([]));
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
        assert.strictEqual(document.activeElement, first, 'ArrowLeft on a chip moves the focus to the previous chip');

        keydown(document.activeElement, 'ArrowRight');
        assert.strictEqual(document.activeElement, second, 'ArrowRight on a chip moves the focus to the next chip');

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
        assert.deepStrictEqual(selectEl.value, ['k1'], 'Enter on a focused chip removes its entry');
        assert.deepStrictEqual(
            changes[0].map((v) => v.key),
            ['k1'],
            'the change detail carries the entries left after the removal',
        );
        assert.strictEqual(
            document.activeElement,
            selectEl.querySelector('input'),
            'removing a chip returns the focus to the field',
        );

        const survivor = selectEl.querySelector('ful-control > ful-badge');
        survivor.focus();
        keydown(survivor, 'Delete');
        assert.deepStrictEqual(selectEl.value, [], 'the last chip goes too');
        assert.strictEqual(
            document.activeElement,
            selectEl.querySelector('input'),
            'removing the last chip returns the focus to the field',
        );
    });

    it('returns to the field from a chip on Escape, removing nothing', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));
        const badge = selectEl.querySelector('ful-control > ful-badge');

        badge.focus();
        keydown(badge, 'Escape');

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2'], 'Escape on a chip removes nothing');
        assert.deepStrictEqual(changes, [], 'Escape on a chip dispatches no change');
        assert.strictEqual(
            document.activeElement,
            selectEl.querySelector('input'),
            'Escape on a chip returns the focus to the field',
        );
    });

    it('leaves a readonly select alone', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        selectEl.readonly = true;
        const badge = selectEl.querySelector('ful-control > ful-badge');

        badge.focus();
        keydown(badge, 'Enter');

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2'], 'Enter on a chip of a readonly select removes nothing');
    });
});

describe('Select backspace', () => {
    const mount = (html) => mountSelect(html, labelling(ONE_OPTION));
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
            'the change detail carries the entries left after the removal',
        );
        assert.deepStrictEqual(
            [...selectEl.querySelectorAll('ful-control > ful-badge')].map((b) => b.innerText),
            ['Label k1'],
            'the badges follow the selection',
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
        assert.deepStrictEqual(changes, [], 'a Backspace that edits the typed text dispatches no change');
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
        assert.deepStrictEqual(changes, [], 'a Backspace that deletes the selected text dispatches no change');
    });

    it('does not fire a change when there is nothing to remove', async () => {
        const [selectEl] = await mount(`<ful-select multiple></ful-select>`);
        const changes = [];
        selectEl.addEventListener('change', (e) => changes.push(e.detail.entry));
        const input = selectEl.querySelector('input');
        input.setSelectionRange(0, 0);

        backspace(input);

        assert.deepStrictEqual(selectEl.value, [], 'an empty selection stays empty');
        assert.deepStrictEqual(changes, [], 'a Backspace with nothing to remove dispatches no change');
    });

    it('ignores backspace on a readonly select', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`);
        selectEl.readonly = true;
        const input = selectEl.querySelector('input');
        input.setSelectionRange(0, 0);

        backspace(input);

        assert.deepStrictEqual(
            selectEl.value,
            ['k1', 'k2'],
            'Backspace at the start of a readonly select removes nothing',
        );
    });
});

describe('Select blur', () => {
    const mount = (html) => mountSelect(html, labelling(ONE_OPTION));

    it('clears the typed text and closes the dropdown when focus leaves', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`);
        const input = selectEl.querySelector('input');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        input.value = 'typed';
        assert.isTrue(selectEl.querySelector('ful-dropdown').shown, 'the dropdown is open before the blur');

        input.dispatchEvent(new FocusEvent('blur'));

        assert.strictEqual(input.value, '', 'a half typed needle is not kept around');
        assert.strictEqual(input.getAttribute('aria-expanded'), 'false', 'blur marks the combobox collapsed');
        assert.isFalse(selectEl.querySelector('ful-dropdown').shown, 'blur closes the dropdown');
    });

    it('stays open when focus moves to something inside the select', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`);
        const input = selectEl.querySelector('input');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        input.value = 'typed';

        input.dispatchEvent(new FocusEvent('blur', { relatedTarget: selectEl.querySelector('menu') }));

        assert.strictEqual(input.value, 'typed', 'clicking an option must not wipe the needle first');
        assert.strictEqual(
            input.getAttribute('aria-expanded'),
            'true',
            'focus moving inside the select keeps the combobox expanded',
        );
        assert.isTrue(
            selectEl.querySelector('ful-dropdown').shown,
            'focus moving inside the select keeps the dropdown open',
        );
    });

    it('does not let a throttled search reopen the dropdown after blur', async () => {
        const [selectEl] = await mount(`<ful-select></ful-select>`);
        const input = selectEl.querySelector('input');
        const clock = installClock();
        try {
            selectEl.dispatchEvent(new Event('click', { bubbles: true }));
            await opened();
            input.value = 'ty';
            input.dispatchEvent(new Event('input', { bubbles: true }));

            input.dispatchEvent(new FocusEvent('blur'));
            await clock.advance(450);
            await settle();

            assert.isFalse(
                selectEl.querySelector('ful-dropdown').shown,
                'a throttled search that fires after the blur does not reopen the dropdown',
            );
            assert.strictEqual(
                input.getAttribute('aria-expanded'),
                'false',
                'the combobox stays collapsed after the throttled search fires',
            );
        } finally {
            clock.uninstall();
        }
    });
});

describe('Select loader access and entries', () => {
    const mount = mountSelect;
    const updatable = () => {
        let data = [{ key: 'k1', label: 'Label 1' }];
        return {
            prefetch: async () => {},
            load: async () => data,
            exact: labelKeys,
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
            'the next open lists the options the loader was updated with',
        );
    });

    it('reports label and metadata through entry, keys through value', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2"></ful-select>`, described());

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2'], 'value answers the selected keys');
        assert.deepStrictEqual(
            selectEl.entry,
            [
                { key: 'k1', label: 'Label k1', metadata: { id: 'k1' } },
                { key: 'k2', label: 'Label k2', metadata: { id: 'k2' } },
            ],
            'entry answers the selected entries with the labels and metadata the loader gave',
        );
    });

    it('reports the one entry of a single select, and null when it has none', async () => {
        const [selectEl] = await mount(`<ful-select value="k1"></ful-select>`, described());

        assert.deepStrictEqual(
            selectEl.entry,
            { key: 'k1', label: 'Label k1', metadata: { id: 'k1' } },
            'a single select answers its one entry, metadata included',
        );

        selectEl.value = null;
        await settle();

        assert.isNull(selectEl.entry, 'a single select with no selection answers a null entry');
        assert.isNull(selectEl.value, 'a single select with no selection answers a null value');
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
        const clock = installClock();
        try {
            const container = appended(`<ful-select multiple name="s" value="k1,k2">label</ful-select>`);
            const selectEl = container.querySelector('ful-select');
            await Rendering.waitFor(selectEl);

            selectEl.querySelectorAll('ful-badge')[1].dispatchEvent(new Event('click', { bubbles: true }));
            assert.deepStrictEqual(
                selectEl.value,
                ['k1'],
                'removing a badge takes effect at once, before the lookup answers',
            );

            await clock.advance(120);
            await settle();

            assert.deepStrictEqual(selectEl.value, ['k1'], 'the lookup must not undo the removal');
            assert.strictEqual(
                selectEl.querySelector('ful-badge').innerText,
                'Label k1',
                'the survivor is still labelled',
            );
        } finally {
            clock.uninstall();
        }
    });
});

describe('Select Tab and custom validity', () => {
    const keydown = (input, code) => {
        input.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    };

    it('closes the open dropdown on Tab without picking the highlighted option', async () => {
        const [selectEl] = await mountSelect(`<ful-select>labels</ful-select>`, labelling(ONE_OPTION));
        const input = selectEl.querySelector('input');
        input.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        assert.strictEqual(input.getAttribute('aria-expanded'), 'true', 'the dropdown is open before the Tab');
        assert.strictEqual(
            selectEl.querySelector('menu li[selected]').textContent.trim(),
            'Label 1',
            'the first option is highlighted before the Tab',
        );

        keydown(input, 'Tab');

        assert.strictEqual(input.getAttribute('aria-expanded'), 'false', 'Tab marks the combobox collapsed');
        assert.isFalse(selectEl.querySelector('ful-dropdown').shown, 'Tab closes the dropdown');
        assert.isNull(selectEl.value, 'Tab leaves the highlighted option unpicked');
    });

    it('clears the field error when the custom validity is reset', async () => {
        const [selectEl] = await mountSelect(`<ful-select>labels</ful-select>`, labelling([]));

        selectEl.setCustomValidity('nope');
        assert.strictEqual(
            selectEl.querySelector('ful-field-error').innerText,
            'nope',
            'a custom validity message is shown in the field error',
        );

        selectEl.setCustomValidity();
        assert.strictEqual(
            selectEl.querySelector('ful-field-error').innerText,
            '',
            'resetting the custom validity empties the field error',
        );
    });
});

describe('Select pointer picking', () => {
    const mount = (html) =>
        mountSelect(
            html,
            labelling([
                { key: 'k1', label: 'Label 1' },
                { key: 'k2', label: 'Label 2' },
            ]),
        );

    it('picks the clicked option and closes the dropdown', async () => {
        const [selectEl] = await mount(`<ful-select>pick</ful-select>`);
        const input = selectEl.querySelector('input');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        selectEl.querySelectorAll('menu li')[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));

        assert.strictEqual(selectEl.value, 'k2', 'the clicked option is the picked one');
        assert.strictEqual(input.value, 'Label 2', 'the field shows the label of the clicked option');
        assert.isFalse(selectEl.querySelector('ful-dropdown').shown, 'a pick closes the dropdown');
        assert.strictEqual(input.getAttribute('aria-expanded'), 'false', 'a pick marks the combobox collapsed');
    });

    it('closes without picking when the blank area of the menu is clicked', async () => {
        const [selectEl] = await mount(`<ful-select>pick</ful-select>`);
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        selectEl.querySelector('menu').dispatchEvent(new MouseEvent('click', { bubbles: true }));

        assert.isNull(selectEl.value, 'a click on the blank area of the menu picks nothing');
        assert.isFalse(
            selectEl.querySelector('ful-dropdown').shown,
            'a click on the blank area of the menu closes the dropdown',
        );
    });
});

describe('Select dropdown opening', () => {
    const mount = (html) => mountSelect(html, labelling(ONE_OPTION));
    const keydown = (input, code) => {
        input.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    };

    it('opens with a plain ArrowDown, starting from the current selection', async () => {
        const [selectEl] = await mount(`<ful-select value="k1">pick</ful-select>`);
        const input = selectEl.querySelector('input');

        keydown(input, 'ArrowDown');
        await opened();

        assert.isTrue(selectEl.querySelector('ful-dropdown').shown, 'a plain ArrowDown opens the dropdown');
        assert.strictEqual(
            input.getAttribute('aria-expanded'),
            'true',
            'the open dropdown marks the combobox expanded',
        );
        assert.strictEqual(
            selectEl.querySelector('menu li[selected]').textContent.trim(),
            'Label 1',
            'the list opens with the current selection highlighted',
        );
    });

    it('closes on Escape, bringing the label of the selection back', async () => {
        const [selectEl] = await mount(`<ful-select value="k1">pick</ful-select>`);
        const input = selectEl.querySelector('input');
        keydown(input, 'ArrowDown');
        await opened();
        input.value = 'needle';

        keydown(input, 'Escape');

        assert.isFalse(selectEl.querySelector('ful-dropdown').shown, 'Escape closes the dropdown');
        assert.strictEqual(input.value, 'Label k1', 'escaping an edit restores the resolved label');
    });

    it('does not open when a disabled select is clicked', async () => {
        const [selectEl] = await mount(`<ful-select value="k1">pick</ful-select>`);
        selectEl.disabled = true;

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        assert.isFalse(selectEl.querySelector('ful-dropdown').shown, 'a disabled select does not open on click');
        assert.strictEqual(
            selectEl.querySelector('input').getAttribute('aria-expanded'),
            'false',
            'a disabled select keeps the combobox collapsed',
        );
    });

    it('does not open when a readonly select is clicked', async () => {
        const [selectEl] = await mount(`<ful-select value="k1">pick</ful-select>`);
        selectEl.readonly = true;

        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();

        assert.isFalse(selectEl.querySelector('ful-dropdown').shown, 'a readonly select does not open on click');
    });

    it('leaves a click on another control inside it to that control', async () => {
        const [selectEl] = await mount(
            `<ful-select value="k1">pick<ful-tooltip slot="info">a note</ful-tooltip></ful-select>`,
        );
        const marker = selectEl.querySelector('ful-tooltip .ful-tip');

        marker.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await opened();

        assert.isFalse(
            selectEl.querySelector('ful-dropdown').shown,
            'reading the note beside a select should not drop the dropdown over it',
        );
        assert.notStrictEqual(
            document.activeElement,
            selectEl.querySelector('input'),
            'a click on the tooltip leaves the focus away from the combobox',
        );
    });

    it('still opens when its own control group is clicked', async () => {
        const [selectEl] = await mount(
            `<ful-select value="k1">pick<ful-tooltip slot="info">a note</ful-tooltip></ful-select>`,
        );

        selectEl.querySelector('ful-control-group').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await opened();

        assert.isTrue(selectEl.querySelector('ful-dropdown').shown, 'a click on the control group opens the dropdown');
    });
});

describe('Select inner control isolation', () => {
    const mount = (html) => mountSelect(html, labelling(ONE_OPTION));

    it('does not re-emit the inner input change as its own', async () => {
        const [selectEl] = await mount(`<ful-select value="k1">pick</ful-select>`);
        const seen = [];
        selectEl.addEventListener('change', (e) => seen.push(e.detail));

        selectEl.querySelector('input').dispatchEvent(new Event('change', { bubbles: true }));

        assert.deepStrictEqual(seen, [], 'the change of the inner input is not dispatched as a change of the select');
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
        assert.strictEqual(input.selectionEnd, 2, 'refocusing mid-edit leaves the selection collapsed at the caret');
    });
});

describe('Select stray clicks', () => {
    const mount = (html) => mountSelect(html, labelling([]));

    it('removes nothing when a badge nested somewhere else in the control is clicked', async () => {
        const [selectEl] = await mount(`<ful-select multiple value="k1,k2">pick</ful-select>`);
        const wrapper = document.createElement('span');
        const stray = document.createElement('ful-badge');
        stray.innerText = 'decorative';
        wrapper.appendChild(stray);
        selectEl.querySelector('ful-control').appendChild(wrapper);
        const seen = [];
        selectEl.addEventListener('change', (e) => seen.push(e.detail));

        stray.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        assert.deepStrictEqual(
            selectEl.value,
            ['k1', 'k2'],
            'a badge that is not a direct child of the control is not a selection chip, so no entry is removed',
        );
        assert.deepStrictEqual(seen, [], 'a click on a stray badge dispatches no change');
    });

    it('removes nothing when a button outside any item is clicked in the item list', async () => {
        const [selectEl] = await mount(`<ful-select multiple item-list value="k1,k2">pick</ful-select>`);
        const stray = document.createElement('button');
        stray.type = 'button';
        stray.innerText = 'add all';
        selectEl.querySelector('ful-item-list').appendChild(stray);
        const seen = [];
        selectEl.addEventListener('change', (e) => seen.push(e.detail));

        stray.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        assert.deepStrictEqual(selectEl.value, ['k1', 'k2'], 'a button that is not inside an item removes no entry');
        assert.deepStrictEqual(seen, [], 'a click on a stray button dispatches no change');
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
    const mount = async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                load: async () => {
                    throw new Error('search backend down');
                },
                exact: labelKeys,
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

        const clock = installClock();
        try {
            selectEl.dispatchEvent(new Event('click', { bubbles: true }));

            assert.strictEqual(input.value, 'ty', 'clicking back in must not wipe the needle being retried');
            await clock.advance(450);
            await settle();
        } finally {
            clock.uninstall();
        }

        assert.isAbove(rejections.length, rejectionsBefore, 'the retried search failed again, as configured');
        assert.isTrue(
            rejections.some((r) => String(r?.message ?? r).includes('search backend down')),
            'the reported rejection carries the error the loader threw',
        );
    });
});

describe('Select focus and key coercion gaps', () => {
    const mount = mountSelect;

    it('hands its focus to the combobox', async () => {
        const [selectEl] = await mount(`<ful-select>pick</ful-select>`, labelling([]));

        selectEl.focus();

        assert.strictEqual(
            document.activeElement,
            selectEl.querySelector('input'),
            'focusing the select moves the focus to its combobox',
        );
    });

    it('coerces false and keeps undecodable keys when k-type is boolean', async () => {
        const booleany = {
            prefetch: async () => {},
            load: async () => [
                [true, 'Yes'],
                [false, 'No'],
            ],
            exact: async (...keys) =>
                [true, false].filter((r) => keys.some((k) => r == k)).map((r) => ({ key: r, label: r ? 'Yes' : 'No' })),
        };
        const [selectEl, container] = await mount(
            `<ful-select k-type="boolean" value="false">pick</ful-select>`,
            booleany,
        );

        assert.strictEqual(selectEl.value, false, 'the string token decodes to the boolean');
        assert.strictEqual(
            selectEl.querySelector('input').value,
            'No',
            'the decoded false key is labelled by the loader',
        );
        container.remove();

        const [undecodable] = await mount(
            `<ful-select k-type="boolean" value="banana">pick</ful-select>`,
            labelling([]),
        );

        assert.strictEqual(undecodable.value, 'banana', 'what cannot be decoded is left as it is');
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
            'the badges show only the keys the loader answered',
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
                exact: async (...keys) => keys.map((k) => ({ key: k, label: String(k) })),
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
        assert.match(
            dropdown.querySelector('menu').textContent,
            /fast/,
            'the dropdown lists the options of the newest open',
        );
        assert.notMatch(dropdown.querySelector('menu').textContent, /slow/, 'the stale search renders nothing');
        assert.strictEqual(
            input.getAttribute('aria-activedescendant'),
            activeDescendant,
            'the stale search highlights nothing',
        );
        assert.isTrue(
            dropdown.querySelector('ful-spinner').hasAttribute('hidden'),
            'the spinner is hidden once the newest search has rendered',
        );
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
        assert.match(
            dropdown.querySelector('menu').textContent,
            /fast/,
            'the dropdown keeps the options of the newest open',
        );
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
        assert.isFalse(dropdown.shown, 'a search landing after the blur does not reopen the dropdown');
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
                exact: labelKeys,
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
        selectEl.setAttribute('item-list', '');
        selectEl.setAttribute('readonly', '');
        selectEl.setAttribute('required', '');
        release();
        await Rendering.waitFor(selectEl);
        await settle();

        const input = selectEl.querySelector('input');
        assert.deepStrictEqual(uncaught, [], 'no attribute crashes on the unrendered field');
        assert.strictEqual(selectEl.value, 'k1', 'the value is applied');
        assert.strictEqual(input.value, 'Label k1', 'the label is resolved');
        assert.isTrue(selectEl.itemList, 'the item list is on');
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
        assert.strictEqual(
            selectEl.querySelector('input').value,
            'Label k1',
            'the label is resolved for the live value',
        );
    });

    it('survives a form reset while the prefetch is in flight', async () => {
        const [selectEl, container] = await mount();
        await inWindow(selectEl);
        container.querySelector('form').reset();
        release();
        await Rendering.waitFor(selectEl);
        await settle();

        assert.deepStrictEqual(uncaught, [], 'the reset does not crash the unrendered field');
        assert.isNull(selectEl.value, 'a reset during the prefetch leaves the select empty');
    });
});

describe('Disabled options', () => {
    const VOCABULARY = [
        { key: 'locked', label: 'Locked', metadata: { disabled: true, reason: 'it has children' } },
        { key: 'free', label: 'Free' },
        { key: 'sealed', label: 'Sealed', metadata: { disabled: true } },
    ];
    const mount = () =>
        mountSelect('<ful-select>pick</ful-select>', {
            prefetch: async () => {},
            exact: async (...keys) => keys.map((k) => VOCABULARY.find((v) => v.key === k) ?? { key: k, label: k }),
            load: async () => VOCABULARY,
        });
    const keydown = (input, code, options = {}) => {
        input.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...options }));
    };

    it('marks the disabled rows and shows their reason', async () => {
        const [selectEl] = await mount();
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        await settle();

        const [locked, free, sealed] = selectEl.querySelectorAll('menu li');
        assert.strictEqual(locked.getAttribute('aria-disabled'), 'true', 'metadata.disabled refuses the entry');
        assert.strictEqual(locked.getAttribute('title'), 'it has children', 'metadata.reason says why');
        assert.isFalse(free.hasAttribute('aria-disabled'), 'an entry without metadata.disabled is not marked disabled');
        assert.strictEqual(
            sealed.getAttribute('aria-disabled'),
            'true',
            'every entry whose metadata.disabled is truthy is marked disabled',
        );
        assert.isFalse(sealed.hasAttribute('title'), 'a disabled entry without metadata.reason gets no title');
    });

    it('reports a refused row as disabled to a reader and to the stylesheet', async () => {
        const [selectEl] = await mount();
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        await settle();

        const [locked, free] = selectEl.querySelectorAll('menu li');
        assert.isTrue(
            locked.matches('[aria-disabled="true"]'),
            'a row whose metadata.disabled is truthy matches the selector the stylesheet mutes',
        );
        assert.isFalse(free.matches('[aria-disabled="true"]'), 'an enabled row does not match the muted selector');
        assert.notStrictEqual(
            getComputedStyle(locked).color,
            getComputedStyle(free).color,
            'a refused row does not read as an ordinary choice',
        );
    });

    it('opens on the first enabled option and never walks onto a disabled one', async () => {
        const [selectEl] = await mount();
        const input = selectEl.querySelector('input');
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        await settle();
        const highlighted = () => selectEl.querySelector('menu li[selected]')?.textContent.trim();

        assert.strictEqual(
            highlighted(),
            'Free',
            'the list opens highlighting the first enabled option, not the disabled first row',
        );

        keydown(input, 'ArrowUp');
        assert.strictEqual(highlighted(), 'Free', 'backwards stops before the disabled first row');
        keydown(input, 'ArrowDown');
        assert.strictEqual(highlighted(), 'Free', 'forwards stops before the disabled last row');
        keydown(input, 'Home');
        assert.strictEqual(highlighted(), 'Free', 'Home walks in past the disabled edge');
        keydown(input, 'End');
        assert.strictEqual(highlighted(), 'Free', 'End walks in past the disabled edge');
        keydown(input, 'PageDown');
        assert.strictEqual(highlighted(), 'Free', 'a page walk refuses the disabled rows too');

        keydown(input, 'Enter');
        assert.strictEqual(selectEl.value, 'free', 'the highlighted enabled option is the answer');
    });

    it('refuses the press on an entry, so the combobox keeps the focus', async () => {
        const [selectEl] = await mount();
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        await settle();

        const press = (el) => {
            const evt = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
            el.dispatchEvent(evt);
            return evt.defaultPrevented;
        };
        const [locked, free] = selectEl.querySelectorAll('menu li');
        const menu = selectEl.querySelector('menu');
        assert.isTrue(press(locked), 'a refused entry would otherwise strand the focus on the menu');
        assert.isTrue(press(free), 'pressing an enabled entry is refused as well, so the combobox keeps the focus');
        assert.isFalse(press(menu), 'the menu itself is left alone, so its scrollbar still drags');
    });

    it('refuses a click on a disabled row and takes the enabled one beside it', async () => {
        const [selectEl] = await mount();
        selectEl.dispatchEvent(new Event('click', { bubbles: true }));
        await opened();
        await settle();
        const [locked, free] = selectEl.querySelectorAll('menu li');
        const dropdown = selectEl.querySelector('ful-dropdown');

        locked.click();
        await settle();
        assert.isTrue(dropdown.shown, 'a refused row leaves the dropdown open');
        assert.strictEqual(selectEl.value, null, 'a refused row leaves the selection unchanged');

        free.click();
        await settle();
        assert.isFalse(dropdown.shown, 'a click on an enabled row closes the dropdown');
        assert.strictEqual(selectEl.value, 'free', 'a click on an enabled row picks it');
    });
});

describe('Select dropdown anchoring', () => {
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
                exact: async (...keys) => keys.map((k) => ({ key: k, label: String(k) })),
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

    it('grows past its control for a long option, capped at the dropdown max-width', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                exact: async (...keys) => keys.map((k) => ({ key: k, label: String(k) })),
                load: async () => [{ key: 'k1', label: `Alpha ${'x'.repeat(300)}` }],
            }),
        });
        const supports = CSS.supports;
        CSS.supports = () => false;
        try {
            const container = appended(`<ful-select style="width: 120px"></ful-select>`);
            const selectEl = container.querySelector('ful-select');
            await Rendering.waitFor(selectEl);
            await settle();
            await open(selectEl);

            const dd = selectEl.querySelector('ful-dropdown').getBoundingClientRect();
            const group = selectEl.querySelector('ful-control-group').getBoundingClientRect();
            assert.isAbove(dd.width, group.width, 'a long option is not cut to the control');
            assert.isAtMost(dd.width, 481, 'the growth stops at the cap');
            container.remove();
        } finally {
            CSS.supports = supports;
        }
    });
});

describe('Clearing a single select', () => {
    const OPTIONS = [
        { key: '', label: 'None' },
        { key: 'k1', label: 'Alpha' },
        { key: 'k2', label: 'Beta' },
    ];
    const vocabulary = {
        prefetch: async () => {},
        load: async () => OPTIONS,
        exact: async (...keys) => keys.map((k) => OPTIONS.find((o) => o.key === k) ?? { key: k, label: k }),
    };
    const mount = (html) => mountSelect(html, vocabulary);
    const press = async (input, code, options = {}) => {
        input.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...options }));
        await settle();
    };
    const typing = async (input, text) => {
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await settle();
    };

    it('keeps showing the chosen label once the dropdown opens', async () => {
        const [el] = await mount('<ful-select value="k1">pick</ful-select>');
        const input = el.querySelector('input');

        input.focus();
        await press(input, 'ArrowDown', { altKey: true });

        assert.strictEqual(input.value, 'Alpha', 'a select showing nothing reads as an empty one');
        assert.strictEqual(el.value, 'k1', 'opening the dropdown keeps the selected key');
    });

    it('commits an emptied box as a clear when the field is left', async () => {
        const [el] = await mount('<ful-select value="k1">pick</ful-select>');
        const input = el.querySelector('input');

        input.focus();
        await typing(input, '');
        await press(input, 'Tab');

        assert.isNull(el.value, 'leaving an emptied single select clears its selection');
        assert.strictEqual(input.value, '', 'the cleared select shows an empty field');
    });

    it('reverts an emptied box when the edit is cancelled', async () => {
        const [el] = await mount('<ful-select value="k1">pick</ful-select>');
        const input = el.querySelector('input');

        input.focus();
        await typing(input, '');
        await press(input, 'Escape');

        assert.strictEqual(el.value, 'k1', 'Escape after emptying the field keeps the selected key');
        assert.strictEqual(input.value, 'Alpha', 'Escape after emptying the field restores the label of the selection');
    });

    it('reverts a search that matched nothing, rather than clearing', async () => {
        const [el] = await mount('<ful-select value="k1">pick</ful-select>');
        const input = el.querySelector('input');

        input.focus();
        await typing(input, 'Alp');
        await press(input, 'Tab');

        assert.strictEqual(
            el.value,
            'k1',
            'leaving the field after a search that picked nothing keeps the selected key',
        );
        assert.strictEqual(
            input.value,
            'Alpha',
            'leaving the field after a search that picked nothing restores the label of the selection',
        );
    });

    it('keeps the value when the field is left untouched', async () => {
        const [el] = await mount('<ful-select value="k1">pick</ful-select>');
        const input = el.querySelector('input');

        input.focus();
        await press(input, 'Tab');

        assert.strictEqual(el.value, 'k1', 'leaving an untouched field keeps the selected key');
    });

    it('reads a present but empty value attribute as the empty key', async () => {
        const [el] = await mount('<ful-select value="">pick</ful-select>');
        assert.strictEqual(
            el.value,
            '',
            'a present but empty value attribute is the empty key, not an absent selection',
        );
        await settle();
        assert.strictEqual(
            el.querySelector('input').value,
            'None',
            'the empty key is labelled by the option carrying it',
        );
    });

    it('an absent value attribute stays no selection', async () => {
        const [el] = await mount('<ful-select>pick</ful-select>');
        assert.strictEqual(el.value, null, 'without a value attribute a single select has no selection');
        assert.strictEqual(el.querySelector('input').value, '', 'without a selection the field is empty');
    });

    it('a multiple select reads an empty value attribute as no keys', async () => {
        const [el] = await mount('<ful-select multiple value="">pick</ful-select>');
        assert.deepStrictEqual(el.value, [], 'a multiple select reads an empty value attribute as no keys');
    });

    it('does not read a multiple select, whose box is empty by design, as a clear', async () => {
        const [el] = await mount('<ful-select multiple value="k1,k2">pick</ful-select>');
        const input = el.querySelector('input');

        input.focus();
        await press(input, 'Tab');

        assert.deepEqual(
            el.value,
            ['k1', 'k2'],
            'the empty input of a multiple select is not read as a clear when the field is left',
        );
    });
});
