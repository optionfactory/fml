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
                headers: { 'Content-Type': 'application/json' },
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
            expect(
                media1.normalized,
                'the normalized form drops the charset parameter so a comparison is not defeated by it',
            ).to.equal('application/json');
            expect(media1.type, 'the type is the part before the slash').to.equal('application');
            expect(media1.subtype, 'the subtype is the part after the slash, without the parameters').to.equal('json');

            const media2 = MediaType.parse(null);
            expect(media2.normalized, 'a missing content type parses as unknown/unknown').to.equal('unknown/unknown');
        });

        it('reports a value without a type/subtype pair as unknown', () => {
            expect(
                MediaType.parse('text').normalized,
                'a value with no slash has no subtype and parses as unknown/unknown',
            ).to.equal('unknown/unknown');
            expect(
                MediaType.parse('text/').normalized,
                'a value with an empty subtype is malformed and parses as unknown/unknown',
            ).to.equal('unknown/unknown');
        });
    });

    describe('HttpClientError', () => {
        it('generates an error using .of()', () => {
            const err = HttpClientError.of('CONNECTION_PROBLEM', new Error('Network offline'));
            expect(err.name, 'the error names itself HttpClientError').to.equal('HttpClientError');
            expect(err.problems[0].type, 'of() builds one problem of the given type').to.equal('CONNECTION_PROBLEM');
            expect(err.problems[0].reason, 'the problem reason is the message of the Error cause').to.equal(
                'Network offline',
            );
        });

        it('wraps a non-Error cause without crashing nor losing it', () => {
            const stringy = HttpClientError.of('CONNECTION_PROBLEM', 'boom');
            expect(stringy.problems[0].reason, 'a string cause becomes the problem reason as it is').to.equal('boom');
            expect(stringy.message, 'the error message is the same reason as the problem').to.equal('boom');

            const nothing = HttpClientError.of('CONNECTION_PROBLEM', undefined);
            expect(
                nothing.problems[0].reason,
                'an undefined cause falls back to a fixed reason instead of the text undefined',
            ).to.equal('unknown failure');
        });

        it('drops a prefix from every problem context', () => {
            const err = new HttpClientError('msg', 400, [{ type: 'A', context: 'user.name', reason: 'bad' }]);
            const dropped = err.dropping('user.');
            expect(dropped.problems[0].context, 'dropping removes the prefix from the problem context').to.equal(
                'name',
            );
        });

        it('parses standard text error responses', async () => {
            const res = new Response('Plain text error', { status: 500, statusText: 'Server Error' });
            const err = await HttpClientError.fromResponse(res);
            expect(err.message, 'a plain text body becomes the message after the status and status text').to.equal(
                '500 Server Error: Plain text error',
            );
            expect(err.problems[0].type, 'a body of any other media type becomes one generic problem').to.equal(
                'GENERIC_PROBLEM',
            );
        });

        it('parses application/failures+json', async () => {
            const payload = [{ type: 'AUTH', reason: 'Expired' }];
            const res = new Response(JSON.stringify(payload), {
                status: 401,
                headers: { 'Content-Type': 'application/failures+json' },
            });
            const err = await HttpClientError.fromResponse(res);
            expect(err.status, 'the served status is kept').to.equal(401);
            expect(err.problems, 'a failures+json body is the problems list as it is').to.deep.equal(payload);
        });

        it('reports a failures+json body that does not decode as a generic problem, keeping the status', async () => {
            const res = new Response('not json{', {
                status: 500,
                statusText: 'Server Error',
                headers: { 'Content-Type': 'application/failures+json' },
            });
            const err = await HttpClientError.fromResponse(res);
            expect(err.status, 'the served status is kept when the body does not decode').to.equal(500);
            expect(err.problems[0].type, 'an undecodable failures+json body becomes one generic problem').to.equal(
                'GENERIC_PROBLEM',
            );
            expect(err.message, 'the message names the media type and says the body does not decode as json').to.equal(
                '500 Server Error: the application/failures+json body does not decode as json',
            );
        });

        it('reports a problem+json body that does not decode as a generic problem, keeping the status', async () => {
            const res = new Response('<html>proxy error page</html>', {
                status: 502,
                statusText: 'Bad Gateway',
                headers: { 'Content-Type': 'application/problem+json' },
            });
            const err = await HttpClientError.fromResponse(res);
            expect(err.status, 'the served status is kept when the body does not decode').to.equal(502);
            expect(err.problems[0].type, 'an undecodable problem+json body becomes one generic problem').to.equal(
                'GENERIC_PROBLEM',
            );
            expect(err.message, 'the message names the media type and says the body does not decode as json').to.equal(
                '502 Bad Gateway: the application/problem+json body does not decode as json',
            );
        });

        it('reports a failures+json body that is not an array as a generic problem, keeping it droppable', async () => {
            const res = new Response(JSON.stringify({ oops: true }), {
                status: 400,
                statusText: 'Bad Request',
                headers: { 'Content-Type': 'application/failures+json' },
            });
            const err = await HttpClientError.fromResponse(res);
            expect(err.status, 'the served status is kept when the body has the wrong shape').to.equal(400);
            expect(Array.isArray(err.problems), 'problems stays an array so callers can iterate it').to.be.true;
            expect(
                err.problems[0].type,
                'a failures+json body that is not an array becomes one generic problem',
            ).to.equal('GENERIC_PROBLEM');
            expect(
                err.dropping('x.').problems,
                'dropping still works on the synthesized problem list',
            ).to.have.lengthOf(1);
            expect(err.message, 'the message says the body does not decode as a failures array').to.equal(
                '400 Bad Request: the application/failures+json body does not decode as a failures array',
            );
        });

        it('reports a problem+json body that is not an object', async () => {
            const res = new Response('"oops"', {
                status: 400,
                statusText: 'Bad Request',
                headers: { 'Content-Type': 'application/problem+json' },
            });
            const err = await HttpClientError.fromResponse(res);
            expect(err.status, 'the served status is kept when the body has the wrong shape').to.equal(400);
            expect(Array.isArray(err.problems), 'problems stays an array so callers can iterate it').to.be.true;
            expect(err.message, 'the message says the body does not decode as a problem object').to.equal(
                '400 Bad Request: the application/problem+json body does not decode as a problem object',
            );
        });

        it('keeps the served status when the body cannot be read', async () => {
            const res = {
                status: 503,
                statusText: 'Service Unavailable',
                headers: new Headers({ 'Content-Type': 'text/html' }),
                text: () => Promise.reject(new Error('cut')),
            };
            const err = await HttpClientError.fromResponse(res);
            expect(err.status, 'the served status is kept when reading the body fails').to.equal(503);
            expect(err.problems[0].type, 'an unreadable body becomes one generic problem').to.equal('GENERIC_PROBLEM');
            expect(err.message, 'the message says the body could not be read').to.equal(
                '503 Service Unavailable: the body could not be read',
            );
        });
    });

    describe('HttpClient & HttpRequestBuilder', () => {
        let client;

        beforeEach(() => {
            client = HttpClient.builder().build();
        });

        it('sends the method each verb names', async () => {
            await client.get('/test').fetch();
            expect(fetchArgs.init.method, 'get() sends a GET').to.equal('GET');

            await client.post('/test').fetch();
            expect(fetchArgs.init.method, 'post() sends a POST').to.equal('POST');

            await client.put('/test').fetch();
            expect(fetchArgs.init.method, 'put() sends a PUT').to.equal('PUT');

            await client.patch('/test').fetch();
            expect(fetchArgs.init.method, 'patch() sends a PATCH').to.equal('PATCH');

            await client.delete('/test').fetch();
            expect(fetchArgs.init.method, 'delete() sends a DELETE').to.equal('DELETE');

            await client.head('/test').fetch();
            expect(fetchArgs.init.method, 'head() sends a HEAD').to.equal('HEAD');

            await client.request('OPTIONS', '/test').fetch();
            expect(fetchArgs.init.method, 'request() sends the method it is given').to.equal('OPTIONS');
        });

        it('splits the query at the first ? only', async () => {
            await client.get('/search?query=a?b').param('p', '1').fetch();
            expect(
                `${fetchArgs.url.pathname}${fetchArgs.url.search}`,
                'a later ? belongs to the first parameter value and is encoded, and added params follow the uri query',
            ).to.equal('/search?query=a%3Fb&p=1');
        });

        it('keeps the parameters out of the fragment', async () => {
            await client.get('/a#frag').param('p', '1').fetch();
            expect(
                `${fetchArgs.url.pathname}${fetchArgs.url.search}${fetchArgs.url.hash}`,
                'the query goes before the fragment kept from the uri',
            ).to.equal('/a?p=1#frag');
        });

        it('sends the headers and params left after a null removes one, through the singular and plural forms', async () => {
            await client
                .get('/test')
                .headers({ 'X-Keep': '1', 'X-Remove': '2', 'X-Plural': '3' })
                .header('X-Remove', null)
                .headers({ 'X-Plural': null, 'X-Undefined': undefined })
                .param('p1', 'v1', 'v2')
                .param('p2', 'v3')
                .param('p2', null)
                .params({ p3: 'v4' })
                .params({ p3: null })
                .fetch();

            expect(
                fetchArgs.url.toString(),
                'a param called with several values sends each as a repeated entry',
            ).to.include('?p1=v1&p1=v2');
            expect(fetchArgs.url.toString(), 'a param set to null is removed from the query').to.not.include('p2');
            expect(fetchArgs.url.toString(), 'a null value in params() removes the parameter').to.not.include('p3');

            const reqHeaders = new Headers(fetchArgs.init.headers);
            expect(reqHeaders.get('X-Keep'), 'a header with a value is sent').to.equal('1');
            expect(reqHeaders.has('X-Remove'), 'header() with null removes a header set before').to.be.false;
            expect(reqHeaders.has('X-Plural'), 'a null value in headers() removes a header set before').to.be.false;
            expect(reqHeaders.has('X-Undefined'), 'an undefined value in headers() sets no header').to.be.false;
        });

        it('overrides a param or a header already set, and keeps every value of a single param call', async () => {
            await client
                .get('/test')
                .param('page', '1')
                .param('page', '2')
                .param('k', 'a', 'b')
                .header('X-One', 'first')
                .header('X-One', 'second')
                .fetch();

            const url = new URL(fetchArgs.url.toString());
            expect(
                url.searchParams.getAll('page'),
                'a second param call for the same name replaces the first',
            ).to.deep.equal(['2']);
            expect(url.searchParams.getAll('k'), 'one param call keeps all its values in order').to.deep.equal([
                'a',
                'b',
            ]);
            expect(
                new Headers(fetchArgs.init.headers).get('X-One'),
                'a second header call for the same name replaces the first',
            ).to.equal('second');
        });

        it('skips nullish entries among real values, in any position', async () => {
            await client
                .get('/test')
                .param('leading', null, 'v1')
                .param('trailing', 'v1', null)
                .param('only', null)
                .fetch();

            const url = new URL(fetchArgs.url.toString());
            expect(url.searchParams.getAll('leading'), 'a leading null does not discard the rest').to.deep.equal([
                'v1',
            ]);
            expect(url.searchParams.getAll('trailing'), 'a trailing null is skipped, not stringified').to.deep.equal([
                'v1',
            ]);
            expect(url.searchParams.has('only'), 'a param given only null values is not sent at all').to.be.false;
        });

        it('sends no content-type nor body for an undefined json body', async () => {
            await client.post('/test').json(undefined).fetch();

            expect(
                new Headers(fetchArgs.init.headers).get('Content-Type'),
                'an undefined json body sets no content type',
            ).to.be.null;
            expect(fetchArgs.init.body, 'an undefined json body leaves the body unset').to.be.undefined;
        });

        it('turns a non-Error interceptor throw into a failure', async () => {
            const throwing = HttpClient.builder()
                .withInterceptors({
                    intercept: async () => {
                        throw undefined;
                    },
                })
                .build();

            try {
                await throwing.get('/test').fetch();
                expect.fail('the fetch must reject');
            } catch (e) {
                expect(e, 'whatever an interceptor throws reaches the caller as a Failure').to.be.instanceOf(Failure);
                expect(
                    e.problems[0].type,
                    'a throw that is not already a Failure is labelled as an unexpected problem',
                ).to.equal('UNEXPECTED_PROBLEM');
                expect(
                    e.problems[0].reason,
                    'a thrown undefined carries a fixed reason instead of the text undefined',
                ).to.equal('unknown failure');
            }
        });

        it('tells a bug in the chain apart from the connection failing', async () => {
            const buggy = HttpClient.builder()
                .withInterceptors({
                    intercept: async () => {
                        /** @type any */ (undefined).boom();
                    },
                })
                .build();

            try {
                await buggy.get('/test').fetch();
                expect.fail('the fetch must reject');
            } catch (e) {
                expect(
                    e.problems[0].type,
                    'an error thrown inside the chain is an unexpected problem, not a connection problem',
                ).to.equal('UNEXPECTED_PROBLEM');
                expect(e.cause, 'the original error is kept as the cause so the bug can be traced').to.be.instanceOf(
                    TypeError,
                );
            }
        });

        it('accepts the other headers and params initializer shapes', async () => {
            await client
                .get('/test?q=0')
                .headers([['X-Pair', 'a']])
                .headers(new Headers({ 'X-Instance': 'b' }))
                .params([['p1', 'v1']])
                .params(new URLSearchParams('p2=v2'))
                .params('p3=v3&p4=v4')
                .fetch();

            const url = fetchArgs.url.toString();
            expect(url, 'the query already in the uri is kept').to.include('q=0');
            expect(url, 'params() accepts an array of pairs').to.include('p1=v1');
            expect(url, 'params() accepts a URLSearchParams').to.include('p2=v2');
            expect(url, 'params() accepts a query string').to.include('p3=v3');
            expect(url, 'every pair of a query string initializer is sent').to.include('p4=v4');

            const reqHeaders = new Headers(fetchArgs.init.headers);
            expect(reqHeaders.get('X-Pair'), 'headers() accepts an array of pairs').to.equal('a');
            expect(reqHeaders.get('X-Instance'), 'headers() accepts a Headers instance').to.equal('b');
        });

        it('serializes JSON bodies automatically', async () => {
            await client.post('/test').json({ a: 1 }).fetch();

            const reqHeaders = new Headers(fetchArgs.init.headers);
            expect(reqHeaders.get('Content-Type'), 'json() sets the application/json content type').to.equal(
                'application/json',
            );
            expect(fetchArgs.init.body, 'json() serializes the value with JSON.stringify').to.equal('{"a":1}');
        });

        it('builds a multipart body from fields, json, a blob and a blob list', async () => {
            await client
                .post('/test')
                .multipart((form) => {
                    form.field('user', 'john');
                    form.json('meta', { age: 30 });
                    form.blob('file', new Blob(['data']), 'data.txt');
                    form.blobs('files', [new Blob(['a']), new Blob(['b'])]);
                })
                .fetch();

            expect(fetchArgs.init.body, 'a multipart body is sent as a FormData').to.be.instanceOf(FormData);
            const formData = fetchArgs.init.body;
            expect(formData.get('user'), 'field() appends a text value').to.equal('john');
            expect(
                formData.get('meta'),
                'json() appends the value as a blob so it carries the application/json type',
            ).to.be.instanceOf(Blob);
        });

        it('reads a body as json, as text and as a blob', async () => {
            globalThis.fetch = async () =>
                new Response('{"a": 1}', { headers: { 'Content-Type': 'application/json' } });
            const json = await client.get('/test').fetchJson();
            expect(json.a, 'fetchJson() parses the body as json').to.equal(1);

            globalThis.fetch = async () => new Response('plain text');
            const text = await client.get('/test').fetchText();
            expect(text, 'fetchText() yields the body as text').to.equal('plain text');

            globalThis.fetch = async () => new Response(new Blob(['blob data']));
            const blob = await client.get('/test').fetchBlob();
            expect(blob, 'fetchBlob() yields the body as a Blob').to.be.instanceOf(Blob);

            globalThis.fetch = async () => new Response(new ArrayBuffer(8));
            const buffer = await client.get('/test').fetchArrayBuffer();
            expect(buffer, 'fetchArrayBuffer() yields the body as an ArrayBuffer').to.be.instanceOf(ArrayBuffer);
        });

        it('throws an error on unmarshaling failure', async () => {
            globalThis.fetch = async () =>
                new Response('{ bad json', { headers: { 'Content-Type': 'application/json' } });
            try {
                await client.get('/test').fetchJson();
                expect.fail('Should have thrown UNMARSHALING_PROBLEM');
            } catch (err) {
                expect(
                    err.problems[0].type,
                    'a body that does not parse as json is labelled as an unmarshaling problem',
                ).to.equal('UNMARSHALING_PROBLEM');
            }
        });

        it('yields null for a 204 without decoding a body it does not have', async () => {
            globalThis.fetch = async () => new Response(null, { status: 204 });
            expect(
                await client.get('/test').fetchJson(),
                'a 204 has no content, so fetchJson() yields null without reading the body',
            ).to.be.null;
        });

        it('still reports an empty body on any other status as an unmarshaling failure', async () => {
            globalThis.fetch = async () =>
                new Response('', { status: 200, headers: { 'Content-Type': 'application/json' } });
            try {
                await client.get('/test').fetchJson();
                expect.fail('Should have thrown UNMARSHALING_PROBLEM');
            } catch (err) {
                expect(
                    err.problems[0].type,
                    'only a 204 is exempt, an empty body with a 200 is an unmarshaling problem',
                ).to.equal('UNMARSHALING_PROBLEM');
            }
        });

        it('throws a connection error if fetch completely fails', async () => {
            globalThis.fetch = async () => {
                throw new TypeError('Failed to fetch');
            };
            try {
                await client.get('/test').fetch();
                expect.fail('Should have thrown CONNECTION_PROBLEM');
            } catch (err) {
                expect(err.problems[0].type, 'a fetch rejection is labelled as a connection problem').to.equal(
                    'CONNECTION_PROBLEM',
                );
            }
        });

        it('labels the connection failing the same way through exchange', async () => {
            globalThis.fetch = async () => {
                throw new TypeError('Failed to fetch');
            };
            try {
                await client.exchange('/test');
                expect.fail('the exchange must reject');
            } catch (err) {
                expect(err, 'exchange() rejects with a Failure when the transport fails').to.be.instanceOf(Failure);
                expect(err.problems[0].type, 'exchange() uses the same connection problem label as fetch()').to.equal(
                    'CONNECTION_PROBLEM',
                );
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
            expect(
                reqHeaders.get('X-CSRF-TOKEN'),
                'the header named by the _csrf_header meta carries the _csrf token',
            ).to.equal('secret-token');

            metaHeader.remove();
            metaToken.remove();
        });

        it('reads the metas at request time, honoring a pair landed after the client was built', async () => {
            const client = HttpClient.builder().withCsrfToken().build();
            await client.get('/test').fetch();
            expect(
                new Headers(fetchArgs.init.headers).get('X-CSRF-TOKEN'),
                'no header is sent while the page has no csrf metas',
            ).to.be.null;

            const metaHeader = document.createElement('meta');
            metaHeader.name = '_csrf_header';
            metaHeader.content = 'X-CSRF-TOKEN';
            document.head.appendChild(metaHeader);
            const metaToken = document.createElement('meta');
            metaToken.name = '_csrf';
            metaToken.content = 'late-token';
            document.head.appendChild(metaToken);

            try {
                await client.get('/test').fetch();
                expect(
                    new Headers(fetchArgs.init.headers).get('X-CSRF-TOKEN'),
                    'the metas are read per request, so a pair added after the client was built is sent',
                ).to.equal('late-token');
            } finally {
                metaHeader.remove();
                metaToken.remove();
            }
        });

        it('carries the token to the page origin only', async () => {
            const metaHeader = document.createElement('meta');
            metaHeader.name = '_csrf_header';
            metaHeader.content = 'X-CSRF-TOKEN';
            document.head.appendChild(metaHeader);
            const metaToken = document.createElement('meta');
            metaToken.name = '_csrf';
            metaToken.content = 'secret-token';
            document.head.appendChild(metaToken);

            const client = HttpClient.builder().withCsrfToken().build();
            try {
                await client.get(`${location.origin}/same`).fetch();
                expect(
                    new Headers(fetchArgs.init.headers).get('X-CSRF-TOKEN'),
                    'the token is sent to the page origin',
                ).to.equal('secret-token');

                await client.get('https://third-party.example/api').fetch();
                expect(
                    new Headers(fetchArgs.init.headers).get('X-CSRF-TOKEN'),
                    'the token is not sent to another origin, so it cannot leak to a third party',
                ).to.be.null;
            } finally {
                metaHeader.remove();
                metaToken.remove();
            }
        });

        it('carries a bare exchange with no options, still injecting the header', async () => {
            const metaHeader = document.createElement('meta');
            metaHeader.name = '_csrf_header';
            metaHeader.content = 'X-CSRF-TOKEN';
            document.head.appendChild(metaHeader);

            const metaToken = document.createElement('meta');
            metaToken.name = '_csrf';
            metaToken.content = 'secret-token';
            document.head.appendChild(metaToken);

            const client = HttpClient.builder().withCsrfToken().build();
            const response = await client.exchange('/test');

            expect(response.status, 'a bare exchange resolves with the response').to.equal(200);
            const reqHeaders = new Headers(fetchArgs.init.headers);
            expect(
                reqHeaders.get('X-CSRF-TOKEN'),
                'the csrf interceptor also runs for an exchange given no options',
            ).to.equal('secret-token');

            metaHeader.remove();
            metaToken.remove();
        });

        it('normalizes plain object headers of a bare exchange through the same contract', async () => {
            const client = HttpClient.builder().build();
            await client.exchange('/test', { headers: { 'X-Custom': 'value' }, method: 'POST' });

            const reqHeaders = new Headers(fetchArgs.init.headers);
            expect(
                reqHeaders.get('X-Custom'),
                'plain object headers of an exchange are normalized into Headers that interceptors can use',
            ).to.equal('value');
            expect(fetchArgs.init.method, 'the options given to exchange are passed to fetch').to.equal('POST');
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
        expect(err.message, 'without embedded problems the message is made of the title and the detail').to.equal(
            '400 Bad Request: Bad input name is blank',
        );
        expect(err.problems, 'one problem is synthesized when the payload carries none').to.have.lengthOf(1);
        expect(err.problems[0].type, 'the synthesized problem is generic').to.equal('GENERIC_PROBLEM');
    });

    it('carries the embedded problems when the payload has them', async () => {
        const problems = [{ type: 'VALIDATION', context: 'name', reason: 'blank' }];
        const res = new Response(JSON.stringify({ title: 'T', detail: 'D', problems }), {
            status: 422,
            headers: { 'Content-Type': 'application/problem+json' },
        });
        const err = await HttpClientError.fromResponse(res);
        expect(err.status, 'the served status is kept').to.equal(422);
        expect(err.problems, 'the embedded problems are carried as they are').to.deep.equal(problems);
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

        expect(fetchArgs.init.cache, 'options() merges its entries into the fetch init').to.equal('no-store');
        expect(fetchArgs.init.credentials, 'option() sets one entry of the fetch init').to.equal('include');
        expect(fetchArgs.init.redirect, 'a later option() call adds to the options set before').to.equal('follow');
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

        expect(order, 'interceptor() and interceptors() run in the order they were added').to.deep.equal([
            'one',
            'two',
        ]);
    });

    it('exchange resolves the raw response without throwing on error statuses', async () => {
        globalThis.fetch = async () => new Response('nope', { status: 500, headers: { 'Content-Type': 'text/plain' } });

        const response = await client.request('GET', '/raw').exchange();
        expect(response.status, 'exchange() yields the response instead of rejecting on an error status').to.equal(500);
    });

    it('tolerates a null params initializer, contributing no query string', async () => {
        await client.request('GET', '/no-params').params(null).fetchJson();

        expect(String(fetchArgs.url), 'a null params initializer adds nothing, so the url has no query').to.not.include(
            '?',
        );
    });

    it('carries a raw body without inventing a content type', async () => {
        await client.post('/b').body('raw payload').fetchJson();

        expect(fetchArgs.init.body, 'body() sends the value as it is').to.equal('raw payload');
        expect(
            new Headers(fetchArgs.init.headers).has('Content-Type'),
            'body() sets no content type, leaving it to fetch',
        ).to.be.false;
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
            expect(err, 'a status outside 200-299 rejects with an HttpClientError').to.be.instanceOf(HttpClientError);
            expect(err.status, 'the error keeps the served status').to.equal(422);
            expect(err.problems, 'the error carries the problems of the failures+json body').to.deep.equal(problems);
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
            expect(err, 'the very same instance travels to the caller').to.equal(failure);
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

        expect(seen, 'an interceptor added to the builder runs for every request of the client').to.deep.equal([
            '/one',
            '/two',
        ]);
    });
});

describe('RedirectOnUnauthorizedInterceptor', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        if (window.location.hash) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    });

    it('redirects and leaves the request pending forever on a 401', async () => {
        globalThis.fetch = async () => new Response('unauthenticated', { status: 401 });
        const client = HttpClient.builder().withRedirectOnUnauthorized('#/relogin').build();

        const outcome = await Promise.race([
            client
                .get('/protected')
                .exchange()
                .then(
                    () => 'settled',
                    () => 'settled',
                ),
            new Promise((resolve) => setTimeout(() => resolve('still pending'), 80)),
        ]);

        expect(outcome, 'a redirect must never resolve nor reject').to.equal('still pending');
        expect(window.location.hash, 'a 401 navigates to the configured login url').to.equal('#/relogin');
    });

    it('passes any other status through untouched', async () => {
        globalThis.fetch = async () => new Response('fine', { status: 202 });
        const client = HttpClient.builder().withRedirectOnUnauthorized('#/relogin').build();

        const response = await client.get('/protected').exchange();

        expect(response.status, 'a status other than 401 is returned as it is').to.equal(202);
        expect(window.location.hash, 'a status other than 401 does not navigate').to.equal('');
    });
});
