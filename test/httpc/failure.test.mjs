import { expect } from 'chai';
import { Failure } from '../../src/httpc/failure.mjs';

describe('Failure', () => {
    it('is an Error carrying its problems', () => {
        const problems = [{ type: 'A', context: 'user.name', reason: 'blank', details: null }];
        const failure = new Failure('invalid user', problems);

        expect(failure, 'a Failure is an Error so it can be thrown and caught as one').to.be.instanceOf(Error);
        expect(failure.name, 'the error names itself Failure').to.equal('Failure');
        expect(failure.message, 'the message is the one given').to.equal('invalid user');
        expect(failure.problems, 'the problems are the very list given').to.equal(problems);
        expect(failure.cause, 'without a cause argument the cause is left undefined').to.be.undefined;
    });

    it('drops the prefix from the contexts it matches, keeping the rest as they are', () => {
        const failure = new Failure('invalid', [
            { type: 'A', context: 'user.name', reason: 'blank', details: 1 },
            { type: 'A', context: 'address.city', reason: 'blank', details: null },
            { type: 'A', context: null, reason: 'unmapped', details: null },
        ]);

        const dropped = failure.dropping('user.');

        expect(dropped, 'dropping yields a Failure').to.be.instanceOf(Failure);
        expect(
            dropped.problems,
            'only contexts starting with the prefix lose it, and a null context stays null',
        ).to.deep.equal([
            { type: 'A', context: 'name', reason: 'blank', details: 1 },
            { type: 'A', context: 'address.city', reason: 'blank', details: null },
            { type: 'A', context: null, reason: 'unmapped', details: null },
        ]);
        expect(
            failure.problems[0].context,
            'dropping a prefix returns a copy, the original failure keeps its full context',
        ).to.equal('user.name');
    });

    it('chains itself as the cause of the dropped copy', () => {
        const failure = new Failure('invalid', [{ type: 'A', context: 'a.b', reason: 'r', details: null }]);

        expect(
            failure.dropping('a.').cause,
            'the original is chained as the cause so the source of the problems can be traced',
        ).to.equal(failure);
    });
});
