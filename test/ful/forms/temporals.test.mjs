import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin, Instant } from '../../../src/ful/index.mjs';
import { appended } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

describe('InputLocalTime min and max', () => {
    const hhmm = (date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    const mount = async (attrs) => {
        const container = appended(`<ful-input-local-time name="t" ${attrs}>time</ful-input-local-time>`);
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
        const [el, , candidates] = await expected(0, 'min="now"');

        assert.include(
            candidates,
            el.min,
            'min now resolves to the current hh:mm time, allowing for the minute ticking during the render',
        );
        assert.strictEqual(el.querySelector('input').min, el.min, 'the resolved min is what the inner input is given');
    });

    it('resolves hour offsets', async () => {
        const [el, , candidates] = await expected(2 * 60 * 60 * 1000, 'min="+2h"');

        assert.include(
            candidates,
            el.min,
            'an hour offset resolves to the current time moved forward by that many hours',
        );
    });

    it('resolves negative minute offsets', async () => {
        const [el, , candidates] = await expected(-30 * 60 * 1000, 'max="-30m"');

        assert.include(
            candidates,
            el.max,
            'a negative minute offset resolves to the current time moved back by that many minutes',
        );
    });

    it('passes literal times through', async () => {
        const [el] = await mount('min="10:00" max="18:00"');

        assert.strictEqual(el.min, '10:00', 'a literal min time is passed to the input unchanged');
        assert.strictEqual(el.max, '18:00', 'a literal max time is passed to the input unchanged');
    });

    it('passes date offsets through instead of turning them into a date', async () => {
        const [el] = await mount('min="+1d"');

        assert.strictEqual(el.min, '+1d', 'day offsets mean nothing on a time');
    });

    it('reads back min and max, which a setter without its getter would break', async () => {
        const [el] = await mount('min="10:00"');

        assert.strictEqual(el.min, '10:00', 'the min getter reads back the bound the attribute set');
        assert.isNull(el.max, 'an unset max reads back as null');
    });

    describe('Snapped to the step grid', () => {
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
            const [el] = await mount('min="now" step="1800"');

            assert.include(
                [...candidates, ...snappedCandidates(0, 1800)],
                el.min,
                'a bound resolved from now is floored to the half hour step grid',
            );
            assert.match(
                el.min,
                /^\d{2}:(00|30)$/,
                'a bound floored to a half hour step lands on the hour or the half hour',
            );

            const input = el.querySelector('input');
            const [hh] = el.min.split(':');
            input.value = `${hh}:30`;
            assert.isFalse(input.validity.stepMismatch, 'a half hour must stay selectable');
        });

        it('floors an offset to the step', async () => {
            const candidates = snappedCandidates(-30 * 60 * 1000, 900);
            const [el] = await mount('min="-30m" step="900"');

            assert.include(
                [...candidates, ...snappedCandidates(-30 * 60 * 1000, 900)],
                el.min,
                'a bound resolved from an offset is floored to the quarter hour step grid',
            );
            assert.match(
                el.min,
                /^\d{2}:(00|15|30|45)$/,
                'a bound floored to a quarter hour step lands on a quarter of the hour',
            );
        });

        it('keeps minute precision when no step is set', async () => {
            const [el] = await mount('min="now"');

            assert.match(
                el.min,
                /^\d{2}:\d{2}$/,
                'without a step a resolved bound is floored to the minute and carries no seconds',
            );
        });

        it('keeps seconds when the step is not whole minutes', async () => {
            const [el] = await mount('min="now" step="15"');

            assert.match(
                el.min,
                /^\d{2}:\d{2}:(00|15|30|45)$/,
                'a step that is not whole minutes keeps the seconds, floored to the step',
            );
        });

        it('does not snap a literal bound', async () => {
            const [el] = await mount('min="10:07" step="1800"');

            assert.strictEqual(el.min, '10:07', 'a literal bound is passed through without snapping to the step');
        });
    });
});

describe('ful-local-date rendering', () => {
    const mount = async (inner) => {
        const container = appended(`<ful-local-date ${inner}></ful-local-date>`);
        const el = container.querySelector('ful-local-date');
        await Rendering.waitFor(el);
        return [el, container];
    };

    it('renders nothing for blank content', async () => {
        const [el] = await mount('> </ful-local-date>');
        assert.strictEqual(el.textContent, '', 'blank content with no default attribute renders nothing');
    });

    it('renders the default attribute for blank content', async () => {
        const [el] = await mount(`default="not set"> </ful-local-date>`);
        assert.strictEqual(el.textContent, 'not set', 'blank content renders the default attribute');
    });

    it('renders the default attribute for content that does not name a date', async () => {
        const [el] = await mount(`default="not set">soon</ful-local-date>`);
        assert.strictEqual(
            el.textContent,
            'not set',
            'content that does not name a date renders the default attribute',
        );
    });

    it('renders the numeric date in the page locale', async () => {
        const [el] = await mount('>2026-09-04</ful-local-date>');
        assert.strictEqual(el.textContent, '9/4/2026', 'the date is formatted numerically in the page locale, en here');
    });

    it('lets the locale attribute win over the page locale', async () => {
        const [el] = await mount(`locale="it">2026-09-04</ful-local-date>`);
        assert.strictEqual(
            el.textContent,
            '04/09/2026',
            "the locale attribute picks the formatting locale over the page's",
        );
    });
});

