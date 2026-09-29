/**
 * One macrotask, through a MessageChannel rather than a zero-delay timer, which
 * the platform clamps to about 4ms once timers nest.
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

const wallClock = performance.now.bind(performance);

/**
 * Drains `turns` macrotasks, and keeps draining until `atLeastMs` of wall time
 * have passed. It reads the real clock, so it keeps working under `installClock`.
 * @param {number} [turns]
 * @param {number} [atLeastMs]
 */
const settle = async (turns = 20, atLeastMs = 8) => {
    const start = wallClock();
    for (let i = 0; i < turns || wallClock() - start < atLeastMs; ++i) {
        await tick();
    }
};

export { tick, settle };
