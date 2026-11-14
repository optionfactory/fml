import { assert } from 'chai';
import { Claims } from '../../src/ful/claims.mjs';

describe('Claims', () => {
    it('a taken generation is fresh until a later take makes it stale', () => {
        const claims = new Claims();
        const first = claims.take();
        assert.isFalse(first.stale, 'a take is fresh while no later take has started a newer generation');

        const second = claims.take();
        assert.isTrue(first.stale, 'the newer take makes the older generation stale');
        assert.isFalse(second.stale, 'the latest take holds the current generation');
    });

    it('invalidate makes every generation stale without starting one that is held', () => {
        const claims = new Claims();
        const claim = claims.take();

        claims.invalidate();

        assert.isTrue(claim.stale, 'invalidate starts a newer generation, so the take before it is stale');
    });

    it('holds join the current generation instead of making each other stale', () => {
        const claims = new Claims();
        const one = claims.hold();
        const two = claims.hold();
        assert.isFalse(one.stale, 'holding supersedes nothing');
        assert.isFalse(two.stale, 'a later hold joins the generation of the earlier one instead of superseding it');

        claims.invalidate();

        assert.isTrue(one.stale, 'invalidate makes the first hold stale');
        assert.isTrue(two.stale, 'invalidate makes every hold on the same generation stale, not only one');
    });
});
