import { assert } from 'chai';
import { Anchors } from '../../../src/ful/disclosures/anchors.mjs';

const frames = async (count = 3) => {
    for (let i = 0; i !== count; ++i) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
    }
};

//the hand placement is the fallback for a platform without css anchor
//positioning: failing the probe exercises it on every browser rather than
//on whichever one happens to lack the css today
const withoutPlatformAnchors = (run) => {
    const supports = CSS.supports;
    CSS.supports = () => false;
    try {
        return run();
    } finally {
        CSS.supports = supports;
    }
};

describe('The anchored popover fallback', () => {
    it('forgets a popover removed while open instead of placing it forever', async () => {
        const invoker = document.createElement('button');
        const popover = document.createElement('div');
        popover.setAttribute('popover', 'manual');
        document.body.append(invoker, popover);
        withoutPlatformAnchors(() => Anchors.wire(invoker, popover));
        //the toggle that registers the pair is a queued task, not the
        //synchronous beforetoggle that places it: waiting for it is what keeps
        //the removal below from racing the registration
        const registered = new Promise((resolve) => popover.addEventListener('toggle', resolve, { once: true }));
        popover.showPopover();
        await registered;
        await frames(1);
        assert.notEqual(popover.style.left, '', 'the fallback placed the popover');

        //the platform hides it without a toggle event, so nothing told the
        //reflow registry that the pair it holds is gone
        popover.remove();
        invoker.remove();
        popover.style.removeProperty('left');
        popover.style.removeProperty('top');

        document.dispatchEvent(new Event('scroll'));
        await frames();
        assert.equal(popover.style.left, '', 'a popover out of the document is not placed again');

        document.dispatchEvent(new Event('scroll'));
        await frames();
        assert.equal(popover.style.left, '', 'and it is not held for the next pass either');
    });
});

describe('The placing of a popover as it opens', () => {
    it('is not shown until it can be measured', async () => {
        //a note: centring on the invoker and lifting by its own height are the
        //two placements that read the popover's size, and a popover measures
        //zero until the platform has shown it
        const invoker = document.createElement('button');
        invoker.textContent = 'i';
        invoker.style.margin = '300px 0 0 200px';
        const note = document.createElement('div');
        note.setAttribute('popover', 'manual');
        note.setAttribute('placement', 'top');
        note.style.width = '320px';
        note.style.height = '200px';
        document.body.append(invoker, note);
        try {
            withoutPlatformAnchors(() => Anchors.wire(invoker, note));

            note.showPopover();
            assert.strictEqual(
                getComputedStyle(note).visibility,
                'hidden',
                'the showing itself paints nothing: the popover is still unmeasurable here',
            );

            await frames(2);
            assert.notStrictEqual(getComputedStyle(note).visibility, 'hidden', 'and it is shown a frame later');
            const here = note.getBoundingClientRect();
            const there = invoker.getBoundingClientRect();
            assert.closeTo(here.left + here.width / 2, there.left + there.width / 2, 1, 'centred on its invoker');
            assert.isBelow(here.bottom, there.top + 1, 'and above it, by its own height');
        } finally {
            invoker.remove();
            note.remove();
        }
    });
});

