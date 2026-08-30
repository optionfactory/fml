import { assert } from 'chai';
import { registry, Rendering } from '../../src/ftl/index.mjs';
import { Plugin } from '../../src/ful/index.mjs';

registry.plugin(new Plugin()).configure();

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
