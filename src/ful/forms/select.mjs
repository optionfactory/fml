import { Attributes, Fragments, Localization, ParsedElement, Templates } from '../../ftl/index.mjs';
import { Claims } from '../claims.mjs';
import { Anchors } from '../disclosures/anchors.mjs';
import { Field } from './field.mjs';
import { VersionedLocalStorage } from '../storage.mjs';
import { Timing } from '../timing.mjs';

/**
 * @typedef {{ key: any, label: string, metadata: any }} SelectEntry
 */
/**
 * @typedef {{ request(method: string, url: string): any }} SelectHttpClient
 */
/**
 * A page of a vocabulary too large to load whole: its entries, how many entries
 * match in all when the server says so, and whether another page follows.
 * @typedef {{ entries: SelectEntry[], total: number|null, more: boolean }} SelectPage
 */

const byKeys = (entries, keys) => entries.filter(({ key }) => keys.some((r) => String(r) === String(key)));
const byLabel = (entries, needle) =>
    entries.filter(({ label }) => (label ?? '').toLowerCase().includes(needle?.toLowerCase() ?? ''));

/**
 * Fetches a select's whole vocabulary from a url and serves every later read
 * from it. Concurrent callers share one request, the options may be cached in
 * local storage under a revision, and invalidating discards both.
 */
class RemoteLoader {
    #http;
    #url;
    #method;
    #responseMapper;
    #prefetch;
    #revision;
    #data = null;
    /** @type {Promise<void>|null} */
    #inFlight = null;
    #configs = new Claims();
    /**
     * @param {{ http: SelectHttpClient, url: string, method: string, responseMapper: (response: any) => SelectEntry[], prefetch: boolean, revision: string|null }} conf
     * a null revision never reads nor writes local storage
     */
    constructor({ http, url, method, responseMapper, prefetch, revision }) {
        this.#http = http;
        this.#url = url;
        this.#method = method;
        this.#responseMapper = responseMapper;
        this.#prefetch = prefetch;
        this.#revision = revision;
    }
    /**
     * Fetches the vocabulary now when the loader was built with prefetch, and
     * does nothing otherwise.
     * @returns {Promise<void>}
     * @throws when the fetch fails, or when an invalidation supersedes it
     */
    async prefetch() {
        if (!this.#prefetch) {
            return;
        }
        await this.#ensureFetched();
    }
    /**
     * The entries whose key reads as the same text as one of the keys, in
     * vocabulary order.
     * @param {...any} keys
     * @returns {Promise<SelectEntry[]>}
     * @throws when the fetch fails, or when an invalidation supersedes it
     */
    async exact(...keys) {
        return byKeys(await this.#ensureFetched(), keys);
    }
    /**
     * The entries whose label contains the needle, ignoring case; every entry
     * for a nullish or empty needle.
     * @param {string|null} [needle]
     * @returns {Promise<SelectEntry[]>}
     * @throws when the fetch fails, or when an invalidation supersedes it
     */
    async load(needle) {
        return byLabel(await this.#ensureFetched(), needle);
    }
    /**
     * Drops the vocabulary held in memory so the next question refetches it,
     * which may still be answered from local storage under the same revision.
     * A fetch still in flight is detached: its outcome is neither served nor
     * stored, and the callers waiting on it reject.
     * @returns {Promise<void>}
     */
    async invalidate() {
        this.#configs.invalidate();
        this.#data = null;
        this.#inFlight = null;
    }
    async #ensureFetched() {
        if (this.#data === null) {
            if (this.#inFlight === null) {
                const claim = this.#configs.hold();
                this.#inFlight = RemoteLoader.#revisionedData(this.#http, this.#method, this.#url, this.#revision)
                    .then((raw) => {
                        if (!claim.stale) {
                            this.#data = this.#responseMapper(raw);
                        }
                    })
                    .finally(() => {
                        if (!claim.stale) {
                            this.#inFlight = null;
                        }
                    });
            }
            await this.#inFlight;
        }
        if (this.#data === null) {
            throw new Error('superseded by an invalidation');
        }
        return this.#data;
    }
    static async #revisionedData(http, method, url, revision) {
        const storageKey = `${method}@${url}`;
        if (revision !== null) {
            const data = VersionedLocalStorage.load(storageKey, revision);
            if (data !== undefined) {
                return data;
            }
        }
        const data = await http.request(method, url).fetchJson();
        if (revision !== null) {
            try {
                VersionedLocalStorage.save(storageKey, revision, data);
            } catch (/** @type any */ e) {
                console.warn('failed to cache the select options', e);
            }
        }
        return data;
    }
}

