import { registry } from './registry.mjs';

/**
 * Awaitable rendering barriers over the registry's upgrade queue. These are
 * the rejecting doors: a failed upgrade among the awaited components rejects
 * the wait, where registry.ready() only ever means the queue drained and
 * leaves a failed component to its own unhandled-rejection report.
 */
class Rendering {
    static waitFor(el) {
        return registry.settle((child) => el.contains(child));
    }
    static waitForChildren(el) {
        return registry.settle((child) => el !== child && el.contains(child));
    }
}

export { Rendering };
