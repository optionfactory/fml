import { assert } from 'chai';
import { Template, Fragments, ExpressionEvaluator } from '../../src/ftl/index.mjs';

const modules = {
    math: {
        isEven: (v) => v % 2 === 0,
    },
};

describe('Template', () => {
    it('can iterate with *-each', () => {
        const data = [1, 2];
        const template = Template.fromHtml('<div data-tpl-each="self">{{self}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>1</div><div>2</div>');
    });

    it('iterates a plain object as its {key, value} entries', () => {
        const data = { labels: { it: 'Italiano', en: 'English' } };
        const template = Template.fromHtml('<div data-tpl-each="labels">{{key}}: {{value}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>it: Italiano</div><div>en: English</div>');
    });

    it('iterates a plain object under a tpl-var name', () => {
        const data = { labels: { it: 'Italiano' } };
        const template = Template.fromHtml(
            '<div data-tpl-each="labels" data-tpl-var="e">{{e.key}}: {{e.value}}</div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>it: Italiano</div>');
    });

    it('still rejects a non-plain non-iterable, loudly', () => {
        const data = { d: new Date() };
        const template = Template.fromHtml('<div data-tpl-each="d">{{key}}</div>', modules, data);
        try {
            template.render();
            assert.fail('should have thrown');
        } catch (e) {
            let cause = e;
            while (cause.cause) {
                cause = cause.cause;
            }
            assert.match(cause.message, /Expected an iterable/);
        }
    });

    it('iterates a Map as its {key, value} entries, in its own order', () => {
        const data = { m: new Map([['b', 2], ['a', 1]]) };
        const template = Template.fromHtml('<div data-tpl-each="m">{{key}}={{value}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>b=2</div><div>a=1</div>');
    });

    it('lets a Map entries() iterator iterate raw, as any other iterable', () => {
        const data = { es: new Map([['a', 1]]).entries() };
        const template = Template.fromHtml(
            '<div data-tpl-each="es" data-tpl-var="e">{{e[0]}}={{e[1]}}</div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>a=1</div>');
    });

    it('overlays the iteration stat under its declared name', () => {
        const data = { items: ['a', 'b', 'c'] };
        const template = Template.fromHtml(
            '<div data-tpl-each="items" data-tpl-var="item" data-tpl-stat="s">{{s.index}}/{{s.count}}/{{s.size}} {{item}}</div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>0/1/3 a</div><div>1/2/3 b</div><div>2/3/3 c</div>');
    });

    it('marks the ends and the parity through the stat flags', () => {
        const data = { items: ['a', 'b', 'c'] };
        const template = Template.fromHtml(
            `<div data-tpl-each="items" data-tpl-stat="s" data-tpl-class-append="[s.first ? 'first' : null, s.last ? 'last' : null, s.odd ? 'odd' : 'even']">{{self}}</div>`,
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div class="first even">a</div><div class="odd">b</div><div class="last even">c</div>',
        );
    });

    it('carries the stat over keyed collections, sized without consuming them', () => {
        const data = { labels: { it: 'Italiano', en: 'English' } };
        const template = Template.fromHtml(
            '<i data-tpl-each="labels" data-tpl-stat="s">{{s.count}}/{{s.size}}:{{key}}{{s.last ? "!" : ""}}</i>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<i>1/2:it</i><i>2/2:en!</i>');
    });

    it('never consumes an iterator to learn the size: an unsized stat reads null', () => {
        const data = {
            gen: (function* () {
                yield 'x';
                yield 'y';
            })(),
            set: new Set(['a', 'b']),
        };
        const template = Template.fromHtml(
            '<b data-tpl-each="gen" data-tpl-stat="s">{{s.index}}({{s.size ?? "?"}}) {{self}}</b><i data-tpl-each="set" data-tpl-stat="s">{{s.last}} {{self}}</i>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<b>0(?) x</b><b>1(?) y</b><i>false a</i><i>true b</i>',
        );
    });

    it('exposes the stat to tpl-when, which gates after each opened the scope', () => {
        const data = { items: ['a', 'b', 'c', 'd'] };
        const template = Template.fromHtml(
            '<div data-tpl-each="items" data-tpl-stat="s" data-tpl-when="s.even">{{self}}</div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>a</div><div>c</div>');
    });

    it('lets an item property sharing the stat name win, as data always does', () => {
        const data = { items: [{ s: 'shadow' }] };
        const template = Template.fromHtml(
            '<div data-tpl-each="items" data-tpl-stat="s">{{s}}</div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>shadow</div>');
    });

    it('lets an iterable plain object iterate as itself, not as entries', () => {
        const data = {
            gen: {
                [Symbol.iterator]: function* () {
                    yield 'a';
                    yield 'b';
                },
            },
        };
        const template = Template.fromHtml('<div data-tpl-each="gen">{{self}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>a</div><div>b</div>');
    });
    it('can skip rendering with *-if', () => {
        const data = {};
        const template = Template.fromHtml('<div data-tpl-if="false">{{v}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '');
    });
    it('can render with *-if', () => {
        const data = { a: 1 };
        const template = Template.fromHtml('<div data-tpl-if="true">{{a}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>1</div>');
    });
    it('can render text from a text node', () => {
        const data = { a: '<>' };
        const template = Template.fromHtml('<div>b{{a}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>b&lt;&gt;d</div>');
    });
    it('rendering null text from a text node yield empty string', () => {
        const data = { a: null };
        const template = Template.fromHtml('<div>b{{a}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>bd</div>');
    });
    it('rendering undefined text from a text node yield empty string', () => {
        const data = { a: undefined };
        const template = Template.fromHtml('<div>b{{a}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>bd</div>');
    });
    it('can render html from a text node', () => {
        const data = { a: '<span></span>' };
        const template = Template.fromHtml('<div>b{{{a}}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>b<span></span>d</div>');
    });
    it('can render html from a node', () => {
        const data = { a: document.createElement('span') };
        const template = Template.fromHtml('<div>b{{{{a}}}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>b<span></span>d</div>');
    });
    it('null node is rendered as an empty fragment', () => {
        const data = { a: null };
        const template = Template.fromHtml('<div>b{{{{a}}}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>bd</div>');
    });
    it('undefined node is rendered as an empty fragment', () => {
        const data = {};
        const template = Template.fromHtml('<div>b{{{{a}}}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>bd</div>');
    });
    it('rendering null text from an html node yield empty string', () => {
        const data = { a: null };
        const template = Template.fromHtml('<div>b{{{a}}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>bd</div>');
    });
    it('rendering undefined text from an html node yield empty string', () => {
        const data = { a: undefined };
        const template = Template.fromHtml('<div>b{{{a}}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>bd</div>');
    });
    it('rendering null text alone yields an empty element', () => {
        const data = { a: null };
        const template = Template.fromHtml('<div>{{a}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });
    it('rendering undefined text alone yields an empty element', () => {
        const data = { a: undefined };
        const template = Template.fromHtml('<div>{{a}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });
    it('rendering null html alone yields an empty element', () => {
        const data = { a: null };
        const template = Template.fromHtml('<div>{{{a}}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });
    it('rendering undefined html alone yields an empty element', () => {
        const data = { a: undefined };
        const template = Template.fromHtml('<div>{{{a}}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });
    it('rendering null node alone yields an empty element', () => {
        const data = { a: null };
        const template = Template.fromHtml('<div>{{{{a}}}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });
    it('rendering undefined node alone yields an empty element', () => {
        const data = {};
        const template = Template.fromHtml('<div>{{{{a}}}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });
    it('a null segment does not drop its siblings in the same text node', () => {
        const data = { a: null, c: 'x' };
        const template = Template.fromHtml('<div>b{{a}}{{c}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>bxd</div>');
    });
    it('a lone brace in templated text is preserved', () => {
        const data = { x: 42 };
        const template = Template.fromHtml('<div>cost {{x}} is {high}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>cost 42 is {high}</div>');
    });
    it('rendering a number from an html node yields its string', () => {
        const data = { a: 42 };
        const template = Template.fromHtml('<div>b{{{a}}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>b42d</div>');
    });
    it('rendering an object from an html node yields its string', () => {
        const data = {
            a: {
                toString() {
                    return '<span></span>';
                },
            },
        };
        const template = Template.fromHtml('<div>b{{{a}}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>b<span></span>d</div>');
    });
    it('rendering a non-node from a node interpolation shows a clear error', () => {
        const data = { a: 42 };
        const template = Template.fromHtml('<div>b{{{{a}}}}d</div>', modules, data);
        try {
            template.render();
            assert.fail('Should have thrown');
        } catch (ex) {
            let cause = ex;
            while (cause.cause !== undefined) {
                cause = cause.cause;
            }
            assert.include(cause.message, 'Expected a Node');
        }
    });

    it('can evaluate a data-* attribute', () => {
        const data = { a: 1, b: 2 };
        const template = Template.fromHtml('<div data-tpl-former="a" data-tpl-latter="b">content</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div former="1" latter="2">content</div>');
    });
    it('can *-remove-tag', () => {
        const data = [1, 2, 3, 4];
        const template = Template.fromHtml('<div data-tpl-remove="tag">123</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '123');
    });
    it('can *-remove-body', () => {
        const data = [1, 2, 3, 4];
        const template = Template.fromHtml('<div data-tpl-remove="body">123</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });
    it('removing tag does not cause double evaluation', () => {
        const data = { a: "{{'1'}}" };
        const template = Template.fromHtml('<div data-tpl-remove="tag">{{a}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), "{{'1'}}");
    });
    it('can *-remove-tag from *-each', () => {
        const data = [1, 2, 3, 4];
        const template = Template.fromHtml(
            '<div data-tpl-each="self" data-tpl-remove="tag">{{ self }}</div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '1234');
    });
    it('can *-remove-tag from *-if', () => {
        const data = {};
        const template = Template.fromHtml(
            '<div data-tpl-if="true" data-tpl-remove="tag">{{ 1 }}</div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '1');
    });
    it('can evaluate nested tags (each -> if)', () => {
        const data = [1, 2, 3, 4];
        const template = Template.fromHtml(
            '<div data-tpl-each="self"><span data-tpl-if="#math:isEven(self)">{{ self }}</span></div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div></div><div><span>2</span></div><div></div><div><span>4</span></div>',
        );
    });
    it('can evaluate nested tags (each -> if) removing tags', () => {
        const data = [1, 2, 3, 4];
        const template = Template.fromHtml(
            '<div data-tpl-each="self" data-tpl-remove="tag"><span data-tpl-if="#math:isEven(self)" data-tpl-remove="tag">{{ self }}</span></div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '24');
    });
    it('can evaluate nested tags (if -> each)', () => {
        const data = [1, 2, 3, 4];
        const template = Template.fromHtml(
            '<div data-tpl-if="#math:isEven(2)"><span data-tpl-each="self">{{ self }}</span></div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div><span>1</span><span>2</span><span>3</span><span>4</span></div>',
        );
    });
    it('can evaluate nested tags (if -> each) removing tags', () => {
        const data = [1, 2, 3, 4];
        const template = Template.fromHtml(
            '<div data-tpl-if="#math:isEven(2)" data-tpl-remove="tag"><span data-tpl-each="self" data-tpl-remove="tag">{{ self }}</span></div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '1234');
    });
    it('nodes can be marked as verbatim', () => {
        const data = { a: 1 };
        const template = Template.fromHtml(
            `<div data-tpl-verbatim><span data-tpl-each="ignored">{{ test }}</span></div>`,
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div><span data-tpl-each="ignored">{{ test }}</span></div>');
    });
    it('nodes can be marked as verbatim after being conditionally evaluated', () => {
        const data = { a: 1 };
        const template = Template.fromHtml(
            `<div data-tpl-verbatim data-tpl-if="true"><span data-tpl-each="ignored">{{ test }}</span></div>`,
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div><span data-tpl-each="ignored">{{ test }}</span></div>');
    });
    //currently tpl-remove has lower priority
    it('nodes can be marked as verbatim and tag removed', () => {
        const data = { a: 1 };
        const template = Template.fromHtml(
            `<div data-tpl-verbatim data-tpl-remove="tag"><span data-tpl-each="ignored">{{ test }}</span></div>`,
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<span data-tpl-each="ignored">{{ test }}</span>');
    });
    it('nodes can be marked as verbatim and body removed', () => {
        const data = { a: 1 };
        const template = Template.fromHtml(
            `<div data-tpl-verbatim data-tpl-remove="body"><span data-tpl-each="ignored">{{ test }}</span></div>`,
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });
    it('inner text node is not reevaluated when generated by html interpolation', () => {
        const data = { a: 1 };
        const template = Template.fromHtml(`<div>{{{ "{{a}}" }}}</div>`, modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>{{a}}</div>');
    });
    it('inner nodes are not reevaluated when generated by tpl-each', () => {
        const data = [`{{'1'}}`, `{{'2'}}`];
        const template = Template.fromHtml(`<div data-tpl-each="self">{{self}}</div>`, modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), `<div>{{'1'}}</div><div>{{'2'}}</div>`);
    });
    it('can show error', () => {
        const data = [1, 2];
        const template = Template.fromHtml(`<div id="container">
                    <span>something ignored</span>
                    <div data-tpl-each="self">  
                        {{self.boom()}}
                    </div>
                </div>`);
        let caught = null;
        try {
            template.withEvaluator(new ExpressionEvaluator(modules, data)).render();
        } catch (ex) {
            caught = ex;
        }
        assert.isDefined(caught, 'Should have thrown');
        assert.strictEqual(
            caught.message,
            'Error rendering template in `<div id="container"><span>something ignored</span><div data-tpl-each="self">{{self.boom()}}</div></div>`',
        );
    });
    it('can show error for text nodes', () => {
        const data = [1, 2];
        const template = Template.fromHtml(`

            {{self.boom()}}

        `);
        let caught = null;
        try {
            template.withEvaluator(new ExpressionEvaluator(modules, data)).render();
        } catch (ex) {
            caught = ex;
        }
        assert.isDefined(caught, 'Should have thrown');
        assert.strictEqual(caught.message, 'Error rendering template in `{{self.boom()}}`');
    });
    it('can scope variables using *-with and *-var', () => {
        const data = { user: { name: 'Alice' } };
        const template = Template.fromHtml(
            '<div data-tpl-with="user" data-tpl-var="u">{{u.name}}</div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>Alice</div>');
    });

    it('can scope variables using *-with without a custom variable name', () => {
        const data = { scope: { name: 'Bob' } };
        const template = Template.fromHtml('<div data-tpl-with="scope">{{name}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>Bob</div>');
    });

    it('throws error when *-each is given a non-iterable parameter', () => {
        const data = { nonIterable: 123 };
        const template = Template.fromHtml('<div data-tpl-each="nonIterable">test</div>', modules, data);

        try {
            template.render();
            assert.fail('Should have thrown an error');
        } catch (ex) {
            assert.match(ex.message, /Error rendering template/);
            assert.match(ex.cause.message, /Error evaluating command tplEach/);
            assert.match(ex.cause.cause.message, /Expected an iterable/);
        }
    });
    it('can filter rendering with *-when directives', () => {
        const data = { ok: true };
        const template = Template.fromHtml(
            '<div><span data-tpl-when="ok">Yes</span><span data-tpl-when="!ok">No</span></div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div><span>Yes</span></div>');
    });

    it('can append classes using *-class-append directives', () => {
        const data = { myClasses: 'foo bar', extra: null };
        const template = Template.fromHtml(
            '<div class="base" data-tpl-class-append="myClasses"></div><span class="base" data-tpl-class-append="extra"></span>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div class="base foo bar"></div><span class="base"></span>');
    });

    it('can append arrays of classes using *-class-append', () => {
        const data = { classArr: ['active', 'enabled'] };
        const template = Template.fromHtml('<div class="base" data-tpl-class-append="classArr"></div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div class="base active enabled"></div>');
    });

    it('can append attributes using *-attr-append', () => {
        const data = {
            attrs: [
                ['disabled', 'true'],
                ['title', 'hello'],
            ],
            empty: null,
        };
        const template = Template.fromHtml(
            '<button data-tpl-attr-append="attrs"></button><div data-tpl-attr-append="empty"></div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<button disabled="true" title="hello"></button><div></div>');
    });

    it('can remove the entire element with *-remove="all"', () => {
        const template = Template.fromHtml('<div><span data-tpl-remove="all">gone</span></div>', modules, {});
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });

    it('toggles boolean data attributes as explicit flags', () => {
        const data = { flagTrue: true, flagFalse: false };
        const template = Template.fromHtml(
            '<div data-tpl-disabled="flagTrue" data-tpl-hidden="flagFalse"></div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div disabled=""></div>');
    });

    it('can instantiate templates via alternative static factory methods', () => {
        const tplEl = document.createElement('template');
        tplEl.id = 'target-selector';
        tplEl.content.appendChild(document.createTextNode('{{val}}'));
        document.body.appendChild(tplEl);

        const t1 = Template.fromSelector('#target-selector', modules, { val: '1' });
        assert.strictEqual(Fragments.toHtml(t1.render()), '1');

        const t2 = Template.fromTemplate(tplEl, modules, { val: '2' });
        assert.strictEqual(Fragments.toHtml(t2.render()), '2');

        const frag = document.createDocumentFragment();
        frag.appendChild(document.createTextNode('{{val}}'));
        const t3 = Template.fromFragment(frag, modules, { val: '3' });
        assert.strictEqual(Fragments.toHtml(t3.render()), '3');

        tplEl.remove();
    });

    it('throws errors when fromSelector catches a non-template element or nothing', () => {
        const badEl = document.createElement('div');
        badEl.id = 'bad-selector';
        document.body.appendChild(badEl);

        assert.throws(() => Template.fromSelector('#bad-selector'), /template selector does not match/);
        assert.throws(() => Template.fromSelector('#completely-missing'), /template selector does not match/);

        badEl.remove();
    });

    it('rebinds the scope and the fragment fluently', () => {
        const base = Template.fromHtml('<div>{{val}} {{ #extra:go() }}</div>', {}, []);

        const t1 = base.withEvaluator(new ExpressionEvaluator({ extra: { go: () => 'yes' } }, [{ val: 'ok' }]));
        assert.strictEqual(Fragments.toHtml(t1.render()), '<div>ok yes</div>');

        //a registry rebinds a compiled template through the scope it exposes
        const mockRegistry = {
            evaluator: () => new ExpressionEvaluator({ extra: { go: () => 'reg' } }, [{ val: 'hi' }]),
        };
        const t2 = base.withEvaluator(mockRegistry.evaluator());
        assert.strictEqual(Fragments.toHtml(t2.render()), '<div>hi reg</div>');

        const altFrag = document.createDocumentFragment();
        altFrag.appendChild(document.createTextNode('{{val}}'));

        const t3 = base
            .withFragment(altFrag)
            .withEvaluator(new ExpressionEvaluator({}, []))
            .withModule('extra', { go: () => 'alone' })
            .withOverlay({ val: 'hello' });

        assert.strictEqual(Fragments.toHtml(t3.render()), 'hello');

        assert.strictEqual(t3.evaluateExpression('val'), 'hello');
        assert.strictEqual(t3.evaluateExpression('other', { other: 42 }), 42);
        assert.isDefined(t3.evaluator());
    });

    it('can target external DOM components for rendering output operations', () => {
        const target = document.createElement('div');
        target.id = 'render-target';
        target.innerHTML = '<span>initial</span>';
        document.body.appendChild(target);

        const template = Template.fromHtml('<b>data</b>', {}, []);

        template.appendTo(target);
        assert.strictEqual(target.innerHTML, '<span>initial</span><b>data</b>');

        template.renderTo(target);
        assert.strictEqual(target.innerHTML, '<b>data</b>');

        template.appendToSelector('#render-target');
        assert.strictEqual(target.innerHTML, '<b>data</b><b>data</b>');

        template.renderToSelector('#render-target');
        assert.strictEqual(target.innerHTML, '<b>data</b>');

        template.renderToSelector('#missing-target-element');
        template.appendToSelector('#missing-target-element');

        target.remove();
    });
    it('gracefully handles empty arrays in *-class-append', () => {
        const data = { emptyArray: [], emptyStrings: [' ', ''] };
        const template = Template.fromHtml(
            '<div class="base" data-tpl-class-append="emptyArray"></div><span data-tpl-class-append="emptyStrings"></span>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div class="base"></div><span></span>');
    });

    it('ignores non-tpl dataset attributes during attribute compilation', () => {
        const data = { val: 1 };
        const template = Template.fromHtml('<div data-other="ignored" data-tpl-test="val"></div>', modules, data);
        const rendered = template.render();

        assert.strictEqual(Fragments.toHtml(rendered), '<div data-other="ignored" test="1"></div>');
    });

    it('throws RenderError when a dynamic data-tpl-* attribute expression fails', () => {
        const template = Template.fromHtml('<div data-tpl-custom="boom()"></div>', modules, {});

        try {
            template.render();
            assert.fail('Should have thrown an error');
        } catch (ex) {
            assert.match(ex.message, /Error rendering template/);
            assert.match(ex.cause.message, /Error evaluating command tplCustom/);
        }
    });

    it('keeps converting dataset keys after the attribute cache has evicted the oldest ones', () => {
        //the cache holds 1000 entries: render well past it so the oldest
        //conversions are evicted, then ask for one of them again
        const html = Array.from({ length: 1200 }, (_, i) => `<i data-tpl-prop${i}="'v${i}'"></i>`).join('');
        const rendered = Template.fromHtml(html, modules).render();

        const spans = rendered.querySelectorAll('i');
        assert.lengthOf(spans, 1200);
        assert.strictEqual(spans[0].getAttribute('prop0'), 'v0', 'the oldest entry survived the churn');
        assert.strictEqual(spans[1199].getAttribute('prop1199'), 'v1199');
    });
});
