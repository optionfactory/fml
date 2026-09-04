import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';
import { TableLoader } from '../../../src/ful/elements/table.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

describe('Table sorting', () => {
    let sorts = [];
    const settle = async () => {
        for (let i = 0; i !== 20; ++i) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    };
    const mount = async (schema) => {
        const container = document.createElement('div');
        container.innerHTML = `
            <ful-table autoload>
                <template slot="schema">
                    <schema>${schema}</schema>
                </template>
            </ful-table>`;
        document.body.appendChild(container);
        const tableEl = container.querySelector('ful-table');
        await Rendering.waitFor(tableEl);
        await settle();
        return [tableEl, container];
    };
    beforeEach(() => {
        sorts = [];
        registry.defineComponent('loaders:table', {
            create: () => ({
                load: async (pageRequest, sortRequest) => {
                    sorts.push(sortRequest);
                    return { data: [{ a: 1, b: 2 }], size: 1 };
                }
            })
        });
    });

    it('exposes the declared order as a property', async () => {
        const [tableEl, container] = await mount(`
            <column title="A" sorter="a" order="asc">{{ a }}</column>
            <column title="B" sorter="b">{{ b }}</column>`);

        const [sorterA, sorterB] = tableEl.querySelectorAll('ful-sorter');
        assert.strictEqual(sorterA.order, 'asc');
        assert.strictEqual(sorterB.order, null);
        assert.deepStrictEqual(sorts[0], { sorter: 'a', order: 'asc' });
        container.remove();
    });

    it('clears the order of the other sorters when a column is sorted', async () => {
        const [tableEl, container] = await mount(`
            <column title="A" sorter="a" order="asc">{{ a }}</column>
            <column title="B" sorter="b">{{ b }}</column>`);

        const [sorterA, sorterB] = tableEl.querySelectorAll('ful-sorter');
        sorterB.dispatchEvent(new Event('click', { bubbles: true }));
        await settle();

        assert.deepStrictEqual(sorts[1], { sorter: 'b', order: 'asc' });
        assert.strictEqual(sorterB.order, 'asc');
        assert.strictEqual(sorterA.order, null);
        assert.isFalse(sorterA.hasAttribute('order'));
        container.remove();
    });

    it('cycles asc, desc and unsorted from the declared order', async () => {
        const [tableEl, container] = await mount(
            `<column title="A" sorter="a" order="asc">{{ a }}</column>`);

        const [sorterA] = tableEl.querySelectorAll('ful-sorter');
        sorterA.dispatchEvent(new Event('click', { bubbles: true }));
        await settle();
        assert.deepStrictEqual(sorts[1], { sorter: 'a', order: 'desc' });
        assert.strictEqual(sorterA.order, 'desc');

        sorterA.dispatchEvent(new Event('click', { bubbles: true }));
        await settle();
        assert.isNull(sorts[2], 'clearing the order must drop the sort request');
        assert.strictEqual(sorterA.order, null);

        sorterA.dispatchEvent(new Event('click', { bubbles: true }));
        await settle();
        assert.deepStrictEqual(sorts[3], { sorter: 'a', order: 'asc' });
        container.remove();
    });

    it('sorts with the keyboard and announces the order on the header cell', async () => {
        const [tableEl, container] = await mount(
            `<column title="A" sorter="a" order="asc">{{ a }}</column>`);
        const [sorterA] = tableEl.querySelectorAll('ful-sorter');
        const th = sorterA.closest('th');
        const keydown = (code) => sorterA.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));

        assert.strictEqual(sorterA.getAttribute('role'), 'button');
        assert.strictEqual(sorterA.getAttribute('tabindex'), '0');
        assert.strictEqual(th.getAttribute('aria-sort'), 'ascending', 'the declared order is announced');

        keydown('Enter');
        await settle();
        assert.deepStrictEqual(sorts[1], { sorter: 'a', order: 'desc' });
        assert.strictEqual(th.getAttribute('aria-sort'), 'descending');

        keydown('Space');
        await settle();
        assert.isNull(sorts[2], 'clearing the order must drop the sort request');
        assert.isFalse(th.hasAttribute('aria-sort'), 'an unsorted column announces nothing');

        keydown('ArrowDown');
        await settle();
        assert.deepStrictEqual(
            sorts,
            [{ sorter: 'a', order: 'asc' }, { sorter: 'a', order: 'desc' }, null],
            'other keys do not sort',
        );
        container.remove();
    });
});

