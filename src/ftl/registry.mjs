import { Nodes } from './dom.mjs';
import { ExpressionEvaluator } from './expressions.mjs';
import { Template } from './template.mjs';

class UpgradeQueue {
    #q = new Map();
    #readyResolve;
    #ready = new Promise((resolve) => {
        this.#readyResolve = resolve;
    });
    constructor() {
        Nodes.waitDomContentLoaded(document).then(() => {
            this.#start();
        });
    }
    ready() {
        return this.#ready;
    }
    async #start() {
        await this.settled();
        document.dispatchEvent(
            new CustomEvent('ftl:ready', {
                bubbles: false,
                cancelable: false,
            }),
        );
        this.#readyResolve();
    }
    enqueue(el) {
        if (this.#q.has(el)) {
            return;
        }
        const { promise: finished, resolve: markFinished } = /** @type {PromiseWithResolvers<void>} */ (
            Promise.withResolvers()
        );
        const upgrade = Nodes.waitParsed(el)
            .then(() => el.upgrade())
            .finally(() => {
                this.#q.delete(el);
                markFinished();
            });
        this.#q.set(el, { upgrade, finished });
    }
    async #drain(accept, pick) {
        for (;;) {
            const pending = Array.from(this.#q)
                .filter(([el]) => accept(el))
                .map(([, entry]) => pick(entry));
            if (pending.length === 0) {
                return;
            }
            await Promise.all(pending);
        }
    }
    /**
     * Waits for the whole queue to drain, the upgrades enqueued meanwhile included.
     * Never rejects: a failed upgrade counts as drained.
     * @returns {Promise<void>}
     */
    settled() {
        return this.#drain(() => true, (entry) => entry.finished);
    }
    /**
     * Waits for the accepted upgrades, the ones enqueued meanwhile included,
     * rejecting with the first that failed.
     * @param {(el: Element) => boolean} accept
     * @returns {Promise<void>}
     */
    upgraded(accept) {
        return this.#drain(accept, (entry) => entry.upgrade);
    }
    whenUpgraded(el) {
        return this.#q.get(el)?.upgrade;
    }
    pending() {
        return Array.from(this.#q.keys());
    }
}

/**
 * The page's single source of truth for elements, modules, data, components
 * and attribute mappers. Elements defined before configure() are deferred and
 * defined by it; from then on every defineElement takes effect immediately.
 * The exported `registry` singleton is the page's own; a `new Registry()` is a
 * separate instance with its own upgrade queue, which dispatches its own
 * ftl:ready on the document, while Rendering waits on the singleton alone.
 */
