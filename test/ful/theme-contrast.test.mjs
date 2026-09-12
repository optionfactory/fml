import { assert } from 'chai';
import '../../src/ful/index.mjs';

/**
 * The theme's ink pairs must hold WCAG AA wherever they render text, and the
 * non-text 3:1 where they draw indicators. The probes resolve the custom
 * properties through real declarations, which is where light-dark() picks its
 * side, under both color schemes.
 */
const luminance = (r, g, b) => {
    const [rr, gg, bb] = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
};
const parse = (value) => {
    const parts = value.match(/[\d.]+/g).map(Number);
    //color-mix results serialize as color(srgb r g b): floats in 0-1
    return value.includes('color(srgb') ? parts.map((c) => Math.round(c * 255)) : parts;
};
const ratio = (a, b) => {
    const l1 = luminance(...parse(a));
    const l2 = luminance(...parse(b));
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

const holder = (mode) => {
    const el = document.createElement('div');
    if (mode === 'dark') {
        el.style.colorScheme = 'dark';
    }
    document.body.appendChild(el);
    return el;
};
const pair = (host, ink, surface) => {
    const probe = document.createElement('div');
    probe.style.color = `var(${ink})`;
    probe.style.backgroundColor = `var(${surface})`;
    host.appendChild(probe);
    const cs = getComputedStyle(probe);
    const r = ratio(cs.color, cs.backgroundColor);
    probe.remove();
    return r;
};

const TEXT = [
    ['--ful-color', '--ful-bg'],
    ['--ful-muted-color', '--ful-bg'],
    ['--ful-invalid-color', '--ful-bg'],
    ['--ful-accent-ink', '--ful-bg'],
    ['--ful-active-color', '--ful-active-bg'],
    ['--ful-error-color', '--ful-error-bg'],
    ['--ful-warning-color', '--ful-warning-bg'],
];

describe('Theme contrast', () => {
    for (const mode of ['light', 'dark']) {
        describe(mode, () => {
            let host;
            before(() => {
                host = holder(mode);
            });
            after(() => host.remove());
            for (const [ink, surface] of TEXT) {
                it(`${ink} on ${surface} holds AA`, () => {
                    assert.isAtLeast(pair(host, ink, surface), 4.5);
                });
            }
            it('the focus indicator holds the non-text 3:1', () => {
                assert.isAtLeast(pair(host, '--ful-focus-border-color', '--ful-bg'), 3);
            });
        });
    }
});
