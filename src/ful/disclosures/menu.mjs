import { ParsedElement } from '../../ftl/index.mjs';
import { Anchors } from './anchors.mjs';
import { wireMenuKeys } from './menu-keys.mjs';

/**
 * A menu of commands on the native popover platform. The menu is the popover
 * itself: light dismiss and Escape come from the browser.
 *
 * A menu naming an invoker by id through `for` belongs to that element: the
 * invoker toggles it, and it is anchored to the invoker through
 * `Anchors.wire`, placed in script where the platform has no css anchor
 * positioning. A menu without `for` is shared: one menu serves many
 * invokers, such as the "more" button of every row of a list, and a page
 * opens it beside the invoker it is for with `showFor(invoker)`.
 *
 * The items are the buttons and `a[href]` links written as its direct
 * children, kept as they are. Activation is the item's own click, which the
 * menu follows by hiding itself, so a page listens for the click where it
 * already listens. The menu fires no events of its own.
 *
 * The keyboard is the ARIA menu protocol: the focus moves to the
 * first item as the menu opens, the arrows, Home and End walk the items,
 * typing searches their text, Enter and Space activate the focused one, and
 * Escape and a close from inside the menu hand the focus back to the invoker
 * that opened it.
 */
class Menu extends ParsedElement {
    /** @type {string[]} */
    static attributes = ['for'];
    /** @type {HTMLElement|null} */
    #invoker = null;
    /** @type {HTMLElement|null} */
    #pressed = null;
    /**
     * Gives the menu the `menu` role and an empty `popover` attribute unless
     * it already has one, and marks the items. With `for`, read here once, it
     * also gives the invoker `aria-haspopup="menu"`, an `aria-expanded` kept
     * in step, and the toggle of the menu.
     * @returns {void}
     * @throws {Error} when `for` is given and names no element in the document at the render
     */
    render() {
        const named = this.declared('for');
        const invoker = named ? document.getElementById(named) : null;
        if (named && !invoker) {
            throw new Error(
                `ful-menu names no invoker: for="${named}" must name an element already in the page when the menu upgrades`,
            );
        }
        this.setAttribute('role', 'menu');
        if (!this.hasAttribute('popover')) {
            this.setAttribute('popover', '');
        }
        if (invoker) {
            this.#invoker = invoker;
            invoker.setAttribute('aria-haspopup', 'menu');
            Anchors.wire(invoker, this, { prefix: 'ful-menu', invoke: true, expanded: true });
        } else {
            this.#wireShared();
        }
        wireMenuKeys(() => this.#invoker, this, { items: () => this.items });
        this.#mark();
        this.addEventListener('click', (evt) => {
            const target = /** @type HTMLElement */ (evt.target);
            if (this.items.some((item) => item === target || item.contains(target))) {
                this.hidePopover();
            }
        });
    }
    /**
     * Opens a shared menu, one without `for`, beside `invoker`, or moves it
     * there when it is open for another one. The menu goes below the invoker,
     * or above it where there is no room below, and is placed once, as
     * `Anchors.show` places it. The invoker gets `aria-haspopup="menu"` and an
     * `aria-expanded` that reads true until the menu closes, and the focus
     * goes back to it on Escape. A call for the invoker whose press has just
     * closed the menu does nothing, so a second click on the same button
     * closes the menu rather than opening it again.
     * @param {HTMLElement} invoker the element the menu opens for
     * @returns {void}
     * @throws {Error} when the menu names its invoker through `for`
     */
    showFor(invoker) {
        if (this.declared('for')) {
            throw new Error('ful-menu: showFor serves a menu without for; a menu with for is opened by its invoker');
        }
        const pressed = this.#pressed;
        this.#pressed = null;
        if (pressed === invoker) {
            return;
        }
        if (this.#invoker && this.#invoker !== invoker) {
            this.#invoker.setAttribute('aria-expanded', 'false');
        }
        this.#invoker = invoker;
        invoker.setAttribute('aria-haspopup', 'menu');
        invoker.setAttribute('aria-expanded', 'true');
        //the previous placement wrote margin: 0 inline, hiding the stylesheet's gap
        this.style.margin = '';
        const gap = Number.parseFloat(getComputedStyle(this).marginBlockStart) || 0;
        const moving = this.matches(':popover-open');
        Anchors.show(this, invoker, { flip: true, gap });
        if (moving) {
            this.items[0]?.focus();
        }
    }
    /**
     * The commands, in the order the arrows walk them: the menu's direct
     * `button` and `a[href]` children, minus those carrying a `disabled` or
     * `hidden` attribute, which keep their role and leave the walk. Reading it
     * also marks any child added since the render, giving it the `menuitem`
     * role, unless it has a role already, and a `tabIndex` of -1.
     * @type {HTMLElement[]}
     */
    get items() {
        return this.#mark().filter((item) => !item.hasAttribute('disabled') && !item.hasAttribute('hidden'));
    }
    #wireShared() {
        document.addEventListener(
            'pointerdown',
            (evt) => {
                const target = /** @type Node */ (evt.target);
                this.#pressed = this.matches(':popover-open') && this.#invoker?.contains(target) ? this.#invoker : null;
            },
            true,
        );
        this.addEventListener('toggle', (/** @type any */ evt) => {
            if (evt.newState === 'closed') {
                this.#invoker?.setAttribute('aria-expanded', 'false');
            }
        });
    }
    /** @returns {HTMLElement[]} every item, disabled and hidden ones included, once marked */
    #mark() {
        const all = /** @type HTMLElement[] */ ([...this.querySelectorAll(':scope > button, :scope > a[href]')]);
        for (const item of all) {
            if (!item.hasAttribute('role')) {
                item.setAttribute('role', 'menuitem');
            }
            item.tabIndex = -1;
        }
        return all;
    }
}

export { Menu };
