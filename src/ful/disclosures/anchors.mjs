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

/** a popover that reads `placement` and gets the callout offsets */
const isNote = (popover) => popover.matches('ful-note, .ful-note, [placement]');

/**
 * Writes the invoker's centre, measured from the popover's padding box, as
 * `--ful-note-callout-inline` and `--ful-note-callout-block` on the popover.
 */
const reportCallout = (popover, invoker) => {
    const box = invoker.getBoundingClientRect();
    const here = popover.getBoundingClientRect();
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
        popover.style.removeProperty('width');
        popover.style.removeProperty('min-width');
        popover.style.removeProperty('max-width');
        const cap = Math.min(parseFloat(computed.maxWidth) || vw, vw - 2 * PAD);
        popover.style.minWidth = `${Math.min(box.width, vw - 2 * PAD)}px`;
        popover.style.maxWidth = `${cap}px`;
        const width = popover.getBoundingClientRect().width;
        popover.style.left = `${clamp(box.left, PAD, vw - width - PAD)}px`;
        const height = popover.getBoundingClientRect().height;
        const below = box.bottom + gap.top;
        const top = below + height <= vh - PAD ? below : box.top - gap.bottom - height;
        popover.style.top = `${clamp(top, PAD, vh - height - PAD)}px`;
        return;
    }
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
        'min-width',
        'width',
        'visibility',
        '--ful-note-callout-inline',
        '--ful-note-callout-block',
    ]) {
        popover.style.removeProperty(property);
    }
};

const showOncePlaced = (popover, anchored) => {
    popover.style.visibility = 'hidden';
    queueMicrotask(() => {
        if (popover.matches(':popover-open')) {
            place(popover, anchored);
        }
        popover.style.removeProperty('visibility');
    });
};

