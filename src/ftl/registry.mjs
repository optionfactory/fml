import { Nodes } from './dom.mjs';
import { ExpressionEvaluator } from './expressions.mjs';
import { Template } from './template.mjs';

class UpgradeQueue {
    #q = new Map();
    constructor() {
        document.addEventListener('DOMContentLoaded', async () => {
            await this.settle();
            document.dispatchEvent(
                new CustomEvent('ftl:ready', {
                    bubbles: false,
                    cancelable: false,
                }),
            );
        });
    }
    #finished = new Map();
    enqueue(el) {
        if (this.#q.has(el)) {
            //already upgrading, can happen when disconnecting an element
            //while it's already queued for upgrade (e.g.: ful-form)
            return;
        }
        //settling waits on a signal that only ever resolves, so nothing here attaches a
        //rejection handler to the upgrade itself: a component that fails is still
        //reported the way it always was
        const { promise: finished, resolve: markFinished } = /** @type {PromiseWithResolvers<void>} */ (
            Promise.withResolvers()
        );
        const promise = Nodes.waitParsed(el)
            .then(() => el.upgrade())
            .finally(() => {
                this.#q.delete(el);
                this.#finished.delete(el);
                markFinished();
            });
        this.#q.set(el, promise);
        this.#finished.set(el, finished);
    }
    /**
     * Waits for every queued upgrade to settle, including the ones enqueued while
     * waiting: a component is only queued once its parent connects it, so a single pass
     * would miss everything nested. A component that fails to upgrade does not hold the
     * others back, readiness means the queue drained rather than that everything worked.
     */
    async settle() {
        while (this.#finished.size !== 0) {
            await Promise.all(Array.from(this.#finished.values()));
        }
    }
    get entries() {
        return this.#q.entries();
    }
}


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
                    return value === null ? null : value.join(',');
                }
                return value == null ? null : String(value);
            },
        },
    };
    #components = {};
    #modules;
    #data = [];
    #upgradeQueue = new UpgradeQueue();
    defineElement(tag, klass) {
        if (!this.#configured) {
            this.#tagToClass[tag] = klass;
            return this;
        }
        this.#augmentAndDefineElement(tag, klass);
        return this;
    }
    #augmentAndDefineElement(tag, klass) {
        const { observed, attributes, template, templates, slots, mappers } = klass;
        const observedNames = (observed ?? []).map((a) => a.split(':')[0]);
        const attrToMapper = [...(attributes ?? []), ...(observed ?? [])].reduce((acc, a) => {
            const [attr, maybeType] = a.split(':');
            const type = maybeType?.trim() ?? 'string';
            if (!(type in this.#mappers) && !(type in (mappers ?? {}))) {
                throw new Error(`unsupported attribute type: ${type}`);
            }
            acc[attr.trim()] = mappers?.[type] ?? this.#mappers[type];
            return acc;
        }, {});

        const namesAndTemplates = Object.entries(
            Object.assign({}, templates, template ? { default: template } : {}),
        ).map(([k, v]) => [k, Template.fromHtml(v)]);
        const nameToTemplate = Object.fromEntries(namesAndTemplates);

        klass.BITS = {
            enqueue: (el) => this.#upgradeQueue.enqueue(el),
            SLOTS: slots,
            OBSERVED: observedNames,
            ATTR_TO_MAPPER: attrToMapper,
            TEMPLATES: nameToTemplate,
        };
        customElements.define(tag, klass);
    }
    defineModule(name, value) {
        const module = name ? { [name]: value } : value;
        this.#modules = { ...this.#modules, ...module };
        return this;
    }
    defineModules(ms) {
        this.#modules = ms;
        return this;
    }
    defineComponent(name, value) {
        this.#components[name] = value;
        return this;
    }
    defineData(...data) {
        this.#data = data;
        return this;
    }
    defineOverlay(...data) {
        this.#data = [...this.#data, ...data];
        return this;
    }
    defineMapper(k, v) {
        this.#mappers[k] = v;
        return this;
    }
    plugin(p) {
        p.configure(this);
        return this;
    }
    configure() {
        for (const [tag, klass] of Object.entries(this.#tagToClass)) {
            this.#augmentAndDefineElement(tag, klass);
            delete this.#tagToClass[tag];
        }
        this.#configured = true;
        return this;
    }
    get upgrades() {
        return this.#upgradeQueue.entries;
    }
    context() {
        return { modules: this.#modules, data: this.#data };
    }
    evaluator() {
        return new ExpressionEvaluator(this.#modules, this.#data);
    }
    component(name) {
        return this.#components[name];
    }
}

const registry = new Registry();

export { Registry, registry };
