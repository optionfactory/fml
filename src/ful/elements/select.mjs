import { Attributes, Fragments, ParsedElement, registry, Templates } from '../../ftl/index.mjs';
import { VersionedLocalStorage } from '../storage.mjs';
import { Timing } from '../timing.mjs';

class RemoteLoader {
    #http;
    #url;
    #method;
    #responseMapper;
    #prefetch;
    #revision;
    #data;
    constructor({ http, url, method, responseMapper, prefetch, revision }) {
        this.#http = http;
        this.#url = url;
        this.#method = method;
        this.#responseMapper = responseMapper;
        this.#prefetch = prefetch;
        this.#revision = revision;
        this.#data = null;
    }
    async prefetch() {
        if (!this.#prefetch) {
            return;
        }
        await this.#ensureFetched();
    }
    async exact(...keys) {
        await this.#ensureFetched();
        return this.#data.filter(([k, v]) => keys.some((r) => r == k));
    }
    async load(needle) {
        await this.#ensureFetched();
        return this.#data.filter(([k, v]) => (v ?? '').toLowerCase().includes(needle?.toLowerCase()));
    }
    async reconfigureUrl(url) {
        this.#data = null;
        this.#url = url;
    }
    async #ensureFetched() {
        if (this.#data !== null) {
            return;
        }
        const raw = await RemoteLoader.#revisionedData(this.#http, this.#method, this.#url, this.#revision);
        this.#data = this.#responseMapper(raw);
    }
    static async #revisionedData(http, method, url, revision) {
        const storageKey = `${method}@${url}`;
        if (revision !== null) {
            const data = VersionedLocalStorage.load(storageKey, revision);
            if (data !== undefined) {
                return data;
            }
        }
        const data = await http.request(method, url).fetchJson();
        if (revision !== null) {
            VersionedLocalStorage.save(storageKey, revision, data);
        }
        return data;
    }
}

class PartialRemoteLoader {
    #http;
    #url;
    #method;
    #responseMapper;
    constructor({ http, url, method, responseMapper }) {
        this.#http = http;
        this.#url = url;
        this.#method = method;
        this.#responseMapper = responseMapper;
    }
    async exact(...keys) {
        const response = await this.#http
            .request(this.#method, this.#url)
            .param('k', ...keys)
            .fetchJson();
        return this.#responseMapper(response);
    }
    async load(needle) {
        const response = await this.#http.request(this.#method, this.#url).param('s', needle).fetchJson();
        return this.#responseMapper(response);
    }
}

class InMemoryLoader {
    #data;
    constructor(data) {
        this.#data = data;
    }
    update(data) {
        this.#data = data;
    }
    exact(...keys) {
        return this.#data.filter(([k, v]) => keys.some((r) => r == k));
    }
    load(needle) {
        return this.#data.filter(([k, v]) => (v ?? '').toLowerCase().includes(needle?.toLowerCase()));
    }
}

class SelectLoader {
    static create(el, conf) {
        if (!el.hasAttribute('src')) {
            const els = Array.from(conf.options?.querySelectorAll('option') ?? []);
            const data = els.map((e) => {
                return [e.getAttribute('value') ?? e.innerText.trim(), e.innerText.trim()];
            });
            return new InMemoryLoader(data);
        }
        const http = registry.component('http-client');
        const responseMapper = SelectLoader.#responseMapperFrom(el);

        if ('chunked' == el.getAttribute('mode')) {
            return new PartialRemoteLoader({
                http,
                url: el.getAttribute('src'),
                method: el.getAttribute('method') ?? 'POST',
                responseMapper,
            });
        }
        return new RemoteLoader({
            http,
            url: el.getAttribute('src'),
            method: el.getAttribute('method') ?? 'POST',
            responseMapper,
            prefetch: el.hasAttribute('preload'),
            revision: el.getAttribute('revision'),
        });
    }
    static #responseMapperFrom(el) {
        if (el.hasAttribute('k-expr') && el.hasAttribute('l-expr')) {
            return (response) => {
                const rows = registry
                    .evaluator()
                    .withOverlay(response)
                    .evaluateExpression(el.getAttribute('d-expr') ?? 'self');
                return rows.map((row) => {
                    const evaluator = registry.evaluator().withOverlay(row);
                    return [
                        evaluator.evaluateExpression(el.getAttribute('k-expr')),
                        evaluator.evaluateExpression(el.getAttribute('l-expr')),
                        evaluator.evaluateExpression(el.getAttribute('m-expr') ?? 'self'),
                    ];
                });
            };
        }
        if (el.hasAttribute('response-mapper')) {
            return registry.component(el.getAttribute('response-mapper'));
        }
        return (response) => response;
    }
}

