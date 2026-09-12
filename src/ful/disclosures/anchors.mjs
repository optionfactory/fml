/**
 * The anchored popovers' fallback: where the platform lacks CSS anchor
 * positioning, the popovers ful wires on an invoker are placed beside it
 * by hand, the geometry the anchor css draws on its own. Where the
 * platform carries the css the wiring is a no-op: the stylesheet does
 * the work alone.
 */

import { Attributes } from '../../ftl/index.mjs';

/** the viewport's breathing room when clamping, in pixels */
const PAD = 8;
const open = new Map();
let frame = 0;
let reflowWired = false;

const platformAnchors = () =>
    CSS.supports('anchor-name: --ful-probe') &&
    CSS.supports('position-anchor: --ful-probe') &&
    CSS.supports('position-area: bottom') &&
    CSS.supports('top: anchor(bottom)') &&
    CSS.supports('width: anchor-size(width)');

const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high));

const place = (popover, anchored) => {
    const { invoker, stretch } = anchored;
    const box = invoker.getBoundingClientRect();
    const viewport = document.documentElement;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    //before the placing touches the margins: the css gap lives in them
    const computed = getComputedStyle(popover);
    const gap = (margin) => parseFloat(margin) || 0;
    popover.style.right = 'auto';
    popover.style.bottom = 'auto';
    popover.style.margin = '0';
    if (stretch) {
        const width = Math.min(box.width, vw - 2 * PAD);
        popover.style.width = `${width}px`;
        popover.style.left = `${clamp(box.left, PAD, vw - width - PAD)}px`;
        const height = popover.getBoundingClientRect().height;
        popover.style.top = `${clamp(box.bottom + gap(computed.marginTop), PAD, vh - height - PAD)}px`;
        return;
    }
    //a popover wraps against the spot it lands on: the width is measured
    //wide open, the left clamped so it still fits, the vertical placed
    //against the height that width renders
    const note = popover.matches('ful-note, .ful-note, [placement]');
    const placement = note ? (popover.getAttribute('placement') ?? 'bottom') : 'bottom';
    popover.style.removeProperty('max-width');
    const cap = Math.min(parseFloat(computed.maxWidth) || vw, vw - 2 * PAD);
    popover.style.maxWidth = `${cap}px`;
    popover.style.left = `${PAD}px`;
    const wide = popover.getBoundingClientRect().width;
    let left =
        placement === 'right'
            ? box.right + gap(computed.marginLeft)
            : placement === 'left'
              ? box.left - gap(computed.marginRight) - wide
              : note
                ? box.left + box.width / 2 - wide / 2
                : box.left;
    left = clamp(left, PAD, vw - wide - PAD);
    popover.style.left = `${left}px`;
    popover.style.maxWidth = `${Math.min(cap, vw - PAD - left)}px`;
    const height = popover.getBoundingClientRect().height;
    const top =
        placement === 'top'
            ? box.top - gap(computed.marginBottom) - height
            : placement === 'right' || placement === 'left'
              ? box.top + box.height / 2 - height / 2
              : box.bottom + gap(computed.marginTop);
    popover.style.top = `${clamp(top, PAD, vh - height - PAD)}px`;
};

const unplace = (popover) => {
    for (const property of ['top', 'left', 'right', 'bottom', 'margin', 'max-width', 'width']) {
        popover.style.removeProperty(property);
    }
};

const reflow = () => {
    frame = 0;
    for (const [popover, anchored] of open) {
        //the platform hides a popover removed while open without firing the
        //toggle that would have dropped its entry, so the pass that places the
        //open ones is also where a gone one is forgotten: it is the moment
        //anybody cares, and it needs no callback on either element's life
        if (!popover.isConnected || !anchored.invoker.isConnected) {
            open.delete(popover);
            continue;
        }
        place(popover, anchored);
    }
};

const schedule = () => {
    if (!frame && open.size > 0) {
        frame = requestAnimationFrame(reflow);
    }
};

/**
 * Wires an invoker/popover pair ful anchors through css: where the
 * platform lacks anchor positioning the popover is placed beside its
 * invoker whenever it opens, stretched to the invoker's width when
 * asked, and cleaned up when it closes. Where the css works the call
 * is a no-op.
 */
const wireAnchoredPopover = (
    invoker,
    popover,
    { prefix = 'ful-anchor', invoke = false, expanded = false, stretch = false } = {},
) => {
    const uid = Attributes.uid(prefix);
    if (invoke) {
        //popovertarget needs a target that can be named
        popover.id = popover.id || uid;
        invoker.setAttribute('popovertarget', popover.id);
    }
    const anchor = `--${uid}`;
    invoker.style.anchorName = anchor;
    popover.style.positionAnchor = anchor;
    if (expanded) {
        invoker.setAttribute('aria-expanded', 'false');
        popover.addEventListener('toggle', (/** @type any */ evt) => {
            invoker.setAttribute('aria-expanded', evt.newState === 'open' ? 'true' : 'false');
        });
    }
    //the naming above is what the stylesheet reads, so it happens either way:
    //only the hand placement below is the fallback
    if (platformAnchors()) {
        return;
    }
    const anchored = { invoker, stretch };
    popover.addEventListener('beforetoggle', (/** @type any */ evt) => {
        //placed before the showing, refined once laid out: the platform's
        //centered or corner spot never paints
        if (evt.newState === 'open') {
            place(popover, anchored);
        }
    });
    popover.addEventListener('toggle', (/** @type any */ evt) => {
        if (evt.newState === 'open') {
            open.set(popover, anchored);
            place(popover, anchored);
        } else {
            open.delete(popover);
            unplace(popover);
        }
    });
    if (!reflowWired) {
        reflowWired = true;
        document.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);
    }
};

export { wireAnchoredPopover };
