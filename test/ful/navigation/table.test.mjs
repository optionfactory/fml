import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';
import { TableLoader } from '../../../src/ful/navigation/table.mjs';
import { appended, settle, attached } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

describe('Table sorting', () => {
    let sorts = [];
    const mount = async (schema) => {
        const container = document.createElement('div');
        container.innerHTML = `
            <ful-table autoload>
                <template slot="schema">
                    <schema>${schema}</schema>
                </template>
            </ful-table>`;
        attached(container);
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
                },
            }),
        });
    });

    it('exposes the declared order as a property', async () => {
        const [tableEl] = await mount(`
            <column title="A" sorter="a" order="asc">{{ a }}</column>
            <column title="B" sorter="b">{{ b }}</column>`);

        const [sorterA, sorterB] = tableEl.querySelectorAll('ful-sorter');
        assert.strictEqual(sorterA.order, 'asc', 'a sorter exposes the order its column declares');
        assert.strictEqual(sorterB.order, null, 'a sorter whose column declares no order is unsorted');
        assert.deepStrictEqual(
            sorts[0],
            { sorter: 'a', order: 'asc' },
            'the first load carries the sort of the first column declaring both sorter and order',
        );
    });

    it('clears the order of the other sorters when a column is sorted', async () => {
        const [tableEl] = await mount(`
            <column title="A" sorter="a" order="asc">{{ a }}</column>
            <column title="B" sorter="b">{{ b }}</column>`);

        const [sorterA, sorterB] = tableEl.querySelectorAll('ful-sorter');
        sorterB.dispatchEvent(new Event('click', { bubbles: true }));
        await settle();

        assert.deepStrictEqual(
            sorts[1],
            { sorter: 'b', order: 'asc' },
            'a click on an unsorted column asks for its sort in ascending order',
        );
        assert.strictEqual(
            sorterB.order,
            'asc',
            'the sorter that asked takes the new order once the sorted page has loaded',
        );
        assert.strictEqual(sorterA.order, null, 'the other sorters are cleared when a column is sorted');
        assert.isFalse(sorterA.hasAttribute('order'), 'a cleared sorter drops its order attribute');
    });

    it('cycles asc, desc and unsorted from the declared order', async () => {
        const [tableEl] = await mount(`<column title="A" sorter="a" order="asc">{{ a }}</column>`);

        const [sorterA] = tableEl.querySelectorAll('ful-sorter');
        sorterA.dispatchEvent(new Event('click', { bubbles: true }));
        await settle();
        assert.deepStrictEqual(
            sorts[1],
            { sorter: 'a', order: 'desc' },
            'a click on an ascending column asks for descending',
        );
        assert.strictEqual(
            sorterA.order,
            'desc',
            'the sorter takes the descending order once the sorted page has loaded',
        );

        sorterA.dispatchEvent(new Event('click', { bubbles: true }));
        await settle();
        assert.isNull(sorts[2], 'clearing the order must drop the sort request');
        assert.strictEqual(sorterA.order, null, 'the sorter is unsorted once the unsorted page has loaded');

        sorterA.dispatchEvent(new Event('click', { bubbles: true }));
        await settle();
        assert.deepStrictEqual(
            sorts[3],
            { sorter: 'a', order: 'asc' },
            'a click on an unsorted column starts the cycle again from ascending',
        );
    });

    it('sorts with the keyboard and announces the order on the header cell', async () => {
        const [tableEl] = await mount(`<column title="A" sorter="a" order="asc">{{ a }}</column>`);
        const [sorterA] = tableEl.querySelectorAll('ful-sorter');
        const th = sorterA.closest('th');
        const keydown = (code) => sorterA.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));

        assert.strictEqual(sorterA.getAttribute('role'), 'button', 'the sorter is exposed as a button');
        assert.strictEqual(sorterA.getAttribute('tabindex'), '0', 'the sorter is reachable with the tab key');
        assert.strictEqual(th.getAttribute('aria-sort'), 'ascending', 'the declared order is announced');

        keydown('Enter');
        await settle();
        assert.deepStrictEqual(sorts[1], { sorter: 'a', order: 'desc' }, 'Enter activates the sorter like a click');
        assert.strictEqual(
            th.getAttribute('aria-sort'),
            'descending',
            'the header cell announces the descending order',
        );

        keydown('Space');
        await settle();
        assert.isNull(sorts[2], 'clearing the order must drop the sort request');
        assert.isFalse(th.hasAttribute('aria-sort'), 'an unsorted column announces nothing');

        keydown('ArrowDown');
        await settle();
        assert.deepStrictEqual(
            sorts,
            [{ sorter: 'a', order: 'asc' }, { sorter: 'a', order: 'desc' }, null],
            'a key other than Enter, NumpadEnter and Space does not sort',
        );
    });

    it('sorts on the numpad Enter too', async () => {
        const [tableEl] = await mount(`<column title="A" sorter="a" order="asc">{{ a }}</column>`);
        const [sorterA] = tableEl.querySelectorAll('ful-sorter');

        sorterA.dispatchEvent(new KeyboardEvent('keydown', { code: 'NumpadEnter', key: 'Enter', bubbles: true }));
        await settle();

        assert.deepStrictEqual(sorts[1], { sorter: 'a', order: 'desc' }, 'NumpadEnter activates the sorter like Enter');
    });
});

describe('Table load failures', () => {
    const mount = (loader, autoload) => {
        registry.defineComponent('loaders:table', { create: () => loader });
        const container = document.createElement('div');
        container.innerHTML = `
            <ful-table ${autoload ? 'autoload' : ''}>
                <template slot="schema">
                    <schema><column title="A" sorter="a">{{ a }}</column></schema>
                </template>
            </ful-table>`;
        attached(container);
        return [container.querySelector('ful-table'), container];
    };

    it('renders the error state and rethrows when a load fails', async () => {
        const [tableEl] = mount(
            {
                load: async () => {
                    throw new Error('boom');
                },
            },
            false,
        );
        await Rendering.waitFor(tableEl);

        let caught = null;
        try {
            await tableEl.reload();
        } catch (e) {
            caught = e;
        }

        assert.strictEqual(caught?.message, 'boom', 'reload rejects with the error the loader threw');
        const feedback = tableEl.querySelector('tbody[data-ref=feedback]');
        assert.isFalse(feedback.hasAttribute('hidden'), 'the error panel is shown when the load fails');
        assert.include(feedback.textContent, 'boom', 'the error panel shows the error as text');
    });

    it('lists the reasons of a structured failure, one per line', async () => {
        const failure = Object.assign(new Error('invalid'), {
            problems: [{ reason: 'start is after end' }, { reason: 'page is negative' }],
        });
        const [tableEl] = mount(
            {
                load: async () => {
                    throw failure;
                },
            },
            false,
        );
        await Rendering.waitFor(tableEl);

        await tableEl.reload().catch(() => {});

        const feedback = tableEl.querySelector('tbody[data-ref=feedback]');
        assert.isFalse(feedback.hasAttribute('hidden'), 'the error panel is shown for a structured failure');
        assert.include(
            feedback.querySelector('[data-ref=feedback-error]').textContent,
            'start is after end\npage is negative',
            'the error panel lists the reason of each problem, one per line',
        );
    });

    it('upgrades when the first load never answers', async () => {
        const [tableEl] = mount({ load: () => new Promise(() => {}) }, true);

        const outcome = await Promise.race([
            Rendering.waitFor(tableEl).then(() => 'upgraded'),
            new Promise((resolve) => setTimeout(() => resolve('still waiting'), 300)),
        ]);
        await settle();

        assert.strictEqual(outcome, 'upgraded', 'the first load must not hold up the upgrade');
        const loading = tableEl.querySelector('tbody[data-ref=loading]');
        assert.isFalse(loading.hasAttribute('hidden'), 'the table is still showing its spinner');
    });
});

