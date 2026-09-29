import { expect } from 'chai';
import { ParsedElement } from '../../src/ftl/parsed-element.mjs';
import { registry } from '../../src/ftl/registry.mjs';
import { Template } from '../../src/ftl/template.mjs';
import { tick } from '../tick.mjs';
import { attached } from '../harness.mjs';

describe('ParsedElement web component lifecycle', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        attached(container);
    });

    afterEach(() => {
        container.remove();
    });

    it('injects static config properties as template overlays', async () => {
        class ConfiguredEl extends ParsedElement {
            static config = { icon: 'declared' };
            static template = '<div></div>';
        }
        ConfiguredEl.config = { icon: 'overridden' };

        registry.defineElement('configured-el', ConfiguredEl);
        registry.configure();

        const el = document.createElement('configured-el');
        container.appendChild(el);
        await registry.whenUpgraded(el);

        const tplInstance = el.template();

        expect(tplInstance).to.be.instanceOf(Template);
        expect(tplInstance.evaluateExpression('config.icon')).to.equal('overridden');
    });

    it('guards connectedCallback and upgrade against double execution', async () => {
        let renderCount = 0;
        class MultiConnectedEl extends ParsedElement {
            render() {
                renderCount++;
            }
        }

        registry.defineElement('multi-connected-el', MultiConnectedEl);
        registry.configure();

        const el = document.createElement('multi-connected-el');
        container.appendChild(el);
        await registry.whenUpgraded(el);
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
                    unmarshal: (v) => {
                        unmarshalFired = true;
                        return v;
                    },
                    marshal: (v) => v,
                },
            };
        }

        registry.defineElement('attr-guard-el', AttributeGuardEl);
        registry.configure();

        const el = document.createElement('attr-guard-el');
        container.appendChild(el);
        await registry.whenUpgraded(el);

        unmarshalFired = false;

        el.attributeChangedCallback('test-attr', 'same', 'same');
        expect(unmarshalFired).to.be.false;

        el.reflectTo('test-attr', 'new');
        expect(el.getAttribute('test-attr')).to.equal('new');
        expect(unmarshalFired).to.be.false;

        el.setAttribute('test-attr', 'settled');
        unmarshalFired = false;
        let written = 0;
        const setAttribute = el.setAttribute.bind(el);
        el.setAttribute = (...args) => {
            ++written;
            setAttribute(...args);
        };
        el.reflectTo('test-attr', 'settled');
        expect(written).to.equal(0);
        expect(unmarshalFired).to.be.false;
    });

    it('applies the declared state onto the properties once the render returns', async () => {
        let duringRender = null;
        let renderArgs = null;
        const applied = [];
        class ObservedEl extends ParsedElement {
            static observed = ['disabled:presence', 'label'];
            set disabled(v) {
                applied.push(['disabled', v]);
            }
            set label(v) {
                applied.push(['label', v]);
            }
            render(c) {
                renderArgs = c;
                duringRender = [this.declared('disabled'), this.declared('label'), applied.length];
            }
        }

        registry.defineElement('observed-el', ObservedEl);
        registry.configure();

        const el = document.createElement('observed-el');
        el.setAttribute('disabled', '');
        el.setAttribute('label', 'a label');
        container.appendChild(el);
        expect(registry.pending()).to.include(el);
        await registry.whenUpgraded(el);

        expect(renderArgs).to.not.have.property('observed');
        expect(duringRender).to.eql([true, 'a label', 0]);
        expect(applied).to.eql([
            ['disabled', true],
            ['label', 'a label'],
        ]);
    });

    it('says which template is missing rather than failing on the lookup', async () => {
        class OneTemplateEl extends ParsedElement {
            static template = '<div></div>';
        }

        registry.defineElement('one-template-el', OneTemplateEl);
        registry.configure();

        const el = document.createElement('one-template-el');
        container.appendChild(el);
        await registry.whenUpgraded(el);

        expect(() => el.template()).to.not.throw();
        expect(() => el.template('items')).to.throw(/no template named 'items' on OneTemplateEl/);
    });

    it('says so when asked for an attribute the class never declared', async () => {
        class UndeclaredEl extends ParsedElement {
            static attributes = ['known'];
        }

        registry.defineElement('undeclared-el', UndeclaredEl);
        registry.configure();

        const el = document.createElement('undeclared-el');
        container.appendChild(el);
        await registry.whenUpgraded(el);

        expect(() => el.declared('mine')).to.throw(/declares no attribute 'mine'/);
        el.setAttribute('mine', '/endpoint');
        expect(el.getAttribute('mine')).to.equal('/endpoint');
    });

    it('answers a configuration attribute as declared, whatever happens to it afterwards', async () => {
        let duringRender = null;
        class FrozenEl extends ParsedElement {
            static attributes = ['loader', 'size:number'];
            render() {
                duringRender = [this.declared('loader'), this.declared('size')];
            }
        }

        registry.defineElement('frozen-el', FrozenEl);
        registry.configure();

        const el = document.createElement('frozen-el');
        el.setAttribute('loader', 'first');
        el.setAttribute('size', '3');
        container.appendChild(el);
        await registry.whenUpgraded(el);

        expect(duringRender).to.eql(['first', 3]);
        expect(FrozenEl.observedAttributes).to.not.include('loader');
        el.setAttribute('loader', 'second');
        expect(el.declared('loader')).to.equal('first');
    });

    it('applies an attribute write made while the render was still pending', async () => {
        let release = /** @type any */ (null);
        let applied = null;
        class MidFlightEl extends ParsedElement {
            static observed = ['value'];
            set value(v) {
                applied = v;
            }
            async render() {
                await new Promise((resolve) => {
                    release = resolve;
                });
            }
        }

        registry.defineElement('mid-flight-el', MidFlightEl);
        registry.configure();

        const el = document.createElement('mid-flight-el');
        el.setAttribute('value', 'stale');
        container.appendChild(el);
        const upgradePromise = registry.whenUpgraded(el);
        for (let i = 0; i !== 5; ++i) {
            await tick();
        }
        el.setAttribute('value', 'current');
        release();
        await upgradePromise;

        expect(applied).to.equal('current');
    });

    it('marshals a reflection through the mapper the attribute was declared with', async () => {
        class ReflectiveEl extends ParsedElement {
            static observed = ['flag:presence', 'size:number', 'tags:csv'];
            set flag(v) {}
            set size(v) {}
            set tags(v) {}
        }

        registry.defineElement('reflective-el', ReflectiveEl);
        registry.configure();

        const el = document.createElement('reflective-el');
        container.appendChild(el);
        await registry.whenUpgraded(el);

        el.reflectTo('flag', true);
        expect(el.getAttribute('flag')).to.equal('');
        el.reflectTo('flag', false);
        expect(el.hasAttribute('flag')).to.be.false;

        el.reflectTo('size', 3);
        expect(el.getAttribute('size')).to.equal('3');
        el.reflectTo('size', null);
        expect(el.hasAttribute('size')).to.be.false;

        el.reflectTo('tags', ['a', 'b']);
        expect(el.getAttribute('tags')).to.equal('a,b');
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

        expect(el.testAttr).to.equal('hello-world');
        expect(el['test-attr']).to.be.undefined;
    });

    it('drives a hyphenated attribute through the camelCase setter, at the upgrade and after it', async () => {
        const applied = [];
        class PagedEl extends ParsedElement {
            static observed = ['page-size:number', 'plain'];
            set pageSize(v) {
                applied.push(['pageSize', v]);
            }
            set plain(v) {
                applied.push(['plain', v]);
            }
        }

        registry.defineElement('paged-el', PagedEl);
        registry.configure();

        const el = document.createElement('paged-el');
        el.setAttribute('page-size', '10');
        el.setAttribute('plain', 'x');
        container.appendChild(el);
        await registry.whenUpgraded(el);

        expect(applied).to.deep.equal([
            ['pageSize', 10],
            ['plain', 'x'],
        ]);
        expect(PagedEl.observedAttributes).to.deep.equal(['page-size', 'plain']);
        expect(el.declared('page-size')).to.equal(10);

        el.setAttribute('page-size', '25');

        expect(applied.at(-1)).to.deep.equal(['pageSize', 25]);
    });
});

