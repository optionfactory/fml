import { Rendering } from '../src/ftl/index.mjs';
import { settle, tick } from './tick.mjs';

/**
 * Mounting and teardown for the component suites.
 *
 * Every test used to build its own container, append it and remove it by hand
 * at the end: 538 removals across twenty files, none of which run when an
 * assertion fails first, so a failing test leaked its dom into the next one.
 * `mount` records what it appended and a root hook clears it after every test,
 * failed or not.
 *
 * The waiting is the caller's to choose because the components differ: an
 * element mounted alone is awaited directly, a fragment of several is awaited
 * through its children, and a component whose render schedules more work takes
 * an extra drain. Nothing here picks a tick count on a suite's behalf.
 */
const mounted = [];

afterEach(() => {
    while (mounted.length) {
        mounted.pop().remove();
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

export { appended, mount, captureConsole, settle, tick };
