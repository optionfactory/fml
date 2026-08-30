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
});
