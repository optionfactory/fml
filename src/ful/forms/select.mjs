import { Attributes, Fragments, ParsedElement, Templates } from '../../ftl/index.mjs';
import { Claims } from '../claims.mjs';
import { wireAnchoredPopover } from '../disclosures/anchors.mjs';
import { Field } from './field.mjs';
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
    #inFlight;
    #configs = new Claims();
    constructor({ http, url, method, responseMapper, prefetch, revision }) {
        this.#http = http;
        this.#url = url;
        this.#method = method;
        this.#responseMapper = responseMapper;
        this.#prefetch = prefetch;
        this.#revision = revision;
        this.#data = null;
        this.#inFlight = null;
    }
    async prefetch() {
        if (!this.#prefetch) {
            return;
        }
        await this.#ensureFetched();
    }
    async exact(...keys) {
        const data = await this.#ensureFetched();
        return data.filter(({ key }) => keys.some((r) => r == key));
    }
    async load(needle) {
        const data = await this.#ensureFetched();
        //includes would coerce a nullish needle to the string "undefined": no
        //needle means no filter, as the empty search the combobox opens with
        return data.filter(({ label }) => (label ?? '').toLowerCase().includes(needle?.toLowerCase() ?? ''));
    }
    async reconfigureUrl(url) {
        //invalidating detaches any fetch still in flight: its outcome belongs
        //to the old url and must neither be served nor stored for the new one
        this.#configs.invalidate();
        this.#data = null;
        this.#inFlight = null;
        this.#url = url;
    }
    async #ensureFetched() {
        if (this.#data === null) {
            if (this.#inFlight === null) {
                //held, not taken: concurrent fetch users share one configuration,
                //only a reconfiguration supersedes it
                const claim = this.#configs.hold();
                this.#inFlight = RemoteLoader.#revisionedData(this.#http, this.#method, this.#url, this.#revision)
                    .then((raw) => {
                        if (!claim.stale) {
                            this.#data = this.#responseMapper(raw);
                        }
                    })
                    .finally(() => {
                        if (!claim.stale) {
                            this.#inFlight = null;
                        }
                    });
            }
            await this.#inFlight;
        }
        if (this.#data === null) {
            throw new Error('superseded by a reconfiguration');
        }
        return this.#data;
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
            try {
                VersionedLocalStorage.save(storageKey, revision, data);
            } catch (/** @type any */ e) {
                //the cache write is best effort: the fetched data is the answer,
                //a full quota must not fail the load that already succeeded
                console.warn('failed to cache the select options', e);
            }
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
        return this.#data.filter(({ key }) => keys.some((r) => r == key));
    }
    load(needle) {
        //no needle means no filter, as in RemoteLoader
        return this.#data.filter(({ label }) => (label ?? '').toLowerCase().includes(needle?.toLowerCase() ?? ''));
    }
}

/** Builds the select's loader from its attributes: the slotted options in memory, or a remote or chunked loader over src. */
class SelectLoader {
    static create(el, conf) {
        if (!el.hasAttribute('src')) {
            const els = Array.from(conf.options?.querySelectorAll('option') ?? []);
            const data = els.map((e) => ({
                key: e.getAttribute('value') ?? e.innerText.trim(),
                label: e.innerText.trim(),
                metadata: undefined,
            }));
            return new InMemoryLoader(data);
        }
        const http = el.component('http-client');
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
                const rows = el._registry
                    .evaluator()
                    .withOverlay(response)
                    .evaluateExpression(el.getAttribute('d-expr') ?? 'self');
                return rows.map((row) => {
                    const evaluator = el._registry.evaluator().withOverlay(row);
                    return {
                        key: evaluator.evaluateExpression(el.getAttribute('k-expr')),
                        label: evaluator.evaluateExpression(el.getAttribute('l-expr')),
                        metadata: evaluator.evaluateExpression(el.getAttribute('m-expr') ?? 'self'),
                    };
                });
            };
        }
        if (el.hasAttribute('response-mapper')) {
            return el.component(el.getAttribute('response-mapper'));
        }
        //the wire format servers send is the positional row: the default mapper
        //is what turns it into the entry the element speaks everywhere else
        return (/** @type any[] */ response) => response.map(([key, label, metadata]) => ({ key, label, metadata }));
    }
}

