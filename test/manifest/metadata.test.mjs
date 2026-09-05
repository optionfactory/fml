import { assert } from 'chai';
import { Plugin } from '../../src/ful/elements/plugin.mjs';

/**
 * manifest/metadata.json carries the prose that cannot be read off the code: what each
 * element is for, what its attributes mean, what it emits. Everything else is derived
 * from the source, and these tests fail whenever the two disagree in either direction,
 * so the sidecar cannot quietly rot as the elements change.
 */
describe('Element metadata', () => {
    /** what the plugin actually registers, captured without defining anything */
    const registered = () => {
        const found = [];
        const recorder = new Proxy({}, {
            get: (_target, key) => (...args) => {
                if (key === 'defineElement') {
                    found.push({ tag: args[0], klass: args[1] });
                }
                return recorder;
            },
        });
        new Plugin({ language: 'en' }).configure(recorder);
        return found;
    };
    const slotsOf = (klass) => {
        const slots = new Set();
        for (const template of [klass.template, ...Object.values(klass.templates ?? {})]) {
            for (const found of String(template ?? '').matchAll(/slots\.([a-zA-Z]+)/g)) {
                slots.add(found[1]);
            }
        }
        return [...slots];
    };
    const attributesOf = (klass) => (klass.observed ?? []).map((a) => a.split(':')[0].trim());

    let metadata;
    let elements;
    let sources;

    before(async () => {
        metadata = await (await fetch('/manifest/metadata.json')).json();
        elements = registered();
        //each class owns the source between its declaration and the next one
        sources = new Map();
        const files = [...new Set(elements.map((e) => e.klass))]
            .flatMap((k) => {
                const names = [];
                for (let c = k; c?.name && c.name !== 'ParsedElement'; c = Object.getPrototypeOf(c)) {
                    names.push(c.name);
                }
                return names;
            });
        const modules = ['bindings', 'checkbox', 'files', 'field', 'filters', 'form', 'input', 'plugin',
            'radio', 'select', 'spinner', 'table', 'temporals'];
        for (const module of modules) {
            const text = await (await fetch(`/src/ful/elements/${module}.mjs`)).text();
            const marks = [...text.matchAll(/^class (\w+)/gm)];
            marks.forEach((mark, i) => {
                const body = text.slice(mark.index, marks[i + 1]?.index ?? text.length);
                sources.set(mark[1], body);
            });
        }
        assert.isTrue(files.every((n) => sources.has(n) || n === 'HTMLElement'), 'every element class was located in a module');
    });

    const documented = (tag, kind) => ({
        ...(metadata.common[kind] ?? {}),
        ...(metadata.elements[tag]?.[kind] ?? {}),
    });

    it('documents exactly the elements the plugin registers', () => {
        assert.deepStrictEqual(
            Object.keys(metadata.elements).sort(),
            elements.map((e) => e.tag).sort(),
        );
    });

    it('gives every element a description', () => {
        for (const [tag, entry] of Object.entries(metadata.elements)) {
            assert.isString(entry.description, `${tag} has no description`);
            assert.isAbove(entry.description.length, 20, `${tag} has a description worth reading`);
        }
    });

    for (const kind of ['attributes', 'slots']) {
        it(`documents exactly the ${kind} each element has`, () => {
            for (const { tag, klass } of registered()) {
                const actual = kind === 'attributes' ? attributesOf(klass) : slotsOf(klass);
                const described = Object.keys(documented(tag, kind)).filter((name) => actual.includes(name));
                assert.deepStrictEqual(
                    described.sort(),
                    [...actual].sort(),
                    `${tag}: the ${kind} in the metadata and in the code disagree`,
                );
            }
        });
    }

    it('documents exactly the events each element emits', () => {
        for (const { tag, klass } of registered()) {
            const emitted = new Set();
            for (let c = klass; c?.name; c = Object.getPrototypeOf(c)) {
                for (const found of (sources.get(c.name) ?? '').matchAll(/new CustomEvent\(\s*'([^']+)'/g)) {
                    emitted.add(found[1]);
                }
            }
            const entry = metadata.elements[tag].events;
            const described = Array.isArray(entry) ? entry : Object.keys(entry);
            assert.deepStrictEqual(
                described.sort(),
                [...emitted].sort(),
                `${tag}: the events in the metadata and in the code disagree`,
            );
        }
    });

    it('constructs every event with a literal name, which is what makes the check above possible', () => {
        for (const [name, body] of sources) {
            const calls = [...body.matchAll(/new CustomEvent\(([^)]*)/g)].map((m) => m[1].trim());
            for (const call of calls) {
                assert.match(call, /^'/, `${name} builds a CustomEvent from something other than a literal`);
            }
        }
    });
});
