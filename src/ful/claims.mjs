/**
 * @typedef {{ readonly stale: boolean }} Claim
 */
/**
 * The generations of claims over one contended resource. Every take() starts a
 * new generation, superseding every claim before it, and a holder asks its
 * claim `stale` before painting chrome, storing state or throwing towards a
 * caller: a superseded outcome owns nothing. hold() joins the current
 * generation without superseding it (a fetch that any later reconfiguration
 * must detach), and invalidate() supersedes without claiming (a hide ending
 * every pending show). One Claims per contended resource: a component whose
 * dropdown, value labels and loader configuration contend separately holds one
 * each.
 */
class Claims {
    #generation = 0;
    /**
     * Starts a new generation, superseding every earlier claim, and holds it.
     * @returns {Claim}
     */
    take() {
        ++this.#generation;
        return this.hold();
    }
    /**
     * Holds the current generation without superseding anything.
     * @returns {Claim}
     */
    hold() {
        const held = this.#generation;
        const claims = this;
        return {
            /** true once a later take() or invalidate() superseded this claim */
            get stale() {
                return held !== claims.#generation;
            },
        };
    }
    /** Supersedes every claim without holding a new one. */
    invalidate() {
        ++this.#generation;
    }
}

export { Claims };
