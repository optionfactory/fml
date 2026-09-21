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

/** a note is the popover that draws a callout, and the only one these offsets serve */
const isNote = (popover) => popover.matches('ful-note, .ful-note, [placement]');

/**
 * Reports where the invoker's centre falls inside the popover, which is what a
 * callout points at. The two are the same spot until the viewport pushes the
 * popover off its invoker, which the platform's own placement does as readily
 * as the hand placement below, so this is measured in both.
 */
const reportCallout = (popover, invoker) => {
    const box = invoker.getBoundingClientRect();
    const here = popover.getBoundingClientRect();
    //against the padding box, which is what a percentage inset resolves against
    popover.style.setProperty(
        '--ful-note-callout-inline',
        `${box.left + box.width / 2 - here.left - popover.clientLeft}px`,
    );
    popover.style.setProperty(
        '--ful-note-callout-block',
        `${box.top + box.height / 2 - here.top - popover.clientTop}px`,
    );
};

const place = (popover, anchored) => {
    const { invoker, stretch } = anchored;
    const box = invoker.getBoundingClientRect();
    const viewport = document.documentElement;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    //the css gap lives in the margins, and the computed style is live: the
    //inline zero a previous placing left behind is dropped first so the numbers
    //read below are the stylesheet's own, not this function's own zero. Reading
    //them afterwards left every popover flush against its invoker
    popover.style.removeProperty('margin');
    const computed = getComputedStyle(popover);
    const gap = {
        top: parseFloat(computed.marginTop) || 0,
        right: parseFloat(computed.marginRight) || 0,
        bottom: parseFloat(computed.marginBottom) || 0,
        left: parseFloat(computed.marginLeft) || 0,
    };
    popover.style.right = 'auto';
    popover.style.bottom = 'auto';
    popover.style.margin = '0';
    if (stretch) {
        const width = Math.min(box.width, vw - 2 * PAD);
        popover.style.width = `${width}px`;
        popover.style.left = `${clamp(box.left, PAD, vw - width - PAD)}px`;
        const height = popover.getBoundingClientRect().height;
        popover.style.top = `${clamp(box.bottom + gap.top, PAD, vh - height - PAD)}px`;
        return;
    }
    //a popover wraps against the spot it lands on: the width is measured
    //wide open, the left clamped so it still fits, the vertical placed
    //against the height that width renders
    const note = isNote(popover);
    const placement = note ? (popover.getAttribute('placement') ?? 'bottom') : 'bottom';
    popover.style.removeProperty('max-width');
    const cap = Math.min(parseFloat(computed.maxWidth) || vw, vw - 2 * PAD);
    popover.style.maxWidth = `${cap}px`;
    popover.style.left = `${PAD}px`;
    const wide = popover.getBoundingClientRect().width;
    let left =
        placement === 'right'
            ? box.right + gap.left
            : placement === 'left'
              ? box.left - gap.right - wide
              : note
                ? box.left + box.width / 2 - wide / 2
                : box.left;
    left = clamp(left, PAD, vw - wide - PAD);
    popover.style.left = `${left}px`;
    popover.style.maxWidth = `${Math.min(cap, vw - PAD - left)}px`;
    const height = popover.getBoundingClientRect().height;
    const top =
        placement === 'top'
            ? box.top - gap.bottom - height
            : placement === 'right' || placement === 'left'
              ? box.top + box.height / 2 - height / 2
              : box.bottom + gap.top;
    popover.style.top = `${clamp(top, PAD, vh - height - PAD)}px`;
    if (note) {
        reportCallout(popover, invoker);
    }
};

const unplace = (popover) => {
    for (const property of [
        'top',
        'left',
        'right',
        'bottom',
        'margin',
        'max-width',
        'width',
        '--ful-note-callout-inline',
        '--ful-note-callout-block',
    ]) {
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
 * CSS anchor positioning for a popover and the invoker it belongs to, with the
 * hand-placed fallback for the platforms that do not have it.
 */
class Anchors {
    /**
     * Anchors a popover to its invoker.
     *
     * The invoker is given an `anchor-name` and the popover a `position-anchor`
     * pointing at it, which is what a stylesheet needs to place the popover
     * itself: the library's own menus say `top: anchor(bottom); left:
     * anchor(left)`. **Writing that css is the caller's half of this.** Without
     * it the popover lands wherever the user agent puts a popover, which is not
     * beside the invoker.
     *
     * Where the platform has no anchor positioning the popover is placed here
     * instead, beside the invoker whenever it opens, clamped into the viewport,
     * following it on scroll and resize, and cleaned up on close. That placement
     * draws the geometry the css above describes, so the two agree.
     *
     * @param {HTMLElement} invoker the element the popover belongs to
     * @param {HTMLElement} popover the `[popover]` element to place
     * @param {object} [options]
     * @param {string} [options.prefix] prefixes the generated anchor name and id,
     *   so the dom says which component a name belongs to
     * @param {boolean} [options.invoke] points the invoker's `popovertarget` at
     *   the popover, giving toggle and light dismiss with no script of your own
     * @param {boolean} [options.expanded] keeps the invoker's `aria-expanded` in
     *   step with the popover
     * @param {boolean} [options.stretch] widens the popover to its invoker, which
     *   is what a combobox dropdown wants
     * @param {boolean} [options.handPlace] places here on every platform rather
     *   than only as a fallback, which a popover asks for when it needs to know
     *   where its invoker ended up: the tooltip's note points a callout at it, and
     *   a pseudo-element cannot read an anchor outside its own containing block.
     *   Such a popover declares no anchor placement in css, there being none to
     *   agree with
     */
    static wire(
        invoker,
        popover,
        { prefix = 'ful-anchor', invoke = false, expanded = false, stretch = false, handPlace = false } = {},
    ) {
        const uid = Attributes.uid(prefix);
        if (invoke) {
            //popovertarget needs a target that can be named
            popover.id = popover.id || uid;
            if (invoker.localName === 'button' || invoker.localName === 'input') {
                invoker.setAttribute('popovertarget', popover.id);
            } else {
                invoker.addEventListener('click', () => popover.togglePopover());
                invoker.addEventListener('keydown', (/** @type any */ evt) => {
                    if (evt.key !== 'Enter' && evt.key !== ' ') {
                        return;
                    }
                    evt.preventDefault();
                    popover.togglePopover();
                });
            }
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
        //only the hand placement below is the fallback, and only for a popover that
        //did not ask to be placed here whatever the platform offers
        if (!handPlace && platformAnchors()) {
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
    }
}

export { Anchors };
