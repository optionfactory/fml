import { registry } from './registry.mjs';

/**
 * Waits for the queued upgrades matching the filter, including the ones enqueued while
 * waiting: a component is only queued once its parent connects it, so a single pass
 * would miss everything nested.
 * @param {(el: Element) => boolean} accept
 */
const settle = async (accept) => {
    for (;;) {
        const pending = Array.from(registry.upgrades)
            .filter(([child]) => accept(child))
            .map(([, promise]) => promise);
        if (pending.length === 0) {
            return;
        }
        await Promise.all(pending);
    }
};

class Rendering {
    static async waitFor(el) {
        await settle((child) => el.contains(child));
    }
    static async waitForChildren(el) {
        await settle((child) => el !== child && el.contains(child));
    }
}

export { Rendering };
