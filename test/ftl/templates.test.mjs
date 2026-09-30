import { expect } from 'chai';
import { Templates } from '../../src/ftl/templates.mjs';
import { registry } from '../../src/ftl/registry.mjs';
import { attached } from '../harness.mjs';

describe('Templates factory', () => {
    beforeEach(() => {
        registry.defineModule('testMod', {
            transform: (v) => v.toUpperCase(),
        });
    });

    afterEach(() => {
        registry.defineData();
    });

    it('creates a Template from HTML string using registry context', () => {
        registry.defineData({ value: 'html_val' });

        const template = Templates.fromHtml('<span>{{ #testMod:transform(value) }}</span>');
        const fragment = template.render();

        expect(
            fragment.querySelector('span').textContent,
            'fromHtml evaluates with the modules and data defined on the page registry',
        ).to.equal('HTML_VAL');
    });

    it('creates a Template from a selector using registry context', () => {
        registry.defineData({ value: 'selector_val' });

        const templateEl = document.createElement('template');
        templateEl.id = 'tpl-selector-test';
        templateEl.innerHTML = '<div>{{ #testMod:transform(value) }}</div>';
        attached(templateEl);

        const template = Templates.fromSelector('#tpl-selector-test');
        const fragment = template.render();

        expect(
            fragment.querySelector('div').textContent,
            'fromSelector evaluates with the modules and data defined on the page registry',
        ).to.equal('SELECTOR_VAL');
        templateEl.remove();
    });

    it('creates a Template from an HTMLTemplateElement using registry context', () => {
        registry.defineData({ value: 'element_val' });

        const templateEl = document.createElement('template');
        templateEl.innerHTML = '<p>{{ #testMod:transform(value) }}</p>';

        const template = Templates.fromTemplate(templateEl);
        const fragment = template.render();

        expect(
            fragment.querySelector('p').textContent,
            'fromTemplate evaluates with the modules and data defined on the page registry',
        ).to.equal('ELEMENT_VAL');
    });

    it('creates a Template from a DocumentFragment using registry context', () => {
        registry.defineData({ value: 'fragment_val' });

        const frag = document.createDocumentFragment();
        const text = document.createTextNode('{{ #testMod:transform(value) }}');
        frag.appendChild(text);

        const template = Templates.fromFragment(frag);
        const renderedFrag = template.render();

        expect(
            renderedFrag.textContent,
            'fromFragment evaluates with the modules and data defined on the page registry',
        ).to.equal('FRAGMENT_VAL');
    });
});
