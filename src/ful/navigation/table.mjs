import { Attributes, Fragments, Localization, Nodes, ParsedElement, Rendering, Templates } from '../../ftl/index.mjs';
import { Claims } from '../claims.mjs';

/**
 * @typedef {{ page: number, size: number }} TablePageRequest the zero based
 * index of the page and the number of rows in a page
 */
/**
 * @typedef {{ sorter: string, order: string }} TableSortRequest the sort key
 * of a column and its direction, `asc` or `desc`
 */
/**
 * @typedef {{ data: any[], size: number }} TablePageResponse the rows of the
 * requested page and the total number of rows across every page
 */
/**
 * @typedef {{ load(pageRequest: TablePageRequest, sortRequest: TableSortRequest|null, filterRequest: Record<string, any>): Promise<TablePageResponse> }} TableRowLoader
 */

/**
 * The sort control of a table header, `ful-sorter`: a `role="button"` with
 * `tabindex="0"`, activated by a click or by Enter, NumpadEnter or Space.
 *
 * Each activation dispatches `sort:requested` (bubbling, not cancelable) with
 * `detail.value` set to `{ sorter, order }`: `sorter` is the `sorter`
 * attribute, read once at the upgrade, and `order` is the one after the
 * current `order` in the cycle `asc`, `desc`, `null`. The button does not
 * change its own `order`: whoever handles the event sets it, which `ful-table`
 * does once the sorted page has loaded.
 */
class SortButton extends ParsedElement {
    static attributes = ['sorter'];
    static observed = ['order'];
    #order;
    render() {
        const sorter = this.declared('sorter');
        const orders = ['asc', 'desc', null];
        this.setAttribute('role', 'button');
        this.setAttribute('tabindex', '0');
        this.addEventListener('click', () => {
            const nextOrder = orders[(orders.indexOf(this.order) + 1) % 3];
            this.dispatchEvent(
                new CustomEvent('sort:requested', {
                    bubbles: true,
                    cancelable: false,
                    detail: {
                        value: { sorter, order: nextOrder },
                    },
                }),
            );
        });
        this.addEventListener('keydown', (/** @type any */ evt) => {
            if (!['Enter', 'NumpadEnter', 'Space'].includes(evt.code)) {
                return;
            }
            evt.preventDefault();
            this.click();
        });
    }

    /**
     * The direction the column is sorted in, `null` when unsorted.
     * @returns {string|null}
     */
    get order() {
        return this.#order || null;
    }

