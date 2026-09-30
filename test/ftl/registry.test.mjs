import { expect } from 'chai';
import { Registry } from '../../src/ftl/registry.mjs';
import { ParsedElement } from '../../src/ftl/parsed-element.mjs';
import { attached } from '../harness.mjs';

describe('Registry', () => {
    let registry;

    beforeEach(() => {
        registry = new Registry();
    });

    describe('Attribute mappers', () => {
        it('correctly marshals and unmarshals all built-in types', () => {
            class DummyEl extends ParsedElement {
                static attributes = ['s:string', 'n:number', 'p:presence', 'b:bool', 'j:json', 'c:csv'];
            }
            registry.defineElement('dummy-mappers', DummyEl);
            registry.configure();

            const el = /** @type {ParsedElement} */ (document.createElement('dummy-mappers'));
            const mappers = Object.fromEntries(
                ['s', 'n', 'p', 'b', 'j', 'c'].map((attr) => [
                    attr,
                    { unmarshal: (str) => el.unmarshal(attr, str), marshal: (value) => el.marshal(attr, value) },
                ]),
            );

            expect(mappers.s.unmarshal('hello'), 'the string mapper reads the attribute text as is').to.equal('hello');
            expect(mappers.s.marshal('hello'), 'the string mapper writes a string unchanged').to.equal('hello');
            expect(mappers.s.marshal(null), 'the string mapper writes null so the attribute is removed').to.be.null;

            expect(mappers.n.unmarshal('123'), 'the number mapper parses the attribute text as a number').to.equal(123);
            expect(mappers.n.unmarshal(null), 'the number mapper reads a missing attribute as null, not as 0').to.be
                .null;
            expect(mappers.n.marshal(123), 'the number mapper writes the number as its decimal string').to.equal('123');
            expect(mappers.n.marshal(null), 'the number mapper writes null so the attribute is removed').to.be.null;

            expect(
                mappers.p.unmarshal('anything'),
                'the presence mapper reads any present attribute as true, whatever its text',
            ).to.be.true;
            expect(mappers.p.unmarshal(null), 'the presence mapper reads a missing attribute as false').to.be.false;
            expect(mappers.p.marshal(true), 'the presence mapper writes true as an empty attribute').to.equal('');
            expect(mappers.p.marshal(false), 'the presence mapper writes false as null so the attribute is removed').to
                .be.null;

            expect(mappers.b.unmarshal('true'), 'the bool mapper reads the text true as true').to.be.true;
            expect(mappers.b.unmarshal('false'), 'the bool mapper reads any text other than true as false').to.be.false;
            expect(mappers.b.marshal(true), 'the bool mapper writes true as the text true').to.equal('true');
            expect(
                mappers.b.marshal(false),
                'the bool mapper writes false as the text false, keeping the attribute',
            ).to.equal('false');
            expect(mappers.b.marshal(null), 'the bool mapper writes null so the attribute is removed').to.be.null;

            expect(mappers.j.unmarshal('{"a":1}'), 'the json mapper parses the attribute text as json').to.deep.equal({
                a: 1,
            });
            expect(mappers.j.unmarshal(null), 'the json mapper reads a missing attribute as null').to.be.null;
            expect(mappers.j.marshal({ a: 1 }), 'the json mapper writes the value as a json string').to.equal(
                '{"a":1}',
            );
            expect(mappers.j.marshal(null), 'the json mapper writes null so the attribute is removed').to.be.null;

            expect(
                mappers.c.unmarshal('a, b, c'),
                'the csv mapper splits on commas and trims each entry',
            ).to.deep.equal(['a', 'b', 'c']);
            expect(
                mappers.c.unmarshal(null),
                'the csv mapper reads a missing attribute as an empty list',
            ).to.deep.equal([]);
            expect(
                mappers.c.marshal(['a', 'b']),
                'the csv mapper joins the entries with commas and no spaces',
            ).to.equal('a,b');
            expect(mappers.c.marshal(null), 'the csv mapper writes null so the attribute is removed').to.be.null;
        });

        it('throws an error if an unsupported mapper is requested', () => {
            class BadEl extends HTMLElement {
                static attributes = ['attr:unknownType'];
            }
            registry.defineElement('bad-mappers', BadEl);
            expect(
                () => registry.configure(),
                'defining an element with an attribute type no mapper handles fails and names the type',
            ).to.throw('unsupported attribute type: unknownType');
        });

        it('composes observed attributes along the inheritance chain, the leaf overriding the same name', () => {
            class ChainBase extends ParsedElement {
                static observed = ['value', 'inherited:number'];
            }
            class ChainLeaf extends ChainBase {
                static observed = ['own:csv', 'value:json', 'inherited:presence'];
            }
            registry.defineElement('chain-leaf', ChainLeaf);
            registry.configure();

            const el = /** @type {ParsedElement} */ (document.createElement('chain-leaf'));
            expect(
                [...ChainLeaf.observedAttributes].sort(),
                'the leaf observes the names of the whole chain, each once',
            ).to.deep.equal(['inherited', 'own', 'value']);
            expect(
                el.unmarshal('value', '{"a":1}'),
                'the leaf re-declaring value as json overrides the base string mapping',
            ).to.deep.equal({ a: 1 });
            expect(
                el.unmarshal('inherited', '5'),
                'the leaf re-declaring inherited as presence overrides the base number mapping',
            ).to.equal(true);
            expect(el.unmarshal('own', 'a, b'), 'a name only the leaf declares uses the leaf mapper').to.deep.equal([
                'a',
                'b',
            ]);
        });
    });

    describe('Observed attribute order', () => {
        it('moves a re-declared name to the position of its last declaration', () => {
            class OrderBase extends ParsedElement {
                static observed = ['value', 'shape'];
            }
            class OrderLeaf extends OrderBase {
                static observed = ['value'];
            }
            registry.defineElement('order-leaf', OrderLeaf);
            registry.configure();

            expect(
                [...OrderLeaf.observedAttributes],
                'observed attributes are applied in the composed order, so the leaf re-declaring value moves it after shape',
            ).to.deep.equal(['shape', 'value']);
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

            expect(pluginConfigured, 'plugin hands the registry to the plugin configure at once').to.be.true;

            const scope = registry.evaluator();
            expect(
                scope.evaluateExpression('#mod1:fn()'),
                'a module function resolves in expressions as #name:fn',
            ).to.equal('called');
            expect(
                scope.resolve('baseData'),
                'defineData puts its entries on the data stack the evaluator resolves over',
            ).to.be.true;
            expect(scope.resolve('overlayData'), 'defineOverlay appends its entries to the data stack').to.be.true;
            expect(
                registry.component('myComp'),
                'component answers what defineComponent registered under the name',
            ).to.deep.equal({ config: true });

            const evalInst = registry.evaluator();
            expect(evalInst, 'the registry answers an evaluator on every call').to.exist;
        });

        it('allows defining elements dynamically after configuration is finalized', () => {
            registry.configure();

            class DirectEl extends HTMLElement {
                static observed = ['val'];
            }
            registry.defineElement('direct-el', DirectEl);

            expect(DirectEl.BITS, 'after configure, defineElement augments the class at once instead of deferring it')
                .to.exist;
            expect(
                DirectEl.BITS.OBSERVED,
                'the class declarations are composed immediately into its BITS',
            ).to.deep.equal(['val']);
        });

        it('names the property each observed attribute drives, dash to camel', () => {
            expect(Registry.propertyOf('value'), 'a name with no dash drives the property of the same name').to.equal(
                'value',
            );
            expect(
                Registry.propertyOf('page-size'),
                'a dash followed by a letter becomes that letter in upper case, as dataset does',
            ).to.equal('pageSize');
            expect(
                Registry.propertyOf('clear-invalid-on-change'),
                'every dash in the name is converted, not only the first',
            ).to.equal('clearInvalidOnChange');
            expect(
                Registry.propertyOf('max-total-size'),
                'a name with several dashes camel cases each segment',
            ).to.equal('maxTotalSize');
            expect(Registry.propertyOf('placeholder'), 'a long name with no dash is left unchanged').to.equal(
                'placeholder',
            );

            class PagedEl extends HTMLElement {
                static observed = ['page-size:number'];
                static attributes = ['scroll-on-error:presence'];
            }
            registry.configure();
            registry.defineElement('paged-registry-el', PagedEl);

            expect(
                PagedEl.BITS.OBSERVED,
                'only the observed declarations are observed, with their dashes kept',
            ).to.deep.equal(['page-size']);
            expect(
                PagedEl.BITS.ATTR_TO_PROPERTY,
                'an observed hyphenated attribute drives its camel case property',
            ).to.deep.equal({ 'page-size': 'pageSize' });
            expect(
                Object.keys(PagedEl.BITS.ATTR_TO_MAPPER).sort(),
                'both observed and configuration attributes get a mapper',
            ).to.deep.equal(['page-size', 'scroll-on-error']);
            expect(
                PagedEl.BITS.ATTR_TO_PROPERTY,
                'a configuration attribute is read once at the upgrade and drives no property',
            ).to.not.have.property('scroll-on-error');
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
            attached(el);

            QueueEl.BITS.enqueue(el);
            QueueEl.BITS.enqueue(el);

            expect(
                registry.pending().length === 1 && registry.pending()[0] === el,
                'enqueuing the same element twice queues it once',
            ).to.equal(true);

            await registry.whenUpgraded(el);

            expect(upgraded, 'the queue runs the element upgrade before whenUpgraded resolves').to.be.true;
            expect(registry.pending().length, 'an element leaves the queue once its upgrade completes').to.equal(0);

            el.remove();
        });

        it('hands out the same readiness promise to every caller', () => {
            expect(registry.ready(), 'every call to ready answers the one promise of the registry').to.equal(
                registry.ready(),
            );
        });

        it('awaits readiness, resolving after the ftl:ready event has been dispatched', async () => {
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
            await late.ready();
        });
    });
});