const reflow = () => {
    frame = 0;
    for (const [popover, anchored] of open) {
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
 * Places a popover beside the element or the rectangle it belongs to.
 *
 * `wire` pairs a popover with one invoker for its lifetime and relies on css
 * anchor positioning, placing the popover in script only where the platform
 * lacks it or the caller asks for it. `show` places a popover once, beside
 * whatever anchor the call hands over.
 */
class Anchors {
    /**
     * Anchors a popover to its invoker for the popover's lifetime.
     *
     * On every platform the invoker is given an inline `anchor-name` and the
     * popover a `position-anchor` naming it, `--` followed by a unique id
     * built from `prefix`. That is what a stylesheet needs to place the popover
     * itself: the library's own menus say `top: anchor(bottom); left:
     * anchor(left)`. **Writing that css is the caller's half of this.** Without
     * it the popover lands wherever the user agent puts a popover, which is not
     * beside the invoker.
     *
     * Where the platform has no css anchor positioning, or under `handPlace`,
     * the popover is placed in script instead: beside the invoker whenever it
     * opens, clamped 8px inside the viewport, placed again on every scroll and
     * resize while open, and its inline placement removed on close. The gap to
     * the invoker is read from the popover's css margins. From `beforetoggle`
     * to the placing, in a microtask before the `toggle` event, the popover
     * carries an inline `visibility: hidden`, so a stylesheet setting
     * `visibility` on it competes with that. A popover removed from the
     * document while open, or whose invoker was removed, stops being placed.
     *
     * The script placement puts a plain popover below the invoker,
     * start-aligned. A popover matching `ful-note`, `.ful-note` or
     * `[placement]` reads its `placement` attribute instead: `top`, `right`,
     * `left`, or `bottom` by default, centred on the invoker along the other
     * axis. Such a popover is also given `--ful-note-callout-inline` and
     * `--ful-note-callout-block`: the invoker's centre, in pixels, measured
     * from the popover's padding box, which stays on the invoker when the
     * viewport pushes the popover off it.
     *
     * Wiring the same pair twice adds its listeners twice.
     *
     * @param {HTMLElement} invoker the element the popover belongs to
     * @param {HTMLElement} popover the `[popover]` element to place
     * @param {object} [options]
     * @param {string} [options.prefix] prefixes the generated anchor name and
     *   id, `ful-anchor` by default, so the dom says which component a name
     *   belongs to
     * @param {boolean} [options.invoke] makes the invoker toggle the popover,
     *   which light dismiss then closes with no script of your own. The popover
     *   is given the generated id when it has none. A `button` or `input`
     *   invoker gets a `popovertarget` naming it; any other element toggles it
     *   on click and on the Enter and Space keys
     * @param {boolean} [options.expanded] sets the invoker's `aria-expanded` to
     *   `false` at once and keeps it in step with the popover's `toggle` events
     * @param {boolean} [options.stretch] in the script placement, sizes the
     *   popover to at least its invoker's width, capped by its own `max-width`
     *   and the viewport, and flips it above the invoker where the viewport
     *   leaves no room below, which is what a combobox dropdown wants. The
     *   `placement` attribute is not read
     * @param {boolean} [options.handPlace] places in script on every platform
     *   rather than only as a fallback, for a popover that needs to know where
     *   its invoker ended up, such as a note pointing a callout at it. Such a
     *   popover declares no anchor placement in css
     */
    static wire(
        invoker,
        popover,
        { prefix = 'ful-anchor', invoke = false, expanded = false, stretch = false, handPlace = false } = {},
    ) {
        const uid = Attributes.uid(prefix);
        if (invoke) {
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
        if (!handPlace && platformAnchors()) {
            return;
        }
        const anchored = { invoker, stretch };
        popover.addEventListener('beforetoggle', (/** @type any */ evt) => {
            if (evt.newState === 'open') {
                showOncePlaced(popover, anchored);
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
    /**
     * Shows a popover and places it beside an anchor, once. It serves a
     * popover shared by many invokers, each open handing over its own anchor,
     * and an anchor that is a rectangle rather than an element, such as one
     * read out of an iframe. Nothing is paired and nothing follows a later
     * scroll or resize; closing is the caller's, or the platform's for a
     * light-dismissing popover.
     *
     * The popover goes below the anchor, start-aligned, clamped 8px inside the
     * viewport. `flip` moves it above the anchor where there is no room below
     * and there is room above. The placement is written as inline `top`, `left`,
     * `right`, `bottom` and `margin`, which stay after the popover closes and
     * are overwritten by the next call.
     *
     * A popover not already open is shown with `showPopover()` and placed
     * before the call returns, so the first position anybody sees is the right
     * one and the caller can move the focus into it on the next line. One
     * already open is placed without being shown again.
     *
     * @param {HTMLElement} popover the `[popover]` element to show, or an
     *   already-shown element to place
     * @param {Element|DOMRect} anchor the element, or the rectangle in
     *   viewport coordinates, to place beside
     * @param {object} [options]
     * @param {boolean} [options.flip] place above the anchor where no room is
     *   left below, `false` by default
     * @param {number} [options.gap] the distance from the anchor, in pixels,
     *   `0` by default
     * @returns {HTMLElement} the popover
     */
    static show(popover, anchor, { flip = false, gap = 0 } = {}) {
        const placeShown = () => {
            const box = anchor instanceof Element ? anchor.getBoundingClientRect() : anchor;
            const viewport = document.documentElement;
            const here = popover.getBoundingClientRect();
            const below = box.bottom + gap;
            const above = box.top - gap - here.height;
            const top = flip && below + here.height > viewport.clientHeight - PAD && above >= PAD ? above : below;
            popover.style.right = 'auto';
            popover.style.bottom = 'auto';
            popover.style.margin = '0';
            popover.style.left = `${clamp(box.left, PAD, Math.max(PAD, viewport.clientWidth - here.width - PAD))}px`;
            popover.style.top = `${clamp(top, PAD, Math.max(PAD, viewport.clientHeight - here.height - PAD))}px`;
        };
        if (typeof popover.showPopover === 'function' && !popover.matches(':popover-open')) {
            popover.showPopover();
        }
        placeShown();
        return popover;
    }
}

export { Anchors };
