/**
 * Intercepts the window 'error' listener registration happening at import
 * time, so the handler can later be invoked directly with plain event shapes.
 *
 * The runner reports every dispatched window error event to the driver's
 * protocol (Playwright Log.entryAdded), failing the session: no in-page stub
 * can prevent that, so the handler is called instead of dispatching at it.
 */
const original = window.addEventListener;
let captured = null;
window.addEventListener = (type, listener, options) => {
    if (type === 'error' && captured === null) {
        captured = listener;
    }
    return original.call(window, type, listener, options);
};

/** @returns {Function} the first listener registered for window 'error' */
const capture = () => {
    window.addEventListener = original;
    return captured;
};

export { capture };
