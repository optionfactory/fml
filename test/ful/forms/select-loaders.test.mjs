import { tick } from '../../tick.mjs';
import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin, SelectLoader } from '../../../src/ful/index.mjs';
import { appended, attached } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

/** the dropdown opens on the throttle's leading edge, this only lets the loader resolve */
const opened = async () => {
    for (let i = 0; i !== 10; ++i) {
        await tick();
    }
};
const keydown = (el, code, opts) => el.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...opts }));

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

        assert.deepStrictEqual(
            options(dropdown),
            ['One', 'Two', 'Three'],
            'without src the vocabulary is the slotted option elements, listed in their order',
        );
    });

    it('filters the slotted options on the typed needle, ignoring case', async () => {
        const [selectEl] = await mount('', INLINE_OPTIONS);
        await open(selectEl);

        const input = selectEl.querySelector('input');
        input.value = 'tW';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await opened();

        assert.deepStrictEqual(
            options(selectEl.querySelector('ful-dropdown')),
            ['Two'],
            'the in-memory loader keeps the entries whose label contains the needle, ignoring case',
        );
    });

    it('treats a needleless load as no filter, not as the string "undefined"', async () => {
        const [selectEl] = await mount('', INLINE_OPTIONS);

        const all = await selectEl.withLoader((l) => l.load(undefined));

        assert.deepStrictEqual(
            all.map(({ label }) => label),
            ['One', 'Two', 'Three'],
            'a nullish needle matches every entry',
        );
    });

    it('labels an assigned value by looking it up in the slotted options', async () => {
        const [selectEl] = await mount('value="k2"', INLINE_OPTIONS);

        assert.strictEqual(
            selectEl.querySelector('input').value,
            'Two',
            'an assigned key is shown by the label of the slotted option carrying it',
        );
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
        assert.deepStrictEqual(options(dropdown), ['One', 'Two'], 'the first open lists the fetched vocabulary');

        keydown(selectEl.querySelector('input'), 'ArrowUp', { altKey: true });
        await open(selectEl);
        assert.deepStrictEqual(
            options(selectEl.querySelector('ful-dropdown')),
            ['One', 'Two'],
            'the reopen lists the same options',
        );

        assert.lengthOf(calls, 1, 'the second open must not hit the network again');
        assert.deepStrictEqual(
            calls[0],
            { method: 'POST', url: '/all-opts', params: {} },
            'the remote loader asks with POST when no method is declared, and sends no parameters',
        );
    });

    it('prefetches on upgrade when declared, so opening adds no request', async () => {
        const calls = stubHttp({ '/pre-opts': [['k1', 'One']] });

        const [selectEl] = await mount('src="/pre-opts" preload');
        assert.lengthOf(calls, 1, 'the options were fetched while upgrading');

        await open(selectEl);
        assert.lengthOf(calls, 1, 'opening a preloaded select is served from the prefetched vocabulary');
        assert.deepStrictEqual(
            options(selectEl.querySelector('ful-dropdown')),
            ['One'],
            'the dropdown lists the prefetched options',
        );
    });

    it('paints its own chrome without waiting on the prefetch', async () => {
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
        assert.lengthOf(calls, 1, 'the first mount fetches the vocabulary once');
        firstContainer.remove();

        const [second] = await mount('src="/rev-opts" revision="r1"');
        const dropdown = await open(second);
        assert.deepStrictEqual(
            options(dropdown),
            ['One'],
            'the second mount lists the options stored under the same revision',
        );
        assert.lengthOf(calls, 1, 'the revisioned data came from local storage, not the network');

        localStorage.removeItem('POST@/rev-opts');
    });

    it('gives ful-filter-in the same remote vocabulary a select gets', async () => {
        const calls = stubHttp({
            '/kinds': [
                ['A', 'Alpha'],
                ['B', 'Beta'],
            ],
        });
        const container = appended('<ful-filter-in src="/kinds" name="byKind">Kind</ful-filter-in>');
        const filter = container.querySelector('ful-filter-in');
        await Rendering.waitFor(filter);
        await opened();

        const dropdown = await open(filter);

        assert.deepEqual(
            options(dropdown),
            ['Alpha', 'Beta'],
            'ful-filter-in lists the remote vocabulary the same way a select does',
        );
        assert.lengthOf(calls, 1, 'ful-filter-in fetches its remote vocabulary once');
    });

    it('labels a filter preselected by key, so the criterion reads in words', async () => {
        stubHttp({
            '/kinds2': [
                ['A', 'Alpha'],
                ['B', 'Beta'],
            ],
        });
        const container = appended(
            '<ful-filter-in src="/kinds2" name="byKind" multiple value="A,B">Kind</ful-filter-in>',
        );
        const filter = container.querySelector('ful-filter-in');
        await Rendering.waitFor(filter);
        await opened();

        assert.deepEqual(filter.value, ['A', 'B'], 'the filter keeps the preselected keys as its value');
        assert.deepEqual(
            filter.criterion.operands,
            ['Alpha', 'Beta'],
            'the criterion names the preselected keys by their labels from the vocabulary',
        );
    });

    it('caches a revisioned filter vocabulary across mounts, as a select does', async () => {
        localStorage.removeItem('POST@/rev-kinds');
        const calls = stubHttp({ '/rev-kinds': [['A', 'Alpha']] });

        const first = appended('<ful-filter-in src="/rev-kinds" revision="r1" name="k">K</ful-filter-in>');
        await Rendering.waitFor(first.querySelector('ful-filter-in'));
        await opened();
        await open(first.querySelector('ful-filter-in'));
        assert.lengthOf(calls, 1, 'the first mount fetches the filter vocabulary once');
        first.remove();

        const second = appended('<ful-filter-in src="/rev-kinds" revision="r1" name="k">K</ful-filter-in>');
        await Rendering.waitFor(second.querySelector('ful-filter-in'));
        await opened();
        await open(second.querySelector('ful-filter-in'));

        assert.lengthOf(calls, 1, 'the revisioned data came from local storage, not the network');
        second.remove();
        localStorage.removeItem('POST@/rev-kinds');
    });

    it('takes a valueless revision from the registry', async () => {
        localStorage.removeItem('POST@/reg-rev');
        registry.defineComponent('revision', 'r9');
        const calls = stubHttp({ '/reg-rev': [['k1', 'One']] });

        const first = await mount('src="/reg-rev" revision');
        await open(first[0]);
        assert.lengthOf(calls, 1, 'the first mount fetches the vocabulary once');
        first[1].remove();

        const second = await mount('src="/reg-rev" revision');
        await open(second[0]);

        assert.lengthOf(calls, 1, 'the second mount read the registry revision out of local storage');
        second[1].remove();
        assert.isNotNull(
            localStorage.getItem('POST@/reg-rev'),
            'the response is cached in local storage under method@url with the registry revision',
        );
        localStorage.removeItem('POST@/reg-rev');
        registry.defineComponent('revision', undefined);
    });

    it('calls a revision component that is a function', async () => {
        localStorage.removeItem('POST@/fn-rev');
        registry.defineComponent('revision', () => 'built-42');
        stubHttp({ '/fn-rev': [['k1', 'One']] });

        const [el, container] = await mount('src="/fn-rev" revision');
        await open(el);

        assert.include(
            localStorage.getItem('POST@/fn-rev') ?? '',
            'built-42',
            'a revision component that is a function is called and its answer is the stored revision',
        );
        container.remove();
        localStorage.removeItem('POST@/fn-rev');
        registry.defineComponent('revision', undefined);
    });

    it('lets a written revision win over the registry', async () => {
        localStorage.removeItem('POST@/won-rev');
        registry.defineComponent('revision', 'from-registry');
        stubHttp({ '/won-rev': [['k1', 'One']] });

        const [el, container] = await mount('src="/won-rev" revision="written"');
        await open(el);

        assert.include(
            localStorage.getItem('POST@/won-rev') ?? '',
            'written',
            'a declared revision value is used in place of the registry revision',
        );
        container.remove();
        localStorage.removeItem('POST@/won-rev');
        registry.defineComponent('revision', undefined);
    });

    it('does not cache, and says so, when a valueless revision has nothing to resolve', async () => {
        localStorage.removeItem('POST@/no-rev');
        registry.defineComponent('revision', undefined);
        const calls = stubHttp({ '/no-rev': [['k1', 'One']] });

        const first = await mount('src="/no-rev" revision');
        await open(first[0]);
        first[1].remove();
        const second = await mount('src="/no-rev" revision');
        await open(second[0]);

        assert.lengthOf(calls, 2, 'nothing was cached');
        assert.isNull(
            localStorage.getItem('POST@/no-rev'),
            'without a revision to resolve nothing is written to local storage',
        );
        second[1].remove();
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
        assert.strictEqual(
            selectEl.querySelector('input').value,
            'One',
            'the chunked key lookup labels the assigned key',
        );

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
        assert.deepStrictEqual(
            options(await open(selectEl)),
            ['One', 'Two'],
            'the dropdown lists the labels the declared expressions extract from the response',
        );
    });

    it('resolves a named response-mapper component', async () => {
        registry.defineComponent('mappers:demo', (/** @type any */ response) =>
            response.options.map(([key, label]) => ({ key, label })),
        );
        stubHttp({ '/mapped': { options: [['k1', 'One']] } });

        const [selectEl] = await mount('src="/mapped" response-mapper="mappers:demo"');

        assert.deepStrictEqual(
            options(await open(selectEl)),
            ['One'],
            'the named response-mapper component turns the response into the entries listed',
        );
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

        assert.throws(
            () => dropdown.update(undefined),
            'null data',
            'the dropdown refuses undefined data instead of rendering nothing',
        );
    });
});

