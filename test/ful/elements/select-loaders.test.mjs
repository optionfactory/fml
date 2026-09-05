import { tick } from '../../tick.mjs';
import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

/** the dropdown opens on the throttle's leading edge, this only lets the loader resolve */
const opened = async () => {
    for (let i = 0; i !== 10; ++i) {
        await tick();
    }
};
const keydown = (el, code, opts) => el.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...opts }));

/**
 * The other select tests stub 'loaders:select' wholesale: these exercise the
 * loader stack the plugin actually registers — the in-memory one built from
 * slotted options, the remote one with its revision cache, the chunked one
 * asking per query, and the expression-based response mapper.
 */
describe('SelectLoader', () => {
    const INLINE_OPTIONS = `
        <select slot="options">
            <option value="k1">One</option>
            <option value="k2">Two</option>
            <option value="k3">Three</option>
        </select>`;

    const mount = async (attributes = '', body = '') => {
        const container = document.createElement('div');
        container.innerHTML = `<ful-select ${attributes}>${body}</ful-select>`;
        document.body.appendChild(container);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await opened();
        return [selectEl, container];
    };
    /** opens through Alt+ArrowDown, which shows without going through the search throttle */
    const open = async (selectEl) => {
        keydown(selectEl.querySelector('input'), 'ArrowDown', { altKey: true });
        await opened();
        return selectEl.querySelector('ful-dropdown');
    };
    const options = (dropdown) => Array.from(dropdown.querySelectorAll('menu li')).map((li) => li.textContent.trim());

    /** a stubbed http client recording every request, serving canned bodies per url */
    const stubHttp = (responses) => {
        const calls = [];
        registry.defineComponent('http-client', {
            request(method, url) {
                const record = { method, url, params: {} };
                calls.push(record);
                return {
                    param(name, ...values) {
                        record.params[name] = [...(record.params[name] ?? []), ...values];
                        return this;
                    },
                    async fetchJson() {
                        const body = responses[url];
                        if (body === undefined) {
                            throw new Error(`no canned response for ${url}`);
                        }
                        return body;
                    },
                };
            },
        });
        return calls;
    };

    it('builds an in-memory loader out of the slotted options', async () => {
        const [selectEl, container] = await mount('', INLINE_OPTIONS);

        const dropdown = await open(selectEl);

        assert.deepStrictEqual(options(dropdown), ['One', 'Two', 'Three']);
        container.remove();
    });

    it('filters the slotted options on the typed needle, ignoring case', async () => {
        const [selectEl, container] = await mount('', INLINE_OPTIONS);
        await open(selectEl);

        const input = selectEl.querySelector('input');
        input.value = 'tW';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await opened();

        assert.deepStrictEqual(options(selectEl.querySelector('ful-dropdown')), ['Two']);
        container.remove();
    });

    it('labels an assigned value by looking it up in the slotted options', async () => {
        const [selectEl, container] = await mount('value="k2"', INLINE_OPTIONS);

        assert.strictEqual(selectEl.querySelector('input').value, 'Two');
        container.remove();
    });

    it('fetches the remote options once and serves every later open from memory', async () => {
        const calls = stubHttp({ '/all-opts': [['k1', 'One'], ['k2', 'Two']] });
        const [selectEl, container] = await mount('src="/all-opts"');

        const dropdown = await open(selectEl);
        assert.deepStrictEqual(options(dropdown), ['One', 'Two']);

        keydown(selectEl.querySelector('input'), 'ArrowUp', { altKey: true });
        await open(selectEl);
        assert.deepStrictEqual(options(selectEl.querySelector('ful-dropdown')), ['One', 'Two'], 'the reopen lists the same options');

        assert.lengthOf(calls, 1, 'the second open must not hit the network again');
        assert.deepStrictEqual(calls[0], { method: 'POST', url: '/all-opts', params: {} });
        container.remove();
    });

    it('prefetches on upgrade when declared, so opening adds no request', async () => {
        const calls = stubHttp({ '/pre-opts': [['k1', 'One']] });

        const [selectEl, container] = await mount('src="/pre-opts" preload');
        assert.lengthOf(calls, 1, 'the options were fetched while upgrading');

        await open(selectEl);
        assert.lengthOf(calls, 1);
        assert.deepStrictEqual(options(selectEl.querySelector('ful-dropdown')), ['One']);
        container.remove();
    });

    it('reuses a revisioned response across mounts through local storage', async () => {
        localStorage.removeItem('POST@/rev-opts');
        const calls = stubHttp({ '/rev-opts': [['k1', 'One']] });

        const [first, firstContainer] = await mount('src="/rev-opts" revision="r1"');
        await open(first);
        assert.lengthOf(calls, 1);
        firstContainer.remove();

        const [second, secondContainer] = await mount('src="/rev-opts" revision="r1"');
        const dropdown = await open(second);
        assert.deepStrictEqual(options(dropdown), ['One']);
        assert.lengthOf(calls, 1, 'the revisioned data came from local storage, not the network');

        localStorage.removeItem('POST@/rev-opts');
        secondContainer.remove();
    });

    it('asks the server per search and per key lookup when mode is chunked', async () => {
        const calls = stubHttp({ '/chunk-opts': [['k1', 'One']] });

        const [selectEl, container] = await mount('src="/chunk-opts" mode="chunked" value="k1"');
        await opened();
        assert.deepStrictEqual(calls.find((c) => 'k' in c.params)?.params, { k: ['k1'] }, 'the assignment looked its key up');
        assert.strictEqual(selectEl.querySelector('input').value, 'One');

        await open(selectEl);
        assert.deepStrictEqual(calls.find((c) => 's' in c.params)?.params, { s: [''] }, 'opening asks with an empty needle');

        container.remove();
    });

    it('maps the response through the declared expressions', async () => {
        stubHttp({ '/shaped': { rows: [{ id: 1, name: 'One' }, { id: 2, name: 'Two' }] } });

        const [selectEl, container] = await mount('src="/shaped" d-expr="rows" k-expr="id" l-expr="name" value="2"');

        assert.strictEqual(selectEl.querySelector('input').value, 'Two', 'the assignment resolved through the mapper');
        assert.deepStrictEqual(options(await open(selectEl)), ['One', 'Two']);
        container.remove();
    });

    it('resolves a named response-mapper component', async () => {
        registry.defineComponent('mappers:demo', (response) => response.options);
        stubHttp({ '/mapped': { options: [['k1', 'One']] } });

        const [selectEl, container] = await mount('src="/mapped" response-mapper="mappers:demo"');

        assert.deepStrictEqual(options(await open(selectEl)), ['One']);
        container.remove();
    });
});

