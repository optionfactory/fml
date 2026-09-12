import { assert } from 'chai';
import { Expressions } from '../../src/ftl/index.mjs';

describe('EvaluatingVisitor optimized scope chain', () => {
    const modules = {
        customModule: {
            checkThisContext: function () {
                return this.valueFromStack;
            },
        },
    };

    it('looks past a primitive in the stack to the overlay carrying the name', () => {
        const stack = ['raw string primitive', 42, { expectedKey: 'found-it', valueFromStack: 'safe' }];

        const result = Expressions.interpret(modules, stack, 'expectedKey');
        assert.strictEqual(result, 'found-it');
    });

    it('resolves self to the innermost overlay', () => {
        const stack = [{ val: 1 }, { val: 2 }, { target: 'top' }];

        const result = Expressions.interpret(modules, stack, 'self');
        assert.deepEqual(result, { target: 'top' });
    });

    it('gives a module function a this that resolves through the data stack', () => {
        const stack = [{ valueFromStack: 'success' }];

        const result = Expressions.interpret(modules, stack, '#customModule:checkThisContext()');
        assert.strictEqual(result, 'success');
    });
});
