import { assert } from 'chai';
import { wireAnchoredPopover } from '../../../src/ful/disclosures/anchors.mjs';

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

describe('the anchored popover fallback', () => {
    it('forgets a popover removed while open instead of placing it forever', async () => {
        const invoker = document.createElement('button');
        const popover = document.createElement('div');
        popover.setAttribute('popover', 'manual');
        document.body.append(invoker, popover);
        withoutPlatformAnchors(() => wireAnchoredPopover(invoker, popover));
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
