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
 * @typedef {{ count: Element, appending: Element, failure: Element, error: Element }} TableStatus the pieces
 * of the status bar `paging="infinite"` and `paging="virtual"` show in place of the pager
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
 *
 * The stylesheet draws an up arrow for `asc` and a down arrow for `desc`. An
 * unsorted button shows the up arrow dimmed, `asc` being the order its first
 * activation asks for.
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
        const size = Number(pageRequest.size);
        const begin = pageRequest.page * size;
        const end = begin + size;
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
 * `paging="infinite"`, read once at the upgrade, replaces the pager with a
 * status bar saying how many rows of how many are shown, with a reload
 * button. A load still replaces the rows with one page, scrolling the rows
 * back to the top; from then on, whenever a row of the last half page
 * comes into view, the next page is asked with the same size, sort and
 * filters and appended (see `load`). `reload`, a sort, a filter submit and a
 * size change start over from the first page.
 *
 * `paging="virtual"` shows the same status bar, saying which rows of how many
 * are in view, and keeps in the page only the page in view and one on either
 * side of it, the others standing in as empty space sized on the height of
 * the rows. The rows must scroll inside the table, as `ful-fill` makes them:
 * a table whose rows the page scrolls appends as `paging="infinite"` does,
 * and warns. See `load` and `reload`.
 *
 * Inside the table, and not inside a `ful-table` nested in it, a
 * `page:requested` loads that page with the current size,
 * sort and filters; a `sort:requested` loads the current page with the new
 * sort (none for a `null` order) and, once that load is the one showing, sets
 * the order of the sorter that asked and clears the others; a `submit:success`
 * of the filter form loads the first page with the submitted request as the
 * filters. The first load goes through the filter form too: `reload`, and so
 * `autoload`, submits it (see `reload`), so a `submit` listener rewriting
 * `detail.request` shapes every load alike. The filters a page, a sort or a size change carries are those of
 * the last load asked for, whether it is still running, loaded or failed, so
 * they are the ones the filter form shows. The loads these start, and the autoload, are not awaited by
 * anything: a failure shows the error panel and its rejection is unhandled.
 */
