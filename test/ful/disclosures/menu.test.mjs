import { assert } from 'chai';
import { Rendering, registry } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';
import { appended, mount, tick } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

let seq = 0;
const build = async (items = '<button>History</button><button>Shortcuts</button><button>Export</button>') => {
    const id = `menu-invoker-${++seq}`;
    const container = await mount(`<button id="${id}">More</button><ful-menu for="${id}">${items}</ful-menu>`, {
        children: true,
    });
    return {
        invoker: /** @type HTMLElement */ (container.querySelector('button')),
        menu: /** @type any */ (container.querySelector('ful-menu')),
    };
};

const opened = async (invoker, menu) => {
    const toggled = new Promise((resolve) => menu.addEventListener('toggle', resolve, { once: true }));
    invoker.click();
    await toggled;
};

const focused = () => /** @type HTMLElement */ (document.activeElement)?.textContent?.trim() ?? '';

const press = (code, key = '') =>
    /** @type HTMLElement */ (document.activeElement).dispatchEvent(
        new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }),
    );

describe('ful-menu', () => {
    it('marks itself and its items with the menu roles, and the invoker with what it opens', async () => {
        const { invoker, menu } = await build();

        assert.strictEqual(
            menu.getAttribute('role'),
            'menu',
            'the element carries the menu role, as the ARIA menu protocol asks',
        );
        assert.isTrue(menu.hasAttribute('popover'), 'the menu is the popover itself');
        assert.strictEqual(invoker.getAttribute('aria-haspopup'), 'menu', 'the invoker announces that it opens a menu');
        assert.strictEqual(
            invoker.getAttribute('aria-expanded'),
            'false',
            'the invoker says aria-expanded false while the menu is closed',
        );
        assert.strictEqual(
            invoker.getAttribute('popovertarget'),
            menu.id,
            "the invoker's popovertarget names the menu, so the platform toggles it",
        );
        assert.deepStrictEqual(
            [...menu.querySelectorAll('button')].map((b) => [b.getAttribute('role'), b.tabIndex]),
            [
                ['menuitem', -1],
                ['menuitem', -1],
                ['menuitem', -1],
            ],
            'the items are out of the tab order and behind the arrow keys',
        );
    });

    it('focuses its first item as it opens, and says it is open', async () => {
        const { invoker, menu } = await build();

        await opened(invoker, menu);

        assert.strictEqual(focused(), 'History', 'opening the menu moves the focus to its first item');
        assert.strictEqual(
            invoker.getAttribute('aria-expanded'),
            'true',
            "the invoker's aria-expanded follows the menu to open",
        );
    });

    it('walks the items with the arrows, wrapping at both ends', async () => {
        const { invoker, menu } = await build();
        await opened(invoker, menu);
        press('ArrowDown');
        assert.strictEqual(focused(), 'Shortcuts', 'ArrowDown moves the focus to the next item');
        press('ArrowDown');
        assert.strictEqual(focused(), 'Export', 'ArrowDown again moves the focus to the item after that');
        press('ArrowDown');
        assert.strictEqual(focused(), 'History', 'the last item wraps to the first');
        press('ArrowUp');
        assert.strictEqual(focused(), 'Export', 'and the first wraps back to the last');
    });

    it('jumps to the ends with Home and End', async () => {
        const { invoker, menu } = await build();
        await opened(invoker, menu);
        press('End');
        assert.strictEqual(focused(), 'Export', 'End moves the focus to the last item');
        press('Home');
        assert.strictEqual(focused(), 'History', 'Home moves the focus to the first item');
    });

    const threeWords = '<button>History</button><button>Shortcuts</button><button>Statistics</button>';

    it('jumps to the next item starting with the letter typed, the same letter cycling them', async () => {
        const { invoker, menu } = await build(threeWords);

        await opened(invoker, menu);
        press('KeyS', 's');
        assert.strictEqual(
            focused(),
            'Shortcuts',
            'a typed letter moves the focus to the next item after the focused one starting with it',
        );
        press('KeyS', 's');
        assert.strictEqual(focused(), 'Statistics', 'the same letter again takes the next of the two');
        press('KeyS', 's');
        assert.strictEqual(focused(), 'Shortcuts', 'and it comes back round');
    });

    it('names one item outright once more than a letter is typed', async () => {
        const { invoker, menu } = await build(threeWords);

        await opened(invoker, menu);
        press('KeyS', 's');
        press('KeyT', 't');

        assert.strictEqual(
            focused(),
            'Statistics',
            'a search longer than one character moves the focus to the first item starting with the whole search',
        );
    });

    it('leaves a disabled item out of the walk', async () => {
        const { invoker, menu } = await build('<button>History</button><button disabled>Export</button>');

        await opened(invoker, menu);
        press('ArrowDown');

        assert.strictEqual(focused(), 'History', 'the only item left is the one it opened on');
        assert.strictEqual(
            menu.querySelector('[disabled]').getAttribute('role'),
            'menuitem',
            'it is still an item of the menu to a reader',
        );
    });

    it('activates the focused item with Enter and closes', async () => {
        const { invoker, menu } = await build();
        const picked = [];
        for (const item of menu.items) {
            item.addEventListener('click', () => picked.push(item.textContent));
        }

        await opened(invoker, menu);
        press('ArrowDown');
        press('Enter');

        assert.deepStrictEqual(picked, ['Shortcuts'], "the item's own click is the activation");
        assert.isFalse(menu.matches(':popover-open'), 'and the menu closes on it');
        assert.strictEqual(focused(), 'More', 'with the focus back on the invoker');
    });

    it('activates the focused item with the numpad Enter too', async () => {
        const { invoker, menu } = await build();
        const picked = [];
        for (const item of menu.items) {
            item.addEventListener('click', () => picked.push(item.textContent));
        }

        await opened(invoker, menu);
        press('NumpadEnter', 'Enter');

        assert.deepStrictEqual(picked, ['History'], 'the numpad Enter clicks the focused item, as Enter does');
        assert.isFalse(menu.matches(':popover-open'), "the item's click closes the menu");
    });

    it("closes on an item's click, the invoker taking the focus back", async () => {
        const { invoker, menu } = await build();

        await opened(invoker, menu);
        const closed = new Promise((resolve) => menu.addEventListener('toggle', resolve, { once: true }));
        menu.items[2].click();
        assert.strictEqual(focused(), 'More', 'handed back as the menu hides, before the hidden item can drop it');
        await closed;

        assert.isFalse(menu.matches(':popover-open'), 'a click on an item hides the menu');
        assert.strictEqual(focused(), 'More', 'the focus is still on the invoker once the menu has closed');
    });

    it('hands the focus back to the invoker on Escape, before the platform closes it', async () => {
        const { invoker, menu } = await build();

        await opened(invoker, menu);
        press('Escape', 'Escape');

        assert.strictEqual(
            focused(),
            'More',
            'Escape moves the focus to the invoker, the close being left to the platform',
        );
    });

    it('leaves the focus where a close it did not hold came from', async () => {
        const { invoker, menu } = await build();
        const elsewhere = /** @type HTMLElement */ (appended('<button>elsewhere</button>').firstElementChild);

        await opened(invoker, menu);
        elsewhere.focus();
        const closed = new Promise((resolve) => menu.addEventListener('toggle', resolve, { once: true }));
        menu.hidePopover();
        await closed;
        await tick();

        assert.strictEqual(focused(), 'elsewhere', 'the menu no longer held the focus, so it took none back');
    });

    it('walks the items a page added after it rendered', async () => {
        const { invoker, menu } = await build('<button>History</button>');
        const added = document.createElement('button');
        added.textContent = 'Export';
        menu.append(added);

        await opened(invoker, menu);
        press('ArrowDown');

        assert.strictEqual(
            focused(),
            'Export',
            'an item appended after the render is part of the arrow walk, the items being read on every gesture',
        );
        assert.strictEqual(
            added.getAttribute('role'),
            'menuitem',
            'an item appended after the render is given the menuitem role when the items are read',
        );
    });

    it('refuses a for that names nothing, rather than opening a menu with no invoker', async () => {
        const container = appended('<ful-menu for="nobody"><button>History</button></ful-menu>');

        const failure = await Rendering.waitFor(container).then(
            () => null,
            (e) => e,
        );

        assert.match(
            failure?.message ?? '',
            /ful-menu names no invoker/,
            'the render throws naming the missing invoker when for names no element in the page',
        );
    });

    it('focuses its first item as it opens where the popover is placed by hand', async () => {
        const supports = CSS.supports;
        CSS.supports = () => false;
        let built;
        try {
            built = await build();
        } finally {
            CSS.supports = supports;
        }

        await opened(built.invoker, built.menu);

        assert.strictEqual(
            focused(),
            'History',
            'the first item takes the focus on opening under the script placement as well',
        );
        assert.notStrictEqual(built.menu.style.left, '', 'and the fallback did place it');
    });
});

