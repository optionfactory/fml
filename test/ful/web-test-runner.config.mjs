import { playwrightLauncher } from '@web/test-runner-playwright';

export default {
    files: ['test/ful/**/*.test.mjs'],
    nodeResolve: true,
    browsers: [
        playwrightLauncher({ product: 'chromium' })
    ],    
    coverage: true,
    coverageConfig: {
        include: ['src/ful/**/*.mjs'],
        exclude: ['test/**/*', 'node_modules/**/*'],
    },
};