class Table extends ParsedElement {
    /** Read once at the upgrade. */
    static attributes = ['loader', 'autoload:presence', 'paging'];
    /** These stay live after the upgrade: see `pageSize`, `src` and `method`. */
    static observed = ['page-size:number', 'src', 'method'];
    static slots = true;
    static config = {
        searchIcon: 'search',
        emptyIcon: 'inbox',
        reloadIcon: 'arrow-clockwise',
    };
    static template = `
        <ful-form data-tpl-if="slots.filters">
            {{{{ slots.filters }}}}
        </ful-form>
        <ful-table-wrapper>
            <table>
                <caption data-tpl-if="slots.caption">{{{{ slots.caption }}}}</caption>
                <thead></thead>
                <tbody data-tpl-if="virtual" data-ref="before" aria-hidden="true"><tr><td data-tpl-colspan="schema.length"></td></tr></tbody>
                <tbody></tbody>
                <tbody data-tpl-if="virtual" data-ref="after" aria-hidden="true"><tr><td data-tpl-colspan="schema.length"></td></tr></tbody>
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
        <ful-pagination data-tpl-if="!scrolled" current="0" total="1"></ful-pagination>
        <ful-table-status data-tpl-if="scrolled">
            <span data-ref="count"></span>
            <ful-spinner data-ref="appending" role="status" hidden><span class="ful-sr-only">{{ #l10n:t('spinner.loading') }}</span></ful-spinner>
            <div data-ref="append-failure" role="alert" hidden>
                <span>{{ #l10n:t('table.error') }} <span data-ref="append-error"></span></span>
                <button type="button" data-ref="retry">{{ #l10n:t('table.retry') }}</button>
            </div>
            <button type="button" data-ref="reload" data-tpl-aria-label="#l10n:t('pagination.reload')"><ful-icon data-tpl-name="config.reloadIcon" aria-hidden="true"></ful-icon></button>
        </ful-table-status>
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
    #wrapper;
    /** @type {TableStatus|null} null under the pager */
    #status = null;
    /** @type {IntersectionObserver|null} */
    #endWatch = null;
    /** @type {Element[]} the rows whose coming into view appends the next page, none while no append is awaited */
    #watched = [];
    /** the page the next append asks for, the rows shown, the total the last answer reported and the rows it carried */
    #appended = { next: 1, shown: 0, total: 0, last: 0 };
    /** whether the table keeps a window of pages, `paging="virtual"` over rows that scroll inside it */
    #virtual = false;
    /** @type {{ before: HTMLElement, after: HTMLElement } | null} the cells standing in for the rows above and below the window */
    #spacers = null;
    /** @type {{ first: number, last: number, pages: Map<number, Element[]> } | null} the pages in the page, in order, null while no rows show */
    #window = null;
    /** the total number of rows the last answer reported */
    #total = 0;
    /** the height of a row the spacers are sized on, measured on the first rows a load shows; 0 until measured */
    #rowHeight = 0;
    /** @type {{ readonly stale: boolean } | null} the claim of the window shift in flight */
    #shifting = null;
    /** whether the last window shift failed: scrolling asks for nothing more until a retry or a load */
    #windowFailed = false;
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    #jump = undefined;
    /** @type {{ pageRequest: { page: number, size: number }, sortRequest: any, filterRequest: any }} */
    #latestRequest = { pageRequest: { page: 0, size: 10 }, sortRequest: null, filterRequest: {} };
    /** whether a load has been asked for, by autoload or by a caller */
    #loadRequested = false;
    /** the filters of the last load asked for, which page, sort and size changes carry */
    #requestedFilters = {};
    /** @type {any} the `ful-form` wrapping the `filters` slot, if any */
    #filters = null;
    /** whether a load has shown its rows, after which `reload` repeats it */
    #loaded = false;
    /** @type {Promise<void>|null} the load the last `submit:success` of the filter form started */
    #filterLoad = null;
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
     * `page-size` when the table renders, or by ten when that is not a number
     * above zero.
     *
     * The reload is not awaited: a failure shows the error panel and its
     * rejection is unhandled.
     * @param {number|string|null|undefined} value a number or a string of
     * one, such as a select's value; absent or null is the default of ten,
     * so removing the attribute restores it, and a value that is not a
     * finite number above zero is ignored
     */
    set pageSize(value) {
        const size = Number(value ?? 10);
        if (!Number.isFinite(size) || size <= 0 || size === this.#latestRequest.pageRequest.size) {
            return;
        }
        this.#latestRequest = { ...this.#latestRequest, pageRequest: { page: 0, size } };
        if (!this.#loadRequested) {
            return;
        }
        this.load(this.#latestRequest.pageRequest, this.#latestRequest.sortRequest, this.#requestedFilters);
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
        if (this.#followAttributes() && this.#loadRequested) {
            this.reload();
        }
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
        if (this.#followAttributes() && this.#loadRequested) {
            this.reload();
        }
    }
    /**
     * Writes `src` and `method` together and loads once: the loader is built
     * again for the pair when either changed, the page going back to the first
     * one as a single write of either does, and the table then reloads as
     * `reload()` does, whether or not they changed. Unlike a write of either,
     * it loads a table that has not loaded yet.
     * @param {{ src?: string|null, method?: string|null }} attributes a name
     * left out keeps its value, null removes the attribute
     * @returns {Promise<void>} as `load`
     */
    async reconfigure(attributes) {
        for (const name of ['src', 'method']) {
            if (name in attributes) {
                this.reflectTo(name, attributes[name] ?? null);
            }
        }
        this.#followAttributes();
        return await this.reload();
    }
    #buildLoader() {
        this.#builtFrom = { src: this.getAttribute('src'), method: this.getAttribute('method') };
        this.#loader = this.component(this.declared('loader') ?? 'loaders:table').create(this);
    }
    /** @returns {boolean} whether the loader was built again */
    #followAttributes() {
        if (
            this.getAttribute('src') === this.#builtFrom.src &&
            this.getAttribute('method') === this.#builtFrom.method
        ) {
            return false;
        }
        this.#buildLoader();
        this.#latestRequest = { ...this.#latestRequest, pageRequest: { ...this.#latestRequest.pageRequest, page: 0 } };
        this.#window = null;
        return true;
    }
    /**
     * @param {{ slots: Record<string, DocumentFragment> }} c
     * @returns {Promise<void>}
     * @throws {Error} when the `schema` slot is missing or holds no `<schema>`
     */
    async render({ slots }) {
        const template = this.template();
        const schema = TableSchemaParser.parse(slots.schema, template);
        const paging = this.declared('paging');
        const fragment = template
            .withOverlay({
                slots,
                schema,
                scrolled: paging === 'infinite' || paging === 'virtual',
                virtual: paging === 'virtual',
            })
            .render();
        const tableWrapper = /** @type HTMLTableElement */ (Nodes.queryChildren(fragment, 'ful-table-wrapper'));
        const table = /** @type HTMLTableElement */ (tableWrapper.querySelector('table'));
        Attributes.forward('table-', this, table);
        this.#buildLoader();

        this.#wrapper = tableWrapper;
        const status = Nodes.queryChildren(fragment, 'ful-table-status');
        this.#schema = schema;
        this.#body = table.querySelector(':scope > tbody:not([data-ref])');
        this.#loading = table.querySelector(':scope > tbody[data-ref=loading]');
        this.#noAutoload = table.querySelector(':scope > tbody[data-ref=initial]');
        this.#empty = table.querySelector(':scope > tbody[data-ref=empty]');
        this.#emptyAuthors = this.#empty.querySelector('ful-empty[data-ref=empty-authors]');
        this.#emptyTemplate =
            slots.empty && !Fragments.isBlank(slots.empty) ? Templates.fromFragment(slots.empty) : null;
        this.#feedback = table.querySelector(':scope > tbody[data-ref=feedback]');
        this.#paginator = Nodes.queryChildren(fragment, 'ful-pagination');
        this.replaceChildren(fragment);
        if (paging === 'virtual') {
            const overflow = getComputedStyle(tableWrapper).overflowY;
            this.#virtual = overflow === 'auto' || overflow === 'scroll';
            if (!this.#virtual) {
                console.warn(
                    'ful-table: paging="virtual" needs rows that scroll inside the table, as ful-fill makes them; this one appends its pages as paging="infinite" does',
                );
            }
        }
        if (status) {
            const piece = (/** @type string */ ref) =>
                /** @type Element */ (status.querySelector(`[data-ref=${ref}]`));
            this.#status = {
                count: piece('count'),
                appending: piece('appending'),
                failure: piece('append-failure'),
                error: piece('append-error'),
            };
            piece('reload').addEventListener('click', () => this.reload());
            piece('retry').addEventListener('click', () => {
                if (!this.#virtual) {
                    this.#appendNext();
                    return;
                }
                this.#windowFailed = false;
                this.#reconcile(true);
            });
        }
        if (this.#virtual) {
            this.#spacers = {
                before: /** @type HTMLElement */ (table.querySelector(':scope > tbody[data-ref=before] td')),
                after: /** @type HTMLElement */ (table.querySelector(':scope > tbody[data-ref=after] td')),
            };
            // scroll fires once per frame at most, so it needs no throttle of its own
            tableWrapper.addEventListener(
                'scroll',
                () => {
                    this.#countInView();
                    this.#reconcile(false);
                },
                { passive: true },
            );
            // a table that loaded while it was not laid out, in a tab not yet shown for one, has
            // measured nothing: with a first page shorter than its panel no scroll would ever come
            // to do it. Its box changing size is the moment it is laid out, or shows more rows.
            // A frame later: rows added while the sizes are being reported resize the header, which
            // is observed too, and the browser reports that as a resize loop.
            new ResizeObserver(() => {
                requestAnimationFrame(() => {
                    this.#countInView();
                    this.#reconcile(false);
                });
            }).observe(tableWrapper);
        } else if (status) {
            this.#endWatch = new IntersectionObserver((entries) => {
                // an entry queued before the watch moved on to another row, or stopped, asks for nothing
                if (entries.some((e) => e.isIntersecting && this.#watched.includes(e.target))) {
                    this.#appendNext();
                }
            });
        }
        const thead = /** @type HTMLTableSectionElement */ (this.querySelector('thead'));
        schema.headersTemplate.renderTo(thead);
        // the stylesheet starts the scrollbar of a filling table under its header, which it can
        // only do knowing how tall the header is: a title wrapping onto a second line changes it
        new ResizeObserver(() => {
            tableWrapper.style.setProperty('--ful-table-header-height', `${thead.getBoundingClientRect().height}px`);
        }).observe(thead);
        this.#sorters = thead.querySelectorAll('ful-sorter');
        await Rendering.waitForChildren(this);

        const maybeForm = /** @type any */ (Nodes.queryChildren(this, 'ful-form'));
        const declaredSize = this.declared('page-size');
        this.#latestRequest = {
            pageRequest: {
                page: 0,
                size: Number.isFinite(declaredSize) && declaredSize > 0 ? declaredSize : 10,
            },
            sortRequest: schema.sort,
            filterRequest: maybeForm?.values ?? {},
        };
        this.#requestedFilters = this.#latestRequest.filterRequest;
        this.#filters = maybeForm;
        maybeForm?.addEventListener('submit:success', async (evt) => {
            this.#filterLoad = this.#loadPage(0, evt.detail.request);
            await this.#filterLoad;
        });
        this.addEventListener('page:requested', async (/** @type any */ e) => {
            if (e.composedPath().find((n) => n instanceof Table) !== this) {
                return;
            }
            await this.#loadPage(e.detail.value, this.#requestedFilters);
        });
        this.addEventListener('sort:requested', async (/** @type any */ e) => {
            if (e.composedPath().find((n) => n instanceof Table) !== this) {
                return;
            }
            const sortRequest = e.detail.value.order ? e.detail.value : null;
            await this.load(this.#latestRequest.pageRequest, sortRequest, this.#requestedFilters);
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
     * with the declared size and sort. A size written through `pageSize` since
     * then replaces the page with the first one at that size.
     *
     * Before any load has loaded, a table with a `filters` slot submits its
     * filter form instead, so the first request goes through the same
     * `submit` listeners as the later ones, and the load its `submit:success`
     * starts is the one awaited. A filter submit that is cancelled, fails or
     * is dropped for one in flight loads nothing, and the promise resolves.
     *
     * Under `paging="virtual"`, once rows show, it asks again for the pages in
     * the page, with the same size, sort and filters, and shows them where
     * they are, the scroll position and the widths of the columns kept; the
     * table is busy and settles, fails and dispatches as a load does, one
     * `load:success` per page. When the answers report fewer rows than the
     * window starts at, it loads the first page instead. A `src` or `method`
     * write still starts over from the first page.
     * @returns {Promise<void>} as `load`
     */
    async reload() {
        if (this.#filters && !this.#loaded) {
            if (await this.#filters.submit()) {
                await this.#filterLoad;
            }
            return;
        }
        if (this.#window) {
            return await this.#reloadWindow();
        }
        return await this.load(
            this.#latestRequest.pageRequest,
            this.#latestRequest.sortRequest,
            this.#latestRequest.filterRequest,
        );
    }
    /**
     * Asks the loader for a page and shows it. Its filters are, from now on,
     * the ones a page, a sort or a size change carries, even while it runs
     * or once it failed.
     *
     * While the load runs the table carries `aria-busy="true"`, and the rows
     * already shown stay; the spinner panel shows only when there are none.
     * When the loader answers, the rows and the pager are replaced, the empty
     * panel shows for an answer with no rows (the `empty` slot rendered with
     * `schema`, `pageRequest`, `filterRequest` and `pageResponse` in scope),
     * the request becomes the one
     * `reload` repeats; once the elements of the rows and of the empty panel
     * have rendered, `aria-busy` is removed and `load:success` is
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
     * returned promise rejects with the same error. An answer the table cannot
     * page fails the same way, with an error saying so: one whose `size` is
     * not a number, as a response of another shape read without a
     * `response-mapper` is, or a page size of zero.
     *
     * A load started after this one supersedes it: when this one's answer or
     * failure arrives it changes nothing, dispatches nothing and resolves;
     * superseded while its rows render, it leaves them to the newer load and
     * dispatches nothing.
     *
     * Under `paging="infinite"` the status bar takes the pager's place, and
     * once the load has dispatched `load:success` the next page is awaited:
     * when a row of the last half page comes into view, through
     * whatever scrolls it, the following page is asked for with the same
     * size, sort and filters and its rows are appended. An append runs
     * without `aria-busy`, a spinner in the status bar standing in, and
     * dispatches `load:success` or `load:failure` as a load does, its
     * `pageRequest` naming the appended page. A failed append keeps the
     * rows, shows the error in the status bar with a retry button and
     * rejects to nobody, nothing awaiting it. Appending stops once the rows
     * shown reach the total the last answer reported, or an answer carries
     * no rows. A load supersedes an append in flight; `reload` repeats this
     * load, not the pages appended to it.
     *
     * Under `paging="virtual"` the load shows its page as the window, scrolled
     * to where it sits among the total, and measures two things on its rows:
     * the height the empty space standing in for the other rows is sized on,
     * and the width of the columns, which then stay as they are, in
     * proportion, until the next load, so that the pages coming and going do
     * not move them. From then on the window follows the scroll: the page in
     * view and one on either side stay in the page and the others are dropped,
     * the page holding the focus kept while it is within two pages of them. A
     * page next to the window is asked for at once; a scroll landing farther
     * waits for the scroll to rest. Window pages are asked for without
     * `aria-busy`, a spinner in the status bar standing in, and dispatch
     * `load:success` or `load:failure` per page as appends do; a failure keeps
     * the rows and offers a retry. The row in view stays where it is as pages
     * come and go above it: the table measures it before and after and
     * corrects the scroll by whatever the browser's own scroll anchoring has
     * not kept, which is all of it where the browser anchors no table rows
     * (Firefox), has no scroll anchoring or the rows' container declares
     * `overflow-anchor: none`, and nothing where it has. The table carries
     * `aria-rowcount` and each row its `aria-rowindex`.
     * @param {TablePageRequest} pageRequest
     * @param {TableSortRequest|null} sortRequest
     * @param {Record<string, any>} filterRequest
     * @returns {Promise<void>}
     * @throws what the loader rejects with, unless a newer load superseded this one
     */
    async load(pageRequest, sortRequest, filterRequest) {
        this.#loadRequested = true;
        this.#requestedFilters = filterRequest;
        const claim = this.#loads.take();
        this.#watched = [];
        this.#endWatch?.disconnect();
        clearTimeout(this.#jump);
        this.#shifting = null;
        this.#windowFailed = false;
        this.#status?.appending.setAttribute('hidden', '');
        this.#status?.failure.setAttribute('hidden', '');
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
            if (!Number.isFinite(lastPage)) {
                throw new Error(
                    `ful-table cannot page the loader's answer: it needs { data, size }, size being the total number of rows, and got a size of ${pageResponse.size} for pages of ${pageRequest.size}. A response of another shape needs a response-mapper`,
                );
            }
            if (pageRequest.page <= lastPage) {
                this.#latestRequest = { pageRequest, sortRequest, filterRequest };
                this.#loaded = true;
                this.#update(pageRequest, sortRequest, filterRequest, pageResponse);
                // a row element whose render fails leaves the rows shown: it does not fail the load
                await Promise.all([
                    Rendering.waitForChildren(this.#body),
                    Rendering.waitForChildren(this.#empty),
                ]).catch(() => undefined);
                if (claim.stale) {
                    return;
                }
                if (this.#virtual) {
                    this.#settleWindow();
                }
                this.removeAttribute('aria-busy');
                this.dispatchEvent(
                    new CustomEvent('load:success', {
                        bubbles: true,
                        cancelable: false,
                        detail: { pageRequest, sortRequest, filterRequest, response: pageResponse },
                    }),
                );
                this.#watchEnd(pageRequest.size);
                this.#reconcile(false);
                return;
            }
        } catch (/** @type any */ error) {
            if (claim.stale) {
                return;
            }
            this.#fail(error, { pageRequest, sortRequest, filterRequest });
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
    /**
     * Watches the last half page of rows, so that any of them coming into
     * view appends the next page, unless the rows shown already reach the
     * total or the last answer carried none. A single row would be missed by
     * a scroll jumping past it, to the end for instance.
     * @param {number} size the rows a page asks for
     */
    #watchEnd(size) {
        const { shown, total, last } = this.#appended;
        if (!this.#endWatch || !(shown < total) || last === 0) {
            return;
        }
        const rows = [...this.#body.children];
        this.#watched = rows.slice(Math.max(0, rows.length - Math.ceil(size / 2)));
        for (const row of this.#watched) {
            this.#endWatch.observe(row);
        }
    }
    async #appendNext() {
        const status = /** @type TableStatus */ (this.#status);
        this.#watched = [];
        this.#endWatch?.disconnect();
        const { sortRequest, filterRequest } = this.#latestRequest;
        const pageRequest = { page: this.#appended.next, size: this.#latestRequest.pageRequest.size };
        const claim = this.#loads.take();
        status.failure.setAttribute('hidden', '');
        status.appending.removeAttribute('hidden');
        try {
            const pageResponse = await this.#loader.load(pageRequest, sortRequest, filterRequest);
            if (claim.stale) {
                return;
            }
            this.#body.append(
                this.template('row')
                    .withOverlay({ schema: this.#schema, pageRequest, filterRequest, pageResponse })
                    .render(),
            );
            this.#appended = {
                next: pageRequest.page + 1,
                shown: this.#appended.shown + pageResponse.data.length,
                total: pageResponse.size,
                last: pageResponse.data.length,
            };
            status.count.textContent = Localization.of().t('table.loaded', {
                loaded: this.#appended.shown,
                total: this.#appended.total,
            });
            await Rendering.waitForChildren(this.#body).catch(() => undefined);
            if (claim.stale) {
                return;
            }
            status.appending.setAttribute('hidden', '');
            this.dispatchEvent(
                new CustomEvent('load:success', {
                    bubbles: true,
                    cancelable: false,
                    detail: { pageRequest, sortRequest, filterRequest, response: pageResponse },
                }),
            );
            this.#watchEnd(pageRequest.size);
        } catch (/** @type any */ error) {
            if (claim.stale) {
                return;
            }
            status.appending.setAttribute('hidden', '');
            status.error.textContent = Localization.of().failure(error);
            status.failure.removeAttribute('hidden');
            this.dispatchEvent(
                new CustomEvent('load:failure', {
                    bubbles: true,
                    cancelable: false,
                    detail: { pageRequest, sortRequest, filterRequest, exception: error },
                }),
            );
        }
    }
    /**
     * Renders the rows of a page, numbering them with `aria-rowindex` under
     * `paging="virtual"`, the header row being the first.
     * @param {TablePageRequest} pageRequest
     * @param {Record<string, any>} filterRequest
     * @param {TablePageResponse} pageResponse
     * @returns {Element[]}
     */
    #pageRows(pageRequest, filterRequest, pageResponse) {
        const rows = [
            ...this.template('row')
                .withOverlay({ schema: this.#schema, pageRequest, filterRequest, pageResponse })
                .render().children,
        ];
        if (this.#virtual) {
            rows.forEach((row, i) => {
                row.setAttribute('aria-rowindex', String(pageRequest.page * pageRequest.size + i + 2));
            });
        }
        return rows;
    }
    /**
     * Shows a failed load: the rows go, the error panel shows and
     * `load:failure` is dispatched.
     * @param {any} error
     * @param {{ pageRequest: TablePageRequest, sortRequest: TableSortRequest|null, filterRequest: Record<string, any> }} request
     */
    #fail(error, request) {
        this.#loading.setAttribute('hidden', '');
        this.#body.replaceChildren();
        this.#window = null;
        this.#fitSpacers();
        this.#status?.count.replaceChildren();
        this.#feedback.removeAttribute('hidden');
        this.#feedback.querySelector('[data-ref=feedback-error]').textContent = Localization.of().failure(error);
        this.removeAttribute('aria-busy');
        this.dispatchEvent(
            new CustomEvent('load:failure', {
                bubbles: true,
                cancelable: false,
                detail: { ...request, exception: error },
            }),
        );
    }
    /** Counts the rows of a load just shown and moves the window where its page sits. */
    #settleWindow() {
        const table = /** @type HTMLTableElement */ (this.#body.parentElement);
        table.setAttribute('aria-rowcount', String(this.#total + 1));
        table.tHead?.rows[0]?.setAttribute('aria-rowindex', '1');
        const status = /** @type TableStatus */ (this.#status);
        const window = this.#window;
        if (!window) {
            this.#fitSpacers();
            status.count.textContent = Localization.of().t('table.loaded', { loaded: 0, total: this.#total });
            return;
        }
        const size = this.#latestRequest.pageRequest.size;
        const from = window.first * size;
        status.count.textContent = Localization.of().t('table.range', {
            from: from + 1,
            to: from + /** @type Element[] */ (window.pages.get(window.first)).length,
            total: this.#total,
        });
        if (this.#measureRows()) {
            this.#wrapper.scrollTop = from * this.#rowHeight;
        }
    }
    /**
     * Measures the height of a row and locks the widths of the columns, once
     * per load, on the rows it shows, then sizes the spacers. A table that is not laid out, inside a
     * closed disclosure for instance, measures nothing and is measured when
     * it is laid out, or when its rows next scroll.
     * @returns {boolean} whether the rows are measured
     */
    #measureRows() {
        if (this.#rowHeight > 0) {
            return true;
        }
        const count = this.#body.childElementCount;
        const height = this.#body.getBoundingClientRect().height;
        if (count === 0 || height === 0) {
            return false;
        }
        this.#rowHeight = height / count;
        this.#lockColumns();
        this.#fitSpacers();
        return true;
    }
    /**
     * Fixes the widths of the columns, in proportion to the table, at those
     * the rows in the page give them.
     */
    #lockColumns() {
        const table = /** @type HTMLTableElement */ (this.#body.parentElement);
        const widths = [...(table.tHead?.rows[0]?.cells ?? [])].map((cell) => cell.getBoundingClientRect().width);
        const sum = widths.reduce((a, b) => a + b, 0);
        const columns = document.createElement('colgroup');
        columns.setAttribute('data-ref', 'widths');
        for (const width of widths) {
            const column = document.createElement('col');
            column.style.width = `${(width / sum) * 100}%`;
            columns.append(column);
        }
        table.insertBefore(columns, table.tHead);
    }
    /**
     * Locks the widths of the columns again, on the rows now in the page, when
     * one of them holds something its column has no room for and that cannot
     * wrap: left as it is it would stick out of the table, and the rows would
     * scroll sideways for it.
     */
    #widenColumns() {
        const cramped = [...this.#body.querySelectorAll(':scope > tr > *')].some((cell) => cell.scrollWidth > cell.clientWidth + 1);
        if (cramped) {
            this.#unlockColumns();
            this.#lockColumns();
        }
    }
    #unlockColumns() {
        this.#body.parentElement?.querySelector(':scope > colgroup[data-ref=widths]')?.remove();
    }
    /** Sizes the space standing in for the rows above and below the window. */
    #fitSpacers() {
        if (!this.#spacers) {
            return;
        }
        const window = this.#window;
        const size = this.#latestRequest.pageRequest.size;
        const above = window ? window.first * size : 0;
        const below = window ? Math.max(0, this.#total - (window.last + 1) * size) : 0;
        this.#spacers.before.style.height = `${above * this.#rowHeight}px`;
        this.#spacers.after.style.height = `${below * this.#rowHeight}px`;
    }
    /** Says in the status bar which rows are in view; nothing changes while none is. */
    #countInView() {
        const status = /** @type TableStatus */ (this.#status);
        const size = this.#latestRequest.pageRequest.size;
        const view = this.#wrapper.getBoundingClientRect();
        const top = view.top + (this.#body.parentElement?.querySelector(':scope > thead')?.getBoundingClientRect().height ?? 0);
        let from = 0;
        let to = 0;
        for (const [page, rows] of this.#window?.pages ?? []) {
            rows.forEach((row, i) => {
                const rect = row.getBoundingClientRect();
                if (rect.bottom > top && rect.top < view.bottom) {
                    from ||= page * size + i + 1;
                    to = page * size + i + 1;
                }
            });
        }
        if (from > 0) {
            status.count.textContent = Localization.of().t('table.range', { from, to, total: this.#total });
        }
    }
    /**
     * The page at the middle of the view: found among the rows in the page,
     * or estimated on the height of a row when the middle falls in the space
     * standing in for others.
     * @param {{ first: number, last: number, pages: Map<number, Element[]> }} window
     * @returns {number}
     */
    #pageInView(window) {
        const pageHeight = this.#latestRequest.pageRequest.size * this.#rowHeight;
        const view = this.#wrapper.getBoundingClientRect();
        const middle = view.top + view.height / 2;
        const rows = this.#body.getBoundingClientRect();
        if (middle < rows.top) {
            return Math.max(0, window.first - Math.ceil((rows.top - middle) / pageHeight));
        }
        if (middle >= rows.bottom) {
            return window.last + 1 + Math.floor((middle - rows.bottom) / pageHeight);
        }
        let found = window.first;
        for (const [page, pageRows] of window.pages) {
            if (pageRows.length > 0 && pageRows[0].getBoundingClientRect().top <= middle) {
                found = page;
            }
        }
        return found;
    }
    /**
     * Moves the window to the page in view and its neighbours. A window next
     * to the current one moves at once; one farther away waits for the scroll
     * to rest, unless `settled` says it has. A table that is no longer laid
     * out, in a tab switched away from for instance, has no page in view and
     * keeps its window: its boxes all measure nothing, which reads as rows
     * scrolled past, and each page loaded for that would ask for the next.
     * @param {boolean} settled
     */
    #reconcile(settled) {
        const window = this.#window;
        const pageCount = Math.ceil(this.#total / this.#latestRequest.pageRequest.size);
        if (
            !window ||
            this.#shifting ||
            this.#windowFailed ||
            this.hasAttribute('aria-busy') ||
            !this.#wrapper.isConnected ||
            !(pageCount > 0) ||
            !this.#measureRows() ||
            this.#wrapper.getBoundingClientRect().height === 0
        ) {
            return;
        }
        const target = Math.min(pageCount - 1, this.#pageInView(window));
        let first = Math.max(0, target - 1);
        let last = Math.min(pageCount - 1, target + 1);
        const focused = this.#body.contains(document.activeElement)
            ? /** @type Element */ (document.activeElement).closest('tr')
            : null;
        const focusedPage = [...window.pages].find(([, rows]) => focused && rows.includes(focused))?.[0];
        if (focusedPage !== undefined && Math.max(last, focusedPage) - Math.min(first, focusedPage) <= 4) {
            first = Math.min(first, focusedPage);
            last = Math.max(last, focusedPage);
        }
        if (first === window.first && last === window.last) {
            return;
        }
        clearTimeout(this.#jump);
        if (!settled && (last < window.first - 1 || first > window.last + 1)) {
            this.#jump = setTimeout(() => this.#reconcile(true), 150);
            return;
        }
        this.#shiftWindow(window, first, last);
    }
    /**
     * Asks for the pages of the new window that are not in the page, drops
     * the ones outside it and keeps the row in view where it is.
     * @param {{ first: number, last: number, pages: Map<number, Element[]> }} window
     * @param {number} first
     * @param {number} last
     */
    async #shiftWindow(window, first, last) {
        const status = /** @type TableStatus */ (this.#status);
        const claim = this.#loads.hold();
        this.#shifting = claim;
        const { sortRequest, filterRequest } = this.#latestRequest;
        const size = this.#latestRequest.pageRequest.size;
        const wanted = Array.from({ length: last - first + 1 }, (_, i) => first + i);
        const missing = wanted.filter((page) => !window.pages.has(page));
        status.failure.setAttribute('hidden', '');
        status.appending.removeAttribute('hidden');
        try {
            const answers = await Promise.all(
                missing.map(async (page) => {
                    const pageRequest = { page, size };
                    return { pageRequest, response: await this.#loader.load(pageRequest, sortRequest, filterRequest) };
                }),
            );
            if (claim.stale) {
                return;
            }
            const kept = wanted.filter((page) => window.pages.has(page));
            const top = this.#wrapper.getBoundingClientRect().top;
            const anchor = kept
                .flatMap((page) => window.pages.get(page) ?? [])
                .find((row) => row.getBoundingClientRect().bottom > top);
            const anchorTop = anchor?.getBoundingClientRect().top ?? 0;
            for (const [page, rows] of window.pages) {
                if (page < first || page > last) {
                    for (const row of rows) {
                        row.remove();
                    }
                }
            }
            /** @type {Map<number, Element[]>} */
            const pages = new Map();
            for (const page of wanted) {
                const answer = answers.find((a) => a.pageRequest.page === page);
                pages.set(
                    page,
                    window.pages.get(page) ??
                        (answer ? this.#pageRows(answer.pageRequest, filterRequest, answer.response) : []),
                );
            }
            if (kept.length === 0) {
                this.#body.replaceChildren(...[...pages.values()].flat());
            } else {
                this.#body.prepend(...wanted.filter((page) => page < kept[0]).flatMap((page) => pages.get(page) ?? []));
                this.#body.append(
                    ...wanted.filter((page) => page > /** @type number */ (kept.at(-1))).flatMap((page) => pages.get(page) ?? []),
                );
            }
            this.#window = { first, last, pages };
            this.#total = answers.at(-1)?.response.size ?? this.#total;
            this.#body.parentElement?.setAttribute('aria-rowcount', String(this.#total + 1));
            this.#fitSpacers();
            this.#widenColumns();
            if (anchor) {
                this.#wrapper.scrollTop += anchor.getBoundingClientRect().top - anchorTop;
            }
            await Rendering.waitForChildren(this.#body).catch(() => undefined);
            if (claim.stale) {
                return;
            }
            this.#widenColumns();
            if (anchor) {
                // the elements in the new rows have rendered since, which can change their height
                this.#wrapper.scrollTop += anchor.getBoundingClientRect().top - anchorTop;
            }
            status.appending.setAttribute('hidden', '');
            this.#countInView();
            for (const { pageRequest, response } of answers) {
                this.dispatchEvent(
                    new CustomEvent('load:success', {
                        bubbles: true,
                        cancelable: false,
                        detail: { pageRequest, sortRequest, filterRequest, response },
                    }),
                );
            }
        } catch (/** @type any */ error) {
            if (claim.stale) {
                return;
            }
            this.#windowFailed = true;
            status.appending.setAttribute('hidden', '');
            status.error.textContent = Localization.of().failure(error);
            status.failure.removeAttribute('hidden');
            this.dispatchEvent(
                new CustomEvent('load:failure', {
                    bubbles: true,
                    cancelable: false,
                    detail: { pageRequest: { page: missing[0], size }, sortRequest, filterRequest, exception: error },
                }),
            );
            return;
        } finally {
            if (this.#shifting === claim) {
                this.#shifting = null;
            }
        }
        this.#reconcile(false);
    }
    /**
     * Asks again for the pages of the window and shows them where they are.
     * @returns {Promise<void>}
     */
    async #reloadWindow() {
        const window = /** @type {{ first: number, last: number, pages: Map<number, Element[]> }} */ (this.#window);
        const status = /** @type TableStatus */ (this.#status);
        const { sortRequest, filterRequest } = this.#latestRequest;
        const size = this.#latestRequest.pageRequest.size;
        this.#requestedFilters = filterRequest;
        const claim = this.#loads.take();
        clearTimeout(this.#jump);
        this.#shifting = null;
        this.#windowFailed = false;
        status.appending.setAttribute('hidden', '');
        status.failure.setAttribute('hidden', '');
        this.setAttribute('aria-busy', 'true');
        const wanted = Array.from({ length: window.last - window.first + 1 }, (_, i) => window.first + i);
        try {
            const answers = await Promise.all(
                wanted.map(async (page) => {
                    const pageRequest = { page, size };
                    return { pageRequest, response: await this.#loader.load(pageRequest, sortRequest, filterRequest) };
                }),
            );
            if (claim.stale) {
                return;
            }
            const total = /** @type {{ response: TablePageResponse }} */ (answers.at(-1)).response.size;
            const pageCount = Math.ceil(total / size);
            if (!(window.first < pageCount)) {
                return await this.load({ page: 0, size }, sortRequest, filterRequest);
            }
            const shown = answers.filter((a) => a.pageRequest.page < pageCount);
            const pages = new Map(
                shown.map((a) => [a.pageRequest.page, this.#pageRows(a.pageRequest, filterRequest, a.response)]),
            );
            this.#body.replaceChildren(...[...pages.values()].flat());
            this.#window = { first: window.first, last: Math.min(window.last, pageCount - 1), pages };
            this.#total = total;
            this.#body.parentElement?.setAttribute('aria-rowcount', String(total + 1));
            this.#fitSpacers();
            await Rendering.waitForChildren(this.#body).catch(() => undefined);
            if (claim.stale) {
                return;
            }
            this.#widenColumns();
            this.removeAttribute('aria-busy');
            this.#countInView();
            for (const { pageRequest, response } of shown) {
                this.dispatchEvent(
                    new CustomEvent('load:success', {
                        bubbles: true,
                        cancelable: false,
                        detail: { pageRequest, sortRequest, filterRequest, response },
                    }),
                );
            }
            this.#reconcile(false);
        } catch (/** @type any */ error) {
            if (claim.stale) {
                return;
            }
            this.#fail(error, { pageRequest: { page: window.first, size }, sortRequest, filterRequest });
            throw error;
        }
    }
    #update(pageRequest, sortRequest, filterRequest, pageResponse) {
        this.#loading.setAttribute('hidden', '');
        if (this.#virtual) {
            this.#rowHeight = 0;
            this.#unlockColumns();
        }
        const rows = this.#pageRows(pageRequest, filterRequest, pageResponse);
        this.#body.replaceChildren(...rows);
        this.#empty.toggleAttribute('hidden', pageResponse.data.length !== 0);
        if (this.#emptyTemplate && pageResponse.data.length === 0) {
            this.#emptyAuthors.replaceChildren(
                this.#emptyTemplate
                    .withOverlay({ schema: this.#schema, pageRequest, filterRequest, pageResponse })
                    .render(),
            );
        }
        if (this.#virtual) {
            this.#wrapper.scrollTop = 0;
            this.#total = pageResponse.size;
            this.#window =
                rows.length > 0 ? { first: pageRequest.page, last: pageRequest.page, pages: new Map([[pageRequest.page, rows]]) } : null;
            return;
        }
        if (this.#status) {
            this.#wrapper.scrollTop = 0;
            this.#appended = {
                next: pageRequest.page + 1,
                shown: pageResponse.data.length,
                total: pageResponse.size,
                last: pageResponse.data.length,
            };
            this.#status.count.textContent = Localization.of().t('table.loaded', {
                loaded: this.#appended.shown,
                total: this.#appended.total,
            });
            return;
        }
        this.#paginator.update({ current: pageRequest.page, total: Math.ceil(pageResponse.size / pageRequest.size) });
    }
}

export { TableLoader, SortButton, Table, TableSchemaParser, Pagination };
