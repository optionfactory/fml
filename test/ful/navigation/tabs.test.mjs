import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { AsyncEvents, Plugin } from '../../../src/ful/index.mjs';
import { captureConsole, mount as mounted, settle as drain, attached } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const settle = () => drain();
const mount = async (html) => {
    const container = await mounted(html);
    await settle();
    return container.firstElementChild;
};

describe('Tabs', () => {
    const markup = `
        <ful-tabs>
            <template slot="tabs"><tab>Shipping</tab><tab>Invoices</tab><tab>Claims</tab></template>
            <section id="s1">shipping panel</section>
            <section id="s2">invoices panel</section>
            <section id="s3">claims panel</section>
        </ful-tabs>`;

    it('renders the tab pattern: a tablist of buttons naming tabpanels', async () => {
        const tabs = await mount(markup);
        const tablist = tabs.querySelector('ful-tablist');
        const buttons = [...tablist.querySelectorAll('button')];

        assert.strictEqual(
            tablist.getAttribute('role'),
            'tablist',
            'the tabs are wrapped in a ful-tablist carrying the tablist role of the tab pattern',
        );
        assert.lengthOf(buttons, 3, 'each declared tab paired with a panel becomes one button');
        assert.deepStrictEqual(
            buttons.map((b) => b.textContent),
            ['Shipping', 'Invoices', 'Claims'],
            'each button carries the content of its declared tab, in declaration order',
        );
        for (const [i, button] of buttons.entries()) {
            assert.strictEqual(button.getAttribute('role'), 'tab', 'every tab button carries the tab role');
            assert.strictEqual(
                button.getAttribute('aria-selected'),
                i === 0 ? 'true' : 'false',
                'only the active tab is announced as selected',
            );
            assert.strictEqual(button.tabIndex, i === 0 ? 0 : -1, 'the roving tabindex starts on the active tab');
            const panel = tabs.querySelector(`#${button.getAttribute('aria-controls')}`);
            assert.strictEqual(
                panel.getAttribute('role'),
                'tabpanel',
                'the panel a tab controls carries the tabpanel role',
            );
            assert.strictEqual(
                panel.getAttribute('aria-labelledby'),
                button.id,
                'each panel is labelled by the tab that controls it',
            );
            assert.strictEqual(panel.hasAttribute('hidden'), i !== 0, 'only the active panel is shown');
        }
    });

    it('moves the active panel by click and by property, answering with change', async () => {
        const tabs = await mount(markup);
        const changes = [];
        tabs.addEventListener('tabs:change', (e) => changes.push(e.detail));

        tabs.querySelectorAll('[role="tab"]')[1].click();
        assert.strictEqual(tabs.active, 1, 'clicking a tab activates it');
        assert.isTrue(tabs.querySelector('#s2').hidden === false, 'the second panel is the visible one');
        assert.deepStrictEqual(
            changes,
            [{ active: 1, previous: 0 }],
            'a change of the active panel dispatches tabs:change with the new and the previous index',
        );

        tabs.active = 2;
        assert.strictEqual(tabs.getAttribute('active'), '2', 'the property reflects to the attribute');
        assert.deepStrictEqual(
            changes[1],
            { active: 2, previous: 1 },
            'writing active dispatches tabs:change just as a click does',
        );
    });

    it('walks the tabs with the keyboard, wrapping around', async () => {
        const tabs = await mount(markup);
        const buttons = tabs.querySelectorAll('[role="tab"]');
        buttons[0].focus();

        tabs.querySelector('ful-tablist').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
        );
        assert.strictEqual(tabs.active, 1, 'ArrowRight moves to the next tab');
        tabs.querySelector('ful-tablist').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }),
        );
        assert.strictEqual(tabs.active, 2, 'End jumps to the last tab');
        tabs.querySelector('ful-tablist').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
        );
        assert.strictEqual(tabs.active, 0, 'the walk wraps');
        assert.strictEqual(document.activeElement, buttons[0], 'the focus follows the walk');
    });

    it('walks left and Home, and ignores a key that asks for where it already is', async () => {
        const tabs = await mount(markup);
        const tablist = tabs.querySelector('ful-tablist');
        const key = (k) =>
            tablist.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

        key('ArrowLeft');
        assert.strictEqual(tabs.active, 2, 'left from the first wraps to the last');
        key('ArrowLeft');
        assert.strictEqual(tabs.active, 1, 'ArrowLeft moves to the previous tab');
        key('Home');
        assert.strictEqual(tabs.active, 0, 'Home jumps to the first tab');

        const home = new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true });
        tablist.dispatchEvent(home);
        assert.strictEqual(tabs.active, 0, 'Home on the first tab leaves the active tab where it is');
        assert.isFalse(home.defaultPrevented, 'a walk that goes nowhere does not swallow the key');

        const ignored = new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true });
        tablist.dispatchEvent(ignored);
        assert.strictEqual(tabs.active, 0, 'a key the tablist does not handle leaves the active tab where it is');
        assert.isFalse(ignored.defaultPrevented, 'a key the tablist does not handle keeps its default action');
    });

    it('leaves the surplus alone when the tabs and the panels disagree, and says so', async () => {
        const warnings = captureConsole('warn');
        const tabs = await mount(`
            <ful-tabs>
                <template slot="tabs"><tab>One</tab><tab>Two</tab><tab>Three</tab></template>
                <section id="only">one panel</section>
            </ful-tabs>`);

        assert.lengthOf(tabs.querySelectorAll('ful-tablist button'), 1, 'only the paired tab is rendered');
        assert.isTrue(
            warnings.some((w) => w.includes('3 tabs declared for 1 panels')),
            `expected the mismatch warning, saw ${JSON.stringify(warnings)}`,
        );
    });

    it('starts from the active attribute, clamped to the declared panels', async () => {
        const tabs = await mount(markup.replace('<ful-tabs>', '<ful-tabs active="9">'));

        assert.strictEqual(tabs.active, 2, 'an active attribute past the last panel is clamped to the last one');
    });
});

