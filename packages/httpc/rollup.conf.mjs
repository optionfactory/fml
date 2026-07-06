import resolve from '@rollup/plugin-node-resolve';
import terser from "@rollup/plugin-terser";
import postcss from "rollup-plugin-postcss";
import { RollupTypeGenerator } from "../../rollup.base.conf.mjs"

export default [{
    input: 'src/index.mjs',
    output: [{
        sourcemap: true,
        file: 'dist/httpc.min.mjs',
        format: 'es',
        plugins: [
            terser()
        ]
    }, {
        sourcemap: true,
        file: 'dist/httpc.mjs',
        format: 'es'
    }, {
        sourcemap: true,
        file: 'dist/httpc.min.js',
        name: 'ful',
        format: 'iife',
        plugins: [
            terser()
        ]
    }, {
        sourcemap: true,
        file: 'dist/httpc.iife.js',
        name: 'ful',
        format: 'iife'
    }],
    treeshake: true,
    plugins: [
        resolve(),
        new RollupTypeGenerator('httpc')
    ]
}];