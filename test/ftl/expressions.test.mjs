import { assert } from '@esm-bundle/chai';

import { Expressions, ExpressionEvaluator } from '../../src/ftl/index.mjs';
import { nodes } from '../../src/ftl/ast.mjs';


const modules = {
    one: () => 1,
    l10n: {
        t(k) {
            return k;
        },
    },
    math: {
        isEven: (v) => v % 2 === 0,
    },
    accessData: function () {
        return this.a;
    },
};

describe('associativity', () => {
    const json_replacer = (key, value) => (typeof value === 'symbol' ? value.toString() : value);
    const ast = (description, expression, expected) => {
        it(description, () => {
            assert.deepStrictEqual(
                JSON.stringify(Expressions.parse(expression, Expressions.MODE_EXPRESSION), json_replacer),
                expected,
            );
        });
    };
    ast(
        'eq is left-associative',
        '1 == 1 == true',
        '{"type":"Symbol(eq)","op":"==","lhs":{"type":"Symbol(eq)","op":"==","lhs":{"type":"Symbol(literal)","value":1},"rhs":{"type":"Symbol(literal)","value":1}},"rhs":{"type":"Symbol(literal)","value":true}}',
    );
    ast(
        'or is left-associative',
        'false || false || true',
        '{"type":"Symbol(or)","lhs":{"type":"Symbol(or)","lhs":{"type":"Symbol(literal)","value":false},"rhs":{"type":"Symbol(literal)","value":false}},"rhs":{"type":"Symbol(literal)","value":true}}',
    );
    ast(
        'and is left-associative',
        'true && true && false',
        '{"type":"Symbol(and)","lhs":{"type":"Symbol(and)","lhs":{"type":"Symbol(literal)","value":true},"rhs":{"type":"Symbol(literal)","value":true}},"rhs":{"type":"Symbol(literal)","value":false}}',
    );
    ast(
        'cmp is left-associative',
        '1 >= 2 > 3 < 4 <= 5',
        '{"type":"Symbol(cmp)","op":"<=","lhs":{"type":"Symbol(cmp)","op":"<","lhs":{"type":"Symbol(cmp)","op":">","lhs":{"type":"Symbol(cmp)","op":">=","lhs":{"type":"Symbol(literal)","value":1},"rhs":{"type":"Symbol(literal)","value":2}},"rhs":{"type":"Symbol(literal)","value":3}},"rhs":{"type":"Symbol(literal)","value":4}},"rhs":{"type":"Symbol(literal)","value":5}}',
    );
    ast(
        'ternary is right-associative',
        '1 ? 2 : 3 ? 4 : 5',
        '{"type":"Symbol(ternary)","cond":{"type":"Symbol(literal)","value":1},"ifTrue":{"type":"Symbol(literal)","value":2},"ifFalse":{"type":"Symbol(ternary)","cond":{"type":"Symbol(literal)","value":3},"ifTrue":{"type":"Symbol(literal)","value":4},"ifFalse":{"type":"Symbol(literal)","value":5}}}',
    );
    ast(
        'elvis is right-associative',
        '1 ?: 2 ?: 3',
        '{"type":"Symbol(elvis)","cond":{"type":"Symbol(literal)","value":1},"ifFalse":{"type":"Symbol(elvis)","cond":{"type":"Symbol(literal)","value":2},"ifFalse":{"type":"Symbol(literal)","value":3}}}',
    );
    ast(
        'null-coalescence is right-associative',
        '1 ?? 2 ?? 3',
        '{"type":"Symbol(null-coalescence)","lhs":{"type":"Symbol(literal)","value":1},"rhs":{"type":"Symbol(null-coalescence)","lhs":{"type":"Symbol(literal)","value":2},"rhs":{"type":"Symbol(literal)","value":3}}}',
    );
});

const verify = (description, expr, data, expected) => {
    it(description || `${expr} == ${expected}`, () => {
        assert.deepStrictEqual(Expressions.interpret(modules, data, expr), expected);
    });
};

