import { assert } from 'chai';
import { introspect } from '../../manifest/introspect.mjs';
import { Registry } from '../../src/ftl/index.mjs';
import { Plugin } from '../../src/ful/plugin.mjs';

/**
 * manifest/metadata.json carries the prose that cannot be read off the code: what each
 * element is for, what its attributes mean, what it emits. Everything else is derived
 * from the source, and these tests fail whenever the two disagree in either direction,
 * so the sidecar cannot quietly rot as the elements change.
 */
describe('Element metadata', function () {
    this.timeout(10000);
    const { registered, attributesOf, slotsOf } = introspect({ Plugin, Registry });

    let metadata;
    let elements;
    let sources;

    before(async () => {
        metadata = await (await fetch('/manifest/metadata.json')).json();
        elements = registered();
        //each class owns the source between its declaration and the next one
        sources = new Map();
        const files = [...new Set(elements.map((e) => e.klass))].flatMap((k) => {
            const names = [];
            for (let c = k; c?.name && c.name !== 'ParsedElement'; c = Object.getPrototypeOf(c)) {
                names.push(c.name);
            }
            return names;
        });
        const modules = [
            'disclosures/accordion',
            'disclosures/drawer',
            'disclosures/info',
            'disclosures/toast',
            'forms/bindings',
            'forms/checkbox',
            'forms/field',
            'forms/files',
            'forms/filters',
            'forms/form',
            'forms/input',
            'forms/radio',
            'forms/select',
            'forms/temporals',
            'navigation/table',
            'navigation/tabs',
            'navigation/wizard',
            'plugin',
        ];
        for (const module of modules) {
            const text = await (await fetch(`/src/ful/${module}.mjs`)).text();
            const marks = [...text.matchAll(/^class (\w+)/gm)];
            marks.forEach((mark, i) => {
                const body = text.slice(mark.index, marks[i + 1]?.index ?? text.length);
                sources.set(mark[1], body);
            });
        }
        assert.isTrue(
            files.every((n) => sources.has(n) || n === 'HTMLElement'),
            'every element class was located in a module',
        );
    });

    it('documents exactly the elements the plugin registers', () => {
        assert.deepStrictEqual(Object.keys(metadata.elements).sort(), elements.map((e) => e.tag).sort());
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
                const actual =
                    kind === 'attributes' ? attributesOf(klass).map((d) => d.split(':')[0]) : slotsOf(klass);
                const inherited = Object.keys(metadata.fieldProtocol[kind] ?? {});
                const own = Object.keys(metadata.elements[tag]?.[kind] ?? {});
                //the element's own prose must be real: an entry the code no
                //longer has cannot rot here unnoticed
                assert.deepStrictEqual(
                    own.filter((name) => !actual.includes(name)),
                    [],
                    `${tag}: the metadata documents ${kind} the code no longer has`,
                );
                //and everything real must be documented, the field-protocol overlay
                //standing in for the shared vocabulary
                assert.deepStrictEqual(
                    actual.filter((name) => !(own.includes(name) || inherited.includes(name))),
                    [],
                    `${tag}: the ${kind} in the code are not all documented`,
                );
            }
        });
    }

    //the async section family is dispatched by the shared SectionRequests helper
    //under dynamic type strings, invisible to the literal grep: what each host
    //emits beyond its own literals is declared here
    const EMITS = {
        'ful-tabs': ['section:requested'],
        'ful-wizard': ['section:requested'],
        'ful-dialog': ['section:requested'],
        'ful-drawer': ['section:requested'],
    };

    it('documents exactly the events each element emits', () => {
        for (const { tag, klass } of registered()) {
            const emitted = new Set(EMITS[tag] ?? []);
            for (let c = klass; c?.name; c = Object.getPrototypeOf(c)) {
                for (const found of (sources.get(c.name) ?? '').matchAll(/new CustomEvent\(\s*'([^']+)'/g)) {
                    emitted.add(found[1]);
                }
            }
            const entry = metadata.elements[tag].events;
            const described = Object.keys(entry);
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
