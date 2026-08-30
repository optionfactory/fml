import * as ftl from './ftl/index.mjs';
import * as httpc from './httpc/index.mjs';
import * as ful from './ful/index.mjs';

if (typeof window !== 'undefined') {
    // biome-ignore-start lint/complexity/useLiteralKeys: checkJs rejects unknown properties on Window
    window['ftl'] = ftl;
    window['httpc'] = httpc;
    window['ful'] = ful;
    // biome-ignore-end lint/complexity/useLiteralKeys: checkJs rejects unknown properties on Window
}

export * from './ftl/index.mjs';
export * from './httpc/index.mjs';
export * from './ful/index.mjs';
