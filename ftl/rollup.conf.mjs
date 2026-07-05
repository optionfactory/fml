import resolve from '@rollup/plugin-node-resolve';
import terser from "@rollup/plugin-terser";
import { createFilter } from '@rollup/pluginutils';
import peggy from 'peggy';
import { execSync } from 'child_process';
import fs from 'fs';

const isPeggy = createFilter(['*.peggy', '**/*.peggy'], []);

class RollupPeggyWithSourceMap {
    name = 'rollup-plugin-peggy-with-source-map';
    
    transform(grammar, id) {
        if (!isPeggy(id)) {
            return null;
        }
        const generated = peggy.generate(grammar, {
            allowedStartRules: ['TemplatedRoot', 'ExpressionRoot'],
            output: 'source-and-map',
            grammarSource: id,
            format: 'es',
            cache: true
        });
        
        const res = generated.toStringWithSourceMap({});
        return {
            code: res.code,
            map: res.map.toString()
        };
    }
}

class RollupTypeGenerator {
    name = 'rollup-plugin-type-generator';

    closeBundle() {
        console.log('Post-processing: Extracting type definitions from dist/ftl.mjs...');
        try {
            execSync('npx tsc dist/ftl.mjs --allowJs --declaration --emitDeclarationOnly --outDir dist --target ES2024 --moduleResolution bundler --lib es2024,dom,dom.iterable', { stdio: 'inherit' });            
            const declarationPath = 'dist/ftl.d.mts';
            if (fs.existsSync(declarationPath)) {
                fs.appendFileSync(declarationPath, '\nexport as namespace ftl;\n');
                console.log('Successfully injected global namespace "ftl" into declarations.');
            } else {
                console.error('Error: dist/ftl.d.mts was not found!');
            }
        } catch (error) {
            console.error('Type generation phase failed!', error);
        }
    }
}

export default {
    input: 'src/index.mjs',
    output: [{
        sourcemap: true,
        file: 'dist/ftl.min.mjs',
        format: 'es',
        plugins: [
            terser()
        ]
    }, {
        sourcemap: true,
        file: 'dist/ftl.mjs',
        format: 'es'
    }, {
        sourcemap: true,
        file: 'dist/ftl.iife.min.js',
        name: 'ftl',
        format: 'iife',
        plugins: [
            terser()
        ]
    }, {
        sourcemap: true,
        file: 'dist/ftl.iife.js',
        name: 'ftl',
        format: 'iife'
    }],
    treeshake: true,
    plugins: [
        new RollupPeggyWithSourceMap(),
        resolve(),
        new RollupTypeGenerator()
    ]
};