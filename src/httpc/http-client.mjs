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
     *
     * @param {string|null|undefined} v
     * @returns
     */
    static parse(v) {
        if (!v) {
            return new MediaType('unknown', 'unknown');
        }
        const [prefix, _] = v.split(';');
        const [ptype, psubtype] = prefix.trim().split('/');
        return new MediaType(ptype.toLowerCase(), psubtype?.toLowerCase());
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
    dropping(prefix) {
        return new HttpClientError(this.message, this.status, Failure.dropProblemsContext(this.problems, prefix), this);
    }
    /**
     *
     * @param {string} type
     * @param {any} cause
     * @returns
     */
    static of(type, cause) {
        return new HttpClientError(
            cause.message,
            0,
            [
                {
                    type,
                    context: null,
                    reason: cause.message,
                    details: null,
                },
            ],
            cause,
        );
    }
    /**
     * Creates an HttpClientError from a Response.
     * @param {Response} response
     * @returns an HttpClientError
     */
    static async fromResponse(response) {
        switch (MediaType.parse(response.headers.get('Content-Type')).normalized) {
            case 'application/failures+json': {
                const data = await response.json();
                const message = `${response.status} ${response.statusText}: ${data.length} failures`;
                return new HttpClientError(message, response.status, data);
            }
            case 'application/problem+json': {
                const data = await response.json();
                const message = `${response.status} ${response.statusText}: ${data.title} ${data.detail}`;
                return new HttpClientError(
                    message,
                    response.status,
                    data.problems || [
                        {
                            type: 'GENERIC_PROBLEM',
                            context: null,
                            reason: message,
                            details: null,
                        },
                    ],
                );
            }
            default: {
                const text = await response.text();
                const message = `${response.status} ${response.statusText}: ${text}`;
                return new HttpClientError(message, response.status, [
                    {
                        type: 'GENERIC_PROBLEM',
                        context: null,
                        reason: message,
                        details: null,
                    },
                ]);
            }
        }
    }
}

/**
 * @implements {HttpInterceptor}
 */
class CsrfTokenInterceptor {
    #k;
    #v;
    constructor() {
        this.#k = document.querySelector("meta[name='_csrf_header']")?.getAttribute('content');
        this.#v = document.querySelector("meta[name='_csrf']")?.getAttribute('content');
    }
    async intercept(url, request, chain) {
        if (this.#k && this.#v) {
            request.headers.set(this.#k, this.#v);
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
        return await fetch(url, request);
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
        return await chain.proceed(url, options ?? {});
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
 *
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

class HttpRequestBuilder {
    #client;
    #method;
    #uri;
    #params;
    #headers;
    #body;
    #options;
    #interceptors;
    /**
     * Creates an HttpRequestBuilder.
     * @param {HttpClient} client
     * @param {string} method - the HTTP method to be used
     * @param {string} uri - the (possibly relative) request url
     * @returns {HttpRequestBuilder} the builder
     */
    static create(client, method, uri) {
        const [baseUri, queryString = ''] = uri.split('?');
        return new HttpRequestBuilder(
            client,
            method,
            baseUri,
            new URLSearchParams(queryString),
            new Headers(),
            undefined,
            {},
            [],
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
     */
    constructor(client, method, uri, params, headers, body, options, interceptors) {
        this.#client = client;
        this.#method = method;
        this.#uri = uri;
        this.#params = params;
        this.#body = body;
        this.#headers = headers;
        this.#options = options;
        this.#interceptors = interceptors;
    }
    /**
     * Add all passed headers to the request, overriding existing ones if that key already exists. Null and undefined values cause the key to be removed.
     * @param {HeadersInit} hs
     * @returns {HttpRequestBuilder} this builder
     */
    headers(hs) {
        for (const [k, v] of new Headers(hs).entries()) {
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
     * @param {URLSearchParams|Record<string,string>|string[][]|string} ps
     * @returns {HttpRequestBuilder} this builder
     */
    params(ps) {
        for (const [k, v] of new URLSearchParams(ps).entries()) {
            if (v == null) {
                this.#params.delete(k);
            } else {
                this.#params.set(k, v);
            }
        }
        return this;
    }
    /**
     * Adds a query parameter to the request, overriding it if it already exists. Empty vs, or a single null or undefined value cause the key to be removed.
     * @param {string} k
     * @param {...string} vs
     * @returns {HttpRequestBuilder} this builder
     */
    param(k, ...vs) {
        if (vs.length === 0 || vs[0] == null) {
            this.#params.delete(k);
            return this;
        }
        for (const v of vs) {
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
        this.#headers.set('Content-Type', 'application/json');
        this.#body = JSON.stringify(body);
        return this;
    }
    /**
     * Sets the request body as a FormData configured using the callback.
     * `Content-Type: multipart/form-data` header is automatically added by fetch if not explicitly set.
     * @param {function(HttpMultipartRequestCustomizer):void} callback
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
     * @param {[HttpInterceptor]} is - the interceptor to be regisered
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
     * @param {HttpInterceptor} i - the interceptor to be regisered
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
        const uri = this.#params.size ? `${this.#uri}?${this.#params}` : this.#uri;
        const opts = {
            ...this.#options,
            headers: this.#headers,
            method: this.#method,
            body: this.#body,
        };
        return await this.#client.exchange(uri, opts, this.#interceptors);
    }
    /**
     * Performs an HTTP exchange using the configured client request, and interceptos throwing a failure when response status is not in the 200-299 range.
     * @returns {Promise<Response>} the response
     */
    async fetch() {
        const uri = this.#params.size ? `${this.#uri}?${this.#params}` : this.#uri;
        const opts = {
            ...this.#options,
            headers: this.#headers,
            method: this.#method,
            body: this.#body,
        };
        try {
            const response = await this.#client.exchange(uri, opts, this.#interceptors);
            if (!response.ok) {
                throw await HttpClientError.fromResponse(response);
            }
            return response;
        } catch (ex) {
            if (ex instanceof Failure) {
                throw ex;
            }
            throw HttpClientError.of('CONNECTION_PROBLEM', ex);
        }
    }
    /**
     * Performs an HTTP exchange using the configured client request, and interceptos throwing a failure when response status is not in the 200-299 range.
     * @returns {Promise<string>} the response body, as text
     */
    async fetchText() {
        const response = await this.fetch();
        return await unmarshal(response, 'text');
    }
    /**
     * Performs an HTTP exchange using the configured client request, and interceptos throwing a failure when response status is not in the 200-299 range.
     * @returns {Promise<any>} the response body, deserialized as JSON
     */
    async fetchJson() {
        const response = await this.fetch();
        return await unmarshal(response, 'json');
    }
    /**
     * Performs an HTTP exchange using the configured client request, and interceptos throwing a failure when response status is not in the 200-299 range.
     * @returns {Promise<Blob>} the response body, as a Blob
     */
    async fetchBlob() {
        const response = await this.fetch();
        return await unmarshal(response, 'blob');
    }
    /**
     * Performs an HTTP exchange using the configured client request, and interceptos throwing a failure when response status is not in the 200-299 range.
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
        for (let v of values) {
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
