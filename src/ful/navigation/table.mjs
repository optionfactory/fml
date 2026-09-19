import { Attributes, Fragments, Nodes, ParsedElement, Rendering } from '../../ftl/index.mjs';
import { Claims } from '../claims.mjs';
import { Failure } from '../../httpc/index.mjs';

/** The sort control of a table header: focusable, keyboard-activated, walking asc, desc, unsorted. */
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
                    cancelable: true,
                    detail: {
                        value: { sorter, order: nextOrder },
                    },
                }),
            );
        });
        this.addEventListener('keydown', (/** @type any */ evt) => {
            if (evt.code !== 'Enter' && evt.code !== 'Space') {
                return;
            }
            evt.preventDefault();
            this.click();
        });
    }

    get order() {
        return this.#order || null;
    }

    set order(value) {
        this.#order = value || null;
        this.reflectTo('order', this.#order);
        //the column announces the sort, not this button: an attribute on another
        //element is not a reflection and has no business inside the guard
        const th = this.closest('th');
        if (!th) {
            return;
        }
        Attributes.set(th, 'aria-sort', this.#order ? ('asc' === this.#order ? 'ascending' : 'descending') : null);
    }
}

/** The pager: a window of page links around the current one, and the reload control. */
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
                //a disabled button leads nowhere: the page it would ask for does not exist
                return;
            }
            if (el.getAttribute('aria-current') === 'page') {
                //the page already shown stays focusable and announced, so it is a
                //real control: it just has nothing to ask for
                return;
            }
            this.dispatchEvent(
                new CustomEvent('page:requested', {
                    bubbles: true,
                    cancelable: true,
                    detail: {
                        value: Number(el.dataset.page ?? this.#current),
                    },
                }),
            );
        });
    }
    /**
     * Moves the pager to a page, a page count, or both, and repaints once. The
     * two are one state: writing them one at a time repainted the bar twice per
     * load, the first pass drawing the new page against the old count.
     * @param {{ current?: number|null, total?: number|null }} [state]
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
        //an empty table is one empty page: everything downstream renders it like
        //any single page result
        const pageCount = Math.max(total, 1);
        const hasPrev = current > 0;
        const hasNext = current + 1 < pageCount;
        //a disabled arrow carries no page: there is nothing valid for it to point at
        const prev = { index: hasPrev ? current - 1 : null, enabled: hasPrev };
        const curr = { index: current, label: current + 1 };
        const next = { index: hasNext ? current + 1 : null, enabled: hasNext };
        //the window holds at most maxRender pages, centered on the current one and slid
        //back towards the end so it stays full on the last pages
        const rendered = Math.max(1, Math.min(maxRender, pageCount));
        const first = Math.max(0, Math.min(current - Math.floor((rendered - 1) / 2), pageCount - rendered));
        const pages = Array.from({ length: rendered }, (_, offset) => ({
            index: first + offset,
            label: first + offset + 1,
        }));
        //the whole bar is replaced, so the control the reader activated is gone
        //by the time the new one paints: the focus follows it to its equivalent
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
    get total() {
        return this.#total;
    }
    set total(value) {
        //an absent attribute declares no pages, not a NaN one
        this.update({ total: value });
    }
    get current() {
        return this.#current;
    }
    set current(value) {
        this.update({ current: value });
    }
}

/** Reads the schema declaration into the header and row templates a table renders from. */
class TableSchemaParser {
    static parse(nodeOrFragment, template) {
        //nodeOrFragment is undefined when the slot is missing altogether
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
        //only a sortable column carries the initial sort: an order without its
        //sorter would ask the backend for a "null" property
        const sort =
            columns
                .filter((v) => v.hasAttribute('order') && v.hasAttribute('sorter'))
                .map((v) => ({ sorter: v.getAttribute('sorter'), order: v.getAttribute('order') }))[0] ?? null;
        for (var column of columns) {
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
            //a column's attributes land on both cells, so a `data-tpl-*` written
            //once applies to the header and the body alike. `inHeaders` and
            //`inRows` are how an author tells them apart when that is not what
            //they meant: both templates carry the pair, so a column can say
            //`data-tpl-if="inRows"` and appear in the body only
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
            sort: sort,
            length: columns.length,
        };
    }
}

/** Serves a table's rows from an array held in memory, applying the sort and the paging itself. */
class InMemoryTableLoader {
    #data;
    constructor(data) {
        this.#data = data;
    }
    async load(pageRequest, sortRequest, filterRequest) {
        //the header renders a sorter per sortable column whatever the loader is,
        //so the local one answers it rather than leaving it inert
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
            //a missing value sorts last whichever way the column points
            if (a == null) {
                return 1;
            }
            if (b == null) {
                return -1;
            }
            return (a < b ? -1 : 1) * sign;
        });
    }
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
    constructor(http, url, method, responseMapper = (response) => response) {
        this.#http = http;
        this.#url = url;
        this.#method = method;
        this.#responseMapper = responseMapper;
    }
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
 * `{ data, page, size }` for the requested page. `pageRequest` carries the page
 * index and its size, `sortRequest` the column and direction, and
 * `filterRequest` the values of the filters in the slot.
 */
