import { assert, expect } from 'chai';
import { AsyncEvents } from '../../../src/ful/events/async.mjs';

describe('AsyncEvents', () => {
    let el;

    beforeEach(() => {
        el = document.createElement('div');
        document.body.appendChild(el);
    });

    afterEach(() => {
        el.remove();
    });

    it('defaults to "broadcast" mode and resolves with an array of all listener values', async () => {
        AsyncEvents.asyncOn(el, 'test-async', async () => {
            return 'Task A Completed';
        });
        
        AsyncEvents.asyncOn(el, 'test-async', async () => {
            return new Promise(resolve => setTimeout(() => resolve('Task B Completed'), 10));
        });

        const evt = new CustomEvent('test-async');
        
        const results = await AsyncEvents.fireAsync(el, evt);
        
        expect(results).to.be.an('array');
        expect(results).to.deep.equal(['Task A Completed', 'Task B Completed']);
    });

    it('intercepts a single return value when explicitly using "pipeline" mode', async () => {
        AsyncEvents.asyncOn(el, 'test-async-pipeline', async () => {
            return 'Pipeline Intercepted Value';
        });

        const evt = new CustomEvent('test-async-pipeline');
        
        const result = await AsyncEvents.fireAsync(el, evt, { mode: 'pipeline' });
        
        expect(result).to.equal('Pipeline Intercepted Value');
    });

    it('handles events with no async listeners gracefully', async () => {
        const evt = new CustomEvent('unhandled-async');
        
        const results = await AsyncEvents.fireAsync(el, evt);
        
        expect(results).to.be.an('array').that.is.empty;
    });

    it('bubbles asynchronous events up the DOM tree correctly', async () => {
        const child = document.createElement('span');
        el.appendChild(child);

        AsyncEvents.asyncOn(el, 'bubbling-async', async () => {
            return 'Bubbled Task';
        });

        const evt = new CustomEvent('bubbling-async', { bubbles: true });
        
        const results = await AsyncEvents.fireAsync(child, evt);
        
        expect(results).to.deep.equal(['Bubbled Task']);
    });
});
describe('AsyncEvents guarantees', () => {
    let el;
    beforeEach(() => {
        el = document.createElement('div');
        document.body.appendChild(el);
    });
    afterEach(() => {
        el.remove();
    });

    it('rejects when a listener fails, so the caller learns about it', async () => {
        AsyncEvents.asyncOn(el, 'save', async () => { throw new Error('disk full'); });

        let caught = null;
        try {
            await AsyncEvents.fireAsync(el, new CustomEvent('save'));
        } catch (e) {
            caught = e;
        }

        assert.strictEqual(caught?.message, 'disk full');
    });

    it('refuses a pipeline with more than one listener, naming the event', async () => {
        AsyncEvents.asyncOn(el, 'save', async () => 'first');
        AsyncEvents.asyncOn(el, 'save', async () => 'second');

        let caught = null;
        try {
            await AsyncEvents.fireAsync(el, new CustomEvent('save'), { mode: 'pipeline' });
        } catch (e) {
            caught = e;
        }

        assert.include(caught?.message, `Event "save"`);
        assert.include(caught?.message, 'pipeline');
    });

    it('accepts a pipeline with no listener at all, resolving undefined', async () => {
        const got = await AsyncEvents.fireAsync(el, new CustomEvent('save'), { mode: 'pipeline' });

        assert.isUndefined(got);
    });

    it('requires exactly one listener in delegate mode', async () => {
        const none = await AsyncEvents.fireAsync(el, new CustomEvent('save'), { mode: 'delegate' })
            .then(() => null, (e) => e);
        assert.include(none.message, 'requires exactly one');

        AsyncEvents.asyncOn(el, 'save', async () => 'only');
        assert.strictEqual(await AsyncEvents.fireAsync(el, new CustomEvent('save'), { mode: 'delegate' }), 'only');

        AsyncEvents.asyncOn(el, 'save', async () => 'second');
        const two = await AsyncEvents.fireAsync(el, new CustomEvent('save'), { mode: 'delegate' })
            .then(() => null, (e) => e);
        assert.include(two.message, 'requires exactly one');
    });

    it('stops calling a listener that has been removed', async () => {
        const calls = [];
        const listener = AsyncEvents.asyncOn(el, 'save', async () => { calls.push('kept'); });
        AsyncEvents.asyncOff(el, 'save', listener);

        const got = await AsyncEvents.fireAsync(el, new CustomEvent('save'));

        assert.deepStrictEqual(calls, []);
        assert.deepStrictEqual(got, []);
    });

    it('gives a class the three methods, bound to the instance', async () => {
        class Widget extends HTMLElement { }
        AsyncEvents.mixInto(Widget);
        customElements.define('mixed-widget', Widget);
        const widget = document.createElement('mixed-widget');
        document.body.appendChild(widget);

        const listener = widget.asyncOn('save', async (e) => `saved ${e.detail}`);
        assert.deepStrictEqual(await widget.fireAsync(new CustomEvent('save', { detail: 'a' })), ['saved a']);

        widget.asyncOff('save', listener);
        assert.deepStrictEqual(await widget.fireAsync(new CustomEvent('save')), []);
        widget.remove();
    });
});
