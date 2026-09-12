import { tick } from '../../tick.mjs';
import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin, SelectLoader } from '../../../src/ful/index.mjs';
import { appended } from '../../harness.mjs';

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
        const container = appended(`<ful-select ${attributes}>${body}</ful-select>`);
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
        const [selectEl] = await mount('', INLINE_OPTIONS);

        const dropdown = await open(selectEl);

        assert.deepStrictEqual(options(dropdown), ['One', 'Two', 'Three']);
    });

    it('filters the slotted options on the typed needle, ignoring case', async () => {
        const [selectEl] = await mount('', INLINE_OPTIONS);
        await open(selectEl);

        const input = selectEl.querySelector('input');
        input.value = 'tW';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await opened();

        assert.deepStrictEqual(options(selectEl.querySelector('ful-dropdown')), ['Two']);
    });

    it('treats a needleless load as no filter, not as the string "undefined"', async () => {
        const [selectEl] = await mount('', INLINE_OPTIONS);

        const all = await selectEl.withLoader((l) => l.load(undefined));

        assert.deepStrictEqual(
            all.map(({ label }) => label),
            ['One', 'Two', 'Three'],
        );
    });

    it('labels an assigned value by looking it up in the slotted options', async () => {
        const [selectEl] = await mount('value="k2"', INLINE_OPTIONS);

        assert.strictEqual(selectEl.querySelector('input').value, 'Two');
    });

    it('fetches the remote options once and serves every later open from memory', async () => {
        const calls = stubHttp({
            '/all-opts': [
                ['k1', 'One'],
                ['k2', 'Two'],
            ],
        });
        const [selectEl] = await mount('src="/all-opts"');

        const dropdown = await open(selectEl);
        assert.deepStrictEqual(options(dropdown), ['One', 'Two']);

        keydown(selectEl.querySelector('input'), 'ArrowUp', { altKey: true });
        await open(selectEl);
        assert.deepStrictEqual(
            options(selectEl.querySelector('ful-dropdown')),
            ['One', 'Two'],
            'the reopen lists the same options',
        );

        assert.lengthOf(calls, 1, 'the second open must not hit the network again');
        assert.deepStrictEqual(calls[0], { method: 'POST', url: '/all-opts', params: {} });
    });

    it('prefetches on upgrade when declared, so opening adds no request', async () => {
        const calls = stubHttp({ '/pre-opts': [['k1', 'One']] });

        const [selectEl] = await mount('src="/pre-opts" preload');
        assert.lengthOf(calls, 1, 'the options were fetched while upgrading');

        await open(selectEl);
        assert.lengthOf(calls, 1);
        assert.deepStrictEqual(options(selectEl.querySelector('ful-dropdown')), ['One']);
    });

    it('paints its own chrome without waiting on the prefetch', async () => {
        //the field's label, combobox and error region are its own state; only the
        //vocabulary is remote, so a slow endpoint degrades the options, not the field
        const pending = [];
        registry.defineComponent('http-client', {
            request() {
                const resolvers = /** @type any */ (Promise.withResolvers());
                pending.push(resolvers);
                return { fetchJson: () => resolvers.promise };
            },
        });
        const container = appended('<ful-select src="/never" preload name="s">a label</ful-select>');
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);

        assert.lengthOf(pending, 1, 'the prefetch is in flight');
        assert.isNotNull(selectEl.querySelector('input'), 'the combobox painted');
        assert.isNotNull(selectEl.querySelector('label'), 'the label painted');
        assert.isNotNull(selectEl.querySelector('ful-field-error'), 'the error region painted');
        assert.isTrue(selectEl.rendered, 'the properties are live while the options are still loading');

        pending[0].resolve([]);
    });

    it('reuses a revisioned response across mounts through local storage', async () => {
        localStorage.removeItem('POST@/rev-opts');
        const calls = stubHttp({ '/rev-opts': [['k1', 'One']] });

        const [first, firstContainer] = await mount('src="/rev-opts" revision="r1"');
        await open(first);
        assert.lengthOf(calls, 1);
        firstContainer.remove();

        const [second] = await mount('src="/rev-opts" revision="r1"');
        const dropdown = await open(second);
        assert.deepStrictEqual(options(dropdown), ['One']);
        assert.lengthOf(calls, 1, 'the revisioned data came from local storage, not the network');

        localStorage.removeItem('POST@/rev-opts');
    });

    it('asks the server per search and per key lookup when mode is chunked', async () => {
        const calls = stubHttp({ '/chunk-opts': [['k1', 'One']] });

        const [selectEl] = await mount('src="/chunk-opts" mode="chunked" value="k1"');
        await opened();
        assert.deepStrictEqual(
            calls.find((c) => 'k' in c.params)?.params,
            { k: ['k1'] },
            'the assignment looked its key up',
        );
        assert.strictEqual(selectEl.querySelector('input').value, 'One');

        await open(selectEl);
        assert.deepStrictEqual(
            calls.find((c) => 's' in c.params)?.params,
            { s: [''] },
            'opening asks with an empty needle',
        );

    });

    it('maps the response through the declared expressions', async () => {
        stubHttp({
            '/shaped': {
                rows: [
                    { id: 1, name: 'One' },
                    { id: 2, name: 'Two' },
                ],
            },
        });

        const [selectEl] = await mount('src="/shaped" d-expr="rows" k-expr="id" l-expr="name" value="2"');

        assert.strictEqual(selectEl.querySelector('input').value, 'Two', 'the assignment resolved through the mapper');
        assert.deepStrictEqual(options(await open(selectEl)), ['One', 'Two']);
    });

    it('resolves a named response-mapper component', async () => {
        //a consumer's response-mapper answers entries, as every loader now does
        registry.defineComponent('mappers:demo', (/** @type any */ response) =>
            response.options.map(([key, label]) => ({ key, label })),
        );
        stubHttp({ '/mapped': { options: [['k1', 'One']] } });

        const [selectEl] = await mount('src="/mapped" response-mapper="mappers:demo"');

        assert.deepStrictEqual(options(await open(selectEl)), ['One']);
    });
});

