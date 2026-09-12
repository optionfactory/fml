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
    /**
     * Waits for the page's readiness: the promise resolves right after the
     * ftl:ready event is dispatched, and immediately when that moment already
     * passed.
     * @returns {Promise<void>}
     */
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
            //already upgrading, can happen when disconnecting an element
            //while it's already queued for upgrade (e.g.: ful-form)
            return;
        }
        //one entry, two signals: readiness waits on a signal that only ever
        //resolves, so nothing here attaches a rejection handler to the upgrade
        //itself and a component that fails is still reported the way it always was
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
    /**
     * The one fixed-point loop: drains the accepted entries, including the ones
     * enqueued while waiting, since a component is only queued once its parent
     * connects it and a single pass would miss everything nested.
     */
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
     * Waits for the whole queue to drain. Never rejects: a component that fails
     * does not hold the others back, and readiness means the queue drained rather
     * than that everything worked.
     */
    settled() {
        return this.#drain(() => true, (entry) => entry.finished);
    }
    /** Waits for the accepted upgrades, rejecting with the first that failed. */
    upgraded(accept) {
        return this.#drain(accept, (entry) => entry.upgrade);
    }
    /** The pending upgrade of one element, undefined when it is not queued. */
    whenUpgraded(el) {
        return this.#q.get(el)?.upgrade;
    }
    /** The elements whose upgrade is still pending, in queue order. */
    pending() {
        return Array.from(this.#q.keys());
    }
}

/**
 * The page's single source of truth for elements, modules, data, components
 * and attribute mappers. Elements defined before configure() are deferred and
 * defined by it; from then on every defineElement takes effect immediately.
 * The exported `registry` singleton is the page's own; a `new Registry()` is a
 * separate instance, and Rendering and the ftl:ready machinery wait on the
 * singleton alone.
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
        csvm: {
            unmarshal(str, name, el) {
                if (el.hasAttribute('multiple')) {
                    return str === null
                        ? []
                        : str
                              .split(',')
                              .map((e) => e.trim())
                              .filter((e) => e);
                }
                return str === null || str === '' ? null : str;
            },
            marshal(value, name, el) {
                if (el.hasAttribute('multiple')) {
                    return value == null ? null : value.join(',');
                }
                return value == null ? null : String(value);
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
     * matters.
     * @param {string} tag
     * @param {*} klass a ParsedElement subclass
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
     * base first: `observed` stay live after the upgrade, `attributes` are the
     * configuration read once at it. A subclass's entry for a name overrides its
     * ancestors', so a base class declares what every subclass keeps observing
     * (a protocol attribute such as Field's disabled claim) and a leaf refines a
     * mapping, or moves a name's position, without repeating the whole list.
     *
     * The walk stops where the platform's own class hierarchy begins: no earlier
     * stop can work, since a registered ancestor carries an own BITS of its own,
     * and nothing above the elements declares anything.
     *
     * Everything deriving a component's attribute vocabulary reads it here, so
     * the runtime and whatever documents it cannot walk the chain differently.
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
    #augmentAndDefineElement(tag, klass) {
        const { observed, attributes } = Registry.declarationsOf(klass);
        const { template, templates, slots, mappers } = klass;
        //a name a subclass re-declares takes the subclass's position, which is
        //how a field whose value setter reads its own shape attributes declares
        //that its value lands after them: the order the declarations compose in
        //is the order the base applies them
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
            //the defining registry travels with the definition: an element resolves
            //its templates and its components through the registry that defined it,
            //not through whichever one a module happened to import
            registry: this,
            enqueue: (el) => this.#upgradeQueue.enqueue(el),
            SLOTS: slots,
            OBSERVED: observedNames,
            DECLARED: [...new Set([...observedNames, ...attributes.map((a) => a.split(':')[0])])],
            ATTR_TO_MAPPER: attrToMapper,
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
     */
    defineComponent(name, value) {
        this.#components[name] = value;
        return this;
    }
    /**
     * Replaces the data stack the templates evaluate over.
     * @param {...any} data
     */
    defineData(...data) {
        this.#data = data;
        this.#rebind();
        return this;
    }
    /**
     * Appends to the data stack, the later entry winning a shared name.
     * @param {...any} data
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
     */
    defineMapper(k, v) {
        this.#mappers[k] = v;
        return this;
    }
    /**
     * Hands the registry over to the plugin's configure.
     * @param {{ configure(registry: Registry): void }} p
     */
    plugin(p) {
        p.configure(this);
        return this;
    }
    /**
     * Defines every element deferred so far; from then on, defineElement takes
     * effect immediately.
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
     * that failed: the rejecting barrier Rendering is a facade over.
     * @param {(el: Element) => boolean} accept
     */
    settle(accept) {
        return this.#upgradeQueue.upgraded(accept);
    }
    /** The pending upgrade of one element, undefined when it is not queued. */
    whenUpgraded(el) {
        return this.#upgradeQueue.whenUpgraded(el);
    }
    /** The elements whose upgrade is still pending, in queue order. */
    pending() {
        return this.#upgradeQueue.pending();
    }
    /**
     * Waits for the page's readiness: the same moment the ftl:ready event is
     * dispatched at, resolving immediately when that moment already passed.
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
     */
    evaluator() {
        return this.#evaluator;
    }
    /** The component registered under the name, undefined when none is. */
    component(name) {
        return this.#components[name];
    }
}

const registry = new Registry();

export { Registry, registry };