class Dropdown extends ParsedElement {
    static slots = true;
    static template = `
        <ful-spinner class="centered" hidden></ful-spinner>
        <menu tabindex="-1" role="listbox" hidden></menu>
    `;
    static templates = {
        options: `
            <li data-tpl-each="self" data-tpl-selected="index == 0" data-tpl-value="index" role="option" data-tpl-aria-selected="index == 0 ? 'true' : 'false'">
                {{ label }}
            </li>
        `,
    };
    #spinner;
    #menu;
    #optionstemplate;
    #options = new Map();
    render({ slots }) {
        const fragment = this.template().render();
        this.#optionstemplate = Fragments.isBlank(slots.default)
            ? this.template('options')
            : Templates.fromFragment(slots.default);
        this.#spinner = fragment.querySelector('ful-spinner');
        this.#menu = fragment.querySelector('menu');
        this.#menu.addEventListener('click', (evt) => {
            evt.stopPropagation();
            const li = evt.target.closest('li');
            if (!li) {
                this.hide();
                return;
            }
            this.#change(li);
        });
        this.replaceChildren(fragment);
    }
    acceptSelection() {
        const selected = this.#menu.querySelector('[selected]') ?? this.#menu.firstElementChild;
        this.#change(selected);
    }
    update(values) {
        if (values === undefined) {
            throw new Error('null data');
        }
        this.#options = new Map(values.map((v, i) => [String(i), v]));
        const data = values.map(([key, label, metadata], index) => ({ index, key, label, metadata }));
        this.#optionstemplate.withOverlay(data).renderTo(this.#menu);
    }
    #change(target) {
        const index = target.getAttribute('value');
        const data = this.#options.get(index);
        this.hide();
        this.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                cancelable: false,
                detail: { index, data },
            }),
        );
    }
    hide() {
        this.setAttribute('hidden', '');
    }
    get shown() {
        return !this.hasAttribute('hidden');
    }
    async show(loader) {
        this.removeAttribute('hidden');
        this.#menu.setAttribute('hidden', '');
        this.#spinner.removeAttribute('hidden');
        try {
            const data = await loader();
            this.update(data);
        } finally {
            this.#spinner.setAttribute('hidden', '');
            this.#menu.removeAttribute('hidden');
        }
    }
    async moveOrShow(forward, loader) {
        if (this.shown) {
            const selected = this.#menu.querySelector('[selected]') ?? this.#menu.firstElementChild;
            const candidate = selected[`${forward ? 'next' : 'previous'}ElementSibling`];
            if (candidate) {
                selected.removeAttribute('selected');
                candidate.setAttribute('selected', '');
                candidate.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
            return;
        }
        await this.show(loader);
    }
}

