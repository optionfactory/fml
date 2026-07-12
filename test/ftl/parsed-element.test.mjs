import { expect } from '@esm-bundle/chai';
import { ParsedElement } from '../../src/ftl/parsed-element.mjs';
import { registry } from '../../src/ftl/registry.mjs';
import { Template } from '../../src/ftl/template.mjs';

describe('ParsedElement Web Component Lifecycle', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        container.remove();
    });

    it('injects static l10n and config properties as template overlays (lines 34-35)', async () => {
        class ConfiguredEl extends ParsedElement {
            static l10n = { greet: 'Hello' };
            static config = { debug: true };
            static template = '<div></div>';
        }

        registry.defineElement('configured-el', ConfiguredEl);
        registry.configure();

        const el = document.createElement('configured-el');
        container.appendChild(el);
        await registry.upgrades.next()?.value;

        const tplInstance = el.template();

        expect(tplInstance).to.be.instanceOf(Template);
    });

    it('guards connectedCallback and upgrade against double execution', async () => {
        let renderCount = 0;
        class MultiConnectedEl extends ParsedElement {
            render() { renderCount++; }
        }

        registry.defineElement('multi-connected-el', MultiConnectedEl);
        registry.configure();

        const el = document.createElement('multi-connected-el');
        container.appendChild(el);

        await registry.upgrades.next()?.value;
        expect(renderCount).to.equal(1);

        el.connectedCallback();
        expect(renderCount).to.equal(1);

        await el.upgrade();
        expect(renderCount).to.equal(1);
    });

    it('guards attributeChangedCallback branches against duplicate values and loops', async () => {
        let unmarshalFired = false;
        class AttributeGuardEl extends ParsedElement {
            static observed = ['test-attr'];
            static mappers = {
                string: {
                    unmarshal: (v) => { unmarshalFired = true; return v; },
                    marshal: (v) => v
                }
            };
        }

        registry.defineElement('attr-guard-el', AttributeGuardEl);
        registry.configure();

        const el = document.createElement('attr-guard-el');
        container.appendChild(el);
        await registry.upgrades.next()?.value;

        unmarshalFired = false;

        el.attributeChangedCallback('test-attr', 'same', 'same');
        expect(unmarshalFired).to.be.false;

        el.reflect(() => {
            el.attributeChangedCallback('test-attr', 'old', 'new');
        });
        expect(unmarshalFired).to.be.false;
    });

    it('manages form disabled states before and after element upgrade cycles', async () => {
        let renderArgs = null;
        class FormDisabledEl extends ParsedElement {
            render(c) { renderArgs = c; }
        }

        registry.defineElement('form-disabled-el', FormDisabledEl);
        registry.configure();

        const el = document.createElement('form-disabled-el');

        el.formDisabledCallback(true);

        container.appendChild(el);
        await registry.upgrades.next()?.value;

        expect(renderArgs.disabled).to.be.true;

        el.formDisabledCallback(false);
        expect(el.disabled).to.be.false;
    });

    it('leverages atomic reflection context locks safely', () => {
        class ReflectiveEl extends ParsedElement {
            static observed = ['my-prop'];
            static mappers = {
                string: { unmarshal: (v) => v, marshal: (v) => v }
            };
        }

        registry.defineElement('reflective-el', ReflectiveEl);
        registry.configure();

        const el = document.createElement('reflective-el');

        let blocksExecuted = false;
        el.reflect(() => { blocksExecuted = true; });
        expect(blocksExecuted).to.be.true;

        el.reflectTo('my-prop', 'active-state');
        expect(el.getAttribute('my-prop')).to.equal('active-state');
    });

    it('unmarshals and assigns property values on valid attribute changes', async () => {
        class AttrChangeEl extends ParsedElement {
            static attributes = ['test-attr:string'];
            static observed = ['test-attr'];
        }

        registry.defineElement('attr-change-el', AttrChangeEl);
        registry.configure();

        const el = document.createElement('attr-change-el');
        container.appendChild(el);
        await el.upgrade();

        el.attributeChangedCallback('test-attr', null, 'hello-world');

        expect(el['test-attr']).to.equal('hello-world');
    });
});