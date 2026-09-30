import { assert } from 'chai';
import { Template, Fragments, ExpressionEvaluator, RenderError } from '../../src/ftl/index.mjs';
import { attached } from '../harness.mjs';

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
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>1</div><div>2</div>',
            'tpl-each renders the element once per item of an array, each seeing its item as self',
        );
    });

    it('iterates a plain object as its {key, value} entries', () => {
        const data = { labels: { it: 'Italiano', en: 'English' } };
        const template = Template.fromHtml('<div data-tpl-each="labels">{{key}}: {{value}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>it: Italiano</div><div>en: English</div>',
            'a plain object iterates as key and value entries in Object.entries order',
        );
    });

    it('iterates a plain object under a tpl-var name', () => {
        const data = { labels: { it: 'Italiano' } };
        const template = Template.fromHtml(
            '<div data-tpl-each="labels" data-tpl-var="e">{{e.key}}: {{e.value}}</div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>it: Italiano</div>',
            'with tpl-var each plain object entry is reachable under that name',
        );
    });

    it('still rejects a non-plain non-iterable, loudly', () => {
        const data = { d: new Date() };
        const template = Template.fromHtml('<div data-tpl-each="d">{{key}}</div>', modules, data);
        const e = assert.throws(
            () => template.render(),
            Error,
            undefined,
            'rendering tpl-each over a value that is not iterable throws',
        );
        let cause = e;
        while (cause.cause) {
            cause = cause.cause;
        }
        assert.match(
            cause.message,
            /Expected an iterable/,
            'a Date is neither iterable nor a plain object, so tpl-each throws instead of rendering nothing',
        );
    });

    it('iterates a Map as its {key, value} entries, in its own order', () => {
        const data = {
            m: new Map([
                ['b', 2],
                ['a', 1],
            ]),
        };
        const template = Template.fromHtml('<div data-tpl-each="m">{{key}}={{value}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>b=2</div><div>a=1</div>',
            'a Map iterates as key and value entries in its own insertion order, not sorted',
        );
    });

    it('lets a Map entries() iterator iterate raw, as any other iterable', () => {
        const data = { es: new Map([['a', 1]]).entries() };
        const template = Template.fromHtml(
            '<div data-tpl-each="es" data-tpl-var="e">{{e[0]}}={{e[1]}}</div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>a=1</div>',
            'an iterator over Map entries is an ordinary iterable, so its items are the raw pairs',
        );
    });

    it('overlays the iteration stat under its declared name', () => {
        const data = { items: ['a', 'b', 'c'] };
        const template = Template.fromHtml(
            '<div data-tpl-each="items" data-tpl-var="item" data-tpl-stat="s">{{s.index}}/{{s.count}}/{{s.size}} {{item}}</div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>0/1/3 a</div><div>1/2/3 b</div><div>2/3/3 c</div>',
            'the stat carries the zero based index, the one based count and the collection size',
        );
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
            'first and last mark the ends, and even and odd follow the zero based index',
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
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<i>1/2:it</i><i>2/2:en!</i>',
            'a plain object gets a stat whose size is its number of entries, so last is known',
        );
    });

    it('reads no size from the collection when no stat asks for one', () => {
        let reads = 0;
        const bag = {
            get size() {
                ++reads;
                return 2;
            },
            *[Symbol.iterator]() {
                yield 'p';
                yield 'q';
            },
        };
        const rendered = Template.fromHtml('<i data-tpl-each="bag">{{self}}</i>', modules, { bag }).render();

        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<i>p</i><i>q</i>',
            'the collection renders as usual without the stat',
        );
        assert.strictEqual(reads, 0, 'without tpl-stat the size getter is never read');
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
            'a generator has no size, so the size reads null, while a Set gives its size and so a last flag',
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
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>a</div><div>c</div>',
            'tpl-when runs inside the scope tpl-each opened, so it can filter on the stat',
        );
    });

    it('lets an item property sharing the stat name win, as data always does', () => {
        const data = { items: [{ s: 'shadow' }] };
        const template = Template.fromHtml('<div data-tpl-each="items" data-tpl-stat="s">{{s}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>shadow</div>',
            'the stat overlay sits beneath the item, so an item property of the same name wins',
        );
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
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>a</div><div>b</div>',
            'an object with its own iterator iterates through it rather than as key and value entries',
        );
    });
    it('can skip rendering with *-if', () => {
        const data = {};
        const template = Template.fromHtml('<div data-tpl-if="false">{{v}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '', 'tpl-if with a falsy expression removes the element');
    });
    it('can render with *-if', () => {
        const data = { a: 1 };
        const template = Template.fromHtml('<div data-tpl-if="true">{{a}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>1</div>',
            'tpl-if with a truthy expression keeps the element and renders its body',
        );
    });
    it('can render text from a text node', () => {
        const data = { a: '<>' };
        const template = Template.fromHtml('<div>b{{a}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>b&lt;&gt;d</div>',
            'a double brace interpolation inserts text, escaping markup characters',
        );
    });
    it('rendering null text from a text node yield empty string', () => {
        const data = { a: null };
        const template = Template.fromHtml('<div>b{{a}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>bd</div>',
            'a null text interpolation inserts nothing and keeps the text around it',
        );
    });
    it('rendering undefined text from a text node yield empty string', () => {
        const data = { a: undefined };
        const template = Template.fromHtml('<div>b{{a}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>bd</div>',
            'an undefined text interpolation inserts nothing and keeps the text around it',
        );
    });
    it('can render html from a text node', () => {
        const data = { a: '<span></span>' };
        const template = Template.fromHtml('<div>b{{{a}}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>b<span></span>d</div>',
            'a triple brace interpolation inserts its value parsed as html',
        );
    });
    it('can render html from a node', () => {
        const data = { a: document.createElement('span') };
        const template = Template.fromHtml('<div>b{{{{a}}}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>b<span></span>d</div>',
            'a quadruple brace interpolation inserts the node itself',
        );
    });
    it('null node is rendered as an empty fragment', () => {
        const data = { a: null };
        const template = Template.fromHtml('<div>b{{{{a}}}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>bd</div>',
            'a null node interpolation inserts nothing and keeps the text around it',
        );
    });
    it('undefined node is rendered as an empty fragment', () => {
        const data = {};
        const template = Template.fromHtml('<div>b{{{{a}}}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>bd</div>',
            'an undefined node interpolation inserts nothing and keeps the text around it',
        );
    });
    it('rendering null text from an html node yield empty string', () => {
        const data = { a: null };
        const template = Template.fromHtml('<div>b{{{a}}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>bd</div>',
            'a null html interpolation inserts nothing and keeps the text around it',
        );
    });
    it('rendering undefined text from an html node yield empty string', () => {
        const data = { a: undefined };
        const template = Template.fromHtml('<div>b{{{a}}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>bd</div>',
            'an undefined html interpolation inserts nothing and keeps the text around it',
        );
    });
    it('rendering null text alone yields an empty element', () => {
        const data = { a: null };
        const template = Template.fromHtml('<div>{{a}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div></div>',
            'a null text interpolation as the only content leaves the element empty',
        );
    });
    it('rendering undefined text alone yields an empty element', () => {
        const data = { a: undefined };
        const template = Template.fromHtml('<div>{{a}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div></div>',
            'an undefined text interpolation as the only content leaves the element empty',
        );
    });
    it('rendering null html alone yields an empty element', () => {
        const data = { a: null };
        const template = Template.fromHtml('<div>{{{a}}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div></div>',
            'a null html interpolation as the only content leaves the element empty',
        );
    });
    it('rendering undefined html alone yields an empty element', () => {
        const data = { a: undefined };
        const template = Template.fromHtml('<div>{{{a}}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div></div>',
            'an undefined html interpolation as the only content leaves the element empty',
        );
    });
    it('rendering null node alone yields an empty element', () => {
        const data = { a: null };
        const template = Template.fromHtml('<div>{{{{a}}}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div></div>',
            'a null node interpolation as the only content leaves the element empty',
        );
    });
    it('rendering undefined node alone yields an empty element', () => {
        const data = {};
        const template = Template.fromHtml('<div>{{{{a}}}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div></div>',
            'an undefined node interpolation as the only content leaves the element empty',
        );
    });
    it('a null segment does not drop its siblings in the same text node', () => {
        const data = { a: null, c: 'x' };
        const template = Template.fromHtml('<div>b{{a}}{{c}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>bxd</div>',
            'a null part is skipped while the parts after it in the same text node still render',
        );
    });
    it('a lone brace in templated text is preserved', () => {
        const data = { x: 42 };
        const template = Template.fromHtml('<div>cost {{x}} is {high}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>cost 42 is {high}</div>',
            'a single brace is not an interpolation, so it stays in the text as written',
        );
    });
    it('rendering a number from an html node yields its string', () => {
        const data = { a: 42 };
        const template = Template.fromHtml('<div>b{{{a}}}d</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>b42d</div>',
            'a non string value in an html interpolation is converted with String before parsing',
        );
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
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>b<span></span>d</div>',
            'an object in an html interpolation is converted through its toString before parsing',
        );
    });
    it('rendering a non-node from a node interpolation shows a clear error', () => {
        const data = { a: 42 };
        const template = Template.fromHtml('<div>b{{{{a}}}}d</div>', modules, data);
        const ex = assert.throws(
            () => template.render(),
            Error,
            undefined,
            'a node interpolation of a value that is not a Node throws',
        );
        let cause = ex;
        while (cause.cause !== undefined) {
            cause = cause.cause;
        }
        assert.include(cause.message, 'Expected a Node', 'the root cause says a node interpolation needs a Node');
    });

    it('can evaluate a data-* attribute', () => {
        const data = { a: 1, b: 2 };
        const template = Template.fromHtml('<div data-tpl-former="a" data-tpl-latter="b">content</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div former="1" latter="2">content</div>',
            'a data-tpl attribute sets the attribute of the same name to the value of its expression',
        );
    });
    it('can *-remove-tag', () => {
        const data = [1, 2, 3, 4];
        const template = Template.fromHtml('<div data-tpl-remove="tag">123</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '123', 'tpl-remove tag replaces the element with its children');
    });
    it('can *-remove-body', () => {
        const data = [1, 2, 3, 4];
        const template = Template.fromHtml('<div data-tpl-remove="body">123</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div></div>',
            'tpl-remove body keeps the element and drops its children',
        );
    });
    it('removing tag does not cause double evaluation', () => {
        const data = { a: "{{'1'}}" };
        const template = Template.fromHtml('<div data-tpl-remove="tag">{{a}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            "{{'1'}}",
            'the children moved out by tpl-remove tag are not evaluated a second time',
        );
    });
    it('can *-remove-tag from *-each', () => {
        const data = [1, 2, 3, 4];
        const template = Template.fromHtml(
            '<div data-tpl-each="self" data-tpl-remove="tag">{{ self }}</div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '1234',
            'tpl-remove tag on a tpl-each element leaves only the rendered bodies of each item',
        );
    });
    it('can *-remove-tag from *-if', () => {
        const data = {};
        const template = Template.fromHtml(
            '<div data-tpl-if="true" data-tpl-remove="tag">{{ 1 }}</div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '1',
            'tpl-remove tag on a tpl-if element leaves only its rendered body when the condition holds',
        );
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
            'a tpl-if nested in tpl-each is evaluated against each item',
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
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '24',
            'tpl-remove tag works on both the tpl-each element and the tpl-if element inside it',
        );
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
            'a tpl-each nested in a tpl-if renders once the condition holds',
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
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '1234',
            'tpl-remove tag works on both the tpl-if element and the tpl-each element inside it',
        );
    });
    it('nodes can be marked as verbatim', () => {
        const data = { a: 1 };
        const template = Template.fromHtml(
            `<div data-tpl-verbatim><span data-tpl-each="ignored">{{ test }}</span></div>`,
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div><span data-tpl-each="ignored">{{ test }}</span></div>',
            'tpl-verbatim leaves the whole subtree unevaluated, its directives and interpolations included',
        );
    });
    it('nodes can be marked as verbatim after being conditionally evaluated', () => {
        const data = { a: 1 };
        const template = Template.fromHtml(
            `<div data-tpl-verbatim data-tpl-if="true"><span data-tpl-each="ignored">{{ test }}</span></div>`,
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div><span data-tpl-each="ignored">{{ test }}</span></div>',
            'tpl-if runs before tpl-verbatim, and the kept subtree stays unevaluated',
        );
    });
    it('nodes can be marked as verbatim and tag removed', () => {
        const data = { a: 1 };
        const template = Template.fromHtml(
            `<div data-tpl-verbatim data-tpl-remove="tag"><span data-tpl-each="ignored">{{ test }}</span></div>`,
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<span data-tpl-each="ignored">{{ test }}</span>',
            'tpl-verbatim with tpl-remove tag leaves the unevaluated children in place of the element',
        );
    });
    it('nodes can be marked as verbatim and body removed', () => {
        const data = { a: 1 };
        const template = Template.fromHtml(
            `<div data-tpl-verbatim data-tpl-remove="body"><span data-tpl-each="ignored">{{ test }}</span></div>`,
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div></div>',
            'tpl-remove body empties a verbatim element as it does any other',
        );
    });
    it('inner text node is not reevaluated when generated by html interpolation', () => {
        const data = { a: 1 };
        const template = Template.fromHtml(`<div>{{{ "{{a}}" }}}</div>`, modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>{{a}}</div>',
            'text produced by an html interpolation is not evaluated again',
        );
    });
    it('inner nodes are not reevaluated when generated by tpl-each', () => {
        const data = [`{{'1'}}`, `{{'2'}}`];
        const template = Template.fromHtml(`<div data-tpl-each="self">{{self}}</div>`, modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            `<div>{{'1'}}</div><div>{{'2'}}</div>`,
            'text rendered for each item is not evaluated again',
        );
    });
    it('can show error', () => {
        const data = [1, 2];
        const template = Template.fromHtml(`<div id="container">
                    <span>something ignored</span>
                    <div data-tpl-each="self">  
                        {{self.boom()}}
                    </div>
                </div>`);
        const caught = assert.throws(
            () => template.withEvaluator(new ExpressionEvaluator(modules, data)).render(),
            Error,
            undefined,
            'a failing expression in a tpl-each body fails the render',
        );
        assert.strictEqual(
            caught.message,
            'Error evaluating data-tpl-each="self" in `<div>`',
            'the error names the failing directive and the open tag of its element',
        );
    });
    it('can show error for text nodes', () => {
        const data = [1, 2];
        const template = Template.fromHtml(`

            {{self.boom()}}

        `);
        const caught = assert.throws(
            () => template.withEvaluator(new ExpressionEvaluator(modules, data)).render(),
            Error,
            undefined,
            'a failing expression in a text node fails the render',
        );
        assert.strictEqual(
            caught.message,
            'Error evaluating text node in `{{self.boom()}}`',
            'the error names the text node by its source, trimmed of the template whitespace',
        );
    });
    it('can scope variables using *-with and *-var', () => {
        const data = { user: { name: 'Alice' } };
        const template = Template.fromHtml(
            '<div data-tpl-with="user" data-tpl-var="u">{{u.name}}</div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>Alice</div>',
            'tpl-with with tpl-var puts the value under that name for the body',
        );
    });

    it('can scope variables using *-with without a custom variable name', () => {
        const data = { scope: { name: 'Bob' } };
        const template = Template.fromHtml('<div data-tpl-with="scope">{{name}}</div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div>Bob</div>',
            'tpl-with without tpl-var pushes the value itself as the overlay for the body',
        );
    });

    it('throws error when *-each is given a non-iterable parameter', () => {
        const data = { nonIterable: 123 };
        const template = Template.fromHtml('<div data-tpl-each="nonIterable">test</div>', modules, data);

        const ex = assert.throws(() => template.render(), Error, undefined, 'tpl-each over a number fails the render');
        assert.strictEqual(
            ex.message,
            'Error evaluating data-tpl-each="nonIterable" in `<div>`',
            'the error names the directive and the open tag of its element',
        );
        assert.match(
            ex.cause.message,
            /Expected an iterable/,
            'the cause is the error tpl-each raised for a value that is not iterable',
        );
        assert.isUndefined(ex.cause.cause, 'no frame wraps the root cause again');
    });
    it('frames the path from the outermost nesting down to the failure', () => {
        const template = Template.fromHtml(
            `<section data-tpl-with="outer">
                <ul data-tpl-each="rows">
                    <li data-tpl-if="self.boom()">x</li>
                </ul>
            </section>`,
            modules,
            { outer: { rows: [1] } },
        );

        const ex = assert.throws(
            () => template.render(),
            Error,
            undefined,
            'a failing expression deep in the template fails the render',
        );
        const chain = [];
        for (let e = ex; e; e = e.cause) {
            chain.push(e.message);
        }
        assert.deepStrictEqual(
            chain.slice(0, 3),
            [
                'Error evaluating data-tpl-with="outer" in `<section>`',
                'Error evaluating data-tpl-each="rows" in `<ul>`',
                'Error evaluating data-tpl-if="self.boom()" in `<li>`',
            ],
            'outer to inner, one frame per nesting level',
        );
        assert.match(
            chain[chain.length - 1],
            /Method missing|boom/,
            'the last cause is the original error of the failed expression',
        );
        assert.notInclude(ex.message, '<li', 'a frame names its node, it does not carry the subtree');
    });

    it('spends a frame budget rather than growing the chain with the nesting', () => {
        const depth = RenderError.FRAMES + 3;
        const open = Array.from({ length: depth }, () => '<div data-tpl-with="self">').join('');
        const close = '</div>'.repeat(depth);
        const template = Template.fromHtml(`${open}{{ self.boom() }}${close}`, modules, {});

        const ex = assert.throws(
            () => template.render(),
            Error,
            undefined,
            'a failing expression under many nested scopes fails the render',
        );
        let frames = 0;
        for (let e = ex; e instanceof RenderError; e = e.cause) {
            frames++;
        }
        assert.strictEqual(frames, RenderError.FRAMES, 'the budget caps the frames');
        assert.isTrue(
            ex.truncated,
            'a chain cut at the budget is marked truncated, saying the outer frames were dropped',
        );
    });

    it('can filter rendering with *-when directives', () => {
        const data = { ok: true };
        const template = Template.fromHtml(
            '<div><span data-tpl-when="ok">Yes</span><span data-tpl-when="!ok">No</span></div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div><span>Yes</span></div>',
            'tpl-when removes the element when its expression is falsy and keeps it when truthy',
        );
    });

    it('can append classes using *-class-append directives', () => {
        const data = { myClasses: 'foo bar', extra: null };
        const template = Template.fromHtml(
            '<div class="base" data-tpl-class-append="myClasses"></div><span class="base" data-tpl-class-append="extra"></span>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div class="base foo bar"></div><span class="base"></span>',
            'tpl-class-append adds space separated classes to the existing ones and adds nothing for null',
        );
    });

    it('can append arrays of classes using *-class-append', () => {
        const data = { classArr: ['active', 'enabled'] };
        const template = Template.fromHtml('<div class="base" data-tpl-class-append="classArr"></div>', modules, data);
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div class="base active enabled"></div>',
            'tpl-class-append adds every class of an array',
        );
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
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<button disabled="true" title="hello"></button><div></div>',
            'tpl-attr-append sets each name and value pair as an attribute and sets nothing for null',
        );
    });

    it('can remove the entire element with *-remove="all"', () => {
        const template = Template.fromHtml('<div><span data-tpl-remove="all">gone</span></div>', modules, {});
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div></div>',
            'tpl-remove all removes the element and its body',
        );
    });

    it('toggles boolean data attributes as explicit flags', () => {
        const data = { flagTrue: true, flagFalse: false };
        const template = Template.fromHtml(
            '<div data-tpl-disabled="flagTrue" data-tpl-hidden="flagFalse"></div>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div disabled=""></div>',
            'a boolean attribute value toggles the attribute: true adds it empty, false leaves it off',
        );
    });

    it('can instantiate templates via alternative static factory methods', () => {
        const tplEl = document.createElement('template');
        tplEl.id = 'target-selector';
        tplEl.content.appendChild(document.createTextNode('{{val}}'));
        attached(tplEl);

        const t1 = Template.fromSelector('#target-selector', modules, { val: '1' });
        assert.strictEqual(
            Fragments.toHtml(t1.render()),
            '1',
            'fromSelector renders the content of the template element the selector matches',
        );

        const t2 = Template.fromTemplate(tplEl, modules, { val: '2' });
        assert.strictEqual(
            Fragments.toHtml(t2.render()),
            '2',
            'fromTemplate renders the content of the template element it is given',
        );

        const frag = document.createDocumentFragment();
        frag.appendChild(document.createTextNode('{{val}}'));
        const t3 = Template.fromFragment(frag, modules, { val: '3' });
        assert.strictEqual(Fragments.toHtml(t3.render()), '3', 'fromFragment renders the fragment it is given');

        tplEl.remove();
    });

    it('throws errors when fromSelector catches a non-template element or nothing', () => {
        const badEl = document.createElement('div');
        badEl.id = 'bad-selector';
        attached(badEl);

        assert.throws(
            () => Template.fromSelector('#bad-selector'),
            /template selector does not match/,
            'a selector matching an element that is not a template is refused',
        );
        assert.throws(
            () => Template.fromSelector('#completely-missing'),
            /template selector does not match/,
            'a selector matching nothing is refused',
        );

        badEl.remove();
    });

    it('rebinds the scope and the fragment fluently', () => {
        const base = Template.fromHtml('<div>{{val}} {{ #extra:go() }}</div>', {}, []);

        const t1 = base.withEvaluator(new ExpressionEvaluator({ extra: { go: () => 'yes' } }, [{ val: 'ok' }]));
        assert.strictEqual(
            Fragments.toHtml(t1.render()),
            '<div>ok yes</div>',
            'withEvaluator renders against the modules and data of the evaluator it is given',
        );

        const mockRegistry = {
            evaluator: () => new ExpressionEvaluator({ extra: { go: () => 'reg' } }, [{ val: 'hi' }]),
        };
        const t2 = base.withEvaluator(mockRegistry.evaluator());
        assert.strictEqual(
            Fragments.toHtml(t2.render()),
            '<div>hi reg</div>',
            'withEvaluator leaves the base unchanged, so the base can be bound to another scope',
        );

        const altFrag = document.createDocumentFragment();
        altFrag.appendChild(document.createTextNode('{{val}}'));

        const t3 = base
            .withFragment(altFrag)
            .withEvaluator(new ExpressionEvaluator({}, []))
            .withModule('extra', { go: () => 'alone' })
            .withOverlay({ val: 'hello' });

        assert.strictEqual(
            Fragments.toHtml(t3.render()),
            'hello',
            'withFragment renders the new fragment, with the module and overlay added after it',
        );

        assert.strictEqual(
            t3.evaluateExpression('val'),
            'hello',
            'evaluateExpression resolves against the overlays added to the template',
        );
        assert.strictEqual(
            t3.evaluateExpression('other', { other: 42 }),
            42,
            'the data passed to evaluateExpression widens the scope for that one call',
        );
        assert.instanceOf(t3.evaluator(), ExpressionEvaluator, 'evaluator() returns the scope the template renders in');
    });

    it('can target external DOM components for rendering output operations', () => {
        const target = document.createElement('div');
        target.id = 'render-target';
        target.innerHTML = '<span>initial</span>';
        attached(target);

        const template = Template.fromHtml('<b>data</b>', {}, []);

        template.appendTo(target);
        assert.strictEqual(
            target.innerHTML,
            '<span>initial</span><b>data</b>',
            'appendTo adds the rendered fragment after the existing children',
        );

        template.renderTo(target);
        assert.strictEqual(
            target.innerHTML,
            '<b>data</b>',
            'renderTo replaces the existing children with the rendered fragment',
        );

        template.appendToSelector('#render-target');
        assert.strictEqual(
            target.innerHTML,
            '<b>data</b><b>data</b>',
            'appendToSelector adds the rendered fragment to the element the selector matches',
        );

        template.renderToSelector('#render-target');
        assert.strictEqual(
            target.innerHTML,
            '<b>data</b>',
            'renderToSelector replaces the children of the element the selector matches',
        );

        template.renderToSelector('#missing-target-element');
        template.appendToSelector('#missing-target-element');

        target.remove();
    });
    it('appends nothing for an empty list or blank class names', () => {
        const data = { emptyArray: [], emptyStrings: [' ', ''] };
        const template = Template.fromHtml(
            '<div class="base" data-tpl-class-append="emptyArray"></div><span data-tpl-class-append="emptyStrings"></span>',
            modules,
            data,
        );
        const rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div class="base"></div><span></span>',
            'an empty class list and blank class names add no class, and no empty class attribute',
        );
    });

    it('ignores non-tpl dataset attributes during attribute compilation', () => {
        const data = { val: 1 };
        const template = Template.fromHtml('<div data-other="ignored" data-tpl-test="val"></div>', modules, data);
        const rendered = template.render();

        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div data-other="ignored" test="1"></div>',
            'dataset keys without the tpl prefix are left as they are',
        );
    });

    it('serializes the offending node only when asked, tidied of the template whitespace', () => {
        const template = Template.fromHtml(`
            <ul class="rows">
                <li class="row" data-tpl-each="rows">{{ nope.deep }}</li>
            </ul>
        `);
        const ex = assert.throws(
            () => template.withOverlay({ rows: [1] }).render(),
            Error,
            undefined,
            'a failing expression in a tpl-each item fails the render',
        );
        assert.instanceOf(ex, RenderError, 'a failure while rendering is reported as a RenderError');
        const failed = /** @type any */ (ex);
        assert.strictEqual(
            failed.message,
            'Error evaluating data-tpl-each="rows" in `<li class="row">`',
            'the frame names the node by its open tag, without the directives',
        );
        assert.strictEqual(failed.node.nodeType, Node.ELEMENT_NODE, 'the live node, not a clone');
        assert.strictEqual(failed.node.className, 'row', 'the reported node is the element that failed');

        const html = failed.html;
        assert.strictEqual(html, '<li class="row">{{ nope.deep }}</li>', 'the markup is there when asked for');
        assert.notMatch(html, />\s{2,}</, 'the template indentation is tidied away');
        assert.strictEqual(html, failed.html, 'reading html again serializes the same markup');
    });

    it('serializes a failing text node too, not only an element', () => {
        const template = Template.fromHtml('<p>  {{ nope.deep }}  </p>');
        const ex = assert.throws(
            () => template.render(),
            Error,
            undefined,
            'a failing expression in a text node fails the render',
        );
        const failed = /** @type any */ (ex);
        assert.strictEqual(
            failed.node.nodeType,
            Node.TEXT_NODE,
            'a failure in an interpolation reports the text node, not its parent element',
        );
        assert.strictEqual(failed.html, '{{ nope.deep }}', 'trimmed of the template whitespace');
    });

    it('evaluates a templated string in the template scope', () => {
        const template = Template.fromHtml('<div></div>', modules, { who: 'world' });
        const shape = (parts) => JSON.stringify(parts.map((p) => p.value));

        assert.strictEqual(
            shape(template.evaluateTemplated('hello {{ who }}')),
            '["hello ","world"]',
            'an interpolation evaluates against the template data',
        );
        assert.strictEqual(
            shape(template.evaluateTemplated('no interpolation')),
            '["no interpolation"]',
            'text without interpolations evaluates to a single literal part',
        );
        assert.strictEqual(
            shape(template.evaluateTemplated('hello {{ who }}', { who: 'overlay' })),
            '["hello ","overlay"]',
            'the overlay widens the scope for the one call',
        );
    });

    it('tidies the template whitespace out of a serialized subtree', () => {
        const host = document.createElement('div');
        host.innerHTML = '\n    <span> keep me </span>\n    <b>\n        <i>deep</i>\n    </b>\n';

        const serialized = RenderError.stringify(host);

        assert.strictEqual(typeof serialized, 'string', 'stringify returns markup text');
        assert.strictEqual(
            serialized,
            '<div><span>keep me</span><b><i>deep</i></b></div>',
            'whitespace only text is dropped and the remaining text trimmed',
        );
        assert.strictEqual(host.childNodes.length, 5, 'the live node is left alone: it serializes a clone');
    });

    it('describes a fragment by the elements it holds', () => {
        const fragment = Fragments.fromHtml('<b>one</b>\n   \n<i class="x">two</i>');
        const described = RenderError.describe(fragment);

        assert.include(described, '<b>', 'the description names the open tag of the first element');
        assert.include(
            described,
            '<i class="x">',
            'the description names the open tag of the second element, its attributes included',
        );
        assert.notInclude(described, '\n', 'the blank text between them is not a child worth naming');
    });

    it('throws RenderError when a dynamic data-tpl-* attribute expression fails', () => {
        const template = Template.fromHtml('<div data-tpl-custom="boom()"></div>', modules, {});

        const ex = assert.throws(
            () => template.render(),
            Error,
            undefined,
            'a failing data-tpl attribute expression fails the render',
        );
        assert.strictEqual(
            ex.message,
            'Error evaluating data-tpl-custom="boom()" in `<div>`',
            'a failing data-tpl attribute expression is reported with the attribute and the open tag',
        );
    });

    it('keeps converting dataset keys after the attribute cache has evicted the oldest ones', () => {
        const html = Array.from({ length: 1200 }, (_, i) => `<i data-tpl-prop${i}="'v${i}'"></i>`).join('');
        const rendered = Template.fromHtml(html, modules).render();

        const spans = rendered.querySelectorAll('i');
        assert.lengthOf(spans, 1200, 'every element renders, past the 1000 entries the attribute cache holds');
        assert.strictEqual(spans[0].getAttribute('prop0'), 'v0', 'the oldest entry survived the churn');
        assert.strictEqual(
            spans[1199].getAttribute('prop1199'),
            'v1199',
            'a dataset key converted after the evictions also sets its attribute',
        );
    });
});
