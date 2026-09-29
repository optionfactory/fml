import { Failure } from './failure.mjs';

/** A parsed `Content-Type`: the type and subtype without the parameters, so a comparison is not defeated by a charset. */
class MediaType {
    #type;
    #subtype;
    constructor(type, subtype) {
        this.#type = type;
        this.#subtype = subtype;
    }
    /** @returns {string} `type/subtype`, lowercase */
    get normalized() {
        return `${this.#type}/${this.#subtype}`;
    }
    /** @returns {string} */
    get type() {
        return this.#type;
    }
    /** @returns {string} */
    get subtype() {
        return this.#subtype;
    }
    /**
     * Parses a Content-Type header value into its type/subtype pair, dropping any parameter.
     * @param {string|null|undefined} v
     * @returns {MediaType} `unknown/unknown` for a missing or malformed value
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

/**
 * A Failure from an http exchange, carrying the status that was served. Status
 * 0 means no response was served at all: the transport failed, or a body the
 * server did send could not be read.
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
     * A problem with no context and no details.
     * @param {string} type
     * @param {string} reason
     * @returns {{ type: string; context: null; reason: string; details: null; }}
     */
    static problem(type, reason) {
        return { type, context: null, reason, details: null };
    }
    /**
     * A failure with status 0 and one problem of the given type, whose reason is
     * the cause's message.
     * @param {string} type
     * @param {any} cause
     * @returns {HttpClientError}
     */
    static of(type, cause) {
        const reason = String(cause?.message ?? cause ?? 'unknown failure');
        return new HttpClientError(reason, 0, [HttpClientError.problem(type, reason)], cause);
    }
    /**
     * The failure an error response stands for, keeping its status. An
     * `application/failures+json` body is the problems list; an
     * `application/problem+json` body contributes its `problems`, or one
     * GENERIC_PROBLEM made of its title and detail. Any other body is one
     * GENERIC_PROBLEM carrying the body text. A json body that does not decode,
     * or decodes to the wrong shape, and a body that cannot be read at all,
     * each become one GENERIC_PROBLEM saying so.
     * @param {Response} response consumed
     * @returns {Promise<HttpClientError>}
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
    static #unreadable = Symbol('unreadable body');
    /**
     * @param {Response} response
     * @param {string} [as] what the body does not decode as
     */
    static #undecodable(response, as = 'as json') {
        const mediaType = MediaType.parse(response.headers.get('Content-Type')).normalized;
        const message = `${response.status} ${response.statusText}: the ${mediaType} body does not decode ${as}`;
        return new HttpClientError(message, response.status, [HttpClientError.problem('GENERIC_PROBLEM', message)]);
    }
    static async #generic(response) {
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
 * Sends the csrf header named by the page's `_csrf_header` meta, with the token
 * from `_csrf`. Both are read per request, so metas replaced after the client
 * was built are honoured, and the header is sent to the page's own origin only.
 * @implements {HttpInterceptor}
 */
class CsrfTokenInterceptor {
    async intercept(url, request, chain) {
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
 * Navigates to a login url when a response comes back 401. The promise it
 * returns never settles, so callers keep waiting while the page unloads
 * instead of showing a failure; where the navigation is blocked, as by a
 * beforeunload prompt, they stay pending until the page leaves.
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
            return new Promise(() => {});
        }
        return response;
    }
}