describe('Dropdown contract', () => {
    const INLINE_OPTIONS = `
        <select slot="options">
            <option value="k1">One</option>
        </select>`;
    const mount = async (inner) => {
        const container = appended(`<ful-select>${inner}</ful-select>`);
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
        const [, dropdown] = await mount(INLINE_OPTIONS);

        assert.throws(() => dropdown.update(undefined), 'null data');
    });

    it('closes when the blank area of the menu is clicked', async () => {
        const [, dropdown] = await mount(INLINE_OPTIONS);
        assert.isTrue(dropdown.shown);

        dropdown.querySelector('menu').dispatchEvent(new Event('click'));

        assert.isFalse(dropdown.shown);
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
        const container = appended(`<ful-select ${attributes}>${body}</ful-select>`);
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
        const [selectEl] = await mount('', INLINE_OPTIONS);

        await selectEl.withLoader((loader) => loader.update([{ key: 'k9', label: 'Nine', metadata: undefined }]));
        assert.deepStrictEqual(options(await open(selectEl)), ['Nine']);
    });

    it('refetches from the new url after reconfigureUrl, instead of serving the stale cache', async () => {
        const calls = stubHttp({
            '/before': [['k1', 'One']],
            '/after': [['k2', 'Two']],
        });
        const [selectEl] = await mount('src="/before"');
        const close = () => keydown(selectEl.querySelector('input'), 'ArrowUp', { altKey: true });

        assert.deepStrictEqual(options(await open(selectEl)), ['One']);
        close();
        assert.lengthOf(calls, 1);

        await selectEl.withLoader((loader) => loader.reconfigureUrl('/after'));
        assert.deepStrictEqual(options(await open(selectEl)), ['Two'], 'the new url answered the next open');
        assert.lengthOf(calls, 2);
        assert.deepStrictEqual(
            calls.map((c) => c.url),
            ['/before', '/after'],
        );
    });
});

