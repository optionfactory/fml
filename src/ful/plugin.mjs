import { HttpClient } from '../httpc/index.mjs';
import { Localization } from '../ftl/index.mjs';
import { Checkbox } from './forms/checkbox.mjs';
import { LocalDate, Instant, InputLocalDate, InputLocalTime, InputInstant } from './forms/temporals.mjs';
import { BooleanFilter, InFilter, InstantFilter, LocalDateFilter, NumberFilter, TextFilter } from './forms/filters.mjs';
import { FormLoader, Form } from './forms/form.mjs';
import { Input } from './forms/input.mjs';
import { InputFile } from './forms/files.mjs';
import { RadioGroup } from './forms/radio.mjs';
import { SelectLoader, Dropdown, Select } from './forms/select.mjs';
import { Tooltip, Dialog } from './disclosures/info.mjs';
import { Drawer } from './disclosures/drawer.mjs';
import { Menu } from './disclosures/menu.mjs';
import { Toasts } from './disclosures/toast.mjs';
import { Tabs } from './navigation/tabs.mjs';
import { Accordion } from './disclosures/accordion.mjs';
import { Wizard } from './navigation/wizard.mjs';
import { TableLoader, Table, Pagination, SortButton } from './navigation/table.mjs';
import en from './l10n/en.mjs';
import it from './l10n/it.mjs';
import es from './l10n/es.mjs';
import fr from './l10n/fr.mjs';

const BUILTIN = { en, it, es, fr };

/**
 * Registers everything ful provides on a registry: the elements, the loader
 * components, an http client, and the translations for the configured
 * language. A page calls `registry.plugin(new Plugin({…})).configure()` once;
 * `registry.plugin` calls this plugin's `configure`.
 */
class Plugin {
    #language;
    #translations;
    #httpClient;

    /**
     * @param {{ language?: string, translations?: Record<string, any>, httpClient?: HttpClient }} [options]
     * `language` is fixed for the page: a full BCP-47 tag or a primary subtag,
     * defaulting to `navigator.language`, then to 'en'. Its primary subtag,
     * lowercased, picks the built-in translations (en, it, es, fr); the messages
     * are the english ones, overridden by that language's, overridden by
     * `translations`, so a language without built-in translations reads in
     * english. `translations` is a flat map of keys to messages: reword built-in
     * keys ('pagination.showing', …) or add your own ('checkout.total', …).
     * `httpClient` is the client every ful component fetches through, registered
     * as the `http-client` component; without one, `configure` builds a client
     * that sends the csrf token and navigates to '/' on a 401 response.
     */
    constructor(options = {}) {
        this.#language = options.language ?? navigator?.language ?? 'en';
        this.#translations = options.translations ?? {};
        this.#httpClient = options.httpClient ?? null;
    }

    /**
     * Defines on `registry` the `l10n` module, the `http-client` component,
     * every `ful-*` element, the `loaders:select`, `loaders:form` and
     * `loaders:table` components, and an overlay publishing `l10n` (the merged
     * messages) and `locale` (the `language` as given) to every template.
     * @param {{ defineModule(name: string, module: any): any, defineComponent(name: string, component: any): any, defineElement(tag: string, klass: CustomElementConstructor): any, defineOverlay(...data: any[]): any }} registry
     * the ftl `Registry`, each of those methods answering the registry itself
     * @returns {void}
     */
    configure(registry) {
        const httpClient =
            this.#httpClient ?? HttpClient.builder().withCsrfToken().withRedirectOnUnauthorized('/').build();
        const language = this.#language.split('-')[0].toLowerCase();
        const l10n = { ...BUILTIN.en, ...BUILTIN[language], ...this.#translations };
        registry
            .defineModule('l10n', Localization)
            .defineComponent('http-client', httpClient)
            .defineElement('ful-tooltip', Tooltip)
            .defineElement('ful-dialog', Dialog)
            .defineElement('ful-drawer', Drawer)
            .defineElement('ful-menu', Menu)
            .defineElement('ful-toasts', Toasts)
            .defineElement('ful-tabs', Tabs)
            .defineElement('ful-accordion', Accordion)
            .defineElement('ful-wizard', Wizard)
            .defineElement('ful-form', Form)
            .defineElement('ful-checkbox', Checkbox)
            .defineElement('ful-input', Input)
            .defineElement('ful-input-file', InputFile)
            .defineElement('ful-local-date', LocalDate)
            .defineElement('ful-instant', Instant)
            .defineElement('ful-input-local-date', InputLocalDate)
            .defineElement('ful-input-local-time', InputLocalTime)
            .defineElement('ful-input-instant', InputInstant)
            .defineElement('ful-radio-group', RadioGroup)
            .defineElement('ful-table', Table)
            .defineElement('ful-pagination', Pagination)
            .defineElement('ful-sorter', SortButton)
            .defineElement('ful-filter-instant', InstantFilter)
            .defineElement('ful-filter-local-date', LocalDateFilter)
            .defineElement('ful-filter-number', NumberFilter)
            .defineElement('ful-filter-boolean', BooleanFilter)
            .defineElement('ful-filter-text', TextFilter)
            .defineElement('ful-filter-in', InFilter)
            .defineElement('ful-select', Select)
            .defineElement('ful-dropdown', Dropdown)
            .defineComponent('loaders:select', SelectLoader)
            .defineComponent('loaders:form', FormLoader)
            .defineComponent('loaders:table', TableLoader)
            .defineOverlay({
                l10n,
                locale: this.#language,
            });
    }
}

export { Plugin };