describe('ful-menu shared by several invokers', () => {
    const buildShared = async () => {
        const container = await mount(
            `<button>Row one</button><button>Row two</button><ful-menu><button>Duplicate</button><button>Rename</button><button>Delete</button></ful-menu>`,
            { children: true },
        );
        const [first, second] = /** @type HTMLElement[] */ ([...container.querySelectorAll(':scope > button')]);
        const menu = /** @type any */ (container.querySelector('ful-menu'));
        for (const invoker of [first, second]) {
            invoker.addEventListener('click', () => menu.showFor(invoker));
        }
        return { first, second, menu };
    };

    const openedFor = async (invoker, menu) => {
        const toggled = new Promise((resolve) => menu.addEventListener('toggle', resolve, { once: true }));
        invoker.click();
        await toggled;
    };

    it('opens from each invoker in turn, walks with the arrows and hands the focus back to the one that opened it', async () => {
        const { first, second, menu } = await buildShared();

        await openedFor(first, menu);
        press('ArrowDown');
        assert.strictEqual(focused(), 'Rename', 'the arrows walk the items of a menu opened by showFor');
        press('Escape', 'Escape');
        assert.strictEqual(focused(), 'Row one', 'Escape hands the focus back to the first invoker, which opened it');
        menu.hidePopover();

        await openedFor(second, menu);
        assert.strictEqual(focused(), 'Duplicate', 'opening for the second invoker focuses the first item');
        press('End');
        assert.strictEqual(focused(), 'Delete', 'End reaches the last item');
        press('Escape', 'Escape');
        assert.strictEqual(
            focused(),
            'Row two',
            'Escape hands the focus back to the second invoker, which opened it this time',
        );
    });

    it('places itself beside the invoker it opens for', async () => {
        const { second, menu } = await buildShared();

        await openedFor(second, menu);
        const anchor = second.getBoundingClientRect();
        const box = menu.getBoundingClientRect();

        assert.isAtLeast(box.top, anchor.bottom - 1, 'the menu opens below the invoker');
        assert.isBelow(Math.abs(box.left - anchor.left), 1, 'the menu starts where the invoker starts');
    });

    it('keeps aria-expanded in step on the invoker it is open for', async () => {
        const { first, second, menu } = await buildShared();

        await openedFor(first, menu);
        assert.strictEqual(first.getAttribute('aria-haspopup'), 'menu', 'showFor tells the invoker what it opens');
        assert.strictEqual(
            first.getAttribute('aria-expanded'),
            'true',
            'the invoker the menu is open for reads expanded',
        );

        menu.showFor(second);
        assert.isTrue(menu.matches(':popover-open'), 'showFor while open moves the menu rather than closing it');
        assert.strictEqual(
            first.getAttribute('aria-expanded'),
            'false',
            'the invoker the menu moved away from reads collapsed',
        );
        assert.strictEqual(
            second.getAttribute('aria-expanded'),
            'true',
            'the invoker the menu moved to reads expanded',
        );
        assert.strictEqual(focused(), 'Duplicate', 'moving the menu puts the focus on its first item again');

        const closed = new Promise((resolve) => menu.addEventListener('toggle', resolve, { once: true }));
        menu.hidePopover();
        await closed;
        assert.strictEqual(
            second.getAttribute('aria-expanded'),
            'false',
            'closing the menu collapses the invoker it was open for',
        );
    });

    it('closes on a second press of the same invoker instead of opening again', async () => {
        const { first, menu } = await buildShared();

        await openedFor(first, menu);
        first.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
        menu.hidePopover();
        first.click();
        await tick();
        assert.isFalse(menu.matches(':popover-open'), 'the press that light-dismissed the menu does not open it again');

        await openedFor(first, menu);
        assert.isTrue(menu.matches(':popover-open'), 'a later press opens it as usual');
    });

    it('refuses showFor on a menu that names its invoker through for', async () => {
        const { menu } = await build();
        const other = /** @type HTMLElement */ (appended('<button>other</button>').firstElementChild);

        assert.throws(
            () => menu.showFor(other),
            /showFor serves a menu without for/,
            'a menu owned by its for invoker is not shared',
        );
    });
});