class Select extends ParsedElement {
    static observed = ['value:csvm', 'readonly:presence', 'required:presence', 'itemlist:presence'];
    static slots = true;
    static template = `
        <div class="form-label">
            <label>{{{{ slots.default }}}}</label>
            {{{{ slots.info }}}}
        </div>
        <div class="input-group flex-nowrap" tabindex="-1">
            <span data-tpl-if="slots.ibefore" class="input-group-text">{{{{ slots.ibefore }}}}</span>
            {{{{ slots.before }}}}
            <div class="ful-select-input-container">
                <div class="ful-select-input">
                    <badges></badges>
                    <input type="text" form="" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false">
                </div>
                <ful-dropdown hidden popover="manual">{{{{ slots.dropdown }}}}</ful-dropdown>
            </div>
            {{{{ slots.after }}}}
            <span data-tpl-if="slots.iafter" class="input-group-text">{{{{ slots.iafter }}}}</span>
        </div>
        <ful-item-list></ful-item-list>
        <ful-field-error></ful-field-error>
    `;
    static templates = {
        items: `
            <ful-item data-tpl-each="entries" data-tpl-var="entry" data-tpl-data-key="entry[0]">
                <div>{{ entry[1][0] }}</div>
                <button type="button" class="btn btn-sm btn-outline-danger bi bi-x-lg"></button>
            </ful-item>
        `,
    };
    static formAssociated = true;
    internals;
    #loader;
    #badges;
    #ddmenu;
    #input;
    #items;
    #multiple;
    #fieldError;
    #values = new Map();
    constructor() {
        super();
        this.internals = this.attachInternals();
        this.internals.role = 'presentation';
    }
    async render({ slots, observed, disabled }) {
        const name = this.getAttribute('name');
        this.#loader = registry
            .component(this.getAttribute('loader') ?? 'loaders:select')
            .create(this, { options: slots.options });

        this.#multiple = this.hasAttribute('multiple');
        await this.#loader.prefetch?.();
        const fragment = this.template().withOverlay({ slots, name }).render();
        this.#input = fragment.querySelector('input');
        this.#items = fragment.querySelector('ful-item-list');
        Attributes.forward('input-', this, this.#input);
        this.#badges = fragment.querySelector('badges');

        this.value = observed.value;
        this.disabled = disabled;
        this.readonly = observed.readonly;
        this.required = observed.required;
        this.itemlist = observed.itemlist;

        this.#ddmenu = fragment.querySelector('ful-dropdown');
        const label = fragment.querySelector('label');
        label.addEventListener('click', () => this.focus());
        this.#fieldError = fragment.querySelector('ful-field-error');
        this.#input.ariaDescribedByElements = [this.#fieldError];
        this.#input.ariaLabelledByElements = [label];

        const self = this;
        const [dload, abortdload] = Timing.throttle(400, () => {
            self.#input.setAttribute('aria-expanded', 'true');
            self.#ddmenu.show(() => self.#loader.load(self.#input.value));
        });
        this.addEventListener('click', (/** @type any */ e) => {
            if (e.target.matches('input')) {
                return;
            }
            if (this.disabled || this.readonly) {
                return;
            }
            if (this.#ddmenu.shown) {
                this.#input.setAttribute('aria-expanded', 'false');
                this.#ddmenu.hide();
                return;
            }
            this.#input.focus();
            dload();
        });
        this.#items.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!e.target.closest('button')) {
                return;
            }
            if (this.disabled || this.readonly) {
                return;
            }
            const idx = [...this.#items.children].indexOf(e.target.closest('ful-item'));
            if (idx === -1) {
                return;
            }
            this.#values.delete(Array.from(this.#values.keys())[idx]);
            this.#changed();
            this.#syncBadges();
        });
        this.#badges.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.disabled || this.readonly) {
                return;
            }
            const idx = [...this.#badges.children].indexOf(e.target);
            if (idx === -1) {
                return;
            }
            this.#values.delete(Array.from(this.#values.keys())[idx]);
            this.#changed();
            this.#syncBadges();
        });
        this.#input.addEventListener('change', (e) => {
            e.stopPropagation();
        });
        this.#input.addEventListener('blur', (e) => {
            e.stopPropagation();
            if (e.relatedTarget && this.contains(e.relatedTarget)) {
                return;
            }
            abortdload();
            this.#input.setAttribute('aria-expanded', 'false');
            this.#ddmenu.hide();
            this.#input.value = '';
        });
        this.#input.addEventListener('keydown', (e) => {
            if (this.disabled || this.readonly) {
                return;
            }
            switch (e.code) {
                case 'ArrowUp': {
                    e.preventDefault();
                    this.#input.setAttribute('aria-expanded', 'true');
                    this.#ddmenu.moveOrShow(false, () => self.#loader.load(self.#input.value));
                    break;
                }
                case 'ArrowDown': {
                    e.preventDefault();
                    this.#input.setAttribute('aria-expanded', 'true');
                    this.#ddmenu.moveOrShow(true, () => self.#loader.load(self.#input.value));
                    break;
                }
                case 'Escape': {
                    this.#input.setAttribute('aria-expanded', 'false');                    
                    this.#ddmenu.hide();
                    break;
                }
                case 'Enter': {
                    e.preventDefault();
                    this.#input.setAttribute('aria-expanded', 'false');
                    this.#ddmenu.acceptSelection();
                    this.#input.value = '';
                    break;
                }
                case 'Backspace': {
                    //remove last if caret at position 0
                    if (this.#values.size && this.#input.selectionStart === 0 && this.#input.selectionEnd === 0) {
                        this.#values.delete(Array.from(this.#values.keys()).pop());
                        this.#changed();
                        this.#syncBadges();
                    }
                    break;
                }
                case 'Tab': {
                    this.#input.setAttribute('aria-expanded', 'false');
                    this.#ddmenu.hide();
                    abortdload();
                    break;
                }
            }
        });
        this.#input.addEventListener('input', (e) => {
            e.stopPropagation();
            if (this.disabled || this.readonly) {
                return;
            }
            dload();
        });
        this.#ddmenu.addEventListener('change', (e) => {
            e.stopPropagation();
            if (!this.#multiple) {
                this.#values.clear();
            }
            this.#values.set(e.detail.data[0], e.detail.data.slice(1));
            this.#changed();
            this.#syncBadges();
            this.#input.focus();
            this.#input.setAttribute('aria-expanded', 'false');
            this.#ddmenu.hide();
            this.#input.value = '';
        });
        this.replaceChildren(fragment);
    }
    async withLoader(fn) {
        return await fn(this.#loader);
    }
    #changed() {
        const selection = [...this.#values.entries()].map((e) => ({
            key: e[0],
            label: e[1][0],
            metadata: e[1].slice(1),
        }));
        const value = this.#multiple ? selection : (selection[0] ?? null);
        this.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                cancelable: false,
                detail: { value },
            }),
        );
    }
    #syncBadges() {
        const badges = Array.from(this.#values.entries()).map(([k, v]) => {
            const b = document.createElement('badge');
            b.setAttribute('role', 'button');
            b.setAttribute('value', k);
            b.innerText = v[0];
            return b;
        });
        this.#badges.replaceChildren();
        this.#badges.append(...badges);
        this.#items.replaceChildren();
        this.template('items').withOverlay({ entries: this.#values.entries() }).renderTo(this.#items);
    }
    set value(vs) {
        if (vs === null) {
            this.#values = new Map();
            this.#syncBadges();
            return;
        }
        (async () => {
            const entries = await (this.#multiple ? this.#loader.exact(...vs) : this.#loader.exact(vs));
            this.#values = new Map(entries.map((e) => [e[0], e.slice(1)]));
            this.#syncBadges();
        })();
    }
    get value() {
        if (this.#multiple) {
            return [...this.#values.keys()];
        }
        return [...this.#values.keys()][0] ?? null;
    }
    get entry() {
        if (this.#multiple) {
            return [...this.#values.entries()];
        }
        return [...this.#values.entries()][0] ?? null;
    }
    get disabled() {
        return this.#input.hasAttribute('disabled');
    }
    set disabled(d) {
        Attributes.toggle(this.#input, 'disabled', d);
    }
    get readonly() {
        return this.#input.readOnly;
    }
    set readonly(v) {
        this.#input.readOnly = v;
        this.reflect(() => {
            Attributes.toggle(this, 'readonly', v);
        });
    }
    get required() {
        return this.#input.getAttribute('aria-required') === 'true';
    }
    set required(d) {
        Attributes.set(this.#input, 'aria-required', d ? 'true' : null);
        this.reflect(() => {
            Attributes.toggle(this, 'required', d);
        });
    }
    #useItemlist;
    get itemlist() {
        return this.#useItemlist;
    }
    set itemlist(v) {
        this.#useItemlist = v;
        this.reflect(() => {
            Attributes.toggle(this, 'itemlist', v);
        });
    }
    focus(options) {
        this.#input.focus(options);
    }
    setCustomValidity(error) {
        if (!error) {
            this.internals.setValidity({});
            this.#fieldError.innerText = '';
            return;
        }
        this.internals.setValidity({ customError: true }, ' ');
        this.#fieldError.innerText = error;
    }
}

export { Dropdown, Select, SelectLoader };