/** Asks the endpoint per query instead of fetching the vocabulary once, for a list too large to hold in memory. */
class PartialRemoteLoader {
    #http;
    #url;
    #method;
    #responseMapper;
    #pageSize;
    #totalMapper;
    /**
     * @param {{ http: SelectHttpClient, url: string, method: string, responseMapper: (response: any) => SelectEntry[],
     *     pageSize?: number|null, totalMapper?: ((response: any) => number|null)|null }} conf
     * `pageSize` asks for pages of that many entries, sent as `page` and `size` beside `s`; without it every
     * search is one request answered whole, as by an endpoint that knows no pages. `totalMapper` reads, from
     * a response, how many entries match in all; an answer that is not a number counts as unknown.
     */
    constructor({ http, url, method, responseMapper, pageSize = null, totalMapper = null }) {
        this.#http = http;
        this.#url = url;
        this.#method = method;
        this.#responseMapper = responseMapper;
        this.#pageSize = pageSize;
        this.#totalMapper = totalMapper;
    }
    /**
     * Does nothing, since nothing is held between queries.
     * @returns {Promise<void>}
     */
    async invalidate() {}
    /**
     * Asks the endpoint for the entries of the keys, sent as repeated `k`
     * parameters.
     * @param {...any} keys
     * @returns {Promise<SelectEntry[]>}
     * @throws when the request fails
     */
    async exact(...keys) {
        const response = await this.#http
            .request(this.#method, this.#url)
            .param('k', ...keys)
            .fetchJson();
        return this.#responseMapper(response);
    }
    /**
     * Asks the endpoint for the entries matching the needle, sent as the `s`
     * parameter; the filtering is the endpoint's.
     * @param {string|null} [needle]
     * @returns {Promise<SelectEntry[]>}
     * @throws when the request fails
     */
    async load(needle) {
        return (await this.page(needle ?? null, 0)).entries;
    }
    /**
     * Asks the endpoint for one page of the entries matching the needle. Another
     * page follows when the total says more entries match, or, with no total,
     * when this page came back full. Without a page size there is only page 0.
     * @param {string|null} needle
     * @param {number} page
     * @returns {Promise<SelectPage>}
     * @throws when the request fails
     */
    async page(needle, page) {
        let request = this.#http.request(this.#method, this.#url).param('s', needle);
        if (this.#pageSize) {
            request = request.param('page', page).param('size', this.#pageSize);
        }
        const response = await request.fetchJson();
        const entries = this.#responseMapper(response);
        const mapped = this.#totalMapper ? this.#totalMapper(response) : null;
        const total = Number.isFinite(mapped) ? mapped : null;
        const loaded = page * (this.#pageSize ?? 0) + entries.length;
        const more = !!this.#pageSize && (total === null ? entries.length === this.#pageSize : loaded < total);
        return { entries, total, more };
    }
}

/** Serves a select's options from an array held in memory, which is what the slotted `<option>` elements become. */
class InMemoryLoader {
    #data;
    /**
     * @param {SelectEntry[]} data
     */
    constructor(data) {
        this.#data = data;
    }
    /**
     * Replaces the vocabulary every later question is answered from.
     * @param {SelectEntry[]} data
     */
    update(data) {
        this.#data = data;
    }
    /**
     * Does nothing: the vocabulary is the data itself, which only update replaces.
     * @returns {Promise<void>}
     */
    async invalidate() {}
    /**
     * The entries whose key reads as the same text as one of the keys, in
     * vocabulary order.
     * @param {...any} keys
     * @returns {SelectEntry[]}
     */
    exact(...keys) {
        return byKeys(this.#data, keys);
    }
    /**
     * The entries whose label contains the needle, ignoring case; every entry
     * for a nullish or empty needle.
     * @param {string|null} [needle]
     * @returns {SelectEntry[]}
     */
    load(needle) {
        return byLabel(this.#data, needle);
    }
}

/**
 * Builds the select's loader from its attributes: the slotted options in
 * memory, or a remote or chunked loader over src. It is registered as the
 * `loaders:select` component.
 *
 * A component named by the select's `loader` attribute replaces this one: its
 * `create(el, conf)` answers an object with these methods, each answering
 * `{ key, label, metadata }` entries, directly or through a promise:
 *
 * - `load(needle)` answers the entries matching the typed text, all of them
 *   when the needle is empty, which is the search the list opens with
 * - `exact(...keys)` answers the entries for those keys, used to label a value
 *   assigned without going through the list; a key it leaves out is dropped
 *   from the selection
 * - `prefetch()`, optional, warms the vocabulary; the select calls it at the
 *   upgrade without waiting, and awaits it in `reload()`
 * - `invalidate()`, optional, drops whatever the loader holds, called by
 *   `reload()`
 *
 * An entry whose `metadata.disabled` is truthy is shown and cannot be picked,
 * with `metadata.reason`, when present, as the row's title.
 */
class SelectLoader {
    /** The entries a paged loader asks for at a time when no size is given: more than a dropdown shows at once, so a scroll does not ask at every row. */
    static PAGE_SIZE = 25;
    /**
     * Builds a loader from a plain configuration, reading no dom: `data` alone
     * is the in-memory vocabulary, a `url` is fetched whole or, under
     * `mode: 'chunked'` or `mode: 'paged'`, per query. A test, or a caller holding its own
     * configuration, builds a loader this way; `create` is the same thing with
     * an element's attributes parsed first.
     *
     * A remote loader fetches once and filters in memory, caching the response
     * in local storage under `method@url` when a revision is given; a chunked
     * one sends every search as `s` and every key lookup as `k`; a paged one
     * also asks for the matches a page at a time, `pageSize` of them
     * (`SelectLoader.PAGE_SIZE` by default). The response mapper
     * turns the parsed response body into entries, the total mapper reads how
     * many match in all.
     * @param {{ data?: SelectEntry[], url?: undefined, http?: undefined, method?: undefined, mode?: undefined, prefetch?: undefined, revision?: undefined, responseMapper?: undefined, pageSize?: undefined, totalMapper?: undefined }
     *     | { data?: undefined, url: string, http: SelectHttpClient, method?: string, mode?: string, prefetch?: boolean, revision?: string|null, responseMapper: (response: any) => SelectEntry[], pageSize?: number|null, totalMapper?: ((response: any) => number|null)|null }} conf
     * `method` defaults to POST
     * @returns {InMemoryLoader|PartialRemoteLoader|RemoteLoader}
     */
    static from({
        data,
        http,
        url,
        method = 'POST',
        mode,
        prefetch = false,
        revision = null,
        responseMapper,
        pageSize = null,
        totalMapper = null,
    }) {
        if (!url) {
            return new InMemoryLoader(data ?? []);
        }
        if ('chunked' === mode) {
            return new PartialRemoteLoader({ http, url, method, responseMapper, totalMapper });
        }
        if ('paged' === mode) {
            return new PartialRemoteLoader({
                http,
                url,
                method,
                responseMapper,
                pageSize: pageSize ?? SelectLoader.PAGE_SIZE,
                totalMapper,
            });
        }
        return new RemoteLoader({ http, url, method, responseMapper, prefetch, revision });
    }
    /**
     * Builds the loader an element's attributes describe. Without `src` the
     * vocabulary is the `<option>` elements of `conf.options`, each keyed by its
     * `value` attribute or else its trimmed text. With `src` the url is
     * requested through the `http-client` component with `method` (POST by
     * default): once on first use, or at the upgrade under `preload`, or per
     * query under `mode="chunked"` or `mode="paged"`. A `revision` caches the whole response in local storage; a
     * valueless one takes the `revision` component, calling it when it is a
     * function, and warns and does not cache when none is registered.
     *
     * The response becomes entries through `k-expr` and `l-expr` evaluated on
     * each row of `d-expr` (the response itself by default), with `m-expr` as
     * the metadata (the row by default); else through the `response-mapper`
     * component; else each row is read as a `[key, label, metadata]` array.
     *
     * Under `mode="paged"` the search also sends `page` and `size` (`page-size`,
     * 25 by default), the dropdown asking for the next page as its rows are
     * scrolled to the end, and the endpoint answers as one paging a
     * `ful-table` does, `{ data, size }` with `size` the number of entries
     * matching in all: `d-expr` defaults to `data` and `t-expr` to `size`.
     * `t-expr`, evaluated on the response, is how many entries match in all,
     * which the dropdown tells when it shows fewer; under `mode="chunked"` it
     * is read where it is declared.
     * @param {ParsedElement} el the element declaring the loader attributes
     * @param {{ options?: DocumentFragment }} conf
     * @returns {InMemoryLoader|PartialRemoteLoader|RemoteLoader}
     */
    static create(el, conf) {
        if (!el.declared('src')) {
            const els = Array.from(conf.options?.querySelectorAll('option') ?? []);
            return SelectLoader.from({
                data: els.map((e) => ({
                    key: e.getAttribute('value') ?? e.innerText.trim(),
                    label: e.innerText.trim(),
                    metadata: undefined,
                })),
            });
        }
        return SelectLoader.from({
            http: el.component('http-client'),
            url: el.declared('src'),
            method: el.declared('method') ?? 'POST',
            mode: el.declared('mode'),
            prefetch: el.declared('preload'),
            revision: SelectLoader.#revisionFrom(el),
            responseMapper: SelectLoader.#responseMapperFrom(el),
            pageSize: Number(el.declared('page-size')) || null,
            totalMapper: SelectLoader.#totalMapperFrom(el),
        });
    }
    static #revisionFrom(el) {
        const declared = el.declared('revision');
        if (declared !== '') {
            return declared;
        }
        const configured = el.component('revision');
        if (configured === undefined || configured === null) {
            console.warn(
                "a valueless revision asks the registry for one, and no 'revision' component is defined: the vocabulary will not be cached",
                el,
            );
            return null;
        }
        return typeof configured === 'function' ? configured() : configured;
    }
    static #totalMapperFrom(el) {
        const expression = el.declared('t-expr') ?? (el.declared('mode') === 'paged' ? 'size' : null);
        if (!expression) {
            return null;
        }
        return (response) => el._registry.evaluator().withOverlay(response).evaluateExpression(expression);
    }
    static #responseMapperFrom(el) {
        const paged = el.declared('mode') === 'paged';
        if (el.declared('k-expr') && el.declared('l-expr')) {
            return (response) => {
                const rows = el._registry
                    .evaluator()
                    .withOverlay(response)
                    .evaluateExpression(el.declared('d-expr') ?? (paged ? 'data' : 'self'));
                return rows.map((row) => {
                    const evaluator = el._registry.evaluator().withOverlay(row);
                    return {
                        key: evaluator.evaluateExpression(el.declared('k-expr')),
                        label: evaluator.evaluateExpression(el.declared('l-expr')),
                        metadata: evaluator.evaluateExpression(el.declared('m-expr') ?? 'self'),
                    };
                });
            };
        }
        if (el.declared('response-mapper')) {
            return el.component(el.declared('response-mapper'));
        }
        return (/** @type any */ response) =>
            (paged ? response.data : response).map((/** @type any[] */ [key, label, metadata]) => ({
                key,
                label,
                metadata,
            }));
    }
}

/**
 * The options popup of a select, a `<ful-dropdown>` the owner shows as a
 * popover: a spinner while the loader runs, a localized empty state, and a
 * `role="listbox"` menu of `role="option"` rows.
 *
 * The owner drives it and listens to it. A pick dispatches a bubbling
 * `change` whose detail is `{ index, entry }`, the row's index as a string
 * and the entry it was rendered from. The active row is announced by a
 * non-bubbling `activechange` whose detail is `{ id }`, the row's id or null
 * when none is active, for the owner to set `aria-activedescendant`. A
 * pressed row does not take the focus from the owner's control.
 */
class Dropdown extends ParsedElement {
    /**
     * `listbox` is the id given to the menu, so an owner can set
     * `aria-controls` before this element upgrades; a generated id otherwise.
     */
    static attributes = ['listbox'];
    /** The default slot, when not blank, is the row template in place of the `options` template. */
    static slots = true;
    static template = `
        <ful-spinner class="centered" role="status" hidden><span class="ful-sr-only">{{ #l10n:t('spinner.loading') }}</span></ful-spinner>
        <ful-empty data-ref="empty" aria-live="polite" hidden>{{ #l10n:t('dropdown.empty') }}</ful-empty>
        <menu tabindex="-1" role="listbox" hidden></menu>
        <ful-empty data-ref="more" aria-live="polite" hidden></ful-empty>
    `;
    /**
     * `options` renders one row per entry, each entry carrying its `index`
     * beside its own keys. A replacement must keep one `<li>` per entry, in
     * order, with the index as its `value`: picking reads the entry back from it.
     */
    static templates = {
        options: `
            <li data-tpl-each="self" data-tpl-selected="index == 0" data-tpl-value="index" role="option">
                {{ label }}
            </li>
        `,
    };
    /**
     * The rows a paged vocabulary loads into the list at most: past them the user is told to type, as
     * nobody scrolls through thousands of entries to find one.
     */
    static MAX_ROWS = 200;
    #spinner;
    #menu;
    #empty;
    #more;
    #optionstemplate;
    #options = new Map();
    #shows = new Claims();
    /**
     * the pages of the current show: how to ask for the next, the last asked for, and what the last answered
     * @type {{ next: ((page: number) => any)|null, page: number, more: boolean, total: number|null, loading: boolean }}
     */
    #paging = { next: null, page: 0, more: false, total: null, loading: false };
    /** @type {IntersectionObserver|null} watches the last row while another page follows */
    #endWatch = null;
    /** the keys selected when the dropdown was shown, which the rows of a later page are marked against */
    #keys = [];
    /**
     * @param {{ slots: Record<string, DocumentFragment> }} conf
     */
    render({ slots }) {
        const fragment = this.template().render();
        this.#optionstemplate = Fragments.isBlank(slots.default)
            ? this.template('options')
            : Templates.fromFragment(slots.default);
        this.#spinner = fragment.querySelector('ful-spinner');
        this.#empty = fragment.querySelector('[data-ref=empty]');
        this.#more = fragment.querySelector('[data-ref=more]');
        this.#menu = fragment.querySelector('menu');
        this.#menu.id = this.declared('listbox') || Attributes.uid('ful-listbox');
        this.#menu.addEventListener('mousedown', (evt) => {
            if (evt.target.closest('li')) {
                evt.preventDefault();
            }
        });
        this.#menu.addEventListener('click', (evt) => {
            evt.stopPropagation();
            const li = evt.target.closest('li');
            if (!li) {
                this.hide();
                return;
            }
            if (li.matches('[aria-disabled="true"]')) {
                return;
            }
            this.#change(li);
        });
        this.replaceChildren(fragment);
    }
    #selected() {
        if (!this.#menu || this.#menu.hidden) {
            return null;
        }
        return this.#menu.querySelector('li[selected]') ?? this.#menu.querySelector('li:not([aria-disabled="true"])');
    }
    #highlight(li) {
        if (!li) {
            this.#activated(null);
            return;
        }
        for (const el of this.#menu.querySelectorAll('li')) {
            el.toggleAttribute('selected', el === li);
        }
        li.id ||= Attributes.uid('ful-option');
        this.#activated(li.id);
        li.scrollIntoView({
            block: 'nearest',
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
    }
    /**
     * Picks the highlighted row, or the first enabled one when none is: hides
     * the dropdown and dispatches `change`. Does nothing when the highlighted
     * row is disabled, when no row is enabled, or while a search is loading
     * and the rows are hidden.
     */
    acceptSelection() {
        const selected = this.#selected();
        if (!selected || selected.matches('[aria-disabled="true"]')) {
            return;
        }
        this.#change(selected);
    }
    /**
     * Renders the entries as rows and highlights the first one whose key is
     * picked, else the row the template marked `selected`, else the first
     * enabled row. A row is marked `picked` and
     * `aria-selected="true"` when its key reads as the same text as one of the keys, and
     * `aria-disabled="true"` when its `metadata.disabled` is truthy, titled with
     * `metadata.reason`. No entries shows the empty state instead of the menu.
     * @param {SelectEntry[]} values
     * @param {any[]} [keys] the keys currently selected
     * @throws {Error} when values is undefined
     */
    update(values, keys = []) {
        if (values === undefined) {
            throw new Error('null data');
        }
        // rows rendered from outside a show are the whole list: no page follows them
        this.#endWatch?.disconnect();
        this.#paging.more = false;
        this.#paging.total = null;
        this.#more.setAttribute('hidden', '');
        this.#options = new Map();
        this.#menu.replaceChildren(this.#rows(values, keys));
        this.#empty.toggleAttribute('hidden', values.length !== 0);
        this.#menu.toggleAttribute('hidden', values.length === 0);
        // a fresh list starts at its top at once: gliding there from where the previous list was scrolled
        // would show its last row on the way and have the next page asked
        this.#menu.scrollTop = 0;
        const current = values.findIndex(({ key }) => keys.some((r) => String(r) === String(key)));
        this.#highlight(
            current >= 0
                ? this.#menu.children[current]
                : (this.#menu.querySelector('li[selected]:not([aria-disabled="true"])') ??
                      this.#menu.querySelector('li:not([aria-disabled="true"])')),
        );
    }
    /**
     * The rows of the entries, numbered after those already in the list.
     * @param {SelectEntry[]} values
     * @param {any[]} keys the keys currently selected
     * @returns {DocumentFragment}
     */
    #rows(values, keys) {
        const offset = this.#options.size;
        for (const [i, v] of values.entries()) {
            this.#options.set(String(offset + i), v);
        }
        const fragment = this.#optionstemplate
            .withOverlay(values.map((entry, i) => ({ index: offset + i, ...entry })))
            .render();
        for (const [index, li] of [...fragment.children].entries()) {
            const entry = values[index];
            const picked = keys.some((r) => String(r) === String(entry?.key));
            li.toggleAttribute('picked', picked);
            li.setAttribute('aria-selected', picked ? 'true' : 'false');
            if (offset > 0) {
                li.removeAttribute('selected');
            }
            const disabled = !!entry?.metadata?.disabled;
            if (disabled) {
                li.setAttribute('aria-disabled', 'true');
            } else {
                li.removeAttribute('aria-disabled');
            }
            if (disabled && entry.metadata.reason) {
                li.setAttribute('title', String(entry.metadata.reason));
            } else {
                li.removeAttribute('title');
            }
        }
        return fragment;
    }
    /**
     * Says, under the rows, that more entries match than the list shows: how many when the total is
     * known. While another page is on its way it says nothing.
     */
    #tellMore() {
        const { more, total, loading } = this.#paging;
        const shown = this.#options.size;
        const capped = more && shown >= Dropdown.MAX_ROWS;
        const hidden = total !== null ? total > shown && (!more || capped) : capped;
        if (loading || !hidden) {
            this.#more.setAttribute('hidden', '');
            return;
        }
        this.#more.textContent =
            total !== null
                ? Localization.of().t('dropdown.more', { loaded: shown, total })
                : Localization.of().t('dropdown.more-unknown');
        this.#more.removeAttribute('hidden');
    }
    /** Watches the last row while another page follows and the list has room for it. */
    #watchEnd() {
        this.#endWatch?.disconnect();
        const last = this.#menu.lastElementChild;
        if (!this.#paging.more || !last || this.#options.size >= Dropdown.MAX_ROWS) {
            return;
        }
        this.#endWatch ??= new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting && e.target === this.#menu.lastElementChild)) {
                    this.#loadNext();
                }
            },
            { root: this.#menu },
        );
        this.#endWatch.observe(last);
    }
    /** Appends the next page to the rows, leaving the highlight where it is. */
    async #loadNext() {
        const paging = this.#paging;
        if (paging.loading || !paging.more || !paging.next) {
            return;
        }
        const claim = this.#shows.hold();
        paging.loading = true;
        this.#tellMore();
        try {
            const answer = Dropdown.#asPage(await paging.next(paging.page + 1));
            if (claim.stale) {
                return;
            }
            paging.page += 1;
            paging.more = answer.more;
            paging.total = answer.total;
            this.#menu.append(this.#rows(answer.entries, this.#keys));
        } catch (e) {
            if (claim.stale) {
                return;
            }
            // the rows already shown stay usable: the next scroll to the end asks again
            console.warn('ful-dropdown: the next page could not be loaded', e);
        } finally {
            if (!claim.stale) {
                paging.loading = false;
                this.#tellMore();
                this.#watchEnd();
            }
        }
    }
    /**
     * What a loader answers, as a page: a plain array is the whole vocabulary of the search.
     * @param {SelectEntry[]|SelectPage} answer
     * @returns {SelectPage}
     */
    static #asPage(answer) {
        return Array.isArray(answer) ? { entries: answer, total: null, more: false } : answer;
    }
    #change(target) {
        const index = target.getAttribute('value');
        const entry = this.#options.get(index);
        this.hide();
        this.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                cancelable: false,
                detail: { index, entry },
            }),
        );
    }
    /**
     * Closes the popover, if open, and announces that no row is active. A
     * `show` still waiting on its loader is superseded: its outcome is neither
     * rendered nor thrown.
     */
    hide() {
        this.#shows.invalidate();
        this.#endWatch?.disconnect();
        this.#paging = { next: null, page: 0, more: false, total: null, loading: false };
        if (this.matches(':popover-open')) {
            this.hidePopover();
        }
        this.#activated(null);
    }
    #activated(id) {
        this.dispatchEvent(new CustomEvent('activechange', { bubbles: false, cancelable: false, detail: { id } }));
    }
    /**
     * Whether the popover is open.
     * @returns {boolean}
     */
    get shown() {
        return this.matches(':popover-open');
    }
    /**
     * Opens the popover with the spinner showing, then renders what the loader
     * answers as `update` does. A show overtaken by a later `show` or by `hide`
     * before its loader settles leaves the dropdown alone and resolves, even
     * when its loader rejected.
     *
     * The loader is called with the page it is asked for, 0 first. Answering an
     * array, it gives the whole vocabulary of the search; answering a
     * `SelectPage` whose `more` is true, it is asked for the next page each time
     * the rows are scrolled to the end, and its rows are appended, up to
     * `Dropdown.MAX_ROWS`. Under the rows the dropdown says when more entries
     * match than it shows.
     * @param {(page: number) => SelectEntry[]|SelectPage|Promise<SelectEntry[]|SelectPage>} loader
     * @param {any[]} [keys] the keys currently selected
     * @returns {Promise<void>}
     * @throws what the loader threw, after hiding the dropdown, when this show
     * is still the current one
     */
    async show(loader, keys = []) {
        const claim = this.#shows.take();
        this.#endWatch?.disconnect();
        this.#paging = { next: loader, page: 0, more: false, total: null, loading: false };
        this.#keys = keys;
        if (!this.matches(':popover-open')) {
            this.showPopover();
        }
        this.#menu.setAttribute('hidden', '');
        this.#more.setAttribute('hidden', '');
        this.#spinner.removeAttribute('hidden');
        try {
            const answer = Dropdown.#asPage(await loader(0));
            if (claim.stale) {
                return;
            }
            this.update(answer.entries, keys);
            this.#paging.more = answer.more;
            this.#paging.total = answer.total;
            this.#tellMore();
            this.#watchEnd();
        } catch (/** @type any */ e) {
            if (claim.stale) {
                return;
            }
            this.hide();
            throw e;
        } finally {
            if (!claim.stale) {
                this.#spinner.setAttribute('hidden', '');
            }
        }
    }
    /**
     * Moves the highlight to the next or previous enabled row when the dropdown
     * is shown, staying put at the edge and while a search is loading, and
     * shows it otherwise.
     * @param {boolean} forward
     * @param {(page: number) => SelectEntry[]|SelectPage|Promise<SelectEntry[]|SelectPage>} loader used only to show
     * @param {any[]} [keys] the keys currently selected, used only to show
     * @returns {Promise<void>}
     * @throws what `show` throws
     */
    async moveOrShow(forward, loader, keys = []) {
        if (this.shown) {
            const selected = this.#selected();
            const candidate = selected?.[`${forward ? 'next' : 'previous'}ElementSibling`];
            const target = candidate ? this.#walk(candidate, forward) : null;
            if (selected && target) {
                this.#highlight(target);
            }
            return;
        }
        await this.show(loader, keys);
    }
    #walk(from, forward) {
        for (let li = from; li; li = li[`${forward ? 'next' : 'previous'}ElementSibling`]) {
            if (!li.matches('[aria-disabled="true"]')) {
                return li;
            }
        }
        return null;
    }
    /**
     * Highlights the first enabled row, or the last one. Does nothing while a
     * search is loading and the rows are hidden.
     * @param {boolean} first
     */
    jump(first) {
        if (this.#menu.hidden) {
            return;
        }
        const edge = first ? this.#menu.firstElementChild : this.#menu.lastElementChild;
        const target = this.#walk(edge, first);
        if (target) {
            this.#highlight(target);
        }
    }
    /**
     * Moves the highlight by as many enabled rows as the menu shows at once,
     * one when that cannot be measured, stopping at the last enabled row.
     * Does nothing while a search is loading.
     * @param {boolean} forward
     */
    page(forward) {
        const selected = this.#selected();
        if (!selected) {
            return;
        }
        let target = selected;
        for (let i = 0; i !== this.#page(); ++i) {
            const next = this.#walk(target[`${forward ? 'next' : 'previous'}ElementSibling`], forward);
            if (!next) {
                break;
            }
            target = next;
        }
        this.#highlight(target);
    }
    #page() {
        const first = this.#menu.firstElementChild;
        if (!first || first.offsetHeight === 0) {
            return 1;
        }
        return Math.max(1, Math.trunc(this.#menu.clientHeight / first.offsetHeight));
    }
}

