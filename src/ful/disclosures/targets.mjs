/**
 * The dialog-target delegation, shared by the dialog and the drawer: any
 * element carrying dialog-target set to a dialog-bearing ful element's id
 * opens it, clones included. Wired once per document.
 */
let targetsWired = false;
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
