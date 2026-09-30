import { expect } from 'chai';
import { capture } from './capture-error-listener.mjs';
import '../../../src/client-errors/client-errors.mjs';
import { settle as drain } from '../harness.mjs';

/** the registered window 'error' handler, the same one the rejection route exercises */
const onError = capture();

describe('Client errors reporting: the error event route', () => {
    let calls;
    let scriptEl;
    const realFetch = window.fetch;

    beforeEach(() => {
        calls = [];
        window.fetch = (url, init) => {
            calls.push({ url, init });
            return Promise.reject(new Error('offline'));
        };
        scriptEl = document.createElement('script');
        scriptEl.setAttribute('data-report-client-errors-uri', '/report');
        document.head.appendChild(scriptEl);
    });

    afterEach(() => {
        scriptEl.remove();
        window.fetch = realFetch;
    });

    const settle = () => drain();

    it('reports the message, the location and the stack an error event carries', async () => {
        onError({
            message: 'boom',
            filename: 'https://cdn.example.org/app.mjs',
            lineno: 42,
            colno: 7,
            error: new Error('boom'),
        });
        await settle();

        expect(calls.length, 'one error event posts exactly one report').to.equal(1);
        const body = JSON.parse(calls[0].init.body);
        expect(body.message, 'the report carries the message of the error event').to.equal('boom');
        expect(body.filename, 'the report carries the file the error event names').to.equal(
            'https://cdn.example.org/app.mjs',
        );
        expect(body.line, 'the report carries the line number of the error event').to.equal(42);
        expect(body.col, 'the report carries the column number of the error event').to.equal(7);
        expect(body.stack, 'the report carries the stack of the error the event carries, split into lines')
            .to.be.an('array')
            .with.lengthOf.at.least(1);
    });

    it('falls back to the error message when the event carries none', async () => {
        onError({ error: new Error('only on the error') });
        await settle();

        expect(calls.length, 'one error event posts exactly one report').to.equal(1);
        const body = JSON.parse(calls[0].init.body);
        expect(body.message, 'without a message on the event the report takes the message of its error').to.equal(
            'only on the error',
        );
        expect(body.stack, 'the stack still comes from the error the event carries').to.be.an('array');
    });

    it('complains about the missing uri once, not once per failure', async () => {
        const errors = [];
        const originalError = console.error;
        console.error = (...args) => errors.push(args);
        scriptEl.remove();
        try {
            onError({ error: new Error('one') });
            onError({ error: new Error('two') });
            await settle();
        } finally {
            console.error = originalError;
        }

        expect(calls, 'nothing is reported without a uri').to.deep.equal([]);
        expect(errors.length, 'the configuration complaint is logged once').to.equal(1);
    });
});
