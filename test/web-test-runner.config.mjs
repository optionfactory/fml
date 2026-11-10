import { playwrightLauncher } from '@web/test-runner-playwright';
import peggy from 'peggy';

export default {
    files: ['test/*/**/*.test.mjs'],
    nodeResolve: true,
    browserLogs: process.env.FML_TEST_LOGS === '1',
    browsers: [
        playwrightLauncher({ product: 'chromium' }),
        // one page at a time: firefox 159 stalls for seconds inside a popover opening while
        // other test pages of the same browser are busy, which times out whichever test opens one
        playwrightLauncher({ product: 'firefox', concurrency: 1 }),
        playwrightLauncher({ product: 'webkit' }),
    ],
    coverage: true,
    coverageConfig: {
        include: ['src/**/*.mjs'],
        exclude: ['test/**/*', 'node_modules/**/*'],
        reportDir: 'coverage/',
        report: true,
        reporters: ['text', 'html'],
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
                        allowedStartRules: ['TemplatedRoot', 'ExpressionRoot'],
                        cache: true,
                    });
                    return { body: jsSource };
                }

                if (context.path.endsWith('.css')) {
                    const escapedCss = context.body.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

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
            },
        },
    ],
};
