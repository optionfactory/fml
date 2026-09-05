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
            const dir = options.dir ?? path.dirname(options.file);
            const chunks = [];
            const merged = { version: 3, file: fileName, sources: [], sourcesContent: [], names: [], mappings: '' };
            const lines = [];
            for (const [id, code] of sources) {
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
            this.emitFile({
                type: 'asset',
                fileName,
                source: `${chunks.join('\n')}\n/*# sourceMappingURL=${fileName}.map */`,
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
        try {
            execSync(
                `npx tsc dist/${this.ns}.mjs --allowJs --declaration --emitDeclarationOnly --outDir dist --target ES2024 --moduleResolution bundler --lib es2024,dom,dom.iterable`,
                { stdio: 'inherit' },
            );
            const declarationPath = `dist/${this.ns}.d.mts`;
            if (fs.existsSync(declarationPath)) {
                fs.appendFileSync(declarationPath, `\nexport as namespace ${this.ns};\n`);
                console.log(`Successfully injected global namespace "${this.ns}" into declarations.`);
            } else {
                console.error(`Error: dist/${this.ns}.d.mts was not found!`);
            }
        } catch (error) {
            console.error('Type generation phase failed!', error);
        }
    };
}

export default [
    {
        input: 'src/ftl/index.mjs',
        output: [
            { sourcemap: true, file: 'dist/ftl.mjs', format: 'es' },
            { sourcemap: true, file: 'dist/ftl.min.mjs', format: 'es', plugins: [terser(terserOptions)] },
            { sourcemap: true, file: 'dist/ftl.iife.js', name: 'ftl', format: 'iife' },
            { sourcemap: true, file: 'dist/ftl.iife.min.js', name: 'ftl', format: 'iife', plugins: [terser(terserOptions)] },
        ],
        treeshake: true,
        plugins: [new RollupPeggyWithSourceMap(), resolve(), new RollupTypeGenerator('ftl')],
    },
    {
        input: 'src/httpc/index.mjs',
        output: [
            { sourcemap: true, file: 'dist/httpc.mjs', format: 'es' },
            { sourcemap: true, file: 'dist/httpc.min.mjs', format: 'es', plugins: [terser(terserOptions)] },
            { sourcemap: true, file: 'dist/httpc.iife.js', name: 'httpc', format: 'iife' },
            { sourcemap: true, file: 'dist/httpc.iife.min.js', name: 'httpc', format: 'iife', plugins: [terser(terserOptions)] },
        ],
        treeshake: true,
        plugins: [resolve(), new RollupTypeGenerator('httpc')],
    },
    {
        input: 'src/client-errors/client-errors.mjs',
        output: [
            { sourcemap: true, file: 'dist/client-errors.iife.js', format: 'iife' },
            { sourcemap: true, file: 'dist/client-errors.iife.min.js', format: 'iife', plugins: [terser(terserOptions)] },
        ],
        treeshake: true,
        plugins: [resolve()],
    },
    {
        input: 'src/ful/index.mjs',
        external: (id) => id.includes('/ftl/') || id.includes('/httpc/'),
        output: [
            {
                sourcemap: true,
                file: 'dist/ful.mjs',
                format: 'es',
                paths: (id) => {
                    if (id.includes('/ftl/')) return './ftl.mjs';
                    if (id.includes('/httpc/')) return './httpc.mjs';
                },
            },
            {
                sourcemap: true,
                file: 'dist/ful.min.mjs',
                format: 'es',
                plugins: [terser(terserOptions)],
                paths: (id) => {
                    if (id.includes('/ftl/')) return './ftl.min.mjs';
                    if (id.includes('/httpc/')) return './httpc.min.mjs';
                },
            },
            {
                sourcemap: true,
                file: 'dist/ful.iife.js',
                name: 'ful',
                format: 'iife',
                globals: (id) => {
                    if (id.includes('/ftl/')) return 'ftl';
                    if (id.includes('/httpc/')) return 'httpc';
                },
            },
            {
                sourcemap: true,
                file: 'dist/ful.iife.min.js',
                name: 'ful',
                format: 'iife',
                globals: (id) => {
                    if (id.includes('/ftl/')) return 'ftl';
                    if (id.includes('/httpc/')) return 'httpc';
                },
                plugins: [terser(terserOptions)],
            },
        ],
        treeshake: true,
        plugins: [
            resolve(),
            css('ful.css'),
            new RollupTypeGenerator('ful'),
        ],
    },
    {
        input: 'src/index.mjs',
        output: [
            { sourcemap: true, file: 'dist/fml.mjs', format: 'es' },
            { sourcemap: true, file: 'dist/fml.min.mjs', format: 'es', plugins: [terser(terserOptions)] },
            { sourcemap: true, file: 'dist/fml.iife.js', name: 'fml', format: 'iife' },
            { sourcemap: true, file: 'dist/fml.iife.min.js', name: 'fml', format: 'iife', plugins: [terser(terserOptions)] },
        ],
        treeshake: true,
        plugins: [
            new RollupPeggyWithSourceMap(),
            resolve(),
            css('fml.css'),
            new RollupTypeGenerator('fml'),
        ],
    },
];
