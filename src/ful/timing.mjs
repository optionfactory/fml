class Timing {
    static sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    static DEBOUNCE_DEFAULT = 0;
    static DEBOUNCE_IMMEDIATE = 1;
    /**
     * Executes only after a period of inactivity (pause in events).
     * Respond to the "end" of a series of events.
     * @param {*} timeoutMs
     * @param {*} func
     * @param {*} [options]
     * @returns {[function, function]}
     */
    static debounce(timeoutMs, func, options) {
        const opts = options ?? Timing.DEBOUNCE_DEFAULT;
        let tid = null;
        let args = [];
        let previousTimestamp = 0;

        const later = () => {
            const elapsed = performance.now() - previousTimestamp;
            if (timeoutMs > elapsed) {
                tid = setTimeout(later, timeoutMs - elapsed);
                return;
            }
            tid = null;
            if (opts !== Timing.DEBOUNCE_IMMEDIATE) {
                func(...args);
            }
            // This check is needed because `func` can recursively invoke `debounced`.
            if (tid === null) {
                args = [];
            }
        };

        const debounced = function () {
            args = [...arguments];
            previousTimestamp = performance.now();
            if (tid === null) {
                tid = setTimeout(later, timeoutMs);
                if (opts === Timing.DEBOUNCE_IMMEDIATE) {
                    func(...args);
                }
            }
        };
        const abort = () => clearTimeout(tid);
        return [debounced, abort];
    }
    static THROTTLE_DEFAULT = 0;
    static THROTTLE_NO_LEADING = 1;
    static THROTTLE_NO_TRAILING = 2;
    /**
     * Executes at most once per specified time interval, regardless of ongoing events.
     * @param {*} timeoutMs
     * @param {*} func
     * @param {*} [options]
     * @returns {[function, function]}
     */
    static throttle(timeoutMs, func, options) {
        const opts = options ?? Timing.THROTTLE_DEFAULT;
        let tid = null;
        let args = [];
        let previousTimestamp = 0;

        const later = () => {
            previousTimestamp = opts & Timing.THROTTLE_NO_LEADING ? 0 : performance.now();
            tid = null;
            func(...args);
            if (tid === null) {
                args = [];
            }
        };
        const throttled = function () {
            const now = performance.now();
            if (!previousTimestamp && opts & Timing.THROTTLE_NO_LEADING) {
                previousTimestamp = now;
            }
            const remaining = previousTimestamp === 0 ? 0 : timeoutMs - (now - previousTimestamp);
            args = [...arguments];
            if (remaining <= 0 || remaining > timeoutMs) {
                if (tid !== null) {
                    clearTimeout(tid);
                    tid = null;
                }
                previousTimestamp = now;
                func(...args);
                if (tid === null) {
                    args = [];
                }
            } else if (tid === null && !(opts & Timing.THROTTLE_NO_TRAILING)) {
                tid = setTimeout(later, remaining);
            }
        };
        const abort = () => clearTimeout(tid);
        return [throttled, abort];
    }
}

export { Timing };
