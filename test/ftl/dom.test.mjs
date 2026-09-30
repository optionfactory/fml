import { expect } from 'chai';
import { Fragments, Attributes, LightSlots, Nodes } from '../../src/ftl/dom.mjs';
import { attached } from '../harness.mjs';

describe('dom.mjs', () => {
    describe('Fragments', () => {
        it('creates a DocumentFragment from HTML strings', () => {
            const frag = Fragments.fromHtml('<div>', '<span>Test</span>', '</div>');
            expect(frag, 'fromHtml answers a DocumentFragment adopted by the document').to.be.instanceOf(
                DocumentFragment,
            );
            expect(
                frag.querySelector('span').textContent,
                'the pieces are joined and parsed as one markup string',
            ).to.equal('Test');
        });

        it('converts a DocumentFragment back to HTML', () => {
            const frag = Fragments.fromHtml('<span>Test</span>');
            const html = Fragments.toHtml(frag);
            expect(html, 'toHtml serializes the fragment back to the markup it was parsed from').to.equal(
                '<span>Test</span>',
            );
        });

        it('reads whitespace as blank, an element or text as not', () => {
            expect(Fragments.isBlank(Fragments.fromHtml('   \n  ')), 'a fragment holding only whitespace is blank').to
                .be.true;
            expect(
                Fragments.isBlank(Fragments.fromHtml('<span></span>')),
                'an element makes a fragment not blank, even an empty one',
            ).to.be.false;
            expect(
                Fragments.isBlank(Fragments.fromHtml(' text ')),
                'text other than whitespace makes a fragment not blank',
            ).to.be.false;
        });

        it('creates a fragment from a list of nodes', () => {
            const span1 = document.createElement('span');
            const span2 = document.createElement('span');
            const frag = Fragments.from(span1, span2);
            expect(frag.childNodes.length, 'every node passed to from is moved into the fragment').to.equal(2);
        });

        it('creates a fragment from the childNodes of an element', () => {
            const div = document.createElement('div');
            div.innerHTML = '<p>1</p><p>2</p>';
            const frag = Fragments.fromChildNodes(div);
            expect(frag.childNodes.length, 'every child of the element ends up in the fragment').to.equal(2);
            expect(div.childNodes.length, 'the children are moved, not copied, so the element is left empty').to.equal(
                0,
            );
        });
    });

    describe('Attributes', () => {
        it('generates a unique id', () => {
            const id1 = Attributes.uid('test');
            const id2 = Attributes.uid('test');
            expect(id1, 'two calls under the same prefix never answer the same id').to.not.equal(id2);
            expect(id1, 'the id is the prefix followed by a dash and a counter').to.match(/^test-\d+$/);
        });

        it('sets a default value only if attribute is missing', () => {
            const div = document.createElement('div');
            div.setAttribute('existing', 'A');

            expect(
                Attributes.defaultValue(div, 'existing', 'B'),
                'an attribute the element already carries keeps its value',
            ).to.equal('A');
            expect(
                Attributes.defaultValue(div, 'missing', 'C'),
                'defaultValue answers the value the attribute has afterwards',
            ).to.equal('C');
            expect(div.getAttribute('missing'), 'a missing attribute is written with the default').to.equal('C');
        });

        it('forwards prefixed attributes, handling classes specially', () => {
            const from = document.createElement('div');
            from.setAttribute('data-f-id', '123');
            from.setAttribute('data-f-class', 'class1 class2');
            from.setAttribute('data-other', 'ignore');

            const to = document.createElement('div');
            Attributes.forward('data-f-', from, to);

            expect(to.getAttribute('id'), 'a prefixed attribute is copied under its name without the prefix').to.equal(
                '123',
            );
            expect(
                to.classList.contains('class1'),
                'the prefixed class attribute adds each of its classes to the target',
            ).to.be.true;
            expect(
                to.classList.contains('class2'),
                'every class in the prefixed class list is added, not only the first',
            ).to.be.true;
            expect(to.hasAttribute('other'), 'an attribute without the prefix is not forwarded').to.be.false;
        });

        it('sets attributes or removes them if nullish', () => {
            const div = document.createElement('div');
            Attributes.set(div, 'test', 'value');
            expect(div.getAttribute('test'), 'a non nullish value is written as the attribute').to.equal('value');

            Attributes.set(div, 'test', null);
            expect(div.hasAttribute('test'), 'a nullish value removes the attribute').to.be.false;
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

            expect(slots.header, 'each named slot is collected as a DocumentFragment under its name').to.be.instanceOf(
                DocumentFragment,
            );
            expect(
                slots.header.querySelector('div').textContent,
                'a named slot holds the child that claimed it',
            ).to.equal('Header');

            expect(slots.footer, 'every slot name found among the children gets its own fragment').to.be.instanceOf(
                DocumentFragment,
            );
            expect(
                slots.footer.querySelector('span').textContent,
                'the footer slot holds the child that claimed footer',
            ).to.equal('Footer');

            expect(slots.default, 'the default slot is always present as a DocumentFragment').to.be.instanceOf(
                DocumentFragment,
            );
            expect(
                slots.default.querySelectorAll('p').length,
                'the children that claim no slot all go to the default slot',
            ).to.equal(2);

            expect(el.childNodes.length, 'the children are moved into the slots, leaving the element empty').to.equal(
                0,
            );
        });

        it('reads slot="" as the default slot, keeping the document order', () => {
            const el = document.createElement('div');
            el.innerHTML = `
                <p>first</p>
                <div slot="">an empty claim</div>
                <span slot="named">named</span>
            `;

            const slots = LightSlots.from(el);

            expect(slots.unnamed, 'no phantom slot is born from the empty claim').to.be.undefined;
            expect(slots.named, 'a named slot next to an empty claim is still collected').to.be.instanceOf(
                DocumentFragment,
            );
            const children = Array.from(slots.default.childNodes).filter((n) => n.nodeType === n.ELEMENT_NODE);
            expect(children.length, 'the empty claim joins the unslotted child in the default slot').to.equal(2);
            expect(
                children[0].textContent,
                'the default slot keeps the document order, the unslotted child first',
            ).to.equal('first');
            expect(
                children[1].textContent,
                'the empty claim stays at its document position after the child before it',
            ).to.equal('an empty claim');
            expect(children[1].hasAttribute('slot'), 'the empty claim is stripped like any named one').to.be.false;
        });

        it('parses a text/html script slot as markup', () => {
            const el = document.createElement('div');
            el.innerHTML = `<script type="text/html" slot="tpl"><p>mark<u>up</u></p></${'script'}>`;

            const slots = LightSlots.from(el);

            expect(slots.tpl, 'a text/html script slot contributes a parsed fragment').to.be.instanceOf(
                DocumentFragment,
            );
            expect(
                slots.tpl.querySelector('u').textContent,
                'the script body is parsed as markup, nested elements included',
            ).to.equal('up');
        });

        it('never parses a module script as markup, it slots as the plain node', () => {
            const el = document.createElement('div');
            el.innerHTML = `<script type="module" slot="code">const tpl = "<b>not markup</b>";</${'script'}>`;

            const slots = LightSlots.from(el);

            const slotted = slots.code.querySelector('script');
            expect(slotted, 'a script that is not text/html slots as the script element itself').to.be.instanceOf(
                HTMLScriptElement,
            );
            expect(slotted.textContent, 'the module script keeps its source text untouched').to.contain('const tpl');
            expect(slots.code.querySelector('b'), 'markup inside a module script source is never parsed into elements')
                .to.be.null;
        });

        it('extracts slot content directly from template elements', () => {
            const el = document.createElement('div');
            el.innerHTML = '<template slot="my-slot"><b>Bold</b></template>';
            const slots = LightSlots.from(el);

            expect(
                slots['my-slot'].querySelector('b').textContent,
                'a template slot contributes its content, not the template element',
            ).to.equal('Bold');
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
            expect(first.textContent, 'queryChildren answers the first matching child').to.equal('1');

            const all = Nodes.queryChildrenAll(div, '.find-me');
            expect(all.length, 'queryChildrenAll excludes a matching descendant that is not a child').to.equal(2);
            expect(all[1].textContent, 'queryChildrenAll answers the matching children in document order').to.equal(
                '2',
            );

            const none = Nodes.queryChildren(div, '.missing');
            expect(none, 'queryChildren answers null when no child matches').to.be.null;
        });

        it('reads a node as parsed once something follows it', () => {
            const parent = document.createElement('div');
            const child1 = document.createElement('div');
            const child2 = document.createElement('div');

            parent.appendChild(child1);
            expect(Nodes.isParsed(child1), 'a node with no next sibling on itself or any ancestor is not parsed yet').to
                .be.false;

            parent.appendChild(child2);
            expect(Nodes.isParsed(child1), 'a next sibling means the parser has moved past the node').to.be.true;
        });

        it('resolves waitParsed immediately if node is already parsed', async () => {
            const parent = document.createElement('div');
            const child1 = document.createElement('div');
            const child2 = document.createElement('div');

            parent.appendChild(child1);
            parent.appendChild(child2);

            const resolved = await Nodes.waitParsed(child1);
            expect(
                resolved,
                'an already parsed node resolves at once with the node, with no mutation to wait for',
            ).to.equal(child1);
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
                },
            };
            Object.defineProperty(el, 'ownerDocument', { get: () => fakeDoc });

            const promise = Nodes.waitParsed(el);

            loadHandler();

            const resolved = await promise;
            expect(
                resolved,
                'DOMContentLoaded is the deadline, resolving with the element even with no sibling',
            ).to.equal(el);
        });

        it('waits for parsing to complete via MutationObserver', async () => {
            const parent = document.createElement('div');
            const el = document.createElement('div');
            parent.appendChild(el);

            const fakeDoc = {
                readyState: 'loading',
                addEventListener: () => {},
            };
            Object.defineProperty(el, 'ownerDocument', { get: () => fakeDoc });

            attached(parent);

            const promise = Nodes.waitParsed(el);

            const sibling = document.createElement('div');
            parent.appendChild(sibling);

            const resolved = await promise;
            expect(resolved, 'a sibling appended after the element resolves the wait with the element').to.equal(el);

            parent.remove();
        });
        it('waits on every ancestor, not only the parent', async () => {
            const section = document.createElement('section');
            const parent = document.createElement('div');
            const el = document.createElement('div');
            parent.appendChild(el);
            section.appendChild(parent);
            attached(section);

            const fakeDoc = { readyState: 'loading', addEventListener: () => {} };
            Object.defineProperty(el, 'ownerDocument', { get: () => fakeDoc });

            const promise = Nodes.waitParsed(el);

            section.appendChild(document.createElement('p'));

            const resolved = await promise;
            expect(resolved, 'a sibling of an ancestor also means the parser moved past the element').to.equal(el);

            section.remove();
        });

        it('bails out of MutationObserver callback if mutation does not parse the element', async () => {
            const wrapper = document.createElement('div');
            const parent = document.createElement('div');
            const el = document.createElement('div');

            parent.appendChild(el);
            wrapper.appendChild(parent);

            const fakeDoc = {
                readyState: 'loading',
                addEventListener: () => {},
            };
            Object.defineProperty(el, 'ownerDocument', { get: () => fakeDoc });

            const promise = Nodes.waitParsed(el);

            parent.insertBefore(document.createElement('span'), el);

            await new Promise((resolve) => setTimeout(resolve, 10));

            parent.appendChild(document.createElement('span'));

            const resolved = await promise;
            expect(
                resolved,
                'a node inserted before the element is ignored and the wait resolves only once a next sibling arrives',
            ).to.equal(el);
        });
    });

    describe('Nodes.waitDomContentLoaded', () => {
        it('resolves immediately on a complete document', async () => {
            await Nodes.waitDomContentLoaded({ readyState: 'complete', addEventListener() {} });
        });

        it('waits for the event on a loading document', async () => {
            let fire = null;
            const doc = {
                readyState: 'loading',
                addEventListener: (_t, cb) => {
                    fire = cb;
                },
            };
            let settled = false;
            const promise = Nodes.waitDomContentLoaded(doc).then(() => {
                settled = true;
            });
            await new Promise((resolve) => {
                setTimeout(resolve);
            });
            expect(settled, 'a loading document does not resolve before its DOMContentLoaded').to.be.false;
            fire();
            await promise;
            expect(settled, 'the DOMContentLoaded event resolves the wait').to.be.true;
        });

        it('resolves at once for a document with no window to hear the event', async () => {
            await Nodes.waitDomContentLoaded({ readyState: 'interactive', defaultView: null });
        });

        it('resolves in the interactive gap through load, where the event will never come', async () => {
            const handlers = {};
            const detached = [];
            const doc = {
                readyState: 'interactive',
                defaultView: {
                    addEventListener: (type, cb) => {
                        handlers[type] = cb;
                    },
                    removeEventListener: (type) => {
                        detached.push(type);
                    },
                },
            };
            let settled = false;
            Nodes.waitDomContentLoaded(doc).then(() => {
                settled = true;
            });
            await new Promise((resolve) => {
                setTimeout(resolve);
            });
            expect(settled, 'nothing settles on its own while the page only waits').to.be.false;
            handlers.load();
            await new Promise((resolve) => {
                setTimeout(resolve);
            });
            expect(settled, 'in the interactive state the load event also resolves the wait').to.be.true;
            expect(detached, 'the losing listener is detached too').to.include.members(['DOMContentLoaded', 'load']);
        });

        it('prefers DOMContentLoaded while it is still coming, however late', async () => {
            const handlers = {};
            const detached = [];
            const doc = {
                readyState: 'interactive',
                defaultView: {
                    addEventListener: (type, cb) => {
                        handlers[type] = cb;
                    },
                    removeEventListener: (type) => {
                        detached.push(type);
                    },
                },
            };
            let settled = false;
            Nodes.waitDomContentLoaded(doc).then(() => {
                settled = true;
            });
            handlers.DOMContentLoaded();
            expect(detached, 'both listeners leave with the winner').to.include.members(['DOMContentLoaded', 'load']);
            handlers.load();
            await new Promise((resolve) => {
                setTimeout(resolve);
            });
            expect(settled, 'whichever of the two comes first settles once').to.be.true;
        });
    });
});
