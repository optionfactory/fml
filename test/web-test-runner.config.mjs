import { playwright, playwrightLauncher } from '@web/test-runner-playwright';
import peggy from 'peggy';

/**
 * A browser runs one test file at a time. Pages sharing one browser stall each other:
 * firefox holds a popover opening for seconds, webkit holds animation frames and mouse
 * commands, while the other pages of the same browser are busy, which times out whichever
 * test was waiting on them. A browser whose file is done takes the next one, as launching
 * firefox costs more than most files take to run; playwright closes them all on exit.
 * @param {'chromium' | 'firefox' | 'webkit'} product
 */
const launcher = (product) => {
    const idle = [];
    return playwrightLauncher({
        product,
        createBrowserContext: async () => {
            const browser = idle.pop() ?? (await playwright[product].launch());
            const context = await browser.newContext();
            context.on('close', () => idle.push(browser));
            return context;
        },
    });
};

export default {
    // the table suite is the longest file by far: started in alphabetical order, near the end,
    // it would run alone for most of its length after every other file finished
    files: ['test/ful/navigation/table.test.mjs', 'test/*/**/*.test.mjs'],
    nodeResolve: true,
    browserLogs: process.env.FML_TEST_LOGS === '1',
    concurrentBrowsers: 3,
    browsers: [launcher('chromium'), launcher('firefox'), launcher('webkit')],
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
