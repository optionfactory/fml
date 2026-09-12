import { expect } from 'chai';
import { Registry } from '../../src/ftl/registry.mjs';

describe('Registry', () => {
    let registry;

    beforeEach(() => {
        registry = new Registry();
    });

    describe('Attribute mappers', () => {
        it('correctly marshals and unmarshals all built-in types', () => {
            class DummyEl extends HTMLElement {
                static attributes = ['s:string', 'n:number', 'p:presence', 'b:bool', 'j:json', 'c:csv'];
            }
            registry.defineElement('dummy-mappers', DummyEl);
            registry.configure();

            const mappers = DummyEl.BITS.ATTR_TO_MAPPER;

            //string
            expect(mappers.s.unmarshal('hello')).to.equal('hello');
            expect(mappers.s.marshal('hello')).to.equal('hello');
            expect(mappers.s.marshal(null)).to.be.null;

            //number
            expect(mappers.n.unmarshal('123')).to.equal(123);
            expect(mappers.n.unmarshal(null)).to.be.null;
            expect(mappers.n.marshal(123)).to.equal('123');
            expect(mappers.n.marshal(null)).to.be.null;

            //presence
            expect(mappers.p.unmarshal('anything')).to.be.true;
            expect(mappers.p.unmarshal(null)).to.be.false;
            expect(mappers.p.marshal(true)).to.equal('');
            expect(mappers.p.marshal(false)).to.be.null;

            //boolean
            expect(mappers.b.unmarshal('true')).to.be.true;
            expect(mappers.b.unmarshal('false')).to.be.false;
            expect(mappers.b.marshal(true)).to.equal('true');
            expect(mappers.b.marshal(false)).to.equal('false');
            expect(mappers.b.marshal(null)).to.be.null;

            //json
            expect(mappers.j.unmarshal('{"a":1}')).to.deep.equal({ a: 1 });
            expect(mappers.j.unmarshal(null)).to.be.null;
            expect(mappers.j.marshal({ a: 1 })).to.equal('{"a":1}');
            expect(mappers.j.marshal(null)).to.be.null;

            //csv
            expect(mappers.c.unmarshal('a, b, c')).to.deep.equal(['a', 'b', 'c']);
            expect(mappers.c.unmarshal(null)).to.deep.equal([]);
            expect(mappers.c.marshal(['a', 'b'])).to.equal('a,b');
            expect(mappers.c.marshal(null)).to.be.null;
        });

        it('throws an error if an unsupported mapper is requested', () => {
            class BadEl extends HTMLElement {
                static attributes = ['attr:unknownType'];
            }
            registry.defineElement('bad-mappers', BadEl);
            expect(() => registry.configure()).to.throw('unsupported attribute type: unknownType');
        });

        it('composes observed attributes along the inheritance chain, the leaf overriding the same name', () => {
            class ChainBase extends HTMLElement {
                static observed = ['value', 'inherited:number'];
            }
            class ChainLeaf extends ChainBase {
                static observed = ['own:csv', 'value:json', 'inherited:presence'];
            }
            registry.defineElement('chain-leaf', ChainLeaf);
            registry.configure();

            const bits = ChainLeaf.BITS;
            expect([...bits.OBSERVED].sort()).to.deep.equal(['inherited', 'own', 'value']);
            //the leaf's value:json overrides the base's plain value:string, and its
            //inherited:presence overrides the base's number, while own:csv stands
            expect(bits.ATTR_TO_MAPPER.value.unmarshal('{"a":1}')).to.deep.equal({ a: 1 });
            expect(bits.ATTR_TO_MAPPER.inherited.unmarshal('5')).to.equal(true);
            expect(bits.ATTR_TO_MAPPER.own.unmarshal('a, b')).to.deep.equal(['a', 'b']);
        });
    });

    describe('Core configuration and api', () => {
        it('allows defining modules, data, components, mappers, and plugins', () => {
            registry.defineModules({ mod1: { fn: () => 'called' } });
            registry.defineData({ baseData: true });
            registry.defineOverlay({ overlayData: true });
            registry.defineComponent('myComp', { config: true });
            registry.defineMapper('customMap', { unmarshal: () => 'u', marshal: () => 'm' });

            let pluginConfigured = false;
            registry.plugin({
                configure: () => {
                    pluginConfigured = true;
                },
            });

            expect(pluginConfigured).to.be.true;

            //the scope is the observable form of the modules and the data stack
            const scope = registry.evaluator();
            expect(scope.evaluateExpression('#mod1:fn()')).to.equal('called');
            expect(scope.resolve('baseData')).to.be.true;
            expect(scope.resolve('overlayData')).to.be.true;
            expect(registry.component('myComp')).to.deep.equal({ config: true });

            const evalInst = registry.evaluator();
            expect(evalInst).to.exist;
        });

        it('allows defining elements dynamically after configuration is finalized', () => {
            registry.configure();

            class DirectEl extends HTMLElement {
                static observed = ['val'];
            }
            registry.defineElement('direct-el', DirectEl);

            expect(DirectEl.BITS).to.exist;
            expect(DirectEl.BITS.OBSERVED).to.deep.equal(['val']);
        });
    });

    describe('UpgradeQueue', () => {
        it('queues elements, ignores double-enqueues, and drops them upon completion', async () => {
            let upgraded = false;
            class QueueEl extends HTMLElement {
                async upgrade() {
                    upgraded = true;
                }
            }
            registry.defineElement('queue-el', QueueEl);
            registry.configure();

            const el = document.createElement('queue-el');
            document.body.appendChild(el);

            QueueEl.BITS.enqueue(el);
            QueueEl.BITS.enqueue(el);

            expect(registry.pending()).to.deep.equal([el]);

            await registry.whenUpgraded(el);

            expect(upgraded).to.be.true;
            expect(registry.pending().length).to.equal(0);

            el.remove();
        });

        it('hands out the same readiness promise to every caller', () => {
            expect(registry.ready()).to.equal(registry.ready());
        });

        it('awaits readiness, resolving after the ftl:ready event has been dispatched', async () => {
            //the test document is complete by the time modules run, so a fresh
            //registry is the late-import case: no DOMContentLoaded will ever come
            let fired = false;
            document.addEventListener(
                'ftl:ready',
                () => {
                    fired = true;
                },
                { once: true },
            );
            const late = new Registry();

            await late.ready();

            expect(fired, 'the event is dispatched before the await resumes').to.be.true;
            //a caller arriving after the moment still resolves, it cannot hang
            await late.ready();
        });
    });
});