class TableLoader {
    static create(el, conf) {
        const url = el.getAttribute('src');
        if (url) {
            const http = el.component('http-client');
            const method = el.getAttribute('method') ?? 'GET';
            const responseMapper = el.hasAttribute('response-mapper')
                ? el.component(el.getAttribute('response-mapper'))
                : (/** @type any */ response) => response;
            return new RemoteTableLoader(http, url, method, responseMapper);
        }
        return new InMemoryTableLoader([]);
    }
}

/** A table loading its rows from a loader, with sorting, pagination and an optional filter form. */
class Table extends ParsedElement {
    static attributes = ['loader', 'autoload:presence'];
    /**
     * The page size stays live: a rows-per-page control is a normal thing to
     * put next to a table, and the size is the one piece of the request an
     * author changes after the table is up. The rest of the request is the
     * table's own state, moved by the pager, the sorters and the filter form.
     */
    static observed = ['page-size:number'];
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
                            <ful-empty data-tpl-if="slots.empty">{{{{ slots.empty }}}}</ful-empty>
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
    #feedback;
    #paginator;
    #sorters;
    //initialised before the render so the size can be read and written on an
    //element the page has only just created
    /** @type {{ pageRequest: { page: number, size: number }, sortRequest: any, filterRequest: any }} */
    #latestRequest = { pageRequest: { page: 0, size: 10 }, sortRequest: null, filterRequest: {} };
    /** whether a load has been asked for, by autoload or by a caller */
    #loadRequested = false;
    #loads = new Claims();
    /** How many rows a page asks the loader for: the size the next load will carry. */
    get pageSize() {
        return this.#latestRequest.pageRequest.size;
    }
    /**
     * Changes the page size and reloads from the first page, the current index
     * meaning nothing under a new size. A table that has not loaded yet only
     * records it: writing the size is not a request to start loading, which is
     * what `autoload` and `reload()` are for.
     *
     * Absent or null is the default of ten, so removing the attribute restores
     * it rather than asking the loader for NaN rows.
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
        //the rejection escapes on purpose, as it does for the page, sort and
        //filter listeners: load renders its own error state and the unhandled
        //rejection is what reports the failure
        this.reload();
    }
    async render({ slots }) {
        const template = this.template();
        const schema = TableSchemaParser.parse(slots.schema, template);
        const fragment = template.withOverlay({ slots, schema }).render();
        const tableWrapper = /** @type HTMLTableElement */ (Nodes.queryChildren(fragment, 'ful-table-wrapper'));
        const table = /** @type HTMLTableElement */ (tableWrapper.querySelector('table'));
        Attributes.forward('table-', this, table);
        this.#loader = this.component(this.declared('loader') ?? 'loaders:table').create(this);

        this.#schema = schema;
        this.#body = table.querySelector(':scope > tbody');
        this.#loading = table.querySelector(':scope > tbody[data-ref=loading]');
        this.#noAutoload = table.querySelector(':scope > tbody[data-ref=initial]');
        this.#empty = table.querySelector(':scope > tbody[data-ref=empty]');
        this.#feedback = table.querySelector(':scope > tbody[data-ref=feedback]');
        this.#paginator = Nodes.queryChildren(fragment, 'ful-pagination');
        this.replaceChildren(fragment);
        const thead = /** @type HTMLTableSectionElement */ (this.querySelector('thead'));
        schema.headersTemplate.renderTo(thead);
        this.#sorters = thead.querySelectorAll('ful-sorter');
        await Rendering.waitForChildren(this);