describe('ful-instant rendering', () => {
    it('renders the default attribute for blank content', async () => {
        const container = appended(`<ful-instant default="never"> </ful-instant>`);
        const el = container.querySelector('ful-instant');
        await Rendering.waitFor(el);

        assert.strictEqual(el.textContent, 'never', 'blank content renders the default attribute');
    });

    it('renders the default attribute for content that does not name an instant', async () => {
        const container = appended(`<ful-instant default="never">soon</ful-instant>`);
        const el = container.querySelector('ful-instant');
        await Rendering.waitFor(el);

        assert.strictEqual(
            el.textContent,
            'never',
            'content that does not name an instant renders the default attribute',
        );
    });
});

describe('Instant conversions', () => {
    it('reads a date-only iso value as local midnight, in every timezone', () => {
        assert.strictEqual(
            Instant.isoToLocal('2024-03-15'),
            '2024-03-15T00:00:00.000',
            'a date-only value is read as local midnight of that day, not as UTC midnight',
        );
    });

    it('answers null for a value that does not parse, instead of throwing', () => {
        assert.isNull(Instant.localToIso('garbage'), 'a value that does not parse converts to null');
        assert.isNull(Instant.localToIso(''), 'an empty value converts to null');
        assert.strictEqual(
            Instant.localToIso('2024-03-15'),
            new Date(2024, 2, 15).toISOString(),
            'a date-only value converts from local midnight of that day',
        );
    });
});

describe('InputInstant bounds and value', () => {
    const mount = async (attrs = '') => {
        const container = appended(`<ful-input-instant name="i" ${attrs}>when</ful-input-instant>`);
        const el = container.querySelector('ful-input-instant');
        await Rendering.waitFor(el);
        return [el, container];
    };

    it('lands a date-only bound on the day it names, in every timezone', async () => {
        const [el] = await mount('min="2024-03-15" max="2024-03-16"');

        assert.strictEqual(
            el.querySelector('input').min,
            '2024-03-15T00:00:00.000',
            'a date-only min is shown to the input as local midnight of the day it names',
        );
        assert.strictEqual(
            el.querySelector('input').max,
            '2024-03-16T00:00:00.000',
            'a date-only max is shown to the input as local midnight of the day it names',
        );
        assert.strictEqual(
            el.min,
            new Date(2024, 2, 15).toISOString(),
            'the min reads back as the UTC instant of that local midnight',
        );
    });

    it('reports no value when the widget degraded to text and carries garbage', async () => {
        const [el] = await mount();
        const input = el.querySelector('input');
        input.type = 'text';
        input.value = 'not a datetime';

        assert.isNull(el.value, 'an unparseable value is no value, not a crash');
    });
});

describe('InputLocalDate min and max', () => {
    const mount = async (attrs) => {
        const container = appended(`<ful-input-local-date name="d" ${attrs}>date</ful-input-local-date>`);
        const el = container.querySelector('ful-input-local-date');
        await Rendering.waitFor(el);
        return [el, container];
    };
    const isoLocalDate = (date) =>
        new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    const todayOrTomorrow = (value) => [isoLocalDate(new Date()), isoLocalDate(new Date(Date.now() + 86400000))];

    it('resolves now to the current date', async () => {
        const [el] = await mount('min="now"');

        assert.include(
            todayOrTomorrow(),
            el.min,
            "min now resolves to today's date, allowing for the day ticking during the render",
        );
        assert.strictEqual(el.querySelector('input').min, el.min, 'the resolved min is what the inner input is given');
    });

    it('resolves day offsets', async () => {
        const [el] = await mount('min="+2d"');
        const floor = isoLocalDate(new Date(Date.now() + 2 * 86400000));
        const ceil = isoLocalDate(new Date(Date.now() + 3 * 86400000));

        assert.include([floor, ceil], el.min, 'a day offset resolves to today moved forward by that many days');
    });

    it('resolves month and year offsets onto the calendar', async () => {
        const [withMonth, monthContainer] = await mount('max="+2m"');
        const [withYear] = await mount('max="+1y"');

        assert.match(withMonth.max, /^\d{4}-\d{2}-\d{2}$/, 'a month offset resolves to a yyyy-mm-dd date');
        assert.isAbove(Date.parse(withMonth.max), Date.now(), 'a future month bound points forward');
        assert.match(withYear.max, /^\d{4}-\d{2}-\d{2}$/, 'a year offset resolves to a yyyy-mm-dd date');
        assert.isAbove(Date.parse(withYear.max), Date.now(), 'a future year bound points forward');

        monthContainer.remove();
    });

    it('passes literal dates and unknown tokens through unchanged', async () => {
        const [el] = await mount('min="2026-01-31"');

        assert.strictEqual(el.min, '2026-01-31', 'a literal date is passed to the input unchanged');
        el.min = 'garbage';
        assert.strictEqual(el.min, 'garbage', 'what cannot be parsed is left to the input to reject');
    });

    it('clamps a month offset that lands past the end of its month', async () => {
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
