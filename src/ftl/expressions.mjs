import { parse } from './expressions-parser.peggy';
import { nodes } from './ast.mjs';
import { BoundedCache } from './cache.mjs';

/**
 * The one lookup against a data stack: the innermost overlay carrying the name
 * wins, `self` is the innermost overlay itself, and a function overlay counts
 * like an object one. Every lookup that resolves a name goes through this, so the
 * imperative facades cannot drift from what a template sees.
 * @param {any[]} dataStack
 * @param {string|symbol} prop
 */
const resolveInStack = (dataStack, prop) => {
    if (prop === 'self') {
        return dataStack[dataStack.length - 1];
    }
    for (let i = dataStack.length - 1; i >= 0; i--) {
        const overlay = dataStack[i];
        if (overlay != null && (typeof overlay === 'object' || typeof overlay === 'function')) {
            if (prop in overlay) {
                return overlay[prop];
            }
        }
    }
    return undefined;
};

/**
 * Evaluates a parsed expression against a scope. One instance per evaluation:
 * it holds the modules and the data stack that names resolve against, and keeps
 * no state between visits.
 */
class EvaluatingVisitor {
    #modules;
    #dataStack;
    constructor(modules, dataStack) {
        this.#modules = modules;
        this.#dataStack = dataStack;
    }
    #resolve(prop) {
        return resolveInStack(this.#dataStack, prop);
    }
    /**
     * The name a missing-method report can carry: the called symbol for a bare
     * `boom()`, the member for a dotted `a.boom()`, nothing for anything else
     * (a subscript or a grouped left-hand side has no static name).
     */
    #reportableName(node, index) {
        const source = index === 0 ? node.lhs : node.rhs[index - 1];
        if (source.type === nodes.symbol) {
            return source.value;
        }
        if (source.type === nodes.member) {
            return source.rhs;
        }
        return null;
    }

    #cached_resolve_proxy;
    #resolve_proxy() {
        if (!this.#cached_resolve_proxy) {
            this.#cached_resolve_proxy = new Proxy(this.#dataStack, {
                get: (target, prop) => this.#resolve(prop),
            });
        }
        return this.#cached_resolve_proxy;
    }
    [nodes.and](node) {
        return this.visit(node.lhs) && this.visit(node.rhs);
    }
    [nodes.or](node) {
        return this.visit(node.lhs) || this.visit(node.rhs);
    }
    [nodes.nullc](node) {
        const lhs = this.visit(node.lhs);
        return lhs !== null && lhs !== undefined ? lhs : this.visit(node.rhs);
    }
    [nodes.not](node) {
        return !this.visit(node.expr);
    }
    [nodes.eq](node) {
        const lhs = this.visit(node.lhs);
        const rhs = this.visit(node.rhs);
        const eq = lhs === rhs;
        return node.op === '==' ? eq : !eq;
    }
    [nodes.cmp](node) {
        const lhs = this.visit(node.lhs);
        const rhs = this.visit(node.rhs);
        switch (node.op) {
            case '>':
                return lhs > rhs;
            case '<':
                return lhs < rhs;
            case '>=':
                return lhs >= rhs;
            case '<=':
                return lhs <= rhs;
            default:
                throw new Error(`unknown cmp op ${node.op}`);
        }
    }
    [nodes.call](node) {
        const fnRef = node.value;
        const module = fnRef.module === null ? this.#modules : this.#modules?.[fnRef.module];
        if (!module) {
            throw new Error(`Module "${fnRef.module}" not found`);
        }
        const fn = module[fnRef.value];
        if (!fn) {
            throw new Error(`Function "#${fnRef.module === null ? '' : `${fnRef.module}:`}${fnRef.value}" not found`);
        }
        const args = node.args.map((arg) => this.visit(arg));
        return fn.apply(this.#resolve_proxy(), args);
    }
    [nodes.literal](node) {
        return node.value;
    }
    [nodes.tstring](node) {
        let result = '';
        const parts = node.parts;
        for (let i = 0, len = parts.length; i < len; i++) {
            const evaluated = this.visit(parts[i]);
            if (evaluated !== null && evaluated !== undefined) {
                result += evaluated;
            }
        }
        return result;
    }
    [nodes.symbol](node) {
        return this.#resolve(node.value);
    }
    [nodes.dict](node) {
        return Object.fromEntries(node.value.map((entry) => [this.visit(entry[0]), this.visit(entry[1])]));
    }
    [nodes.array](node) {
        return node.value.map((v) => this.visit(v));
    }
    [nodes.ter](node) {
        return this.visit(node.cond) ? this.visit(node.ifTrue) : this.visit(node.ifFalse);
    }
    [nodes.elv](node) {
        const cond = this.visit(node.cond);
        return cond ? cond : this.visit(node.ifFalse);
    }
    [nodes.access](node) {
        let prev;
        let cur = this.visit(node.lhs);
        for (let i = 0; i !== node.rhs.length; ++i) {
            const rhs = node.rhs[i];
            if (rhs.ns && cur == null) {
                return undefined;
            }
            let value;
            switch (rhs.type) {
                case nodes.member: {
                    value = cur[rhs.rhs];
                    break;
                }
                case nodes.subscript: {
                    value = cur[this.visit(rhs.rhs)];
                    break;
                }
                case nodes.method: {
                    if (!cur) {
                        const name = this.#reportableName(node, i);
                        throw new Error(name === null ? 'Method missing' : `Method missing "${name}"`);
                    }
                    const args = rhs.args.map((arg) => this.visit(arg));
                    value = cur.apply(prev, args);
                    break;
                }
            }
            prev = cur;
            cur = value;
        }
        return cur;
    }
    visit(node, ...args) {
        return this[node.type](node, ...args);
    }
    visitRoot(ast, templated) {
        return !templated
            ? this.visit(ast)
            : ast.map((node) => {
                  switch (node.type) {
                      case nodes.templated.tel:
                          return { type: nodes.dom.t, value: node.value };
                      case nodes.templated.tet:
                          return { type: nodes.dom.t, value: this.visit(node.value) };
                      case nodes.templated.teh:
                          return { type: nodes.dom.h, value: this.visit(node.value) };
                      case nodes.templated.ten:
                          return { type: nodes.dom.n, value: this.visit(node.value) };
                      default:
                          throw new Error(`unknown node type ${node.type.toString()}`);
                  }
              });
    }
}