describe('Anchors.wire invoke and expanded', () => {
    it('points popovertarget at the popover and keeps aria-expanded in step', async () => {
        //an invoker and a plain list of links: no menu semantics, popovertarget
        //carrying the toggle and the light dismiss
        const invoker = document.createElement('button');
        const menu = document.createElement('ul');
        menu.setAttribute('popover', '');
        menu.innerHTML = '<li><a href="#a">A</a></li>';
        document.body.append(invoker, menu);
        try {
            Anchors.wire(invoker, menu, { prefix: 'app-menu', invoke: true, expanded: true });

            assert.isNotEmpty(menu.id, 'the popover is given an id to be targeted by');
            assert.strictEqual(invoker.getAttribute('popovertarget'), menu.id);
            assert.strictEqual(invoker.getAttribute('aria-expanded'), 'false');
            assert.match(invoker.style.anchorName, /^--app-menu/, 'the prefix names the anchor');
            assert.strictEqual(menu.style.positionAnchor, invoker.style.anchorName);

            const opened = new Promise((resolve) => menu.addEventListener('toggle', resolve, { once: true }));
            menu.showPopover();
            await opened;
            assert.strictEqual(invoker.getAttribute('aria-expanded'), 'true');

            const closed = new Promise((resolve) => menu.addEventListener('toggle', resolve, { once: true }));
            menu.hidePopover();
            await closed;
            assert.strictEqual(invoker.getAttribute('aria-expanded'), 'false');
        } finally {
            invoker.remove();
            menu.remove();
        }
    });

    it('keeps an id the caller gave the popover', () => {
        const invoker = document.createElement('button');
        const menu = document.createElement('ul');
        menu.setAttribute('popover', '');
        menu.id = 'mine';
        document.body.append(invoker, menu);
        try {
            Anchors.wire(invoker, menu, { invoke: true });
            assert.strictEqual(menu.id, 'mine');
            assert.strictEqual(invoker.getAttribute('popovertarget'), 'mine');
        } finally {
            invoker.remove();
            menu.remove();
        }
    });

    it('activates a non-button invoker from the keyboard', () => {
        const invoker = document.createElement('span');
        invoker.setAttribute('role', 'button');
        invoker.tabIndex = 0;
        const menu = document.createElement('ul');
        menu.setAttribute('popover', '');
        document.body.append(invoker, menu);
        try {
            withoutPlatformAnchors(() => Anchors.wire(invoker, menu, { invoke: true }));

            invoker.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
            assert.isFalse(menu.matches(':popover-open'), 'a key that is not Enter or Space is left alone');

            invoker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
            assert.isTrue(menu.matches(':popover-open'), 'Enter opens');

            invoker.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
            assert.isFalse(menu.matches(':popover-open'), 'Space toggles it back');
        } finally {
            if (menu.matches(':popover-open')) {
                menu.hidePopover();
            }
            invoker.remove();
            menu.remove();
        }
    });
});

describe('The stretch placement of a dropdown', () => {
    const bare = () => {
        const dropdown = document.createElement('div');
        dropdown.setAttribute('popover', 'manual');
        dropdown.style.boxSizing = 'border-box';
        dropdown.style.padding = '0';
        dropdown.style.border = '0';
        return dropdown;
    };
    const showStretched = async (invoker, dropdown) => {
        withoutPlatformAnchors(() => Anchors.wire(invoker, dropdown, { stretch: true }));
        const placed = new Promise((resolve) => dropdown.addEventListener('toggle', resolve, { once: true }));
        dropdown.showPopover();
        await placed;
        await frames(2);
    };
    const cleanup = (invoker, dropdown, style) => {
        if (dropdown.matches(':popover-open')) {
            dropdown.hidePopover();
        }
        invoker.remove();
        dropdown.remove();
        style.remove();
    };

    it('is no wider than its max-width, however long its content', async () => {
        const invoker = document.createElement('button');
        invoker.textContent = 'pick';
        invoker.style.width = '40px';
        const dropdown = bare();
        dropdown.id = 'capped-dd';
        dropdown.innerHTML = '<div style="width: 400px; height: 40px;"></div>';
        const style = document.createElement('style');
        style.textContent = '#capped-dd { max-width: 200px; }';
        document.head.appendChild(style);
        document.body.append(invoker, dropdown);
        try {
            await showStretched(invoker, dropdown);
            assert.closeTo(dropdown.getBoundingClientRect().width, 200, 1, 'the content does not push past the cap');
        } finally {
            cleanup(invoker, dropdown, style);
        }
    });

    it('is at least its invoker wide', async () => {
        const invoker = document.createElement('button');
        invoker.textContent = 'pick';
        invoker.style.width = '300px';
        const dropdown = bare();
        dropdown.textContent = 'x';
        document.body.append(invoker, dropdown);
        try {
            await showStretched(invoker, dropdown);
            assert.closeTo(dropdown.getBoundingClientRect().width, 300, 1, 'the invoker is matched at minimum');
        } finally {
            cleanup(invoker, dropdown, document.createElement('style'));
        }
    });

    it('opens below its invoker while the viewport has room', async () => {
        const invoker = document.createElement('button');
        invoker.textContent = 'pick';
        invoker.style.position = 'fixed';
        invoker.style.top = '20px';
        invoker.style.left = '40px';
        const dropdown = bare();
        dropdown.innerHTML = '<div style="height: 100px;"></div>';
        document.body.append(invoker, dropdown);
        try {
            await showStretched(invoker, dropdown);
            const here = dropdown.getBoundingClientRect();
            const there = invoker.getBoundingClientRect();
            assert.isAtLeast(here.top, there.bottom - 1, 'below the invoker');
            assert.closeTo(here.left, there.left, 1, 'start aligned with the invoker');
        } finally {
            cleanup(invoker, dropdown, document.createElement('style'));
        }
    });

    it('flips above its invoker where the viewport leaves no room below', async () => {
        const invoker = document.createElement('button');
        invoker.textContent = 'pick';
        invoker.style.position = 'fixed';
        invoker.style.bottom = '30px';
        invoker.style.left = '40px';
        const dropdown = bare();
        dropdown.innerHTML = '<div style="height: 200px;"></div>';
        document.body.append(invoker, dropdown);
        try {
            await showStretched(invoker, dropdown);
            const here = dropdown.getBoundingClientRect();
            const there = invoker.getBoundingClientRect();
            assert.isAtMost(here.bottom, there.top + 1, 'above the invoker, not covering it');
        } finally {
            cleanup(invoker, dropdown, document.createElement('style'));
        }
    });
});

