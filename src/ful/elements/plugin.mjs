import { HttpClient } from '../../httpc/index.mjs';
import { Localization } from '../../ftl/index.mjs';
import { Checkbox } from './checkbox.mjs';
import { LocalDate, Instant, InputLocalDate, InputLocalTime, InputInstant } from './temporals.mjs';
import { BooleanFilter, InstantFilter, LocalDateFilter, NumberFilter, TextFilter } from './filters.mjs';
import { FormLoader, Form } from './form.mjs';
import { Input } from './input.mjs';
import { InputFile } from './files.mjs';
import { RadioGroup } from './radio.mjs';
import { SelectLoader, Dropdown, Select } from './select.mjs';
import { Spinner } from './spinner.mjs';
import { TableLoader, Table, Pagination, SortButton } from './table.mjs';
import en from './l10n/en.mjs';
import it from './l10n/it.mjs';
import es from './l10n/es.mjs';
import fr from './l10n/fr.mjs';

const BUILTIN = { en, it, es, fr };

class Plugin {
    #language;
    #translations;

    /**
     * @param {{ language?: string, translations?: Record<string, any> }} [options]
     * `language` is fixed for the page: a full BCP-47 tag or a primary subtag,
     * defaulting to the browser's language. `translations` is a flat
     * active-language map applied over the built-in translations: reword built-in
     * keys ('pagination.showing', …) or add your own ('checkout.total', …).
     */
    constructor(options = {}) {
        this.#language = options.language ?? navigator?.language ?? 'en';
        this.#translations = options.translations ?? {};
    }

    configure(registry) {
        const httpClient = HttpClient.builder().withCsrfToken().withRedirectOnUnauthorized('/').build();
        //the fallback chain is baked here: en, the active language, the consumer's own strings
        const language = this.#language.split('-')[0];
        const l10n = { ...BUILTIN.en, ...BUILTIN[language], ...this.#translations };
        registry
            .defineModule('l10n', Localization)
            .defineComponent('http-client', httpClient)
            .defineElement('ful-spinner', Spinner)
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
