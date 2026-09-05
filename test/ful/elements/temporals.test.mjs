import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

describe('InputLocalTime min and max', () => {
    const hhmm = (date) =>
        `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    const mount = async (attrs) => {
        const container = document.createElement('div');
        container.innerHTML = `<ful-input-local-time name="t" ${attrs}>time</ful-input-local-time>`;
        document.body.appendChild(container);
        const el = container.querySelector('ful-input-local-time');
        await Rendering.waitFor(el);
        return [el, container];
    };
    /** the element resolves the offset while rendering, so allow the minute to tick */
    const expected = async (offsetMs, attrs) => {
        const before = hhmm(new Date(Date.now() + offsetMs));
        const [el, container] = await mount(attrs);
        const after = hhmm(new Date(Date.now() + offsetMs));
        return [el, container, [before, after]];
    };

    it('resolves now to the current time', async () => {
        const [el, container, candidates] = await expected(0, 'min="now"');

        assert.include(candidates, el.min, `min was ${el.min}`);
        assert.strictEqual(el.querySelector('input').min, el.min);
        container.remove();
    });

    it('resolves hour offsets', async () => {
        const [el, container, candidates] = await expected(2 * 60 * 60 * 1000, 'min="+2h"');

        assert.include(candidates, el.min, `min was ${el.min}`);
        container.remove();
    });

    it('resolves negative minute offsets', async () => {
        const [el, container, candidates] = await expected(-30 * 60 * 1000, 'max="-30m"');

        assert.include(candidates, el.max, `max was ${el.max}`);
        container.remove();
    });

    it('passes literal times through', async () => {
        const [el, container] = await mount('min="10:00" max="18:00"');

        assert.strictEqual(el.min, '10:00');
        assert.strictEqual(el.max, '18:00');
        container.remove();
    });

    it('passes date offsets through instead of turning them into a date', async () => {
        const [el, container] = await mount('min="+1d"');

        assert.strictEqual(el.min, '+1d', 'day offsets mean nothing on a time');
        container.remove();
    });

    it('reads back min and max, which a setter without its getter would break', async () => {
        const [el, container] = await mount('min="10:00"');

        assert.strictEqual(el.min, '10:00');
        assert.isNull(el.max);
        container.remove();
    });

    describe('snapped to the step grid', () => {
        /** the resolved bound is floored to the step, so allow for the grid ticking */
        const snappedCandidates = (offsetMs, stepSeconds) => {
            const floor = (at) => {
                const d = new Date(at);
                const seconds = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
                const snapped = Math.floor(seconds / stepSeconds) * stepSeconds;
                const pad = (n) => String(n).padStart(2, '0');
                return `${pad(Math.floor(snapped / 3600))}:${pad(Math.floor((snapped % 3600) / 60))}`;
            };
            return [floor(Date.now() + offsetMs), floor(Date.now() + offsetMs + 60000)];
        };

        it('floors now to the step, so the grid stays selectable', async () => {
            const candidates = snappedCandidates(0, 1800);
            const [el, container] = await mount('min="now" step="1800"');

            assert.include([...candidates, ...snappedCandidates(0, 1800)], el.min, `min was ${el.min}`);
            assert.match(el.min, /^\d{2}:(00|30)$/);

            //the point of snapping: a bound off the grid invalidates every value on it
            const input = el.querySelector('input');
            const [hh] = el.min.split(':');
            input.value = `${hh}:30`;
            assert.isFalse(input.validity.stepMismatch, 'a half hour must stay selectable');
            container.remove();
        });

        it('floors an offset to the step', async () => {
            const candidates = snappedCandidates(-30 * 60 * 1000, 900);
            const [el, container] = await mount('min="-30m" step="900"');

            assert.include([...candidates, ...snappedCandidates(-30 * 60 * 1000, 900)], el.min, `min was ${el.min}`);
            assert.match(el.min, /^\d{2}:(00|15|30|45)$/);
            container.remove();
        });

        it('keeps minute precision when no step is set', async () => {
            const [el, container] = await mount('min="now"');

            assert.match(el.min, /^\d{2}:\d{2}$/);
            container.remove();
        });

        it('keeps seconds when the step is not whole minutes', async () => {
            const [el, container] = await mount('min="now" step="15"');

            assert.match(el.min, /^\d{2}:\d{2}:(00|15|30|45)$/);
            container.remove();
        });

        it('does not snap a literal bound', async () => {
            const [el, container] = await mount('min="10:07" step="1800"');

            assert.strictEqual(el.min, '10:07');
            container.remove();
        });
    });
});

describe('ful-local-date rendering', () => {
    const mount = async (inner) => {
        const container = document.createElement('div');
        container.innerHTML = `<ful-local-date ${inner}></ful-local-date>`;
        document.body.appendChild(container);
        const el = container.querySelector('ful-local-date');
        await Rendering.waitFor(el);
        return [el, container];
    };

    it('renders nothing for blank content', async () => {
        const [el, container] = await mount('> </ful-local-date>');
        assert.strictEqual(el.textContent, '');
        container.remove();
    });

    it('renders the default attribute for blank content', async () => {
        const [el, container] = await mount(`default="not set"> </ful-local-date>`);
        assert.strictEqual(el.textContent, 'not set');
        container.remove();
    });

    it('renders the numeric date in the page locale', async () => {
        const [el, container] = await mount('>2026-09-04</ful-local-date>');
        assert.strictEqual(el.textContent, '9/4/2026');
        container.remove();
    });

    it('lets the locale attribute win over the page locale', async () => {
        const [el, container] = await mount(`locale="it">2026-09-04</ful-local-date>`);
        assert.strictEqual(el.textContent, '04/09/2026');
        container.remove();
    });
});

describe('ful-instant rendering', () => {
    it('renders the default attribute for blank content', async () => {
        const container = document.createElement('div');
        container.innerHTML = `<ful-instant default="never"> </ful-instant>`;
        document.body.appendChild(container);
        const el = container.querySelector('ful-instant');
        await Rendering.waitFor(el);

        assert.strictEqual(el.textContent, 'never');
        container.remove();
    });
});

describe('InputLocalDate min and max', () => {
    const mount = async (attrs) => {
        const container = document.createElement('div');
        container.innerHTML = `<ful-input-local-date name="d" ${attrs}>date</ful-input-local-date>`;
        document.body.appendChild(container);
        const el = container.querySelector('ful-input-local-date');
        await Rendering.waitFor(el);
        return [el, container];
    };
    const isoLocalDate = (date) =>
        new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    const todayOrTomorrow = (value) => [isoLocalDate(new Date()), isoLocalDate(new Date(Date.now() + 86400000))];

    it('resolves now to the current date', async () => {
        const [el, container] = await mount('min="now"');

        assert.include(todayOrTomorrow(), el.min, `min was ${el.min}`);
        assert.strictEqual(el.querySelector('input').min, el.min);
        container.remove();
    });

    it('resolves day offsets', async () => {
        const [el, container] = await mount('min="+2d"');
        const floor = isoLocalDate(new Date(Date.now() + 2 * 86400000));
        const ceil = isoLocalDate(new Date(Date.now() + 3 * 86400000));

        assert.include([floor, ceil], el.min, `min was ${el.min}`);
        container.remove();
    });

    it('resolves month and year offsets onto the calendar', async () => {
        const [withMonth, monthContainer] = await mount('max="+2m"');
        const [withYear, yearContainer] = await mount('max="+1y"');

        assert.match(withMonth.max, /^\d{4}-\d{2}-\d{2}$/);
        assert.isAbove(Date.parse(withMonth.max), Date.now(), 'a future month bound points forward');
        assert.match(withYear.max, /^\d{4}-\d{2}-\d{2}$/);
        assert.isAbove(Date.parse(withYear.max), Date.now(), 'a future year bound points forward');

        monthContainer.remove();
        yearContainer.remove();
    });

    it('passes literal dates and unknown tokens through unchanged', async () => {
        const [el, container] = await mount('min="2026-01-31"');

        assert.strictEqual(el.min, '2026-01-31');
        el.min = 'garbage';
        assert.strictEqual(el.min, 'garbage', 'what cannot be parsed is left to the input to reject');
        container.remove();
    });

    it('clamps a month offset that lands past the end of its month', async () => {
        //the clamp only exists on days that overflow their target month, so the
        //calendar is pinned to one: January 31st, 2026, at noon local time
        const RealDate = Date;
        const pinned = new RealDate(2026, 0, 31, 12, 0, 0);
        globalThis.Date = class extends RealDate {
            constructor(...args) {
                super(...(args.length ? args : [pinned.getTime()]));
            }
            static now() {
                return pinned.getTime();
            }
        };
        try {
            const [el, container] = await mount('max="+1m" min="-11m"');

            assert.strictEqual(el.max, '2026-02-28', 'February 31st does not exist: the bound takes its last day');
            assert.strictEqual(el.min, '2025-02-28', 'walking back into February clamps the same way');
            container.remove();
        } finally {
            globalThis.Date = RealDate;
        }
    });
});