describe('Anchors.show, the one-shot placement', () => {
    const bare = () => {
        const popover = document.createElement('div');
        popover.setAttribute('popover', 'manual');
        popover.style.boxSizing = 'border-box';
        popover.style.padding = '0';
        popover.style.border = '0';
        return popover;
    };
    const placed = async (popover, anchor, options) => {
        Anchors.show(popover, anchor, options);
        await frames(2);
        return popover.getBoundingClientRect();
    };
    const cleanup = (anchor, popover) => {
        if (popover.matches(':popover-open')) {
            popover.hidePopover();
        }
        anchor?.remove?.();
        popover.remove();
    };

    it('places a shared popover below its anchor element, start aligned', async () => {
        const invoker = document.createElement('button');
        invoker.textContent = 'open';
        invoker.style.position = 'fixed';
        invoker.style.top = '60px';
        invoker.style.left = '80px';
        const popover = bare();
        popover.innerHTML = '<div style="width: 120px; height: 80px;"></div>';
        document.body.append(invoker, popover);
        try {
            const here = await placed(popover, invoker);
            const there = invoker.getBoundingClientRect();
            assert.isTrue(popover.matches(':popover-open'), 'the popover is shown');
            assert.closeTo(here.left, there.left, 1, 'start aligned');
            assert.isAtLeast(here.top, there.bottom - 1, 'below the anchor');
        } finally {
            cleanup(invoker, popover);
        }
    });

    it('takes a rectangle for an anchor, one read out of an iframe among them', async () => {
        const popover = bare();
        popover.innerHTML = '<div style="width: 100px; height: 50px;"></div>';
        document.body.append(popover);
        try {
            const here = await placed(popover, new DOMRect(200, 150, 60, 30));
            assert.closeTo(here.left, 200, 1);
            assert.closeTo(here.top, 180, 1, 'below the rectangle');
        } finally {
            cleanup(null, popover);
        }
    });

    it('honours the gap and flips above where no room is left below', async () => {
        const invoker = document.createElement('button');
        invoker.textContent = 'open';
        invoker.style.position = 'fixed';
        invoker.style.bottom = '40px';
        invoker.style.left = '80px';
        const popover = bare();
        popover.innerHTML = '<div style="width: 100px; height: 150px;"></div>';
        document.body.append(invoker, popover);
        try {
            const here = await placed(popover, invoker, { flip: true, gap: 6 });
            const there = invoker.getBoundingClientRect();
            assert.closeTo(here.bottom, there.top - 6, 1, 'above the anchor, at the gap');

            const clamped = await placed(popover, invoker, { gap: 6 });
            assert.isAbove(clamped.bottom, there.top, 'without flip it never moves above the anchor');
            assert.isAtMost(clamped.bottom, document.documentElement.clientHeight + 1, 'it stays in the viewport');
        } finally {
            cleanup(invoker, popover);
        }
    });

    it('places an already-open popover without showing it again', async () => {
        const invoker = document.createElement('button');
        invoker.textContent = 'open';
        invoker.style.position = 'fixed';
        invoker.style.top = '60px';
        invoker.style.left = '10px';
        const popover = bare();
        popover.innerHTML = '<div style="width: 100px; height: 50px;"></div>';
        document.body.append(invoker, popover);
        try {
            popover.showPopover();
            const first = await placed(popover, invoker);
            assert.closeTo(first.left, 10, 1);
            invoker.style.left = '300px';
            const second = await placed(popover, invoker);
            assert.closeTo(second.left, 300, 1, 'a shared popover follows whoever opened it last');
        } finally {
            cleanup(invoker, popover);
        }
    });
});
