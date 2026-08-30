/**
 * Emits the IDE metadata for the custom elements, after the bundle has been built.
 *
 * Tags, attributes, slots and their types are introspected from the built module, so
 * they cannot drift from the code. The prose comes from metadata.json, which
 * test/manifest/metadata.test.mjs keeps aligned with the same source of truth.
 *
 * Three formats, because no single one is understood everywhere: the community custom
 * elements manifest, web-types for the JetBrains IDEs, and custom data for VS Code.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

//the element classes extend DOM types when the module is evaluated, and the plugin
//builds an http client that looks for the csrf meta tags: enough of a page to load
globalThis.HTMLElement = class {};
globalThis.Storage = class {};
globalThis.document = { querySelector: () => null, addEventListener: () => {} };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en' }, configurable: true });
globalThis.window = globalThis;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const metadata = JSON.parse(readFileSync(join(root, 'manifest/metadata.json'), 'utf8'));
const { Plugin } = await import(`file://${join(root, 'dist/fml.mjs')}`);

const TYPES = {
    presence: 'boolean',
    bool: 'boolean',
    number: 'number',
    csv: 'string',
    csvm: 'string',
    json: 'string',
};

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
    new Plugin().configure(recorder);
    return found;
};

const describe = (tag, kind, name) =>
    metadata.elements[tag]?.[kind]?.[name] ?? metadata.common[kind]?.[name] ?? '';

const model = registered().map(({ tag, klass }) => {
    const entry = metadata.elements[tag] ?? {};
    const attributes = (klass.observed ?? []).map((declared) => {
        const [name, mapper] = declared.split(':').map((p) => p.trim());
        return { name, type: TYPES[mapper] ?? 'string', description: describe(tag, 'attributes', name) };
    });
    const slots = new Set();
    for (const template of [klass.template, ...Object.values(klass.templates ?? {})]) {
        for (const found of String(template ?? '').matchAll(/slots\.([a-zA-Z]+)/g)) {
            slots.add(found[1]);
        }
    }
    const events = Object.entries(Array.isArray(entry.events) ? {} : (entry.events ?? {}));
    return {
        tag,
        name: klass.name,
        description: entry.description ?? '',
        attributes,
        slots: [...slots].map((name) => ({ name, description: describe(tag, 'slots', name) })),
        events: events.map(([name, description]) => ({ name, description })),
    };
});

const customElements = {
    schemaVersion: '1.0.0',
    readme: 'README.md',
    modules: [
        {
            kind: 'javascript-module',
            path: 'dist/fml.mjs',
            declarations: model.map((e) => ({
                kind: 'class',
                name: e.name,
                tagName: e.tag,
                customElement: true,
                description: e.description,
                attributes: e.attributes.map((a) => ({
                    name: a.name,
                    description: a.description,
                    type: { text: a.type },
                })),
                //the default slot is the unnamed one in the manifest schema
                slots: e.slots.map((s) => ({ name: s.name === 'default' ? '' : s.name, description: s.description })),
                events: e.events.map((v) => ({ name: v.name, description: v.description, type: { text: 'CustomEvent' } })),
            })),
            exports: model.map((e) => ({
                kind: 'custom-element-definition',
                name: e.tag,
                declaration: { name: e.name, module: 'dist/fml.mjs' },
            })),
        },
    ],
};

const webTypes = {
    $schema: 'https://json.schemastore.org/web-types',
    name: pkg.name,
    version: pkg.version,
    'description-markup': 'none',
    contributions: {
        html: {
            elements: model.map((e) => ({
                name: e.tag,
                description: e.description,
                attributes: e.attributes.map((a) => ({
                    name: a.name,
                    description: a.description,
                    value: { kind: 'plain', type: a.type },
                })),
                slots: e.slots.map((s) => ({ name: s.name, description: s.description })),
                events: e.events.map((v) => ({ name: v.name, description: v.description })),
            })),
        },
    },
};

const vscode = {
    version: 1.1,
    tags: model.map((e) => ({
        name: e.tag,
        description: e.description,
        attributes: e.attributes.map((a) => ({ name: a.name, description: `${a.description} (${a.type})`.trim() })),
    })),
};

const emit = (file, content) => {
    writeFileSync(join(root, 'dist', file), `${JSON.stringify(content, null, 2)}\n`);
    console.log(`Emitted dist/${file}`);
};
emit('custom-elements.json', customElements);
emit('web-types.json', webTypes);
emit('vscode.html-custom-data.json', vscode);
console.log(`  ${model.length} elements, ${model.reduce((n, e) => n + e.attributes.length, 0)} attributes, ${model.reduce((n, e) => n + e.events.length, 0)} events`);
