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

        assert.strictEqual(value(), 'v');
        assert.strictEqual(value(), 'v');
        assert.strictEqual(computations, 1);
    });

    it('caches a computed null or undefined like any value', () => {
        const cache = new BoundedCache(10);
        let computations = 0;
        const compute = () => {
            ++computations;
            return null;
        };

        assert.isNull(cache.getOrCompute('k', compute));
        assert.isNull(cache.getOrCompute('k', compute));
        assert.strictEqual(computations, 1);
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
        assert.strictEqual(cache.size, 2);

        cache.getOrCompute('a', compute);
        assert.strictEqual(computations, 4, 'the evicted oldest entry is recomputed');
        assert.strictEqual(cache.size, 2);
    });

    it('caches nothing and evicts nothing when the compute throws', () => {
        const cache = new BoundedCache(1);
        cache.getOrCompute('kept', () => 'v');

        assert.throws(() => {
            cache.getOrCompute('boom', () => {
                throw new Error('nope');
            });
        });
        assert.strictEqual(cache.size, 1);
        let computations = 0;
        cache.getOrCompute('kept', () => {
            ++computations;
            return 'v';
        });
        assert.strictEqual(computations, 0, 'the failed compute did not evict the kept entry');
    });
});
