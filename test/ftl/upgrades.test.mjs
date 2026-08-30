import { expect } from 'chai';
import { ParsedElement } from '../../src/ftl/parsed-element.mjs';
import { registry } from '../../src/ftl/registry.mjs';
import { Rendering } from '../../src/ftl/rendering.mjs';

/**
 * Characterizes when an element counts as upgraded, which is what `ftl:ready` and
 * `Rendering.waitFor`/`waitForChildren` report on. Both walk the upgrade queue once,
 * so what they cover depends on what happens to be queued when they are called.
 */
describe('Upgrade ordering and readiness', () => {
    let container;
    let order;
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const settle = async () => {
        for (let i = 0; i !== 20; ++i) {
            await sleep(1);
        }
    };
    /** an element that takes a while to render, so nothing can pass by luck of timing */
    const slow = (name) => {
        class Slow extends ParsedElement {
            async render() {
                await sleep(30);
                order.push(name);
            }
        }
        return Slow;
    };
    /** an element that renders a child element, enqueueing it during its own upgrade */
    const nesting = (name, childTag) => {
        class Nesting extends ParsedElement {
            render() {
                this.replaceChildren(document.createElement(childTag));
                order.push(name);
            }
        }
        return Nesting;
    };

    beforeEach(() => {
        order = [];
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(async () => {
        await settle();
        container.remove();
    });

    it('reports ready once components enqueued during another upgrade have rendered', async () => {
        registry.defineElement('ready-child', slow('child'));
        registry.defineElement('ready-parent', nesting('parent', 'ready-child'));
        registry.configure();
        container.appendChild(document.createElement('ready-parent'));

        let atReady = null;
        document.addEventListener('ftl:ready', () => { atReady = [...order]; }, { once: true });
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await settle();

        expect(atReady).to.deep.equal(['parent', 'child'], 'the nested child is covered too');
        expect(order).to.deep.equal(['parent', 'child']);
    });

    it('waitFor covers what the element\'s own upgrade enqueues', async () => {
        registry.defineElement('waitfor-child', slow('child'));
        registry.defineElement('waitfor-parent', nesting('parent', 'waitfor-child'));
        registry.configure();
        const el = document.createElement('waitfor-parent');
        container.appendChild(el);

        await Rendering.waitFor(el);

        expect(order).to.deep.equal(['parent', 'child'], 'the child is queued while waiting, and covered');
    });

    it('waitForChildren does not cover the element itself', async () => {
        registry.defineElement('children-only', slow('self'));
        registry.configure();
        const el = document.createElement('children-only');
        container.appendChild(el);

        await Rendering.waitForChildren(el);

        expect(order).to.deep.equal([], 'the element itself is excluded');
        await settle();
        expect(order).to.deep.equal(['self']);
    });

    it('waitForChildren covers children connected earlier in the same render', async () => {
        registry.defineElement('host-child', slow('child'));
        class Host extends ParsedElement {
            async render() {
                this.replaceChildren(document.createElement('host-child'));
                await Rendering.waitForChildren(this);
                order.push('host');
            }
        }
        registry.defineElement('awaiting-host', Host);
        registry.configure();
        const el = document.createElement('awaiting-host');
        container.appendChild(el);

        await Rendering.waitFor(el);

        expect(order).to.deep.equal(['child', 'host'], 'this is what ful-table relies on');
    });

    it('a failing upgrade rejects waitFor', async () => {
        class Failing extends ParsedElement {
            render() {
                throw new Error('boom');
            }
        }
        registry.defineElement('failing-el', Failing);
        registry.configure();
        const el = document.createElement('failing-el');
        container.appendChild(el);

        let caught = null;
        try {
            await Rendering.waitFor(el);
        } catch (e) {
            caught = e;
        }

        //the same rejection reaches the queue's own ftl:ready handler, which is why a
        //single failing component keeps the event from firing for the whole page
        expect(caught?.message).to.equal('boom');
    });

});

describe('Rendering waitFor and waitForChildren', () => {
    it('waits for the element itself only in waitFor', async () => {

        class RenderEl extends HTMLElement {
            upgrade() { 
                return new Promise(resolve => setTimeout(resolve, 20)); 
            }
        }
        
        if (!customElements.get('render-el')) {
            registry.defineElement('render-el', RenderEl);
            registry.configure();
        }

        const parent = document.createElement('render-el');
        const child = document.createElement('render-el');
        parent.appendChild(child);
        document.body.appendChild(parent);

        RenderEl.BITS.enqueue(parent);

        let childrenDone = false;
        Rendering.waitForChildren(parent).then(() => childrenDone = true);
        
        await new Promise(resolve => setTimeout(resolve, 5));
        expect(childrenDone).to.be.true; 

        let allDone = false;
        Rendering.waitFor(parent).then(() => allDone = true);

        await new Promise(resolve => setTimeout(resolve, 5));
        expect(allDone).to.be.false; // Still locked by the 20ms timer

        await new Promise(resolve => setTimeout(resolve, 20));
        expect(allDone).to.be.true;

        parent.remove();
    });
});
describe('Readiness when a component fails', () => {
    const settle = async () => {
        for (let i = 0; i !== 20; ++i) {
            await new Promise((resolve) => setTimeout(resolve, 1));
        }
    };

    it('reports ready anyway, and hands the failure out rather than swallowing it', async () => {
        class Broken extends ParsedElement {
            render() {
                throw new Error('boom');
            }
        }
        class Healthy extends ParsedElement {
            render() {
                this.textContent = 'rendered';
            }
        }
        registry.defineElement('broken-el', Broken).defineElement('healthy-el', Healthy);
        registry.configure();
        const container = document.createElement('div');
        container.innerHTML = `<broken-el></broken-el><healthy-el></healthy-el>`;
        document.body.appendChild(container);

        //the queue must not attach a handler of its own, which is what leaves the failure
        //free to reach the console and the error reporter. taking it here proves that and
        //keeps this test from producing an uncaught rejection of its own
        const broken = container.querySelector('broken-el');
        const queued = Array.from(registry.upgrades).find(([el]) => el === broken)?.[1];
        let caught = null;
        queued?.catch((e) => {
            caught = e;
        });

        let fired = false;
        document.addEventListener('ftl:ready', () => { fired = true; }, { once: true });
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await settle();

        expect(fired, 'one broken component must not hold the page back').to.be.true;
        expect(container.querySelector('healthy-el').textContent).to.equal('rendered');
        expect(caught?.message, 'the failure is still there to be reported').to.equal('boom');

        container.remove();
    });
});
