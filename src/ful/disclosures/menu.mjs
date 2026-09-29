import { ParsedElement } from '../../ftl/index.mjs';
import { Anchors } from './anchors.mjs';
import { wireMenuKeys } from './menu-keys.mjs';

/**
 * A menu of commands on the native popover platform, opened by the element
 * whose id `for` names. The menu is the popover itself: light dismiss and
 * Escape come from the browser, and it is anchored to its invoker through
 * `Anchors.wire`, placed in script where the platform has no css anchor
 * positioning.
 *
 * The items are the buttons and `a[href]` links written as its direct
 * children, kept as they are. Activation is the item's own click, which the
 * menu follows by hiding itself, so a page listens for the click where it
 * already listens. The menu fires no events of its own.
 *
 * The keyboard is the ARIA menu protocol: the focus moves to the
 * first item as the menu opens, the arrows, Home and End walk the items,
 * typing searches their text, Enter and Space activate the focused one, and
 * Escape and a close from inside the menu hand the focus back to the invoker.
 */
class Menu extends ParsedElement {
    /** @type {string[]} */
    static attributes = ['for'];
    /**
     * Gives the menu the `menu` role and an empty `popover` attribute unless
     * it already has one, gives the invoker `aria-haspopup="menu"`, an
     * `aria-expanded` kept in step, and the toggle of the menu, and marks the
     * items. `for` is read here, once.
     * @returns {void}
     * @throws {Error} when `for` names no element in the document at the render
     */
    render() {
        const named = this.declared('for');
        const invoker = named ? document.getElementById(named) : null;
        if (!invoker) {
            throw new Error(
                `ful-menu names no invoker: for="${named ?? ''}" must name an element already in the page when the menu upgrades`,
            );
        }
        this.setAttribute('role', 'menu');
        if (!this.hasAttribute('popover')) {
            this.setAttribute('popover', '');
        }
        invoker.setAttribute('aria-haspopup', 'menu');
        Anchors.wire(invoker, this, { prefix: 'ful-menu', invoke: true, expanded: true });
        wireMenuKeys(invoker, this, { items: () => this.items });
        this.#mark();
        this.addEventListener('click', (evt) => {
            const target = /** @type HTMLElement */ (evt.target);
            if (this.items.some((item) => item === target || item.contains(target))) {
                this.hidePopover();
            }
        });
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
