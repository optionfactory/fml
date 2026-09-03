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

        if ('chunked' === el.getAttribute('mode')) {
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
    combobox;
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
    #selected() {
        return this.#menu?.querySelector('[selected]') ?? this.#menu?.firstElementChild ?? null;
    }
    #highlight(li) {
        if (!li) {
            this.combobox?.removeAttribute('aria-activedescendant');
            return;
        }
        for (const el of this.#menu.querySelectorAll('li')) {
            el.toggleAttribute('selected', el === li);
            el.setAttribute('aria-selected', el === li ? 'true' : 'false');
        }
        li.id ||= Attributes.uid('ful-option');
        this.combobox?.setAttribute('aria-activedescendant', li.id);
        li.scrollIntoView({
            block: 'nearest',
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
    }
    acceptSelection() {
        const selected = this.#selected();
        if (!selected) {
            return;
        }
        this.#change(selected);
    }
    update(values, keys = []) {
        if (values === undefined) {
            throw new Error('null data');
        }
        this.#options = new Map(values.map((v, i) => [String(i), v]));
        const data = values.map(([key, label, metadata], index) => ({ index, key, label, metadata }));
        this.#optionstemplate.withOverlay(data).renderTo(this.#menu);
        const current = values.findIndex(([k]) => keys.some((r) => r == k));
        this.#highlight(current > 0 ? this.#menu.children[current] : this.#selected());
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
        this.combobox?.removeAttribute('aria-activedescendant');
    }
    get shown() {
        return !this.hasAttribute('hidden');
    }
    async show(loader, keys = []) {
        this.removeAttribute('hidden');
        this.#menu.setAttribute('hidden', '');
        this.#spinner.removeAttribute('hidden');
        try {
            const data = await loader();
            this.update(data, keys);
        } catch (e) {
            this.hide();
            throw e;
        } finally {
            this.#spinner.setAttribute('hidden', '');
            this.#menu.removeAttribute('hidden');
        }
    }
    async moveOrShow(forward, loader, keys = []) {
        if (this.shown) {
            const selected = this.#selected();
            const candidate = selected?.[`${forward ? 'next' : 'previous'}ElementSibling`];
            if (selected && candidate) {
                this.#highlight(candidate);
            }
            return;
        }
        await this.show(loader, keys);
    }
    jump(first) {
        const target = first ? this.#menu.firstElementChild : this.#menu.lastElementChild;
        if (target) {
            this.#highlight(target);
        }
    }
    page(forward) {
        const selected = this.#selected();
        if (!selected) {
            return;
        }
        const lis = Array.from(this.#menu.children);
        const step = this.#page();
        const target = lis[Math.max(0, Math.min(lis.length - 1, lis.indexOf(selected) + (forward ? step : -step)))];
        this.#highlight(target);
    }
    #page() {
        const first = this.#menu.firstElementChild;
        if (!first || first.offsetHeight === 0) {
            return 1;
        }
        return Math.max(1, Math.trunc(this.#menu.clientHeight / first.offsetHeight));
    }
}

class Select extends ParsedElement {
    static observed = ['value:csvm', 'readonly:presence', 'required:presence', 'itemlist:presence'];
    static slots = true;
    static l10n = {
        en: { remove: 'Remove' },
        it: { remove: 'Rimuovi' },
        es: { remove: 'Eliminar' },
        fr: { remove: 'Retirer' },
    };
    static template = `
        <label>{{{{ slots.default }}}}</label>
        {{{{ slots.info }}}}
        <ful-control-group>
            <ful-affix data-tpl-if="slots.ibefore">{{{{ slots.ibefore }}}}</ful-affix>
            {{{{ slots.before }}}}
            <ful-control>
                <input type="text" form="" autocomplete="off" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false">
            </ful-control>
            {{{{ slots.after }}}}
            <ful-affix data-tpl-if="slots.iafter">{{{{ slots.iafter }}}}</ful-affix>
            <ful-dropdown hidden popover="manual">{{{{ slots.dropdown }}}}</ful-dropdown>
        </ful-control-group>
        <ful-item-list></ful-item-list>
        <ful-field-error></ful-field-error>
    `;
    static templates = {
        items: `
            <ful-item data-tpl-each="entries" data-tpl-var="entry" data-tpl-data-key="entry[0]">
                <div>{{ entry[1][0] }}</div>
                <button type="button" data-tpl-aria-label="#l10n:t('remove')"><ful-icon name="x-lg" aria-hidden="true"></ful-icon></button>
            </ful-item>
        `,
    };
    static formAssociated = true;
    internals;
    #loader;
    #control;
    #ddmenu;
    #input;
    #items;
    #multiple;
    #fieldError;
    #values = new Map();
    #token = 0;
    #editing = false;
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
        try {
            await this.#loader.prefetch?.();
        } catch (/** @type any */ e) {
            console.warn('failed to prefetch select options', this, 'reason:', e);
        }
        const fragment = this.template().withOverlay({ slots, name }).render();
        this.#input = fragment.querySelector('input');
        this.#items = fragment.querySelector('ful-item-list');
        Attributes.forward('input-', this, this.#input);
        this.#control = fragment.querySelector('ful-control');

        this.value = observed.value;
        this.disabled = disabled;
        this.readonly = observed.readonly;
        this.required = observed.required;
        this.itemlist = observed.itemlist;

        this.#ddmenu = fragment.querySelector('ful-dropdown');
        this.#ddmenu.combobox = this.#input;
        const label = fragment.querySelector('label');
        label.addEventListener('click', () => this.focus());
        this.#fieldError = fragment.querySelector('ful-field-error');
        this.#input.ariaDescribedByElements = [this.#fieldError];
        this.#input.ariaLabelledByElements = [label];
        const [dload, abortdload] = Timing.throttle(400, () => {
            this.#input.setAttribute('aria-expanded', 'true');
            this.#ddmenu.show(() => this.#loader.load(this.#input.value), [...this.#values.keys()]);
        });
        this.addEventListener('click', (/** @type any */ e) => {
            //badges and other chrome are not form controls, the guard must ask the
            //effective state
            if (this.matches(':disabled') || this.readonly) {
                return;
            }
            if (this.#ddmenu.shown) {
                this.#close();
                return;
            }
            this.#browse();
            this.#input.focus();
            dload();
        });
        this.#items.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!e.target.closest('button')) {
                return;
            }
            if (this.matches(':disabled') || this.readonly) {
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
        this.#control.addEventListener('click', (e) => {
            if (!e.target.matches('ful-badge')) {
                return;
            }
            e.stopPropagation();
            if (this.matches(':disabled') || this.readonly) {
                return;
            }
            const idx = [...this.#control.querySelectorAll(':scope > ful-badge')].indexOf(e.target);
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
        this.#input.addEventListener('focus', () => {
            if (this.#editing) {
                return;
            }
            this.#input.select();
        });
        this.#input.addEventListener('blur', (e) => {
            e.stopPropagation();
            if (e.relatedTarget && this.contains(e.relatedTarget)) {
                return;
            }
            abortdload();
            this.#close();
        });
        this.#input.addEventListener('keydown', (e) => {
            if (this.matches(':disabled') || this.readonly) {
                return;
            }
            switch (e.code) {
                case 'ArrowUp':
                case 'ArrowDown': {
                    e.preventDefault();
                    const forward = 'ArrowDown' === e.code;
                    if (e.altKey) {
                        if (forward && !this.#ddmenu.shown) {
                            this.#browse();
                            this.#input.setAttribute('aria-expanded', 'true');
                            this.#ddmenu.show(() => this.#loader.load(this.#input.value), [...this.#values.keys()]);
                        } else if (!forward && this.#ddmenu.shown) {
                            this.#close();
                        }
                        break;
                    }
                    this.#browse();
                    this.#input.setAttribute('aria-expanded', 'true');
                    this.#ddmenu.moveOrShow(forward, () => this.#loader.load(this.#input.value), [
                        ...this.#values.keys(),
                    ]);
                    break;
                }
                case 'Home': {
                    if (this.#ddmenu.shown) {
                        e.preventDefault();
                        this.#ddmenu.jump(true);
                    }
                    break;
                }
                case 'End': {
                    if (this.#ddmenu.shown) {
                        e.preventDefault();
                        this.#ddmenu.jump(false);
                    }
                    break;
                }
                case 'PageDown':
                case 'PageUp': {
                    if (this.#ddmenu.shown) {
                        e.preventDefault();
                        this.#ddmenu.page('PageDown' === e.code);
                    }
                    break;
                }
                case 'Escape': {
                    abortdload();
                    this.#close();
                    break;
                }
                case 'Enter': {
                    if (!this.#ddmenu.shown) {
                        //nothing to accept: submit the form as ful-input does. the inner
                        //input carries form="" so it never submits one on its own
                        this.#requestSubmit();
                        return;
                    }
                    e.preventDefault();
                    this.#editing = false;
                    this.#display();
                    this.#ddmenu.acceptSelection();
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
                    abortdload();
                    this.#close();
                    break;
                }
            }
        });
        this.#input.addEventListener('input', (e) => {
            e.stopPropagation();
            if (this.matches(':disabled') || this.readonly) {
                return;
            }
            this.#editing = true;
            dload();
        });
        this.#ddmenu.addEventListener('change', (e) => {
            e.stopPropagation();
            if (!this.#multiple) {
                this.#values.clear();
            }
            this.#editing = false;
            this.#values.set(this.#coerceKey(e.detail.data[0]), e.detail.data.slice(1));
            this.#changed();
            this.#syncBadges();
            this.#input.focus();
            this.#input.setAttribute('aria-expanded', 'false');
            this.#ddmenu.hide();
            if (!this.#multiple) {
                this.#input.select();
            }
        });
        this.replaceChildren(fragment);
    }
    async withLoader(fn) {
        return await fn(this.#loader);
    }
    #close() {
        this.#input.setAttribute('aria-expanded', 'false');
        this.#ddmenu.hide();
        this.#editing = false;
        this.#display();
    }
    #browse() {
        if (this.#editing) {
            return;
        }
        this.#input.value = '';
    }
    #display() {
        const entry = this.#values.values().next().value;
        this.#input.value = this.#multiple ? '' : (entry?.[0] ?? '');
    }
    #requestSubmit() {
        const form = this.internals.form;
        if (!form) {
            return;
        }
        const candidates = /** @type [HTMLButtonElement|HTMLInputElement] */ (
            Array.from(form.querySelectorAll('button:not(:disabled), input:not(:disabled)'))
        );
        form.requestSubmit(candidates.find((el) => el.type === 'submit'));
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
        const badges = this.#multiple
            ? Array.from(this.#values.entries()).map(([k, v]) => {
                  const b = document.createElement('ful-badge');
                  b.setAttribute('role', 'button');
                  b.setAttribute('value', k);
                  b.innerText = v[0];
                  return b;
              })
            : [];
        for (const b of this.#control.querySelectorAll(':scope > ful-badge')) {
            b.remove();
        }
        this.#input.before(...badges);
        if (!this.#editing) {
            this.#display();
        }
        this.#items.replaceChildren();
        this.template('items').withOverlay({ entries: this.#values.entries() }).renderTo(this.#items);
    }
    /**
     * Coerces a key to the type declared by `k-type`. Keys reach the element from
     * both worlds: the `value` attribute is text, a loader returns whatever its
     * endpoint carries. One canonical type keeps the internal Map, which compares
     * keys strictly, consistent. A key that does not decode is left as it is.
     */
    #coerceKey(k) {
        switch (this.getAttribute('k-type')) {
            case 'number': {
                const n = k === '' ? Number.NaN : Number(k);
                return Number.isNaN(n) ? k : n;
            }
            case 'boolean': {
                if (k === true || k === 'true') {
                    return true;
                }
                if (k === false || k === 'false') {
                    return false;
                }
                return k;
            }
            default:
                return String(k);
        }
    }

    set value(vs) {
        //the csvm mapper yields [] for a missing multiple value, an empty string is
        //left alone: it is a usable key for an <option value="">
        const keys = (vs == null ? [] : Array.isArray(vs) ? vs : [vs]).map((k) => this.#coerceKey(k));
        //the keys are known synchronously and are all `value` reads, so they are applied
        //now: only the labels need the loader, until then a key stands in for its own
        this.#values = new Map(keys.map((k) => [k, [k]]));
        this.#syncBadges();
        const token = ++this.#token;
        if (keys.length === 0) {
            return;
        }
        this.#resolve(keys, token);
    }
    /**
     * Resolves the labels of the assigned keys. A failed lookup is left to reject so
     * that it is reported like any other failure: the keys stay applied either way.
     */
    async #resolve(keys, token) {
        const entries = await this.#loader.exact(...keys);
        if (token !== this.#token) {
            //a newer assignment has been made in the meantime
            return;
        }
        //label the keys that are still selected: a removal made while the lookup was in
        //flight must not be undone by it, and a key the loader does not know is dropped
        //the loader keys are coerced too, so they line up with the assigned ones
        const resolved = new Map(entries.map((e) => [this.#coerceKey(e[0]), e.slice(1)]));
        for (const key of keys) {
            if (!this.#values.has(key)) {
                continue;
            }
            if (resolved.has(key)) {
                this.#values.set(key, resolved.get(key));
            } else {
                this.#values.delete(key);
            }
        }
        this.#syncBadges();
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
        //the claim only, like a native input: the effective state, claim or disabled
        //ancestry, is what :disabled matches
        return this.hasAttribute('disabled');
    }
    set disabled(d) {
        //the claim belongs to the author alone, nothing else ever writes it
        Attributes.toggle(this, 'disabled', d);
        //the inner control carries the claim as a native input would: a disabled
        //fieldset ancestry is left to the browser, which reaches the inner control
        //as a descendant of the fieldset and re-enables it on its own
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
