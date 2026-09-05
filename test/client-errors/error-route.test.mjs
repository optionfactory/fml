import { expect } from 'chai';
import { capture } from './capture-error-listener.mjs';
import '../../../src/client-errors/client-errors.mjs';

/** the registered window 'error' handler, the same one the rejection route exercises */
const onError = capture();

describe('client errors reporting: the error event route', () => {
    let calls;
    let scriptEl;

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
    });

    const settle = async () => {
        for (let i = 0; i !== 20; ++i) {
            await new Promise((resolve) => setTimeout(resolve, 5));
        }
    };

    it('reports the message, the location and the stack an error event carries', async () => {
        onError({
            message: 'boom',
            filename: 'https://cdn.example.org/app.mjs',
            lineno: 42,
            colno: 7,
            error: new Error('boom'),
        });
        await settle();

        expect(calls.length).to.equal(1);
        const body = JSON.parse(calls[0].init.body);
        expect(body.message).to.equal('boom');
        expect(body.filename).to.equal('https://cdn.example.org/app.mjs');
        expect(body.line).to.equal(42);
        expect(body.col).to.equal(7);
        expect(body.stack).to.be.an('array').with.lengthOf.at.least(1);
    });

    it('falls back to the error message when the event carries none', async () => {
        onError({ error: new Error('only on the error') });
        await settle();

        expect(calls.length).to.equal(1);
        const body = JSON.parse(calls[0].init.body);
        expect(body.message).to.equal('only on the error');
        expect(body.stack).to.be.an('array');
    });
});
