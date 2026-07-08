import './setup.test.mjs';
import { Expressions } from '../../dist/ftl.mjs';
import { strict as assert } from 'node:assert';
import { it, describe } from 'node:test';

describe('EvaluatingVisitor Optimized Scope Chain', () => {
    const modules = {
        customModule: {
            checkThisContext: function() {
                return this.valueFromStack;
            }
        }
    };

    it('should successfully resolve symbols without throwing on raw primitives in the stack', () => {
        const stack = [
            "raw string primitive", 
            42, 
            { expectedKey: "found-it", valueFromStack: "safe" }
        ];
        
        // Verifies the 'prop in overlay' safe check doesn't crash on string or number primitives
        const result = Expressions.interpret(modules, stack, 'expectedKey');
        assert.strictEqual(result, 'found-it');
    });

    it('should cleanly resolve the special keyword "self" to the top of the stack', () => {
        const stack = [{ val: 1 }, { val: 2 }, { target: "top" }];
        
        const result = Expressions.interpret(modules, stack, 'self');
        assert.deepEqual(result, { target: "top" });
    });

    it('should lazily instantiate and provide a working context proxy for module functions', () => {
        const stack = [{ valueFromStack: "success" }];
        
        // Triggers nodes.call which invokes the lazy proxy initializer (#resolve_proxy)
        const result = Expressions.interpret(modules, stack, '#customModule:checkThisContext()');
        assert.strictEqual(result, 'success');
    });
});