describe('Dropdown contract', () => {
    const INLINE_OPTIONS = `
        <select slot="options">
            <option value="k1">One</option>
        </select>`;
    const mount = async (inner) => {
        const container = document.createElement('div');
        container.innerHTML = `<ful-select>${inner}</ful-select>`;
        document.body.appendChild(container);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        const input = selectEl.querySelector('input');
        input.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', altKey: true, bubbles: true }));
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
        return [selectEl, selectEl.querySelector('ful-dropdown'), container];
    };

    it('rejects null data with a contract error', async () => {
        const [, dropdown, container] = await mount(INLINE_OPTIONS);

        assert.throws(() => dropdown.update(undefined), 'null data');
        container.remove();
    });

    it('closes when the blank area of the menu is clicked', async () => {
        const [, dropdown, container] = await mount(INLINE_OPTIONS);
        assert.isTrue(dropdown.shown);

        dropdown.querySelector('menu').dispatchEvent(new Event('click'));

        assert.isFalse(dropdown.shown);
        container.remove();
    });
});

describe('SelectLoader runtime updates', () => {
    const INLINE_OPTIONS = `
        <select slot="options">
            <option value="k1">One</option>
            <option value="k2">Two</option>
        </select>`;
    const stubHttp = (responses) => {
        const calls = [];
        registry.defineComponent('http-client', {
            request(method, url) {
                const record = { method, url };
                calls.push(record);
                return {
                    async fetchJson() {
                        const body = responses[url];
                        if (body === undefined) {
                            throw new Error(`no canned response for ${url}`);
                        }
                        return body;
                    },
                };
            },
        });
        return calls;
    };
    const mount = async (attributes = '', body = '') => {
        const container = document.createElement('div');
        container.innerHTML = `<ful-select ${attributes}>${body}</ful-select>`;
        document.body.appendChild(container);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        await opened();
        return [selectEl, container];
    };
    const open = async (selectEl) => {
        keydown(selectEl.querySelector('input'), 'ArrowDown', { altKey: true });
        await opened();
        return selectEl.querySelector('ful-dropdown');
    };
    const options = (dropdown) => Array.from(dropdown.querySelectorAll('menu li')).map((li) => li.textContent.trim());

    it('serves the options an in-memory loader was updated with', async () => {
        const [selectEl, container] = await mount('', INLINE_OPTIONS);

        await selectEl.withLoader((loader) => loader.update([['k9', 'Nine']]));
        assert.deepStrictEqual(options(await open(selectEl)), ['Nine']);
        container.remove();
    });

    it('refetches from the new url after reconfigureUrl, instead of serving the stale cache', async () => {
        const calls = stubHttp({
            '/before': [['k1', 'One']],
            '/after': [['k2', 'Two']],
        });
        const [selectEl, container] = await mount('src="/before"');
        const close = () => keydown(selectEl.querySelector('input'), 'ArrowUp', { altKey: true });

        assert.deepStrictEqual(options(await open(selectEl)), ['One']);
        close();
        assert.lengthOf(calls, 1);

        await selectEl.withLoader((loader) => loader.reconfigureUrl('/after'));
        assert.deepStrictEqual(options(await open(selectEl)), ['Two'], 'the new url answered the next open');
        assert.lengthOf(calls, 2);
        assert.deepStrictEqual(calls.map((c) => c.url), ['/before', '/after']);
        container.remove();
    });
});
