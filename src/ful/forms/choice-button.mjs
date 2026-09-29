import { Attributes } from '../../ftl/index.mjs';
import { Anchors } from '../disclosures/anchors.mjs';
import { wireMenuKeys } from '../disclosures/menu-keys.mjs';

/**
 * An invoker button paired with the `ul[popover][role=menu]` that follows it:
 * the chrome behind every filter's operator, sensitivity and boolean value.
 *
 * It fills the menu from a vocabulary, wires it the first time more than one
 * choice survives the whitelist, pins the button to a static glyph when a
 * single one does, takes the shared menu keyboard protocol, and keeps the
 * button's value, glyph and aria-label in step. A pick that changes the value
 * calls back; the host decides what that means.
 *
 * The button's `value` attribute is the store, as it is for a native control:
 * the menu protocol finds the current item by it, and nothing mirrors it.
 */
class ChoiceButton {
    /**
     * The declared choices narrowed to a vocabulary, in the declared order.
     * When none of them is in the vocabulary, or none is declared, the answer
     * is a copy of the whole vocabulary.
     * @param {string[] | null | undefined} declared
     * @param {string[]} vocabulary
     * @returns {string[]}
     */
    static narrow(declared, vocabulary) {
        const narrowed = (declared ?? []).filter((choice) => vocabulary.includes(choice));
        return narrowed.length > 0 ? narrowed : [...vocabulary];
    }
    #button;
    #menu;
    #vocabulary;
    #glyphs;
    #labelFor;
    #display;
    #interactive;
    #onPick;
    #allowed;
    #claimed = false;
    #wired = false;
    /**
     * Takes the button's next sibling as its menu and listens for picks on it.
     * The menu is neither filled nor wired until `allowed` is first written.
     *
     * A click on an item, while `interactive()` answers true, sets the value,
     * hides the menu and, when the value changed, calls `onPick`.
     * @param {HTMLElement} button the invoker, whose next sibling is its menu
     * @param {{vocabulary: string[], glyphs?: Record<string,string>, labelFor?: (v: string) => string,
     *          display?: ((v: string) => string)|null, interactive?: () => boolean, onPick?: (v: string) => void}} conf
     *        `vocabulary` lists every choice; `glyphs` maps a choice to its compact
     *        glyph; `labelFor` answers the localized word, used as the button's
     *        `aria-label` and beside the glyph in the menu (the choice itself by
     *        default); `display` answers the button's text (by default the glyph,
     *        or the choice where it has none); `interactive` is asked before a
     *        pick is taken; `onPick` receives a pick that changed the value
     */
    constructor(
        button,
        { vocabulary, glyphs = {}, labelFor = (v) => v, display = null, interactive = () => true, onPick = () => {} },
    ) {
        this.#button = button;
        this.#menu = /** @type HTMLElement */ (button.nextElementSibling);
        this.#vocabulary = vocabulary;
        this.#glyphs = glyphs;
        this.#labelFor = labelFor;
        this.#display = display ?? ((choice) => glyphs[choice] ?? choice);
        this.#interactive = interactive;
        this.#onPick = onPick;
        this.#allowed = [...vocabulary];
        this.#menu.addEventListener('click', (evt) => {
            const target = /** @type HTMLElement */ (evt.target);
            const item = /** @type HTMLElement | null */ (target.closest('li > a'));
            if (!item || !this.#interactive()) {
                return;
            }
            const picked = /** @type string */ (item.getAttribute('value'));
            const previous = this.value;
            this.value = picked;
            /** @type any */ (this.#menu).hidePopover?.();
            if (previous !== picked) {
                this.#onPick(picked);
            }
        });
    }
    /**
     * The choices the menu offers. Writing it narrows the declared set with
     * `narrow`, refills the menu, wires the popover and the menu keyboard the
     * first time more than one choice is allowed, and updates the button's
     * disabled state and popup attributes. When one choice is left the button
     * is pinned and the value is set to it.
     * @type {string[]}
     */
    get allowed() {
        return this.#allowed;
    }
    set allowed(declared) {
        this.#allowed = ChoiceButton.narrow(declared, this.#vocabulary);
        this.#fill();
        if (!this.#wired && this.#allowed.length > 1) {
            this.#wire();
            this.#wired = true;
        }
        this.#sync();
        if (this.pinned) {
            this.value = this.#allowed[0];
        }
    }
    /**
     * Whether fewer than two choices are allowed. A pinned button is disabled,
     * opens no menu and shows the single choice as its value.
     * @returns {boolean}
     */
    get pinned() {
        return this.#allowed.length < 2;
    }
    /**
     * The host's fixed claim: hides the button with the `hidden` attribute
     * while `value` keeps answering.
     * @param {boolean} fixed
     */
    set fixed(fixed) {
        this.#button.toggleAttribute('hidden', !!fixed);
    }
    /**
     * The current choice, stored as the button's `value` attribute, where the
     * menu keyboard also finds it. Writing it sets the button's text from
     * `display`, its `aria-label` from `labelFor`, and `aria-checked` on the
     * menu item carrying it. It does not call `onPick`.
     * @type {string | null}
     */
    get value() {
        return this.#button.getAttribute('value');
    }
    set value(choice) {
        this.#button.setAttribute('value', /** @type {string} */ (choice));
        this.#button.textContent = this.#display(choice);
        Attributes.set(this.#button, 'aria-label', this.#labelFor(choice));
        this.#mark();
    }
    #mark() {
        const current = this.value;
        for (const item of this.#items()) {
            item.setAttribute('aria-checked', String(item.getAttribute('value') === current));
        }
    }
    /**
     * The host's disabled claim. The button is disabled while either the claim
     * or the pin holds, so lifting one does not enable it while the other holds.
     * @param {boolean} claimed
     */
    set claimed(claimed) {
        this.#claimed = claimed;
        this.#sync();
    }
    #fill() {
        this.#menu.replaceChildren(
            ...this.#allowed.map((choice) => {
                const li = document.createElement('li');
                li.setAttribute('role', 'none');
                const a = document.createElement('a');
                a.setAttribute('role', 'menuitemradio');
                a.setAttribute('tabindex', '-1');
                a.setAttribute('value', choice);
                const word = this.#labelFor(choice);
                const glyph = this.#glyphs[choice] ?? choice;
                if (word === choice && glyph === choice) {
                    a.innerText = choice;
                } else {
                    const glyphSpan = document.createElement('span');
                    glyphSpan.innerText = glyph;
                    const wordSpan = document.createElement('span');
                    wordSpan.innerText = word;
                    a.append(glyphSpan, wordSpan);
                }
                li.append(a);
                return li;
            }),
        );
        this.#mark();
    }
    #sync() {
        const pinned = this.pinned;
        this.#button.toggleAttribute('disabled', pinned || this.#claimed);
        Attributes.set(this.#button, 'aria-haspopup', pinned ? null : 'true');
        Attributes.set(this.#button, 'aria-expanded', pinned ? null : 'false');
        if (pinned) {
            this.#button.removeAttribute('popovertarget');
        } else if (this.#menu.id) {
            this.#button.setAttribute('popovertarget', this.#menu.id);
        }
    }
    #items() {
        return Array.from(this.#menu.querySelectorAll('li > a'), (a) => /** @type HTMLAnchorElement */ (a));
    }
    #wire() {
        Anchors.wire(this.#button, this.#menu, { prefix: 'ful-filter-menu', invoke: true, expanded: true });
        wireMenuKeys(this.#button, this.#menu, {
            items: () => this.#items(),
            current: () => this.#items().find((a) => a.getAttribute('value') === this.value),
        });
    }
}

export { ChoiceButton };
