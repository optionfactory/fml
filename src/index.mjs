import * as ftl from './ftl/index.mjs';
import * as httpc from './httpc/index.mjs';
import * as ful from './ful/index.mjs';

if (typeof window !== 'undefined') {
    window['ftl'] = ftl;
    window['httpc'] = httpc;
    window['ful'] = ful;
}

export * from './ftl/index.mjs';
export * from './httpc/index.mjs';
export * from './ful/index.mjs';
