/**
 * Sleeping, debouncing and throttling. Debounce and throttle both return the
 * wrapped function together with a cancel function.
 */
class Timing {
    /** Resolves after the given milliseconds. @param {number} ms */
    static sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    /**
     * Executes only after a period of inactivity (pause in events).
     * Respond to the "end" of a series of events.
     * @param {number} timeoutMs
     * @param {function} func
     * @param {{ immediate?: boolean }} [options] - immediate fires on the leading edge instead of the trailing one
     * @returns {[function, function]}
     */
    static debounce(timeoutMs, func, options) {
        const immediate = options?.immediate ?? false;
        let tid = /** @type {number | null} */ (null);
        let args = [];
        let previousTimestamp = 0;

        const later = () => {
            const elapsed = performance.now() - previousTimestamp;
            if (timeoutMs > elapsed) {
                tid = setTimeout(later, timeoutMs - elapsed);
                return;
            }
            tid = null;
            if (!immediate) {
                func(...args);
            }
            //func may have called debounced again, arming a new timer with new args:
            //clearing them then would drop the call that is now pending
            if (tid === null) {
                args = [];
            }
        };

        const debounced = (...called) => {
            args = called;
            previousTimestamp = performance.now();
            if (tid === null) {
                tid = setTimeout(later, timeoutMs);
                if (immediate) {
                    func(...args);
                }
            }
        };
        const abort = () => {
            clearTimeout(tid ?? undefined);
            tid = null;
            args = [];
        };
        return [debounced, abort];
    }
    /**
     * Executes at most once per specified time interval, regardless of ongoing events.
     * @param {number} timeoutMs
     * @param {function} func
     * @param {{ leading?: boolean, trailing?: boolean }} [options] - which edges of the interval call, both by default
     * @returns {[function, function]}
     */
    static throttle(timeoutMs, func, options) {
        const leading = options?.leading ?? true;
        const trailing = options?.trailing ?? true;
        let tid = /** @type {number | null} */ (null);
        let args = [];
        let previousTimestamp = 0;

        const later = () => {
            previousTimestamp = leading ? performance.now() : 0;
            tid = null;
            func(...args);
            if (tid === null) {
                args = [];
            }
        };
        const throttled = (...called) => {
            const now = performance.now();
            if (!previousTimestamp && !leading) {
                previousTimestamp = now;
            }
            const remaining = previousTimestamp === 0 ? 0 : timeoutMs - (now - previousTimestamp);
            args = called;
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
            } else if (tid === null && trailing) {
                tid = setTimeout(later, remaining);
            }
        };
        const abort = () => {
            clearTimeout(tid ?? undefined);
            tid = null;
            args = [];
        };
        return [throttled, abort];
    }
}

export { Timing };
