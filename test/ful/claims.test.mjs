import { assert } from 'chai';
import { Claims } from '../../src/ful/claims.mjs';

describe('Claims', () => {
    it('a taken claim is fresh until a later take supersedes it', () => {
        const claims = new Claims();
        const first = claims.take();
        assert.isFalse(first.stale);

        const second = claims.take();
        assert.isTrue(first.stale, 'the newer take supersedes the older claim');
        assert.isFalse(second.stale);
    });

    it('invalidate supersedes every claim without holding a new one', () => {
        const claims = new Claims();
        const claim = claims.take();

        claims.invalidate();

        assert.isTrue(claim.stale);
    });

    it('held claims share the generation instead of superseding each other', () => {
        const claims = new Claims();
        const one = claims.hold();
        const two = claims.hold();
        assert.isFalse(one.stale, 'holding supersedes nothing');
        assert.isFalse(two.stale);

        claims.invalidate();

        assert.isTrue(one.stale);
        assert.isTrue(two.stale);
    });
});
