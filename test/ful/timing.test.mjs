import { assert } from 'chai';
import { Timing } from '../../src/ful/index.mjs';
import { useClock } from '../clock.mjs';

const clock = useClock();

describe('Timing.sleep', () => {
    it('resolves once its time has passed, not before', async () => {
        let done = false;
        Timing.sleep(50).then(() => {
            done = true;
        });
        await clock.advance(49);
        assert.isFalse(done);
        await clock.advance(1);
        assert.isTrue(done);
    });
});

describe('Timing.debounce', () => {
    it('fires once after the quiet period', async () => {
        const calls = [];
        const [debounced] = Timing.debounce(20, (v) => calls.push(v));
        debounced('a');
        debounced('b');
        debounced('c');
        await clock.advance(100);
        assert.deepStrictEqual(calls, ['c']);
    });

    it('abort cancels the pending call', async () => {
        const calls = [];
        const [debounced, abort] = Timing.debounce(20, (v) => calls.push(v));
        debounced('a');
        abort();
        await clock.advance(100);
        assert.deepStrictEqual(calls, []);
    });

    it('keeps working after abort', async () => {
        const calls = [];
        const [debounced, abort] = Timing.debounce(20, (v) => calls.push(v));
        debounced('a');
        abort();
        await clock.advance(100);
        debounced('b');
        await clock.advance(100);
        assert.deepStrictEqual(calls, ['b']);
    });
});

describe('Timing.throttle', () => {
    it('fires on the leading edge', async () => {
        const calls = [];
        const [throttled] = Timing.throttle(50, (v) => calls.push(v));
        throttled('a');
        assert.deepStrictEqual(calls, ['a']);
    });

    it('schedules a trailing call within the window', async () => {
        const calls = [];
        const [throttled] = Timing.throttle(50, (v) => calls.push(v));
        throttled('a');
        throttled('b');
        await clock.advance(200);
        assert.deepStrictEqual(calls, ['a', 'b']);
    });

    it('keeps scheduling trailing calls after abort', async () => {
        const calls = [];
        const [throttled, abort] = Timing.throttle(50, (v) => calls.push(v));
        throttled('a');
        throttled('b');
        abort();
        await clock.advance(10);
        assert.deepStrictEqual(calls, ['a'], 'the aborted trailing call must not fire');

        throttled('c');
        await clock.advance(200);
        assert.deepStrictEqual(calls, ['a', 'c']);
    });

    it('a call arriving past the window, the trailing edge still armed because the thread was busy, fires at once and cancels the stale one', async () => {
        const calls = [];
        const [throttled] = Timing.throttle(80, (v) => calls.push(v));
        throttled('leading');
        throttled('trailing');
        clock.skip(120);

        throttled('late');

        assert.deepStrictEqual(calls, ['leading', 'late'], 'the late call does not wait for the stale timer');
        await clock.advance(150);
        assert.deepStrictEqual(calls, ['leading', 'late'], 'the cancelled trailing edge never fires');
    });
});

describe('Timing.debounce rescheduling', () => {
    it('a call during the quiet window defers the fire and keeps the newest args', async () => {
        const calls = [];
        const [debounced] = Timing.debounce(60, (v) => calls.push(v));

        debounced('old');
        await clock.advance(30);
        debounced('new');
        await clock.advance(40);
        assert.deepEqual(calls, [], 'the window restarted: nothing fired yet');
        await clock.advance(40);

        assert.deepEqual(calls, ['new'], 'only the newest arguments fire, once');
    });
});

describe('Timing.debounce immediate', () => {
    it('fires at once on the leading edge, never on the trailing one', async () => {
        const calls = [];
        const [debounced] = Timing.debounce(50, (v) => calls.push(v), { immediate: true });

        debounced('first');
        assert.deepEqual(calls, ['first'], 'the leading edge fires immediately');

        debounced('second');
        await clock.advance(20);
        debounced('third');
        assert.deepEqual(calls, ['first'], 'calls inside the window do not re-fire');

        await clock.advance(90);
        assert.deepEqual(calls, ['first'], 'the immediate mode fires once per burst');
    });
});

describe('Timing.throttle modes', () => {
    it('without a leading edge, the first call only fires on the trailing one', async () => {
        const calls = [];
        const [throttled] = Timing.throttle(50, (v) => calls.push(v), { leading: false });

        throttled('first');
        assert.deepEqual(calls, [], 'the leading edge is suppressed');

        await clock.advance(90);
        assert.deepEqual(calls, ['first'], 'the trailing edge fires it');
    });

    it('without a trailing edge, calls inside the window are dropped', async () => {
        const calls = [];
        const [throttled] = Timing.throttle(60, (v) => calls.push(v), { trailing: false });

        throttled('leading');
        await clock.advance(20);
        throttled('dropped');
        assert.deepEqual(calls, ['leading']);

        await clock.advance(80);
        assert.deepEqual(calls, ['leading'], 'no trailing call was ever scheduled');
    });
});

describe('Timing.debounce re-entry', () => {
    it('a call made from inside the debounced function fires later with its own arguments', async () => {
        const calls = [];
        const [debounced] = Timing.debounce(20, (v) => {
            calls.push(String(v));
            if (v === 'first') {
                debounced('again');
            }
        });

        debounced('first');
        await clock.advance(100);

        assert.strictEqual(calls.join(','), 'first,again');
    });
});
