import { registry } from './registry.mjs';

/**
 * Waits for elements queued on the page's `registry` to render. Unlike
 * `registry.ready()`, these reject when an awaited upgrade fails. An element
 * defined by another Registry is awaited through that registry instead.
 */
class Rendering {
    /**
     * Waits for the element and its descendants, the ones their own renders
     * enqueue included.
     * @param {Element} el
     * @returns {Promise<void>} rejecting with the first upgrade that failed
     */
    static waitFor(el) {
        return registry.settle((child) => el.contains(child));
    }
    /**
     * Waits for the element's descendants, the element itself excluded: what a
     * component awaits from inside its own render.
     * @param {Element} el
     * @returns {Promise<void>} rejecting with the first upgrade that failed
     */
    static waitForChildren(el) {
        return registry.settle((child) => el !== child && el.contains(child));
    }
}

export { Rendering };
