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
});
