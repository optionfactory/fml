import resolve from '@rollup/plugin-node-resolve';
import terser from "@rollup/plugin-terser";
import postcss from "rollup-plugin-postcss";
import alias from "@rollup/plugin-alias";
import { createFilter } from '@rollup/pluginutils';
import peggy from 'peggy';
import { fileURLToPath } from 'url';
import { dirname, resolve as pathResolve } from 'path';
import { execSync } from 'child_process';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isPeggy = createFilter(['*.peggy', '**/*.peggy'], []);

class RollupPeggyWithSourceMap {
    name = 'rollup-plugin-peggy-with-source-map';
    transform(grammar, id) {
        if (!isPeggy(id)) return null;
        const generated = peggy.generate(grammar, {
            allowedStartRules: ['TemplatedRoot', 'ExpressionRoot'],
            output: 'source-and-map',
            grammarSource: id,
            format: 'es',
            cache: true
        });
        const res = generated.toStringWithSourceMap({});
        return { code: res.code, map: res.map.toString() };
    }
}

export class RollupTypeGenerator {
    name = 'rollup-plugin-type-generator';

    constructor(ns) {
        this.ns = ns;
    }


    closeBundle = () => {
        console.log(`Post-processing: Extracting type definitions from dist/${this.ns}.mjs...`);
        try {
            execSync(`npx tsc dist/${this.ns}.mjs --allowJs --declaration --emitDeclarationOnly --outDir dist --target ES2024 --moduleResolution bundler --lib es2024,dom,dom.iterable`, { stdio: 'inherit' });
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
    }
}


export default [
    {
        input: 'src/ftl/index.mjs',
        output: [
            { sourcemap: true, file: 'dist/ftl.mjs', format: 'es' },
            { sourcemap: true, file: 'dist/ftl.min.mjs', format: 'es', plugins: [terser()] },
            { sourcemap: true, file: 'dist/ftl.iife.js', name: 'ftl', format: 'iife' },
            { sourcemap: true, file: 'dist/ftl.iife.min.js', name: 'ftl', format: 'iife', plugins: [terser()] }
        ],
        treeshake: true,
        plugins: [
            new RollupPeggyWithSourceMap(),
            resolve(),
            new RollupTypeGenerator('ftl')
        ]
    },
    {
        input: 'src/httpc/index.mjs',
        output: [
            { sourcemap: true, file: 'dist/httpc.mjs', format: 'es' },
            { sourcemap: true, file: 'dist/httpc.min.mjs', format: 'es', plugins: [terser()] },
            { sourcemap: true, file: 'dist/httpc.iife.js', name: 'httpc', format: 'iife' },
            { sourcemap: true, file: 'dist/httpc.iife.min.js', name: 'httpc', format: 'iife', plugins: [terser()] }
        ],
        treeshake: true,
        plugins: [
            resolve(),
            new RollupTypeGenerator('httpc')
        ]
    },
    {
        input: 'src/client-errors/client-errors.mjs',
        output: [
            { sourcemap: true, file: 'dist/ful-client-errors.iife.js', format: 'iife' },
            { sourcemap: true, file: 'dist/ful-client-errors.iife.min.js', format: 'iife', plugins: [terser()] }
        ],
        treeshake: true,
        plugins: [resolve()]
    },
    {
        input: 'src/ful/index.mjs',
        external: ['@optionfactory/ftl', '@optionfactory/httpc'],
        output: [
            { sourcemap: true, file: 'dist/ful.mjs', format: 'es' },
            { sourcemap: true, file: 'dist/ful.min.mjs', format: 'es', plugins: [terser()] },
            {
                sourcemap: true,
                file: 'dist/ful.iife.js',
                name: 'ful',
                format: 'iife',
                globals: { '@optionfactory/ftl': 'ftl', '@optionfactory/httpc': 'httpc' }
            },
            {
                sourcemap: true,
                file: 'dist/ful.iife.min.js',
                name: 'ful',
                format: 'iife',
                globals: { '@optionfactory/ftl': 'ftl', '@optionfactory/httpc': 'httpc' },
                plugins: [terser()]
            }
        ],
        treeshake: true,
        plugins: [
            resolve(),
            postcss({ extract: 'ful.css', inject: false, minimize: true, sourceMap: true }),
            new RollupTypeGenerator('ful')
        ]
    },
    {
        input: 'src/index.mjs',
        output: [
            { sourcemap: true, file: 'dist/fml.mjs', format: 'es' },
            { sourcemap: true, file: 'dist/fml.min.mjs', format: 'es', plugins: [terser()] },
            { sourcemap: true, file: 'dist/fml.iife.js', format: 'iife' },
            { sourcemap: true, file: 'dist/fml.iife.min.js', format: 'iife', plugins: [terser()] }
        ],
        treeshake: true,
        plugins: [
            alias({
                entries: [
                    { find: '@optionfactory/ftl', replacement: pathResolve(__dirname, 'src/ftl/index.mjs') },
                    { find: '@optionfactory/httpc', replacement: pathResolve(__dirname, 'src/httpc/index.mjs') }
                ]
            }),
            new RollupPeggyWithSourceMap(),
            resolve(),
            postcss({ extract: 'fml.css', inject: false, minimize: true, sourceMap: true }),
            new RollupTypeGenerator('fml')
        ]
    }
];