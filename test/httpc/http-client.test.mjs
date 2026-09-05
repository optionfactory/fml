import { expect } from 'chai';
import { HttpClient, HttpClientError, MediaType } from '../../src/httpc/http-client.mjs';
import { Failure } from '../../src/httpc/failure.mjs';

describe('httpc client', () => {
    let originalFetch;
    let fetchArgs;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
        globalThis.fetch = async (url, init) => {
            fetchArgs = { url, init };
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        };
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        fetchArgs = null;
    });

    describe('MediaType', () => {
        it('parses correctly with or without parameters', () => {
            const media1 = MediaType.parse('application/json; charset=utf-8');
            expect(media1.normalized).to.equal('application/json');
            expect(media1.type).to.equal('application');
            expect(media1.subtype).to.equal('json');

            const media2 = MediaType.parse(null);
            expect(media2.normalized).to.equal('unknown/unknown');
        });
    });

    describe('HttpClientError', () => {
        it('generates an error using .of()', () => {
            const err = HttpClientError.of('CONNECTION_PROBLEM', new Error('Network offline'));
            expect(err.name).to.equal('HttpClientError');
            expect(err.problems[0].type).to.equal('CONNECTION_PROBLEM');
            expect(err.problems[0].reason).to.equal('Network offline');
        });

        it('drops context prefixes correctly', () => {
            const err = new HttpClientError('msg', 400, [{ type: 'A', context: 'user.name', reason: 'bad' }]);
            const dropped = err.dropping('user.');
            expect(dropped.problems[0].context).to.equal('name');
        });

        it('parses standard text error responses', async () => {
            const res = new Response('Plain text error', { status: 500, statusText: 'Server Error' });
            const err = await HttpClientError.fromResponse(res);
            expect(err.message).to.equal('500 Server Error: Plain text error');
            expect(err.problems[0].type).to.equal('GENERIC_PROBLEM');
        });

        it('parses application/failures+json', async () => {
            const payload = [{ type: 'AUTH', reason: 'Expired' }];
            const res = new Response(JSON.stringify(payload), {
                status: 401,
                headers: { 'Content-Type': 'application/failures+json' }
            });
            const err = await HttpClientError.fromResponse(res);
            expect(err.status).to.equal(401);
            expect(err.problems).to.deep.equal(payload);
        });
    });

    describe('HttpClient & HttpRequestBuilder', () => {
        let client;

        beforeEach(() => {
            client = HttpClient.builder().build();
        });

        it('supports all standard HTTP methods', async () => {
            await client.get('/test').fetch();
            expect(fetchArgs.init.method).to.equal('GET');

            await client.post('/test').fetch();
            expect(fetchArgs.init.method).to.equal('POST');

            await client.put('/test').fetch();
            expect(fetchArgs.init.method).to.equal('PUT');

            await client.patch('/test').fetch();
            expect(fetchArgs.init.method).to.equal('PATCH');

            await client.delete('/test').fetch();
            expect(fetchArgs.init.method).to.equal('DELETE');

            await client.head('/test').fetch();
            expect(fetchArgs.init.method).to.equal('HEAD');

            await client.request('OPTIONS', '/test').fetch();
            expect(fetchArgs.init.method).to.equal('OPTIONS');
        });

        it('handles headers and params additions and removals', async () => {
            await client.get('/test')
                .headers({ 'X-Keep': '1', 'X-Remove': '2' })
                .header('X-Remove', null)
                .param('p1', 'v1', 'v2')
                .param('p2', 'v3')
                .param('p2', null) 
                .fetch();

            expect(fetchArgs.url.toString()).to.include('?p1=v1&p1=v2');
            expect(fetchArgs.url.toString()).to.not.include('p2');
            
            const reqHeaders = new Headers(fetchArgs.init.headers);
            expect(reqHeaders.get('X-Keep')).to.equal('1');
            expect(reqHeaders.has('X-Remove')).to.be.false;
        });

        it('overrides a param already set, and keeps every value of a single call', async () => {
            await client.get('/test')
                .param('page', '1')
                .param('page', '2')
                .param('k', 'a', 'b')
                .fetch();

            const url = new URL(fetchArgs.url.toString());
            expect(url.searchParams.getAll('page')).to.deep.equal(['2']);
            expect(url.searchParams.getAll('k')).to.deep.equal(['a', 'b']);
        });

        it('removes headers and params set to null through the plural forms', async () => {
            await client.get('/test')
                .headers({ 'X-Keep': '1', 'X-Remove': '2' })
                .headers({ 'X-Remove': null, 'X-Undefined': undefined })
                .params({ p1: 'v1', p2: 'v2' })
                .params({ p2: null })
                .fetch();

            expect(fetchArgs.url.toString()).to.include('p1=v1');
            expect(fetchArgs.url.toString()).to.not.include('p2');

            const reqHeaders = new Headers(fetchArgs.init.headers);
            expect(reqHeaders.get('X-Keep')).to.equal('1');
            expect(reqHeaders.has('X-Remove')).to.be.false;
            expect(reqHeaders.has('X-Undefined')).to.be.false;
        });

        it('accepts the other headers and params initializer shapes', async () => {
            await client.get('/test?q=0')
                .headers([['X-Pair', 'a']])
                .headers(new Headers({ 'X-Instance': 'b' }))
                .params([['p1', 'v1']])
                .params(new URLSearchParams('p2=v2'))
                .params('p3=v3')
                .fetch();

            const url = fetchArgs.url.toString();
            expect(url).to.include('q=0');
            expect(url).to.include('p1=v1');
            expect(url).to.include('p2=v2');
            expect(url).to.include('p3=v3');

            const reqHeaders = new Headers(fetchArgs.init.headers);
            expect(reqHeaders.get('X-Pair')).to.equal('a');
            expect(reqHeaders.get('X-Instance')).to.equal('b');
        });

        it('serializes JSON bodies automatically', async () => {
            await client.post('/test').json({ a: 1 }).fetch();
            
            const reqHeaders = new Headers(fetchArgs.init.headers);
            expect(reqHeaders.get('Content-Type')).to.equal('application/json');
            expect(fetchArgs.init.body).to.equal('{"a":1}');
        });

        it('builds multipart forms correctly', async () => {
            await client.post('/test').multipart(form => {
                form.field('user', 'john');
                form.json('meta', { age: 30 });
                form.blob('file', new Blob(['data']), 'data.txt');
                form.blobs('files', [new Blob(['a']), new Blob(['b'])]);
            }).fetch();

            expect(fetchArgs.init.body).to.be.instanceOf(FormData);
            const formData = fetchArgs.init.body;
            expect(formData.get('user')).to.equal('john');
            expect(formData.get('meta')).to.be.instanceOf(Blob);
        });

        it('supports unmarshaling variations', async () => {
            // Setup global fetch to return specific data types for testing
            globalThis.fetch = async () => new Response('{"a": 1}', { headers: { 'Content-Type': 'application/json' }});
            const json = await client.get('/test').fetchJson();
            expect(json.a).to.equal(1);

            globalThis.fetch = async () => new Response('plain text');
            const text = await client.get('/test').fetchText();
            expect(text).to.equal('plain text');

            globalThis.fetch = async () => new Response(new Blob(['blob data']));
            const blob = await client.get('/test').fetchBlob();
            expect(blob).to.be.instanceOf(Blob);

            globalThis.fetch = async () => new Response(new ArrayBuffer(8));
            const buffer = await client.get('/test').fetchArrayBuffer();
            expect(buffer).to.be.instanceOf(ArrayBuffer);
        });

        it('throws an error on unmarshaling failure', async () => {
            globalThis.fetch = async () => new Response('{ bad json', { headers: { 'Content-Type': 'application/json' }});
            try {
                await client.get('/test').fetchJson();
                expect.fail('Should have thrown UNMARSHALING_PROBLEM');
            } catch (err) {
                expect(err.problems[0].type).to.equal('UNMARSHALING_PROBLEM');
            }
        });

        it('throws a connection error if fetch completely fails', async () => {
            globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
            try {
                await client.get('/test').fetch();
                expect.fail('Should have thrown CONNECTION_PROBLEM');
            } catch (err) {
                expect(err.problems[0].type).to.equal('CONNECTION_PROBLEM');
            }
        });
    });

    describe('CsrfTokenInterceptor', () => {
        it('reads CSRF meta tags and injects the header', async () => {
            const metaHeader = document.createElement('meta');
            metaHeader.name = '_csrf_header';
            metaHeader.content = 'X-CSRF-TOKEN';
            document.head.appendChild(metaHeader);

            const metaToken = document.createElement('meta');
            metaToken.name = '_csrf';
            metaToken.content = 'secret-token';
            document.head.appendChild(metaToken);

            const client = HttpClient.builder().withCsrfToken().build();
            await client.get('/test').fetch();

            const reqHeaders = new Headers(fetchArgs.init.headers);
            expect(reqHeaders.get('X-CSRF-TOKEN')).to.equal('secret-token');

            metaHeader.remove();
            metaToken.remove();
        });
    });
});
describe('HttpClientError problem+json', () => {
    it('synthesizes a generic problem when the payload carries none', async () => {
        const res = new Response(JSON.stringify({ title: 'Bad input', detail: 'name is blank' }), {
            status: 400,
            statusText: 'Bad Request',
            headers: { 'Content-Type': 'application/problem+json' },
        });
        const err = await HttpClientError.fromResponse(res);
        expect(err.message).to.equal('400 Bad Request: Bad input name is blank');
        expect(err.problems).to.have.lengthOf(1);
        expect(err.problems[0].type).to.equal('GENERIC_PROBLEM');
    });

    it('carries the embedded problems when the payload has them', async () => {
        const problems = [{ type: 'VALIDATION', context: 'name', reason: 'blank' }];
        const res = new Response(JSON.stringify({ title: 'T', detail: 'D', problems }), {
            status: 422,
            headers: { 'Content-Type': 'application/problem+json' },
        });
        const err = await HttpClientError.fromResponse(res);
        expect(err.status).to.equal(422);
        expect(err.problems).to.deep.equal(problems);
    });
});