/** The options popup of a select: listbox semantics, one loading claim per show, a localized empty state. */
class Dropdown extends ParsedElement {
    static attributes = ['listbox'];
    static slots = true;
    static template = `
        <ful-spinner class="centered" role="status" hidden><span class="ful-sr-only">{{ #l10n:t('spinner.loading') }}</span></ful-spinner>
        <p data-ref="empty" aria-live="polite" hidden>{{ #l10n:t('dropdown.empty') }}</p>
        <menu tabindex="-1" role="listbox" hidden></menu>
    `;
    static templates = {
        options: `
            <li data-tpl-each="self" data-tpl-selected="index == 0" data-tpl-value="index" role="option">
                {{ label }}
            </li>
        `,
    };
    #spinner;
    #menu;
    #empty;
    #optionstemplate;
    #options = new Map();
    #shows = new Claims();
    render({ slots }) {
        const fragment = this.template().render();
        this.#optionstemplate = Fragments.isBlank(slots.default)
            ? this.template('options')
            : Templates.fromFragment(slots.default);
        this.#spinner = fragment.querySelector('ful-spinner');
        this.#empty = fragment.querySelector('p[data-ref=empty]');
        this.#menu = fragment.querySelector('menu');
        //the listbox is named so a combobox can point aria-controls and
        //aria-activedescendant at it: a reference to an unnamed element resolves
        //to nothing, and the active option is announced to no one. The name comes
        //from the host when it gave one, since it has to set aria-controls before
        //this element upgrades
        this.#menu.id = this.declared('listbox') || Attributes.uid('ful-listbox');
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
            this.#activated(null);
            return;
        }
        for (const el of this.#menu.querySelectorAll('li')) {
            el.toggleAttribute('selected', el === li);
        }
        li.id ||= Attributes.uid('ful-option');
        this.#activated(li.id);
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
        const data = values.map((entry, index) => ({ index, ...entry }));
        this.#optionstemplate.withOverlay(data).renderTo(this.#menu);
        for (const [index, li] of [...this.#menu.children].entries()) {
            const picked = keys.some((r) => r == values[index]?.key);
            li.toggleAttribute('picked', picked);
            //what is picked is what aria-selected means for a listbox: a tint alone
            //says it to whoever can see it and to no one else
            li.setAttribute('aria-selected', picked ? 'true' : 'false');
        }
        this.#empty.toggleAttribute('hidden', values.length !== 0);
        this.#menu.toggleAttribute('hidden', values.length === 0);
        const current = values.findIndex(({ key }) => keys.some((r) => r == key));
        this.#highlight(current >= 0 ? this.#menu.children[current] : this.#selected());
    }
    #change(target) {
        const index = target.getAttribute('value');
        const entry = this.#options.get(index);
        this.hide();
        this.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                cancelable: false,
                detail: { index, entry },
            }),
        );
    }
    hide() {
        //hiding ends the current claim: a search still in flight must neither
        //repopulate the list nor point the combobox at an option of a hidden dropdown
        this.#shows.invalidate();
        if (this.matches(':popover-open')) {
            this.hidePopover();
        }
        this.#activated(null);
    }
    /**
     * The option the reader is on, announced for whoever owns the combobox: the
     * dropdown is a view, so it names its active option and never reaches into
     * another element's aria to say so.
     */
    #activated(id) {
        this.dispatchEvent(new CustomEvent('activechange', { bubbles: false, cancelable: false, detail: { id } }));
    }

    get shown() {
        return this.matches(':popover-open');
    }
    async show(loader, keys = []) {
        //each show claims the dropdown: a search resolving after a newer show has
        //started, or after the dropdown was hidden again, is stale, and neither
        //renders nor highlights, whichever order the searches resolve in
        const claim = this.#shows.take();
        if (!this.matches(':popover-open')) {
            this.showPopover();
        }
        this.#menu.setAttribute('hidden', '');
        this.#spinner.removeAttribute('hidden');
        try {
            const data = await loader();
            if (claim.stale) {
                return;
            }
            this.update(data, keys);
        } catch (/** @type any */ e) {
            if (claim.stale) {
                //the newer show (or the hide that ended this one) owns the dropdown
                //and its outcome: a superseded failure is neither shown nor thrown
                return;
            }
            this.hide();
            throw e;
        } finally {
            if (!claim.stale) {
                this.#spinner.setAttribute('hidden', '');
            }
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

/** A combobox acting like a select over a loader's vocabulary, single or multiple. */
class Select extends Field {
    static attributes = ['name', 'loader', 'k-type'];
    //multiple is declared before value: the csvm mapper reads it to decide
    //whether a value parses as a list or a scalar, so the two cannot disagree
    static observed = ['multiple:presence', 'itemlist:presence', 'value:csvm'];
    static slots = true;
    //a manual popover: the combobox keeps the focus on its input and owns
    //the whole lifecycle (typing, arrows, blur, Escape, Tab), so no light
    //dismiss and no popovertarget invoker; it anchors on its control group
    static template = `
        <label>{{{{ slots.default }}}}</label>
        {{{{ slots.info }}}}
        <ful-control-group>
            <ful-affix data-tpl-if="slots.before">{{{{ slots.before }}}}</ful-affix>
            <ful-control>
                <input type="text" form="" autocomplete="off" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false">
            </ful-control>
            <ful-affix data-tpl-if="slots.after">{{{{ slots.after }}}}</ful-affix>
            <ful-dropdown popover="manual">{{{{ slots.dropdown }}}}</ful-dropdown>
        </ful-control-group>
        <ful-item-list></ful-item-list>
        <ful-field-error></ful-field-error>
    `;
    static templates = {
        items: `
            <ful-item data-tpl-each="entries" data-tpl-var="entry" data-tpl-data-key="entry.key">
                <div><span>{{ entry.label }}</span><button type="button" data-tpl-aria-label="#l10n:t('select.remove')"><ful-icon name="x-lg" aria-hidden="true"></ful-icon></button></div>
            </ful-item>
        `,
    };
    #loader;
    #control;
    #ddmenu;
    #input;
    #items;
    #itemstemplate;
    #multiple;
    #values = new Map();
    #assignments = new Claims();
    #editing = false;
    #dload;
    #abortdload;
    _build({ slots }) {
        const name = this.declared('name');
        this.#loader = this.component(this.declared('loader') ?? 'loaders:select').create(this, {
            options: slots.options,
        });

        this.#multiple = this.declared('multiple');
        //the prefetch is the vocabulary's concern, not the field's: the label, the
        //combobox and the error region paint at once and the properties go live with
        //them, where a slow endpoint used to hold up the whole upgrade. The loader
        //shares one in-flight fetch, so a first open during the prefetch joins it
        this.#loader.prefetch?.()?.catch((/** @type any */ e) => {
            console.warn('failed to prefetch select options', this, 'reason:', e);
        });
        const fragment = this.template().withOverlay({ slots, name }).render();
        this.#input = fragment.querySelector('input');
        this.#items = fragment.querySelector('ful-item-list');
        this.#itemstemplate =
            slots.items && !Fragments.isBlank(slots.items) ? Templates.fromFragment(slots.items) : null;
        Attributes.forward('input-', this, this.#input);
        this.#control = fragment.querySelector('ful-control');

        this.#ddmenu = fragment.querySelector('ful-dropdown');
        //named before it upgrades, so the combobox can control it from the start
        const listbox = Attributes.uid('ful-listbox');
        this.#ddmenu.setAttribute('listbox', listbox);
        this.#input.setAttribute('aria-controls', listbox);
        //one writer for the combobox's state: the dropdown says when it opens and
        //which option is active, the input's aria is the select's to keep
        this.#ddmenu.addEventListener('beforetoggle', (/** @type any */ e) => {
            const open = e.newState === 'open';
            this.#input.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (!open) {
                this.#input.removeAttribute('aria-activedescendant');
            }
        });
        this.#ddmenu.addEventListener('activechange', (/** @type any */ e) => {
            Attributes.set(this.#input, 'aria-activedescendant', e.detail.id);
        });
        //each pair carries its own anchor: two selects on a page must not share one
        const group = fragment.querySelector('ful-control-group');
        wireAnchoredPopover(group, this.#ddmenu, { prefix: 'ful-select', stretch: true });
        [this.#dload, this.#abortdload] = Timing.throttle(400, () => this.#open());
        this.#wireChrome();
        this.#wireChips();
        this.#wireInput();
        this.#wireSelection();
        return {
            fragment,
            control: this.#input,
            error: fragment.querySelector('ful-field-error'),
            label: fragment.querySelector('label'),
        };
    }
    /**
     * Pointer interaction: the element toggles the dropdown, the item list's
     * remove buttons and the control's badges drop their entry.
     */
    #wireChrome() {
        this.addEventListener('click', (/** @type any */ e) => {
            if (!this._interactive()) {
                return;
            }
            if (this.#ddmenu.shown) {
                this.#close();
                return;
            }
            this.#input.focus();
            this.#dload();
        });
        this.#items.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!e.target.closest('button')) {
                return;
            }
            if (!this._interactive()) {
                return;
            }
            this.#removeKeyAt([...this.#items.children].indexOf(e.target.closest('ful-item')));
        });
        this.#control.addEventListener('click', (e) => {
            const badge = e.target instanceof Element ? e.target.closest('ful-badge') : null;
            if (!badge) {
                return;
            }
            e.stopPropagation();
            this.#removeBadge(badge);
        });
    }
    /**
     * Keyboard interaction over the chips: Enter/Space/Backspace/Delete remove,
     * arrows move between badges and the input, Escape returns to the input.
     */
    #wireChips() {
        this.addEventListener('keydown', (/** @type any */ e) => {
            const badge = e.target instanceof Element ? e.target.closest('ful-badge') : null;
            if (badge) {
                this.#chipKeydown(e, badge);
                return;
            }
            //the caret cannot move further left: hand the focus over to the chips,
            //as the backspace at the same spot already hands over the last entry
            if (
                'ArrowLeft' === e.code &&
                e.target === this.#input &&
                this.#input.selectionStart === 0 &&
                this.#input.selectionEnd === 0
            ) {
                this.#badges().at(-1)?.focus();
            }
        });
    }
    #wireInput() {
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
            this.#abortdload();
            this.#close();
        });
        this.#input.addEventListener('keydown', (e) => {
            if (!this._interactive()) {
                return;
            }
            this.#comboboxKeydown(e);
        });
        this.#input.addEventListener('input', (e) => {
            e.stopPropagation();
            if (!this._interactive()) {
                return;
            }
            this.#editing = true;
            this.#dload();
        });
    }
    #wireSelection() {
        this.#ddmenu.addEventListener('change', (e) => {
            e.stopPropagation();
            //a claim landing while the dropdown is open must not accept a pick:
            //disabled closes the list on its own (the focused input blurs), readonly
            //leaves it open, so the guard lives here
            if (!this._interactive()) {
                this.#close();
                return;
            }
            if (!this.#multiple) {
                this.#values.clear();
            }
            this.#editing = false;
            this.#values.set(this.#coerceKey(e.detail.entry.key), e.detail.entry);
            this.#changed();
            this.#syncBadges();
            this.#input.focus();
            this.#ddmenu.hide();
            if (!this.#multiple) {
                this.#input.select();
            }
        });
    }
    /** Hands the loader to the callback, for runtime reconfigurations. */
    async withLoader(fn) {
        return await fn(this.#loader);
    }
    #badges() {
        return Array.from(this.#control.querySelectorAll(':scope > ful-badge'));
    }
    #removeBadge(badge) {
        if (!this._interactive()) {
            return;
        }
        this.#removeKeyAt(this.#badges().indexOf(badge));
    }
    /**
     * Drops the entry at the given index, if any: badges and item list entries
     * share the value map's ordering.
     */
    #removeKeyAt(index) {
        const key = Array.from(this.#values.keys())[index];
        if (key === undefined) {
            return;
        }
        this.#values.delete(key);
        this.#changed();
        this.#syncBadges();
    }
    #chipKeydown(e, badge) {
        switch (e.code) {
            case 'Enter':
            case 'Space':
            case 'Backspace':
            case 'Delete': {
                e.preventDefault();
                this.#removeBadge(badge);
                this.#input.focus();
                break;
            }
            case 'ArrowLeft': {
                e.preventDefault();
                (this.#badges()[this.#badges().indexOf(badge) - 1] ?? this.#input).focus();
                break;
            }
            case 'ArrowRight': {
                e.preventDefault();
                (this.#badges()[this.#badges().indexOf(badge) + 1] ?? this.#input).focus();
                break;
            }
            case 'Escape': {
                this.#input.focus();
                break;
            }
        }
    }
    /**
     * The combobox keyboard contract: arrows browse and move, Home/End and
     * PageUp/PageDown navigate the open list, Enter accepts or submits,
     * Escape/Tab close, Backspace at the caret's leftmost spot drops the last
     * entry.
     */
    #comboboxKeydown(e) {
        switch (e.code) {
            case 'ArrowUp':
            case 'ArrowDown': {
                e.preventDefault();
                this.#arrowKeydown(e);
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
                this.#abortdload();
                this.#close();
                break;
            }
            case 'Enter': {
                if (!this.#ddmenu.shown) {
                    //nothing to accept: submit the form as ful-input does. the inner
                    //input carries form="" so it never submits one on its own
                    this._requestSubmit();
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
                if (this.#input.selectionStart === 0 && this.#input.selectionEnd === 0) {
                    this.#removeKeyAt(this.#values.size - 1);
                }
                break;
            }
            case 'Tab': {
                this.#abortdload();
                this.#close();
                break;
            }
        }
    }
    #arrowKeydown(e) {
        const forward = 'ArrowDown' === e.code;
        //alt-down opens, alt-up closes
        if (e.altKey) {
            if (forward && !this.#ddmenu.shown) {
                this.#open();
            } else if (!forward && this.#ddmenu.shown) {
                this.#close();
            }
            return;
        }
        this.#browse();
        this.#ddmenu.moveOrShow(forward, () => this.#loader.load(this.#input.value), [...this.#values.keys()]);
    }
    #close() {
        this.#ddmenu.hide();
        this.#editing = false;
        this.#display();
    }
    /**
     * Opens the dropdown over the entries matching the input: typing filters,
     * browsing starts from the whole vocabulary, the selected keys are always
     * highlighted.
     */
    #open() {
        this.#browse();
        return this.#ddmenu.show(() => this.#loader.load(this.#input.value), [...this.#values.keys()]);
    }
    #browse() {
        if (this.#editing) {
            return;
        }
        this.#input.value = '';
    }
    #display() {
        const entry = this.#values.values().next().value;
        this.#input.value = this.#multiple ? '' : (entry?.label ?? '');
    }
    /** The selection in its one vocabulary: the change detail and the items overlay both speak it. */
    #selection() {
        return [...this.#values.values()];
    }
    #changed() {
        //the detail carries the keys the value property answers with, as every
        //other field's does, and the labeled selection beside them
        this._notifyChange({ entry: this.entry });
    }
    #syncBadges() {
        const badges = this.#multiple
            ? Array.from(this.#values.entries()).map(([k, entry], index) => {
                  const b = document.createElement('ful-badge');
                  b.setAttribute('role', 'button');
                  //a roving tab stop: without one the chips are reachable only from
                  //the input's caret, so Tab never finds them
                  b.setAttribute('tabindex', index === 0 ? '0' : '-1');
                  b.setAttribute('value', k);
                  b.innerText = entry.label;
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
        (this.#itemstemplate ?? this.template('items'))
            .withOverlay({ entries: this.#selection() })
            .renderTo(this.#items);
    }
    /**
     * Coerces a key to the type declared by `k-type`. Keys reach the element from
     * both worlds: the `value` attribute is text, a loader returns whatever its
     * endpoint carries. One canonical type keeps the internal Map, which compares
     * keys strictly, consistent. A key that does not decode is left as it is.
     */
    #coerceKey(k) {
        switch (this.declared('k-type')) {
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
        this.#values = new Map(keys.map((k) => [k, { key: k, label: k, metadata: undefined }]));
        const claim = this.#assignments.take();
        if (!this.#control) {
            return;
        }
        this.#syncBadges();
        if (keys.length === 0) {
            return;
        }
        this.#resolve(keys, claim);
    }
    /**
     * Resolves the labels of the assigned keys. A failed lookup is left to reject so
     * that it is reported like any other failure: the keys stay applied either way.
     */
    async #resolve(keys, claim) {
        const entries = await this.#loader.exact(...keys);
        if (claim.stale) {
            //a newer assignment has been made in the meantime
            return;
        }
        //label the keys that are still selected: a removal made while the lookup was in
        //flight must not be undone by it, and a key the loader does not know is dropped
        //the loader keys are coerced too, so they line up with the assigned ones
        const resolved = new Map(entries.map((e) => [this.#coerceKey(e.key), e]));
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
    /** The selection as {key, label, metadata} entries, the change detail's vocabulary: the only one for a single select, every one when multiple. */
    get entry() {
        const selection = this.#selection();
        if (this.#multiple) {
            return selection;
        }
        return selection[0] ?? null;
    }
    #useItemlist;
    get multiple() {
        return this.#multiple;
    }
    set multiple(v) {
        this.#multiple = v;
        this.reflectTo('multiple', v);
    }
    get itemlist() {
        return this.#useItemlist;
    }
    set itemlist(v) {
        this.#useItemlist = v;
        this.reflectTo('itemlist', v);
    }
}

export { Dropdown, Select, SelectLoader };
