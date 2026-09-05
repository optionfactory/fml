import { expect } from 'chai';
import { Failure } from '../../src/httpc/failure.mjs';

describe('Failure', () => {
    it('is an Error carrying its problems', () => {
        const problems = [{ type: 'A', context: 'user.name', reason: 'blank', details: null }];
        const failure = new Failure('invalid user', problems);

        expect(failure).to.be.instanceOf(Error);
        expect(failure.name).to.equal('Failure');
        expect(failure.message).to.equal('invalid user');
        expect(failure.problems).to.equal(problems);
        expect(failure.cause).to.be.undefined;
    });

    it('drops the prefix from the contexts it matches, keeping the rest as they are', () => {
        const failure = new Failure('invalid', [
            { type: 'A', context: 'user.name', reason: 'blank', details: 1 },
            { type: 'A', context: 'address.city', reason: 'blank', details: null },
            { type: 'A', context: null, reason: 'unmapped', details: null },
        ]);

        const dropped = failure.dropping('user.');

        expect(dropped).to.be.instanceOf(Failure);
        expect(dropped.problems).to.deep.equal([
            { type: 'A', context: 'name', reason: 'blank', details: 1 },
            { type: 'A', context: 'address.city', reason: 'blank', details: null },
            { type: 'A', context: null, reason: 'unmapped', details: null },
        ]);
        expect(failure.problems[0].context).to.equal('user.name', 'the original is left untouched');
    });

    it('chains itself as the cause of the dropped copy', () => {
        const failure = new Failure('invalid', [{ type: 'A', context: 'a.b', reason: 'r', details: null }]);

        expect(failure.dropping('a.').cause).to.equal(failure);
    });
});
