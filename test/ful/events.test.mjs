import { expect } from '@esm-bundle/chai';
import { AsyncEvents } from '../../src/ful/events/async.mjs';

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