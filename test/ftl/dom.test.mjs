import { expect } from '@esm-bundle/chai';
import { Fragments, Attributes, LightSlots, Nodes } from '../../src/ftl/dom.mjs';

describe('dom.mjs', () => {
    describe('Fragments', () => {
        it('creates a DocumentFragment from HTML strings', () => {
            const frag = Fragments.fromHtml('<div>', '<span>Test</span>', '</div>');
            expect(frag).to.be.instanceOf(DocumentFragment);
            expect(frag.querySelector('span').textContent).to.equal('Test');
        });

        it('converts a DocumentFragment back to HTML', () => {
            const frag = Fragments.fromHtml('<span>Test</span>');
            const html = Fragments.toHtml(frag);
            expect(html).to.equal('<span>Test</span>');
        });

        it('checks if a fragment is blank', () => {
            expect(Fragments.isBlank(Fragments.fromHtml('   \n  '))).to.be.true;
            expect(Fragments.isBlank(Fragments.fromHtml('<span></span>'))).to.be.false;
            expect(Fragments.isBlank(Fragments.fromHtml(' text '))).to.be.false;
        });

        it('creates a fragment from a list of nodes', () => {
            const span1 = document.createElement('span');
            const span2 = document.createElement('span');
            const frag = Fragments.from(span1, span2);
            expect(frag.childNodes.length).to.equal(2);
        });

        it('creates a fragment from the childNodes of an element', () => {
            const div = document.createElement('div');
            div.innerHTML = '<p>1</p><p>2</p>';
            const frag = Fragments.fromChildNodes(div);
            expect(frag.childNodes.length).to.equal(2);
            expect(div.childNodes.length, "Nodes are moved out of div").to.equal(0);
        });
    });

    describe('Attributes', () => {
        it('generates a unique id', () => {
            const id1 = Attributes.uid('test');
            const id2 = Attributes.uid('test');
            expect(id1).to.not.equal(id2);
            expect(id1).to.match(/^test-\d+$/);
        });

        it('sets a default value only if attribute is missing', () => {
            const div = document.createElement('div');
            div.setAttribute('existing', 'A');

            expect(Attributes.defaultValue(div, 'existing', 'B')).to.equal('A');
            expect(Attributes.defaultValue(div, 'missing', 'C')).to.equal('C');
            expect(div.getAttribute('missing')).to.equal('C');
        });

        it('forwards prefixed attributes, handling classes specially', () => {
            const from = document.createElement('div');
            from.setAttribute('data-f-id', '123');
            from.setAttribute('data-f-class', 'class1 class2');
            from.setAttribute('data-other', 'ignore');

            const to = document.createElement('div');
            Attributes.forward('data-f-', from, to);

            expect(to.getAttribute('id')).to.equal('123');
            expect(to.classList.contains('class1')).to.be.true;
            expect(to.classList.contains('class2')).to.be.true;
            expect(to.hasAttribute('other')).to.be.false;
        });

        it('toggles attributes based on a boolean value', () => {
            const div = document.createElement('div');
            Attributes.toggle(div, 'hidden', true);
            expect(div.hasAttribute('hidden')).to.be.true;

            Attributes.toggle(div, 'hidden', false);
            expect(div.hasAttribute('hidden')).to.be.false;
        });

        it('flips attribute presence', () => {
            const div = document.createElement('div');
            Attributes.flip(div, 'active');
            expect(div.hasAttribute('active')).to.be.true;

            Attributes.flip(div, 'active');
            expect(div.hasAttribute('active')).to.be.false;
        });

        it('sets attributes or removes them if nullish', () => {
            const div = document.createElement('div');
            Attributes.set(div, 'test', 'value');
            expect(div.getAttribute('test')).to.equal('value');

            Attributes.set(div, 'test', null);
            expect(div.hasAttribute('test')).to.be.false;
        });
    });

    describe('LightSlots', () => {
        it('extracts light slots from an element into a dictionary of fragments', () => {
            const el = document.createElement('div');
            el.innerHTML = `
                <div slot="header">Header</div>
                <p>Default content 1</p>
                <span slot="footer">Footer</span>
                <p>Default content 2</p>
            `;

            const slots = LightSlots.from(el);

            expect(slots.header).to.be.instanceOf(DocumentFragment);
            expect(slots.header.querySelector('div').textContent).to.equal('Header');

            expect(slots.footer).to.be.instanceOf(DocumentFragment);
            expect(slots.footer.querySelector('span').textContent).to.equal('Footer');

            expect(slots.default).to.be.instanceOf(DocumentFragment);
            expect(slots.default.querySelectorAll('p').length).to.equal(2);

            expect(el.childNodes.length, "The original element should be empty after extraction").to.equal(0);
        });

        it('extracts slot content directly from template elements', () => {
            const el = document.createElement('div');
            el.innerHTML = '<template slot="my-slot"><b>Bold</b></template>';
            const slots = LightSlots.from(el);

            expect(slots['my-slot'].querySelector('b').textContent).to.equal('Bold');
        });

        it('extracts slot content from non-JS script elements as HTML', () => {
            const el = document.createElement('div');
            const script = document.createElement('script');
            script.setAttribute('slot', 'script-slot');
            script.type = 'text/html';
            script.innerHTML = '<i>Italic</i>';
            el.appendChild(script);

            const slots = LightSlots.from(el);
            expect(slots['script-slot'].querySelector('i').textContent).to.equal('Italic');
        });
    });

    describe('Nodes', () => {
        it('queries direct children only (queryChildren / queryChildrenAll)', () => {
            const div = document.createElement('div');
            div.innerHTML = `
                <span class="find-me">1</span>
                <div><span class="find-me">Nested (should be ignored)</span></div>
                <span class="find-me">2</span>
            `;

            const first = Nodes.queryChildren(div, '.find-me');
            expect(first.textContent).to.equal('1');

            const all = Nodes.queryChildrenAll(div, '.find-me');
            expect(all.length).to.equal(2);
            expect(all[1].textContent).to.equal('2');

            const none = Nodes.queryChildren(div, '.missing');
            expect(none).to.be.null;
        });

        it('checks if a node is parsed based on nextSibling presence', () => {
            const parent = document.createElement('div');
            const child1 = document.createElement('div');
            const child2 = document.createElement('div');

            parent.appendChild(child1);
            expect(Nodes.isParsed(child1), "child1 has no nextSibling, so it evaluates to false").to.be.false;

            parent.appendChild(child2);
            expect(Nodes.isParsed(child1), "child1 now has a nextSibling, so it evaluates to true").to.be.true;
        });

        it('resolves waitParsed immediately if node is already parsed', async () => {
            const parent = document.createElement('div');
            const child1 = document.createElement('div');
            const child2 = document.createElement('div');

            parent.appendChild(child1);
            parent.appendChild(child2);

            const resolved = await Nodes.waitParsed(child1);
            expect(resolved, "waitParsed should resolve immediately without MutationObserver triggering").to.equal(child1);
        });
        it('waits for parsing to complete via DOMContentLoaded event', async () => {
            const parent = document.createElement('div');
            const el = document.createElement('div');
            parent.appendChild(el); 

            let loadHandler;
            const fakeDoc = {
                readyState: 'loading',
                addEventListener: (event, handler, options) => {
                    if (event === 'DOMContentLoaded') loadHandler = handler;
                }
            };
            Object.defineProperty(el, 'ownerDocument', { get: () => fakeDoc });

            const promise = Nodes.waitParsed(el);

            loadHandler();

            const resolved = await promise;
            expect(resolved).to.equal(el);
        });

        it('waits for parsing to complete via MutationObserver', async () => {
            const parent = document.createElement('div');
            const el = document.createElement('div');
            parent.appendChild(el);

            // Mock the document so it doesn't resolve instantly
            const fakeDoc = {
                readyState: 'loading',
                addEventListener: () => { }
            };
            Object.defineProperty(el, 'ownerDocument', { get: () => fakeDoc });

            document.body.appendChild(parent);

            const promise = Nodes.waitParsed(el);

            const sibling = document.createElement('div');
            parent.appendChild(sibling);

            const resolved = await promise;
            expect(resolved).to.equal(el);

            parent.remove();
        });
        it('bails out of MutationObserver callback if mutation does not parse the element', async () => {

            const wrapper = document.createElement('div');
            const parent = document.createElement('div');
            const el = document.createElement('div');

            parent.appendChild(el);
            wrapper.appendChild(parent);

            const fakeDoc = {
                readyState: 'loading',
                addEventListener: () => { }
            };
            Object.defineProperty(el, 'ownerDocument', { get: () => fakeDoc });

            const promise = Nodes.waitParsed(el);

            parent.insertBefore(document.createElement('span'), el);

            await new Promise(resolve => setTimeout(resolve, 10));

            parent.appendChild(document.createElement('span'));

            const resolved = await promise;
            expect(resolved).to.equal(el);
        });
    });
});