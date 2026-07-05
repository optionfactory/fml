import "./mock-dom.mjs";
import { Template, Fragments } from "../dist/ftl.mjs";
import { strict as assert } from 'node:assert';
import { it, describe } from 'node:test'; 


const modules = {
    math: {
        isEven: v => v % 2 === 0
    }
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
        let data = {a: 1};
        let template = Template.fromHtml('<div data-tpl-if="true">{{a}}</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>1</div>');
    });
    it('can render html from attribute', () => {
        let data = {a: '<h1>test</h1>'};
        let template = Template.fromHtml('<div data-tpl-html="a">nope</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div><h1>test</h1></div>');
    });
    it('rendering null html from attribute yields empty string', () => {
        let data = {a: null};
        let template = Template.fromHtml('<div data-tpl-html="a">nope</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });
    it('rendering undefined html from attribute yields empty string', () => {
        let data = {a: undefined};
        let template = Template.fromHtml('<div data-tpl-html="a">nope</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });

    it('can render text from attribute', () => {
        let data = {a: '<h1>test</h1>'};
        let template = Template.fromHtml('<div data-tpl-text="a">nope</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>&lt;h1&gt;test&lt;/h1&gt;</div>');
    });
    it('rendering null text from attribute yields empty string', () => {
        let data = {a: null};
        let template = Template.fromHtml('<div data-tpl-text="a">nope</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });
    it('rendering undefined text from attribute yield empty string', () => {
        let data = {a: undefined};
        let template = Template.fromHtml('<div data-tpl-text="a">nope</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });        
    it('can render text from a text node', () => {
        let data = {a: "<>"};
        let template = Template.fromHtml("<div>b{{a}}d</div>", modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>b&lt;&gt;d</div>');
    });
    it('rendering null text from a text node yield empty string', () => {
        let data = {a: null};
        let template = Template.fromHtml("<div>b{{a}}d</div>", modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>bd</div>');
    });    
    it('rendering undefined text from a text node yield empty string', () => {
        let data = {a: undefined};
        let template = Template.fromHtml("<div>b{{a}}d</div>", modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>bd</div>');
    });      
    it('can render html from a text node', () => {
        let data = {a: "<span></span>"};
        let template = Template.fromHtml("<div>b{{{a}}}d</div>", modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>b<span></span>d</div>');
    });
    it('can render html from a node', () => {
        let data = {a: document.createElement("span")};
        let template = Template.fromHtml("<div>b{{{{a}}}}d</div>", modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>b<span></span>d</div>');
    });
    it('null node is rendered as an empty fragment', () => {
        let data = {a: null};
        let template = Template.fromHtml("<div>b{{{{a}}}}d</div>", modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>bd</div>');
    });
    it('null node is rendered as an empty fragment', () => {
        let data = {};
        let template = Template.fromHtml("<div>b{{{{a}}}}d</div>", modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>bd</div>');
    });
    it('rendering null text from an html node yield empty string', () => {
        let data = {a: null};
        let template = Template.fromHtml("<div>b{{{a}}}d</div>", modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>bd</div>');
    });    
    it('rendering undefined text from an html node yield empty string', () => {
        let data = {a: undefined};
        let template = Template.fromHtml("<div>b{{{a}}}d</div>", modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>bd</div>');
    });      

    it('can evaluate a data-* attribute', () => {
        let data = {a: 1, b: 2};
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
        let data = {a: "{{'1'}}"};
        let template = Template.fromHtml('<div data-tpl-remove="tag">{{a}}</div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), "{{'1'}}");
    });    
    it('can *-remove-tag from *-each', () => {
        let data = [1, 2, 3, 4];
        let template = Template.fromHtml('<div data-tpl-each="self" data-tpl-remove="tag">{{ self }}</div>', modules, data);
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
        let template = Template.fromHtml('<div data-tpl-each="self"><span data-tpl-if="#math:isEven(self)">{{ self }}</span></div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div><div><span>2</span></div><div></div><div><span>4</span></div>');
    });
    it('can evaluate nested tags (each -> if) removing tags', () => {
        let data = [1, 2, 3, 4];
        let template = Template.fromHtml('<div data-tpl-each="self" data-tpl-remove="tag"><span data-tpl-if="#math:isEven(self)" data-tpl-remove="tag">{{ self }}</span></div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '24');
    });
    it('can evaluate nested tags (if -> each)', () => {
        let data = [1, 2, 3, 4];
        let template = Template.fromHtml('<div data-tpl-if="#math:isEven(2)"><span data-tpl-each="self">{{ self }}</span></div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div><span>1</span><span>2</span><span>3</span><span>4</span></div>');
    });
    it('can evaluate nested tags (if -> each) removing tags', () => {
        let data = [1, 2, 3, 4];
        let template = Template.fromHtml('<div data-tpl-if="#math:isEven(2)" data-tpl-remove="tag"><span data-tpl-each="self" data-tpl-remove="tag">{{ self }}</span></div>', modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '1234');
    });
    it('nodes can be marked as verbatim', () => {
        let data = {a: 1};
        let template = Template.fromHtml(`<div data-tpl-verbatim><span data-tpl-each="ignored">{{ test }}</span></div>`, modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div><span data-tpl-each="ignored">{{ test }}</span></div>');
    });
    it('nodes can be marked as verbatim after being conditionally evaluated', () => {
        let data = {a: 1};
        let template = Template.fromHtml(`<div data-tpl-verbatim data-tpl-if="true"><span data-tpl-each="ignored">{{ test }}</span></div>`, modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div><span data-tpl-each="ignored">{{ test }}</span></div>');
    });
    //currently tpl-remove has lower priority
    it('nodes can be marked as verbatim and tag removed', () => {
        let data = {a: 1};
        let template = Template.fromHtml(`<div data-tpl-verbatim data-tpl-remove="tag"><span data-tpl-each="ignored">{{ test }}</span></div>`, modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<span data-tpl-each="ignored">{{ test }}</span>');
    });    
    it('nodes can be marked as verbatim and body removed', () => {
        let data = {a: 1};
        let template = Template.fromHtml(`<div data-tpl-verbatim data-tpl-remove="body"><span data-tpl-each="ignored">{{ test }}</span></div>`, modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div></div>');
    });        
    it('inner text node is not reevaluated when generated by tpl-text', () => {
        let data = {a: 1};
        let template = Template.fromHtml(`<div data-tpl-text="'{{a}}'"></div>`, modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>{{a}}</div>');
    });
    it('inner html node is not reevaluated when generated by tpl-html', () => {
        let data = {a: 1};
        let template = Template.fromHtml(`<div data-tpl-html="'{{a}}'"></div>`, modules, data);
        let rendered = template.render();
        assert.strictEqual(Fragments.toHtml(rendered), '<div>{{a}}</div>');
    });    
    it('inner nodes are not reevaluated when generated by tpl-each', () => {
        let data = [`{{'1'}}`,`{{'2'}}`];
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
                </div>`
            );
        try {
            template.withModules(modules).withData(data).render();
        } catch (ex) {
            const expected = 'Error rendering template in `<div id="container"><span>something ignored</span><div data-tpl-each="self">{{self.boom()}}</div></div>`';
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

});
