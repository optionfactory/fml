import { expect } from '@esm-bundle/chai';
import { Registry } from '../../src/ftl/registry.mjs';

describe('Registry', () => {
    let registry;

    beforeEach(() => {
        // Instantiate a fresh registry for isolated configuration tests
        registry = new Registry();
    });

    describe('Attribute Mappers', () => {
        it('correctly marshals and unmarshals all built-in types', () => {
            class DummyEl extends HTMLElement {
                static attributes = [
                    's:string', 'n:number', 'p:presence', 'b:bool',
                    'j:json', 'c:csv', 'cm:csvm'
                ];
            }
            registry.defineElement('dummy-mappers', DummyEl);
            registry.configure();

            const mappers = DummyEl.BITS.ATTR_TO_MAPPER;
            const el = document.createElement('dummy-mappers');

            // 1. String
            expect(mappers.s.unmarshal('hello')).to.equal('hello');
            expect(mappers.s.marshal('hello')).to.equal('hello');
            expect(mappers.s.marshal(null)).to.be.null;

            // 2. Number
            expect(mappers.n.unmarshal('123')).to.equal(123);
            expect(mappers.n.unmarshal(null)).to.be.null;
            expect(mappers.n.marshal(123)).to.equal('123');
            expect(mappers.n.marshal(null)).to.be.null;

            // 3. Presence
            expect(mappers.p.unmarshal('anything')).to.be.true;
            expect(mappers.p.unmarshal(null)).to.be.false;
            expect(mappers.p.marshal(true)).to.equal('');
            expect(mappers.p.marshal(false)).to.be.null;

            // 4. Boolean
            expect(mappers.b.unmarshal('true')).to.be.true;
            expect(mappers.b.unmarshal('false')).to.be.false;
            expect(mappers.b.marshal(true)).to.equal('true');
            expect(mappers.b.marshal(false)).to.equal('false');
            expect(mappers.b.marshal(null)).to.be.null;

            // 5. JSON
            expect(mappers.j.unmarshal('{"a":1}')).to.deep.equal({ a: 1 });
            expect(mappers.j.unmarshal(null)).to.be.null;
            expect(mappers.j.marshal({ a: 1 })).to.equal('{"a":1}');
            expect(mappers.j.marshal(null)).to.be.null;

            // 6. CSV
            expect(mappers.c.unmarshal('a, b, c')).to.deep.equal(['a', 'b', 'c']);
            expect(mappers.c.unmarshal(null)).to.deep.equal([]);
            expect(mappers.c.marshal(['a', 'b'])).to.equal('a,b');
            expect(mappers.c.marshal(null)).to.be.null;

            // 7. CSVM (Without 'multiple' attribute)
            expect(mappers.cm.unmarshal('a', 'cm', el)).to.equal('a');
            expect(mappers.cm.unmarshal('', 'cm', el)).to.be.null;
            expect(mappers.cm.unmarshal(null, 'cm', el)).to.be.null;
            expect(mappers.cm.marshal('a', 'cm', el)).to.equal('a');
            expect(mappers.cm.marshal(null, 'cm', el)).to.be.null;

            // 8. CSVM (With 'multiple' attribute)
            el.setAttribute('multiple', '');
            expect(mappers.cm.unmarshal('a, b', 'cm', el)).to.deep.equal(['a', 'b']);
            expect(mappers.cm.unmarshal(null, 'cm', el)).to.deep.equal([]);
            expect(mappers.cm.marshal(['a', 'b'], 'cm', el)).to.equal('a,b');
            expect(mappers.cm.marshal(null, 'cm', el)).to.be.null;
        });

        it('throws an error if an unsupported mapper is requested', () => {
            class BadEl extends HTMLElement { static attributes = ['attr:unknownType']; }
            registry.defineElement('bad-mappers', BadEl);
            expect(() => registry.configure()).to.throw('unsupported attribute type: unknownType');
        });
    });

    describe('Core Configuration & API', () => {
        it('allows defining modules, data, components, mappers, and plugins', () => {
            registry.defineModules({ mod1: {} });
            registry.defineData({ baseData: true });
            registry.defineOverlay({ overlayData: true });
            registry.defineComponent('myComp', { config: true });
            registry.defineMapper('customMap', { unmarshal: () => 'u', marshal: () => 'm' });

            let pluginConfigured = false;
            registry.plugin({ configure: () => { pluginConfigured = true; } });

            expect(pluginConfigured).to.be.true;

            const ctx = registry.context();
            expect(ctx.modules).to.have.property('mod1');
            expect(ctx.data[0]).to.have.property('baseData');
            expect(ctx.data[1]).to.have.property('overlayData');
            expect(registry.component('myComp')).to.deep.equal({ config: true });

            const evalInst = registry.evaluator();
            expect(evalInst).to.exist;
        });

        it('allows defining elements dynamically after configuration is finalized', () => {
            registry.configure();

            class DirectEl extends HTMLElement { static observed = ['val']; }
            registry.defineElement('direct-el', DirectEl);

            expect(DirectEl.BITS).to.exist;
            expect(DirectEl.BITS.OBSERVED).to.deep.equal(['val']);
        });
    });

    describe('UpgradeQueue', () => {
        it('queues elements, ignores double-enqueues, and drops them upon completion', async () => {
            let upgraded = false;
            class QueueEl extends HTMLElement {
                async upgrade() { upgraded = true; }
            }
            registry.defineElement('queue-el', QueueEl);
            registry.configure();

            const el = document.createElement('queue-el');
            document.body.appendChild(el);

            QueueEl.BITS.enqueue(el);
            QueueEl.BITS.enqueue(el);

            const upgradesList = Array.from(registry.upgrades);
            expect(upgradesList.length).to.equal(1);

            await upgradesList[0][1];

            expect(upgraded).to.be.true;
            expect(Array.from(registry.upgrades).length).to.equal(0);

            el.remove();
        });

        it('dispatches ftl:ready on DOMContentLoaded after processing queue', async () => {
            let readyFired = false;
            document.addEventListener('ftl:ready', () => { readyFired = true; }, { once: true });

            // Artificially trigger the DOMContentLoaded event that the UpgradeQueue constructor listens to
            document.dispatchEvent(new Event('DOMContentLoaded'));

            await new Promise(resolve => setTimeout(resolve, 0));

            expect(readyFired).to.be.true;
        });
    });
});