/**
 * One generation of a `Claims`, as take() or hold() returns it: `stale` turns
 * true once a later `take()` or `invalidate()` on it starts a newer generation.
 * @typedef {{ readonly stale: boolean }} Claim
 */
/**
 * The generations of work over one contended resource. Every take() starts a
 * new generation, making every earlier one stale, and the work checks `stale`
 * before painting chrome, storing state or throwing towards a caller: a stale
 * result is dropped (it paints nothing, stores nothing and throws nothing).
 * hold() joins the current generation without making it stale (a fetch that
 * any later reconfiguration must detach), and invalidate() makes every
 * generation stale without starting one that is held (a hide ending every
 * pending show). One `Claims` per contended resource: a component whose
 * dropdown, value labels and loader configuration contend separately has one
 * each.
 */
class Claims {
    #generation = 0;
    /**
     * Starts a new generation, making every earlier one stale, and joins it.
     * @returns {Claim}
     */
    take() {
        ++this.#generation;
        return this.hold();
    }
    /**
     * Joins the current generation without making anything stale.
     * @returns {Claim}
     */
    hold() {
        const held = this.#generation;
        const claims = this;
        return {
            /** true once a later take() or invalidate() started a newer generation */
            get stale() {
                return held !== claims.#generation;
            },
        };
    }
    /**
     * Makes every generation stale without starting one that is held.
     * @returns {void}
     */
    invalidate() {
        ++this.#generation;
    }
}

export { Claims };
