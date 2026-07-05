import { JSDOM } from "jsdom";

function mockdom(html) {
    let jsdom = new JSDOM(html);
    globalThis.document = jsdom.window.document;
    globalThis.Node = jsdom.window.Node;
    globalThis.DocumentFragment = jsdom.window.DocumentFragment;
    globalThis.NodeFilter = jsdom.window.NodeFilter;
    globalThis.HTMLElement = jsdom.window.HTMLElement;
    globalThis.CustomEvent = jsdom.window.CustomEvent;
    return jsdom;
}

mockdom("<html></html>");