describe('Table load failures', () => {
    const settle = async () => {
        for (let i = 0; i !== 20; ++i) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    };
    const mount = (loader, autoload) => {
        registry.defineComponent('loaders:table', { create: () => loader });
        const container = document.createElement('div');
        container.innerHTML = `
            <ful-table ${autoload ? 'autoload' : ''}>
                <template slot="schema">
                    <schema><column title="A" sorter="a">{{ a }}</column></schema>
                </template>
            </ful-table>`;
        document.body.appendChild(container);
        return [container.querySelector('ful-table'), container];
    };

    it('renders the error state and rethrows when a load fails', async () => {
        const [tableEl, container] = mount({ load: async () => { throw new Error('boom'); } }, false);
        await Rendering.waitFor(tableEl);

        let caught = null;
        try {
            await tableEl.reload();
        } catch (e) {
            caught = e;
        }

        //rethrowing is what keeps an unawaited autoload failure reportable
        assert.strictEqual(caught?.message, 'boom');
        const feedback = tableEl.querySelector('tbody[data-ref=feedback]');
        assert.isFalse(feedback.hasAttribute('hidden'), 'the error row is shown');
        assert.include(feedback.textContent, 'boom');
        container.remove();
    });

    it('upgrades when the first load never answers', async () => {
        const [tableEl, container] = mount({ load: () => new Promise(() => { }) }, true);

        const outcome = await Promise.race([
            Rendering.waitFor(tableEl).then(() => 'upgraded'),
            new Promise((resolve) => setTimeout(() => resolve('still waiting'), 300)),
        ]);
        await settle();

        assert.strictEqual(outcome, 'upgraded', 'the first load must not hold up the upgrade');
        const loading = tableEl.querySelector('tbody[data-ref=loading]');
        assert.isFalse(loading.hasAttribute('hidden'), 'the table is still showing its spinner');
        container.remove();
    });
});

describe('Table schema', () => {
    it('reports a missing schema slot instead of failing on undefined', async () => {
        registry.defineComponent('loaders:table', { create: () => ({ load: async () => ({ data: [], size: 0 }) }) });
        const container = document.createElement('div');
        container.innerHTML = `<ful-table></ful-table>`;
        document.body.appendChild(container);
        const tableEl = container.querySelector('ful-table');

        let caught = null;
        try {
            await Rendering.waitFor(tableEl);
        } catch (e) {
            caught = e;
        }

        assert.isNotNull(caught);
        assert.include(String(caught.cause?.message ?? caught.message), 'missing expected <schema>');
        container.remove();
    });
});

//the assertions on the pagination label read the english strings: the plugin
//is configured with language 'en' above, so they do not depend on the locale
//the browser happens to be launched with

const settle = async () => {
    for (let i = 0; i !== 20; ++i) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
};

const mount = async (html) => {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const tableEl = container.querySelector('ful-table');
    await Rendering.waitFor(tableEl);
    await settle();
    return [tableEl, container];
};

const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));

//the page links are the li[data-ref=page] buttons
const pageLinks = (paginator) => Array.from(
    paginator.querySelectorAll('li[data-ref=page] button'));
const pageLabels = (paginator) => pageLinks(paginator).map((a) => a.textContent.trim());
const pageLink = (paginator, label) => pageLinks(paginator).find((a) => a.textContent.trim() === label);
const rowTexts = (tableEl) => Array.from(
    tableEl.querySelectorAll('table > tbody:not([data-ref]) > tr')).map((tr) => tr.textContent.trim());

