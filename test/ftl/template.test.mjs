import { assert } from '@esm-bundle/chai';
import { Template, Fragments } from '../../src/ftl/index.mjs';

const modules = {
    math: {
        isEven: (v) => v % 2 === 0,
    },
};

describe('Template', () => {
    it('can iterate with *-each', () => {
        let data = [1, 2];
        let template = Template.fromHtml('<div data-tpl-each="self">{{self}}</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>1</div><div>2</div>');
    });
    it('can skip rendering with *-if', () => {
        let data = {};
        let template = Template.fromHtml('<div data-tpl-if="false">{{v}}</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '');
    });
    it('can render with *-if', () => {
        let data = { a: 1 };
        let template = Template.fromHtml('<div data-tpl-if="true">{{a}}</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>1</div>');
    });
    it('can render html from attribute', () => {
        let data = { a: '<h1>test</h1>' };
        let template = Template.fromHtml('<div data-tpl-html="a">nope</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div><h1>test</h1></div>');
    });
    it('rendering null html from attribute yields empty string', () => {
        let data = { a: null };
        let template = Template.fromHtml('<div data-tpl-html="a">nope</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });
    it('rendering undefined html from attribute yields empty string', () => {
        let data = { a: undefined };
        let template = Template.fromHtml('<div data-tpl-html="a">nope</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });

    it('can render text from attribute', () => {
        let data = { a: '<h1>test</h1>' };
        let template = Template.fromHtml('<div data-tpl-text="a">nope</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>&lt;h1&gt;test&lt;/h1&gt;</div>');
    });
    it('rendering null text from attribute yields empty string', () => {
        let data = { a: null };
        let template = Template.fromHtml('<div data-tpl-text="a">nope</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });
    it('rendering undefined text from attribute yield empty string', () => {
        let data = { a: undefined };
        let template = Template.fromHtml('<div data-tpl-text="a">nope</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });
    it('can render text from a text node', () => {
        let data = { a: '<>' };
        let template = Template.fromHtml('<div>b{{a}}d</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>b&lt;&gt;d</div>');
    });
    it('rendering null text from a text node yield empty string', () => {
        let data = { a: null };
        let template = Template.fromHtml('<div>b{{a}}d</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>bd</div>');
    });
    it('rendering undefined text from a text node yield empty string', () => {
        let data = { a: undefined };
        let template = Template.fromHtml('<div>b{{a}}d</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>bd</div>');
    });
    it('can render html from a text node', () => {
        let data = { a: '<span></span>' };
        let template = Template.fromHtml('<div>b{{{a}}}d</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>b<span></span>d</div>');
    });
    it('can render html from a node', () => {
        let data = { a: document.createElement('span') };
        let template = Template.fromHtml('<div>b{{{{a}}}}d</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>b<span></span>d</div>');
    });
    it('null node is rendered as an empty fragment', () => {
        let data = { a: null };
        let template = Template.fromHtml('<div>b{{{{a}}}}d</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>bd</div>');
    });
    it('null node is rendered as an empty fragment', () => {
        let data = {};
        let template = Template.fromHtml('<div>b{{{{a}}}}d</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>bd</div>');
    });
    it('rendering null text from an html node yield empty string', () => {
        let data = { a: null };
        let template = Template.fromHtml('<div>b{{{a}}}d</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>bd</div>');
    });
    it('rendering undefined text from an html node yield empty string', () => {
        let data = { a: undefined };
        let template = Template.fromHtml('<div>b{{{a}}}d</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>bd</div>');
    });

    it('can evaluate a data-* attribute', () => {
        let data = { a: 1, b: 2 };
        let template = Template.fromHtml('<div data-tpl-former="a" data-tpl-latter="b">content</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div former="1" latter="2">content</div>');
    });
    it('can *-remove-tag', () => {
        let data = [1, 2, 3, 4];
        let template = Template.fromHtml('<div data-tpl-remove="tag">123</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '123');
    });
    it('can *-remove-body', () => {
        let data = [1, 2, 3, 4];
        let template = Template.fromHtml('<div data-tpl-remove="body">123</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });
    it('removing tag does not cause double evaluation', () => {
        let data = { a: "{{'1'}}" };
        let template = Template.fromHtml('<div data-tpl-remove="tag">{{a}}</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), "{{'1'}}");
    });
    it('can *-remove-tag from *-each', () => {
        let data = [1, 2, 3, 4];
        let template = Template.fromHtml(
            '<div data-tpl-each="self" data-tpl-remove="tag">{{ self }}</div>',
            modules,
            data,
        );
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '1234');
    });
    it('can *-remove-tag from *-if', () => {
        let data = {};
        let template = Template.fromHtml('<div data-tpl-if="true" data-tpl-remove="tag">{{ 1 }}</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '1');
    });
    it('can evaluate nested tags (each -> if)', () => {
        let data = [1, 2, 3, 4];
        let template = Template.fromHtml(
            '<div data-tpl-each="self"><span data-tpl-if="#math:isEven(self)">{{ self }}</span></div>',
            modules,
            data,
        );
        let rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div></div><div><span>2</span></div><div></div><div><span>4</span></div>',
        );
    });
    it('can evaluate nested tags (each -> if) removing tags', () => {
        let data = [1, 2, 3, 4];
        let template = Template.fromHtml(
            '<div data-tpl-each="self" data-tpl-remove="tag"><span data-tpl-if="#math:isEven(self)" data-tpl-remove="tag">{{ self }}</span></div>',
            modules,
            data,
        );
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '24');
    });
    it('can evaluate nested tags (if -> each)', () => {
        let data = [1, 2, 3, 4];
        let template = Template.fromHtml(
            '<div data-tpl-if="#math:isEven(2)"><span data-tpl-each="self">{{ self }}</span></div>',
            modules,
            data,
        );
        let rendered = template.render();
        assert.strictEqual(
            Fragments.toHtml(rendered),
            '<div><span>1</span><span>2</span><span>3</span><span>4</span></div>',
        );
    });
    it('can evaluate nested tags (if -> each) removing tags', () => {
        let data = [1, 2, 3, 4];
        let template = Template.fromHtml(
            '<div data-tpl-if="#math:isEven(2)" data-tpl-remove="tag"><span data-tpl-each="self" data-tpl-remove="tag">{{ self }}</span></div>',
            modules,
            data,
        );
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '1234');
    });
    it('nodes can be marked as verbatim', () => {
        let data = { a: 1 };
        let template = Template.fromHtml(
            `<div data-tpl-verbatim><span data-tpl-each="ignored">{{ test }}</span></div>`,
            modules,
            data,
        );
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div><span data-tpl-each="ignored">{{ test }}</span></div>');
    });
    it('nodes can be marked as verbatim after being conditionally evaluated', () => {
        let data = { a: 1 };
        let template = Template.fromHtml(
            `<div data-tpl-verbatim data-tpl-if="true"><span data-tpl-each="ignored">{{ test }}</span></div>`,
            modules,
            data,
        );
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div><span data-tpl-each="ignored">{{ test }}</span></div>');
    });
    //currently tpl-remove has lower priority
    it('nodes can be marked as verbatim and tag removed', () => {
        let data = { a: 1 };
        let template = Template.fromHtml(
            `<div data-tpl-verbatim data-tpl-remove="tag"><span data-tpl-each="ignored">{{ test }}</span></div>`,
            modules,
            data,
        );
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<span data-tpl-each="ignored">{{ test }}</span>');
    });
    it('nodes can be marked as verbatim and body removed', () => {
        let data = { a: 1 };
        let template = Template.fromHtml(
            `<div data-tpl-verbatim data-tpl-remove="body"><span data-tpl-each="ignored">{{ test }}</span></div>`,
            modules,
            data,
        );
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });
    it('inner text node is not reevaluated when generated by tpl-text', () => {
        let data = { a: 1 };
        let template = Template.fromHtml(`<div data-tpl-text="'{{a}}'"></div>`, modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>{{a}}</div>');
    });
    it('inner html node is not reevaluated when generated by tpl-html', () => {
        let data = { a: 1 };
        let template = Template.fromHtml(`<div data-tpl-html="'{{a}}'"></div>`, modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>{{a}}</div>');
    });
    it('inner nodes are not reevaluated when generated by tpl-each', () => {
        let data = [`{{'1'}}`, `{{'2'}}`];
        let template = Template.fromHtml(`<div data-tpl-each="self">{{self}}</div>`, modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), `<div>{{'1'}}</div><div>{{'2'}}</div>`);
    });
    it('can show error', () => {
        let data = [1, 2];
        let template = Template.fromHtml(`<div id="container">
                    <span>something ignored</span>
                    <div data-tpl-each="self">  
                        {{self.boom()}}
                    </div>
                </div>`);
        try {
            template.withModules(modules).withData(data).render();
        } catch (ex) {
            const expected =
                'Error rendering template in `<div id="container"><span>something ignored</span><div data-tpl-each="self">{{self.boom()}}</div></div>`';
            assert.strictEqual(ex.message, expected);
        }
    });
    it('can show error for text nodes', () => {
        let data = [1, 2];
        let template = Template.fromHtml(`

            {{self.boom()}}

        `);
        try {
            template.withModules(modules).withData(data).render();
        } catch (ex) {
            const expected = 'Error rendering template in `{{self.boom()}}`';
            assert.strictEqual(ex.message, expected);
        }
    });
    it('can scope variables using *-with and *-var', () => {
        let data = { user: { name: 'Alice' } };
        let template = Template.fromHtml('<div data-tpl-with="user" data-tpl-var="u">{{u.name}}</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>Alice</div>');
    });

    it('can scope variables using *-with without a custom variable name', () => {
        let data = { scope: { name: 'Bob' } };
        let template = Template.fromHtml('<div data-tpl-with="scope">{{name}}</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>Bob</div>');
    });

    it('throws error when *-each is given a non-iterable parameter', () => {
        let data = { nonIterable: 123 };
        let template = Template.fromHtml('<div data-tpl-each="nonIterable">test</div>', modules, data);

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
        let data = { ok: true };
        let template = Template.fromHtml('<div><span data-tpl-when="ok">Yes</span><span data-tpl-when="!ok">No</span></div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div><span>Yes</span></div>');
    });

    it('can append classes using *-class-append directives', () => {
        let data = { myClasses: 'foo bar', extra: null };
        let template = Template.fromHtml('<div class="base" data-tpl-class-append="myClasses"></div><span class="base" data-tpl-class-append="extra"></span>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div class="base foo bar"></div><span class="base"></span>');
    });

    it('can append arrays of classes using *-class-append', () => {
        let data = { classArr: ['active', 'enabled'] };
        let template = Template.fromHtml('<div class="base" data-tpl-class-append="classArr"></div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div class="base active enabled"></div>');
    });

    it('can append attributes using *-attr-append', () => {
        let data = { attrs: [['disabled', 'true'], ['title', 'hello']], empty: null };
        let template = Template.fromHtml('<button data-tpl-attr-append="attrs"></button><div data-tpl-attr-append="empty"></div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<button disabled="true" title="hello"></button><div></div>');
    });

    it('can remove the entire element with *-remove="all"', () => {
        let template = Template.fromHtml('<div><span data-tpl-remove="all">gone</span></div>', modules, {});
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });

    it('toggles boolean data attributes as explicit flags', () => {
        let data = { flagTrue: true, flagFalse: false };
        let template = Template.fromHtml('<div data-tpl-disabled="flagTrue" data-tpl-hidden="flagFalse"></div>', modules, data);
        let rendered = template.render();
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


    it('supports context mutations and updates fluently', () => {
        const base = Template.fromHtml('<div>{{val}} {{ #extra:go() }}</div>', {}, []);

        const t1 = base.withContext({ modules: { extra: { go: () => 'yes' } }, data: [{ val: 'ok' }] });
        assert.strictEqual(Fragments.toHtml(t1.render()), '<div>ok yes</div>');

        const mockRegistry = { context: () => ({ modules: { extra: { go: () => 'reg' } }, data: [{ val: 'hi' }] }) };
        const t2 = base.withContextFrom(mockRegistry);
        assert.strictEqual(Fragments.toHtml(t2.render()), '<div>hi reg</div>');

        const altFrag = document.createDocumentFragment();
        altFrag.appendChild(document.createTextNode('{{val}}'));

        const t3 = base.withFragment(altFrag)
            .withModules({})
            .withModule('extra', { go: () => 'alone' })
            .withData([{ val: 'hello' }]);

        assert.strictEqual(Fragments.toHtml(t3.render()), 'hello');

        t3.evaluate('val');
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
        let data = { emptyArray: [], emptyStrings: [' ', ''] };
        let template = Template.fromHtml('<div class="base" data-tpl-class-append="emptyArray"></div><span data-tpl-class-append="emptyStrings"></span>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div class="base"></div><span></span>');
    });

    it('ignores non-tpl dataset attributes during attribute compilation', () => {
        let data = { val: 1 };
        let template = Template.fromHtml('<div data-other="ignored" data-tpl-test="val"></div>', modules, data);
        let rendered = template.render();

        assert.strictEqual(Fragments.toHtml(rendered), '<div data-other="ignored" test="1"></div>');
    });

    it('throws RenderError when a dynamic data-tpl-* attribute expression fails', () => {
        let template = Template.fromHtml('<div data-tpl-custom="boom()"></div>', modules, {});

        try {
            template.render();
            assert.fail('Should have thrown an error');
        } catch (ex) {
            assert.match(ex.message, /Error rendering template/);
            assert.match(ex.cause.message, /Error evaluating command tplCustom/);
        }
    });
});