describe('ParsedElement rendered state', () => {
    let container;
    beforeEach(() => {
        container = document.createElement('div');
        attached(container);
    });
    afterEach(() => container.remove());

    it('carries the state only once the render has finished', async () => {
        let release;
        class Slow extends ParsedElement {
            render() {
                return new Promise((resolve) => {
                    release = resolve;
                });
            }
        }
        registry.defineElement('x-rendered-slow', Slow);
        container.innerHTML = '<x-rendered-slow></x-rendered-slow>';
        const el = container.firstElementChild;
        await tick();

        expect(el.matches(':defined'), 'defined from the constructor').to.be.true;
        expect(el.rendered, 'but the render has not finished').to.be.false;
        expect(el.matches(':state(rendered)'), 'so the state is not there yet').to.be.false;

        release();
        await tick();
        await tick();

        expect(el.rendered).to.be.true;
        expect(el.matches(':state(rendered)'), 'and arrives with it').to.be.true;
    });

    it('withholds the state from an element whose render threw', async () => {
        class Broken extends ParsedElement {
            render() {
                throw new Error('boom');
            }
        }
        registry.defineElement('x-rendered-broken', Broken);
        container.innerHTML = '<x-rendered-broken></x-rendered-broken>';
        const el = container.firstElementChild;
        await el.upgrade().catch(() => {});

        expect(el.rendered).to.be.false;
        expect(el.matches(':state(rendered)')).to.be.false;
    });

    it('attaches the internals once, for the whole chain', async () => {
        class Sub extends ParsedElement {
            static formAssociated = true;
            render() {}
        }
        registry.defineElement('x-rendered-sub', Sub);
        const form = document.createElement('form');
        container.appendChild(form);
        form.innerHTML = '<x-rendered-sub name="a"></x-rendered-sub>';
        const el = form.firstElementChild;
        await tick();

        expect(el.internals).to.not.be.undefined;
        expect(el.internals.form).to.equal(form);
        expect(() => el.internals.setFormValue('v')).to.not.throw();
    });
});