describe('Table pagination', () => {
    let requests = [];
    const withTotal = (size) => {
        registry.defineComponent('loaders:table', {
            create: () => ({
                load: async (pageRequest, sortRequest, filterRequest) => {
                    requests.push({ pageRequest, sortRequest, filterRequest });
                    return { data: [{ a: `row of page ${pageRequest.page}` }], size };
                }
            })
        });
    };
    beforeEach(() => {
        requests = [];
    });

    it('reloads at the clicked page and renders its rows', async () => {
        withTotal(45);
        const [tableEl, container] = await mount(`
            <ful-table autoload page-size="10">
                <template slot="schema">
                    <schema><column title="A" sorter="a">{{ a }}</column></schema>
                </template>
            </ful-table>`);
        const paginator = tableEl.querySelector('ful-pagination');

        click(pageLink(paginator, '3'));
        await settle();

        assert.deepStrictEqual(requests[1].pageRequest, { page: 2, size: 10 });
        assert.deepStrictEqual(rowTexts(tableEl), ['row of page 2']);
        container.remove();
    });

    it('keeps the current sort and filters when another page is requested', async () => {
        withTotal(45);
        const [tableEl, container] = await mount(`
            <ful-table autoload page-size="10">
                <div slot="filters"><input name="q" value="hi"></div>
                <template slot="schema">
                    <schema><column title="A" sorter="a" order="desc">{{ a }}</column></schema>
                </template>
            </ful-table>`);
        const paginator = tableEl.querySelector('ful-pagination');

        click(pageLink(paginator, '4'));
        await settle();

        assert.strictEqual(requests[1].pageRequest.page, 3);
        assert.deepStrictEqual(requests[1].sortRequest, { sorter: 'a', order: 'desc' });
        assert.deepStrictEqual(requests[1].filterRequest, { q: 'hi' });
        container.remove();
    });

    it('reports the current page and the number of pages', async () => {
        withTotal(45);
        const [tableEl, container] = await mount(`
            <ful-table autoload page-size="10">
                <template slot="schema">
                    <schema><column title="A">{{ a }}</column></schema>
                </template>
            </ful-table>`);
        const paginator = tableEl.querySelector('ful-pagination');
        const label = () => paginator.querySelector('li[data-ref=index]').textContent.trim();

        assert.strictEqual(label(), 'Page 1 of 5', '45 elements over pages of 10 are 5 pages');

        click(pageLink(paginator, '3'));
        await settle();
        assert.strictEqual(label(), 'Page 3 of 5');
        container.remove();
    });

    it('asks for the current page again when the reload link is clicked', async () => {
        withTotal(45);
        const [tableEl, container] = await mount(`
            <ful-table autoload page-size="10">
                <template slot="schema">
                    <schema><column title="A">{{ a }}</column></schema>
                </template>
            </ful-table>`);
        const paginator = tableEl.querySelector('ful-pagination');

        click(pageLink(paginator, '3'));
        await settle();
        click(paginator.querySelector('li[data-ref=reload] button'));
        await settle();

        assert.strictEqual(requests.length, 3);
        assert.strictEqual(requests[2].pageRequest.page, 2, 'reload stays on the page being shown');
        container.remove();
    });
});

