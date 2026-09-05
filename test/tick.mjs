/**
 * An unclamped macrotask, for draining async work in tests.
 *
 * The usual `for (…) await new Promise(r => setTimeout(r, 0))` settle loops are
 * clamped by the platform to ~4ms per nested zero-delay timer, so a twenty turn
 * drain bills ~80ms of wall time for what should cost a millisecond: across a
 * suite that mounts a component per test, the clamping alone becomes the
 * dominant cost. A MessageChannel delivers the same macrotask semantics
 * (event loop turn, timers and queued tasks advance) without the clamp.
 */
const tick = () =>
    new Promise((resolve) => {
        const { port1, port2 } = new MessageChannel();
        port1.onmessage = () => {
            resolve();
            port1.close();
        };
        port2.postMessage(0);
    });

/**
 * Drains `turns` macrotasks, never finishing before `atLeastMs` of wall time:
 * a stub resolving on its own zero-delay timer still lands inside the drain.
 */
const settle = async (turns = 20, atLeastMs = 8) => {
    const start = performance.now();
    for (let i = 0; i < turns || performance.now() - start < atLeastMs; ++i) {
        await tick();
    }
};

export { tick, settle };
