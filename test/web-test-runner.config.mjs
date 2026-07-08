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
            name: 'peggy-transformer',
            resolveMimeType(context) {
                if (context.path.endsWith('.peggy')) {
                    return 'js';
                }
            },
            transform(context) {
                if (context.path.endsWith('.peggy')) {
                    const jsSource = peggy.generate(context.body, {
                        format: 'es',
                        output: 'source',
                        allowedStartRules: ['ExpressionRoot', 'TemplatedRoot']
                    });

                    return { body: jsSource };
                }
            }
        }
    ],
};