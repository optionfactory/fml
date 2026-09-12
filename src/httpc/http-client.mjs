import { Failure } from './failure.mjs';

class MediaType {
    #type;
    #subtype;
    constructor(type, subtype) {
        this.#type = type;
        this.#subtype = subtype;
    }
    get normalized() {
        return `${this.#type}/${this.#subtype}`;
    }
    get type() {
        return this.#type;
    }
    get subtype() {
        return this.#subtype;
    }
    /**
     * Parses a Content-Type header value into its type/subtype pair, dropping any parameter.
     * @param {string|null|undefined} v
     * @returns
     */
    static parse(v) {
        if (!v) {
            return new MediaType('unknown', 'unknown');
        }
        const [prefix, _] = v.split(';');
        const [ptype, psubtype] = prefix.trim().toLowerCase().split('/');
        if (!ptype || !psubtype) {
            return new MediaType('unknown', 'unknown');
        }
        return new MediaType(ptype, psubtype);
    }
}

/**
 * @typedef {Int8Array| Uint8Array| Uint8ClampedArray| Int16Array| Uint16Array| Int32Array| Uint32Array| Float32Array| Float64Array| BigInt64Array| BigUint64Array} TypedArray
 */
/**
 * @typedef {object} HttpInterceptor
 * @property {(url: URL, init: RequestInit|undefined, chain: HttpInterceptorChain) => Promise<Response>} intercept
 */

class HttpClientError extends Failure {
    /**
     * @param {string} message
     * @param {number} status
     * @param {{ type: string; context: string?; reason: string; details: any?; }[]} problems
     * @param {Error|undefined} [cause]
     */
    constructor(message, status, problems, cause) {
        super(message, problems, cause);
        this.name = 'HttpClientError';
        this.status = status;
    }
    /**
     * Returns a copy whose problems' contexts have the prefix removed, keeping
     * this error's status.
     * @param {string} prefix
     * @returns {HttpClientError}
     */
    dropping(prefix) {
        return new HttpClientError(this.message, this.status, Failure.dropProblemsContext(this.problems, prefix), this);
    }
    /**
     * One problem of the client's own making: the four the client mints are the
     * same shape, and the server's arrive already shaped from the wire.
     * @param {string} type
     * @param {string} reason
     */
    static problem(type, reason) {
        return { type, context: null, reason, details: null };
    }
    /**
     * Creates a client failure carrying no status, wrapping the cause and its message.
     * @param {string} type
     * @param {any} cause
     * @returns
     */
    static of(type, cause) {
        const reason = String(cause?.message ?? cause ?? 'unknown failure');
        return new HttpClientError(reason, 0, [HttpClientError.problem(type, reason)], cause);
    }
    /**
     * Creates an HttpClientError from a Response.
     * @param {Response} response
     * @returns an HttpClientError
     */
    static async fromResponse(response) {
        switch (MediaType.parse(response.headers.get('Content-Type')).normalized) {
            case 'application/failures+json': {
                const data = await response.json().catch(() => HttpClientError.#unreadable);
                if (data === HttpClientError.#unreadable) {
                    return HttpClientError.#undecodable(response);
                }
                if (!Array.isArray(data)) {
                    return HttpClientError.#undecodable(response, 'as a failures array');
                }
                const message = `${response.status} ${response.statusText}: ${data.length} failures`;
                return new HttpClientError(message, response.status, data);
            }
            case 'application/problem+json': {
                const data = await response.json().catch(() => HttpClientError.#unreadable);
                if (data === HttpClientError.#unreadable) {
                    return HttpClientError.#undecodable(response);
                }
                if (typeof data !== 'object' || data === null || Array.isArray(data)) {
                    return HttpClientError.#undecodable(response, 'as a problem object');
                }
                const message = `${response.status} ${response.statusText}: ${data.title} ${data.detail}`;
                return new HttpClientError(
                    message,
                    response.status,
                    data.problems || [HttpClientError.problem('GENERIC_PROBLEM', message)],
                );
            }
            default: {
                return HttpClientError.#generic(response);
            }
        }
    }
    /** marks a body whose json() rejected, telling it apart from a body decoding to json null */
    static #unreadable = Symbol('unreadable body');
    /**
     * A json body that failed to decode, or that decoded to something other than
     * the declared contract, has consumed its stream: there is no text left to
     * embed, the status, the declared media type and the shape are the report.
     * @param {Response} response
     * @param {string} [as] - what the body does not decode as
     */
    static #undecodable(response, as = 'as json') {
        const mediaType = MediaType.parse(response.headers.get('Content-Type')).normalized;
        const message = `${response.status} ${response.statusText}: the ${mediaType} body does not decode ${as}`;
        return new HttpClientError(message, response.status, [HttpClientError.problem('GENERIC_PROBLEM', message)]);
    }
    static async #generic(response) {
        //a body that cannot be read (the connection cut mid-body) must not
        //masquerade as a connection problem: the response was served, its
        //status is the report
        const text = await response.text().catch(() => null);
        const message =
            text === null
                ? `${response.status} ${response.statusText}: the body could not be read`
                : `${response.status} ${response.statusText}: ${text}`;
        return new HttpClientError(message, response.status, [HttpClientError.problem('GENERIC_PROBLEM', message)]);
    }
}

