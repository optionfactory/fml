/**
 * Sleeping, debouncing and throttling. `debounce` and `throttle` both return
 * the wrapped function together with an abort function, which cancels the call
 * pending and leaves the wrapped function working.
 */
class Timing {
    /**
     * @param {number} ms
     * @returns {Promise<void>} resolving after `ms` milliseconds
     */
    static sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    /**
     * Collapses a burst of calls into one call of `func`, a burst ending once
     * `timeoutMs` pass without a call. By default `func` is called at the end
     * of the burst with the arguments of its last call. With `immediate` it is
     * called at the first call of a burst, with that call's arguments, and not
     * at the end. Without `immediate`, a call the wrapped function receives
     * from inside `func` starts a new burst.
     * @param {number} timeoutMs
     * @param {(...args: any[]) => any} func
     * @param {{ immediate?: boolean }} [options]
     * @returns {[(...args: any[]) => void, () => void]} the wrapped function
     * and the abort function
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
     * Calls `func` at most once per `timeoutMs`, always with the arguments of
     * the latest call. With `leading`, on by default, a call arriving once the
     * interval since the previous call of `func` has passed calls it at once;
     * without it, the first call only starts the interval. With `trailing`, on
     * by default, a call arriving inside the interval schedules `func` for the
     * interval's end; without it, such a call is dropped.
     * @param {number} timeoutMs
     * @param {(...args: any[]) => any} func
     * @param {{ leading?: boolean, trailing?: boolean }} [options]
     * @returns {[(...args: any[]) => void, () => void]} the wrapped function
     * and the abort function
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
