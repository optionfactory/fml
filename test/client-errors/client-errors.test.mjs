import { expect } from 'chai';
import '../../../src/client-errors/client-errors.mjs';
import { settle as drain } from '../harness.mjs';

/**
 * The reporter listens on window 'error' too, but the test runner fails a test on any
 * window error event, synthetic ones included, so everything here goes through the
 * rejection route. Both events land in the same handler.
 */
describe('Client errors reporting', () => {
    let originalFetch;
    let originalConsoleError;
    let calls;
    let rejections;
    let scriptEl;
    const onRejection = (e) => {
        rejections.push(e.reason);
        e.preventDefault();
    };
    const settle = () => drain();
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

        expect(calls.length, 'one unhandled rejection posts exactly one report').to.equal(1);
        expect(
            calls[0].url,
            'the report goes to the uri named by the data-report-client-errors-uri script attribute',
        ).to.equal('/report');
        const body = JSON.parse(calls[0].init.body);
        expect(body.message, 'the report carries the error message').to.equal('nope');
        expect(body.page, 'the report carries the url of the page that failed').to.equal(window.location.href);
        expect(body.stack, 'the report carries the error stack split into lines').to.be.an('array');
    });

    it('reports the cause chain, which neither the message nor the stack carries', async () => {
        const root = new Error('Method missing "boom"');
        const inner = new Error('Error evaluating data-tpl-if="self.boom()" in `<li>`', { cause: root });
        const outer = new Error('Error evaluating data-tpl-each="rows" in `<ul>`', { cause: inner });
        reject(outer);
        await settle();

        const body = JSON.parse(calls[0].init.body);
        expect(
            body.message.split('\n'),
            'each cause is appended as a Caused by line, since neither the message nor the stack carries it',
        ).to.deep.equal([
            'Error evaluating data-tpl-each="rows" in `<ul>`',
            'Caused by: Error evaluating data-tpl-if="self.boom()" in `<li>`',
            'Caused by: Method missing "boom"',
        ]);
    });

    it('stops the walk at a cause that says nothing', async () => {
        const mute = new Error('');
        /** @type any */ (mute).cause = new Error('the one nobody will read');
        const outer = new Error('the frame that surfaced', { cause: mute });
        reject(outer);
        await settle();

        const body = JSON.parse(calls[0].init.body);
        expect(body.message, 'the message stops at a cause with no message').to.equal('the frame that surfaced');
        expect(body.message, 'no Caused by line is added for a cause with no message').to.not.contain('Caused by:');
        expect(body.message, 'a cause behind one with no message is not reached').to.not.contain(
            'the one nobody will read',
        );
    });

    it('says so when a chain dropped its outer frames', async () => {
        const truncated = new Error('Error evaluating data-tpl-if="x" in `<li>`');
        /** @type any */ (truncated).truncated = true;
        reject(truncated);
        await settle();

        const body = JSON.parse(calls[0].init.body);
        expect(body.message, 'a truncated chain ends with a line saying the outer frames were omitted').to.contain(
            'outer frames omitted',
        );
    });

    it('stops at a cause cycle instead of looping', async () => {
        const a = new Error('a');
        const b = new Error('b', { cause: a });
        /** @type any */ (a).cause = b;
        reject(b);
        await settle();

        const body = JSON.parse(calls[0].init.body);
        expect(
            body.message.split('\n').length,
            'a cause cycle stops the walk, leaving at most the message and five Caused by lines',
        ).to.be.at.most(6);
    });

    it('does not report the failure of its own report', async () => {
        reject(new Error('nope'));
        await settle();

        expect(calls.length, 'the rejected report fetch is not reported again').to.equal(1);
        expect(
            rejections.map((r) => r.message),
            'the rejection of the report fetch never reaches the page as an unhandled rejection',
        ).to.deep.equal(['nope']);
    });

    it('does nothing when no reporting uri is configured', async () => {
        const errors = [];
        console.error = (...args) => errors.push(args);
        scriptEl.remove();

        reject(new Error('nope'));
        await settle();

        expect(calls, 'nothing is posted without a reporting uri').to.deep.equal([]);
        expect(errors.length, 'the missing uri is logged to the console').to.equal(1);
    });
});

describe('Client errors reporting shapes', () => {
    let calls;
    let rejections;
    let scriptEl;
    const onRejection = (e) => {
        rejections.push(e.reason);
        e.preventDefault();
    };
    const settle = () => drain();
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

        expect(calls.length, 'the report is still posted').to.equal(1);
        const body = JSON.parse(calls[0].init.body);
        expect(body, 'a string reason has no stack to split').to.not.have.property('stack');
        expect(body, 'a string reason has no message to extract').to.not.have.property('message');
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

            expect(calls.length, 'one unhandled rejection posts exactly one report').to.equal(1);
            expect(
                calls[0].init.headers['X-CSRF-TOKEN'],
                'the header named by the _csrf_header meta carries the _csrf token',
            ).to.equal('token-123');
        } finally {
            headerMeta.remove();
            tokenMeta.remove();
        }
    });

    it('sends no csrf header when only half the meta pair is present', async () => {
        const headerMeta = document.createElement('meta');
        headerMeta.setAttribute('name', '_csrf_header');
        headerMeta.setAttribute('content', 'X-CSRF-TOKEN');
        document.head.appendChild(headerMeta);
        try {
            reject(new Error('nope'));
            await settle();

            expect(calls.length, 'the report is still posted without the csrf pair').to.equal(1);
            expect(
                calls[0].init.headers['X-CSRF-TOKEN'],
                'the csrf header is sent only when both metas are present',
            ).to.equal(undefined);
        } finally {
            headerMeta.remove();
        }
    });

    it('swallows a fetch that throws synchronously, without re-entering', async () => {
        window.fetch = (url, init) => {
            calls.push({ url, init });
            throw new Error('fetch exploded');
        };

        reject(new Error('nope'));
        await settle();

        expect(calls.length, 'the report was attempted').to.equal(1);
        expect(rejections, 'the synchronous throw did not re-enter the handler').to.have.lengthOf(1);
    });
});
