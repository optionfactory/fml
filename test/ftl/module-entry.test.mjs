import { assert } from 'chai';
import * as fml from '../../src/index.mjs';
import * as ftl from '../../src/ftl/index.mjs';
import * as httpc from '../../src/httpc/index.mjs';
import * as ful from '../../src/ful/index.mjs';

describe('The module entry', () => {
    it('exposes every namespace on the window, for the script-tag builds', () => {
        assert.strictEqual(window.ftl, ftl);
        assert.strictEqual(window.httpc, httpc);
        assert.strictEqual(window.ful, ful);
    });

    it('re-exports every namespace for the module builds', () => {
        assert.strictEqual(fml.Template, ftl.Template);
        assert.strictEqual(fml.HttpClient, httpc.HttpClient);
        assert.strictEqual(fml.Plugin, ful.Plugin);
    });

    it('names every type its own signatures hand back', async () => {
        //a consumer can write the call either way; without the export they
        //cannot annotate the helper it lives in, nor the interceptor they write
        assert.isFunction(httpc.HttpClientBuilder);
        assert.isFunction(httpc.HttpRequestBuilder);
        assert.isFunction(httpc.HttpInterceptorChain);
        assert.isFunction(httpc.HttpMultipartRequestCustomizer);

        const client = httpc.HttpClient.builder().build();
        assert.instanceOf(httpc.HttpClient.builder(), httpc.HttpClientBuilder);
        assert.instanceOf(client.get('/x'), httpc.HttpRequestBuilder);
        //and the root entry hands over the same classes, not copies
        assert.strictEqual(fml.HttpRequestBuilder, httpc.HttpRequestBuilder);
    });

    it('exports every filter and loader class', () => {
        assert.isFunction(ful.InstantFilter);
        assert.isFunction(ful.LocalDateFilter);
        assert.isFunction(ful.NumberFilter);
        assert.isFunction(ful.TextFilter);
        assert.isFunction(ful.BooleanFilter);
        assert.isFunction(ful.FormLoader);
        assert.isFunction(ful.SelectLoader);
        assert.isFunction(ful.TableLoader);
    });
});
