import { Attributes } from '../../ftl/index.mjs';
import { wireAnchoredPopover } from '../disclosures/anchors.mjs';

/**
 * An invoker button paired with the `ul[popover][role=menu]` that follows it:
 * the chrome behind every filter's operator, sensitivity and boolean value.
 *
 * It fills the menu from a vocabulary, wires it the first time more than one
 * choice survives the whitelist, pins the button to a static glyph when a
 * single one does, owns the roving focus and the Escape/Enter handling, and
 * keeps the button's value, glyph and aria-label in step. A pick that changes
 * the value calls back; the host decides what that means.
 *
 * The button's `value` attribute is the store, as it is for a native control:
 * the menu protocol finds the current item by it, and nothing mirrors it.
 */
class ChoiceButton {
    /** The declared choices narrowed to a vocabulary; an empty or unknown set means all of it. */
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
     * @param {HTMLElement} button the invoker, whose next sibling is its menu
     * @param {{vocabulary: string[], glyphs?: Record<string,string>, labelFor?: (v: string) => string,
     *          display?: ((v: string) => string)|null, interactive?: () => boolean, onPick?: (v: string) => void}} conf
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
        //the button shows the compact glyph by default; a menu whose choices have
        //no glyph shows the word instead
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
    /** The choices the host declared, narrowed to the vocabulary; an empty or unknown set means all of it. */
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
    /** A single surviving choice pins the button: a static glyph, no popup, and every read answers it. */
    get pinned() {
        return this.#allowed.length < 2;
    }
    get value() {
        return this.#button.getAttribute('value');
    }
    set value(choice) {
        this.#button.setAttribute('value', choice);
        //the button carries the compact glyph, announced through its label: the
        //menu is where the localized words live
        this.#button.textContent = this.#display(choice);
        Attributes.set(this.#button, 'aria-label', this.#labelFor(choice));
    }
    /** The host's disabled claim, composed with the pin: lifting one cannot lift the other. */
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
                a.setAttribute('role', 'menuitem');
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
    }
    #sync() {
        const pinned = this.pinned;
        this.#button.toggleAttribute('disabled', pinned || this.#claimed);
        Attributes.set(this.#button, 'aria-haspopup', pinned ? null : 'true');
        Attributes.set(this.#button, 'aria-expanded', pinned ? null : 'false');
        if (pinned) {
            this.#button.removeAttribute('popovertarget');
        } else if (this.#menu.id) {
            //the menu is wired once, its link is what a pin may break: lifting the
            //pin re-links the invoker to the menu it already owns
            this.#button.setAttribute('popovertarget', this.#menu.id);
        }
    }
    #items() {
        return Array.from(this.#menu.querySelectorAll('li > a'), (a) => /** @type HTMLAnchorElement */ (a));
    }
    #wire() {
        const button = this.#button;
        const menu = this.#menu;
        wireAnchoredPopover(button, menu, { prefix: 'ful-filter-menu', invoke: true, expanded: true });
        menu.addEventListener('toggle', (/** @type any */ evt) => {
            if (evt.newState !== 'open') {
                //give the invoker back the focus the menu had borrowed, without
                //stealing it from wherever else the close came from
                if (menu.contains(document.activeElement)) {
                    button.focus();
                }
                return;
            }
            const items = this.#items();
            (items.find((a) => a.getAttribute('value') === this.value) ?? items[0])?.focus();
        });
        menu.addEventListener('keydown', (evt) => {
            const target = /** @type HTMLElement */ (evt.target);
            const item = /** @type HTMLAnchorElement | null */ (target.closest('li > a'));
            if (!item) {
                return;
            }
            const items = this.#items();
            const at = items.indexOf(item);
            switch (evt.code) {
                case 'ArrowDown': {
                    evt.preventDefault();
                    items[(at + 1) % items.length]?.focus();
                    break;
                }
                case 'ArrowUp': {
                    evt.preventDefault();
                    items[(at - 1 + items.length) % items.length]?.focus();
                    break;
                }
                case 'Home': {
                    evt.preventDefault();
                    items[0]?.focus();
                    break;
                }
                case 'End': {
                    evt.preventDefault();
                    items[items.length - 1]?.focus();
                    break;
                }
                case 'Enter':
                case 'Space': {
                    evt.preventDefault();
                    item.click();
                    button.focus();
                    break;
                }
                case 'Escape': {
                    //the platform's close request hides the menu, the focus is placed
                    //on the invoker before the focused item is detached from it
                    button.focus();
                    break;
                }
            }
        });
    }
}

export { ChoiceButton };
