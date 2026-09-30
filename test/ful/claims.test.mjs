import { assert } from 'chai';
import { Claims } from '../../src/ful/claims.mjs';

describe('Claims', () => {
    it('a taken claim is fresh until a later take supersedes it', () => {
        const claims = new Claims();
        const first = claims.take();
        assert.isFalse(first.stale, 'a claim is fresh while no later take has started a newer generation');

        const second = claims.take();
        assert.isTrue(first.stale, 'the newer take supersedes the older claim');
        assert.isFalse(second.stale, 'the latest take holds the current generation');
    });

    it('invalidate supersedes every claim without holding a new one', () => {
        const claims = new Claims();
        const claim = claims.take();

        claims.invalidate();

        assert.isTrue(claim.stale, 'invalidate starts a newer generation, so the claim taken before it is superseded');
    });

    it('held claims share the generation instead of superseding each other', () => {
        const claims = new Claims();
        const one = claims.hold();
        const two = claims.hold();
        assert.isFalse(one.stale, 'holding supersedes nothing');
        assert.isFalse(two.stale, 'a later hold joins the generation of the earlier one instead of superseding it');

        claims.invalidate();

        assert.isTrue(one.stale, 'invalidate supersedes the first held claim');
        assert.isTrue(two.stale, 'invalidate supersedes every claim holding the same generation, not only one');
    });
});