describe('Pagination links', () => {
    const mountPagination = async (attributes) => {
        const container = document.createElement('div');
        container.innerHTML = `<ful-pagination ${attributes}></ful-pagination>`;
        document.body.appendChild(container);
        const el = container.querySelector('ful-pagination');
        await Rendering.waitFor(el);
        return [el, container];
    };

    it('renders one link per page when they all fit', async () => {
        const [el, container] = await mountPagination(`current="0" total="3"`);

        assert.deepStrictEqual(pageLabels(el), ['1', '2', '3']);
        container.remove();
    });

    it('renders as many links as the pages attribute asks for, around the current page', async () => {
        const [el, container] = await mountPagination(`pages="3" current="5" total="10"`);

        assert.deepStrictEqual(pageLabels(el), ['5', '6', '7']);
        container.remove();
    });

    it('renders an even window without overshooting the pages attribute', async () => {
        const [four, fourContainer] = await mountPagination(`pages="4" current="5" total="10"`);
        const [two, twoContainer] = await mountPagination(`pages="2" current="5" total="10"`);

        assert.deepStrictEqual(pageLabels(four), ['5', '6', '7', '8'], 'four links, around the current page');
        assert.deepStrictEqual(pageLabels(two), ['6', '7'], 'two links, starting at the current page');
        fourContainer.remove();
        twoContainer.remove();
    });

    it('keeps the window full by extending it backwards on the last pages', async () => {
        const [el, container] = await mountPagination(`current="9" total="10"`);

        assert.deepStrictEqual(pageLabels(el), ['6', '7', '8', '9', '10'], 'five links, ending on the last page');
        container.remove();
    });

    it('disables the link to the page already being shown', async () => {
        const [el, container] = await mountPagination(`current="1" total="3"`);

        const disabled = pageLinks(el).filter((a) => a.hasAttribute('disabled')).map((a) => a.textContent.trim());
        assert.deepStrictEqual(disabled, ['2']);
        container.remove();
    });

    it('disables previous on the first page and next on the last one', async () => {
        const [el, container] = await mountPagination(`current="0" total="3"`);
        const prev = () => el.querySelector('li[data-ref=prev] button');
        const next = () => el.querySelector('li[data-ref=next] button');

        assert.isTrue(prev().hasAttribute('disabled'), 'there is no page before the first');
        assert.isFalse(next().hasAttribute('disabled'));

        el.current = 2;
        assert.isFalse(prev().hasAttribute('disabled'));
        assert.isTrue(next().hasAttribute('disabled'), 'there is no page after the last');
        container.remove();
    });

    it('renders real buttons, which keyboard focus skips when disabled', async () => {
        const [el, container] = await mountPagination(`current="0" total="3"`);

        for (const button of el.querySelectorAll('button')) {
            assert.strictEqual(button.tagName, 'BUTTON');
            assert.strictEqual(button.type, 'button', 'no button submits the surrounding form');
        }
        const current = el.querySelector('li[data-ref=page] button[disabled]');
        assert.isNotNull(current, 'the page being shown is disabled');
        assert.isTrue(current.matches(':disabled'), 'a disabled page button is not a tab stop');
        container.remove();
    });

    it('does not request a page when a disabled link is clicked', async () => {
        const [el, container] = await mountPagination(`current="0" total="5"`);
        const requested = [];
        el.addEventListener('page-requested', (e) => requested.push(e.detail.value));

        click(el.querySelector('li[data-ref=prev] button'));
        el.current = 4;
        click(el.querySelector('li[data-ref=next] button'));

        assert.deepStrictEqual(requested, [], 'there is no page before the first nor after the last');
        container.remove();
    });

    it('points next at the following page, and nowhere on the last one', async () => {
        const [el, container] = await mountPagination(`current="3" total="5"`);
        const next = () => el.querySelector('li[data-ref=next] button');

        assert.strictEqual(next().dataset.page, '4');

        el.current = 4;
        assert.isUndefined(next().dataset.page, 'page 5 does not exist: the last of 5 pages is 4');
        container.remove();
    });

    it('requests the zero based index of the clicked page', async () => {
        const [el, container] = await mountPagination(`current="0" total="10"`);
        const requested = [];
        el.addEventListener('page-requested', (e) => requested.push(e.detail.value));

        click(pageLink(el, '3'));
        click(el.querySelector('li[data-ref=next] button'));

        assert.deepStrictEqual(requested, [2, 1]);
        container.remove();
    });
});

describe('Table filters', () => {
    let requests = [];
    beforeEach(() => {
        requests = [];
        registry.defineComponent('loaders:table', {
            create: () => ({
                load: async (pageRequest, sortRequest, filterRequest) => {
                    requests.push({ pageRequest, sortRequest, filterRequest });
                    return { data: [{ a: 1 }], size: 45 };
                }
            })
        });
    });
    const mountWithFilters = () => mount(`
        <ful-table autoload page-size="10">
            <div slot="filters"><input name="q" value="initial"></div>
            <template slot="schema">
                <schema><column title="A" sorter="a" order="asc">{{ a }}</column></schema>
            </template>
        </ful-table>`);

    it('seeds the first load with the values already in the filters slot', async () => {
        const [, container] = await mountWithFilters();

        assert.deepStrictEqual(requests[0].filterRequest, { q: 'initial' });
        container.remove();
    });

    it('reloads from the first page with the submitted filters, keeping the sort', async () => {
        const [tableEl, container] = await mountWithFilters();
        const paginator = tableEl.querySelector('ful-pagination');
        click(pageLink(paginator, '4'));
        await settle();

        tableEl.querySelector('input[name=q]').value = 'refined';
        await tableEl.querySelector('ful-form').submit();
        await settle();

        const last = requests[requests.length - 1];
        assert.strictEqual(last.pageRequest.page, 0, 'a new search starts over from the first page');
        assert.deepStrictEqual(last.filterRequest, { q: 'refined' });
        assert.deepStrictEqual(last.sortRequest, { sorter: 'a', order: 'asc' });
        container.remove();
    });

    it('keeps the submitted filters when a later page is requested', async () => {
        const [tableEl, container] = await mountWithFilters();
        tableEl.querySelector('input[name=q]').value = 'refined';
        await tableEl.querySelector('ful-form').submit();
        await settle();

        click(pageLink(tableEl.querySelector('ful-pagination'), '2'));
        await settle();

        const last = requests[requests.length - 1];
        assert.strictEqual(last.pageRequest.page, 1);
        assert.deepStrictEqual(last.filterRequest, { q: 'refined' });
        container.remove();
    });
});