class Registry {
    #tagToClass = {};
    #configured = false;
    #mappers = {
        string: {
            unmarshal(str, name, el) {
                return str;
            },
            marshal(value, name, el) {
                return value == null ? null : String(value);
            },
        },
        number: {
            unmarshal(str, name, el) {
                return str === null ? null : Number(str);
            },
            marshal(value, name, el) {
                return value == null ? null : String(value);
            },
        },
        presence: {
            unmarshal(str, name, el) {
                return str !== null;
            },
            marshal(value, name, el) {
                return value ? '' : null;
            },
        },
        bool: {
            unmarshal(str, name, el) {
                return str === 'true';
            },
            marshal(value, name, el) {
                return value == null ? null : String(value === true);
            },
        },
        json: {
            unmarshal(str, name, el) {
                return str === null ? null : JSON.parse(str);
            },
            marshal(value, name, el) {
                return value == null ? null : JSON.stringify(value);
            },
        },
        csv: {
            unmarshal(str, name, el) {
                return str === null
                    ? []
                    : str
                          .split(',')
                          .map((e) => e.trim())
                          .filter((e) => e);
            },
            marshal(value, name, el) {
                return value == null ? null : value.join(',');
            },
        },
    };
    #components = {};
    #modules;
    #data = [];
    #evaluator = new ExpressionEvaluator(undefined, []);
    #upgradeQueue = new UpgradeQueue();
    /**
     * Registers a custom element under its tag: the class is augmented with its
     * BITS (observed attributes, mappers, templates) and handed to the platform.
     * Before configure() the definition is deferred, so import order never
     * matters. The element resolves its templates and components through this
     * registry, whichever one a module imports, and its `static config` is read
     * here, so a page replacing it does so before the definition.
     * @param {string} tag
     * @param {*} klass a ParsedElement subclass
     * @returns {Registry} this registry
     */
    defineElement(tag, klass) {
        if (!this.#configured) {
            this.#tagToClass[tag] = klass;
            return this;
        }
        this.#augmentAndDefineElement(tag, klass);
        return this;
    }
    /**
     * The attribute declarations a class composes along its inheritance chain,
     * base first: `observed` stay live after the upgrade and drive the property
     * `propertyOf` names, `attributes` are the configuration read once at it and
     * drive no property at all. A subclass's entry for a name overrides its
     * ancestors', so a base class declares what every subclass keeps observing
     * (a protocol attribute such as Field's disabled claim) and a leaf refines a
     * mapping, or moves a name's position, without repeating the whole list.
     * The observed attributes are applied in the composed order, a re-declared
     * name taking the position of its last declaration.
     * @param {*} klass a ParsedElement subclass
     * @returns {{ observed: string[], attributes: string[] }}
     */
    static declarationsOf(klass) {
        const chain = [];
        for (let c = klass; c !== null && c !== HTMLElement; c = Object.getPrototypeOf(c)) {
            chain.unshift(c);
        }
        const own = (name) => chain.flatMap((c) => Object.getOwnPropertyDescriptor(c, name)?.value ?? []);
        return { observed: own('observed'), attributes: own('attributes') };
    }
    /**
     * The property an observed attribute drives, by the platform's own
     * dash-to-camel rule: the one `dataset` applies, so `clear-invalid-on-change`
     * would reach `clearInvalidOnChange` the way `data-clear-invalid-on-change`
     * reaches `dataset.clearInvalidOnChange`.
     *
     * Only this direction is mapped. A property never derives its attribute: a
     * setter reflects through `reflectTo`, naming the attribute it writes.
     * @param {string} attribute
     * @returns {string}
     */
    static propertyOf(attribute) {
        return attribute.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    }
    #augmentAndDefineElement(tag, klass) {
        const { observed, attributes } = Registry.declarationsOf(klass);
        const { template, templates, slots, mappers, config } = klass;
        const declaredNames = observed.map((a) => a.split(':')[0]);
        const observedNames = [...new Set(declaredNames.reverse())].reverse();
        const attrToMapper = [...attributes, ...observed].reduce((acc, a) => {
            const [attr, maybeType] = a.split(':');
            const type = maybeType ?? 'string';
            if (!(type in this.#mappers) && !(type in (mappers ?? {}))) {
                throw new Error(`unsupported attribute type: ${type}`);
            }
            acc[attr] = mappers?.[type] ?? this.#mappers[type];
            return acc;
        }, {});

        const namesAndTemplates = Object.entries(
            Object.assign({}, templates, template ? { default: template } : {}),
        ).map(([k, v]) => [k, Template.fromHtml(v)]);
        const nameToTemplate = Object.fromEntries(namesAndTemplates);

        klass.BITS = {
            registry: this,
            enqueue: (el) => this.#upgradeQueue.enqueue(el),
            SLOTS: slots,
            CONFIG: config,
            OBSERVED: observedNames,
            DECLARED: [...new Set([...observedNames, ...attributes.map((a) => a.split(':')[0])])],
            ATTR_TO_MAPPER: attrToMapper,
            ATTR_TO_PROPERTY: Object.fromEntries(observedNames.map((a) => [a, Registry.propertyOf(a)])),
            TEMPLATES: nameToTemplate,
        };
        customElements.define(tag, klass);
    }
    /**
     * Merges one module under its name, its functions resolving as
     * `#name:fn`; an empty name merges a whole map, whose keys resolve bare,
     * as `#fn`.
     * @param {string} name
     * @param {object} value
     * @returns {Registry} this registry
     */
    defineModule(name, value) {
        const module = name ? { [name]: value } : value;
        this.#modules = { ...this.#modules, ...module };
        this.#rebind();
        return this;
    }
    /**
     * Replaces the whole module map.
     * @param {object} ms
     * @returns {Registry} this registry
     */
    defineModules(ms) {
        this.#modules = ms;
        this.#rebind();
        return this;
    }
    /**
     * Registers a named component (a loader, a response mapper), fetched back
     * through component().
     * @param {string} name
     * @param {*} value
     * @returns {Registry} this registry
     */
    defineComponent(name, value) {
        this.#components[name] = value;
        return this;
    }
    /**
     * Replaces the data stack the templates evaluate over.
     * @param {...any} data
     * @returns {Registry} this registry
     */
    defineData(...data) {
        this.#data = data;
        this.#rebind();
        return this;
    }
    /**
     * Appends to the data stack, the later entry winning a shared name.
     * @param {...any} data
     * @returns {Registry} this registry
     */
    defineOverlay(...data) {
        this.#data = [...this.#data, ...data];
        this.#rebind();
        return this;
    }
    /**
     * Registers a custom attribute mapper type, available to every later
     * `name:type` declaration.
     * @param {string} k
     * @param {{ unmarshal(str: string|null, name: string, el: Element): any, marshal(value: any, name: string, el: Element): string|null }} v
     * @returns {Registry} this registry
     */
    defineMapper(k, v) {
        this.#mappers[k] = v;
        return this;
    }
    /**
     * Hands the registry over to the plugin's configure.
     * @param {{ configure(registry: Registry): void }} p
     * @returns {Registry} this registry
     */
    plugin(p) {
        p.configure(this);
        return this;
    }
    /**
     * Defines every element deferred so far; from then on, defineElement takes
     * effect immediately.
     * @returns {Registry} this registry
     */
    configure() {
        for (const [tag, klass] of Object.entries(this.#tagToClass)) {
            this.#augmentAndDefineElement(tag, klass);
            delete this.#tagToClass[tag];
        }
        this.#configured = true;
        return this;
    }
    /**
     * Waits for the queued upgrades the filter accepts, rejecting with the first
     * that failed, the upgrades enqueued meanwhile included: the rejecting
     * barrier Rendering is a facade over.
     * @param {(el: Element) => boolean} accept
     * @returns {Promise<void>}
     */
    settle(accept) {
        return this.#upgradeQueue.upgraded(accept);
    }
    /**
     * The pending upgrade of one element: resolving when it has rendered,
     * rejecting with what its upgrade threw.
     * @param {Element} el
     * @returns {Promise<void>|undefined} undefined when the element is not queued
     */
    whenUpgraded(el) {
        return this.#upgradeQueue.whenUpgraded(el);
    }
    /**
     * The elements whose upgrade is still pending, in queue order.
     * @returns {Element[]}
     */
    pending() {
        return this.#upgradeQueue.pending();
    }
    /**
     * Waits for this registry's readiness: resolves right after its ftl:ready
     * event is dispatched on the document, and immediately when that already
     * happened. Never rejects: a failed upgrade counts as settled, and its
     * rejection is left unhandled so it still reaches the console and the
     * page's error reporting.
     * @returns {Promise<void>}
     */
    ready() {
        return this.#upgradeQueue.ready();
    }
    #rebind() {
        this.#evaluator = new ExpressionEvaluator(this.#modules, this.#data);
    }
    /**
     * The scope every template on this registry renders in: the modules and the
     * data stack, as one value. Replaced whenever either is defined, so a holder
     * of an older one keeps rendering against what it was handed.
     * @returns {ExpressionEvaluator}
     */
    evaluator() {
        return this.#evaluator;
    }
    /**
     * The component registered under the name.
     * @param {string} name
     * @returns {any} undefined when none is
     */
    component(name) {
        return this.#components[name];
    }
}

const registry = new Registry();

export { Registry, registry };
