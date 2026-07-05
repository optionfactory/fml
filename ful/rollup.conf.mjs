import resolve from '@rollup/plugin-node-resolve';
import terser from "@rollup/plugin-terser";
import postcss from "rollup-plugin-postcss";
import { execSync } from 'child_process';
import fs from 'fs';

class RollupTypeGenerator {
    name = 'rollup-plugin-type-generator';

    closeBundle() {
        console.log('Post-processing: Extracting type definitions from dist/ful.mjs...');
        try {
            execSync('npx tsc dist/ful.mjs --allowJs --declaration --emitDeclarationOnly --outDir dist --target ES2024 --moduleResolution bundler --lib es2024,dom,dom.iterable', { stdio: 'inherit' });
            const declarationPath = 'dist/ful.d.mts';
            if (fs.existsSync(declarationPath)) {
                fs.appendFileSync(declarationPath, '\nexport as namespace ful;\n');
                console.log('Successfully injected global namespace "ful" into declarations.');
            } else {
                console.error('Error: dist/ful.d.mts was not found!');
            }
        } catch (error) {
            console.error('Type generation phase failed!', error);
        }
    }
}

export default [{
    input: 'src/client-errors.mjs',
    output: [{
        sourcemap: true,
        file: 'dist/ful-client-errors.iife.min.js',
        format: 'iife',
        plugins: [
            terser()
        ]
    }, {
        sourcemap: true,
        file: 'dist/ful-client-errors.iife.js',
        format: 'iife'
    }],
    treeshake: true,
    plugins: [
        resolve()
    ]
}, {
    input: 'src/index.mjs',
    external: ['@optionfactory/ftl'],
    output: [{
        sourcemap: true,
        file: 'dist/ful.min.mjs',
        format: 'es',
        plugins: [
            terser()
        ]
    }, {
        sourcemap: true,
        file: 'dist/ful.mjs',
        format: 'es'
    }, {
        sourcemap: true,
        file: 'dist/ful.iife.min.js',
        name: 'ful',
        format: 'iife',
        globals: {
            '@optionfactory/ftl': 'ftl'
        },
        plugins: [
            terser()
        ]
    }, {
        sourcemap: true,
        file: 'dist/ful.iife.js',
        name: 'ful',
        format: 'iife',
        globals: {
            '@optionfactory/ftl': 'ftl'
        },
    }],
    treeshake: true,
    plugins: [
        resolve(),
        postcss({
            extract: 'ful.css',
            inject: false,
            minimize: true,
            sourceMap: true
        }),
        new RollupTypeGenerator()
    ]
}];