describe('Table resetWithFilter', () => {
    let requests = [];
    beforeEach(() => {
        requests = [];
        registry.defineComponent('loaders:table', {
            create: () => ({
                load: async (pageRequest, sortRequest, filterRequest) => {
                    requests.push({ pageRequest, sortRequest, filterRequest });
                    return { data: [{ a: 1 }], size: 45 };
                }
            })
        });
    });
    const mountTable = () => mount(`
        <ful-table autoload page-size="10">
            <template slot="schema">
                <schema><column title="A" sorter="a" order="asc">{{ a }}</column></schema>
            </template>
        </ful-table>`);

    it('starts over from the first page with the given filter, keeping the sort', async () => {
        const [tableEl, container] = await mountTable();
        click(pageLink(tableEl.querySelector('ful-pagination'), '5'));
        await settle();

        await tableEl.resetWithFilter({ byName: 'bob' });

        const last = requests[requests.length - 1];
        assert.deepStrictEqual(last.pageRequest, { page: 0, size: 10 }, 'the page size survives the reset');
        assert.deepStrictEqual(last.filterRequest, { byName: 'bob' });
        assert.deepStrictEqual(last.sortRequest, { sorter: 'a', order: 'asc' });
        container.remove();
    });

    it('keeps the given filter for later reloads', async () => {
        const [tableEl, container] = await mountTable();
        await tableEl.resetWithFilter({ byName: 'bob' });

        await tableEl.reload();

        assert.deepStrictEqual(requests[requests.length - 1].filterRequest, { byName: 'bob' });
        container.remove();
    });
});

describe('In memory table loader', () => {
    const mountTable = () => {
        registry.defineComponent('loaders:table', TableLoader);
        return mount(`
            <ful-table page-size="2">
                <template slot="schema">
                    <schema><column title="A">{{ a }}</column></schema>
                </template>
            </ful-table>`);
    };

    it('serves one page at a time and reports the total number of elements', async () => {
        const [tableEl, container] = await mountTable();
        await tableEl.withLoader((loader) => loader.update([1, 2, 3, 4, 5].map((a) => ({ a }))));

        await tableEl.reload();
        assert.deepStrictEqual(rowTexts(tableEl), ['1', '2']);
        assert.strictEqual(tableEl.querySelector('li[data-ref=index]').textContent.trim(), 'Page 1 of 3');

        click(pageLink(tableEl.querySelector('ful-pagination'), '3'));
        await settle();
        assert.deepStrictEqual(rowTexts(tableEl), ['5'], 'the last page holds what is left');
        container.remove();
    });

    it('replaces the data on update', async () => {
        const [tableEl, container] = await mountTable();
        await tableEl.withLoader((loader) => loader.update([{ a: 'old' }, { a: 'older' }, { a: 'oldest' }]));
        await tableEl.reload();

        await tableEl.withLoader((loader) => loader.update([{ a: 'new' }]));
        await tableEl.reload();

        assert.deepStrictEqual(rowTexts(tableEl), ['new']);
        assert.strictEqual(tableEl.querySelector('li[data-ref=index]').textContent.trim(), 'Page 1 of 1');
        container.remove();
    });
});