describe('Table sorter layout', () => {
    const loads = () =>
        registry.defineComponent('loaders:table', {
            create: () => ({ load: async () => ({ data: [{ a: 'x' }], size: 1 }) }),
        });
    /** where the heading's own first line starts, relative to the top of the sorter */
    const headingDropsBy = (sorter) => {
        const range = document.createRange();
        range.selectNodeContents(sorter);
        return range.getClientRects()[0].top - sorter.getBoundingClientRect().top;
    };

    it('keeps the arrow on the line of the heading it belongs to', async () => {
        loads();
        const container = appended(`
            <ful-table autoload>
                <template slot="schema">
                    <schema><column title="Codice" sorter="a" order="asc">{{ a }}</column></schema>
                </template>
            </ful-table>`);
        const tableEl = container.querySelector('ful-table');
        await Rendering.waitFor(tableEl);
        await settle();

        assert.isBelow(
            headingDropsBy(tableEl.querySelector('thead ful-sorter')),
            4,
            "the heading starts on the sorter's own first line, beside the arrow",
        );
    });

    it('lets a heading too long for its column wrap within itself', async () => {
        loads();
        const container = appended(`
            <style>
                .wrapping table { table-layout: fixed; width: 340px; }
                .wrapping th:first-child { width: 96px; }
            </style>
            <div class="wrapping">
                <ful-table autoload>
                    <template slot="schema">
                        <schema>
                            <column title="Tipo di calcolo" sorter="a" order="asc">{{ a }}</column>
                            <column title="Other">{{ a }}</column>
                        </schema>
                    </template>
                </ful-table>
            </div>`);
        const tableEl = container.querySelector('ful-table');
        await Rendering.waitFor(tableEl);
        await settle();

        const sorter = tableEl.querySelector('thead ful-sorter');
        const range = document.createRange();
        range.selectNodeContents(sorter);

        assert.isAbove(range.getClientRects().length, 1, 'the heading wraps rather than staying on one line');
        assert.isBelow(headingDropsBy(sorter), 4, "the wrapped heading's first line still starts beside the arrow");
    });
});

describe('Table revalidation', () => {
    const mount = (loader, autoload) => {
        registry.defineComponent('loaders:table', { create: () => loader });
        const container = document.createElement('div');
        container.innerHTML = `
            <ful-table ${autoload ? 'autoload' : ''}>
                <template slot="schema">
                    <schema><column title="A" sorter="a">{{ a }}</column></schema>
                </template>
            </ful-table>`;
        attached(container);
        return [container.querySelector('ful-table'), container];
    };
    const rows = (tableEl) => tableEl.querySelector('tbody:not([data-ref])').children.length;

    it('keeps the rows on screen while a reload is in flight', async () => {
        let answer = null;
        const [tableEl] = mount({ load: async () => answer ?? { data: [{ a: 1 }, { a: 2 }], size: 2 } }, true);
        await Rendering.waitFor(tableEl);
        await settle();
        assert.strictEqual(rows(tableEl), 2, 'the first load filled the body');

        let release;
        answer = new Promise((resolve) => {
            release = () => resolve({ data: [{ a: 3 }], size: 1 });
        });
        const reloading = tableEl.reload();
        await settle();

        assert.strictEqual(rows(tableEl), 2, 'the rows stay put rather than collapsing to the spinner');
        assert.isTrue(
            tableEl.querySelector('tbody[data-ref=loading]').hasAttribute('hidden'),
            'the spinner is for the load with nothing to show yet',
        );
        assert.strictEqual(
            tableEl.getAttribute('aria-busy'),
            'true',
            'the table is marked busy while the reload is in flight',
        );

        release();
        await reloading;
        await settle();

        assert.strictEqual(rows(tableEl), 1, 'the rows are replaced once the reload answers');
        assert.isFalse(tableEl.hasAttribute('aria-busy'), 'aria-busy is removed once the reload answers');
    });

    it('shows the spinner for the load that has nothing to show', async () => {
        const [tableEl] = mount({ load: () => new Promise(() => {}) }, false);
        await Rendering.waitFor(tableEl);

        tableEl.reload().catch(() => {});
        await settle();

        assert.isFalse(
            tableEl.querySelector('tbody[data-ref=loading]').hasAttribute('hidden'),
            'an empty body has nothing to keep, so the spinner stands in for it',
        );
        assert.strictEqual(
            tableEl.querySelector('tbody[data-ref=loading] ful-spinner[role=status]')?.textContent.trim(),
            'Loading…',
            'the spinner has text to announce',
        );
    });

    it('drops the rows a failed load was replacing', async () => {
        let fail = false;
        const [tableEl] = mount(
            {
                load: async () => {
                    if (fail) {
                        throw new Error('boom');
                    }
                    return { data: [{ a: 1 }, { a: 2 }], size: 2 };
                },
            },
            true,
        );
        await Rendering.waitFor(tableEl);
        await settle();
        assert.strictEqual(rows(tableEl), 2, 'the first load fills the body');

        fail = true;
        await tableEl.reload().catch(() => {});
        await settle();

        assert.strictEqual(rows(tableEl), 0, 'what the table holds is no longer what was asked for');
        assert.isFalse(
            tableEl.querySelector('tbody[data-ref=feedback]').hasAttribute('hidden'),
            'the error panel is shown for the failed reload',
        );
    });

    it('settles the table before load:success reaches its listeners', async () => {
        const [tableEl] = mount({ load: async () => ({ data: [{ a: 1 }, { a: 2 }], size: 2 }) }, false);
        await Rendering.waitFor(tableEl);
        const seen = [];
        tableEl.addEventListener('load:success', () =>
            seen.push(`${tableEl.hasAttribute('aria-busy')}:${rows(tableEl)}`),
        );

        await tableEl.reload();

        assert.deepStrictEqual(seen, ['false:2'], 'not busy, and the rows already in place');
    });
});

