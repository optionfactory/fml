import { HttpClient } from "../http-client.mjs";
import { Checkbox } from "./checkbox.mjs";
import { LocalDate, Instant, InputLocalDate, InputLocalTime, InputInstant } from "./temporals.mjs";
import { InstantFilter, LocalDateFilter, TextFilter } from "./filters.mjs";
import { FormLoader, Form } from "./form.mjs";
import { Input } from "./input.mjs";
import { InputFile } from "./files.mjs";
import { RadioGroup } from "./radio.mjs";
import { SelectLoader, Dropdown, Select } from "./select.mjs";
import { Spinner } from "./spinner.mjs";
import { TableLoader, Table, Pagination, SortButton } from "./table.mjs";
import { LocalizationModule } from "./l10n.mjs";


class Plugin {
    configure(registry) {
        const httpClient = HttpClient.builder()
            .withCsrfToken()
            .withRedirectOnUnauthorized("/")
            .build();
        registry
            .defineModule("l10n", LocalizationModule)
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
            .defineElement('ful-filter-text', TextFilter)
            .defineElement('ful-select', Select)
            .defineElement('ful-dropdown', Dropdown)
            .defineComponent("loaders:select", SelectLoader)
            .defineComponent("loaders:form", FormLoader)
            .defineComponent("loaders:table", TableLoader)
            .defineOverlay({
                language: navigator?.language?.split("-")?.[0] ?? "en"
            });
    }
}



export { Plugin }