describe('SelectLoader fetch discipline', () => {
    /** an http stub whose responses resolve only when released, recording every request */
    const deferredHttp = () => {
        const calls = [];
        const pending = [];
        registry.defineComponent('http-client', {
            request(method, url) {
                calls.push({ method, url });
                const resolvers = Promise.withResolvers();
                pending.push(resolvers);
                return {
                    fetchJson: () => resolvers.promise,
                };
            },
        });
        return { calls, pending };
    };
    //a loader is built from a plain configuration, so nothing here has to stand
    //in for an element to exercise the fetch discipline
    const remoteLoader = (conf) =>
        SelectLoader.from({
            http: registry.component('http-client'),
            responseMapper: (/** @type any[] */ rows) =>
                rows.map(([key, label, metadata]) => ({ key, label, metadata })),
            ...conf,
        });

    it('shares one in-flight fetch across concurrent prefetch, search and lookup', async () => {
        const { calls, pending } = deferredHttp();
        const loader = remoteLoader({ url: '/slow', prefetch: true });

        const concurrent = [loader.prefetch(), loader.load('one'), loader.exact('k1')];
        assert.lengthOf(calls, 1, 'the concurrent callers ride one request');
        pending[0].resolve([['k1', 'One']]);
        await Promise.all(concurrent);

        assert.deepStrictEqual(await loader.load('one'), [{ key: 'k1', label: 'One', metadata: undefined }]);
        assert.deepStrictEqual(await loader.exact('k1'), [{ key: 'k1', label: 'One', metadata: undefined }]);
        assert.lengthOf(calls, 1, 'the served answers never hit the network again');
    });

    it('discards the outcome of a fetch superseded by a reconfiguration', async () => {
        const { calls, pending } = deferredHttp();
        const loader = remoteLoader({ url: '/old', prefetch: true });

        const stale = loader.prefetch().then(
            () => assert.fail('the superseded prefetch rejects'),
            (e) => String(e),
        );
        loader.reconfigureUrl('/new');
        pending[0].resolve([['k1', 'Old']]);
        assert.match(await stale, /superseded/);

        const fresh = loader.load('x');
        assert.lengthOf(calls, 2);
        pending[1].resolve([['k2', 'New']]);
        await fresh;
        assert.deepStrictEqual(await loader.load('new'), [{ key: 'k2', label: 'New', metadata: undefined }]);
        assert.deepStrictEqual(await loader.exact('k1'), [], 'the old url answer was never stored');
        assert.lengthOf(calls, 2);
    });

    it('rejects a caller whose fetch a reconfiguration superseded, instead of crashing', async () => {
        const { calls, pending } = deferredHttp();
        const loader = remoteLoader({ url: '/old' });

        const superseded = loader.exact('k1').then(
            () => assert.fail('the superseded lookup rejects'),
            (e) => String(e),
        );
        loader.reconfigureUrl('/new');
        pending[0].resolve([['k1', 'Old']]);
        assert.match(await superseded, /superseded/);

        const next = loader.exact('k1');
        pending[1].resolve([['k1', 'New']]);
        assert.deepStrictEqual(await next, [{ key: 'k1', label: 'New', metadata: undefined }], 'the next caller is served from the new url');
        assert.deepStrictEqual(calls.map((c) => c.url), ['/old', '/new']);
    });

    it('serves the fetched options when the cache write hits a full quota', async () => {
        const calls = [];
        registry.defineComponent('http-client', {
            request(method, url) {
                calls.push({ method, url });
                return {
                    async fetchJson() {
                        return [['k1', 'One']];
                    },
                };
            },
        });
        const originalWarn = console.warn;
        const originalSetItem = Storage.prototype.setItem;
        const warns = [];
        console.warn = (...args) => warns.push(args);
        Storage.prototype.setItem = () => {
            throw new DOMException('full', 'QuotaExceededError');
        };
        let container;
        try {
            container = document.createElement('div');
            container.innerHTML = '<ful-select src="/quota" revision="1"></ful-select>';
            document.body.appendChild(container);
            const selectEl = container.querySelector('ful-select');
            await Rendering.waitFor(selectEl);
            await opened();
            keydown(selectEl.querySelector('input'), 'ArrowDown', { altKey: true });
            await opened();

            const items = selectEl.querySelector('ful-dropdown').querySelectorAll('menu li');
            assert.deepStrictEqual(
                Array.from(items).map((li) => li.textContent.trim()),
                ['One'],
            );
            assert.isTrue(
                warns.some((args) => String(args[0]).includes('cache')),
                'the failed write is warned, once',
            );
        } finally {
            console.warn = originalWarn;
            Storage.prototype.setItem = originalSetItem;
            container?.remove();
            localStorage.removeItem('POST@/quota');
        }
    });

    it('treats a tampered cache entry as a miss and fetches', async () => {
        localStorage.setItem('POST@/tampered', 'null');
        const calls = [];
        registry.defineComponent('http-client', {
            request(method, url) {
                calls.push({ method, url });
                return {
                    async fetchJson() {
                        return [['k1', 'One']];
                    },
                };
            },
        });
        const container = appended('<ful-select src="/tampered" revision="9"></ful-select>');
        try {
            const selectEl = container.querySelector('ful-select');
            await Rendering.waitFor(selectEl);
            await opened();
            keydown(selectEl.querySelector('input'), 'ArrowDown', { altKey: true });
            await opened();

            const items = selectEl.querySelector('ful-dropdown').querySelectorAll('menu li');
            assert.deepStrictEqual(
                Array.from(items).map((li) => li.textContent.trim()),
                ['One'],
            );
            assert.lengthOf(calls, 1);
        } finally {
            localStorage.removeItem('POST@/tampered');
            container.remove();
        }
    });
});