describe('Table schema', () => {
    it('reports a missing schema slot instead of failing on undefined', async () => {
        registry.defineComponent('loaders:table', { create: () => ({ load: async () => ({ data: [], size: 0 }) }) });
        const container = appended(`<ful-table></ful-table>`);
        const tableEl = container.querySelector('ful-table');

        let caught = null;
        try {
            await Rendering.waitFor(tableEl);
        } catch (e) {
            caught = e;
        }

        assert.isNotNull(caught, 'a table without a schema slot fails its render');
        assert.include(
            String(caught.cause?.message ?? caught.message),
            'missing expected <schema>',
            'the failure names the missing schema',
        );
    });
});

const mount = async (html) => {
    const container = appended(html);
    const tableEl = container.querySelector('ful-table');
    await Rendering.waitFor(tableEl);
    await settle();
    return [tableEl, container];
};

const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true }));

const pageLinks = (paginator) => Array.from(paginator.querySelectorAll('li[data-ref=page] button'));
const pageLabels = (paginator) => pageLinks(paginator).map((a) => a.textContent.trim());
const pageLink = (paginator, label) => pageLinks(paginator).find((a) => a.textContent.trim() === label);
const rowTexts = (tableEl) =>
    Array.from(tableEl.querySelectorAll('table > tbody:not([data-ref]) > tr')).map((tr) => tr.textContent.trim());

describe('Table pagination', () => {
    let requests = [];
    const withTotal = (size) => {
        registry.defineComponent('loaders:table', {
            create: () => ({
                load: async (pageRequest, sortRequest, filterRequest) => {
                    requests.push({ pageRequest, sortRequest, filterRequest });
                    return { data: [{ a: `row of page ${pageRequest.page}` }], size };
                },
            }),
        });
    };
    beforeEach(() => {
        requests = [];
    });

    it('reloads at the clicked page and renders its rows', async () => {
        withTotal(45);
        const [tableEl] = await mount(`
            <ful-table autoload page-size="10">
                <template slot="schema">
                    <schema><column title="A" sorter="a">{{ a }}</column></schema>
                </template>
            </ful-table>`);
        const paginator = tableEl.querySelector('ful-pagination');

        click(pageLink(paginator, '3'));
        await settle();

        assert.deepStrictEqual(
            requests[1].pageRequest,
            { page: 2, size: 10 },
            'a click on a page button loads that zero based page with the current size',
        );
        assert.deepStrictEqual(
            rowTexts(tableEl),
            ['row of page 2'],
            'the rows of the loaded page replace the shown ones',
        );
    });

    it('keeps the current sort and filters when another page is requested', async () => {
        withTotal(45);
        const [tableEl] = await mount(`
            <ful-table autoload page-size="10">
                <div slot="filters"><input name="q" value="hi"></div>
                <template slot="schema">
                    <schema><column title="A" sorter="a" order="desc">{{ a }}</column></schema>
                </template>
            </ful-table>`);
        const paginator = tableEl.querySelector('ful-pagination');

        click(pageLink(paginator, '4'));
        await settle();

        assert.strictEqual(requests[1].pageRequest.page, 3, 'a click on a page button loads that zero based page');
        assert.deepStrictEqual(
            requests[1].sortRequest,
            { sorter: 'a', order: 'desc' },
            'another page keeps the current sort',
        );
        assert.deepStrictEqual(requests[1].filterRequest, { q: 'hi' }, 'another page keeps the current filters');
    });

    it('reports the current page and the number of pages', async () => {
        withTotal(45);
        const [tableEl] = await mount(`
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
        assert.strictEqual(label(), 'Page 3 of 5', 'the pager moves to the loaded page');
    });

    it('asks for the current page again when the reload link is clicked', async () => {
        withTotal(45);
        const [tableEl] = await mount(`
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

        assert.strictEqual(requests.length, 3, 'the reload button starts one more load');
        assert.strictEqual(requests[2].pageRequest.page, 2, 'reload stays on the page being shown');
    });
});

describe('Table stale loads', () => {
    let requests = [];
    let pending = [];
    beforeEach(() => {
        requests = [];
        pending = [];
        registry.defineComponent('loaders:table', {
            create: () => ({
                load: (pageRequest) =>
                    new Promise((resolve, reject) => {
                        requests.push(pageRequest);
                        pending.push({ resolve, reject });
                    }),
            }),
        });
    });
    const mountDeferred = () =>
        mount(`
        <ful-table autoload page-size="10">
            <template slot="schema">
                <schema><column title="A">{{ a }}</column></schema>
            </template>
        </ful-table>`);

    it('discards a response resolving after a newer load, keeping the newest rows and request', async () => {
        const [tableEl] = await mountDeferred();
        const slow = tableEl.load({ page: 1, size: 10 }, null, {});
        const fast = tableEl.load({ page: 2, size: 10 }, null, {});
        pending[2].resolve({ data: [{ a: 'fast page' }], size: 30 });
        await settle();
        pending[1].resolve({ data: [{ a: 'slow page' }], size: 30 });
        await settle();
        await slow;
        await fast;

        assert.deepStrictEqual(rowTexts(tableEl), ['fast page'], 'the stale response renders nothing');

        const reloaded = tableEl.reload();
        pending[3].resolve({ data: [{ a: 'reloaded' }], size: 30 });
        await reloaded;

        assert.deepStrictEqual(rowTexts(tableEl), ['reloaded'], 'the reload shows the rows of its own answer');
        assert.deepStrictEqual(
            requests.map((r) => r.page),
            [0, 1, 2, 2],
            'reload replays the newest request',
        );
    });

    it('discards a failure resolving after a newer load, without an error state nor a rejection', async () => {
        const [tableEl] = await mountDeferred();
        const slow = tableEl.load({ page: 1, size: 10 }, null, {});
        tableEl.load({ page: 2, size: 10 }, null, {});
        pending[2].resolve({ data: [{ a: 'fast page' }], size: 30 });
        await settle();
        pending[1].reject(new Error('boom'));
        await slow;

        assert.deepStrictEqual(rowTexts(tableEl), ['fast page'], 'the newer response is what shows');
        assert.isTrue(
            tableEl.querySelector('tbody[data-ref=feedback]').hasAttribute('hidden'),
            'the stale failure renders no error state',
        );
    });
});

describe('Table sort and pagination edges', () => {
    let pending = [];
    let requests = [];
    beforeEach(() => {
        pending = [];
        requests = [];
        registry.defineComponent('loaders:table', {
            create: () => ({
                load: (pageRequest, sortRequest, filterRequest) => {
                    requests.push({ pageRequest, sortRequest, filterRequest });
                    return new Promise((resolve, reject) => {
                        pending.push({ resolve, reject });
                    });
                },
            }),
        });
    });
    const mountDeferred = async (
        columns = '<column title="A" sorter="a">{{ a }}</column><column title="B" sorter="b">{{ b }}</column>',
    ) => {
        const container = document.createElement('div');
        container.innerHTML = `
            <ful-table autoload page-size="10">
                <template slot="schema"><schema>${columns}</schema></template>
            </ful-table>`;
        attached(container);
        const tableEl = container.querySelector('ful-table');
        await Rendering.waitFor(tableEl);
        await settle();
        return [tableEl, container];
    };

    it("keeps the winning sort's header when a superseded sort resolves late", async () => {
        const [tableEl] = await mountDeferred();
        pending[0].resolve({ data: [{ a: 'init' }], size: 30 });
        await settle();
        const [sorterA, sorterB] = [...tableEl.querySelectorAll('ful-sorter')];
        const sort = (el) => el.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));

        sort(sorterA);
        sort(sorterB);
        pending[2].resolve({ data: [{ b: 'B-data' }], size: 30 });
        await settle();
        pending[1].resolve({ data: [{ a: 'A-data' }], size: 30 });
        await settle();

        assert.deepStrictEqual(rowTexts(tableEl), ['B-data'], 'the load token already kept the newest rows');
        const aria = [...tableEl.querySelectorAll('th')].map((th) => th.getAttribute('aria-sort'));
        assert.deepStrictEqual(aria, [null, 'ascending'], 'the superseded sort leaves the header alone');

        const reloaded = tableEl.reload();
        pending[3].resolve({ data: [{ b: 'again' }], size: 30 });
        await reloaded;
        assert.deepStrictEqual(
            requests[3].sortRequest,
            { sorter: 'b', order: 'asc' },
            'reload replays the winning sort',
        );
    });

    it('paginates an empty table as one empty page, with the arrows dead', async () => {
        const [tableEl] = await mountDeferred();
        pending[0].resolve({ data: [], size: 0 });
        await settle();

        const paginator = tableEl.querySelector('ful-pagination');
        assert.deepStrictEqual(pageLabels(paginator), ['1'], 'one page link, to the only empty page');
        assert.strictEqual(
            paginator.querySelector('li[data-ref=index]').textContent.trim(),
            'Page 1 of 1',
            'an empty table reports one page of one',
        );
    });

    it('falls back to the last existing page when the data shrinks behind the answer', async () => {
        const [tableEl] = await mountDeferred();
        pending[0].resolve({ data: [{ a: 'one' }], size: 25 });
        await settle();

        const successes = [];
        tableEl.addEventListener('load:success', (e) => successes.push(e.detail.pageRequest));
        let settled = false;
        const beyond = tableEl.load({ page: 2, size: 10 }, null, {}).then(() => {
            settled = true;
        });
        pending[1].resolve({ data: [], size: 10 });
        await settle();

        assert.deepStrictEqual(requests[2].pageRequest, { page: 0, size: 10 }, 'the last existing page is asked for');
        assert.isFalse(settled, 'the load is not over while the last page is on its way');
        assert.strictEqual(
            tableEl.getAttribute('aria-busy'),
            'true',
            'the table stays busy while the last page is on its way',
        );
        assert.deepStrictEqual(successes, [], 'the out-of-range answer is not reported');

        pending[2].resolve({ data: [{ a: 'only' }], size: 10 });
        await beyond;

        assert.deepStrictEqual(rowTexts(tableEl), ['only'], 'the rows of the last existing page are shown');
        assert.strictEqual(
            tableEl.querySelector('li[data-ref=index]').textContent.trim(),
            'Page 1 of 1',
            'the pager moves to the last existing page',
        );
        assert.isFalse(tableEl.hasAttribute('aria-busy'), 'aria-busy is removed once the last page is shown');
        assert.deepStrictEqual(successes, [{ page: 0, size: 10 }], 'the page the table shows is the one reported');
    });

    it('rejects the load when the last page it falls back to fails', async () => {
        const [tableEl] = await mountDeferred();
        pending[0].resolve({ data: [{ a: 'one' }], size: 25 });
        await settle();

        const beyond = tableEl.load({ page: 2, size: 10 }, null, {});
        pending[1].resolve({ data: [], size: 10 });
        await settle();
        pending[2].reject(new Error('boom'));

        const error = await beyond.then(
            () => null,
            (e) => e,
        );
        assert.strictEqual(
            error?.message,
            'boom',
            'the load rejects with the error of the fallback load of the last page',
        );
    });

    it('carries no initial sort for an order declared without its sorter', async () => {
        await mountDeferred(
            '<column title="A" sorter="a">{{ a }}</column><column title="C" order="asc">{{ c }}</column>',
        );
        pending[0].resolve({ data: [{ a: 'x' }], size: 1 });
        await settle();

        assert.isNull(requests[0].sortRequest, 'no null property reaches the loader');
    });
});

