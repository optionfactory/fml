let targetsWired = false;
/**
 * Makes any element carrying `dialog-target` open the element whose id it
 * names, clones included, which is how the dialog and the drawer are opened
 * from markup. One click listener on the document finds the nearest
 * `[dialog-target]` around the click target and calls `open()` on the named
 * element when it has one; an id naming nothing is ignored. Calls after the
 * first do nothing.
 */
const wireTargets = () => {
    if (targetsWired) {
        return;
    }
    targetsWired = true;
    document.addEventListener('click', (/** @type any */ e) => {
        const trigger = e.target.closest?.('[dialog-target]');
        if (!trigger) {
            return;
        }
        /** @type {any} */ (document.getElementById(trigger.getAttribute('dialog-target')))?.open?.();
    });
};

export { wireTargets };