describe('HttpRequestBuilder request-level configuration', () => {
    let client;
    let originalFetch;
    let fetchArgs;
    beforeEach(() => {
        client = HttpClient.builder().build();
        originalFetch = globalThis.fetch;
        globalThis.fetch = async (url, init) => {
            fetchArgs = { url, init };
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        };
    });
    afterEach(() => {
        globalThis.fetch = originalFetch;
        fetchArgs = null;
    });

    it('merges options, options(kvs) and option(k, v) into the fetch init', async () => {
        await client
            .request('GET', '/opts')
            .options({ cache: 'no-store' })
            .option('credentials', 'include')
            .option('redirect', 'follow')
            .fetchJson();

        expect(fetchArgs.init.cache).to.equal('no-store');
        expect(fetchArgs.init.credentials).to.equal('include');
        expect(fetchArgs.init.redirect).to.equal('follow');
    });

    it('runs request-level interceptors in registration order', async () => {
        const order = [];
        await client
            .request('GET', '/i')
            .interceptor({
                intercept: async (url, request, chain) => {
                    order.push('one');
                    return await chain.proceed(url, request);
                },
            })
            .interceptors([
                {
                    intercept: async (url, request, chain) => {
                        order.push('two');
                        return await chain.proceed(url, request);
                    },
                },
            ])
            .fetchJson();

        expect(order).to.deep.equal(['one', 'two']);
    });

    it('exchange resolves the raw response without throwing on error statuses', async () => {
        globalThis.fetch = async () =>
            new Response('nope', { status: 500, headers: { 'Content-Type': 'text/plain' } });

        const response = await client.request('GET', '/raw').exchange();
        expect(response.status).to.equal(500);
    });

    it('accepts a query string as the params initializer', async () => {
        await client.request('GET', '/q').params('a=1&b=2').fetchJson();
        expect(String(fetchArgs.url)).to.include('a=1');
        expect(String(fetchArgs.url)).to.include('b=2');
    });

    it('tolerates a null params initializer, contributing no query string', async () => {
        await client.request('GET', '/no-params').params(null).fetchJson();

        expect(String(fetchArgs.url)).to.not.include('?');
    });

    it('sets a single header, overriding a previous value for the same key', async () => {
        await client.request('GET', '/h').header('X-One', 'first').header('X-One', 'second').fetchJson();

        const reqHeaders = new Headers(fetchArgs.init.headers);
        expect(reqHeaders.get('X-One')).to.equal('second');
    });

    it('carries a raw body without inventing a content type', async () => {
        await client.post('/b').body('raw payload').fetchJson();

        expect(fetchArgs.init.body).to.equal('raw payload');
        expect(new Headers(fetchArgs.init.headers).has('Content-Type')).to.be.false;
    });

    it('throws the response as an HttpClientError when the status is not ok', async () => {
        const problems = [{ type: 'VALIDATION', context: 'name', reason: 'blank', details: null }];
        globalThis.fetch = async () =>
            new Response(JSON.stringify(problems), {
                status: 422,
                statusText: 'Unprocessable Entity',
                headers: { 'Content-Type': 'application/failures+json' },
            });

        try {
            await client.post('/v').json({ name: '' }).fetch();
            expect.fail('Should have thrown the response failures');
        } catch (err) {
            expect(err).to.be.instanceOf(HttpClientError);
            expect(err.status).to.equal(422);
            expect(err.problems).to.deep.equal(problems);
        }
    });

    it('rethrows a Failure raised by an interceptor untouched, instead of wrapping it', async () => {
        const failure = new Failure('interceptor says no', [
            { type: 'SHORT_CIRCUIT', context: null, reason: 'no', details: null },
        ]);
        const client = HttpClient.builder()
            .withInterceptors({
                intercept: async () => {
                    throw failure;
                },
            })
            .build();

        try {
            await client.get('/blocked').fetch();
            expect.fail('Should have thrown the interceptor Failure');
        } catch (err) {
            expect(err).to.equal(failure, 'the very same instance travels to the caller');
        }
    });

    it('runs builder level interceptors on every request of the built client', async () => {
        const seen = [];
        const traced = HttpClient.builder()
            .withInterceptors({
                intercept: async (url, request, chain) => {
                    seen.push(url.pathname);
                    return await chain.proceed(url, request);
                },
            })
            .build();

        await traced.get('/one').fetchJson();
        await traced.get('/two').fetchJson();

        expect(seen).to.deep.equal(['/one', '/two']);
    });
});

describe('RedirectOnUnauthorizedInterceptor', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        //the redirect lands on a fragment: drop it without touching the history
        if (window.location.hash) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    });

    it('redirects and leaves the request pending forever on a 401', async () => {
        globalThis.fetch = async () => new Response('unauthenticated', { status: 401 });
        const client = HttpClient.builder().withRedirectOnUnauthorized('#/relogin').build();

        const outcome = await Promise.race([
            client.get('/protected').exchange().then(
                () => 'settled',
                () => 'settled',
            ),
            new Promise((resolve) => setTimeout(() => resolve('still pending'), 80)),
        ]);

        expect(outcome).to.equal('still pending', 'a redirect must never resolve nor reject');
        expect(window.location.hash).to.equal('#/relogin');
    });

    it('passes any other status through untouched', async () => {
        globalThis.fetch = async () => new Response('fine', { status: 202 });
        const client = HttpClient.builder().withRedirectOnUnauthorized('#/relogin').build();

        const response = await client.get('/protected').exchange();

        expect(response.status).to.equal(202);
        expect(window.location.hash).to.equal('');
    });
});
