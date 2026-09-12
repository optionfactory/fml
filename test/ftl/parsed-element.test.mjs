import { expect } from 'chai';
import { ParsedElement } from '../../src/ftl/parsed-element.mjs';
import { registry } from '../../src/ftl/registry.mjs';
import { Template } from '../../src/ftl/template.mjs';
import { tick } from '../tick.mjs';

describe('ParsedElement Web Component Lifecycle', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        container.remove();
    });

    it('injects static config properties as template overlays', async () => {
        class ConfiguredEl extends ParsedElement {
            static config = { debug: true };
            static template = '<div></div>';
        }

        registry.defineElement('configured-el', ConfiguredEl);
        registry.configure();

        const el = document.createElement('configured-el');
        container.appendChild(el);
        await registry.whenUpgraded(el);

        const tplInstance = el.template();

        expect(tplInstance).to.be.instanceOf(Template);
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

        el.reflect(() => {
            el.attributeChangedCallback('test-attr', 'old', 'new');
        });
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
                //the dom the setters drive is not built yet: a render reads a
                //declared value through the door rather than being handed a bag
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
        //declaration order, and nothing applied until the render was done
        expect(applied).to.eql([
            ['disabled', true],
            ['label', 'a label'],
        ]);
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
        //the configuration tier is not observed, so it has no property forward
        //and no live door: what the author declared is what it answers
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
        //let the upgrade reach the render's await, then write through the attribute
        for (let i = 0; i !== 5; ++i) {
            await tick();
        }
        el.setAttribute('value', 'current');
        release();
        await upgradePromise;

        expect(applied).to.equal('current');
    });

    it('leverages atomic reflection context locks safely', () => {
        class ReflectiveEl extends ParsedElement {
            static observed = ['my-prop'];
            static mappers = {
                string: { unmarshal: (v) => v, marshal: (v) => v },
            };
        }

        registry.defineElement('reflective-el', ReflectiveEl);
        registry.configure();

        const el = document.createElement('reflective-el');

        let blocksExecuted = false;
        el.reflect(() => {
            blocksExecuted = true;
        });
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