describe('Pagination links', () => {
    const mountPagination = async (attributes) => {
        const container = appended(`<ful-pagination ${attributes}></ful-pagination>`);
        const el = container.querySelector('ful-pagination');
        await Rendering.waitFor(el);
        return [el, container];
    };

    it('renders an empty table as one empty page', async () => {
        const [el] = await mountPagination(`current="0" total="0"`);

        assert.deepStrictEqual(pageLabels(el), ['1'], 'the empty page is a page');
        assert.include(
            el.querySelector('[data-ref=index]').textContent,
            'Page 1 of 1',
            'an empty table reports one page of one',
        );
    });

    it('tells the current page from the others by more than its aria-current claim', async () => {
        const [el] = await mountPagination(`current="1" total="3"`);

        const [other, current] = [...el.querySelectorAll('li[data-ref=page] button')];
        assert.strictEqual(
            current.getAttribute('aria-current'),
            'page',
            'the current page button carries aria-current=page',
        );
        assert.strictEqual(
            other.getAttribute('aria-current'),
            null,
            'a page button other than the current one carries no aria-current',
        );
        assert.notStrictEqual(
            getComputedStyle(current).backgroundColor,
            getComputedStyle(other).backgroundColor,
            'the current page is painted differently from the others, not only announced through aria-current',
        );
    });

    it('renders one link per page when they all fit', async () => {
        const [el] = await mountPagination(`current="0" total="3"`);

        assert.deepStrictEqual(pageLabels(el), ['1', '2', '3'], 'every page gets a button when they fit in the window');
    });

    it('renders as many links as the pages attribute asks for, around the current page', async () => {
        const [el] = await mountPagination(`pages="3" current="5" total="10"`);

        assert.deepStrictEqual(
            pageLabels(el),
            ['5', '6', '7'],
            'the window holds the pages attribute count of buttons, centred on the current page',
        );
    });

    it('renders an even window without overshooting the pages attribute', async () => {
        const [four, fourContainer] = await mountPagination(`pages="4" current="5" total="10"`);
        const [two] = await mountPagination(`pages="2" current="5" total="10"`);

        assert.deepStrictEqual(pageLabels(four), ['5', '6', '7', '8'], 'four links, around the current page');
        assert.deepStrictEqual(pageLabels(two), ['6', '7'], 'two links, starting at the current page');
        fourContainer.remove();
    });

    it('keeps the window full by extending it backwards on the last pages', async () => {
        const [el] = await mountPagination(`current="9" total="10"`);

        assert.deepStrictEqual(pageLabels(el), ['6', '7', '8', '9', '10'], 'five links, ending on the last page');
    });

    it('marks the page already being shown as current, keeping it reachable', async () => {
        const [el] = await mountPagination(`current="1" total="3"`);

        const current = pageLinks(el)
            .filter((a) => a.getAttribute('aria-current') === 'page')
            .map((a) => a.textContent.trim());
        assert.deepStrictEqual(current, ['2'], 'only the button of the current page carries aria-current=page');
        assert.isFalse(
            pageLinks(el).some((a) => a.hasAttribute('disabled')),
            'no page link is disabled',
        );
    });

    it('disables previous on the first page and next on the last one', async () => {
        const [el] = await mountPagination(`current="0" total="3"`);
        const prev = () => el.querySelector('li[data-ref=prev] button');
        const next = () => el.querySelector('li[data-ref=next] button');

        assert.isTrue(prev().hasAttribute('disabled'), 'there is no page before the first');
        assert.isFalse(next().hasAttribute('disabled'), 'next is enabled on the first page when more pages follow');

        el.current = 2;
        assert.isFalse(prev().hasAttribute('disabled'), 'previous is enabled past the first page');
        assert.isTrue(next().hasAttribute('disabled'), 'there is no page after the last');
    });

    it('renders real buttons, which keyboard focus skips when disabled', async () => {
        const [el] = await mountPagination(`current="0" total="3"`);

        for (const button of el.querySelectorAll('button')) {
            assert.strictEqual(
                button.tagName,
                'BUTTON',
                "the pager's controls are real buttons, which keyboard focus skips when disabled",
            );
            assert.strictEqual(button.type, 'button', 'no button submits the surrounding form');
        }
        const current = el.querySelector('li[data-ref=page] button[aria-current=page]');
        assert.isNotNull(current, 'the page being shown is marked current');
        assert.isFalse(
            current.matches(':disabled'),
            'the current page button stays enabled, so it remains a tab stop the reader can find',
        );
    });

    it('does not request the page already being shown', async () => {
        const [el] = await mountPagination(`current="1" total="5"`);
        const requested = [];
        el.addEventListener('page:requested', (e) => requested.push(e.detail.value));

        const current = el.querySelector('li[data-ref=page] button[aria-current=page]');
        assert.isNotNull(current, 'the pager marks the current page');
        click(current);
        assert.deepStrictEqual(requested, [], 'a click on the current page button requests nothing');

        click(el.querySelector('li[data-ref=next] button'));
        assert.deepStrictEqual(requested, [2], 'a page that is not the current one still asks');
    });

    it('hands the focus to the equivalent control after the bar is replaced', async () => {
        const [el] = await mountPagination(`current="1" total="5"`);

        const next = el.querySelector('li[data-ref=next] button');
        next.focus();
        assert.strictEqual(document.activeElement, next, 'the next button holds the focus before the repaint');

        el.update({ current: 2, total: 5 });

        assert.notStrictEqual(
            document.activeElement,
            next,
            'the bar is replaced, so the old next button no longer holds the focus',
        );
        assert.strictEqual(
            document.activeElement,
            el.querySelector('li[data-ref=next] button'),
            'the focus followed next to the bar that replaced it',
        );
    });

    it('does not request a page when a disabled link is clicked', async () => {
        const [el] = await mountPagination(`current="0" total="5"`);
        const requested = [];
        el.addEventListener('page:requested', (e) => requested.push(e.detail.value));

        click(el.querySelector('li[data-ref=prev] button'));
        el.current = 4;
        click(el.querySelector('li[data-ref=next] button'));

        assert.deepStrictEqual(requested, [], 'there is no page before the first nor after the last');
    });

    it('points next at the following page, and nowhere on the last one', async () => {
        const [el] = await mountPagination(`current="3" total="5"`);
        const next = () => el.querySelector('li[data-ref=next] button');

        assert.strictEqual(next().dataset.page, '4', 'next points at the following zero based page');

        el.current = 4;
        assert.isUndefined(next().dataset.page, 'page 5 does not exist: the last of 5 pages is 4');
    });

    it('requests the zero based index of the clicked page', async () => {
        const [el] = await mountPagination(`current="0" total="10"`);
        const requested = [];
        el.addEventListener('page:requested', (e) => requested.push(e.detail.value));

        click(pageLink(el, '3'));
        click(el.querySelector('li[data-ref=next] button'));

        assert.deepStrictEqual(
            requested,
            [2, 1],
            'a page button and next each request the zero based index of the page they point at',
        );
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
                },
            }),
        });
    });
    const mountWithFilters = () =>
        mount(`
        <ful-table autoload page-size="10">
            <div slot="filters"><input name="q" value="initial"></div>
            <template slot="schema">
                <schema><column title="A" sorter="a" order="asc">{{ a }}</column></schema>
            </template>
        </ful-table>`);

    it('seeds the first load with the values already in the filters slot', async () => {
        await mountWithFilters();

        assert.deepStrictEqual(
            requests[0].filterRequest,
            { q: 'initial' },
            'the first load carries the values already in the filters slot',
        );
    });

    it('reloads from the first page with the submitted filters, keeping the sort', async () => {
        const [tableEl] = await mountWithFilters();
        const paginator = tableEl.querySelector('ful-pagination');
        click(pageLink(paginator, '4'));
        await settle();

        tableEl.querySelector('input[name=q]').value = 'refined';
        await tableEl.querySelector('ful-form').submit();
        await settle();

        const last = requests[requests.length - 1];
        assert.strictEqual(last.pageRequest.page, 0, 'a new search starts over from the first page');
        assert.deepStrictEqual(last.filterRequest, { q: 'refined' }, 'the submitted filters become the filter request');
        assert.deepStrictEqual(
            last.sortRequest,
            { sorter: 'a', order: 'asc' },
            'a filter submit keeps the current sort',
        );
    });

    it('keeps the submitted filters when a later page is requested', async () => {
        const [tableEl] = await mountWithFilters();
        tableEl.querySelector('input[name=q]').value = 'refined';
        await tableEl.querySelector('ful-form').submit();
        await settle();

        click(pageLink(tableEl.querySelector('ful-pagination'), '2'));
        await settle();

        const last = requests[requests.length - 1];
        assert.strictEqual(last.pageRequest.page, 1, 'a click on a page button loads that zero based page');
        assert.deepStrictEqual(last.filterRequest, { q: 'refined' }, 'a later page keeps the submitted filters');
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
                },
            }),
        });
    });
    const mountTable = () =>
        mount(`
        <ful-table autoload page-size="10">
            <template slot="schema">
                <schema><column title="A" sorter="a" order="asc">{{ a }}</column></schema>
            </template>
        </ful-table>`);

    it('starts over from the first page with the given filter, keeping the sort', async () => {
        const [tableEl] = await mountTable();
        click(pageLink(tableEl.querySelector('ful-pagination'), '5'));
        await settle();

        await tableEl.resetWithFilter({ byName: 'bob' });

        const last = requests[requests.length - 1];
        assert.deepStrictEqual(last.pageRequest, { page: 0, size: 10 }, 'the page size survives the reset');
        assert.deepStrictEqual(last.filterRequest, { byName: 'bob' }, 'the given filter becomes the filter request');
        assert.deepStrictEqual(
            last.sortRequest,
            { sorter: 'a', order: 'asc' },
            'resetWithFilter keeps the current sort',
        );
    });

    it('keeps the given filter for later reloads', async () => {
        const [tableEl] = await mountTable();
        await tableEl.resetWithFilter({ byName: 'bob' });

        await tableEl.reload();

        assert.deepStrictEqual(
            requests[requests.length - 1].filterRequest,
            { byName: 'bob' },
            'a reload repeats the filter given to resetWithFilter',
        );
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
        const [tableEl] = await mountTable();
        await tableEl.withLoader((loader) => loader.update([1, 2, 3, 4, 5].map((a) => ({ a }))));

        await tableEl.reload();
        assert.deepStrictEqual(rowTexts(tableEl), ['1', '2'], 'the first page holds as many rows as the page size');
        assert.strictEqual(
            tableEl.querySelector('li[data-ref=index]').textContent.trim(),
            'Page 1 of 3',
            'the page count is the total number of rows over the page size, rounded up',
        );

        click(pageLink(tableEl.querySelector('ful-pagination'), '3'));
        await settle();
        assert.deepStrictEqual(rowTexts(tableEl), ['5'], 'the last page holds what is left');
    });

    it('sorts the rows the header offers to sort', async () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <ful-table page-size="10">
                <template slot="schema">
                    <schema><column title="A" sorter="a">{{ a }}</column></schema>
                </template>
            </ful-table>`;
        attached(container);
        const tableEl = container.querySelector('ful-table');
        await Rendering.waitFor(tableEl);
        await settle();
        await tableEl.withLoader((loader) => loader.update([{ a: 'pear' }, { a: 'apple' }, { a: 'fig' }]));
        await tableEl.reload();
        assert.deepStrictEqual(rowTexts(tableEl), ['pear', 'apple', 'fig'], 'unsorted keeps the given order');

        const sorter = tableEl.querySelector('ful-sorter');
        click(sorter.querySelector('button') ?? sorter);
        await settle();
        assert.deepStrictEqual(
            rowTexts(tableEl),
            ['apple', 'fig', 'pear'],
            'the first click sorts the rows by the sorter property in ascending order',
        );

        click(sorter.querySelector('button') ?? sorter);
        await settle();
        assert.deepStrictEqual(
            rowTexts(tableEl),
            ['pear', 'fig', 'apple'],
            'the second click sorts the rows in descending order',
        );
    });

    it('leaves rows sharing a value in the order they came in', async () => {
        const container = appended(`
            <ful-table page-size="10">
                <template slot="schema">
                    <schema><column title="A" sorter="a">{{ a }}</column><column title="B">{{ b }}</column></schema>
                </template>
            </ful-table>`);
        const tableEl = container.querySelector('ful-table');
        await Rendering.waitFor(tableEl);
        await settle();
        await tableEl.withLoader((loader) =>
            loader.update([
                { a: 'same', b: 'first' },
                { a: 'same', b: 'second' },
                { a: 'same', b: 'third' },
            ]),
        );
        await tableEl.reload();

        const sorter = tableEl.querySelector('ful-sorter');
        click(sorter.querySelector('button') ?? sorter);
        await settle();

        assert.deepStrictEqual(
            [...tableEl.querySelectorAll('table > tbody:not([data-ref]) > tr')].map((tr) =>
                tr.cells[1].textContent.trim(),
            ),
            ['first', 'second', 'third'],
            'rows with equal values keep their original order',
        );
    });

    it('sorts rows missing the value last, whichever way the column points', async () => {
        const [tableEl] = await mountTable();
        await tableEl.withLoader((loader) => loader.update([{ a: 'b' }, {}, { a: 'a' }]));
        await tableEl.reload();
        const loaded = await tableEl.withLoader((loader) =>
            loader.load({ page: 0, size: 10 }, { sorter: 'a', order: 'asc' }, {}),
        );
        assert.deepStrictEqual(
            loaded.data.map((row) => row.a),
            ['a', 'b', undefined],
            'rows missing the sorter property sort last',
        );
    });

    it('replaces the data on update', async () => {
        const [tableEl] = await mountTable();
        await tableEl.withLoader((loader) => loader.update([{ a: 'old' }, { a: 'older' }, { a: 'oldest' }]));
        await tableEl.reload();

        await tableEl.withLoader((loader) => loader.update([{ a: 'new' }]));
        await tableEl.reload();

        assert.deepStrictEqual(
            rowTexts(tableEl),
            ['new'],
            'the reload shows the rows given to update, replacing the old ones',
        );
        assert.strictEqual(
            tableEl.querySelector('li[data-ref=index]').textContent.trim(),
            'Page 1 of 1',
            'the page count follows the rows given to update',
        );
    });
});

describe('Table schema columns', () => {
    beforeEach(() => {
        registry.defineComponent('loaders:table', {
            create: () => ({ load: async () => ({ data: [{ a: 1, b: 2, c: 3 }], size: 1 }) }),
        });
    });

    it('wraps the title in a sorter only for sortable columns', async () => {
        const [tableEl] = await mount(`
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
        assert.strictEqual(
            thA.querySelector('ful-sorter')?.getAttribute('sorter'),
            'a',
            'a column declaring sorter wraps its title in a ful-sorter carrying that sorter',
        );
        assert.isNull(thB.querySelector('ful-sorter'), 'a column with neither sorter nor order is not sortable');
        assert.strictEqual(thB.textContent.trim(), 'B', 'a column that is not sortable shows its title as plain text');
        assert.strictEqual(
            thC.querySelector('ful-sorter')?.getAttribute('order'),
            'asc',
            'a column declaring only order still gets a ful-sorter, carrying that order',
        );
    });

    it('uses a title element in place of the title attribute', async () => {
        const [tableEl] = await mount(`
            <ful-table autoload>
                <template slot="schema">
                    <schema>
                        <column title="ignored" sorter="a"><title>Chosen</title>{{ a }}</column>
                    </schema>
                </template>
            </ful-table>`);

        const th = tableEl.querySelector('thead th');
        assert.strictEqual(
            th.textContent.trim(),
            'Chosen',
            'a title element takes the place of the title attribute in the header',
        );
        assert.strictEqual(
            tableEl.querySelector('tbody td').textContent.trim(),
            '1',
            'the title is not part of the cell',
        );
    });

    it('forwards the schema and column attributes onto the generated rows and cells', async () => {
        const [tableEl] = await mount(`
            <ful-table autoload>
                <template slot="schema">
                    <schema class="align-middle">
                        <column title="A" sorter="a" class="text-end" data-kind="number">{{ a }}</column>
                    </schema>
                </template>
            </ful-table>`);

        assert.isTrue(
            tableEl.querySelector('thead tr').classList.contains('align-middle'),
            'the schema attributes are copied onto the header row',
        );
        assert.isTrue(
            tableEl.querySelector('tbody tr').classList.contains('align-middle'),
            'the schema attributes are copied onto the body row',
        );
        const th = tableEl.querySelector('thead th');
        const td = tableEl.querySelector('tbody td');
        assert.strictEqual(th.dataset.kind, 'number', 'the column attributes are copied onto the header cell');
        assert.strictEqual(td.dataset.kind, 'number', 'the column attributes are copied onto the body cell');
        assert.isTrue(td.classList.contains('text-end'), 'the column class is copied onto the body cell');
        assert.isFalse(th.hasAttribute('sorter'), 'the sorter is consumed, not left on the cell');
        assert.isFalse(td.hasAttribute('title'), 'the title is consumed, not left on the cell');
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
                    fetchJson: async () => ({ data: [], size: 0 }),
                };
                return builder;
            },
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
        const [tableEl] = await mountRemote(`src="/api/rows" page-size="25"`);

        await tableEl.reload();

        assert.deepStrictEqual(calls[0].method, 'GET', 'GET is the default method');
        assert.strictEqual(calls[0].url, '/api/rows', 'the remote loader asks the url in the src attribute');
        assert.deepStrictEqual(
            calls[0].params,
            { page: 0, size: 25, sort: null, filters: null },
            'the remote loader sends the page and the size, with sort and filters left out when there are none',
        );
    });

    it('sends the sort as sorter,order and drops the empty filters', async () => {
        const [tableEl] = await mountRemote(`src="/api/rows" method="POST"`);

        await tableEl.load({ page: 2, size: 10 }, { sorter: 'a', order: 'desc' }, { byName: 'bob', byAge: '' });

        assert.strictEqual(calls[0].method, 'POST', 'the remote loader sends with the method attribute');
        assert.deepStrictEqual(
            calls[0].params,
            {
                page: 2,
                size: 10,
                sort: 'a,desc',
                filters: JSON.stringify({ byName: 'bob' }),
            },
            'the sort is sent as sorter,order and filters as json of the filters with a truthy value',
        );
    });

    it('does not request anything while the base applies the declared src', async () => {
        await mountRemote(`src="/api/rows"`);
        await settle();

        assert.deepStrictEqual(calls, [], 'applying the declared src at render starts no load');
    });

    it('asks the new url from the first page when src changes, keeping the size and the sort', async () => {
        const [tableEl] = await mountRemote(`src="/api/rows" page-size="25"`);
        await tableEl.load({ page: 3, size: 25 }, { sorter: 'a', order: 'asc' }, {});

        tableEl.setAttribute('src', '/api/other');
        await settle();

        assert.strictEqual(calls.at(-1).url, '/api/other', 'a src change reloads from the new url');
        assert.deepStrictEqual(
            calls.at(-1).params,
            { page: 0, size: 25, sort: 'a,asc', filters: null },
            'a src change reloads from the first page, keeping the size and the sort',
        );
    });

    it('takes src from the property, reflecting it onto the attribute', async () => {
        const [tableEl] = await mountRemote(`src="/api/rows"`);
        await tableEl.reload();

        tableEl.src = '/api/other';
        await settle();

        assert.strictEqual(tableEl.getAttribute('src'), '/api/other', 'writing src reflects it to the attribute');
        assert.strictEqual(tableEl.src, '/api/other', 'src answers the url written');
        assert.strictEqual(calls.at(-1).url, '/api/other', 'writing src reloads from the new url');
    });

    it('asks with the new method when method changes', async () => {
        const [tableEl] = await mountRemote(`src="/api/rows"`);
        await tableEl.reload();

        tableEl.method = 'POST';
        await settle();

        assert.strictEqual(calls.at(-1).method, 'POST', 'a method change reloads with the new method');
        assert.strictEqual(tableEl.getAttribute('method'), 'POST', 'writing method reflects it to the attribute');
        assert.strictEqual(tableEl.method, 'POST', 'method answers the method written');
    });

    it('only rebuilds the loader of a table that has not loaded yet', async () => {
        const [tableEl] = await mountRemote(`src="/api/rows"`);

        tableEl.src = '/api/other';
        await settle();
        assert.deepStrictEqual(calls, [], 'no load before the first one is asked for');

        await tableEl.reload();
        assert.strictEqual(calls[0].url, '/api/other', 'the first load asks the url written before it');
    });

    it('asks once, from the first page, when reconfigure changes src and method together', async () => {
        const [tableEl] = await mountRemote(`src="/api/rows" page-size="25"`);
        await tableEl.load({ page: 3, size: 25 }, null, {});
        calls = [];

        await tableEl.reconfigure({ src: '/api/other', method: 'POST' });

        assert.strictEqual(calls.length, 1, 'reconfigure loads once for src and method together');
        assert.strictEqual(calls[0].method, 'POST', 'the reconfigured load sends with the new method');
        assert.strictEqual(calls[0].url, '/api/other', 'the reconfigured load asks the new url');
        assert.deepStrictEqual(
            calls[0].params,
            { page: 0, size: 25, sort: null, filters: null },
            'the reconfigured load starts from the first page, keeping the size',
        );
    });

    it('loads a table that has not loaded yet when reconfigured', async () => {
        const [tableEl] = await mountRemote(`src="/api/rows"`);

        await tableEl.reconfigure({ src: '/api/other' });

        assert.deepStrictEqual(
            calls.map((c) => c.url),
            ['/api/other'],
            'reconfigure loads a table that has not loaded yet, unlike a write of src',
        );
    });

    it('ignores a write that does not change the url', async () => {
        const [tableEl] = await mountRemote(`src="/api/rows"`);
        await tableEl.reload();

        tableEl.src = '/api/rows';
        await settle();

        assert.strictEqual(calls.length, 1, 'a src write that does not change the url starts no load');
    });
});

