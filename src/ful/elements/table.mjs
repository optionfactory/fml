import { Attributes, Fragments, Nodes, ParsedElement, registry, Rendering } from '../../ftl/index.mjs';

class SortButton extends ParsedElement {
    static observed = ['order'];
    #order;
    render() {
        const sorter = this.getAttribute('sorter');
        const orders = ['asc', 'desc', null];
        this.addEventListener('click', () => {
            const nextOrder = orders[(orders.indexOf(this.order) + 1) % 3];
            this.dispatchEvent(
                new CustomEvent('sort-requested', {
                    bubbles: true,
                    cancelable: true,
                    detail: {
                        value: { sorter, order: nextOrder },
                    },
                }),
            );
        });
    }

    get order() {
        return this.#order || null;
    }

    set order(value) {
        this.#order = value || null;
        this.reflect(() => {
            if (this.#order) {
                this.setAttribute('order', value);
            } else {
                this.removeAttribute('order');
            }
        });
    }
}

class Pagination extends ParsedElement {
    static observed = ['total:number', 'current:number'];
    static l10n = {
        en: {
            showing: 'Page {0} of {1}',
            navigation: 'Page navigation',
            previous: 'Previous',
            next: 'Next',
        },
        it: {
            showing: 'Pagina {0} di {1}',
            navigation: 'Navigazione pagine',
            previous: 'Precedente',
            next: 'Successivo',
        },
        es: {
            showing: 'Página {0} de {1}',
            navigation: 'Navegación de páginas',
            previous: 'Anterior',
            next: 'Siguiente',
        },
        fr: {
            showing: 'Page {0} sur {1}',
            navigation: 'Navigation des pages',
            previous: 'Précédent',
            next: 'Suivant',
        },
    };
    static config = {
        prevIcon: 'bi bi-chevron-left',
        nextIcon: 'bi bi-chevron-right',
        reloadIcon: 'bi bi-arrow-clockwise',
    };
    static template = `
        <nav data-tpl-aria-label="#l10n:t('navigation')" class="user-select-none">
            <ul class="pagination">
                <li class="page-item ms-auto me-2 pagination-index"> {{ #l10n:t('showing', curr.label, total) }}</li>
                <li class="page-item me-2 reload"><a role="button"><i data-tpl-class="config.reloadIcon"></i></a></li>
                <li class="page-item prev">
                    <a data-tpl-class="prev.enabled?'page-link':'page-link disabled'" data-tpl-aria-label="#l10n:t('previous')" role="button" data-tpl-data-page="prev.index">
                        <i aria-hidden="true" data-tpl-class="config.prevIcon"></i>
                    </a>
                </li>
                <li class="page-item" data-tpl-each="pages" data-tpl-var="page">
                    <a data-tpl-class="curr.index != page.index ? 'page-link': 'page-link disabled'" role="button" data-tpl-data-page="page.index" >
                        {{ page.label }}
                    </a>
                </li>
                <li class="page-item next">
                    <a data-tpl-class="next.enabled?'page-link':'page-link disabled'" data-tpl-aria-label="#l10n:t('next')" role="button" data-tpl-data-page="next.index">
                        <i aria-hidden="true" data-tpl-class="config.nextIcon"></i>
                    </a>
                </li>
            </ul>
        </nav>
    `;
    #total = 0;
    #current = 0;
    render({ observed }) {
        this.update(observed.current ?? 0, observed.total ?? 0);
        this.addEventListener('click', (/** @type any */ evt) => {
            const el = evt.target.closest('a');
            if (!el) {
                return;
            }
            this.dispatchEvent(
                new CustomEvent('page-requested', {
                    bubbles: true,
                    cancelable: true,
                    detail: {
                        value: Number(el.dataset.page ?? this.#current),
                    },
                }),
            );
        });
    }
    update(current, total) {
        const maxRender = Number(this.getAttribute('pages') ?? '5');
        const prev = { index: Math.max(0, current - 1), enabled: current > 0 };
        const curr = { index: current, label: current + 1 };
        const next = { index: Math.min(total, current + 1), enabled: current + 1 < total };
        const pages = [
            {
                index: current,
                label: current + 1,
            },
        ];
        for (let mid = current, offset = 1; offset !== maxRender && pages.length != maxRender; ++offset) {
            const p = mid - offset;
            if (p >= 0) {
                pages.unshift({ index: p, label: p + 1 });
            }
            const n = mid + offset;
            if (n < total) {
                pages.push({ index: n, label: n + 1 });
            }
        }
        this.template().withOverlay({ total, prev, curr, next, pages }).renderTo(this);
    }
    get total() {
        return this.#total;
    }
    set total(value) {
        this.#total = value;
        this.reflect(() => {
            this.setAttribute('total', String(value));
            this.update(this.#current ?? 0, this.#total);
        });
    }
    get current() {
        return this.#current;
    }
    set current(value) {
        this.#current = value;
        this.reflect(() => {
            this.setAttribute('current', String(value));
            this.update(this.#current, this.#total ?? 0);
        });
    }
}

class TableSchemaParser {
    static parse(nodeOrFragment, template) {
        const schema = Nodes.queryChildren(nodeOrFragment, 'schema');
        if (!schema) {
            throw new Error(`missing expected <schema> in ${nodeOrFragment}`);
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
                .filter((v) => v.hasAttribute('order'))
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

class InMemoryTableLoader {
    #data;
    constructor(data) {
        this.#data = data;
    }
    async load(pageRequest, sortRequest, filterRequest) {
        return {
            page: this.#data,
            size: this.#data.length,
        };
    }
    update(data) {
        this.#data = data;
    }
}

class RemoteTableLoader {
    #http;
    #url;
    #method;
    constructor(http, url, method) {
        this.#http = http;
        this.#url = url;
        this.#method = method;
    }
    async load(pageRequest, sortRequest, filterRequest) {
        const filters = Object.entries(filterRequest).filter(([k, v]) => v);
        return await this.#http
            .request(this.#method, this.#url)
            .param('page', pageRequest.page)
            .param('size', pageRequest.size)
            .param('sort', sortRequest ? `${sortRequest.sorter},${sortRequest.order}` : null)
            .param('filters', filters.length > 0 ? JSON.stringify(Object.fromEntries(filters)) : null)
            .fetchJson();
    }
}

class TableLoader {
    static create(el, conf) {
        const url = el.getAttribute('src');
        if (url) {
            const http = registry.component('http-client');
            const method = el.getAttribute('method') ?? 'GET';
            return new RemoteTableLoader(http, url, method);
        }
        return new InMemoryTableLoader([]);
    }
}

class Table extends ParsedElement {
    static slots = true;
    static l10n = {
        en: {
            initial: 'Start searching to see results.',
            error: 'Error while loading data:',
            nodata: 'No elements found.',
        },
        it: {
            initial: 'Avvia la ricerca per visualizzare i risultati.',
            error: 'Errore nel caricamento dei dati:',
            nodata: 'Nessun elemento trovato.',
        },
        es: {
            initial: 'Inicia la búsqueda para ver los resultados.',
            error: 'Error al cargar los datos:',
            nodata: 'No se encontraron elementos.',
        },
        fr: {
            initial: 'Lancez la recherche pour voir les résultats.',
            error: 'Erreur lors du chargement des données :',
            nodata: 'Aucun élément trouvé.',
        },
    };
    static config = {
        searchIcon: 'bi bi-search',
    };
    static template = `
        <ful-form data-tpl-if="slots.filters">
            {{{{ slots.filters }}}}
        </ful-form>
        <div class="table-wrapper">
            <table class="table">
                <caption data-tpl-if="slots.caption">{{{{ slots.caption }}}}</caption>
                <thead></thead>
                <tbody></tbody>
                <tbody data-ref="initial">
                    <tr>
                        <td data-tpl-colspan="schema.length">
                            <div>
                                <p data-tpl-if="config.searchIcon"><i data-tpl-class="config.searchIcon"></i></p>
                                {{{ #l10n:t('initial') }}}
                            </div>
                        </td>
                    </tr>
                </tbody>
                <tbody data-ref="loading" hidden>
                    <tr>
                        <td data-tpl-colspan="schema.length">
                            <ful-spinner class="big"></ful-spinner>
                        </td>
                    </tr>
                </tbody>
                <tbody data-ref="feedback" hidden>
                    <tr>
                        <td data-tpl-colspan="schema.length">
                            <div class="alert alert-danger">
                                <p>{{ #l10n:t('error') }}</p>
                                <div data-ref="feedback-error"></div>
                            </div>
                        </td>
                    </tr>
                </tbody>
                <tfoot data-tpl-if="slots.footer">
                    {{{{ slots.footer }}}}
                </tfoot>
            </table>
        </div>
        <ful-pagination current="0" total="1"></ful-pagination>
    `;
    static templates = {
        row: `
            <tr data-tpl-if="pageResponse.data.length == 0">
                <td data-tpl-colspan="schema.length" class="text-center align-middle p-4">
                    {{ #l10n:t('nodata') }}
                </td>
            </tr>
            {{{{ schema.rowsTemplate.withOverlay({'rows': pageResponse.data}).render() }}}}
        `,
    };
    #loader;
    #schema;
    #body;
    #loading;
    #noAutoload;
    #feedback;
    #paginator;
    #sorters;
    #latestRequest;
    async render({ slots, observed }) {
        const template = this.template();
        const schema = TableSchemaParser.parse(slots.schema, template);
        const fragment = template.withOverlay({ slots, schema }).render();
        const tableWrapper = /** @type HTMLTableElement */ (Nodes.queryChildren(fragment, '.table-wrapper'));
        const table = /** @type HTMLTableElement */ (tableWrapper.querySelector('table'));
        Attributes.forward('table-', this, table);
        this.#loader = registry.component(this.getAttribute('loader') ?? 'loaders:table').create(this);

        this.#schema = schema;
        this.#body = table.querySelector(':scope > tbody');
        this.#loading = table.querySelector(':scope > tbody[data-ref=loading]');
        this.#noAutoload = table.querySelector(':scope > tbody[data-ref=initial]');
        this.#feedback = table.querySelector(':scope > tbody[data-ref=feedback]');
        this.#paginator = Nodes.queryChildren(fragment, 'ful-pagination');
        this.#sorters = table.querySelectorAll(':scope > thead ful-sorter') ?? [];
        this.replaceChildren(fragment);
        schema.headersTemplate.renderTo(this.querySelector('thead'));
        await Rendering.waitForChildren(this);

        const maybeForm = /** @type any */ (Nodes.queryChildren(this, 'ful-form'));
        this.#latestRequest = {
            pageRequest: {
                page: 0,
                size: this.getAttribute('page-size') ? Number(this.getAttribute('page-size')) : 10,
            },
            sortRequest: schema.sort,
            filterRequest: maybeForm?.values ?? {},
        };
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
        this.addEventListener('page-requested', async (/** @type any */ e) => {
            await this.load(
                {
                    page: e.detail.value,
                    size: this.#latestRequest.pageRequest.size,
                },
                this.#latestRequest.sortRequest,
                this.#latestRequest.filterRequest,
            );
        });
        this.addEventListener('sort-requested', async (/** @type any */ e) => {
            const sortRequest = e.detail.value.order ? e.detail.value : null;
            await this.load(this.#latestRequest.pageRequest, sortRequest, this.#latestRequest.filterRequest);
            this.#sorters.forEach((s) => (s.order = null));
            e.target.order = e.detail.value.order;
        });
        if (this.hasAttribute('autoload')) {
            await this.reload();
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
        this.#body.replaceChildren();
        this.#loading.removeAttribute('hidden', '');
        this.#feedback.setAttribute('hidden', '');
        this.#noAutoload.setAttribute('hidden', '');
        try {
            const pageResponse = await this.#loader.load(pageRequest, sortRequest, filterRequest);
            this.#latestRequest = { pageRequest, sortRequest, filterRequest };
            this.#update(pageRequest, sortRequest, filterRequest, pageResponse);
        } catch (/** @type any */ error) {
            this.#loading.setAttribute('hidden', '');
            this.#feedback.removeAttribute('hidden', '');
            if (!error.problems) {
                this.#feedback.querySelector('[data-ref=feedback-error]').textContent = error;
            } else {
                this.#feedback.querySelector('[data-ref=feedback-error]').textContent = error.problems.map(
                    (p) => `${p.reason}`,
                );
            }
            throw error;
        }
    }
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
        this.#paginator.current = pageRequest.page;
        this.#paginator.total = Math.ceil(pageResponse.size / pageRequest.size);
    }
}

export { TableLoader, SortButton, Table, TableSchemaParser, Pagination };
