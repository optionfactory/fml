import { assert } from 'chai';
import * as fml from '../../src/index.mjs';
import * as ftl from '../../src/ftl/index.mjs';
import * as httpc from '../../src/httpc/index.mjs';
import * as ful from '../../src/ful/index.mjs';

describe('The module entry', () => {
    it('exposes every namespace on the window, for the script-tag builds', () => {
        assert.strictEqual(
            window.ftl,
            ftl,
            'the entry sets window.ftl to the ftl namespace so script-tag pages can reach it',
        );
        assert.strictEqual(
            window.httpc,
            httpc,
            'the entry sets window.httpc to the httpc namespace so script-tag pages can reach it',
        );
        assert.strictEqual(
            window.ful,
            ful,
            'the entry sets window.ful to the ful namespace so script-tag pages can reach it',
        );
    });

    it('re-exports every namespace for the module builds', () => {
        assert.strictEqual(
            fml.Template,
            ftl.Template,
            'the root entry re-exports the ftl classes themselves, not copies',
        );
        assert.strictEqual(
            fml.HttpClient,
            httpc.HttpClient,
            'the root entry re-exports the httpc classes themselves, not copies',
        );
        assert.strictEqual(fml.Plugin, ful.Plugin, 'the root entry re-exports the ful classes themselves, not copies');
    });

    it('hands back instances of the classes it exports, the root entry exporting the same ones', () => {
        assert.instanceOf(
            httpc.HttpClient.builder(),
            httpc.HttpClientBuilder,
            'HttpClient.builder() returns an instance of the exported HttpClientBuilder',
        );
        assert.instanceOf(
            httpc.HttpClient.builder().build().get('/x'),
            httpc.HttpRequestBuilder,
            'a request started on a built client is an instance of the exported HttpRequestBuilder',
        );
        assert.strictEqual(
            fml.HttpRequestBuilder,
            httpc.HttpRequestBuilder,
            'the root entry exports the same HttpRequestBuilder class as the httpc entry',
        );
    });
});
