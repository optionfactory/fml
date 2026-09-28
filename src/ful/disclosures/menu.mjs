import { ParsedElement } from '../../ftl/index.mjs';
import { Anchors } from './anchors.mjs';
import { wireMenuKeys } from './menu-keys.mjs';

/**
 * A menu of commands on the native popover platform: the invoker named by
 * `for` toggles it and light dismiss and Escape come from the browser, while
 * the element adds the menu semantics and the keyboard protocol.
 *
 * The items are the buttons and links written inside it, kept as they are and
 * given their menu role and their place in the roving focus. Activation is the
 * item's own click, which the element only follows by closing.
 */
class Menu extends ParsedElement {
    static attributes = ['for'];
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
     * The commands, in the order the arrows walk them: the menu's own buttons
     * and links, minus the disabled and hidden ones, which keep their role and
     * leave the walk.
     */
    get items() {
        return this.#mark().filter((item) => !item.hasAttribute('disabled') && !item.hasAttribute('hidden'));
    }
    /**
     * Gives every button and link of the menu its item role and takes it out of
     * the tab order, and answers them. Read on every gesture as well as at the
     * render, so a menu a page fills or empties later needs no rewiring.
     */
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