const metaContent = (name) =>
    globalThis.document?.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? undefined;

/**
 * @implements {HttpInterceptor}
 */
class CsrfTokenInterceptor {
    async intercept(url, request, chain) {
        //the token is the page's own: it travels to the page's origin only, and it
        //is read at request time, so metas landed after the client was built (a
        //login flow) are honored without a rebuild
        if (url.origin !== (globalThis.window?.location?.origin ?? url.origin)) {
            return await chain.proceed(url, request);
        }
        const csrfHeader = metaContent('_csrf_header');
        const csrfToken = metaContent('_csrf');
        if (csrfHeader && csrfToken) {
            request.headers.set(csrfHeader, csrfToken);
        }
        return await chain.proceed(url, request);
    }
}
/**
 * @implements {HttpInterceptor}
 */
class RedirectOnUnauthorizedInterceptor {
    #redirectUri;
    /**
     * @param {string} redirectUri
     */
    constructor(redirectUri) {
        this.#redirectUri = redirectUri;
    }
    async intercept(url, request, chain) {
        const response = await chain.proceed(url, request);
        if (response.status === 401) {
            window.location.href = this.#redirectUri;
            //the page is navigating away: a promise that never settles keeps the
            //callers' spinners up instead of flashing a failure nobody will read.
            //Where the navigation is blocked (a beforeunload gate), they stay
            //pending until the page actually leaves
            return new Promise(() => {});
        }
        return response;
    }
}

