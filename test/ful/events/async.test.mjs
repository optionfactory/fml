import { assert, expect } from 'chai';
import { AsyncEvents } from '../../../src/ful/events/async.mjs';
import { attached } from '../../harness.mjs';

describe('AsyncEvents', () => {
    let el;

    beforeEach(() => {
        el = document.createElement('div');
        attached(el);
    });

    afterEach(() => {
        el.remove();
    });

    it('defaults to "broadcast" mode and resolves with an array of all listener values', async () => {
        AsyncEvents.asyncOn(el, 'test-async', async () => {
            return 'Task A Completed';
        });

        AsyncEvents.asyncOn(el, 'test-async', async () => {
            return new Promise((resolve) => setTimeout(() => resolve('Task B Completed'), 10));
        });

        const evt = new CustomEvent('test-async');

        const results = await AsyncEvents.fireAsync(el, evt);

        expect(results, 'broadcast mode, the default, resolves with an array').to.be.an('array');
        expect(
            results,
            'every answer is collected in the order the listeners ran, whatever the order they settle in',
        ).to.deep.equal(['Task A Completed', 'Task B Completed']);
    });

    it('intercepts a single return value when explicitly using "pipeline" mode', async () => {
        AsyncEvents.asyncOn(el, 'test-async-pipeline', async () => {
            return 'Pipeline Intercepted Value';
        });

        const evt = new CustomEvent('test-async-pipeline');

        const result = await AsyncEvents.fireAsync(el, evt, { mode: 'pipeline' });

        expect(result, 'pipeline mode resolves with the one listener answer itself, not an array').to.equal(
            'Pipeline Intercepted Value',
        );
    });

    it('answers an empty array when nothing listened', async () => {
        const evt = new CustomEvent('unhandled-async');

        const results = await AsyncEvents.fireAsync(el, evt);

        expect(results, 'broadcast mode resolves with an empty array when no listener ran').to.be.an('array').that.is
            .empty;
    });

    it('collects the answer of a listener on an ancestor', async () => {
        const child = document.createElement('span');
        el.appendChild(child);

        AsyncEvents.asyncOn(el, 'bubbling-async', async () => {
            return 'Bubbled Task';
        });

        const evt = new CustomEvent('bubbling-async', { bubbles: true });

        const results = await AsyncEvents.fireAsync(child, evt);

        expect(results, 'a bubbling event collects the answers of listeners on the ancestors').to.deep.equal([
            'Bubbled Task',
        ]);
    });
});
describe('AsyncEvents guarantees', () => {
    let el;
    beforeEach(() => {
        el = document.createElement('div');
        attached(el);
    });
    afterEach(() => {
        el.remove();
    });

    it('rejects when a listener fails, so the caller learns about it', async () => {
        AsyncEvents.asyncOn(el, 'save', async () => {
            throw new Error('disk full');
        });

        let caught = null;
        try {
            await AsyncEvents.fireAsync(el, new CustomEvent('save'));
        } catch (e) {
            caught = e;
        }

        assert.strictEqual(caught?.message, 'disk full', 'fireAsync rejects with what the failing listener threw');
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

        assert.include(
            caught?.message,
            `Event "save"`,
            'the error names the event whose pipeline reached more than one listener',
        );
        assert.include(caught?.message, 'pipeline', 'the error names the mode that was violated');
    });

    it('reports only the mode violation when a listener of the broken configuration fails', async () => {
        const rejections = [];
        const onRejection = (e) => {
            rejections.push(e.reason?.message ?? String(e.reason));
            e.preventDefault();
        };
        window.addEventListener('unhandledrejection', onRejection);
        AsyncEvents.asyncOn(el, 'save', async () => {
            throw new Error('listener-boom');
        });
        AsyncEvents.asyncOn(el, 'save', async () => 'fine');

        let caught = null;
        try {
            await AsyncEvents.fireAsync(el, new CustomEvent('save'), { mode: 'pipeline' });
        } catch (e) {
            caught = e;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));

        assert.include(caught?.message, 'pipeline', 'the caller sees the configuration error');
        assert.deepStrictEqual(rejections, [], 'the erroneously-run listener failure is not a page error');
        window.removeEventListener('unhandledrejection', onRejection);
    });

    it('accepts a pipeline with no listener at all, resolving undefined', async () => {
        const got = await AsyncEvents.fireAsync(el, new CustomEvent('save'), { mode: 'pipeline' });

        assert.isUndefined(got, 'pipeline mode allows zero listeners and resolves undefined when none ran');
    });

    it('requires exactly one listener in delegate mode', async () => {
        const none = await AsyncEvents.fireAsync(el, new CustomEvent('save'), { mode: 'delegate' }).then(
            () => null,
            (e) => e,
        );
        assert.include(none.message, 'requires exactly one', 'delegate mode rejects when no listener ran');

        AsyncEvents.asyncOn(el, 'save', async () => 'only');
        assert.strictEqual(
            await AsyncEvents.fireAsync(el, new CustomEvent('save'), { mode: 'delegate' }),
            'only',
            'delegate mode resolves with the answer of its one listener',
        );

        AsyncEvents.asyncOn(el, 'save', async () => 'second');
        const two = await AsyncEvents.fireAsync(el, new CustomEvent('save'), { mode: 'delegate' }).then(
            () => null,
            (e) => e,
        );
        assert.include(two.message, 'requires exactly one', 'delegate mode rejects when more than one listener ran');
    });

    it('stops calling a listener that has been removed', async () => {
        const calls = [];
        const listener = AsyncEvents.asyncOn(el, 'save', async () => {
            calls.push('kept');
        });
        AsyncEvents.asyncOff(el, 'save', listener);

        const got = await AsyncEvents.fireAsync(el, new CustomEvent('save'));

        assert.deepStrictEqual(calls, [], 'asyncOff removes the listener asyncOn returned, so it is not called');
        assert.deepStrictEqual(got, [], 'a removed listener contributes no answer');
    });

    it('gives a class the three methods, bound to the instance', async () => {
        class Widget extends HTMLElement {}
        AsyncEvents.mixInto(Widget);
        customElements.define('mixed-widget', Widget);
        const widget = document.createElement('mixed-widget');
        attached(widget);

        const listener = widget.asyncOn('save', async (e) => `saved ${e.detail}`);
        assert.deepStrictEqual(
            await widget.fireAsync(new CustomEvent('save', { detail: 'a' })),
            ['saved a'],
            'the mixed in asyncOn and fireAsync use the instance as the element',
        );

        widget.asyncOff('save', listener);
        assert.deepStrictEqual(
            await widget.fireAsync(new CustomEvent('save')),
            [],
            'the mixed in asyncOff removes the listener from the instance',
        );
        widget.remove();
    });
});
