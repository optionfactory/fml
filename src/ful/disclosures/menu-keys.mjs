/** how long a type-ahead buffer stands before the next character starts a new search */
const TYPEAHEAD_WINDOW = 500;

/**
 * The keyboard protocol of a menu popover: the focus moving into the menu as it
 * opens and back to the invoker as it closes, roving focus over the items with
 * the arrows, Home and End, type-ahead over their text, and Enter and Space
 * activating the focused one.
 *
 * The menu owns what an item is: `items` answers them in the order they are
 * walked, read on every gesture so a menu that fills itself later needs no
 * rewiring, and `current` names the one an opening focuses, the first otherwise.
 *
 * @param {HTMLElement} invoker the element the menu belongs to, and where the focus goes back
 * @param {HTMLElement} menu the `[popover]` holding the items
 * @param {{items: () => HTMLElement[], current?: () => HTMLElement|null|undefined}} conf
 */
const wireMenuKeys = (invoker, menu, { items, current = () => null }) => {
    let typed = '';
    let typedAt = 0;
    menu.addEventListener('beforetoggle', (/** @type any */ evt) => {
        //give the invoker back the focus the menu had borrowed, without
        //stealing it from wherever else the close came from
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
                //the platform's close request hides the menu, the focus is placed
                //on the invoker before the focused item is detached from it
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
