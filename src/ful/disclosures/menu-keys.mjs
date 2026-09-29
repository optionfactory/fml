/** how long, in milliseconds, a type-ahead search waits for its next character */
const TYPEAHEAD_WINDOW = 500;

/**
 * Wires the keyboard protocol of a menu popover onto it.
 *
 * - As the menu opens, the focus moves to the item `current` answers, or to
 *   the first item when it answers none.
 * - As the menu closes, the focus moves back to the invoker, but only when it
 *   was inside the menu, so a close caused by a click elsewhere leaves it
 *   where it went.
 * - ArrowDown and ArrowUp move the focus to the next and previous item,
 *   wrapping at both ends; Home and End move it to the first and last.
 * - Enter, the numpad Enter and Space call `click()` on the focused item and
 *   move the focus to the invoker. Closing the menu is left to the item's
 *   click handling.
 * - Escape moves the focus to the invoker and leaves the close to the
 *   platform.
 * - A printable character typed without Ctrl, Alt or Meta searches the
 *   items' trimmed text, ignoring case, wrapping past the last item.
 *   Characters typed within 500ms of each other add to one search. A search
 *   of one character, or of one character repeated, moves the focus to the
 *   next item after the focused one starting with it, so repeating a letter
 *   cycles through those items; a longer search moves it to the first item,
 *   from the focused one on, starting with the whole search. A search that
 *   matches nothing leaves the focus where it is.
 *
 * The keys are read by `KeyboardEvent.code`, the typed characters by
 * `KeyboardEvent.key`. A handled key has its default prevented, except
 * Escape and a search that matched nothing. A key whose target is not inside
 * an item is ignored.
 *
 * `items` answers the items in the order they are walked, and is called on
 * every gesture, so a menu that fills itself later needs no rewiring.
 *
 * @param {HTMLElement} invoker the element the menu belongs to, and where the focus goes back
 * @param {HTMLElement} menu the `[popover]` holding the items
 * @param {{items: () => HTMLElement[], current?: () => HTMLElement|null|undefined}} conf
 *   `items` answers the items; `current` answers the item an opening focuses
 */
const wireMenuKeys = (invoker, menu, { items, current = () => null }) => {
    let typed = '';
    let typedAt = 0;
    menu.addEventListener('beforetoggle', (/** @type any */ evt) => {
        if (evt.newState === 'closed' && menu.contains(document.activeElement)) {
            invoker.focus();
        }
    });
    menu.addEventListener('toggle', (/** @type any */ evt) => {
        if (evt.newState !== 'open') {
            return;
        }
        const all = items();
        (current() ?? all[0])?.focus();
    });
    menu.addEventListener('keydown', (evt) => {
        const target = /** @type HTMLElement */ (evt.target);
        const all = items();
        const item = all.find((candidate) => candidate === target || candidate.contains(target));
        if (!item) {
            return;
        }
        const at = all.indexOf(item);
        switch (evt.code) {
            case 'ArrowDown': {
                evt.preventDefault();
                all[(at + 1) % all.length]?.focus();
                return;
            }
            case 'ArrowUp': {
                evt.preventDefault();
                all[(at - 1 + all.length) % all.length]?.focus();
                return;
            }
            case 'Home': {
                evt.preventDefault();
                all[0]?.focus();
                return;
            }
            case 'End': {
                evt.preventDefault();
                all[all.length - 1]?.focus();
                return;
            }
            case 'Enter':
            case 'NumpadEnter':
            case 'Space': {
                evt.preventDefault();
                item.click();
                invoker.focus();
                return;
            }
            case 'Escape': {
                invoker.focus();
                return;
            }
        }
        if (evt.key.length !== 1 || evt.ctrlKey || evt.altKey || evt.metaKey) {
            return;
        }
        const now = Date.now();
        typed = now - typedAt > TYPEAHEAD_WINDOW ? evt.key : typed + evt.key;
        typedAt = now;
        const wanted = typed.toLowerCase();
        const repeated = [...wanted].every((character) => character === wanted[0]);
        const search = repeated ? wanted[0] : wanted;
        const from = repeated ? at + 1 : at;
        const found = [...all.slice(from), ...all.slice(0, from)].find((candidate) =>
            (candidate.textContent ?? '').trim().toLowerCase().startsWith(search),
        );
        if (found) {
            evt.preventDefault();
            found.focus();
        }
    });
};

export { wireMenuKeys };