describe('Table page-size', () => {
    let requests;
    let sorts;
    const mount = async (attributes) => {
        const container = appended(`
            <ful-table ${attributes}>
                <template slot="schema">
                    <schema><column title="A">{{ a }}</column></schema>
                </template>
            </ful-table>`);
        const tableEl = container.querySelector('ful-table');
        await Rendering.waitFor(tableEl);
        await settle();
        return tableEl;
    };
    beforeEach(() => {
        requests = [];
        sorts = [];
        registry.defineComponent('loaders:table', {
            create: () => ({
                load: async (pageRequest, sortRequest, filterRequest) => {
                    requests.push(pageRequest);
                    sorts.push(sortRequest);
                    return { data: [{ a: 1 }], size: 100 };
                },
            }),
        });
    });

    it('answers the default size on a table that has not rendered yet', () => {
        assert.strictEqual(
            document.createElement('ful-table').pageSize,
            10,
            'a table that has not rendered yet answers ten rows per page',
        );
    });

    it('answers the size the next load will carry, declared or defaulted', async () => {
        assert.strictEqual((await mount('page-size="25"')).pageSize, 25, 'pageSize answers the declared page-size');
        assert.strictEqual((await mount('')).pageSize, 10, 'ten without the attribute');
    });

    it('does not reload while the base applies the declared value', async () => {
        await mount('autoload page-size="25"');

        assert.deepStrictEqual(
            requests,
            [{ page: 0, size: 25 }],
            'applying the declared page-size at render does not add a reload to the autoload',
        );
    });

    it('reloads from the first page when the size changes', async () => {
        const tableEl = await mount('autoload page-size="10"');
        click(pageLink(tableEl.querySelector('ful-pagination'), '4'));
        await settle();
        assert.deepStrictEqual(requests.at(-1), { page: 3, size: 10 }, 'a click on a page button loads that page');

        tableEl.setAttribute('page-size', '25');
        await settle();

        assert.deepStrictEqual(
            requests.at(-1),
            { page: 0, size: 25 },
            'a size change reloads from the first page with the new size',
        );
        assert.strictEqual(tableEl.pageSize, 25, 'pageSize answers the size written through the attribute');
    });

    it('takes the size from the property as well as from the attribute', async () => {
        const tableEl = await mount('autoload');

        tableEl.pageSize = 5;
        await settle();

        assert.deepStrictEqual(
            requests.at(-1),
            { page: 0, size: 5 },
            'writing pageSize reloads from the first page with that size',
        );
    });

    it('restores the default when the attribute is removed', async () => {
        const tableEl = await mount('autoload page-size="25"');

        tableEl.removeAttribute('page-size');
        await settle();

        assert.deepStrictEqual(
            requests.at(-1),
            { page: 0, size: 10 },
            'removing the attribute restores the default of ten rows, not a size that is not a number',
        );
    });

    it('ignores a write that does not change the size', async () => {
        const tableEl = await mount('autoload page-size="10"');
        const before = requests.length;

        tableEl.setAttribute('page-size', '10');
        tableEl.pageSize = 10;
        await settle();

        assert.strictEqual(requests.length, before, 'a write of the same size starts no load');
    });

    it('records the size without loading a table that was never asked to load', async () => {
        const tableEl = await mount('page-size="10"');
        assert.deepStrictEqual(requests, [], 'no autoload, nothing asked for');

        tableEl.pageSize = 25;
        await settle();

        assert.deepStrictEqual(requests, [], 'writing the size is not a request to start');
        assert.strictEqual(tableEl.pageSize, 25, 'pageSize answers the recorded size');

        await tableEl.reload();

        assert.deepStrictEqual(requests, [{ page: 0, size: 25 }], 'the first load asks with the recorded size');
    });

    it('keeps a size written while the first load is still in flight', async () => {
        let release;
        registry.defineComponent('loaders:table', {
            create: () => ({
                load: async (pageRequest) => {
                    requests.push(pageRequest);
                    await new Promise((resolve) => {
                        release = resolve;
                    });
                    return { data: [{ a: 1 }], size: 100 };
                },
            }),
        });
        const tableEl = await mount('autoload page-size="10"');

        tableEl.pageSize = 25;
        release();
        await settle();

        assert.strictEqual(tableEl.pageSize, 25, 'a size written during the first load is kept');
        assert.deepStrictEqual(
            requests.at(-1),
            { page: 0, size: 25 },
            'a size written during the first load reloads from the first page with it',
        );
    });

    it('keeps the sort when the size changes', async () => {
        const container = appended(`
            <ful-table autoload page-size="10">
                <template slot="schema">
                    <schema><column title="A" sorter="a" order="asc">{{ a }}</column></schema>
                </template>
            </ful-table>`);
        const tableEl = container.querySelector('ful-table');
        await Rendering.waitFor(tableEl);
        await settle();

        tableEl.pageSize = 25;
        await settle();

        assert.deepStrictEqual(
            requests.at(-1),
            { page: 0, size: 25 },
            'a size change reloads from the first page with the new size',
        );
        assert.deepStrictEqual(sorts.at(-1), { sorter: 'a', order: 'asc' }, 'the declared sort survives');
    });
});