class HttpClientBuilder {
    /**
     * @type {HttpInterceptor[]}
     */
    #interceptors;
    constructor() {
        this.#interceptors = [];
    }
    withCsrfToken() {
        this.#interceptors.push(new CsrfTokenInterceptor());
        return this;
    }
    withRedirectOnUnauthorized(redirectUri) {
        this.#interceptors.push(new RedirectOnUnauthorizedInterceptor(redirectUri));
        return this;
    }
    /**
     * @param {...HttpInterceptor} interceptors
     */
    withInterceptors(...interceptors) {
        this.#interceptors.push(...interceptors);
        return this;
    }
    build() {
        return new HttpClient(this.#interceptors);
    }
}

/**
 * @implements {HttpInterceptor}
 */
class HttpCall {
    async intercept(url, request, chain) {
        try {
            return await fetch(url, request);
        } catch (ex) {
            //the one place a connection problem is a connection problem: the
            //transport itself refused to deliver. Everything above this is code,
            //and code that throws has a different story to tell
            throw HttpClientError.of('CONNECTION_PROBLEM', ex);
        }
    }
}

class HttpInterceptorChain {
    #interceptors;
    #current;
    /**
     *
     * @param {HttpInterceptor[]} interceptors
     * @param {number} current
     */
    constructor(interceptors, current) {
        this.#interceptors = interceptors;
        this.#current = current;
    }
    /**
     *
     * @param {URL} url
     * @param {RequestInit} request
     * @returns {Promise<Response>} the response
     */
    async proceed(url, request) {
        const interceptor = this.#interceptors[this.#current];
        return await interceptor.intercept(
            url,
            request,
            new HttpInterceptorChain(this.#interceptors, this.#current + 1),
        );
    }
}

class HttpClient {
    #interceptors;
    /**
     * Creates a builder for an HttpClient.
     * @returns {HttpClientBuilder} the client builder
     */
    static builder() {
        return new HttpClientBuilder();
    }
    /**
     * Creates an HttpClient.
     * @param {HttpInterceptor[]|undefined} interceptors - a list of interceptors to be registered for every request performed by the created client.
     */
    constructor(interceptors) {
        this.#interceptors = interceptors || [];
    }
    /**
     * Performs an HTTP exchange.
     * @async
     * @param {string} uri - the (possibly relative) request url
     * @param {RequestInit|undefined} options - fetch options
     * @param {HttpInterceptor[]|undefined} interceptors - the HttpInterceptors to be registered for this exchange.
     * @returns {Promise<Response>} the response
     */
    async exchange(uri, options, interceptors) {
        const is = [...this.#interceptors, ...(interceptors || []), new HttpCall()];
        const chain = new HttpInterceptorChain(is, 0);
        const url = new URL(new Request(uri).url);
        const request = { ...options, headers: new Headers(options?.headers) };
        return await chain.proceed(url, request);
    }
    /**
     * Creates a request builder.
     * @param {string} method - the HTTP method to be used
     * @param {string} uri - the (possibly relative) request url
     * @returns {HttpRequestBuilder} the request builder
     */
    request(method, uri) {
        return HttpRequestBuilder.create(this, method, uri);
    }
    /**
     * Creates a request builder.
     * @param {string} uri - the (possibly relative) request url
     * @returns {HttpRequestBuilder} the request builder
     */
    get(uri) {
        return HttpRequestBuilder.create(this, 'GET', uri);
    }
    /**
     * Creates a request builder.
     * @param {string} uri - the (possibly relative) request url
     * @returns {HttpRequestBuilder} the request builder
     */
    head(uri) {
        return HttpRequestBuilder.create(this, 'HEAD', uri);
    }
    /**
     * Creates a request builder.
     * @param {string} uri - the (possibly relative) request url
     * @returns {HttpRequestBuilder} the request builder
     */
    post(uri) {
        return HttpRequestBuilder.create(this, 'POST', uri);
    }
    /**
     * Creates a request builder.
     * @param {string} uri - the (possibly relative) request url
     * @returns {HttpRequestBuilder} the request builder
     */
    put(uri) {
        return HttpRequestBuilder.create(this, 'PUT', uri);
    }
    /**
     * Creates a request builder.
     * @param {string} uri - the (possibly relative) request url
     * @returns {HttpRequestBuilder} the request builder
     */
    patch(uri) {
        return HttpRequestBuilder.create(this, 'PATCH', uri);
    }
    /**
     * Creates a request builder.
     * @param {string} uri - the (possibly relative) request url
     * @returns {HttpRequestBuilder} the request builder
     */
    delete(uri) {
        return HttpRequestBuilder.create(this, 'DELETE', uri);
    }
}

/**
 * Reads the response body as the given type, wrapping a failed read as an UNMARSHALING_PROBLEM.
 * @param {Response} response
 * @param {'text'|'json'|'blob'|'arrayBuffer'} type
 * @returns
 */
const unmarshal = async (response, type) => {
    try {
        return await response[type]();
    } catch (ex) {
        throw HttpClientError.of('UNMARSHALING_PROBLEM', ex);
    }
};

/**
 * Yields the entries of a headers or params initializer preserving nullish values:
 * normalizing through `Headers`/`URLSearchParams` first would stringify them to
 * "null"/"undefined" instead of removing the key.
 * @param {any} source
 * @returns {Iterable<[string, any]>}
 */
const rawEntries = (source) => {
    if (source == null) {
        return [];
    }
    if (typeof source === 'string') {
        return new URLSearchParams(source);
    }
    if (typeof source[Symbol.iterator] === 'function') {
        return source;
    }
    return Object.entries(source);
};

class HttpRequestBuilder {
    #client;
    #method;
    #uri;
    #params;
    #headers;
    #body;
    #options;
    #interceptors;
    #fragment;
    /**
     * Creates an HttpRequestBuilder.
     * @param {HttpClient} client
     * @param {string} method - the HTTP method to be used
     * @param {string} uri - the (possibly relative) request url
     * @returns {HttpRequestBuilder} the builder
     */
    static create(client, method, uri) {
        //'/a#frag?p=1' parses as hash '#frag?p=1' with an empty query, and a '?'
        //may appear in a query itself: only the first of each splits
        const hashIndex = uri.indexOf('#');
        const fragment = hashIndex === -1 ? '' : uri.slice(hashIndex);
        const withoutFragment = hashIndex === -1 ? uri : uri.slice(0, hashIndex);
        const queryIndex = withoutFragment.indexOf('?');
        return new HttpRequestBuilder(
            client,
            method,
            queryIndex === -1 ? withoutFragment : withoutFragment.slice(0, queryIndex),
            new URLSearchParams(queryIndex === -1 ? '' : withoutFragment.slice(queryIndex + 1)),
            new Headers(),
            undefined,
            {},
            [],
            fragment,
        );
    }
    /**
     * Creates an HttpRequestBuilder.
     * @param {HttpClient} client
     * @param {string} method - the HTTP method to be used
     * @param {string} uri - the (possibly relative) request url
     * @param {URLSearchParams} params
     * @param {Headers} headers
     * @param {any} body
     * @param {Omit<RequestInit,"headers"|"method"|"body">} options
     * @param {HttpInterceptor[]} interceptors
     * @param {string} [fragment]
     */
    constructor(client, method, uri, params, headers, body, options, interceptors, fragment = '') {
        this.#client = client;
        this.#method = method;
        this.#uri = uri;
        this.#params = params;
        this.#body = body;
        this.#headers = headers;
        this.#options = options;
        this.#interceptors = interceptors;
        this.#fragment = fragment;
    }
    /**
     * Add all passed headers to the request, overriding existing ones if that key already exists. Null and undefined values cause the key to be removed.
     * @param {HeadersInit|Record<string,string|null|undefined>} hs
     * @returns {HttpRequestBuilder} this builder
     */
    headers(hs) {
        for (const [k, v] of rawEntries(hs)) {
            if (v == null) {
                this.#headers.delete(k);
            } else {
                this.#headers.set(k, v);
            }
        }
        return this;
    }
    /**
     * Adds an header to the request, overriding it if it already exists. Null and undefined values cause the key to be removed
     * @param {string} k
     * @param {string} v
     * @returns {HttpRequestBuilder} this builder
     */
    header(k, v) {
        if (v == null) {
            this.#headers.delete(k);
        } else {
            this.#headers.set(k, v);
        }
        return this;
    }
    /**
     * Add all query parameters to the request, overriding existing ones if that key already exists. Null and undefined values cause the key to be removed
     * @param {URLSearchParams|Record<string,string|null|undefined>|string[][]|string} ps
     * @returns {HttpRequestBuilder} this builder
     */
    params(ps) {
        for (const [k, v] of rawEntries(ps)) {
            if (v == null) {
                this.#params.delete(k);
            } else {
                this.#params.set(k, v);
            }
        }
        return this;
    }
    /**
     * Adds a query parameter to the request, overriding it if it already exists. An empty list, or one carrying only null and undefined values, causes the key to be removed; nullish entries among real values are skipped.
     * @param {string} k
     * @param {...string} vs
     * @returns {HttpRequestBuilder} this builder
     */
    param(k, ...vs) {
        //overriding, as header, headers and params all do: pass every value in one
        //call to get a multi valued parameter
        this.#params.delete(k);
        const values = vs.filter((v) => v != null);
        if (values.length === 0) {
            return this;
        }
        for (const v of values) {
            this.#params.append(k, v);
        }
        return this;
    }
    /**
     * Sets the request body.
     * `Content-Type: multipart/form-data` header is automatically added by fetch when data is a FormData instance if not explicitly set.
     * `Content-Type: application/x-www-form-urlencoded` header is automatically added by fetch when data is an URLSearchParams instance if not explicitly set.
     * `Content-Type: text/plain` header is automatically added by fetch when data is a string instance if not explicitly set.
     * @param {string|ArrayBuffer|Blob|DataView|File|FormData|TypedArray|URLSearchParams|ReadableStream} data
     * @returns {HttpRequestBuilder} this builder
     */
    body(data) {
        this.#body = data;
        return this;
    }
    /**
     * Sets the request body that will be serialized as json. Calling this method adds the `Content-Type application/json` header for the request.
     * @param {any} body - the body to be serialized as json
     * @returns {HttpRequestBuilder} this builder
     */
    json(body) {
        if (body === undefined) {
            return this;
        }
        const serialized = JSON.stringify(body);
        this.#headers.set('Content-Type', 'application/json');
        this.#body = serialized;
        return this;
    }
    /**
     * Sets the request body as a FormData configured using the callback.
     * `Content-Type: multipart/form-data` header is automatically added by fetch if not explicitly set.
     * @param {(c: HttpMultipartRequestCustomizer) => void} callback
     */
    multipart(callback) {
        const formData = new FormData();
        const builder = new HttpMultipartRequestCustomizer(formData);
        callback(builder);
        this.#body = formData;
        return this;
    }
    /**
     * Sets a fetch options for the request.
     * @param {Omit<RequestInit,"headers"|"method"|"body">} kvs
     * @returns {HttpRequestBuilder} this builder
     */
    options(kvs) {
        for (const [k, v] of Object.entries(kvs)) {
            this.#options[k] = v;
        }
        return this;
    }
    /**
     * Sets a fetch option for the request.
     * @param {keyof Omit<RequestInit,"headers"|"method"|"body">} k
     * @param {*} v
     * @returns {HttpRequestBuilder} this builder
     */
    option(k, v) {
        this.#options[k] = v;
        return this;
    }
    /**
     * Adds interceptors to the request.
     * @param {[HttpInterceptor]} is - the interceptor to be registered
     * @returns {HttpRequestBuilder} this builder
     */
    interceptors(is) {
        for (const i of is) {
            this.#interceptors.push(i);
        }
        return this;
    }
    /**
     * Adds an interceptor to the request.
     * @param {HttpInterceptor} i - the interceptor to be registered
     * @returns {HttpRequestBuilder} this builder
     */
    interceptor(i) {
        this.#interceptors.push(i);
        return this;
    }
    /**
     * Performs an HTTP exchange using the configured client, request and interceptors.
     * @returns {Promise<Response>} the response
     */
    async exchange() {
        const query = this.#params.size ? `?${this.#params}` : '';
        const opts = {
            ...this.#options,
            headers: this.#headers,
            method: this.#method,
            body: this.#body,
        };
        return await this.#client.exchange(`${this.#uri}${query}${this.#fragment}`, opts, this.#interceptors);
    }
    /**
     * Performs an HTTP exchange using the configured client request, and interceptors throwing a failure when response status is not in the 200-299 range.
     * @returns {Promise<Response>} the response
     */
    async fetch() {
        try {
            const response = await this.exchange();
            if (!response.ok) {
                throw await HttpClientError.fromResponse(response);
            }
            return response;
        } catch (ex) {
            if (ex instanceof Failure) {
                throw ex;
            }
            //fetch() answers a Failure whatever happened, so a caller reading
            //`problems` never has to test the shape first. What reaches here is
            //not the transport, which labels its own failure below the chain: it
            //is a throw from the chain's own code, carried as the cause
            throw HttpClientError.of('UNEXPECTED_PROBLEM', ex);
        }
    }
    /**
     * Performs an HTTP exchange using the configured client request, and interceptors throwing a failure when response status is not in the 200-299 range.
     * @returns {Promise<string>} the response body, as text
     */
    async fetchText() {
        const response = await this.fetch();
        return await unmarshal(response, 'text');
    }
    /**
     * Performs an HTTP exchange using the configured client request, and interceptors throwing a failure when response status is not in the 200-299 range.
     * A 204 yields null without reading the body; any other empty body is an unmarshaling failure.
     * @returns {Promise<any>} the response body, deserialized as JSON
     */
    async fetchJson() {
        const response = await this.fetch();
        if (response.status === 204) {
            //a 204 declares no content: there is no body to decode
            return null;
        }
        return await unmarshal(response, 'json');
    }
    /**
     * Performs an HTTP exchange using the configured client request, and interceptors throwing a failure when response status is not in the 200-299 range.
     * @returns {Promise<Blob>} the response body, as a Blob
     */
    async fetchBlob() {
        const response = await this.fetch();
        return await unmarshal(response, 'blob');
    }
    /**
     * Performs an HTTP exchange using the configured client request, and interceptors throwing a failure when response status is not in the 200-299 range.
     * @returns {Promise<ArrayBuffer>} the response body, as an ArrayBuffer
     */
    async fetchArrayBuffer() {
        const response = await this.fetch();
        return await unmarshal(response, 'arrayBuffer');
    }
}

class HttpMultipartRequestCustomizer {
    #formData;
    /**
     *
     * @param {FormData} formData
     */
    constructor(formData) {
        this.#formData = formData;
    }
    /**
     * Appends a value to the FormData.
     * @param {string} name
     * @param {*} value
     * @returns this builder
     */
    field(name, value) {
        this.#formData.append(name, value);
        return this;
    }
    /**
     * Appends a Blob to the FormData.
     * If `filename` is omitted, FormData defaults are applied:
     * The default filename for Blob objects is "blob";
     * The default filename for File objects is the file's filename.
     * @param {string} name
     * @param {Blob} value
     * @param {string|undefined} filename
     * @returns this builder
     */
    blob(name, value, filename) {
        this.#formData.append(name, value, filename);
        return this;
    }
    /**
     * Appends multiple Blobs to the FormData with the same name.
     * The default filename for Blob objects is "blob";
     * The default filename for File objects is the file's filename.
     * @param {string} name
     * @param {Blob[]} values
     * @returns this builder
     */
    blobs(name, values) {
        for (const v of values) {
            this.#formData.append(name, v);
        }
        return this;
    }
    /**
     * Appends a JSON serialized blob to the FormData.
     * @param {string} name
     * @param {any} value
     * @param {string|undefined} filename
     * @returns this builder
     */
    json(name, value, filename) {
        const blob = new Blob([JSON.stringify(value)], { type: 'application/json' });
        this.#formData.append(name, blob, filename);
        return this;
    }
}

export { MediaType, HttpClient, HttpClientError };
