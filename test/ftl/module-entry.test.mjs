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

    it('hands back instances of the classes it exports, the root entry exporting the same ones', () => {
        assert.instanceOf(httpc.HttpClient.builder(), httpc.HttpClientBuilder);
        assert.instanceOf(httpc.HttpClient.builder().build().get('/x'), httpc.HttpRequestBuilder);
        assert.strictEqual(fml.HttpRequestBuilder, httpc.HttpRequestBuilder);
    });
});
