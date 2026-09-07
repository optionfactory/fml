import { assert } from 'chai';
import * as fml from '../../src/index.mjs';
import * as ftl from '../../src/ftl/index.mjs';
import * as httpc from '../../src/httpc/index.mjs';
import * as ful from '../../src/ful/index.mjs';

describe('the module entry', () => {
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
});