describe('Table schema columns', () => {
    beforeEach(() => {
        registry.defineComponent('loaders:table', {
            create: () => ({ load: async () => ({ data: [{ a: 1, b: 2, c: 3 }], size: 1 }) })
        });
    });

    it('wraps the title in a sorter only for sortable columns', async () => {
        const [tableEl, container] = await mount(`
            <ful-table autoload>
                <template slot="schema">
                    <schema>
                        <column title="A" sorter="a">{{ a }}</column>
                        <column title="B">{{ b }}</column>
                        <column title="C" order="asc">{{ c }}</column>
                    </schema>
                </template>
            </ful-table>`);

        const [thA, thB, thC] = tableEl.querySelectorAll('thead th');
        assert.strictEqual(thA.querySelector('ful-sorter')?.getAttribute('sorter'), 'a');
        assert.isNull(thB.querySelector('ful-sorter'), 'a column with neither sorter nor order is not sortable');
        assert.strictEqual(thB.textContent.trim(), 'B');
        assert.strictEqual(thC.querySelector('ful-sorter')?.getAttribute('order'), 'asc');
        container.remove();
    });

    it('uses a title element in place of the title attribute', async () => {
        const [tableEl, container] = await mount(`
            <ful-table autoload>
                <template slot="schema">
                    <schema>
                        <column title="ignored" sorter="a"><title>Chosen</title>{{ a }}</column>
                    </schema>
                </template>
            </ful-table>`);

        const th = tableEl.querySelector('thead th');
        assert.strictEqual(th.textContent.trim(), 'Chosen');
        assert.strictEqual(tableEl.querySelector('tbody td').textContent.trim(), '1', 'the title is not part of the cell');
        container.remove();
    });

    it('forwards the schema and column attributes onto the generated rows and cells', async () => {
        const [tableEl, container] = await mount(`
            <ful-table autoload>
                <template slot="schema">
                    <schema class="align-middle">
                        <column title="A" sorter="a" class="text-end" data-kind="number">{{ a }}</column>
                    </schema>
                </template>
            </ful-table>`);

        assert.isTrue(tableEl.querySelector('thead tr').classList.contains('align-middle'));
        assert.isTrue(tableEl.querySelector('tbody tr').classList.contains('align-middle'));
        const th = tableEl.querySelector('thead th');
        const td = tableEl.querySelector('tbody td');
        assert.strictEqual(th.dataset.kind, 'number');
        assert.strictEqual(td.dataset.kind, 'number');
        assert.isTrue(td.classList.contains('text-end'));
        assert.isFalse(th.hasAttribute('sorter'), 'the sorter is consumed, not left on the cell');
        assert.isFalse(td.hasAttribute('title'), 'the title is consumed, not left on the cell');
        container.remove();
    });
});

describe('Remote table loader', () => {
    let calls = [];
    const mountRemote = (attributes) => {
        calls = [];
        registry.defineComponent('http-client', {
            request: (method, url) => {
                const call = { method, url, params: {} };
                calls.push(call);
                const builder = {
                    param: (k, v) => {
                        call.params[k] = v;
                        return builder;
                    },
                    fetchJson: async () => ({ data: [], size: 0 })
                };
                return builder;
            }
        });
        registry.defineComponent('loaders:table', TableLoader);
        return mount(`
            <ful-table ${attributes}>
                <template slot="schema">
                    <schema><column title="A">{{ a }}</column></schema>
                </template>
            </ful-table>`);
    };

    it('requests the configured url with the page and no sort or filters', async () => {
        const [tableEl, container] = await mountRemote(`src="/api/rows" page-size="25"`);

        await tableEl.reload();

        assert.deepStrictEqual(calls[0].method, 'GET', 'GET is the default method');
        assert.strictEqual(calls[0].url, '/api/rows');
        assert.deepStrictEqual(calls[0].params, { page: 0, size: 25, sort: null, filters: null });
        container.remove();
    });

    it('sends the sort as sorter,order and drops the empty filters', async () => {
        const [tableEl, container] = await mountRemote(`src="/api/rows" method="POST"`);

        await tableEl.load({ page: 2, size: 10 }, { sorter: 'a', order: 'desc' }, { byName: 'bob', byAge: '' });

        assert.strictEqual(calls[0].method, 'POST');
        assert.deepStrictEqual(calls[0].params, {
            page: 2,
            size: 10,
            sort: 'a,desc',
            filters: JSON.stringify({ byName: 'bob' })
        });
        container.remove();
    });
});