        const maybeForm = /** @type any */ (Nodes.queryChildren(this, 'ful-form'));
        //the declared size lands here rather than through the setter: the base
        //applies the observed values after the render returns, and by then the
        //autoload below has already asked for the first page
        this.#latestRequest = {
            pageRequest: {
                page: 0,
                size: this.declared('page-size') ?? 10,
            },
            sortRequest: schema.sort,
            filterRequest: maybeForm?.values ?? {},
        };
        //the page, sort and filter listeners let load's rejection escape on purpose:
        //load renders its own error state, and the unhandled rejection is what
        //reports the failure (the autoload below reports the same way)
        maybeForm?.addEventListener('submit:success', async (evt) => {
            await this.load(
                {
                    page: 0,
                    size: this.#latestRequest.pageRequest.size,
                },
                this.#latestRequest.sortRequest,
                evt.detail.request,
            );
        });
        this.addEventListener('page:requested', async (/** @type any */ e) => {
            await this.load(
                {
                    page: e.detail.value,
                    size: this.#latestRequest.pageRequest.size,
                },
                this.#latestRequest.sortRequest,
                this.#latestRequest.filterRequest,
            );
        });
        this.addEventListener('sort:requested', async (/** @type any */ e) => {
            const sortRequest = e.detail.value.order ? e.detail.value : null;
            await this.load(this.#latestRequest.pageRequest, sortRequest, this.#latestRequest.filterRequest);
            //only the load that still owns the table commits the header: a superseded
            //sort must not wipe the arrows of the one that won, and a failed one
            //leaves them where they were
            if (this.#latestRequest.sortRequest !== sortRequest) {
                return;
            }
            this.#sorters.forEach((s) => {
                s.order = null;
            });
            e.target.order = e.detail.value.order;
        });
        if (this.declared('autoload')) {
            //not awaited: the first load must not hold up the upgrade, and a loader that
            //fails or never answers must not keep ftl:ready from firing for the page.
            //load renders its own error state and lets the failure reject, so it is reported
            this.reload();
        }
    }

    async reload() {
        return await this.load(
            this.#latestRequest.pageRequest,
            this.#latestRequest.sortRequest,
            this.#latestRequest.filterRequest,
        );
    }
    async load(pageRequest, sortRequest, filterRequest) {
        //marked before the await, not when a response comes back: a size written
        //while the first load is still in flight has to reload rather than be
        //overwritten by the answer to the request it replaced
        this.#loadRequested = true;
        //each load claims the table: a response resolving after a newer load has
        //started is stale, and neither renders nor updates the request a later
        //reload replays, whichever order the responses arrive in
        const claim = this.#loads.take();
        //the rows stay while the table revalidates. Emptying the body and raising
        //the spinner row in its place collapsed the table to one tall row and
        //expanded it again on every sort, page and reload: two layout jumps for
        //what is the same table with newer rows in it. The spinner is for the load
        //with nothing to show yet, the first one and the one after a failure; the
        //rest announce themselves through aria-busy, which the stylesheet reads
        this.#loading.toggleAttribute('hidden', this.#body.childElementCount > 0);
        this.#feedback.setAttribute('hidden', '');
        this.#noAutoload.setAttribute('hidden', '');
        this.#empty.setAttribute('hidden', '');
        this.setAttribute('aria-busy', 'true');
        try {
            const pageResponse = await this.#loader.load(pageRequest, sortRequest, filterRequest);
            if (claim.stale) {
                return;
            }
            this.#latestRequest = { pageRequest, sortRequest, filterRequest };
            this.#update(pageRequest, sortRequest, filterRequest, pageResponse);
            //settled before the event: a listener counting what loaded has to
            //see the table as it now is
            this.removeAttribute('aria-busy');
            this.dispatchEvent(
                new CustomEvent('load:success', {
                    bubbles: true,
                    cancelable: false,
                    detail: { pageRequest, sortRequest, filterRequest, response: pageResponse },
                }),
            );
        } catch (/** @type any */ error) {
            if (claim.stale) {
                //the newer load owns the table and its outcome: a superseded
                //failure is neither shown nor thrown
                return;
            }
            this.#loading.setAttribute('hidden', '');
            //the rows the failed load was replacing go with it: what the table
            //holds is no longer what the request asked for, and leaving them
            //under the error would say the opposite
            this.#body.replaceChildren();
            this.#feedback.removeAttribute('hidden');
            this.#feedback.querySelector('[data-ref=feedback-error]').textContent = Failure.problemsText(
                error,
                `${error}`,
            );
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
    }
    /** Hands the loader to the callback, for runtime reconfigurations. */
    async withLoader(fn) {
        return await fn(this.#loader);
    }
    async resetWithFilter(filterRequest) {
        return await this.load(
            {
                page: 0,
                size: this.#latestRequest.pageRequest.size,
            },
            this.#latestRequest.sortRequest,
            filterRequest,
        );
    }
    #update(pageRequest, sortRequest, filterRequest, pageResponse) {
        const pages = Math.ceil(pageResponse.size / pageRequest.size);
        const lastPage = Math.max(0, pages - 1);
        if (pageRequest.page > lastPage) {
            //the data shrank behind the page being answered: the last page that
            //still exists is loaded instead of an out-of-range empty one
            this.load({ page: lastPage, size: pageRequest.size }, sortRequest, filterRequest);
            return;
        }
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
        //one move, one repaint: the page and the count are the same state
        this.#paginator.update({ current: pageRequest.page, total: pages });
    }
}

export { TableLoader, SortButton, Table, TableSchemaParser, Pagination };