describe('Expression', () => {
    verify('can use member access', 'a.b.c', [{ a: { b: { c: 1 } } }], 1);
    verify('can use nullsafe member access', 'a?.b.c', [{}], undefined);
    verify('can call a method', 'a.toLowerCase()', [{ a: 'M' }], 'm');
    verify('can navigate array', "a['b']", [{ a: { b: 'M' } }], 'M');
    verify('can navigate array', "a?.['b']", [{ a: null }], undefined);
    verify('can call function from data', 'a()', [{ a: () => 'M' }], 'M');
    verify('can evaluate ternary operator', 'a ? b : c', [{ a: false, b: 'lhs', c: 'rhs' }], 'rhs');
    verify('can evaluate elvis operator', 'a ?: c', [{ a: false, b: 'lhs', c: 'rhs' }], 'rhs');
    verify('can evaluate elvis operator', 'a ?: b', [{ a: 'lhs', b: 'rhs' }], 'lhs');
    verify('can evaluate ??', 'a ?? b', [{ a: 'rhs', b: 'lhs' }], 'rhs');
    verify('can evaluate ??', 'a ?? b', [{ a: undefined, b: 'lhs' }], 'lhs');
    verify('can evaluate ??', 'a ?? b', [{ a: null, b: 'lhs' }], 'lhs');
    verify('can evaluate ??', 'a ?? b', [{ a: false, b: 'rhs' }], false);
    verify('can evaluate eq', 'a == b', [{ a: 1, b: 1 }], true);
    verify('can evaluate neq', 'a != b', [{ a: 1, b: 1 }], false);
    verify('can evaluate gt', 'a > b', [{ a: 2, b: 1 }], true);
    verify('can evaluate gte', 'a >= b', [{ a: 1, b: 1 }], true);
    verify('can evaluate lt', 'a < b', [{ a: 1, b: 2 }], true);
    verify('can evaluate lte', 'a <= b', [{ a: 1, b: 1 }], true);
    verify('can evaluate not', '!a', [{ a: true }], false);
    verify('can evaluate boolean literal (true)', 'true', [], true);
    verify('can evaluate boolean literal (false)', 'false', [], false);
    verify('can evaluate self', 'self', ['someValue'], 'someValue');
    verify('can call a function', '#one()', [], 1);
    verify('can call a function in module', '#math:isEven(2)', [], true);
    verify('modules can contain numbers', "#l10n:t('a')", [], 'a');
    verify('can reference data using this in a module function', '#accessData()', [{ a: 1 }, { a: 2 }], 2);
    verify('can evaluate multiple !', '!!!!!!!!!!!a', [{ a: true }], false);
    verify('can use empty dict literal', '{}', [{}], {});
    verify('can use dict literal', "{'a': true, 'b': false}", [{}], { a: true, b: false });
    verify('can use empty array literal', '[]', [{}], []);
    verify('can use array literal', '[1,2]', [{}], [1, 2]);
    verify('can use string literal', '"abc"', [{}], 'abc');
    verify('can use string literal', "'abc'", [{}], 'abc');
    verify('can use tstring literal', '`abc`', [{}], 'abc');
    verify('can use tstring literal', '`abc{var}`', [{ var: 'def' }], 'abcdef');
    verify('can use number literal', '12.3', [{}], 12.3);
    verify('can use number literal', '-12.3', [{}], -12.3);
    verify('can use number literal', '-.3', [{}], -0.3);
    verify(null, '(!a && !b) == !(a || b)', [{ a: true, b: false }], true);
    verify(null, '!a && !b == !(a || b)', [{ a: true, b: false }], false);
    verify(null, 'a.b[c.d].toLowerCase()', [{ a: { b: { z: 'M' } }, c: { d: 'z' } }], 'm');
    verify(null, '[1,2][1]', {}, 2);

    it('can use overlays', () => {
        let result = Expressions.interpret(modules, [{}, { a: true }], 'a');
        assert.strictEqual(result, true);
    });

    it('latest overlay data wins', () => {
        let result = Expressions.interpret({}, [{ a: false }, { a: true }], 'a');
        assert.strictEqual(result, true);
    });

    it('can report error on method calls', () => {
        try {
            Expressions.interpret({}, [{ a: false }], 'a.boom()');
        } catch (ex) {
            assert.strictEqual(ex.message, 'Method missing "boom"');
        }
    });

    it('can report error on missing module', () => {
        try {
            Expressions.interpret({}, [], '#waldo:boom()');
        } catch (ex) {
            assert.strictEqual(ex.message, 'Module "waldo" not found');
        }
    });
    it('can report error on missing module', () => {
        try {
            Expressions.interpret({ waldo: {} }, [], '#waldo:isHidden()');
        } catch (ex) {
            assert.strictEqual(ex.message, 'Function "#waldo:isHidden" not found');
        }
    });
});