describe('SelectLoader runtime updates', () => {
    const INLINE_OPTIONS = `
        <select slot="options">
            <option value="k1">One</option>
            <option value="k2">Two</option>
        </select>`;
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
        assert.deepStrictEqual(
            options(await open(selectEl)),
            ['Nine'],
            'the dropdown serves the vocabulary the loader was updated with, not the slotted options',
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

        assert.deepStrictEqual(
            await loader.load('one'),
            [{ key: 'k1', label: 'One', metadata: undefined }],
            'a search after the shared fetch is answered from the vocabulary it stored',
        );
        assert.deepStrictEqual(
            await loader.exact('k1'),
            [{ key: 'k1', label: 'One', metadata: undefined }],
            'a key lookup after the shared fetch is answered from the vocabulary it stored',
        );
        assert.lengthOf(calls, 1, 'the served answers never hit the network again');
    });

    it('discards the outcome of a fetch superseded by an invalidation', async () => {
        const { calls, pending } = deferredHttp();
        const loader = remoteLoader({ url: '/v', prefetch: true });

        const stale = loader.prefetch().then(
            () => assert.fail('the superseded prefetch rejects'),
            (e) => String(e),
        );
        loader.invalidate();
        pending[0].resolve([['k1', 'Old']]);
        assert.match(
            await stale,
            /superseded/,
            'a caller waiting on a fetch that an invalidation detached rejects as superseded',
        );

        const fresh = loader.load('x');
        assert.lengthOf(calls, 2, 'after the invalidation the next question starts a new fetch');
        pending[1].resolve([['k2', 'New']]);
        await fresh;
        assert.deepStrictEqual(
            await loader.load('new'),
            [{ key: 'k2', label: 'New', metadata: undefined }],
            'the loader serves the vocabulary of the fetch that followed the invalidation',
        );
        assert.deepStrictEqual(await loader.exact('k1'), [], 'the superseded answer was never stored');
        assert.lengthOf(calls, 2, 'the stored vocabulary answers later questions without another fetch');
    });

    it('rejects a caller whose fetch an invalidation superseded, instead of crashing', async () => {
        const { calls, pending } = deferredHttp();
        const loader = remoteLoader({ url: '/v' });

        const superseded = loader.exact('k1').then(
            () => assert.fail('the superseded lookup rejects'),
            (e) => String(e),
        );
        loader.invalidate();
        pending[0].resolve([['k1', 'Old']]);
        assert.match(
            await superseded,
            /superseded/,
            'a lookup waiting on a fetch that an invalidation detached rejects as superseded',
        );

        const next = loader.exact('k1');
        pending[1].resolve([['k1', 'New']]);
        assert.deepStrictEqual(
            await next,
            [{ key: 'k1', label: 'New', metadata: undefined }],
            'the next caller is served by a fresh fetch',
        );
        assert.lengthOf(calls, 2, 'only the invalidation made the loader fetch a second time');
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
            attached(container);
            const selectEl = container.querySelector('ful-select');
            await Rendering.waitFor(selectEl);
            await opened();
            keydown(selectEl.querySelector('input'), 'ArrowDown', { altKey: true });
            await opened();

            const items = selectEl.querySelector('ful-dropdown').querySelectorAll('menu li');
            assert.deepStrictEqual(
                Array.from(items).map((li) => li.textContent.trim()),
                ['One'],
                'the fetched options are listed even though caching them in local storage failed',
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
                'an entry that is not a valid cached vocabulary is ignored and the fetched options are listed',
            );
            assert.lengthOf(calls, 1, 'the tampered entry counts as a miss, so the vocabulary is fetched');
        } finally {
            localStorage.removeItem('POST@/tampered');
            container.remove();
        }
    });
});

