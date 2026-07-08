import { playwrightLauncher } from '@web/test-runner-playwright';
import peggy from 'peggy';

export default {
    files: ['test/*/**/*.test.mjs'],
    nodeResolve: true,
    browsers: [
        playwrightLauncher({ product: 'chromium' })
    ],
    coverage: true,
    coverageConfig: {
        include: ['src/*/**/*.mjs'],
        exclude: ['test/**/*', 'node_modules/**/*'],
        reportDir: 'coverage/',
        report: true,
        reporters: ['text', 'html']
    },
    plugins: [
        {
            name: 'asset-transformer',
            resolveMimeType(context) {
                if (context.path.endsWith('.peggy') || context.path.endsWith('.css')) {
                    return 'js';
                }
            },
            transform(context) {
                if (context.path.endsWith('.peggy')) {
                    const jsSource = peggy.generate(context.body, {
                        format: 'es',
                        output: 'source',
                        allowedStartRules: ['*'] 
                    });
                    return { body: jsSource };
                }

                if (context.path.endsWith('.css')) {
                    const escapedCss = context.body
                        .replace(/\\/g, '\\\\')
                        .replace(/`/g, '\\`')
                        .replace(/\$/g, '\\$');

                    const jsSource = `
                        const css = \`${escapedCss}\`;
                        if (typeof document !== 'undefined') {
                            const style = document.createElement('style');
                            style.textContent = css;
                            document.head.appendChild(style);
                        }
                        export default css;
                    `;
                    return { body: jsSource };
                }
            }
        }
    ],
};