describe('Table empty state', () => {
    let answer;
    let fails;
    const mount = async (slots = '') => {
        const container = appended(`
            <ful-table autoload>
                <template slot="schema"><schema><column title="A">{{ a }}</column></schema></template>
                ${slots}
            </ful-table>`);
        const tableEl = container.querySelector('ful-table');
        await Rendering.waitFor(tableEl);
        await settle();
        return tableEl;
    };
    const panel = (tableEl) => tableEl.querySelector('tbody[data-ref=empty]');
    beforeEach(() => {
        answer = { data: [], size: 0 };
        fails = false;
        registry.defineComponent('loaders:table', {
            create: () => ({
                load: async () => {
                    if (fails) {
                        throw new Error('boom');
                    }
                    return answer;
                },
            }),
        });
    });

    it('stands a panel in for the rows when a load returns none, and takes it away when one returns some', async () => {
        const tableEl = await mount();
        assert.isFalse(panel(tableEl).hidden, 'a load answering no rows shows the empty panel');
        assert.strictEqual(
            panel(tableEl).querySelector('ful-empty').textContent.trim(),
            'No elements found.',
            'without an empty slot the panel shows the localized default',
        );

        answer = { data: [{ a: 'one' }], size: 1 };
        await tableEl.reload();
        assert.isTrue(panel(tableEl).hidden, 'a load answering rows hides the empty panel');
        assert.deepStrictEqual(rowTexts(tableEl), ['one'], 'a load answering rows shows them');

        answer = { data: [], size: 0 };
        await tableEl.reload();
        assert.isFalse(panel(tableEl).hidden, 'a table emptied by a filter says so again');
    });

    it('renders the empty slot per load, with the filter request in scope', async () => {
        const tableEl = await mount(`<template slot="empty"><p>{{ filterRequest.q ?? 'No pages yet' }}</p></template>`);
        assert.include(
            panel(tableEl).textContent,
            'No pages yet',
            'the empty slot is rendered with the filter request in scope',
        );

        await tableEl.resetWithFilter({ q: 'zzz' });
        assert.include(
            panel(tableEl).textContent,
            'zzz',
            'the empty slot is rendered again for each load, with the filter request of that load in scope',
        );
    });

    it('says what the empty slot says instead of the localized default', async () => {
        const tableEl = await mount('<div slot="empty">No shipments for this customer yet.</div>');

        const empty = panel(tableEl).querySelector('ful-empty');
        assert.strictEqual(
            empty.textContent.trim(),
            'No shipments for this customer yet.',
            'the empty panel shows the content of the empty slot',
        );
        assert.notInclude(panel(tableEl).textContent, 'No elements found.', 'the default is not rendered beside it');
    });

    it('shows the failure alone: an emptied body is not also a result of none', async () => {
        const tableEl = await mount();
        fails = true;
        await tableEl.reload().catch(() => {});

        assert.isFalse(tableEl.querySelector('tbody[data-ref=feedback]').hidden, 'a failed load shows the error panel');
        assert.isTrue(panel(tableEl).hidden, 'a failed load does not show the empty panel beside the error');
    });
});