describe('Select reload, for a vocabulary that depends on another control', () => {
    const mount = async (attributes = '', body = '') => {
        const container = appended(`<ful-select ${attributes}>${body}</ful-select>`);
        const selectEl = container.querySelector('ful-select');
        await Rendering.waitFor(selectEl);
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
        return selectEl;
    };
    /**
     * One client for the whole test: the loader captures it at the upgrade, so a
     * second defineComponent would never reach the select. The endpoint changes its
     * mind by mutating `bodies`, which is what the dependency changing looks like
     */
    const stub = (bodies) => {
        const calls = [];
        registry.defineComponent('http-client', {
            request(method, url) {
                calls.push(url);
                return {
                    param() {
                        return this;
                    },
                    async fetchJson() {
                        return bodies[url] ?? [];
                    },
                };
            },
        });
        return calls;
    };
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };

    it('refetches the vocabulary and relabels the selection', async () => {
        const bodies = { '/v': [['k1', 'First label']] };
        const calls = stub(bodies);
        const selectEl = await mount('src="/v" value="k1"');
        await settle();
        assert.strictEqual(
            selectEl.entry.label,
            'First label',
            'the key is first labelled from the vocabulary fetched at mount',
        );

        bodies['/v'] = [['k1', 'Second label']];
        await selectEl.reload();
        await settle();

        assert.strictEqual(selectEl.entry.label, 'Second label', 'the cache was dropped, not served again');
        assert.isAbove(calls.length, 0, 'reload asks the endpoint again');
    });

    it('drops a selected key the new vocabulary no longer knows', async () => {
        const bodies = {
            '/v': [
                ['k1', 'One'],
                ['k2', 'Two'],
            ],
        };
        stub(bodies);
        const selectEl = await mount('src="/v" multiple value="k1,k2"');
        await settle();
        assert.deepStrictEqual(
            selectEl.value,
            ['k1', 'k2'],
            'both declared keys are known to the first vocabulary and stay selected',
        );

        bodies['/v'] = [['k2', 'Two']];
        await selectEl.reload();
        await settle();

        assert.deepStrictEqual(
            selectEl.value,
            ['k2'],
            'reload drops the selected key the new vocabulary no longer knows and keeps the other',
        );
        assert.lengthOf(selectEl.querySelectorAll('ful-badge'), 1, 'the chips follow the selection');
    });

    it('reloads a slotted vocabulary too, so a caller never asks which loader it has', async () => {
        const selectEl = await mount(
            'multiple value="k1,k2"',
            `<select slot="options"><option value="k1">One</option><option value="k2">Two</option></select>`,
        );
        await settle();

        await selectEl.withLoader((l) => l.update([{ key: 'k2', label: 'Two' }]));
        await selectEl.reload();
        await settle();

        assert.deepStrictEqual(selectEl.value, ['k2'], 'the key the new data drops goes with it');
    });

    it('does nothing but invalidate when nothing is selected', async () => {
        const calls = stub({ '/v': [['k1', 'One']] });
        const selectEl = await mount('src="/v"');
        await settle();
        const before = calls.length;

        await selectEl.reload();
        await settle();

        assert.strictEqual(selectEl.value, null, 'reload leaves an empty selection empty');
        assert.strictEqual(calls.length, before, 'an empty selection asks the endpoint nothing');
    });

    it('does not ask anything while the base applies the declared src', async () => {
        const calls = stub({ '/v': [['k1', 'One']] });
        await mount('src="/v"');
        await settle();

        assert.deepStrictEqual(
            calls,
            [],
            'applying the declared src at the upgrade asks nothing while no key is selected and nothing is preloaded',
        );
    });

    it('asks the new url when src changes, relabelling the selection without a change event', async () => {
        const calls = stub({ '/a': [['k1', 'From a']], '/b': [['k1', 'From b']] });
        const selectEl = await mount('src="/a" value="k1"');
        await settle();
        let changes = 0;
        selectEl.addEventListener('change', () => ++changes);

        selectEl.setAttribute('src', '/b');
        await settle();

        assert.strictEqual(
            selectEl.entry.label,
            'From b',
            'the selected key is labelled from the vocabulary at the new src',
        );
        assert.strictEqual(calls.at(-1), '/b', 'the loader built for the new src asks the new url');
        assert.strictEqual(changes, 0, 'a selection relabelled by a src change dispatches no change event');
    });

    it('drops a selected key the vocabulary at the new src does not know', async () => {
        stub({
            '/a': [
                ['k1', 'One'],
                ['k2', 'Two'],
            ],
            '/b': [['k2', 'Two']],
        });
        const selectEl = await mount('src="/a" multiple value="k1,k2"');
        await settle();

        selectEl.src = '/b';
        await settle();

        assert.deepStrictEqual(
            selectEl.value,
            ['k2'],
            'the key the vocabulary at the new src does not know is dropped from the selection',
        );
        assert.strictEqual(
            selectEl.getAttribute('src'),
            '/b',
            'writing the src property reflects it as the src attribute',
        );
        assert.strictEqual(selectEl.src, '/b', 'the src property reads back the written url');
    });

    it('points a chunked loader at the new src', async () => {
        const calls = stub({ '/a': [['k1', 'From a']], '/b': [['k1', 'From b']] });
        const selectEl = await mount('src="/a" mode="chunked" value="k1"');
        await settle();

        selectEl.src = '/b';
        await settle();

        assert.strictEqual(
            selectEl.entry.label,
            'From b',
            'the chunked key lookup at the new src labels the selection',
        );
        assert.include(calls, '/b', 'the rebuilt chunked loader asks the new url');
    });

    it('asks with the new method when method changes', async () => {
        const methods = [];
        registry.defineComponent('http-client', {
            request(method) {
                methods.push(method);
                return {
                    param() {
                        return this;
                    },
                    async fetchJson() {
                        return [['k1', 'One']];
                    },
                };
            },
        });
        const selectEl = await mount('src="/v" value="k1"');
        await settle();

        selectEl.method = 'GET';
        await settle();

        assert.strictEqual(
            methods.at(-1),
            'GET',
            'the loader rebuilt after the method change asks with the new method',
        );
        assert.strictEqual(
            selectEl.getAttribute('method'),
            'GET',
            'writing the method property reflects it as the method attribute',
        );
        assert.strictEqual(selectEl.method, 'GET', 'the method property reads back the written method');
    });

    it('closes an open dropdown when src changes, so it lists no stale options', async () => {
        stub({ '/a': [['k1', 'From a']], '/b': [['k2', 'From b']] });
        const selectEl = await mount('src="/a"');
        keydown(selectEl.querySelector('input'), 'ArrowDown', { altKey: true });
        await settle();
        assert.isTrue(selectEl.querySelector('ful-dropdown').shown, 'Alt+ArrowDown opens the dropdown');

        selectEl.src = '/b';
        await settle();

        assert.isFalse(
            selectEl.querySelector('ful-dropdown').shown,
            'a src change closes the open dropdown so it does not list options from the old url',
        );
    });

    it('ignores a write that does not change the url', async () => {
        const calls = stub({ '/v': [['k1', 'One']] });
        const selectEl = await mount('src="/v" value="k1"');
        await settle();
        const before = calls.length;

        selectEl.src = '/v';
        await settle();

        assert.strictEqual(calls.length, before, 'writing the same url does not rebuild the loader or reload');
    });

    it('builds the loader once and asks once when reconfigure changes src and method together', async () => {
        const requests = [];
        registry.defineComponent('http-client', {
            request(method, url) {
                requests.push(`${method} ${url}`);
                return {
                    param() {
                        return this;
                    },
                    async fetchJson() {
                        return [['k1', url]];
                    },
                };
            },
        });
        const selectEl = await mount('src="/a" value="k1"');
        await settle();
        requests.length = 0;

        await selectEl.reconfigure({ src: '/b', method: 'GET' });

        assert.deepStrictEqual(
            requests,
            ['GET /b'],
            'reconfigure rebuilds the loader for the new pair once and asks with both changes in one request',
        );
        assert.strictEqual(selectEl.entry.label, '/b', 'the selection is relabelled from the reconfigured endpoint');
        assert.strictEqual(selectEl.getAttribute('src'), '/b', 'reconfigure reflects the new src as the attribute');
        assert.strictEqual(
            selectEl.getAttribute('method'),
            'GET',
            'reconfigure reflects the new method as the attribute',
        );
    });

    it('keeps the attribute reconfigure leaves out, and removes the one it passes as null', async () => {
        stub({ '/b': [['k1', 'One']] });
        const selectEl = await mount('src="/a" method="GET"');
        await settle();

        await selectEl.reconfigure({ src: '/b' });
        assert.strictEqual(
            selectEl.getAttribute('method'),
            'GET',
            'an attribute left out of reconfigure keeps its value',
        );

        await selectEl.reconfigure({ method: null });
        assert.isFalse(selectEl.hasAttribute('method'), 'an attribute passed as null is removed');
        assert.strictEqual(
            selectEl.getAttribute('src'),
            '/b',
            'the src written by the earlier reconfigure stays when only the method is passed',
        );
    });

    it('dispatches change under notify when the reconfigured vocabulary drops a selected key', async () => {
        stub({
            '/a': [
                ['k1', 'One'],
                ['k2', 'Two'],
            ],
            '/b': [['k2', 'Two']],
        });
        const selectEl = await mount('src="/a" multiple value="k1,k2"');
        await settle();
        const details = [];
        selectEl.addEventListener('change', (e) => details.push(e.detail.value));

        await selectEl.reconfigure({ src: '/b' }, { notify: true });

        assert.deepStrictEqual(
            details,
            [['k2']],
            'notify dispatches one change carrying the selection that remains after the dropped key',
        );
    });

    it('dispatches nothing under notify when every selected key survives', async () => {
        stub({ '/a': [['k1', 'One']], '/b': [['k1', 'Uno']] });
        const selectEl = await mount('src="/a" value="k1"');
        await settle();
        let changes = 0;
        selectEl.addEventListener('change', () => ++changes);

        await selectEl.reconfigure({ src: '/b' }, { notify: true });

        assert.strictEqual(changes, 0, 'notify dispatches nothing when the reload drops no selected key');
        assert.strictEqual(selectEl.entry.label, 'Uno', 'a surviving key is relabelled from the new vocabulary');
    });

    it('dispatches nothing without notify, even when a selected key is dropped', async () => {
        stub({ '/a': [['k1', 'One']], '/b': [] });
        const selectEl = await mount('src="/a" value="k1"');
        await settle();
        let changes = 0;
        selectEl.addEventListener('change', () => ++changes);

        await selectEl.reconfigure({ src: '/b' });

        assert.strictEqual(selectEl.value, null, 'the key the new vocabulary does not know is dropped');
        assert.strictEqual(changes, 0, 'without notify a reconfigure dispatches no change even when it drops a key');
    });

    it('rejects reconfigure with what the lookup at the new src throws', async () => {
        registry.defineComponent('http-client', {
            request(method, url) {
                return {
                    param() {
                        return this;
                    },
                    async fetchJson() {
                        if (url === '/broken') {
                            throw new Error('down');
                        }
                        return [['k1', 'One']];
                    },
                };
            },
        });
        const selectEl = await mount('src="/a" value="k1"');
        await settle();

        const outcome = await selectEl.reconfigure({ src: '/broken' }).then(
            () => 'resolved',
            (e) => e.message,
        );

        assert.strictEqual(outcome, 'down', 'reconfigure rejects with the error the key lookup at the new src threw');
    });

    it('gives ful-filter-in the same live src', async () => {
        stub({ '/a': [['k1', 'From a']], '/b': [['k1', 'From b']] });
        const filterEl = appended(
            '<ful-filter-in src="/a" name="byKind" value="k1">Kind</ful-filter-in>',
        ).querySelector('ful-filter-in');
        await Rendering.waitFor(filterEl);
        await settle();

        filterEl.src = '/b';
        await settle();

        assert.deepStrictEqual(
            filterEl.criterion.operands,
            ['From b'],
            'ful-filter-in labels its criterion from the vocabulary at the new src',
        );
    });
});
