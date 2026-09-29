/**
 * A manual clock standing in for `setTimeout`, `clearTimeout` and
 * `performance.now` from the moment it is installed until it is uninstalled.
 * Time moves only when the test says so: `advance` fires the timers that fall
 * due, in order, letting each one's microtasks run before the next; `skip` moves
 * time without firing anything, as a main thread too busy to run its timers
 * would.
 * @returns {{ advance(ms: number): Promise<void>, skip(ms: number): void, uninstall(): void }}
 */
const installClock = () => {
    const real = {
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
        now: performance.now,
    };
    let now = real.now.call(performance);
    let seq = 0;
    const timers = new Map();
    globalThis.setTimeout = (fn, ms = 0, ...args) => {
        const id = ++seq;
        timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn, args });
        return id;
    };
    globalThis.clearTimeout = (id) => {
        timers.delete(id);
    };
    performance.now = () => now;
    return {
        async advance(ms) {
            const end = now + ms;
            for (;;) {
                const due = [...timers.entries()]
                    .filter(([, t]) => t.at <= end)
                    .sort(([ia, a], [ib, b]) => a.at - b.at || ia - ib)[0];
                if (!due) {
                    break;
                }
                const [id, timer] = due;
                timers.delete(id);
                now = timer.at;
                timer.fn(...timer.args);
                await Promise.resolve();
            }
            now = end;
        },
        skip(ms) {
            now += ms;
        },
        uninstall() {
            globalThis.setTimeout = real.setTimeout;
            globalThis.clearTimeout = real.clearTimeout;
            performance.now = real.now;
        },
    };
};

/**
 * Installs a fresh `installClock` before each test of the enclosing suite and
 * uninstalls it after.
 * @returns {{ advance(ms: number): Promise<void>, skip(ms: number): void }}
 */
const useClock = () => {
    let clock;
    beforeEach(() => {
        clock = installClock();
    });
    afterEach(() => {
        clock.uninstall();
    });
    return {
        advance: (ms) => clock.advance(ms),
        skip: (ms) => clock.skip(ms),
    };
};

export { installClock, useClock };
