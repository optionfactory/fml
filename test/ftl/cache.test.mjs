import { assert } from 'chai';
import { BoundedCache } from '../../src/ftl/cache.mjs';

describe('BoundedCache', () => {
    it('computes once per key and serves the hit afterwards', () => {
        const cache = new BoundedCache(10);
        let computations = 0;
        const value = () =>
            cache.getOrCompute('k', () => {
                ++computations;
                return 'v';
            });

        assert.strictEqual(value(), 'v', 'a miss returns the value the compute produced');
        assert.strictEqual(value(), 'v', 'a hit returns the value cached on the miss');
        assert.strictEqual(computations, 1, 'the compute runs only on the first miss for a key');
    });

    it('caches a computed null or undefined like any value', () => {
        const cache = new BoundedCache(10);
        let computations = 0;
        const compute = () => {
            ++computations;
            return null;
        };

        assert.isNull(cache.getOrCompute('k', compute), 'a miss returns the null the compute produced');
        assert.isNull(cache.getOrCompute('k', compute), 'a hit returns the cached null');
        assert.strictEqual(computations, 1, 'a cached null counts as a hit, so the compute does not run again');
    });

    it('evicts the oldest entry past the cap, never growing over it', () => {
        const cache = new BoundedCache(2);
        let computations = 0;
        const compute = (k) => {
            ++computations;
            return k.toUpperCase();
        };

        cache.getOrCompute('a', compute);
        cache.getOrCompute('b', compute);
        cache.getOrCompute('c', compute);
        assert.strictEqual(cache.size, 2, 'a third key evicts an entry so the cache stays at its cap');

        cache.getOrCompute('a', compute);
        assert.strictEqual(computations, 4, 'the evicted oldest entry is recomputed');
        assert.strictEqual(
            cache.size,
            2,
            'recomputing the evicted key evicts another entry, so the cache stays at its cap',
        );
    });

    it('caches nothing and evicts nothing when the compute throws', () => {
        const cache = new BoundedCache(1);
        cache.getOrCompute('kept', () => 'v');

        assert.throws(
            () => {
                cache.getOrCompute('boom', () => {
                    throw new Error('nope');
                });
            },
            Error,
            undefined,
            'the error of the compute reaches the caller',
        );
        assert.strictEqual(cache.size, 1, 'a throwing compute caches nothing');
        let computations = 0;
        cache.getOrCompute('kept', () => {
            ++computations;
            return 'v';
        });
        assert.strictEqual(computations, 0, 'the failed compute did not evict the kept entry');
    });
});
