import { execSync } from 'child_process';
import fs from 'fs';

export class RollupTypeGenerator {
    name = 'rollup-plugin-type-generator';

    constructor(ns){
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