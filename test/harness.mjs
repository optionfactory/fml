import { Rendering, registry } from '../src/ftl/index.mjs';
import { settle, tick } from './tick.mjs';

/**
 * Mounting and teardown for the component suites. Whatever `appended`, `attached`
 * and `mount` put in the page is removed after every test, failed or not, and the
 * `loaders:select`, `loaders:table` and `loaders:form` components are put back as
 * they were before it.
 *
 * Compare dom nodes by identity (`assert.isTrue(a === b)`), never with a deep or
 * strict chai equality: a failing compare over a node makes chai format it, and
 * the run hangs instead of reporting.
 */
const mounted = [];

const LOADERS = ['loaders:select', 'loaders:table', 'loaders:form'];
let loaders = [];

beforeEach(() => {
    loaders = LOADERS.map((name) => [name, registry.component(name)]);
});

afterEach(() => {
    while (mounted.length) {
        mounted.pop().remove();
    }
    for (const [name, value] of loaders) {
        registry.defineComponent(name, value);
    }
});

/**
 * Appends the markup in a container of its own and hands it back unawaited: the
 * caller owns the waiting. A suite whose drain is its own keeps it and takes
 * only the container and its teardown from here, so adopting the harness never
 * changes what a test waits for.
 * @param {string} html
 * @returns {HTMLElement} the container
 */
const appended = (html) => {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    mounted.push(container);
    return container;
};

/**
 * Appends nodes built by hand to the page, in order, removing them after the
 * test whatever the test does.
 * @template {Node} T
 * @param {T} node
 * @param {...Node} more
 * @returns {T} the first node
 */
const attached = (node, ...more) => {
    for (const n of [node, ...more]) {
        document.body.appendChild(n);
        mounted.push(n);
    }
    return node;
};

/**
 * Appends the markup in a container of its own and waits for it to render.
 * The container is removed after the test whatever the test does.
 * @param {string} html
 * @param {{ children?: boolean, drain?: boolean | number }} [options] - `children`
 *   waits for the container's children rather than the container itself;
 *   `drain` settles afterwards, optionally for a given number of turns
 * @returns {Promise<HTMLElement>} the container
 */
const mount = async (html, { children = false, drain = false } = {}) => {
    const container = appended(html);
    await (children ? Rendering.waitForChildren(container) : Rendering.waitFor(container));
    if (drain) {
        await settle(drain === true ? undefined : drain);
    }
    return container;
};

/**
 * Captures what the code under test logs, restoring the console after the test.
 * @param {...('log'|'warn'|'error')} kinds
 * @returns {string[]} the messages, in order, as they are logged
 */
const captureConsole = (...kinds) => {
    const messages = [];
    const originals = kinds.map((kind) => [kind, console[kind]]);
    for (const [kind] of originals) {
        console[kind] = (...args) => messages.push(args.map(String).join(' '));
    }
    afterEach(() => {
        for (const [kind, fn] of originals) {
            console[kind] = fn;
        }
    });
    return messages;
};

export { appended, attached, mount, captureConsole, settle, tick };
