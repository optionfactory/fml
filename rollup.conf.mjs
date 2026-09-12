import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import postcss from 'postcss';
import cssnano from 'cssnano';
import { decode, encode } from '@jridgewell/sourcemap-codec';
import path from 'node:path';
import { createFilter } from '@rollup/pluginutils';
import peggy from 'peggy';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const isPeggy = createFilter(['*.peggy', '**/*.peggy'], []);
const terserOptions = { compress: { passes: 2 } };

class RollupPeggyWithSourceMap {
    name = 'rollup-plugin-peggy-with-source-map';
    transform(grammar, id) {
        if (!isPeggy(id)) return null;
        const generated = peggy.generate(grammar, {
            allowedStartRules: ['TemplatedRoot', 'ExpressionRoot'],
            output: 'source-and-map',
            grammarSource: id,
            format: 'es',
            cache: true,
        });
        const res = generated.toStringWithSourceMap({});
        return { code: res.code, map: res.map.toString() };
    }
}


/**
 * Collects every imported stylesheet and emits them as a single minified asset with a
 * source map that points back at the original files. Replaces rollup-plugin-postcss, of
 * which only extract, minimize and sourceMap were ever used. A factory rather than a
 * class: the hooks need `this` to be the rollup plugin context for emitFile, so the
 * state has to live in a closure.
 *
 * Each stylesheet is processed on its own so that postcss knows its `from`, then the
 * results are concatenated and their maps merged by shifting generated lines and source
 * indices. Processing the concatenation in one go would lose the original file names.
 *
 * They are concatenated in the order the modules evaluate, not the order they happened
 * to be transformed in: rollup loads in parallel, so the transform order is arbitrary,
 * and the cascade — which layer is declared first above all — would be decided by a
 * race. The stylesheets are emitted here in the same sequence the browser adopts them
 * when the source modules are loaded one by one, so the built file and the source tree
 * cascade alike.
 */
