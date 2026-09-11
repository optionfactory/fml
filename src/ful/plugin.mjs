import { HttpClient } from '../httpc/index.mjs';
import { Localization } from '../ftl/index.mjs';
import { Checkbox } from './forms/checkbox.mjs';
import { LocalDate, Instant, InputLocalDate, InputLocalTime, InputInstant } from './forms/temporals.mjs';
import { BooleanFilter, InstantFilter, LocalDateFilter, NumberFilter, TextFilter } from './forms/filters.mjs';
import { FormLoader, Form } from './forms/form.mjs';
import { Input } from './forms/input.mjs';
import { InputFile } from './forms/files.mjs';
import { RadioGroup } from './forms/radio.mjs';
import { SelectLoader, Dropdown, Select } from './forms/select.mjs';
import { Tooltip, Dialog } from './disclosures/info.mjs';
import { Drawer } from './disclosures/drawer.mjs';
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

class Plugin {
    #language;
    #translations;
    #httpClient;

    /**
     * @param {{ language?: string, translations?: Record<string, any>, httpClient?: any }} [options]
     * `language` is fixed for the page: a full BCP-47 tag or a primary subtag,
     * defaulting to the browser's language. `translations` is a flat
     * active-language map applied over the built-in translations: reword built-in
     * keys ('pagination.showing', …) or add your own ('checkout.total', …).
     * `httpClient` is the client every ful component fetches through, registered
     * as the `http-client` component: where an unauthorized session goes is an
     * application decision, so a page that does not want the default's redirect
     * to '/' builds its own.
     */
    constructor(options = {}) {
        this.#language = options.language ?? navigator?.language ?? 'en';
        this.#translations = options.translations ?? {};
        this.#httpClient = options.httpClient ?? null;
    }

    configure(registry) {
        const httpClient =
            this.#httpClient ?? HttpClient.builder().withCsrfToken().withRedirectOnUnauthorized('/').build();
        //the fallback chain is baked here: en, the active language, the consumer's own strings
        const language = this.#language.split('-')[0];
        const l10n = { ...BUILTIN.en, ...BUILTIN[language], ...this.#translations };
        registry
            .defineModule('l10n', Localization)
            .defineComponent('http-client', httpClient)
            .defineElement('ful-tooltip', Tooltip)
            .defineElement('ful-dialog', Dialog)
            .defineElement('ful-drawer', Drawer)
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
            .defineElement('ful-select', Select)
            .defineElement('ful-dropdown', Dropdown)
            .defineComponent('loaders:select', SelectLoader)
            .defineComponent('loaders:form', FormLoader)
            .defineComponent('loaders:table', TableLoader)
            .defineOverlay({
                l10n,
                language,
                locale: this.#language,
            });
    }
}

export { Plugin };
