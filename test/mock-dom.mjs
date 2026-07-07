import { JSDOM } from 'jsdom';

function mockdom(html) {
    let jsdom = new JSDOM(html, { url: 'http://localhost' });
    globalThis.document = jsdom.window.document;

    globalThis.Node = jsdom.window.Node;
    globalThis.DocumentFragment = jsdom.window.DocumentFragment;
    globalThis.NodeFilter = jsdom.window.NodeFilter;
    globalThis.customElements = jsdom.window.customElements;    
    globalThis.HTMLElement = jsdom.window.HTMLElement;

    globalThis.Event = jsdom.window.Event;
    globalThis.CustomEvent = jsdom.window.CustomEvent;

    globalThis.Storage = jsdom.window.Storage;
    globalThis.localStorage = jsdom.window.localStorage;
    globalThis.sessionStorage = jsdom.window.sessionStorage;

    return jsdom;
}

mockdom('<html></html>');