describe('Tabs, async panels', () => {
    const markup = `
        <ful-tabs>
            <template slot="tabs"><tab>One</tab><tab>Two</tab></template>
            <section id="p1">first</section>
            <section id="p2">second</section>
        </ful-tabs>`;

    it('fires the section requests on the component for the activated panel, and again on refresh', async () => {
        const tabs = await mount(markup);
        const panel = tabs.querySelector('#p2');
        const seen = [];
        AsyncEvents.asyncOn(tabs, 'section:requested', (e) =>
            seen.push(
                `generic|${e.detail.index}|${e.detail.name}|${e.detail.first}|${e.detail.section === panel}|${e.target === tabs}`,
            ),
        );
        AsyncEvents.asyncOn(tabs, 'section:requested:#1', (e) => seen.push(`index|${e.detail.index}`));

        tabs.active = 1;
        await settle();
        tabs.refresh(1);
        await settle();

        assert.deepStrictEqual(
            seen,
            ['generic|1|null|true|true|true', 'index|1', 'generic|1|null|false|true|true', 'index|1'],
            'an activation and a refresh each fire the generic and the indexed request on the host, first true only the first time',
        );
    });

    it('rejects nowhere on a failed delivery, from an activation or a refresh, the problems painted', async () => {
        const tabs = await mount(markup);
        AsyncEvents.asyncOn(tabs, 'section:requested:#1', () => {
            throw new Error('unreachable (demo)');
        });

        tabs.active = 1;
        await settle();
        assert.include(
            tabs.querySelector('#p2 > .ful-section-error')?.textContent ?? '',
            'unreachable',
            'a failed delivery on activation paints its error in the panel',
        );

        assert.isUndefined(await tabs.refresh(1), 'the refresh swallows the failure');
        assert.include(
            tabs.querySelector('#p2 > .ful-section-error')?.textContent ?? '',
            'unreachable',
            'a failed delivery on refresh paints its error in the panel',
        );
    });

    it('fires no section request when no panel is declared', async () => {
        const seen = [];
        const host = document.createElement('div');
        AsyncEvents.asyncOn(host, 'section:requested', (e) => seen.push(e.detail));
        host.innerHTML = '<ful-tabs></ful-tabs>';
        attached(host);

        await Rendering.waitFor(host);
        await settle();

        assert.isEmpty(seen, 'a panel-less activation must not ask for a delivery');
        host.remove();
    });

    it('answers null and unknown indices of refresh with a warning, not with panel 0', async () => {
        const tabs = await mount(markup);
        const seen = [];
        AsyncEvents.asyncOn(tabs, 'section:requested', (e) => seen.push(e.detail.index));

        assert.isUndefined(tabs.refresh(null), 'a null index names no panel, so refresh answers undefined');
        assert.isUndefined(
            tabs.refresh(7),
            'an index past the declared panels names no panel, so refresh answers undefined',
        );
        await settle();

        assert.deepStrictEqual(seen, [], 'a refresh naming no panel fires no request, not even for panel 0');
    });

    describe('when the tabs do not fit', () => {
        const frames = (n = 2) =>
            new Promise((resolve) => {
                const next = (left) => (left === 0 ? resolve() : requestAnimationFrame(() => next(left - 1)));
                next(n);
            });
        const scrolledAway = async (list, from) => {
            for (let i = 0; i !== 120 && list.scrollLeft === from; ++i) {
                await frames(1);
            }
            let last = -1;
            while (last !== list.scrollLeft) {
                last = list.scrollLeft;
                await frames(3);
            }
        };
        const crowded = async (width) => {
            const names = Array.from({ length: 12 }, (_, i) => `<tab>Carrier number ${i + 1}</tab>`).join('');
            const panels = Array.from({ length: 12 }, (_, i) => `<section>panel ${i + 1}</section>`).join('');
            const tabs = await mount(
                `<ful-tabs style="inline-size: ${width}px"><template slot="tabs">${names}</template>${panels}</ful-tabs>`,
            );
            await frames();
            return {
                tabs,
                list: tabs.querySelector('ful-tablist'),
                start: tabs.querySelector('[data-ref="scroll-start"]'),
                end: tabs.querySelector('[data-ref="scroll-end"]'),
            };
        };
        const visible = (tab, { start, end, list }) => {
            const view = list.getBoundingClientRect();
            const box = tab.getBoundingClientRect();
            return box.left >= view.left + start.offsetWidth - 1 && box.right <= view.right - end.offsetWidth + 1;
        };

        it('keeps the tabs on one line and shows the scroll buttons only at the sides with more tabs', async () => {
            const wide = await crowded(4000);
            assert.isTrue(wide.start.hidden && wide.end.hidden, 'tabs that fit show no scroll button');

            const narrow = await crowded(400);
            const tops = new Set([...narrow.list.children].map((tab) => tab.offsetTop));
            assert.strictEqual(tops.size, 1, 'the tabs stay on one line instead of wrapping');
            assert.isTrue(narrow.start.hidden, 'at the start there is nothing before the first tab');
            assert.isFalse(narrow.end.hidden, 'the tabs past the end show the next button');
            assert.strictEqual(narrow.end.tabIndex, -1, 'the scroll buttons stay out of the tab order');
        });

        it('scrolls by one tab, bringing the first cut tab wholly into view', async () => {
            const crowd = await crowded(400);
            const cut = [...crowd.list.children].find((tab) => !visible(tab, crowd));

            crowd.end.click();
            await scrolledAway(crowd.list, 0);

            assert.isTrue(visible(cut, crowd), 'the first tab cut at the end is now wholly visible');
            assert.isFalse(crowd.start.hidden, 'once scrolled, the previous button appears');
            const before = crowd.list.scrollLeft;
            crowd.start.click();
            await scrolledAway(crowd.list, before);
            assert.isBelow(crowd.list.scrollLeft, before, 'the previous button scrolls back');
        });

        it('keeps the tablist its full height inside a flex column of bounded height', async () => {
            const host = await mount(`
                <div style="display: flex; flex-direction: column; block-size: 120px">
                    <ful-tabs style="display: flex; flex-direction: column; min-block-size: 0">
                        <template slot="tabs"><tab>Shipping</tab><tab>Invoices</tab></template>
                        <section style="block-size: 600px">a tall panel</section>
                        <section>b</section>
                    </ful-tabs>
                </div>`);
            const list = host.querySelector('ful-tablist');

            assert.strictEqual(
                list.clientHeight,
                list.scrollHeight,
                'a tall panel in a bounded flex column must not squeeze the scrolling tablist',
            );
        });

        it('keeps the active tab in view', async () => {
            const crowd = await crowded(400);

            crowd.tabs.active = 11;
            await frames();

            assert.isTrue(visible(crowd.list.children[11], crowd), 'activating the last tab scrolls it into view');
            assert.isTrue(crowd.end.hidden, 'with the last tab in view nothing is left past the end');
        });
    });
});
