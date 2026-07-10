import { parse } from './expressions-parser.peggy';
import { nodes } from './ast.mjs';

class EvaluatingVisitor {
    #modules;
    #dataStack;
    constructor(modules, dataStack) {
        this.#modules = modules;
        this.#dataStack = dataStack;
    }
    #resolve(prop) {
        if (prop === 'self') {
            return this.#dataStack[this.#dataStack.length - 1];
        }
        for (let i = this.#dataStack.length - 1; i >= 0; i--) {
            const overlay = this.#dataStack[i];
            if (overlay != null && (typeof overlay === 'object' || typeof overlay === 'function')) {
                if (prop in overlay) {
                    return overlay[prop];
                }
            }
        }
        return undefined;
    }

    #cached_resolve_proxy;
    #resolve_proxy() {
        if (!this.#cached_resolve_proxy) {
            this.#cached_resolve_proxy = new Proxy(this.#dataStack, {
                get: (target, prop) => this.#resolve(prop)
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
                throw new Error('unknown cmp op ' + node.op);
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
            throw new Error(`Function "#${fnRef.module === null ? '' : fnRef.module + ':'}${fnRef.value}" not found`);
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
        return Object.fromEntries(node.value.map((entry) => [entry[0].value, this.visit(entry[1])]));
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
        let prev = undefined;
        let cur = this.visit(node.lhs);
        for (let i = 0; i !== node.rhs.length; ++i) {
            const rhs = node.rhs[i];
            if (rhs.ns && cur == null) {
                return undefined;
            }
            let value = undefined;
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
                        throw new Error(`Method missing "${node.rhs[i - 1].rhs}"`);
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
                        throw new Error('unknown node type ' + node.type.toString());
                }
            });
    }
}

class Expressions {
    static MODE_EXPRESSION = Symbol('MODE_EXPRESSION');
    static MODE_TEMPLATED = Symbol('MODE_TEMPLATED');

    static #astCache = new Map();
    static #MAX_CACHE_SIZE = 1000;

    /**
     * Parses an expression.
     * @param {string} expression
     * @param {(typeof Expressions.MODE_EXPRESSION | typeof Expressions.MODE_TEMPLATED)?} [mode]
     * @returns the ast
     */
    static parse(expression, mode) {
        const key = mode?.toString() + expression;

        if (!this.#astCache.has(key)) {
            if (this.#astCache.size >= this.#MAX_CACHE_SIZE) {
                const oldestKey = this.#astCache.keys().next().value;
                this.#astCache.delete(oldestKey);
            }
            this.#astCache.set(key, parse(expression, {
                startRule: mode === Expressions.MODE_TEMPLATED ? 'TemplatedRoot' : 'ExpressionRoot',
            }));
        }

        return this.#astCache.get(key);
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
    evaluate(expression, mode) {
        return Expressions.interpret(this.#modules, this.#dataStack, expression, mode);
    }
    evaluateExpression(expression) {
        return this.evaluate(expression, Expressions.MODE_EXPRESSION);
    }
    evaluateTemplated(expression) {
        return this.evaluate(expression, Expressions.MODE_TEMPLATED);
    }
}

export { Expressions, ExpressionEvaluator };
