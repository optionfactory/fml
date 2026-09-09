/**
 * A Map bounded by entry count, evicting in insertion order: not an LRU (a hit
 * does not refresh an entry), just a cap keeping unbounded key spaces (parsed
 * expressions, compiled masks, formatter instances) from growing forever. The
 * capacity is sized so eviction never happens on a sane page: hitting it means
 * dynamically generated keys, where FIFO's worst case (evicting a hot entry)
 * costs one recomputation.
 */
class BoundedCache {
    #max;
    #entries = new Map();
    /** @param {number} max */
    constructor(max) {
        this.#max = max;
    }
    /**
     * The cached value for the key, computing and caching it on a miss. A
     * computed null or undefined is cached like any value; a throwing compute
     * caches nothing.
     * @template K, V
     * @param {K} key
     * @param {(key: K) => V} compute
     * @returns {V}
     */
    getOrCompute(key, compute) {
        if (this.#entries.has(key)) {
            return this.#entries.get(key);
        }
        const value = compute(key);
        if (this.#entries.size >= this.#max) {
            this.#entries.delete(this.#entries.keys().next().value);
        }
        this.#entries.set(key, value);
        return value;
    }
    get size() {
        return this.#entries.size;
    }
}

export { BoundedCache };
