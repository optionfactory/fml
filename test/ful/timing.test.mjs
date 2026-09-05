import { assert } from 'chai';
import { Timing } from '../../src/ful/index.mjs';

describe('Timing.debounce', () => {
    it('fires once after the quiet period', async () => {
        const calls = [];
        const [debounced] = Timing.debounce(20, (v) => calls.push(v));
        debounced('a');
        debounced('b');
        debounced('c');
        await Timing.sleep(100);
        assert.deepStrictEqual(calls, ['c']);
    });

    it('abort cancels the pending call', async () => {
        const calls = [];
        const [debounced, abort] = Timing.debounce(20, (v) => calls.push(v));
        debounced('a');
        abort();
        await Timing.sleep(100);
        assert.deepStrictEqual(calls, []);
    });

    it('keeps working after abort', async () => {
        const calls = [];
        const [debounced, abort] = Timing.debounce(20, (v) => calls.push(v));
        debounced('a');
        abort();
        await Timing.sleep(100);
        debounced('b');
        await Timing.sleep(100);
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
        await Timing.sleep(200);
        assert.deepStrictEqual(calls, ['a', 'b']);
    });

    it('keeps scheduling trailing calls after abort', async () => {
        const calls = [];
        const [throttled, abort] = Timing.throttle(50, (v) => calls.push(v));
        throttled('a');
        throttled('b');
        abort();
        await Timing.sleep(10);
        assert.deepStrictEqual(calls, ['a'], 'the aborted trailing call must not fire');

        throttled('c');
        await Timing.sleep(200);
        assert.deepStrictEqual(calls, ['a', 'c']);
    });

    it('a call past the window while the trailing edge is still pending fires at once, cancelling the stale one', async () => {
        const calls = [];
        const [throttled] = Timing.throttle(80, (v) => calls.push(v));
        throttled('leading');
        throttled('trailing');
        //block the main thread past the window: the pending timer cannot fire,
        //so the next call arrives late with the stale trailing edge still armed
        const until = performance.now() + 120;
        while (performance.now() < until) {
            //busy
        }

        throttled('late');

        assert.deepStrictEqual(calls, ['leading', 'late'], 'the late call does not wait for the stale timer');
        await Timing.sleep(150);
        assert.deepStrictEqual(calls, ['leading', 'late'], 'the cancelled trailing edge never fires');
    });
});

describe('Timing.debounce rescheduling', () => {
    it('a call during the quiet window defers the fire and keeps the newest args', async () => {
        const calls = [];
        const [debounced] = Timing.debounce(60, (v) => calls.push(v));

        debounced('old');
        await Timing.sleep(30);
        debounced('new');
        await Timing.sleep(40);
        assert.deepEqual(calls, [], 'the window restarted: nothing fired yet');
        await Timing.sleep(40);

        assert.deepEqual(calls, ['new'], 'only the newest arguments fire, once');
    });
});

describe('Timing.debounce immediate', () => {
    it('fires at once on the leading edge, never on the trailing one', async () => {
        const calls = [];
        const [debounced] = Timing.debounce(50, (v) => calls.push(v), Timing.DEBOUNCE_IMMEDIATE);

        debounced('first');
        assert.deepEqual(calls, ['first'], 'the leading edge fires immediately');

        debounced('second');
        await Timing.sleep(20);
        debounced('third');
        assert.deepEqual(calls, ['first'], 'calls inside the window do not re-fire');

        await Timing.sleep(90);
        assert.deepEqual(calls, ['first'], 'the immediate mode fires once per burst');
    });
});

describe('Timing.throttle modes', () => {
    it('without a leading edge, the first call only fires on the trailing one', async () => {
        const calls = [];
        const [throttled] = Timing.throttle(50, (v) => calls.push(v), Timing.THROTTLE_NO_LEADING);

        throttled('first');
        assert.deepEqual(calls, [], 'the leading edge is suppressed');

        await Timing.sleep(90);
        assert.deepEqual(calls, ['first'], 'the trailing edge fires it');
    });

    it('without a trailing edge, calls inside the window are dropped', async () => {
        const calls = [];
        const [throttled] = Timing.throttle(60, (v) => calls.push(v), Timing.THROTTLE_NO_TRAILING);

        throttled('leading');
        await Timing.sleep(20);
        throttled('dropped');
        assert.deepEqual(calls, ['leading']);

        await Timing.sleep(80);
        assert.deepEqual(calls, ['leading'], 'no trailing call was ever scheduled');
    });
});
