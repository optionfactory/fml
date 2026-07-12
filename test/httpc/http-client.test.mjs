import { expect } from '@esm-bundle/chai';
import { HttpClient, HttpClientError, MediaType } from '../../src/httpc/http-client.mjs';

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