    /**
     * Reflects the direction to the `order` attribute and sets `aria-sort` on
     * the enclosing `<th>`, if any: `ascending` for `asc`, `descending` for any
     * other non-empty value, removed for an empty one.
     * @param {string|null} value an empty string or `null` means unsorted
     */
    set order(value) {
        this.#order = value || null;
        this.reflectTo('order', this.#order);
        const th = this.closest('th');
        if (!th) {
            return;
        }
        Attributes.set(th, 'aria-sort', this.#order ? ('asc' === this.#order ? 'ascending' : 'descending') : null);
    }
}

/**
 * The pager, `ful-pagination`: a previous button, a window of page buttons
 * around the current page, a next button, a reload button and a line saying
 * which page of how many is shown.
 *
 * The window holds at most `pages` buttons (read once at the upgrade, default 5),
 * centred on the current page and shifted back on the last pages so it stays
 * full. The current page's button carries `aria-current="page"` and stays
 * enabled. Previous and next are disabled where there is no page to go to.
 *
 * A click on an enabled button other than the current page dispatches
 * `page:requested` (bubbling, not cancelable) with `detail.value` the zero based
 * index of the page asked for; the reload button asks for the current page.
 * The pager does not move itself: whoever handles the event calls `update`,
 * which `ful-table` does once the page has loaded.
 *
 * The icons are the `ful-icon` names in `Pagination.config`.
 */
class Pagination extends ParsedElement {
    static observed = ['total:number', 'current:number'];
    static attributes = ['pages:number'];
    static config = {
        prevIcon: 'chevron-left',
        nextIcon: 'chevron-right',
        reloadIcon: 'arrow-clockwise',
    };
    static template = `
        <ful-pagination-bar role="navigation" data-tpl-aria-label="#l10n:t('pagination.navigation')">
            <ul>
                <li data-ref="index"> {{ #l10n:t('pagination.showing', { 'current': curr.label, 'total': total }) }}</li>
                <li data-ref="reload"><button type="button" data-tpl-aria-label="#l10n:t('pagination.reload')"><ful-icon data-tpl-name="config.reloadIcon" aria-hidden="true"></ful-icon></button></li>
                <li data-ref="prev">
                    <button type="button" data-tpl-disabled="prev.enabled ? false : true" data-tpl-aria-label="#l10n:t('pagination.previous')" data-tpl-data-page="prev.index">
                        <ful-icon data-tpl-name="config.prevIcon" aria-hidden="true"></ful-icon>
                    </button>
                </li>
                <li data-ref="page" data-tpl-each="pages" data-tpl-var="page">
                    <button type="button" data-tpl-aria-current="curr.index == page.index ? 'page' : false" data-tpl-data-page="page.index" >
                        {{ page.label }}
                    </button>
                </li>
                <li data-ref="next">
                    <button type="button" data-tpl-disabled="next.enabled ? false : true" data-tpl-aria-label="#l10n:t('pagination.next')" data-tpl-data-page="next.index">
                        <ful-icon data-tpl-name="config.nextIcon" aria-hidden="true"></ful-icon>
                    </button>
                </li>
            </ul>
        </ful-pagination-bar>
    `;
    #total = 0;
    #current = 0;
    render() {
        this.addEventListener('click', (/** @type any */ evt) => {
            const el = evt.target.closest('button');
            if (!el || el.hasAttribute('disabled')) {
                return;
            }
            if (el.getAttribute('aria-current') === 'page') {
                return;
            }
            this.dispatchEvent(
                new CustomEvent('page:requested', {
                    bubbles: true,
                    cancelable: false,
                    detail: {
                        value: Number(el.dataset.page ?? this.#current),
                    },
                }),
            );
        });
    }
    /**
     * Moves the pager to a page, a page count, or both, reflects both to their
     * attributes and repaints the bar once. A key left out keeps its value; a
     * `null` one becomes 0. A count below one is shown as one empty page.
     *
     * The bar is replaced on every repaint. When the focus was inside it, it
     * moves to the equivalent control of the new bar: the button of the same
     * page, else the same enabled control, else the current page's button.
     * @param {{ current?: number|null, total?: number|null }} [state] `current`
     * is the zero based index of the page shown, `total` the number of pages
     */
    update({ current: toCurrent, total: toTotal } = {}) {
        if (toCurrent !== undefined) {
            this.#current = toCurrent ?? 0;
        }
        if (toTotal !== undefined) {
            this.#total = toTotal ?? 0;
        }
        this.reflectTo('current', this.#current);
        this.reflectTo('total', this.#total);
        const current = this.#current;
        const total = this.#total;
        const maxRender = this.declared('pages') ?? 5;
        const pageCount = Math.max(total, 1);
        const hasPrev = current > 0;
        const hasNext = current + 1 < pageCount;
        const prev = { index: hasPrev ? current - 1 : null, enabled: hasPrev };
        const curr = { index: current, label: current + 1 };
        const next = { index: hasNext ? current + 1 : null, enabled: hasNext };
        const rendered = Math.max(1, Math.min(maxRender, pageCount));
        const first = Math.max(0, Math.min(current - Math.floor((rendered - 1) / 2), pageCount - rendered));
        const pages = Array.from({ length: rendered }, (_, offset) => ({
            index: first + offset,
            label: first + offset + 1,
        }));
        const focused = this.contains(document.activeElement)
            ? /** @type HTMLElement */ (document.activeElement).closest('li')?.getAttribute('data-ref')
            : null;
        const page = focused === 'page' ? /** @type any */ (document.activeElement).dataset.page : null;
        this.template().withOverlay({ total: pageCount, prev, curr, next, pages }).renderTo(this);
        if (!focused) {
            return;
        }
        const back =
            (page === null ? null : this.querySelector(`li[data-ref=page] button[data-page="${page}"]`)) ??
            this.querySelector(`li[data-ref=${focused}] button:not(:disabled)`) ??
            this.querySelector('li[data-ref=page] button[aria-current=page]');
        /** @type HTMLElement */ (back)?.focus();
    }
    /**
     * The number of pages, as last written.
     * @returns {number}
     */
    get total() {
        return this.#total;
    }
    /**
     * Same as `update({ total: value })`.
     * @param {number|null} value
     */
    set total(value) {
        this.update({ total: value });
    }
    /**
     * The zero based index of the page shown.
     * @returns {number}
     */
    get current() {
        return this.#current;
    }
    /**
     * Same as `update({ current: value })`.
     * @param {number|null} value
     */
    set current(value) {
        this.update({ current: value });
    }
}

/** Reads the schema declaration into the header and row templates a table renders from. */
class TableSchemaParser {
    /**
     * Builds a header `<tr>` and a row `<tr data-tpl-each="rows">` from the
     * `<schema>` child of the slot. The `<schema>` attributes are copied onto
     * both rows. Each `<column>` becomes a `<th>` and a `<td>` carrying the
     * column's attributes except `title`, `sorter` and `order`, so a
     * `data-tpl-*` on a column applies to both cells; the two templates carry
     * `inHeaders` and `inRows` in their scope, so a column can tell them apart,
     * as in `data-tpl-if="inRows"`. The header cell holds the `<title>` child
     * element of the column, else the text of its `title` attribute, wrapped
     * in a `ful-sorter` when the column declares `sorter` or `order`. The body
     * cell holds the column's remaining children.
     *
     * The column elements are consumed: their `<title>`, `title`, `sorter` and
     * `order` are removed and their children moved into the cells.
     * @param {DocumentFragment|Element|undefined} nodeOrFragment the `schema`
     * slot, undefined when the table has none
     * @param {ReturnType<ParsedElement['template']>} template the template the
     * header and row templates derive from, keeping its scope
     * @returns {{ headersTemplate: ReturnType<ParsedElement['template']>, rowsTemplate: ReturnType<ParsedElement['template']>, sort: { sorter: string|null, order: string|null } | null, length: number }}
     * `sort` is the initial sort, taken from the first column declaring both
     * `order` and `sorter` (a column with only `order` gets an arrow but no
     * initial sort), `null` when none does; `length` is the number of columns
     * @throws {Error} when the slot is missing or holds no `<schema>`
     */
    static parse(nodeOrFragment, template) {
        const schema = nodeOrFragment ? Nodes.queryChildren(nodeOrFragment, 'schema') : null;
        if (!schema) {
            throw new Error('missing expected <schema>: ful-table needs a <template slot="schema"> holding one');
        }
        const headersTr = document.createElement('tr');
        const rowsTr = document.createElement('tr');
        rowsTr.setAttribute('data-tpl-each', 'rows');
        for (const attr of schema.getAttributeNames()) {
            const value = schema.getAttribute(attr);
            headersTr.setAttribute(attr, value ?? '');
            rowsTr.setAttribute(attr, value ?? '');
        }
        const columns = Nodes.queryChildrenAll(schema, 'column');
        const sort =
            columns
                .filter((v) => v.hasAttribute('order') && v.hasAttribute('sorter'))
                .map((v) => ({ sorter: v.getAttribute('sorter'), order: v.getAttribute('order') }))[0] ?? null;
        for (const column of columns) {
            const maybeTitleTag = Nodes.queryChildren(column, 'title');
            const sorter = column.getAttribute('sorter');
            const order = column.getAttribute('order');
            const titleNode = maybeTitleTag ?? document.createTextNode(column.getAttribute('title') ?? '');
            maybeTitleTag?.remove();
            column.removeAttribute('sorter');
            column.removeAttribute('order');
            column.removeAttribute('title');
            const wrappedTitleNode =
                !sorter && !order
                    ? titleNode
                    : (() => {
                          const fulSorter = document.createElement('ful-sorter');
                          if (sorter) {
                              fulSorter.setAttribute('sorter', sorter);
                          }
                          if (order) {
                              fulSorter.setAttribute('order', order);
                          }
                          fulSorter.append(titleNode);
                          return fulSorter;
                      })();
            const th = document.createElement('th');
            const td = document.createElement('td');
            for (const attr of column.getAttributeNames()) {
                const value = column.getAttribute(attr);
                th.setAttribute(attr, value ?? '');
                td.setAttribute(attr, value ?? '');
            }
            th.append(wrappedTitleNode);
            td.append(...column.childNodes);
            headersTr.append(th);
            rowsTr.append(td);
        }

        return {
            headersTemplate: template
                .withOverlay({ inHeaders: true, inRows: false })
                .withFragment(Fragments.from(headersTr)),
            rowsTemplate: template.withOverlay({ inHeaders: false, inRows: true }).withFragment(Fragments.from(rowsTr)),
            sort,
            length: columns.length,
        };
    }
}

/** Serves a table's rows from an array held in memory, applying the sort and the paging itself. */
class InMemoryTableLoader {
    #data;
    /**
     * @param {any[]} data the rows
     */
    constructor(data) {
        this.#data = data;
    }
    /**
     * Sorts a copy of the rows by the `sorter` property, rows missing it last
     * in either direction and rows with equal values in their original order,
     * then slices the requested page. The filters are ignored.
     * @param {TablePageRequest} pageRequest
     * @param {{ sorter?: string|null, order?: string|null } | null} sortRequest
     * `order` `desc` sorts descending, anything else ascending; no `sorter`
     * keeps the original order
     * @param {Record<string, any>} filterRequest not read
     * @returns {Promise<TablePageResponse>}
     */
    async load(pageRequest, sortRequest, filterRequest) {
        const rows = this.#sorted(sortRequest);
        const begin = pageRequest.page * pageRequest.size;
        const end = begin + pageRequest.size;
        const page = rows.slice(begin, end);
        const totalElements = rows.length;
        return {
            data: page,
            size: totalElements,
        };
    }
    #sorted(sortRequest) {
        if (!sortRequest?.sorter) {
            return this.#data;
        }
        const { sorter, order } = sortRequest;
        const sign = order === 'desc' ? -1 : 1;
        return [...this.#data].sort((l, r) => {
            const a = l?.[sorter];
            const b = r?.[sorter];
            if (a === b) {
                return 0;
            }
            if (a == null) {
                return 1;
            }
            if (b == null) {
                return -1;
            }
            return (a < b ? -1 : 1) * sign;
        });
    }
    /**
     * Replaces the rows. The table shows them at its next load.
     * @param {any[]} data
     */
    update(data) {
        this.#data = data;
    }
}

/** Requests one page of rows from a url, passing the page, the sort and the filters to the endpoint. */
class RemoteTableLoader {
    #http;
    #url;
    #method;
    #responseMapper;
    /**
     * @param {{ request(method: string, url: string): any }} http the `http-client` component
     * @param {string} url
     * @param {string} method
     * @param {(response: any) => TablePageResponse} [responseMapper] turns the
     * parsed json body into the page response; the identity when omitted
     */
    constructor(http, url, method, responseMapper = (response) => response) {
        this.#http = http;
        this.#url = url;
        this.#method = method;
        this.#responseMapper = responseMapper;
    }
    /**
     * Sends the query parameters `page`, `size`, `sort` as `sorter,order`
     * (left out when `sortRequest` is null) and `filters` as a json object of
     * the filters with a truthy value (left out when there is none), and
     * answers the json body through the response mapper.
     * @param {TablePageRequest} pageRequest
     * @param {TableSortRequest|null} sortRequest
     * @param {Record<string, any>} filterRequest
     * @returns {Promise<TablePageResponse>} rejecting with what the client's
     * `fetchJson()` rejects with
     */
    async load(pageRequest, sortRequest, filterRequest) {
        const filters = Object.entries(filterRequest).filter(([k, v]) => v);
        return await this.#http
            .request(this.#method, this.#url)
            .param('page', pageRequest.page)
            .param('size', pageRequest.size)
            .param('sort', sortRequest ? `${sortRequest.sorter},${sortRequest.order}` : null)
            .param('filters', filters.length > 0 ? JSON.stringify(Object.fromEntries(filters)) : null)
            .fetchJson()
            .then((response) => this.#responseMapper(response));
    }
}

/**
 * Builds the table's loader from its attributes: an in-memory one, or the
 * remote loader over src.
 *
 * A component registered under the `loader` attribute replaces this one and
 * must implement `load(pageRequest, sortRequest, filterRequest)`, answering
 * `{ data, size }`: the rows of the requested page and the total count of
 * rows. `pageRequest` carries the page index and its size, `sortRequest` the column and direction, and
 * `filterRequest` the values of the filters in the slot.
 */
class TableLoader {
    /**
     * A table with a `src` attribute gets a `RemoteTableLoader` sending through
     * the `http-client` component with the `method` attribute or `GET`, and
     * mapping the response through the component named by `response-mapper`,
     * if any. A table without `src` gets an empty `InMemoryTableLoader`, which
     * `withLoader` reaches to give it rows.
     * @param {Element & { component(name: string): any }} el the table
     * @param {unknown} [conf] not read
     * @returns {InMemoryTableLoader | RemoteTableLoader}
     */
    static create(el, conf) {
        const url = el.getAttribute('src');
        if (url) {
            const http = el.component('http-client');
            const method = el.getAttribute('method') ?? 'GET';
            const responseMapper = el.hasAttribute('response-mapper')
                ? el.component(/** @type {string} */ (el.getAttribute('response-mapper')))
                : (/** @type any */ response) => response;
            return new RemoteTableLoader(http, url, method, responseMapper);
        }
        return new InMemoryTableLoader([]);
    }
}

/**
 * A table, `ful-table`, loading its rows a page at a time from a loader, with
 * a header sorter per sortable column, a `ful-pagination` under it and an
 * optional filter form.
 *
 * The loader is the component named by `loader`, default `loaders:table`
 * (see `TableLoader`). The `schema` slot declares the columns (see
 * `TableSchemaParser.parse`); the `filters` slot is wrapped in a `ful-form`,
 * whose values are the filter request; the `caption`, `footer` and `empty`
 * slots go in the table's caption, its `<tfoot>` and the panel shown for a
 * load answering no rows. Attributes starting with `table-` are forwarded,
 * without the prefix, to the inner `<table>`.
 *
 * With `autoload` the first load starts at the upgrade, which does not wait
 * for it. Without it the table shows an initial panel until `load`,
 * `reload` or `resetWithFilter` is called.
 *
 * Inside the table a `page:requested` loads that page with the current size,
 * sort and filters; a `sort:requested` loads the current page with the new
 * sort (none for a `null` order) and, once that load is the one showing, sets
 * the order of the sorter that asked and clears the others; a `submit:success`
 * of the filter form loads the first page with the submitted request as the
 * filters. The loads these start, and the autoload, are not awaited by
 * anything: a failure shows the error panel and its rejection is unhandled.
 */
class Table extends ParsedElement {
    /** Read once at the upgrade. */
    static attributes = ['loader', 'autoload:presence'];
    /** These stay live after the upgrade: see `pageSize`, `src` and `method`. */
    static observed = ['page-size:number', 'src', 'method'];
    static slots = true;
    static config = {
        searchIcon: 'search',
        emptyIcon: 'inbox',
    };
    static template = `
        <ful-form data-tpl-if="slots.filters">
            {{{{ slots.filters }}}}
        </ful-form>
        <ful-table-wrapper>
            <table>
                <caption data-tpl-if="slots.caption">{{{{ slots.caption }}}}</caption>
                <thead></thead>
                <tbody></tbody>
                <tbody data-ref="initial">
                    <tr>
                        <td data-tpl-colspan="schema.length">
                            <ful-empty>
                                <ful-icon data-tpl-if="config.searchIcon" data-tpl-name="config.searchIcon" aria-hidden="true"></ful-icon>
                                {{ #l10n:t('table.initial') }}
                            </ful-empty>
                        </td>
                    </tr>
                </tbody>
                <tbody data-ref="empty" hidden>
                    <tr>
                        <td data-tpl-colspan="schema.length">
                            <ful-empty data-tpl-if="slots.empty" data-ref="empty-authors"></ful-empty>
                            <ful-empty data-tpl-if="!slots.empty">
                                <ful-icon data-tpl-if="config.emptyIcon" data-tpl-name="config.emptyIcon" aria-hidden="true"></ful-icon>
                                {{ #l10n:t('table.no-data') }}
                            </ful-empty>
                        </td>
                    </tr>
                </tbody>
                <tbody data-ref="loading" hidden>
                    <tr>
                        <td data-tpl-colspan="schema.length">
                            <ful-spinner class="big" role="status"><span class="ful-sr-only">{{ #l10n:t('spinner.loading') }}</span></ful-spinner>
                        </td>
                    </tr>
                </tbody>
                <tbody data-ref="feedback" hidden>
                    <tr>
                        <td data-tpl-colspan="schema.length">
                            <div role="alert">
                                <p>{{ #l10n:t('table.error') }}</p>
                                <div data-ref="feedback-error"></div>
                            </div>
                        </td>
                    </tr>
                </tbody>
                <tfoot data-tpl-if="slots.footer">
                    {{{{ slots.footer }}}}
                </tfoot>
            </table>
        </ful-table-wrapper>
        <ful-pagination current="0" total="1"></ful-pagination>
    `;
    static templates = {
        row: `
            {{{{ schema.rowsTemplate.withOverlay({'rows': pageResponse.data}).render() }}}}
        `,
    };
    #loader;
    #schema;
    #body;
    #loading;
    #noAutoload;
    #empty;
    #emptyAuthors;
    #emptyTemplate;
    #feedback;
    #paginator;
    #sorters;
    /** @type {{ pageRequest: { page: number, size: number }, sortRequest: any, filterRequest: any }} */
    #latestRequest = { pageRequest: { page: 0, size: 10 }, sortRequest: null, filterRequest: {} };
    /** whether a load has been asked for, by autoload or by a caller */
    #loadRequested = false;
    #loads = new Claims();
    /** @type {{ src: string|null, method: string|null }} */
    #builtFrom = { src: null, method: null };
    /**
     * How many rows a page asks the loader for: the size the next load will
     * carry. Ten before the render.
     * @returns {number}
     */
    get pageSize() {
        return this.#latestRequest.pageRequest.size;
    }
    /**
     * Changes the page size and reloads from the first page, keeping the sort
     * and the filters. A table that has not loaded yet only records it:
     * writing the size is not a request to start loading, which is what
     * `autoload` and `reload()` are for. A write that does not change the size
     * does nothing. A write made before the render is replaced by the declared
     * `page-size` when the table renders.
     *
     * The reload is not awaited: a failure shows the error panel and its
     * rejection is unhandled.
     * @param {number|null|undefined} value absent or null is the default of
     * ten, so removing the attribute restores it
     */
    set pageSize(value) {
        const size = value ?? 10;
        if (size === this.#latestRequest.pageRequest.size) {
            return;
        }
        this.#latestRequest = { ...this.#latestRequest, pageRequest: { page: 0, size } };
        if (!this.#loadRequested) {
            return;
        }
        this.reload();
    }
    /**
     * The url the loader asks for rows, reflected as the `src` attribute.
     * @returns {string|null}
     */
    get src() {
        return this.getAttribute('src');
    }
    /**
     * Points the table at another url: the loader is built again through its
     * component's `create`, as at the render, and the table reloads from the
     * first page, keeping the size, the sort and the filters. A table that has
     * not loaded yet only rebuilds its loader. A write that does not change the
     * url does nothing.
     *
     * The reload is not awaited: a failure shows the error panel and its
     * rejection is unhandled.
     * @param {string|null|undefined} value null or undefined removes the url,
     * which the default loader answers with an empty in-memory loader
     */
    set src(value) {
        this.reflectTo('src', value ?? null);
        this.#rebuildIfChanged();
    }
    /**
     * The http method the default loader sends with, reflected as the `method`
     * attribute; `GET` when absent.
     * @returns {string|null}
     */
    get method() {
        return this.getAttribute('method');
    }
    /**
     * Changes the http method the way `src` changes the url: the loader is
     * built again and the table reloads from the first page.
     * @param {string|null|undefined} value
     */
    set method(value) {
        this.reflectTo('method', value ?? null);
        this.#rebuildIfChanged();
    }
    #buildLoader() {
        this.#builtFrom = { src: this.getAttribute('src'), method: this.getAttribute('method') };
        this.#loader = this.component(this.declared('loader') ?? 'loaders:table').create(this);
    }
    #rebuildIfChanged() {
        if (
            this.getAttribute('src') === this.#builtFrom.src &&
            this.getAttribute('method') === this.#builtFrom.method
        ) {
            return;
        }
        this.#buildLoader();
        this.#latestRequest = { ...this.#latestRequest, pageRequest: { ...this.#latestRequest.pageRequest, page: 0 } };
        if (!this.#loadRequested) {
            return;
        }
        this.reload();
    }
    /**
     * @param {{ slots: Record<string, DocumentFragment> }} c
     * @returns {Promise<void>}
     * @throws {Error} when the `schema` slot is missing or holds no `<schema>`
     */
    async render({ slots }) {
        const template = this.template();
        const schema = TableSchemaParser.parse(slots.schema, template);
        const fragment = template.withOverlay({ slots, schema }).render();
        const tableWrapper = /** @type HTMLTableElement */ (Nodes.queryChildren(fragment, 'ful-table-wrapper'));
        const table = /** @type HTMLTableElement */ (tableWrapper.querySelector('table'));
        Attributes.forward('table-', this, table);
        this.#buildLoader();

        this.#schema = schema;
        this.#body = table.querySelector(':scope > tbody');
        this.#loading = table.querySelector(':scope > tbody[data-ref=loading]');
        this.#noAutoload = table.querySelector(':scope > tbody[data-ref=initial]');
        this.#empty = table.querySelector(':scope > tbody[data-ref=empty]');
        this.#emptyAuthors = this.#empty.querySelector('ful-empty[data-ref=empty-authors]');
        this.#emptyTemplate =
            slots.empty && !Fragments.isBlank(slots.empty) ? Templates.fromFragment(slots.empty) : null;
        this.#feedback = table.querySelector(':scope > tbody[data-ref=feedback]');
        this.#paginator = Nodes.queryChildren(fragment, 'ful-pagination');
        this.replaceChildren(fragment);
        const thead = /** @type HTMLTableSectionElement */ (this.querySelector('thead'));
        schema.headersTemplate.renderTo(thead);
        this.#sorters = thead.querySelectorAll('ful-sorter');
        await Rendering.waitForChildren(this);

        const maybeForm = /** @type any */ (Nodes.queryChildren(this, 'ful-form'));
        this.#latestRequest = {
            pageRequest: {
                page: 0,
                size: this.declared('page-size') ?? 10,
            },
            sortRequest: schema.sort,
            filterRequest: maybeForm?.values ?? {},
        };
        maybeForm?.addEventListener('submit:success', async (evt) => {
            await this.#loadPage(0, evt.detail.request);
        });
        this.addEventListener('page:requested', async (/** @type any */ e) => {
            await this.#loadPage(e.detail.value, this.#latestRequest.filterRequest);
        });
        this.addEventListener('sort:requested', async (/** @type any */ e) => {
            const sortRequest = e.detail.value.order ? e.detail.value : null;
            await this.load(this.#latestRequest.pageRequest, sortRequest, this.#latestRequest.filterRequest);
            if (this.#latestRequest.sortRequest !== sortRequest) {
                return;
            }
            this.#sorters.forEach((s) => {
                s.order = null;
            });
            e.target.order = e.detail.value.order;
        });
        if (this.declared('autoload')) {
            this.reload();
        }
    }

    /**
     * Loads the last request that loaded, or, before any has, the first page
     * with the declared size and sort and the values of the filters slot. A
     * size written through `pageSize` since then replaces the page with the
     * first one at that size.
     * @returns {Promise<void>} as `load`
     */
    async reload() {
        return await this.load(
            this.#latestRequest.pageRequest,
            this.#latestRequest.sortRequest,
            this.#latestRequest.filterRequest,
        );
    }
    /**
     * Asks the loader for a page and shows it.
     *
     * While the load runs the table carries `aria-busy="true"`, and the rows
     * already shown stay; the spinner panel shows only when there are none.
     * When the loader answers, the rows and the pager are replaced, the empty
     * panel shows for an answer with no rows (the `empty` slot rendered with
     * `schema`, `pageRequest`, `filterRequest` and `pageResponse` in scope),
     * the request becomes the one
     * `reload` repeats, `aria-busy` is removed and `load:success` is
     * dispatched (bubbling, not cancelable) with `detail` set to
     * `{ pageRequest, sortRequest, filterRequest, response }`. A page beyond
     * the last one the answer reports is not shown: the last page is loaded
     * instead, and the returned promise settles with that load.
     *
     * When the loader rejects, the rows are removed, the error panel shows the
     * `reason` of each of the error's `problems`, one per line, or the error as text,
     * `aria-busy` is removed, `load:failure` is dispatched (bubbling, not
     * cancelable) with `detail` set to
     * `{ pageRequest, sortRequest, filterRequest, exception }`, and the
     * returned promise rejects with the same error.
     *
     * A load started after this one supersedes it: when this one's answer or
     * failure arrives it changes nothing, dispatches nothing and resolves.
     * @param {TablePageRequest} pageRequest
     * @param {TableSortRequest|null} sortRequest
     * @param {Record<string, any>} filterRequest
     * @returns {Promise<void>}
     * @throws what the loader rejects with, unless a newer load superseded this one
     */
    async load(pageRequest, sortRequest, filterRequest) {
        this.#loadRequested = true;
        const claim = this.#loads.take();
        this.#loading.toggleAttribute('hidden', this.#body.childElementCount > 0);
        this.#feedback.setAttribute('hidden', '');
        this.#noAutoload.setAttribute('hidden', '');
        this.#empty.setAttribute('hidden', '');
        this.setAttribute('aria-busy', 'true');
        let lastPage;
        try {
            const pageResponse = await this.#loader.load(pageRequest, sortRequest, filterRequest);
            if (claim.stale) {
                return;
            }
            lastPage = Math.max(0, Math.ceil(pageResponse.size / pageRequest.size) - 1);
            if (pageRequest.page <= lastPage) {
                this.#latestRequest = { pageRequest, sortRequest, filterRequest };
                this.#update(pageRequest, sortRequest, filterRequest, pageResponse);
                this.removeAttribute('aria-busy');
                this.dispatchEvent(
                    new CustomEvent('load:success', {
                        bubbles: true,
                        cancelable: false,
                        detail: { pageRequest, sortRequest, filterRequest, response: pageResponse },
                    }),
                );
                return;
            }
        } catch (/** @type any */ error) {
            if (claim.stale) {
                return;
            }
            this.#loading.setAttribute('hidden', '');
            this.#body.replaceChildren();
            this.#feedback.removeAttribute('hidden');
            this.#feedback.querySelector('[data-ref=feedback-error]').textContent = Localization.of().failure(error);
            this.removeAttribute('aria-busy');
            this.dispatchEvent(
                new CustomEvent('load:failure', {
                    bubbles: true,
                    cancelable: false,
                    detail: { pageRequest, sortRequest, filterRequest, exception: error },
                }),
            );
            throw error;
        }
        return await this.load({ page: lastPage, size: pageRequest.size }, sortRequest, filterRequest);
    }
    /**
     * Hands the loader to the callback, for runtime reconfigurations, such as
     * `update(rows)` on the in-memory loader. The loader exists from the
     * render on. Nothing is reloaded.
     * @template T
     * @param {(loader: any) => T | Promise<T>} fn
     * @returns {Promise<T>} what `fn` returns or resolves to
     */
    async withLoader(fn) {
        return await fn(this.#loader);
    }
    /**
     * Loads the first page with the given filters, keeping the size and the sort.
     * @param {Record<string, any>} filterRequest
     * @returns {Promise<void>} as `load`
     */
    async resetWithFilter(filterRequest) {
        return await this.#loadPage(0, filterRequest);
    }
    #loadPage(page, filterRequest) {
        return this.load(
            { page, size: this.#latestRequest.pageRequest.size },
            this.#latestRequest.sortRequest,
            filterRequest,
        );
    }
    #update(pageRequest, sortRequest, filterRequest, pageResponse) {
        const pages = Math.ceil(pageResponse.size / pageRequest.size);
        this.#loading.setAttribute('hidden', '');
        this.#body.replaceChildren(
            this.template('row')
                .withOverlay({
                    schema: this.#schema,
                    pageRequest,
                    filterRequest,
                    pageResponse,
                })
                .render(),
        );
        this.#empty.toggleAttribute('hidden', pageResponse.data.length !== 0);
        if (this.#emptyTemplate && pageResponse.data.length === 0) {
            this.#emptyAuthors.replaceChildren(
                this.#emptyTemplate
                    .withOverlay({ schema: this.#schema, pageRequest, filterRequest, pageResponse })
                    .render(),
            );
        }
        this.#paginator.update({ current: pageRequest.page, total: pages });
    }
}

export { TableLoader, SortButton, Table, TableSchemaParser, Pagination };
