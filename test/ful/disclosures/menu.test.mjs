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

//the focused element as its label: a failed assertion handed a dom node hangs
//the runner while chai formats it
const focused = () => /** @type HTMLElement */ (document.activeElement)?.textContent?.trim() ?? '';

const press = (code, key = '') =>
    /** @type HTMLElement */ (document.activeElement).dispatchEvent(
        new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }),
    );

describe('ful-menu', () => {
    it('marks itself and its items with the menu roles, and the invoker with what it opens', async () => {
        const { invoker, menu } = await build();

        assert.strictEqual(menu.getAttribute('role'), 'menu');
        assert.isTrue(menu.hasAttribute('popover'), 'the menu is the popover itself');
        assert.strictEqual(invoker.getAttribute('aria-haspopup'), 'menu');
        assert.strictEqual(invoker.getAttribute('aria-expanded'), 'false');
        assert.strictEqual(invoker.getAttribute('popovertarget'), menu.id);
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

        assert.strictEqual(focused(), 'History');
        assert.strictEqual(invoker.getAttribute('aria-expanded'), 'true');
    });

    it('walks the items with the arrows, wrapping at both ends', async () => {
        const { invoker, menu } = await build();
        await opened(invoker, menu);
        press('ArrowDown');
        assert.strictEqual(focused(), 'Shortcuts');
        press('ArrowDown');
        assert.strictEqual(focused(), 'Export');
        press('ArrowDown');
        assert.strictEqual(focused(), 'History', 'the last item wraps to the first');
        press('ArrowUp');
        assert.strictEqual(focused(), 'Export', 'and the first wraps back to the last');
    });

    it('jumps to the ends with Home and End', async () => {
        const { invoker, menu } = await build();
        await opened(invoker, menu);
        press('End');
        assert.strictEqual(focused(), 'Export');
        press('Home');
        assert.strictEqual(focused(), 'History');
    });

    const threeWords = '<button>History</button><button>Shortcuts</button><button>Statistics</button>';

    it('jumps to the next item starting with the letter typed, the same letter cycling them', async () => {
        const { invoker, menu } = await build(threeWords);

        await opened(invoker, menu);
        press('KeyS', 's');
        assert.strictEqual(focused(), 'Shortcuts');
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

        assert.strictEqual(focused(), 'Statistics');
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

        assert.deepStrictEqual(picked, ['History']);
        assert.isFalse(menu.matches(':popover-open'));
    });

    it("closes on an item's click, the invoker taking the focus back", async () => {
        const { invoker, menu } = await build();

        await opened(invoker, menu);
        const closed = new Promise((resolve) => menu.addEventListener('toggle', resolve, { once: true }));
        menu.items[2].click();
        assert.strictEqual(focused(), 'More', 'handed back as the menu hides, before the hidden item can drop it');
        await closed;

        assert.isFalse(menu.matches(':popover-open'));
        assert.strictEqual(focused(), 'More');
    });

    it('hands the focus back to the invoker on Escape, before the platform closes it', async () => {
        const { invoker, menu } = await build();

        await opened(invoker, menu);
        press('Escape', 'Escape');

        assert.strictEqual(focused(), 'More');
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

        assert.strictEqual(focused(), 'Export');
        assert.strictEqual(added.getAttribute('role'), 'menuitem');
    });

    it('refuses a for that names nothing, rather than opening a menu with no invoker', async () => {
        const container = appended('<ful-menu for="nobody"><button>History</button></ful-menu>');

        const failure = await Rendering.waitFor(container).then(
            () => null,
            (e) => e,
        );

        assert.match(failure?.message ?? '', /ful-menu names no invoker/);
    });

    it('focuses its first item as it opens where the popover is placed by hand', async () => {
        //the fallback hides the popover while it measures it, and a hidden
        //element cannot take the focus
        const supports = CSS.supports;
        CSS.supports = () => false;
        let built;
        try {
            built = await build();
        } finally {
            CSS.supports = supports;
        }

        await opened(built.invoker, built.menu);

        assert.strictEqual(focused(), 'History');
        assert.notStrictEqual(built.menu.style.left, '', 'and the fallback did place it');
    });
});