const css = (fileName) => {
    const sources = new Map();
    return {
        name: 'rollup-plugin-css',
        transform(code, id) {
            if (!id.endsWith('.css')) {
                return null;
            }
            sources.set(id, code);
            return { code: '', map: { mappings: '' } };
        },
        async generateBundle(options) {
            if (sources.size === 0) {
                return;
            }
            //post-order depth first from the entries: a module's imports evaluate
            //before it, and rollup keeps importedIds in source order
            const evaluated = [];
            const visited = new Set();
            const visit = (id) => {
                if (visited.has(id)) {
                    return;
                }
                visited.add(id);
                const info = this.getModuleInfo(id);
                if (!info) {
                    return;
                }
                for (const imported of info.importedIds) {
                    visit(imported);
                }
                evaluated.push(id);
            };
            for (const id of this.getModuleIds()) {
                if (this.getModuleInfo(id)?.isEntry) {
                    visit(id);
                }
            }
            //anything the walk could not reach keeps its load order, after the rest
            const ordered = [
                ...evaluated.filter((id) => sources.has(id)),
                ...[...sources.keys()].filter((id) => !visited.has(id)),
            ];
            const dir = options.dir ?? path.dirname(options.file);
            const chunks = [];
            const merged = { version: 3, file: fileName, sources: [], sourcesContent: [], names: [], mappings: '' };
            const lines = [];
            for (const id of ordered) {
                const code = sources.get(id);
                const result = await postcss([cssnano({ preset: 'default' })]).process(code, {
                    from: id,
                    to: path.join(dir, fileName),
                    map: { inline: false, annotation: false },
                });
                const map = result.map.toJSON();
                const sourceBase = merged.sources.length;
                const nameBase = merged.names.length;
                merged.sources.push(...map.sources);
                merged.sourcesContent.push(...(map.sourcesContent ?? map.sources.map(() => null)));
                merged.names.push(...(map.names ?? []));
                for (const line of decode(map.mappings)) {
                    lines.push(
                        line.map((segment) =>
                            segment.length === 1
                                ? segment
                                : segment.length === 4
                                  ? [segment[0], segment[1] + sourceBase, segment[2], segment[3]]
                                  : [segment[0], segment[1] + sourceBase, segment[2], segment[3], segment[4] + nameBase],
                        ),
                    );
                }
                chunks.push(result.css);
            }
            merged.mappings = encode(lines);
            const source = chunks.join('\n');
            //a layer's position in the cascade is fixed where its name is first
            //seen, so a `@layer a, b, c;` statement only decides the order while it
            //precedes every layered block. Reaching the first block first means the
            //concatenation put a stylesheet before the one declaring the order, and
            //the cascade silently inverted
            const block = source.indexOf('@layer') === -1 ? -1 : source.search(/@layer[^;{]*\{/);
            const statement = source.search(/@layer[^;{]*;/);
            if (block !== -1 && (statement === -1 || statement > block)) {
                this.error(
                    `${fileName} opens a @layer block before declaring the layer order; the cascade would be decided by the concatenation order`,
                );
            }
            this.emitFile({
                type: 'asset',
                fileName,
                source: `${source}\n/*# sourceMappingURL=${fileName}.map */`,
            });
            this.emitFile({ type: 'asset', fileName: `${fileName}.map`, source: JSON.stringify(merged) });
        },
    };
};

export class RollupTypeGenerator {
    name = 'rollup-plugin-type-generator';
    constructor(ns) {
        this.ns = ns;
    }
    closeBundle = () => {
        console.log(`Post-processing: Extracting type definitions from dist/${this.ns}.mjs...`);
        execSync(
            `npx tsc dist/${this.ns}.mjs --allowJs --declaration --emitDeclarationOnly --outDir dist --target ES2024 --moduleResolution bundler --lib es2024,dom,dom.iterable`,
            { stdio: 'inherit' },
        );
        const declarationPath = `dist/${this.ns}.d.mts`;
        if (!fs.existsSync(declarationPath)) {
            throw new Error(`dist/${this.ns}.d.mts was not generated`);
        }
        fs.appendFileSync(declarationPath, `\nexport as namespace ${this.ns};\n`);
        console.log(`Successfully injected global namespace "${this.ns}" into declarations.`);
    };
}

/**
 * The sub-libraries a bundle can resolve to instead of inlining. One page must
 * hold one Registry, one ParsedElement and one Failure however a consumer
 * reaches them, so every es bundle that depends on a sibling imports it rather
 * than carrying a second copy. The iife bundles are the exception on purpose:
 * a script tag wants one file, and they resolve through the globals instead.
 */
/**
 * Fails the build if the module entry ever carries a second copy of a sibling
 * again. A static check rather than an identity assertion, because importing
 * the bundle in node needs a stubbed dom: it asserts what the shape of the file
 * makes true, that every sibling arrives by import and none is declared inline.
 */
const oneModuleGraph = () => ({
    name: 'one-module-graph',
    closeBundle() {
        const bundle = fs.readFileSync('dist/fml.mjs', 'utf8');
        for (const name of SIBLINGS) {
            if (!bundle.includes(`from './${name}.mjs'`)) {
                this.error(`dist/fml.mjs does not import ./${name}.mjs: the module entry inlined a sibling`);
            }
        }
        for (const declared of ['class Registry', 'class ParsedElement', 'class Failure']) {
            if (bundle.includes(declared)) {
                this.error(`dist/fml.mjs declares its own ${declared}: a consumer mixing entry points gets two`);
            }
        }
    },
});

const SIBLINGS = ['ftl', 'httpc', 'ful'];
const siblingOf = (id) => SIBLINGS.find((name) => id.includes(`/${name}/`));
const dependsOn = (...names) => (id) => names.includes(siblingOf(id));
const siblingPaths =
    (min) =>
    (id) => {
        const name = siblingOf(id);
        return name ? `./${name}${min ? '.min' : ''}.mjs` : undefined;
    };

/**
 * The outputs a bundle ships, stated once: the es pair a bundler consumes and
 * the iife pair a script tag does, each unminified and minified. `siblings`
 * says the bundle externalizes ftl and httpc, so the es outputs map them to
 * their file names and the iife outputs to their globals; `global` names the
 * iife's own, and a bundle that answers none (client-errors installs handlers
 * and exports nothing) passes null. They were spelled out per output, and the
 * sibling mapping alone was restated five times.
 */
const outputs = (name, { modules = true, script = true, siblings = false, global = name } = {}) => {
    const named = global ? { name: global } : {};
    const linked = siblings ? { globals: siblingOf } : {};
    return [
        ...(modules
            ? [
                  {
                      sourcemap: true,
                      file: `dist/${name}.mjs`,
                      format: 'es',
                      ...(siblings ? { paths: siblingPaths(false) } : {}),
                  },
                  {
                      sourcemap: true,
                      file: `dist/${name}.min.mjs`,
                      format: 'es',
                      plugins: [terser(terserOptions)],
                      ...(siblings ? { paths: siblingPaths(true) } : {}),
                  },
              ]
            : []),
        ...(script
            ? [
                  { sourcemap: true, file: `dist/${name}.iife.js`, format: 'iife', ...named, ...linked },
                  {
                      sourcemap: true,
                      file: `dist/${name}.iife.min.js`,
                      format: 'iife',
                      plugins: [terser(terserOptions)],
                      ...named,
                      ...linked,
                  },
              ]
            : []),
    ];
};

export default [
    {
        input: 'src/ftl/index.mjs',
        output: outputs('ftl'),
        treeshake: true,
        plugins: [new RollupPeggyWithSourceMap(), resolve(), new RollupTypeGenerator('ftl')],
    },
    {
        input: 'src/httpc/index.mjs',
        output: outputs('httpc'),
        treeshake: true,
        plugins: [resolve(), new RollupTypeGenerator('httpc')],
    },
    {
        input: 'src/client-errors/client-errors.mjs',
        output: outputs('client-errors', { modules: false, global: null }),
        treeshake: true,
        plugins: [resolve()],
    },
    {
        input: 'src/ful/index.mjs',
        external: dependsOn('ftl', 'httpc'),
        output: outputs('ful', { siblings: true }),
        treeshake: true,
        plugins: [
            resolve(),
            css('ful.css'),
            new RollupTypeGenerator('ful'),
        ],
    },
    {
        //the module entry re-exports its siblings instead of inlining them: a page
        //mixing `@optionfactory/fml` with `@optionfactory/fml/ful` used to get two
        //Registries and two Failures, so `instanceof Failure` was false across the
        //two copies and a form showed no field errors
        input: 'src/index.mjs',
        external: dependsOn('ftl', 'httpc', 'ful'),
        output: outputs('fml', { script: false, siblings: true }),
        treeshake: true,
        plugins: [resolve(), new RollupTypeGenerator('fml'), oneModuleGraph()],
    },
    {
        //the single file a script tag wants: it carries everything and answers the
        //ftl/httpc/ful globals itself, so nothing has to be loaded before it
        input: 'src/index.mjs',
        output: outputs('fml', { modules: false }),
        treeshake: true,
        plugins: [new RollupPeggyWithSourceMap(), resolve(), css('fml.css')],
    },
];