/**
 * A `<ful-select>`: a combobox over a loader's vocabulary of
 * `{ key, label, metadata }` entries, holding one key or, under `multiple`,
 * several. Typing filters the list, opening it from rest offers the whole
 * vocabulary, and the keyboard follows the combobox pattern: arrows move and
 * open (Alt+ArrowDown opens, Alt+ArrowUp closes), Home, End, PageUp and
 * PageDown move in the open list, Enter accepts the highlighted entry or,
 * with the list closed, submits the form, Escape reverts the edit, and Tab
 * or leaving the field commits it. Emptying the text of a single select and
 * leaving the field clears it. Backspace with the caret at the start removes
 * the last entry, and ArrowLeft there moves the focus to the badges of a
 * multiple select, where Enter, Space, Backspace or Delete remove one.
 *
 * Slots: the default one is the label, `info` sits beside it, `before` and
 * `after` are affixes around the control, `options` holds the `<option>`
 * elements of an in-memory vocabulary, `dropdown` replaces the dropdown's
 * row template and `items` the `items` template.
 *
 * Every change of the selection made through the element dispatches a
 * bubbling `change` whose detail carries `value` and `entry`, as the getters
 * answer them; assigning `value` dispatches none.
 */
class Select extends Field {
    /**
     * Read once at the upgrade, so a later write changes nothing: `name`,
     * `loader` (the component building the loader, `loaders:select` by
     * default), `k-type` (`number` or `boolean` coerce the keys, strings
     * otherwise), and the loader configuration `SelectLoader.create` reads,
     * but for `src` and `method`, which stay live.
     */
    static attributes = [
        'name',
        'loader',
        'k-type',
        'mode',
        'preload:presence',
        'revision',
        'k-expr',
        'l-expr',
        'd-expr',
        'm-expr',
        'response-mapper',
        'page-size',
        't-expr',
    ];
    /**
     * Beside the field's claims: `multiple`, `item-list`, `value` as a comma
     * separated list of keys, trimmed, whether or not the select is multiple,
     * and `src` and `method`.
     */
    static observed = ['multiple:presence', 'item-list:presence', 'value:csv', 'src', 'method'];
    /**
     * Reads a present but empty `value` attribute of a single select as the
     * empty key, which an `<option value="">` can carry; a multiple select reads
     * it as no keys.
     * @param {string} attr
     * @param {string|null} str
     * @returns {any}
     * @throws when the class declares no such attribute
     */
    unmarshal(attr, str) {
        if (attr === 'value' && str === '' && !this.hasAttribute('multiple')) {
            return [''];
        }
        return super.unmarshal(attr, str);
    }
    static slots = true;
    static template = `
        <label>{{{{ slots.default }}}}</label>
        {{{{ slots.info }}}}
        <ful-control-group>
            <ful-affix data-tpl-if="slots.before">{{{{ slots.before }}}}</ful-affix>
            <ful-control>
                <input type="text" form="" autocomplete="off" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false">
            </ful-control>
            <ful-affix data-tpl-if="slots.after">{{{{ slots.after }}}}</ful-affix>
            <ful-dropdown popover="manual">{{{{ slots.dropdown }}}}</ful-dropdown>
        </ful-control-group>
        <ful-item-list></ful-item-list>
        <ful-field-error></ful-field-error>
    `;
    /**
     * `items` renders the selection below the control, shown under `item-list`,
     * over `entries`, the selected entries in order. A replacement must keep one
     * `<ful-item>` per entry, in order, each with a `<button>` that removes it.
     */
    static templates = {
        items: `
            <ful-item data-tpl-each="entries" data-tpl-var="entry" data-tpl-data-key="entry.key">
                <div><span>{{ entry.label }}</span><button type="button" data-tpl-aria-label="#l10n:t('select.remove')"><ful-icon name="x-lg" aria-hidden="true"></ful-icon></button></div>
            </ful-item>
        `,
    };
    #loader;
    /** @type {{ src: string|null, method: string|null }} */
    #builtFrom = { src: null, method: null };
    #options;
    #control;
    #ddmenu;
    #input;
    #label;
    #items;
    #itemstemplate;
    #multiple;
    #warnedComma = false;
    #values = new Map();
    #assignments = new Claims();
    #editing = false;
    #dload;
    #abortdload;
    /**
     * @param {{ slots: Record<string, DocumentFragment> }} conf
     * @returns {{ fragment: DocumentFragment, control: HTMLInputElement, error: Element|null, label: Element|null }}
     */
    _build({ slots }) {
        const name = this.declared('name');
        this.#options = slots.options;
        this.#buildLoader();

        this.#multiple = this.declared('multiple');
        this.#loader.prefetch?.()?.catch((/** @type any */ e) => {
            console.warn('failed to prefetch select options', this, 'reason:', e);
        });
        const fragment = this.template().withOverlay({ slots, name }).render();
        this.#input = fragment.querySelector('ful-control > input');
        this.#label = fragment.querySelector('label');
        this.#items = fragment.querySelector('ful-item-list');
        this.#itemstemplate =
            slots.items && !Fragments.isBlank(slots.items) ? Templates.fromFragment(slots.items) : null;
        Attributes.forward('input-', this, this.#input);
        this.#control = fragment.querySelector('ful-control');

        this.#ddmenu = fragment.querySelector('ful-dropdown');
        const listbox = Attributes.uid('ful-listbox');
        this.#ddmenu.setAttribute('listbox', listbox);
        this.#input.setAttribute('aria-controls', listbox);
        this.#ddmenu.addEventListener('beforetoggle', (/** @type any */ e) => {
            const open = e.newState === 'open';
            this.#input.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (!open) {
                this.#input.removeAttribute('aria-activedescendant');
            }
        });
        this.#ddmenu.addEventListener('activechange', (/** @type any */ e) => {
            Attributes.set(this.#input, 'aria-activedescendant', e.detail.id);
        });
        const group = /** @type {HTMLElement} */ (fragment.querySelector('ful-control-group'));
        Anchors.wire(group, this.#ddmenu, { prefix: 'ful-select', stretch: true });
        [this.#dload, this.#abortdload] = Timing.throttle(400, () => this.#open());
        this.#wireChrome();
        this.#wireChips();
        this.#wireInput();
        this.#wireSelection();
        return {
            fragment,
            control: this.#input,
            error: fragment.querySelector('ful-field-error'),
            label: this.#label,
        };
    }
    /**
     * Pointer interaction: the element toggles the dropdown, the item list's
     * remove buttons and the control's badges drop their entry. A click on the
     * label is left to the click the browser forwards to the input, which
     * toggles once.
     */
    #wireChrome() {
        this.addEventListener('click', (/** @type any */ e) => {
            if (!this._interactive() || this.#label.contains(e.target)) {
                return;
            }
            const elsewhere = e.target.closest('button, [role="button"], a[href], input, select, textarea');
            if (elsewhere && elsewhere !== this.#input) {
                return;
            }
            if (this.#ddmenu.shown) {
                this.#abortdload();
                this.#close();
                return;
            }
            this.#input.focus();
            this.#dload();
        });
        this.#items.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!e.target.closest('button')) {
                return;
            }
            if (!this._interactive()) {
                return;
            }
            this.#removeKeyAt([...this.#items.children].indexOf(e.target.closest('ful-item')));
        });
        this.#control.addEventListener('click', (e) => {
            const badge = e.target instanceof Element ? e.target.closest('ful-badge') : null;
            if (!badge) {
                return;
            }
            e.stopPropagation();
            this.#removeBadge(badge);
        });
    }
    /**
     * Keyboard interaction over the chips: Enter/Space/Backspace/Delete remove,
     * arrows move between badges and the input, Escape returns to the input.
     */
    #wireChips() {
        this.addEventListener('keydown', (/** @type any */ e) => {
            const badge = e.target instanceof Element ? e.target.closest('ful-badge') : null;
            if (badge) {
                this.#chipKeydown(e, badge);
                return;
            }
            if (
                'ArrowLeft' === e.code &&
                e.target === this.#input &&
                this.#input.selectionStart === 0 &&
                this.#input.selectionEnd === 0
            ) {
                this.#badges().at(-1)?.focus();
            }
        });
    }
    #wireInput() {
        this.#input.addEventListener('change', (e) => {
            e.stopPropagation();
        });
        this.#input.addEventListener('focus', () => {
            if (this.#editing) {
                return;
            }
            this.#input.select();
        });
        this.#input.addEventListener('blur', (e) => {
            e.stopPropagation();
            if (e.relatedTarget && this.contains(e.relatedTarget)) {
                return;
            }
            this.#abortdload();
            this.#close(true);
        });
        this.#input.addEventListener('keydown', (e) => {
            if (!this._interactive()) {
                return;
            }
            this.#comboboxKeydown(e);
        });
        this.#input.addEventListener('input', (e) => {
            e.stopPropagation();
            if (!this._interactive()) {
                return;
            }
            this.#editing = true;
            this.#dload();
        });
    }
    #wireSelection() {
        this.#ddmenu.addEventListener('change', (e) => {
            e.stopPropagation();
            this.#abortdload();
            if (!this._interactive()) {
                this.#close();
                return;
            }
            if (!this.#multiple) {
                this.#values.clear();
            }
            this.#editing = false;
            this.#values.set(this.#coerceKey(e.detail.entry.key), e.detail.entry);
            this.#changed();
            this.#input.focus();
            this.#ddmenu.hide();
            if (!this.#multiple) {
                this.#input.select();
            }
        });
    }
    /**
     * Hands the loader to the callback, for runtime changes such as
     * `update(entries)` on an in-memory loader.
     * @template T
     * @param {(loader: any) => T|Promise<T>} fn
     * @returns {Promise<T>} what the callback answers
     */
    async withLoader(fn) {
        return await fn(this.#loader);
    }
    /**
     * Drops whatever the loader is holding, awaits its prefetch (which fetches
     * again when the select declares `preload`), and asks it about the current
     * selection again, which is what a select whose vocabulary depends on
     * another control needs when that control changes. A key the loader no
     * longer knows is dropped from the selection, so a value invalidated by the
     * change does not survive it, and one it still knows keeps its place with a
     * fresh label. The badges and items follow, an open dropdown runs its
     * search again, and no `change` is dispatched.
     *
     * Where the vocabulary lives at a different address, write `src` or call
     * `reconfigure`, which build the loader for the new url and reload.
     * @returns {Promise<void>}
     * @throws what the loader's invalidate, prefetch, key lookup or search
     * throws
     */
    async reload() {
        await this.#loader.invalidate?.();
        await this.#loader.prefetch?.();
        const keys = [...this.#values.keys()];
        if (keys.length !== 0) {
            await this.#resolve(keys, this.#assignments.take());
        }
        if (this.#ddmenu.shown) {
            await this.#open();
        }
    }
    /**
     * The url the loader asks for the vocabulary, reflected as the `src`
     * attribute.
     * @returns {string|null}
     */
    get src() {
        return this.getAttribute('src');
    }
    /**
     * Points the select at another vocabulary: the dropdown closes, the loader
     * is built again through its component's `create`, as at the render, and
     * the select reloads as `reload()` does, so a selected key the new
     * vocabulary does not know is dropped and one it knows is labelled again,
     * with no `change` dispatched. A write that does not change the url does
     * nothing.
     *
     * The reload is not awaited: a failed fetch or lookup surfaces as an
     * unhandled rejection.
     * @param {string|null|undefined} value null or undefined removes the url,
     * which the default loader answers with the slotted options
     */
    set src(value) {
        this.reflectTo('src', value ?? null);
        if (this.#followAttributes()) {
            this.reload();
        }
    }
    /**
     * The http method the default loader sends, reflected as the `method`
     * attribute; `POST` when absent.
     * @returns {string|null}
     */
    get method() {
        return this.getAttribute('method');
    }
    /**
     * Changes the http method the way `src` changes the url: the loader is
     * built again and the select reloads.
     * @param {string|null|undefined} value
     */
    set method(value) {
        this.reflectTo('method', value ?? null);
        if (this.#followAttributes()) {
            this.reload();
        }
    }
    /**
     * Writes `src` and `method` together and reloads once: the loader is built
     * again for the pair when either changed, as a single write of either does,
     * and the select then reloads as `reload()` does, whether or not they
     * changed.
     *
     *     citta.addEventListener('change', () => {
     *         cap.reconfigure({ src: `/api/cap?citta=${citta.value}` }, { notify: true });
     *     });
     * @param {{ src?: string|null, method?: string|null }} attributes a name
     * left out keeps its value, null removes the attribute
     * @param {{ notify?: boolean }} [options] `notify` dispatches `change` when
     * the reload dropped a selected key, so a form or a table filtered by the
     * select sees the value it lost; nothing is dispatched otherwise
     * @returns {Promise<void>} settling once the reload has
     * @throws what the loader's invalidate, prefetch or key lookup throws
     */
    async reconfigure(attributes, { notify = false } = {}) {
        for (const name of ['src', 'method']) {
            if (name in attributes) {
                this.reflectTo(name, attributes[name] ?? null);
            }
        }
        this.#followAttributes();
        const before = [...this.#values.keys()];
        await this.reload();
        const after = [...this.#values.keys()];
        if (notify && after.length !== before.length) {
            this._notifyChange({ entry: this.entry });
        }
    }
    #buildLoader() {
        this.#builtFrom = { src: this.getAttribute('src'), method: this.getAttribute('method') };
        this.#loader = this.component(this.declared('loader') ?? 'loaders:select').create(this, {
            options: this.#options,
        });
    }
    /** @returns {boolean} whether the loader was built again */
    #followAttributes() {
        if (
            this.getAttribute('src') === this.#builtFrom.src &&
            this.getAttribute('method') === this.#builtFrom.method
        ) {
            return false;
        }
        this.#abortdload();
        this.#close();
        this.#buildLoader();
        return true;
    }
    #badges() {
        return Array.from(this.#control.querySelectorAll(':scope > ful-badge'));
    }
    #removeBadge(badge) {
        if (!this._interactive()) {
            return;
        }
        this.#removeKeyAt(this.#badges().indexOf(badge));
    }
    /** Badges and item list entries share the selection's order, so one index serves both. */
    #removeKeyAt(index) {
        const key = Array.from(this.#values.keys())[index];
        if (key === undefined) {
            return;
        }
        this.#values.delete(key);
        this.#changed();
    }
    #chipKeydown(e, badge) {
        switch (e.code) {
            case 'NumpadEnter':
            case 'Enter':
            case 'Space':
            case 'Backspace':
            case 'Delete': {
                e.preventDefault();
                this.#removeBadge(badge);
                this.#input.focus();
                break;
            }
            case 'ArrowLeft': {
                e.preventDefault();
                (this.#badges()[this.#badges().indexOf(badge) - 1] ?? this.#input).focus();
                break;
            }
            case 'ArrowRight': {
                e.preventDefault();
                (this.#badges()[this.#badges().indexOf(badge) + 1] ?? this.#input).focus();
                break;
            }
            case 'Escape': {
                this.#input.focus();
                break;
            }
        }
    }
    /**
     * The combobox keyboard contract: arrows browse and move, Home/End and
     * PageUp/PageDown navigate the open list, Enter accepts or submits,
     * Escape/Tab close, Backspace at the caret's leftmost spot drops the last
     * entry.
     */
    #comboboxKeydown(e) {
        switch (e.code) {
            case 'ArrowUp':
            case 'ArrowDown': {
                e.preventDefault();
                this.#arrowKeydown(e);
                break;
            }
            case 'Home': {
                if (this.#ddmenu.shown) {
                    e.preventDefault();
                    this.#ddmenu.jump(true);
                }
                break;
            }
            case 'End': {
                if (this.#ddmenu.shown) {
                    e.preventDefault();
                    this.#ddmenu.jump(false);
                }
                break;
            }
            case 'PageDown':
            case 'PageUp': {
                if (this.#ddmenu.shown) {
                    e.preventDefault();
                    this.#ddmenu.page('PageDown' === e.code);
                }
                break;
            }
            case 'Escape': {
                this.#abortdload();
                this.#close();
                break;
            }
            case 'NumpadEnter':
            case 'Enter': {
                if (!this.#ddmenu.shown) {
                    return;
                }
                e.preventDefault();
                this.#abortdload();
                this.#editing = false;
                this.#display();
                this.#ddmenu.acceptSelection();
                break;
            }
            case 'Backspace': {
                if (this.#input.selectionStart === 0 && this.#input.selectionEnd === 0) {
                    this.#removeKeyAt(this.#values.size - 1);
                }
                break;
            }
            case 'Tab': {
                this.#abortdload();
                this.#close(true);
                break;
            }
        }
    }
    #arrowKeydown(e) {
        const forward = 'ArrowDown' === e.code;
        if (e.altKey) {
            if (forward && !this.#ddmenu.shown) {
                this.#open();
            } else if (!forward && this.#ddmenu.shown) {
                this.#abortdload();
                this.#close();
            }
            return;
        }
        this.#ddmenu.moveOrShow(forward, this.#search(), [...this.#values.keys()]);
    }
    /**
     * @param {boolean} [commit] whether the user is leaving the field, which
     * only a blur or a Tab is: an emptied single select is then cleared
     */
    #close(commit = false) {
        this.#ddmenu.hide();
        const cleared =
            commit && this.#editing && !this.#multiple && this.#input.value === '' && this.#values.size !== 0;
        this.#editing = false;
        if (cleared) {
            this.#values.clear();
            this.#changed();
        }
        this.#display();
    }
    #open() {
        return this.#ddmenu.show(this.#search(), [...this.#values.keys()]);
    }
    /**
     * What the dropdown asks for the rows of the current query: the loader's pages when it has them,
     * else the whole of what it answers.
     * @returns {(page: number) => SelectEntry[]|SelectPage|Promise<SelectEntry[]|SelectPage>}
     */
    #search() {
        const query = this.#query();
        const loader = this.#loader;
        return typeof loader.page === 'function' ? (page) => loader.page(query, page) : () => loader.load(query);
    }
    #query() {
        return this.#editing ? this.#input.value : '';
    }
    /**
     * The text typed to search the vocabulary: what the dropdown was last
     * asked to match. `''` while the field is not being searched, its control
     * then showing the selection's label rather than a query.
     * @returns {string}
     */
    get query() {
        return this.#query();
    }
    #display() {
        const entry = this.#values.values().next().value;
        this.#input.value = this.#multiple ? '' : (entry?.label ?? '');
    }
    #selection() {
        return [...this.#values.values()];
    }
    #changed() {
        this.#syncBadges();
        this._notifyChange({ entry: this.entry });
    }
    #syncBadges() {
        const badges = this.#multiple
            ? Array.from(this.#values.entries()).map(([k, entry], index) => {
                  const b = document.createElement('ful-badge');
                  b.setAttribute('role', 'button');
                  b.setAttribute('tabindex', index === 0 ? '0' : '-1');
                  b.setAttribute('value', k);
                  b.innerText = entry.label;
                  return b;
              })
            : [];
        for (const b of this.#control.querySelectorAll(':scope > ful-badge')) {
            b.remove();
        }
        this.#input.before(...badges);
        if (!this.#editing) {
            this.#display();
        }
        this.#items.replaceChildren();
        (this.#itemstemplate ?? this.template('items'))
            .withOverlay({ entries: this.#selection() })
            .renderTo(this.#items);
    }
    /**
     * The selection is a Map keyed strictly, and keys arrive both as attribute
     * text and as whatever a loader's endpoint carries: every key entering it
     * goes through here. A key that does not decode is left as it is.
     */
    #coerceKey(k) {
        switch (this.declared('k-type')) {
            case 'number': {
                const n = k === '' ? Number.NaN : Number(k);
                return Number.isNaN(n) ? k : n;
            }
            case 'boolean': {
                if (k === true || k === 'true') {
                    return true;
                }
                if (k === false || k === 'false') {
                    return false;
                }
                return k;
            }
            default:
                return String(k);
        }
    }
    /**
     * Selects the keys, coerced by `k-type`: a key, an array of keys, or null or
     * undefined for none. The empty string is a key like any other, and a
     * single select keeps only the first key. The keys are applied at once, each labeled by itself until the loader's `exact`
     * answers; a key it does not answer is then dropped, a key removed in the
     * meantime stays removed, and a later assignment wins over the late answer.
     * A failed lookup keeps the keys and surfaces as an unhandled rejection.
     * No `change` is dispatched. A key containing a
     * comma, which the value attribute cannot carry, is kept and warned about
     * once per element. Before the render the write is held for the render to
     * apply, over the `value` attribute, which it leaves alone.
     * @param {any} vs
     */
    set value(vs) {
        if (!this.#control) {
            this._holdValue(vs);
            return;
        }
        const given = (vs == null ? [] : Array.isArray(vs) ? vs : [vs]).map((k) => this.#coerceKey(k));
        const keys = this.#multiple ? given : given.slice(0, 1);
        if (!this.#warnedComma && keys.some((k) => typeof k === 'string' && k.includes(','))) {
            this.#warnedComma = true;
            console.warn('a ful-select key cannot contain a comma: it is unexpressible in the value attribute', this);
        }
        this.#values = new Map(keys.map((k) => [k, { key: k, label: k, metadata: undefined }]));
        const claim = this.#assignments.take();
        this.#syncBadges();
        if (keys.length === 0) {
            return;
        }
        this.#resolve(keys, claim);
    }
    async #resolve(keys, claim) {
        const entries = await this.#loader.exact(...keys);
        if (claim.stale) {
            return;
        }
        const resolved = new Map(entries.map((e) => [this.#coerceKey(e.key), e]));
        for (const key of keys) {
            if (!this.#values.has(key)) {
                continue;
            }
            if (resolved.has(key)) {
                this.#values.set(key, resolved.get(key));
            } else {
                this.#values.delete(key);
            }
        }
        this.#syncBadges();
    }
    /**
     * The selected keys, in selection order, for a multiple select; the one
     * key, or null, for a single one. Before the render it answers the keys
     * last written, or the `value` attribute, coerced and cut to one key as the
     * rendered select would.
     * @returns {any}
     */
    get value() {
        if (!this.#control) {
            const held = this._heldValue();
            const keys = [held ?? []].flat().map((k) => this.#coerceKey(k));
            return this.multiple ? keys : (keys[0] ?? null);
        }
        if (this.#multiple) {
            return [...this.#values.keys()];
        }
        return [...this.#values.keys()][0] ?? null;
    }
    /**
     * The selection as entries, the ones in the `change` detail: an array for
     * a multiple select, the one entry or null for a single one. An entry whose
     * label has not been resolved yet carries its key as the label.
     * @returns {SelectEntry|SelectEntry[]|null}
     */
    get entry() {
        const selection = this.#selection();
        if (this.#multiple) {
            return selection;
        }
        return selection[0] ?? null;
    }
    /**
     * The field's disabled claim; turning it on while the dropdown is open
     * closes it and drops a pending search.
     * @type {boolean}
     */
    get disabled() {
        return super.disabled;
    }
    set disabled(v) {
        super.disabled = v;
        if (v && this.#ddmenu?.shown) {
            this.#abortdload();
            this.#close();
        }
    }
    /**
     * The field's readonly claim; turning it on while the dropdown is open
     * closes it and drops a pending search.
     * @type {boolean}
     */
    get readonly() {
        return super.readonly;
    }
    set readonly(v) {
        super.readonly = v;
        if (v && this.#ddmenu?.shown) {
            this.#abortdload();
            this.#close();
        }
    }
    #useItemList;
    /**
     * Whether the select holds several keys: `value` and `entry` answer arrays,
     * the input stays empty and the selection shows as removable badges in the
     * control. Before the render it answers the `multiple` attribute.
     * @returns {boolean}
     */
    get multiple() {
        return this.#multiple ?? this.declared('multiple');
    }
    /**
     * Turning it off keeps only the first selected key; either way the badges,
     * the items and the input follow at once.
     * @param {boolean} v
     */
    set multiple(v) {
        this.#multiple = v;
        this.reflectTo('multiple', v);
        if (!v) {
            this.#values = new Map([...this.#values].slice(0, 1));
        }
        if (this.#control) {
            this.#syncBadges();
        }
    }
    /**
     * Whether the selection shows as the `items` list below the control instead
     * of as badges in it.
     * @returns {boolean}
     */
    get itemList() {
        return this.#useItemList;
    }
    /** @param {boolean} v */
    set itemList(v) {
        this.#useItemList = v;
        this.reflectTo('item-list', v);
    }
}

export { Dropdown, Select, SelectLoader };
