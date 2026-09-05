import { expect } from 'chai';
import '../../../src/client-errors/client-errors.mjs';

/**
 * The reporter listens on window 'error' too, but the test runner fails a test on any
 * window error event, synthetic ones included, so everything here goes through the
 * rejection route. Both events land in the same handler.
 */
describe('client errors reporting', () => {
    let originalFetch;
    let originalConsoleError;
    let calls;
    let rejections;
    let scriptEl;
    const onRejection = (e) => {
        rejections.push(e.reason);
        e.preventDefault();
    };
    const settle = async () => {
        for (let i = 0; i !== 20; ++i) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }
    };
    const reject = (reason) => {
        window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
            promise: Promise.resolve(),
            reason,
        }));
    };

    beforeEach(() => {
        calls = [];
        rejections = [];
        originalFetch = window.fetch;
        originalConsoleError = console.error;
        window.fetch = (url, init) => {
            calls.push({ url, init });
            return Promise.reject(new Error('offline'));
        };
        scriptEl = document.createElement('script');
        scriptEl.setAttribute('data-report-client-errors-uri', '/report');
        document.head.appendChild(scriptEl);
        window.addEventListener('unhandledrejection', onRejection);
    });

    afterEach(() => {
        window.fetch = originalFetch;
        console.error = originalConsoleError;
        window.removeEventListener('unhandledrejection', onRejection);
        scriptEl.remove();
    });

    it('posts the failure to the configured uri', async () => {
        reject(new Error('nope'));
        await settle();

        expect(calls.length).to.equal(1);
        expect(calls[0].url).to.equal('/report');
        const body = JSON.parse(calls[0].init.body);
        expect(body.message).to.equal('nope');
        expect(body.page).to.equal(window.location.href);
        expect(body.stack).to.be.an('array');
    });

    it('does not report the failure of its own report', async () => {
        reject(new Error('nope'));
        await settle();

        //the report itself fails with 'offline': swallowing that rejection keeps it
        //from re-entering the handler, only the dispatched one must show up
        expect(calls.length).to.equal(1);
        expect(rejections.map((r) => r.message)).to.deep.equal(['nope']);
    });

    it('does nothing when no reporting uri is configured', async () => {
        const errors = [];
        console.error = (...args) => errors.push(args);
        scriptEl.remove();

        reject(new Error('nope'));
        await settle();

        expect(calls).to.deep.equal([]);
        expect(errors.length).to.equal(1);
    });
});

describe('client errors reporting shapes', () => {
    let calls;
    let rejections;
    let scriptEl;
    const onRejection = (e) => {
        rejections.push(e.reason);
        e.preventDefault();
    };
    const settle = async () => {
        for (let i = 0; i !== 20; ++i) {
            await new Promise((resolve) => setTimeout(resolve, 5));
        }
    };
    const reject = (reason) => {
        window.dispatchEvent(
            new PromiseRejectionEvent('unhandledrejection', {
                promise: Promise.resolve(),
                reason,
            }),
        );
    };

    beforeEach(() => {
        calls = [];
        rejections = [];
        window.fetch = (url, init) => {
            calls.push({ url, init });
            return Promise.reject(new Error('offline'));
        };
        scriptEl = document.createElement('script');
        scriptEl.setAttribute('data-report-client-errors-uri', '/report');
        document.head.appendChild(scriptEl);
        window.addEventListener('unhandledrejection', onRejection);
    });
    afterEach(() => {
        scriptEl.remove();
        window.removeEventListener('unhandledrejection', onRejection);
    });

    it('reports a plain string rejection, without a message or a stack', async () => {
        reject('a plain failure');
        await settle();

        expect(calls.length).to.equal(1, 'the report is still posted');
        const body = JSON.parse(calls[0].init.body);
        expect(body).to.not.have.property('stack');
        expect(body).to.not.have.property('message', 'a string reason carries no message to extract');
    });

    it('sends the csrf header when the metas are present', async () => {
        const headerMeta = document.createElement('meta');
        headerMeta.setAttribute('name', '_csrf_header');
        headerMeta.setAttribute('content', 'X-CSRF-TOKEN');
        const tokenMeta = document.createElement('meta');
        tokenMeta.setAttribute('name', '_csrf');
        tokenMeta.setAttribute('content', 'token-123');
        document.head.append(headerMeta, tokenMeta);
        try {
            reject(new Error('nope'));
            await settle();

            expect(calls.length).to.equal(1);
            expect(calls[0].init.headers['X-CSRF-TOKEN']).to.equal('token-123');
        } finally {
            headerMeta.remove();
            tokenMeta.remove();
        }
    });

    it('swallows a fetch that throws synchronously, without re-entering', async () => {
        window.fetch = (url, init) => {
            calls.push({ url, init });
            throw new Error('fetch exploded');
        };

        reject(new Error('nope'));
        await settle();

        expect(calls.length).to.equal(1, 'the report was attempted');
        expect(rejections).to.have.lengthOf(1, 'the synchronous throw did not re-enter the handler');
    });
});
