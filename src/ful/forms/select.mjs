import { Attributes, Fragments, ParsedElement, Templates } from '../../ftl/index.mjs';
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

const byKeys = (entries, keys) => entries.filter(({ key }) => keys.some((r) => r == key));
const byLabel = (entries, needle) =>
    entries.filter(({ label }) => (label ?? '').toLowerCase().includes(needle?.toLowerCase() ?? ''));

/**
 * Fetches a select's whole vocabulary from a url and serves every later read
 * from it. Concurrent callers share one request, the options may be cached in
 * local storage under a revision, and reconfiguring the url discards both.
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
     * @throws when the fetch fails, or when a reconfiguration supersedes it
     */
    async prefetch() {
        if (!this.#prefetch) {
            return;
        }
        await this.#ensureFetched();
    }
    /**
     * The entries whose key loosely equals one of the keys, in vocabulary order.
     * @param {...any} keys
     * @returns {Promise<SelectEntry[]>}
     * @throws when the fetch fails, or when a reconfiguration supersedes it
     */
    async exact(...keys) {
        return byKeys(await this.#ensureFetched(), keys);
    }
    /**
     * The entries whose label contains the needle, ignoring case; every entry
     * for a nullish or empty needle.
     * @param {string|null} [needle]
     * @returns {Promise<SelectEntry[]>}
     * @throws when the fetch fails, or when a reconfiguration supersedes it
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
    /**
     * Points the loader at another url, invalidating first.
     * @param {string} url
     * @returns {Promise<void>}
     */
    async reconfigureUrl(url) {
        await this.invalidate();
        this.#url = url;
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
            throw new Error('superseded by a reconfiguration');
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
    /**
     * @param {{ http: SelectHttpClient, url: string, method: string, responseMapper: (response: any) => SelectEntry[] }} conf
     */
    constructor({ http, url, method, responseMapper }) {
        this.#http = http;
        this.#url = url;
        this.#method = method;
        this.#responseMapper = responseMapper;
    }
    /**
     * Does nothing, since nothing is held between queries.
     * @returns {Promise<void>}
     */
    async invalidate() {}
    /**
     * Points every later query at another url.
     * @param {string} url
     * @returns {Promise<void>}
     */
    async reconfigureUrl(url) {
        this.#url = url;
    }
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
        const response = await this.#http.request(this.#method, this.#url).param('s', needle).fetchJson();
        return this.#responseMapper(response);
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
     * The entries whose key loosely equals one of the keys, in vocabulary order.
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
    /**
     * Builds a loader from a plain configuration, reading no dom: `data` alone
     * is the in-memory vocabulary, a `url` is fetched whole or, under
     * `mode: 'chunked'`, per query. A test, or a caller holding its own
     * configuration, builds a loader this way; `create` is the same thing with
     * an element's attributes parsed first.
     *
     * A remote loader fetches once and filters in memory, caching the response
     * in local storage under `method@url` when a revision is given; a chunked
     * one sends every search as `s` and every key lookup as `k`. The response
     * mapper turns the parsed response body into entries.
     * @param {{ data?: SelectEntry[], url?: undefined, http?: undefined, method?: undefined, mode?: undefined, prefetch?: undefined, revision?: undefined, responseMapper?: undefined }
     *     | { data?: undefined, url: string, http: SelectHttpClient, method?: string, mode?: string, prefetch?: boolean, revision?: string|null, responseMapper: (response: any) => SelectEntry[] }} conf
     * `method` defaults to POST
     * @returns {InMemoryLoader|PartialRemoteLoader|RemoteLoader}
     */
    static from({ data, http, url, method = 'POST', mode, prefetch = false, revision = null, responseMapper }) {
        if (!url) {
            return new InMemoryLoader(data ?? []);
        }
        if ('chunked' === mode) {
            return new PartialRemoteLoader({ http, url, method, responseMapper });
        }
        return new RemoteLoader({ http, url, method, responseMapper, prefetch, revision });
    }
    /**
     * Builds the loader an element's attributes describe. Without `src` the
     * vocabulary is the `<option>` elements of `conf.options`, each keyed by its
     * `value` attribute or else its trimmed text. With `src` the url is
     * requested through the `http-client` component with `method` (POST by
     * default): once on first use, or at the upgrade under `preload`, or per
     * query under `mode="chunked"`. A `revision` caches the whole response in local storage; a
     * valueless one takes the `revision` component, calling it when it is a
     * function, and warns and does not cache when none is registered.
     *
     * The response becomes entries through `k-expr` and `l-expr` evaluated on
     * each row of `d-expr` (the response itself by default), with `m-expr` as
     * the metadata (the row by default); else through the `response-mapper`
     * component; else each row is read as a `[key, label, metadata]` array.
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
    static #responseMapperFrom(el) {
        if (el.declared('k-expr') && el.declared('l-expr')) {
            return (response) => {
                const rows = el._registry
                    .evaluator()
                    .withOverlay(response)
                    .evaluateExpression(el.declared('d-expr') ?? 'self');
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
        return (/** @type any[] */ response) => response.map(([key, label, metadata]) => ({ key, label, metadata }));
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
    #spinner;
    #menu;
    #empty;
    #optionstemplate;
    #options = new Map();
    #shows = new Claims();
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
        return (
            this.#menu?.querySelector('[selected]:not([aria-disabled="true"])') ??
            this.#menu?.querySelector('li:not([aria-disabled="true"])') ??
            null
        );
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
     * the dropdown and dispatches `change`. Does nothing when no row is enabled.
     */
    acceptSelection() {
        const selected = this.#selected();
        if (!selected) {
            return;
        }
        this.#change(selected);
    }
    /**
     * Renders the entries as rows and highlights the first one whose key is
     * picked, else the row the template marked `selected`, else the first
     * enabled row. A row is marked `picked` and
     * `aria-selected="true"` when its key loosely equals one of the keys, and
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
        this.#options = new Map(values.map((v, i) => [String(i), v]));
        const data = values.map((entry, index) => ({ index, ...entry }));
        this.#optionstemplate.withOverlay(data).renderTo(this.#menu);
        for (const [index, li] of [...this.#menu.children].entries()) {
            const entry = values[index];
            const picked = keys.some((r) => r == entry?.key);
            li.toggleAttribute('picked', picked);
            li.setAttribute('aria-selected', picked ? 'true' : 'false');
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
        this.#empty.toggleAttribute('hidden', values.length !== 0);
        this.#menu.toggleAttribute('hidden', values.length === 0);
        const current = values.findIndex(({ key }) => keys.some((r) => r == key));
        this.#highlight(current >= 0 ? this.#menu.children[current] : this.#selected());
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
     * @param {() => SelectEntry[]|Promise<SelectEntry[]>} loader
     * @param {any[]} [keys] the keys currently selected
     * @returns {Promise<void>}
     * @throws what the loader threw, after hiding the dropdown, when this show
     * is still the current one
     */
    async show(loader, keys = []) {
        const claim = this.#shows.take();
        if (!this.matches(':popover-open')) {
            this.showPopover();
        }
        this.#menu.setAttribute('hidden', '');
        this.#spinner.removeAttribute('hidden');
        try {
            const data = await loader();
            if (claim.stale) {
                return;
            }
            this.update(data, keys);
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
     * is shown, staying put at the edge, and shows it otherwise.
     * @param {boolean} forward
     * @param {() => SelectEntry[]|Promise<SelectEntry[]>} loader used only to show
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
     * Highlights the first enabled row, or the last one.
     * @param {boolean} first
     */
    jump(first) {
        const edge = first ? this.#menu.firstElementChild : this.#menu.lastElementChild;
        const target = this.#walk(edge, first);
        if (target) {
            this.#highlight(target);
        }
    }
    /**
     * Moves the highlight by as many enabled rows as the menu shows at once,
     * one when that cannot be measured, stopping at the last enabled row.
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
     * otherwise), and the loader configuration `SelectLoader.create` reads.
     */
    static attributes = [
        'name',
        'loader',
        'k-type',
        'src',
        'method',
        'mode',
        'preload:presence',
        'revision',
        'k-expr',
        'l-expr',
        'd-expr',
        'm-expr',
        'response-mapper',
    ];
    /**
     * Beside the field's claims: `multiple`, `item-list`, and `value` as a comma
     * separated list of keys, trimmed, whether or not the select is multiple.
     */
    static observed = ['multiple:presence', 'item-list:presence', 'value:csv'];
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
    #control;
    #ddmenu;
    #input;
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
        this.#loader = this.component(this.declared('loader') ?? 'loaders:select').create(this, {
            options: slots.options,
        });

        this.#multiple = this.declared('multiple');
        this.#loader.prefetch?.()?.catch((/** @type any */ e) => {
            console.warn('failed to prefetch select options', this, 'reason:', e);
        });
        const fragment = this.template().withOverlay({ slots, name }).render();
        this.#input = fragment.querySelector('ful-control > input');
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
            label: fragment.querySelector('label'),
        };
    }
    /**
     * Pointer interaction: the element toggles the dropdown, the item list's
     * remove buttons and the control's badges drop their entry.
     */
    #wireChrome() {
        this.addEventListener('click', (/** @type any */ e) => {
            if (!this._interactive()) {
                return;
            }
            const elsewhere = e.target.closest('button, [role="button"], a[href], input, select, textarea');
            if (elsewhere && elsewhere !== this.#input) {
                return;
            }
            if (this.#ddmenu.shown) {
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
     * Hands the loader to the callback, for runtime reconfigurations such as
     * `reconfigureUrl(url)` on a remote loader or `update(entries)` on an
     * in-memory one.
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
     * fresh label. The badges and items follow, and no `change` is dispatched.
     *
     * Pass a url first where the vocabulary lives at a different address:
     *
     *     citta.addEventListener('change', async () => {
     *         await cap.withLoader((l) => l.reconfigureUrl(`/api/cap?citta=${citta.value}`));
     *         await cap.reload();
     *     });
     * @returns {Promise<void>}
     * @throws what the loader's invalidate, prefetch or key lookup throws
     */
    async reload() {
        await this.#loader.invalidate?.();
        await this.#loader.prefetch?.();
        const keys = [...this.#values.keys()];
        if (keys.length === 0) {
            return;
        }
        await this.#resolve(keys, this.#assignments.take());
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
                this.#close();
            }
            return;
        }
        this.#ddmenu.moveOrShow(forward, () => this.#loader.load(this.#query()), [...this.#values.keys()]);
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
        return this.#ddmenu.show(() => this.#loader.load(this.#query()), [...this.#values.keys()]);
    }
    #query() {
        return this.#editing ? this.#input.value : '';
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
     * undefined for none. The empty string is a key like any other. The keys
     * are applied at once, each labeled by itself until the loader's `exact`
     * answers; a key it does not answer is then dropped, a key removed in the
     * meantime stays removed, and a later assignment wins over the late answer.
     * A failed lookup keeps the keys and surfaces as an unhandled rejection.
     * No `change` is dispatched. A key containing a
     * comma, which the value attribute cannot carry, is kept and warned about
     * once per element.
     * @param {any} vs
     */
    set value(vs) {
        const keys = (vs == null ? [] : Array.isArray(vs) ? vs : [vs]).map((k) => this.#coerceKey(k));
        if (!this.#warnedComma && keys.some((k) => typeof k === 'string' && k.includes(','))) {
            this.#warnedComma = true;
            console.warn('a ful-select key cannot contain a comma: it is unexpressible in the value attribute', this);
        }
        this.#values = new Map(keys.map((k) => [k, { key: k, label: k, metadata: undefined }]));
        const claim = this.#assignments.take();
        if (!this.#control) {
            return;
        }
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
     * key, or null, for a single one.
     * @returns {any}
     */
    get value() {
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
    #useItemList;
    /**
     * Whether the select holds several keys: `value` and `entry` answer arrays,
     * the input stays empty and the selection shows as removable badges in the
     * control.
     * @returns {boolean}
     */
    get multiple() {
        return this.#multiple;
    }
    /** @param {boolean} v */
    set multiple(v) {
        this.#multiple = v;
        this.reflectTo('multiple', v);
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