describe('Templated Mode Evaluation', () => {
    it('evaluates literal text', () => {
        const res = Expressions.interpret({}, [], 'Just some text', Expressions.MODE_TEMPLATED);
        assert.deepStrictEqual(res, [{ type: nodes.dom.t, value: 'Just some text' }]);
    });

    it('evaluates text expressions', () => {
        const res = Expressions.interpret({}, [{ a: 'Dynamic Text' }], '{{ a }}', Expressions.MODE_TEMPLATED);
        assert.deepStrictEqual(res, [{ type: nodes.dom.t, value: 'Dynamic Text' }]);
    });

    it('evaluates html expressions', () => {
        const res = Expressions.interpret({}, [{ a: '<b>HTML</b>' }], '{{{ a }}}', Expressions.MODE_TEMPLATED);
        assert.deepStrictEqual(res, [{ type: nodes.dom.h, value: '<b>HTML</b>' }]);
    });

    it('evaluates node expressions', () => {
        const div = document.createElement('div');
        const res = Expressions.interpret({}, [{ a: div }], '{{{{ a }}}}', Expressions.MODE_TEMPLATED);
        assert.deepStrictEqual(res, [{ type: nodes.dom.n, value: div }]);
    });

    it('handles mixed templated segments', () => {
        const res = Expressions.interpret({}, [{ a: 'A' }, { b: 'B' }], 'Text {{ a }} more {{{ b }}}', Expressions.MODE_TEMPLATED);
        assert.strictEqual(res.length, 4);
        assert.strictEqual(res[0].value, 'Text ');
        assert.strictEqual(res[1].value, 'A');
        assert.strictEqual(res[2].value, ' more ');
        assert.strictEqual(res[3].value, 'B');
    });

    it('throws on unknown templated node type (simulated AST corruption)', () => {
        const badAst = [{ type: Symbol('unknown-fake-type') }];
        try {
            Expressions.evaluate({}, [], badAst, Expressions.MODE_TEMPLATED);
            assert.fail('Should have thrown an error');
        } catch (ex) {
            assert.match(ex.message, /unknown node type/);
        }
    });
});

describe('ExpressionEvaluator', () => {
    it('manages module and overlay chaining seamlessly', () => {
        const baseEvaluator = new ExpressionEvaluator({ base: { fn: () => 1 } }, [{ a: 10 }]);

        const withMod = baseEvaluator.withModule('extra', { fn: () => 2 });
        assert.strictEqual(withMod.evaluateExpression('#base:fn()'), 1);
        assert.strictEqual(withMod.evaluateExpression('#extra:fn()'), 2);

        const withGlobalMod = baseEvaluator.withModule(null, { globalFn: () => 3 });
        assert.strictEqual(withGlobalMod.evaluateExpression('#globalFn()'), 3);

        const withData = baseEvaluator.withOverlay({ b: 20 }, { c: 30 });
        assert.strictEqual(withData.evaluateExpression('a'), 10);
        assert.strictEqual(withData.evaluateExpression('b'), 20);
        assert.strictEqual(withData.evaluateExpression('c'), 30);

        const sameData = withData.withOverlay();
        assert.strictEqual(sameData.evaluateExpression('b'), 20);

        const tplRes = withData.evaluateTemplated('{{ b }}');
        assert.deepStrictEqual(tplRes, [{ type: nodes.dom.t, value: 20 }]);
    });
});

describe('AST Execution Edge Cases', () => {
    it('evaluates nullsafe method calls correctly', () => {
        const result = Expressions.interpret({}, [{ a: null }], 'a?.foo()');
        assert.isUndefined(result);
    });

    it('evaluates nested nullsafe member access correctly', () => {
        const result = Expressions.interpret({}, [{ a: { b: null } }], 'a.b?.c');
        assert.isUndefined(result);
    });

    it('throws on unknown comparison operator (simulated AST corruption)', () => {
        const badAst = {
            type: nodes.cmp,
            op: 'INVALID_OP',
            lhs: { type: nodes.literal, value: 1 },
            rhs: { type: nodes.literal, value: 2 }
        };
        try {
            Expressions.evaluate({}, [], badAst);
            assert.fail('Should have thrown an error');
        } catch (ex) {
            assert.strictEqual(ex.message, 'unknown cmp op INVALID_OP');
        }
    });
    it('handles function overlays and null/primitive values in the data stack (line 17 branch coverage)', () => {
        const fnOverlay = () => { };
        fnOverlay.secretKey = 'activated';
        const resFn = Expressions.interpret({}, [fnOverlay], 'secretKey');
        assert.strictEqual(resFn, 'activated');

        const resNull = Expressions.interpret({}, [null, undefined, { targetValue: 42 }], 'targetValue');
        assert.strictEqual(resNull, 42);
    });
    it('correctly handles cached templates', () => {
        const a = Expressions.parse("1 == 1", Expressions.MODE_EXPRESSION);
        const b = Expressions.parse("1 == 1", Expressions.MODE_EXPRESSION);
        assert.strictEqual(a, b);
    });

    it('correctly handles cache size', () => {
        const a = Expressions.parse("1 == 1", Expressions.MODE_EXPRESSION);
        for (let i = 0; i != 1001; ++i) {
            Expressions.parse(`true == ${i}`, Expressions.MODE_EXPRESSION);
        }
        const b = Expressions.parse("1 == 1", Expressions.MODE_EXPRESSION);
        assert.notStrictEqual(a, b);
    });
});