/**
 * The expression language: parsing to an ast, caching the parses, and
 * interpreting one against a scope. Member access and calls are unfiltered, so
 * an expression can do whatever the page's own javascript can. Expressions are
 * written by the page author; untrusted data is passed in as data and never
 * spliced into the expression text.
 */
class Expressions {
    static MODE_EXPRESSION = Symbol('MODE_EXPRESSION');
    static MODE_TEMPLATED = Symbol('MODE_TEMPLATED');

    static #astCache = new BoundedCache(1000);

    /**
     * Parses an expression.
     * @param {string} expression
     * @param {(typeof Expressions.MODE_EXPRESSION | typeof Expressions.MODE_TEMPLATED)?} [mode]
     * @returns the ast
     */
    static parse(expression, mode) {
        const key = mode?.toString() + expression;
        return this.#astCache.getOrCompute(key, () =>
            parse(expression, {
                startRule: mode === Expressions.MODE_TEMPLATED ? 'TemplatedRoot' : 'ExpressionRoot',
            }),
        );
    }
    /**
     * Evaluates an expression.
     * @param {{[k: string]: any } | null | undefined } modules
     * @param {any[]} dataStack
     * @param {any} ast
     * @param {(typeof Expressions.MODE_EXPRESSION | typeof Expressions.MODE_TEMPLATED)?} [mode]
     * @returns the result
     */
    static evaluate(modules, dataStack, ast, mode) {
        return new EvaluatingVisitor(modules, dataStack).visitRoot(ast, mode === Expressions.MODE_TEMPLATED);
    }
    /**
     * Parses and evaluates an expression.
     * @param {{ [x: string]: any; } | null | undefined} modules
     * @param {any[]} dataStack
     * @param {string} expression
     * @param {(typeof Expressions.MODE_EXPRESSION | typeof Expressions.MODE_TEMPLATED)?} [mode]
     * @returns the result
     */
    static interpret(modules, dataStack, expression, mode) {
        return Expressions.evaluate(modules, dataStack, Expressions.parse(expression, mode), mode);
    }
}

/**
 * A scope: the modules that `#name:fn()` resolves against and the data stack
 * that a bare identifier resolves against, as a single value. Adding an overlay
 * returns a new evaluator instead of modifying this one, so a template can add
 * data for one subtree without affecting the rest of the render.
 */
class ExpressionEvaluator {
    #modules;
    #dataStack;
    constructor(modules, dataStack) {
        this.#modules = modules;
        this.#dataStack = dataStack;
    }
    withModule(name, value) {
        const module = name ? { [name]: value } : value;
        return new ExpressionEvaluator({ ...this.#modules, ...module }, this.#dataStack);
    }
    withOverlay(...data) {
        return new ExpressionEvaluator(
            this.#modules,
            data.length === 0 ? this.#dataStack : [...this.#dataStack, ...data],
        );
    }
    /**
     * Resolves a name against the data stack, with no parse round trip: the
     * lookup a template's bare identifier makes, for an imperative caller.
     * @param {string} name
     */
    resolve(name) {
        return resolveInStack(this.#dataStack, name);
    }
    /** Evaluates an expression against this scope. */
    evaluateExpression(expression) {
        return Expressions.interpret(this.#modules, this.#dataStack, expression, Expressions.MODE_EXPRESSION);
    }
    /** Evaluates a templated text, the `{{ }}` form, against this scope. */
    evaluateTemplated(text) {
        return Expressions.interpret(this.#modules, this.#dataStack, text, Expressions.MODE_TEMPLATED);
    }
}

export { Expressions, ExpressionEvaluator };