/** Collects the interceptors an HttpClient will run, in the order they are added. */
class HttpClientBuilder {
    /**
     * @type {HttpInterceptor[]}
     */
    #interceptors;
    constructor() {
        this.#interceptors = [];
    }
    /**
     * Adds the CsrfTokenInterceptor.
     * @returns {HttpClientBuilder} this builder
     */
    withCsrfToken() {
        this.#interceptors.push(new CsrfTokenInterceptor());
        return this;
    }
    /**
     * Adds the RedirectOnUnauthorizedInterceptor.
     * @param {string} redirectUri where a 401 navigates to
     * @returns {HttpClientBuilder} this builder
     */
    withRedirectOnUnauthorized(redirectUri) {
        this.#interceptors.push(new RedirectOnUnauthorizedInterceptor(redirectUri));
        return this;
    }
    /**
     * Adds interceptors, run in the order given after the ones added before.
     * @param {...HttpInterceptor} interceptors
     * @returns {HttpClientBuilder} this builder
     */
    withInterceptors(...interceptors) {
        this.#interceptors.push(...interceptors);
        return this;
    }
    /** @returns {HttpClient} a client running the interceptors added so far */
    build() {
        return new HttpClient(this.#interceptors);
    }
}

/**
 * The last interceptor in every chain, performing the request with fetch. A
 * fetch rejection becomes an HttpClientError with a CONNECTION_PROBLEM.
 * @implements {HttpInterceptor}
 */
class HttpCall {
    async intercept(url, request, chain) {
        try {
            return await fetch(url, request);
        } catch (ex) {
            throw HttpClientError.of('CONNECTION_PROBLEM', ex);
        }
    }
}

/** One request's position in the interceptor list: `proceed` runs the next interceptor, the last of which performs the request. */
class HttpInterceptorChain {
    #interceptors;
    #current;
    /**
     * @param {HttpInterceptor[]} interceptors
     * @param {number} current the index of the interceptor `proceed` runs
     */
    constructor(interceptors, current) {
        this.#interceptors = interceptors;
        this.#current = current;
    }
    /**
     * Runs the next interceptor.
     * @param {URL} url
     * @param {RequestInit} request
     * @returns {Promise<Response>}
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

/**
 * Performs http requests through a fixed list of interceptors. The verbs
 * return a request builder; `exchange` is the lower-level entry that returns
 * the Response itself without treating an error status as a failure.
 */
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
     * Performs an HTTP exchange through the client's interceptors, then the
     * given ones.
     * @param {string} uri the request url, relative to the page's
     * @param {RequestInit|undefined} options fetch options
     * @param {HttpInterceptor[]|undefined} interceptors run for this exchange only
     * @returns {Promise<Response>} the response, whatever its status; rejecting
     * with an HttpClientError CONNECTION_PROBLEM when the transport fails, or
     * with what an interceptor throws
     */
    async exchange(uri, options, interceptors) {
        const is = [...this.#interceptors, ...(interceptors || []), new HttpCall()];
        const chain = new HttpInterceptorChain(is, 0);
        const url = new URL(new Request(uri).url);
        const request = { ...options, headers: new Headers(options?.headers) };
        return await chain.proceed(url, request);
    }
    /**
     * Starts a request with any method.
     * @param {string} method
     * @param {string} uri the request url, relative to the page's; a query and a fragment in it are kept
     * @returns {HttpRequestBuilder}
     */
    request(method, uri) {
        return HttpRequestBuilder.create(this, method, uri);
    }
    /**
     * Starts a GET request.
     * @param {string} uri the request url, relative to the page's; a query and a fragment in it are kept
     * @returns {HttpRequestBuilder}
     */
    get(uri) {
        return HttpRequestBuilder.create(this, 'GET', uri);
    }
    /**
     * Starts a HEAD request.
     * @param {string} uri the request url, relative to the page's; a query and a fragment in it are kept
     * @returns {HttpRequestBuilder}
     */
    head(uri) {
        return HttpRequestBuilder.create(this, 'HEAD', uri);
    }
    /**
     * Starts a POST request.
     * @param {string} uri the request url, relative to the page's; a query and a fragment in it are kept
     * @returns {HttpRequestBuilder}
     */
    post(uri) {
        return HttpRequestBuilder.create(this, 'POST', uri);
    }
    /**
     * Starts a PUT request.
     * @param {string} uri the request url, relative to the page's; a query and a fragment in it are kept
     * @returns {HttpRequestBuilder}
     */
    put(uri) {
        return HttpRequestBuilder.create(this, 'PUT', uri);
    }
    /**
     * Starts a PATCH request.
     * @param {string} uri the request url, relative to the page's; a query and a fragment in it are kept
     * @returns {HttpRequestBuilder}
     */
    patch(uri) {
        return HttpRequestBuilder.create(this, 'PATCH', uri);
    }
    /**
     * Starts a DELETE request.
     * @param {string} uri the request url, relative to the page's; a query and a fragment in it are kept
     * @returns {HttpRequestBuilder}
     */
    delete(uri) {
        return HttpRequestBuilder.create(this, 'DELETE', uri);
    }
}

/**
 * Reads the response body as the given type, wrapping a failed read as an UNMARSHALING_PROBLEM.
 * @param {Response} response
 * @param {'text'|'json'|'blob'|'arrayBuffer'} type
 * @returns {Promise<any>}
 */
const unmarshal = async (response, type) => {
    try {
        return await response[type]();
    } catch (ex) {
        throw HttpClientError.of('UNMARSHALING_PROBLEM', ex);
    }
};

/**
 * The entries of a headers or params initializer with nullish values kept as they are.
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

/**
 * One request under construction: method, url, parameters, headers and body,
 * with a `fetch*` method per body type. Every configuration method returns the
 * builder, and a `fetch*` rejects with an HttpClientError for any status
 * outside 200-299.
 */
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
     * A builder for the url: its query becomes the initial params, split at the
     * first `?`, and its fragment, from the first `#`, is kept for the final url.
     * @param {HttpClient} client
     * @param {string} method
     * @param {string} uri
     * @returns {HttpRequestBuilder}
     */
    static create(client, method, uri) {
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
     * @param {HttpClient} client
     * @param {string} method
     * @param {string} uri the url without query and fragment
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
     * Sets each header, replacing a header of the same name; a null or undefined value removes it.
     * @param {HeadersInit|Record<string,string|null|undefined>} hs
     * @returns {HttpRequestBuilder} this builder
     */
    headers(hs) {
        for (const [k, v] of rawEntries(hs)) {
            this.header(k, v);
        }
        return this;
    }
    /**
     * Sets a header, replacing one of the same name; a null or undefined value removes it.
     * @param {string} k
     * @param {string|null|undefined} v
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
     * Sets each query parameter in place, replacing a parameter of the same name; a null or undefined value removes it.
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
     * Sets a query parameter to the values given, as repeated entries moved to the end of the query; nullish values are skipped, and none left removes the parameter.
     * @param {string} k
     * @param {...string} vs
     * @returns {HttpRequestBuilder} this builder
     */
    param(k, ...vs) {
        this.#params.delete(k);
        for (const v of vs.filter((v) => v != null)) {
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
     * @returns {HttpRequestBuilder} this builder
     */
    multipart(callback) {
        const formData = new FormData();
        const builder = new HttpMultipartRequestCustomizer(formData);
        callback(builder);
        this.#body = formData;
        return this;
    }
    /**
     * Merges fetch options into the request's.
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
     * Adds interceptors run for this request only, after the client's.
     * @param {HttpInterceptor[]} is
     * @returns {HttpRequestBuilder} this builder
     */
    interceptors(is) {
        for (const i of is) {
            this.#interceptors.push(i);
        }
        return this;
    }
    /**
     * Adds one interceptor run for this request only, after the client's.
     * @param {HttpInterceptor} i
     * @returns {HttpRequestBuilder} this builder
     */
    interceptor(i) {
        this.#interceptors.push(i);
        return this;
    }
    /**
     * Sends the request and answers the Response, whatever its status.
     * @returns {Promise<Response>} rejecting as `HttpClient.exchange` does
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
     * Sends the request and answers the Response when its status is 200-299.
     * Always rejects with an HttpClientError: `HttpClientError.fromResponse`
     * for an error status, CONNECTION_PROBLEM for a transport failure, and
     * UNEXPECTED_PROBLEM, carrying the error as its cause, for anything an
     * interceptor throws that is not already a Failure.
     * @returns {Promise<Response>}
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
            throw HttpClientError.of('UNEXPECTED_PROBLEM', ex);
        }
    }
    /**
     * `fetch()`, then the body as text; a body that cannot be read rejects with UNMARSHALING_PROBLEM.
     * @returns {Promise<string>}
     */
    async fetchText() {
        const response = await this.fetch();
        return await unmarshal(response, 'text');
    }
    /**
     * `fetch()`, then the body parsed as json. A 204 yields null without reading
     * the body; any other body that does not parse rejects with UNMARSHALING_PROBLEM.
     * @returns {Promise<any>}
     */
    async fetchJson() {
        const response = await this.fetch();
        if (response.status === 204) {
            return null;
        }
        return await unmarshal(response, 'json');
    }
    /**
     * `fetch()`, then the body as a Blob; a body that cannot be read rejects with UNMARSHALING_PROBLEM.
     * @returns {Promise<Blob>}
     */
    async fetchBlob() {
        const response = await this.fetch();
        return await unmarshal(response, 'blob');
    }
    /**
     * `fetch()`, then the body as an ArrayBuffer; a body that cannot be read rejects with UNMARSHALING_PROBLEM.
     * @returns {Promise<ArrayBuffer>}
     */
    async fetchArrayBuffer() {
        const response = await this.fetch();
        return await unmarshal(response, 'arrayBuffer');
    }
}

/** Builds a multipart body: text fields, json parts, and single or repeated blobs. */
class HttpMultipartRequestCustomizer {
    #formData;
    /** @param {FormData} formData the body being built */
    constructor(formData) {
        this.#formData = formData;
    }
    /**
     * Appends a value to the FormData.
     * @param {string} name
     * @param {*} value
     * @returns {HttpMultipartRequestCustomizer} this builder
     */
    field(name, value) {
        this.#formData.append(name, value);
        return this;
    }
    /**
     * Appends a Blob to the FormData. Without a filename a File keeps its own
     * and any other Blob is named "blob".
     * @param {string} name
     * @param {Blob} value
     * @param {string} [filename]
     * @returns {HttpMultipartRequestCustomizer} this builder
     */
    blob(name, value, filename) {
        this.#formData.append(name, value, filename);
        return this;
    }
    /**
     * Appends each Blob under the same name, a File keeping its own filename and
     * any other Blob named "blob".
     * @param {string} name
     * @param {Blob[]} values
     * @returns {HttpMultipartRequestCustomizer} this builder
     */
    blobs(name, values) {
        for (const v of values) {
            this.#formData.append(name, v);
        }
        return this;
    }
    /**
     * Appends the value serialized as an `application/json` blob.
     * @param {string} name
     * @param {any} value
     * @param {string} [filename]
     * @returns {HttpMultipartRequestCustomizer} this builder
     */
    json(name, value, filename) {
        const blob = new Blob([JSON.stringify(value)], { type: 'application/json' });
        this.#formData.append(name, blob, filename);
        return this;
    }
}

export {
    MediaType,
    HttpClient,
    HttpClientBuilder,
    HttpClientError,
    HttpInterceptorChain,
    HttpRequestBuilder,
    HttpMultipartRequestCustomizer,
};
