### version 9.0.0

#### Upgrading from 8.x

The breaking changes against 8.0.3, grouped by what a page has to touch. The areas below list the rest of what changed.

**Styling and markup**

- ful no longer depends on bootstrap in any form (css, js, icon font): every style ships in `dist/ful.css`, themed through `--ful-*` custom properties. Drop the bootstrap classes a page relied on in the rendered markup, `bootstrap.bundle.min.js` for the filter menus and the icon font. The `ful-table` and `ful-pagination` icon config keys take `ful-icon` names (`'search'`, `'chevron-left'`, `'chevron-right'`, `'arrow-clockwise'`) instead of icon-font classes
- the `--ful-inputs-*` theme variables are renamed `--ful-controls-*`, joined by `--ful-controls-height`. The per-component tokens `--ful-select-bg`, `--ful-select-border-*`, `--ful-select-badge-*`, `--ful-select-focus-*`, `--ful-checkbox-active-bg`, `--ful-filter-active-bg`, `--ful-filter-active-color` and `--ful-spinner-icon-vertical-align` are gone: those controls read `--ful-controls-*` and `--ful-active-bg`
- the structural hooks are style-only tags (`ful-control-group`, `ful-affix`, `ful-control`, `ful-badge`, `ful-choice`, `ful-table-wrapper`, `ful-pagination-bar`, `ful-empty`) and the chrome is keyed on the rendered structure rather than on the host tags. Css written against `div.input-group`, `span.input-group-text`, `.form-label`, `badges`/`badge`, `.pagination`, `.page-item`, `.page-link`, `.table`, `.alert`, `.ful-select-input-container` or the table's no-rows `td[colspan]` moves to the new hooks
- `ful-form`'s inner `<form>` is `display: contents` and `ful-form` is the layout box: css that laid out or painted `ful-form > form` moves to `ful-form`
- `ful-spinner` is a style-only tag: the `Spinner` export and the `.ful-spinner-wrapper`/`.ful-spinner-icon` hooks are gone, a page registering elements by hand drops its `defineElement('ful-spinner', …)` line, and `role="status"` is the author's to carry
- the keyframes carry the `ful-` prefix: `spinner-border` is `ful-spinner-border` and the field warning's `show-and-hide` is `ful-field-warning`. A page pointing `--ful-spinner-icon-animation-name` at `spinner-border` renames it
- every rule ful ships sits in a cascade layer (`ful.theme`, `ful.components`, `ful.hidden`), so a page rule outside a layer now wins over the library whatever its specificity. Check page css that was written expecting to lose

**Fields and forms**

- the positional slots are `before` and `after` only, rendered inside a `ful-affix`: `ibefore`/`iafter` become `before`/`after`, and content already slotted in `before`/`after` now carries the affix styling
- a field names its control through `for`/`id` (or an `aria-labelledby` attribute) and its error through an `aria-describedby` attribute, where it set `ariaLabelledByElements`/`ariaDescribedByElements`. Controls, error regions and labels now carry generated ids (`ful-control-<n>`, `ful-field-error-<n>`, `ful-label-<n>`) unless the author gave one, which snapshot tests will see
- `ful-form`'s `action`, `method`, `loader`, `request-mapper`, `response-mapper`, `clear-invalid-on-change` and `scroll-on-error` are read once at the upgrade: rewriting one afterwards has no effect
- `ful-form` submits one exchange at a time: a submit while one is in flight is dropped before the values are extracted
- while a `ful-form` submits, the submit and reset buttons it holds off carry `aria-disabled="true"` instead of the `disabled` property, so they keep the focus: page css selecting `:disabled` on them selects `[aria-disabled="true"]`
- an empty `ful-filter-*` reports `null` rather than `undefined`; the extracted form values are unchanged
- a date, time or datetime-local field (`ful-input-local-date`, `ful-input-local-time`, `ful-input-instant`, a `ful-input` of those types, the date and instant filters) dispatches `change` once the value is committed, as a text field does: when the field is left or Enter is pressed, and at once for a value picked from the browser's picker. It used to forward the native `change`, which fires while the segments are typed (on every year digit in Chromium), so a page reacting to it reacted to a year of 0002

**ful-select and ful-dropdown**

- `ful-select.entry` answers `{ key, label, metadata }` entries instead of `[key, [label, ...metadata]]` tuples, and `metadata` is one value (the `m-expr` result) rather than an array of the positional tail
- the change detail carries the keys as `value` and the labeled selection as `entry`: a listener reading labels from `evt.detail.value` reads `evt.detail.entry`
- every loader method (`prefetch`, `load`, `exact`, `update`) and every `response-mapper` component answers `{ key, label, metadata }` entries. The `[key, label, ...metadata]` tuple survives only as the wire format, which the default response mapper converts
- the `value` attribute is a comma separated list of keys for a single select too, split and trimmed: a key carrying a comma or surrounding spaces is assigned through the property. A single select reads `value=""` as the empty key
- `ful-dropdown`'s `change` detail is `{ index, entry }`, where it was `{ index, data }` with a tuple; the active option is reported through an `activechange` event, and `aria-selected` marks the picked options rather than the highlighted one
- a disabled `ful-select` with `item-list` keeps its control group, dimmed; only readonly hides it
- the remote loaders' `reconfigureUrl(url)` is gone: write the select's `src`, or call `select.reconfigure({ src })`, which builds the loader for the new url and reloads the selection

**ful-input and ful-input-file**

- `mask` is replaced by `keep` and `reject`: `mask="[^0-9]"` becomes `keep="[0-9]"`, or `reject="[^0-9]"`
- `ful-input`'s `type`, `uppercase` and `trim` are read once at the upgrade: rewriting one afterwards has no effect
- multiword attributes are spelled with a dash: `ful-input-file`'s `maxfiles`, `maxfilesize`, `maxtotalsize` and `itemlist` become `max-files`, `max-file-size`, `max-total-size` and `item-list`, and `ful-select`'s `itemlist` becomes `item-list`. The properties are `maxFiles`, `maxFileSize`, `maxTotalSize` and `itemList`, and css keyed on `[itemlist]` selects `[item-list]`

**ful-table and ful-pagination**

- `ful-pagination.update({ current, total })` replaces `update(current, total)`
- the events are `page:requested` and `sort:requested`, where they were `page-requested` and `sort-requested`, and they are not cancelable
- the page being shown carries `aria-current="page"` and stays an enabled button, where it was disabled; the controls are `<button>` elements rather than `a[role=button]`
- `ful-pagination`'s `pages` is read once at the upgrade

**Localization**

- localization is one flat map of messages: the plugin takes `new ful.Plugin({ language, translations })`, where `translations` rewords built-in keys or adds new ones. The `l10n` static of `ParsedElement` subclasses and the `LocalizationModule` export are gone; `ftl.Localization` is the template module (`#l10n:t()`, `#l10n:date()`, `#l10n:number()`, `#l10n:bytes()`)
- the built-in keys are namespaced and spelled with dashes (`table.no-data`, `table.initial`, `pagination.showing`, `files.dropzone-label`, `files.max-file-size-exceeded`, …): a page that edited a class's `l10n` static moves its wording to `translations` under those keys. Every built-in message renders as text, `table.initial` included
- the plugin's overlay publishes `l10n` and `locale` (the full tag); the `language` key, which carried the primary subtag, is gone

**Templates and elements built on ftl**

- `data-tpl-text` and `data-tpl-html` are gone: write `>{{ x }}<` and `>{{{ x }}}<`. Only `<script type="text/html">` is parsed as slot markup; any other script type slots as the plain node it is
- `render(c)` receives `{ slots }` alone: the base assigns the declared attributes to the properties after it returns, in declaration order, and a render reads what it needs while building through `declared(name)`. The `disabled` argument and `c.observed` are gone
- `reflect(fn)` is gone: `reflectTo(name, value)` writes an observed attribute, marshalling through the mapper it was declared with, so a setter hands over the value instead of calling `toggleAttribute` or `setAttribute` itself
- `ParsedElement` attaches the element internals for every element and exposes them as `internals`: a subclass must not call `attachInternals()` (a second call throws) nor declare an `internals` field
- a class's `static config` is read when the registry is configured: replace it before `configure()`
- the `csvm` mapper is gone: an element declaring `value:csvm` moves to `csv` or to a mapper of its own
- `registry.upgrades` is replaced by `pending()`, `whenUpgraded(el)` and `settle(accept)`
- the evaluation scope is one `ExpressionEvaluator`: `Template.withContext`, `withContextFrom`, `withModules` and `withData` collapse into `withEvaluator(evaluator)`, the `Template` constructor takes `(fragment, evaluator)`, `Registry.context()` becomes `evaluator()`, and `Template.evaluate(expression, mode, ...data)` and `ExpressionEvaluator.evaluate(expression, mode)` become `evaluateExpression(...)` and `evaluateTemplated(...)`
- a `RenderError` carries one frame per nesting level naming its node, so its message reads ``Error evaluating data-tpl-each="rows" in `<ul>` `` where it read `Error rendering template` followed by the template's markup

**httpc**

- an error response whose body does not decode, violates the `failures+json`/`problem+json` contract or cannot be read is a `GENERIC_PROBLEM` carrying the served status, where it could surface as a `CONNECTION_PROBLEM` with status 0
- `CONNECTION_PROBLEM` means the transport failed. A throw from the chain's own code (an interceptor bug, most often) reaches a request builder's caller as `UNEXPECTED_PROBLEM` carrying the original as its `cause`, and `exchange()` rejects a transport failure with an `HttpClientError` instead of the platform's `TypeError`
- the request url is built rather than concatenated: a second `?` no longer truncates the query, a `#` no longer swallows the parameters, and a fragment is kept after the parameters a call adds
- `Base64.decode` and `Hex.decode` reject invalid input instead of returning garbage
- the csrf interceptor sends the token to the page origin only, and reads the meta pair at request time

**Everything else**

- `Timing.debounce(ms, fn, { immediate })` and `Timing.throttle(ms, fn, { leading, trailing })` take an options object; the six `DEBOUNCE_*`/`THROTTLE_*` constants are gone
- the package declares `sideEffects: false`: a bundler importing through the root entry may drop the `window.ftl`/`window.httpc`/`window.ful` assignments. Script-tag users of `dist/fml.mjs` are unaffected; `import * as fml` keeps the namespaces explicit

#### ftl: templates, expressions and the registry

- [NEW] `static attributes` declares configuration beside `static observed`: read once through its mapper at the upgrade, where an observed attribute stays live. `declared(name)` reads either tier, and asking for an undeclared attribute throws an error naming it
- [NEW] a multiword observed attribute drives the camelCase property (`max-file-size` sets `maxFileSize`), through `Registry.propertyOf`
- [NEW] a name a subclass re-declares takes the subclass's position in the declaration order, so a field can have its `value` assigned after the attributes its setter reads
- [NEW] `ParsedElement.rendered` answers whether the render completed, and the element carries a `rendered` custom state from then on
- [NEW] an element resolves templates and components through the registry that defined it (`component(name)`), so a `new Registry()` can host the ful elements
- [NEW] `registry.ready()` is the awaitable form of `ftl:ready`, resolving at once when that moment has passed
- [NEW] `data-tpl-stat` names an iteration stat beside `data-tpl-each`'s item: `{ index, count, size, first, last, even, odd }`. An iterator is never consumed to learn its size, so `size` and `last` read null there
- [NEW] `BoundedCache`, a Map bounded by entry count that evicts the oldest entry
- [ENH] `data-tpl-each` iterates a `Map` or a plain object as `{ key, value }` entries
- [ENH] `{{{ }}}` accepts any value (numbers stringified, `null`/`undefined` render nothing), and `{{{{ }}}}` with a non-Node reports `Expected a Node`
- [ENH] `RenderError` keeps at most `RenderError.FRAMES` frames, the innermost ones, and sets `truncated` when it dropped outer ones; `node` is the live node and `html` serializes it on request
- [ENH] a reflection that would write the value an attribute already carries writes nothing
- [BUG] expressions: identifiers starting with a keyword (`nullable`, `falseFlag`) parse; a call on a missing value reports `Method missing` instead of crashing; a template string works as a dict key
- [BUG] a lone `{` in a templated text node renders as itself instead of adding a stray comma
- [BUG] `Nodes.waitParsed` watches every ancestor, so an element in whitespace-free markup upgrades when its closing tag is parsed rather than at DOMContentLoaded
- [BUG] `AsyncEvents.fireAsync`: a pipeline or delegate configured wrong still throws, and the outcomes of the listeners already dispatched no longer surface as unhandled rejections

#### httpc, client-errors and storage

- [NEW] httpc exports the types its signatures return: `HttpClientBuilder`, `HttpRequestBuilder`, `HttpInterceptorChain` and `HttpMultipartRequestCustomizer`
- [ENH] `fetchJson()` yields `null` on a 204
- [ENH] client-errors reports the cause chain of rejections and thrown errors, as `Caused by:` lines to a bounded depth
- [BUG] `HttpClient.exchange()` hands every interceptor a `RequestInit` with real `Headers`, so a bare `exchange(uri)` under the csrf interceptor no longer crashes
- [BUG] `param` skips nullish values in any position, not only the first
- [BUG] the type declarations give `Base64.STANDARD` and `Base64.URL_SAFE` as static members, and `HttpRequestBuilder.interceptors` takes an array of interceptors
- [BUG] client-errors sends the csrf header only when both metas are present, and logs its missing-attribute warning once per page
- [BUG] storage: an unreachable backing (blocked cookies, private or embedded contexts) reads as a miss and removes as a no-op instead of throwing; writes still report their failure

#### Localization

- [NEW] `Localization.failure(value)`, available as `#l10n:failure` in templates, turns what went wrong into text: a `Failure`'s reasons one per line, a problem with no reason reading as the new `failure.no-reason` message, an `Error` as its message. The dialog, the drawer, the table, the async sections and the toasts paint through it, so a problem the server sent without a reason no longer shows as the word "null"
- [NEW] messages take named `{placeholders}` and `{ one, other }` plural forms selected through `Intl.PluralRules` over `{count}`; `Localization.of()` resolves them from script. The built-in messages ship in English, Italian, Spanish and French
- [ENH] the language tag is read without regard to case (`'IT'`, `'it-IT'` pick Italian)
- [ENH] `ful-local-date` and `ful-instant` take their locale from the `locale` attribute, then the page's locale, then the platform default
- [ENH] `#l10n:bytes()` formats sizes with the locale's digits, has a GiB tier, and puts a size exactly on a threshold in the larger unit (1024 is `1KiB`)
- [BUG] the Spanish `files.max-files-exceeded` has a singular: a limit of one reads `1 archivo`
- [BUG] `Localization.t` reads own properties only, for keys and for named placeholders

#### ful: forms and fields

- [NEW] `Field` is exported: the base of every form-associated field, carrying validity, focus delegation, labelling, Enter submission, the `disabled`/`readonly`/`required` claims and reset. A custom field implements `_build(conf)` and returns its pieces (`fragment`, `control`, `error`, `label`, `described`, `claims`, `freeze`, `also`); the wiki's extending-fields page describes them
- [NEW] `Field.describedBy(el)` adds an element to the accessible description of the field's control; `describable(el)` answers the nearest ancestor that accepts one
- [NEW] `new ful.Plugin({ httpClient })` takes the client every ful component fetches through; the default still sends the csrf token and redirects to `/` on a 401
- [NEW] `ful-input` and `ful-form` take `autocomplete`, each field inheriting the form's token unless it names its own; `input-autocomplete` still has the last word
- [NEW] `.ful-stacked` on a `ful-checkbox` puts its label above the control, lining it up with a column of inputs
- [NEW] a field answers its owning form as `form`, `null` outside one
- [ENH] `disabled` is live on every field like `readonly`, `required` and `value`, and a claim written between upgrade and render is applied by the render
- [ENH] a field's change detail always carries its own `value`
- [ENH] a field's `focus()` called before the render is applied once the control exists
- [ENH] while a `ful-form` submits it carries `aria-busy`, and each revealed `ful-spinner` gets `role="status"` and a localized label unless the author wrote one
- [ENH] a field error pins on the most specific name its context reaches, a composite field receiving the remaining path as `setCustomValidity`'s second argument, and a context naming no field shows in the `ful-errors` banner
- [ENH] a `Failure` answered by the server no longer logs `failed to submit form`; other failures still warn
- [ENH] a `ful-field-error` is a polite live region and `ful-errors` carries `role="alert"`; under `scroll-on-error` the field errors stay silent and the focused field's description reads them
- [ENH] a button slotted in a `ful-affix` fills it
- [BUG] an input a page slots into a field's `before` affix or its label is no longer taken for the field's own control
- [BUG] a form's errors, values, held-off buttons and `scroll-on-error` reach its own fields only (`form.elements`), so a filter form nested inside a `ful-form` is left alone
- [BUG] Enter submits the form from every field whose control would submit a native form, `ful-checkbox`, `ful-radio-group` and a range filter's upper bound included; the numpad Enter counts
- [BUG] `form.reset()` restores every field through its own value semantics, not only `ful-input`; a filter also restores its operator and sensitivity
- [BUG] only the button that submitted the form contributes its `name`/`value`
- [BUG] readonly keeps a field in the accessibility tree: fields without a native `readOnly` refuse the gestures instead of becoming `inert`
- [BUG] the claims are announced on the element whose role accepts them (`ful-radio-group` announces on its `radiogroup` host), and an invalid control carries `aria-invalid`
- [BUG] `Bindings.providePath` refuses `__proto__`, `prototype` and `constructor` segments
- [BUG] a problem without `context` shows in the `ful-errors` banner instead of making `submit()` reject; overlapping names (`a` beside `a.b`) no longer abort the extraction
- [BUG] a submit button added during a submit keeps its own state when the form releases the buttons
- [BUG] `ful-radio-group` given an unknown key clears its selection, and a page's global `fieldset` rules no longer shrink its list
- [BUG] a `ful-checkbox` with a long label keeps it beside the box, wrapping
- [BUG] an invalid `ful-radio-group` outlines its labels in the invalid colour
- [BUG] instants: a date-only value (`2024-03-15`) is local midnight, and a value that does not parse reports no value instead of throwing
- [BUG] `ful-local-date` and `ful-instant` render the `default` text for content that does not parse

#### ful-input

- [NEW] `type="numeric"` and `type="decimal"` render a text input with that `inputmode` and filter what is typed (digits and a leading minus, plus one separator for `decimal`); a decimal answers its value with a dot whatever separator was typed. `type="number"` is unchanged
- [NEW] `unsigned` refuses the minus on a `numeric` or `decimal` field
- [NEW] `keep` and `reject` filter keystrokes, keeping the caret; `keep` matches what survives, so it takes any pattern (`keep="[0-9]{2}"`). A declared `keep` or `reject` overrides a type's own filter, and declaring both warns and applies `keep`
- [NEW] `v-type="number"` decodes the value to a number (blank stays null), in the change detail and the form values alike; an undeclared `type` then defaults to `number`
- [BUG] writing the value a field already holds leaves its control untouched, so a page writing back what it read no longer wipes the month and day being typed in a date field

#### ful-input-file

- [NEW] a `<template slot="items">` replaces the stock row of the item list, over the same `files` overlay
- [ENH] chosen files are removable chips showing their size; the default dropzone is themed, and a custom dropzone gets a `dragover` attribute on the host while a drag is over it
- [ENH] `accept` honours mime types with parameters and `image/*` families; a multi-file drop on a single-file field is rejected, and a dropped directory is ignored
- [ENH] drops and removals fire `change`; programmatic assignments and reset stay silent
- [ENH] a disabled or readonly field shows no dropzone and no remove buttons and accepts no drop; readonly also drops the picker button, and with `item-list` a readonly field shows only its list
- [BUG] its warnings are announced through a live region and retire on a timer rather than on a css animation

#### ful-select

- [NEW] an entry whose `metadata.disabled` is truthy is shown with `aria-disabled="true"` and `metadata.reason` as its title, and cannot be highlighted or picked
- [NEW] `select.reload()` asks the loader again for the vocabulary and the current selection, dropping keys it no longer knows; every loader answers `invalidate()`
- [NEW] `SelectLoader.from(conf)` builds a loader from plain configuration without an element
- [NEW] `select.query` answers the text typed to search, `''` while the field shows its selection
- [NEW] a valueless `revision` takes the page's build identifier from a `revision` registry component, and warns when none is defined
- [NEW] a `<template slot="items">` shapes each item-list entry over the `entries` overlay
- [ENH] the dropdown is a popover in the top layer, so overflow containers no longer clip it; it opens above the control where there is no room below and grows past the control for a long option, up to `--ful-dropdown-max-width` (30rem)
- [ENH] the keyboard follows the select pattern: a click anywhere on the field toggles, opening highlights the current selection, `Alt+ArrowDown`/`Alt+ArrowUp` open and close, `Home`/`End` and `PageUp`/`PageDown` move, and `Escape` also aborts a pending search. A press on a row keeps the focus in the combobox
- [ENH] a single select shows its label in the field at rest, selected on focus so typing replaces it; the lone badge is gone
- [ENH] the combobox announces the highlighted option through `aria-activedescendant` and `aria-controls`, and an empty result says "No results" politely
- [ENH] a multiple select's chips are reachable with the arrow keys from the start of the field and removable with `Enter`, `Space`, `Backspace` or `Delete`; `ful-badge` is a neutral chip
- [ENH] item-list entries are removable chips sized like a control, and the open dropdown marks the options already picked
- [ENH] a `preload` select paints its label and control at once instead of holding its upgrade on the prefetch; a first open during the prefetch joins it
- [ENH] `multiple` is live, and the loader's attributes (`src`, `method`, `mode`, `preload`, `revision`, `k-expr`, `l-expr`, `d-expr`, `m-expr`, `response-mapper`) are declared and documented in the IDE metadata
- [ENH] `src` and `method` stay live on `ful-select` and `ful-filter-in`: writing either, as an attribute or as a property, closes the dropdown, builds the loader again and reloads as `reload()` does
- [NEW] `select.reconfigure({ src, method }, { notify })` writes both at once, reloads once and answers a promise settling with the reload; `notify` fires `change` when the reload dropped a selected key
- [ENH] a key containing a comma assigned through the property warns once per element
- [ENH] a claim landing while the dropdown is open closes it
- [BUG] a click on another control inside a `ful-select` (a tooltip, an affix button) no longer opens the dropdown
- [BUG] a readonly or disabled select gives back the room held for its chevron
- [BUG] a dropdown with no room below opens just above the control instead of at the top of the viewport

#### ful-filter-*

- [NEW] `ful-filter-number` (`NumberCompare`), `ful-filter-boolean` (`BooleanCompare`) and `ful-filter-in` (`InEnum`/`InList`, a `ful-select` answering an array of keys, or `[operator, ...keys]` when `operator` is declared) complete the optionfactory data-jpa filter contract; `ful-filter-text` offers every `TextCompare` operator, `BETWEEN` included. `CompareFilter`, `NumberFilter`, `BooleanFilter` and `InFilter` are exported
- [NEW] `operators` whitelists a filter's operators and `sensitivities` the text filter's case modes (`aa`/`Aa`); both are live, and a single entry pins the choice while keeping its glyph
- [NEW] `operator` and `sensitivity` fix a choice: no button renders and every tuple carries the fixed value. Declaring the singular beside its plural warns and the singular wins
- [NEW] every filter answers `criterion`: null while it contributes nothing, otherwise its label, operator and operands as the reader chose them, for drawing filter chips
- [ENH] the operator, sensitivity and boolean menus are native popovers with roving focus, type-ahead and `menuitemradio` items marking the current choice; each item shows a glyph and a localized word, and the buttons carry a localized `aria-label`
- [BUG] a range filter's upper bound takes the same `keep`/`reject`, `input-*` passthrough, `autocomplete` and `placeholder` as the lower one; `input-id` stays on the first
- [BUG] a `ful-filter-boolean` reset restores its default operator

#### ful-table and pagination

- [NEW] an `empty` slot replaces the no-rows message, rendered per load with `schema`, `pageRequest`, `filterRequest` and `pageResponse` in scope; without it the stock message shows with the icon named by `Table.config.emptyIcon`
- [NEW] `ful-table` takes a `response-mapper` component, as `ful-select` and `ful-form` do
- [ENH] the rows stay on screen while a load runs, dimmed through `aria-busy`; the spinner shows only when there is nothing to show yet
- [ENH] writing `page-size` or `pageSize` reloads from the first page, keeping the sort and the filters
- [ENH] `src` and `method` stay live on `ful-table`: writing either, as an attribute or as a property, builds the loader again and reloads from the first page, keeping the size, the sort and the filters
- [NEW] `table.reconfigure({ src, method })` writes both at once and loads once, from the first page
- [ENH] the header cells are sticky, painted with `--ful-bg`, so they stay in view while the rows scroll; the table's borders are `separate` with no spacing, so the header's bottom border travels with it
- [NEW] `ful-fill` on a `ful-table` makes it take the height its container gives it, scrolling its rows inside while the header, the filters and the pagination stay in view
- [ENH] `ful-sorter` is focusable, sorts on `Enter`/`Space` and mirrors its order onto the header cell's `aria-sort`; its arrow stays on the heading's line
- [ENH] the pagination controls are real buttons, the reload button has an accessible name, and the focus stays on the equivalent control across a page change
- [DOC] `inHeaders` and `inRows` let a column's `data-tpl-*` apply to the header or the body cell alone
- [BUG] a page left behind by shrinking data falls back to the last existing page; an empty table shows `Page 1 of 1`; an `order` without its `sorter` asks for no sort
- [BUG] a failed load is announced (`role="alert"`) and the table carries `aria-busy` while the load it owns runs
- [BUG] column headings are start-aligned

#### ful: disclosures (tooltip, dialog, drawer, menu, toasts)

- [NEW] `ful-tooltip`: a marker opening a native popover note (`placement`, `top` by default; `icon` per tooltip, `Tooltip.config.icon` for the page). `describes` makes the note part of the enclosing field's description and takes the marker out of the tab order. The marker is a `role="button"` span with class `ful-tip`, so it works inside a disabled `fieldset`; the note carries a callout pointing at it
- [NEW] `ful-dialog`: a native modal `<dialog>` with a `header` attribute and slot, a body and a `buttons` slot, a close button in its header, and a localized acknowledge button when no buttons are slotted. `open()`/`ask()` and the `close` event answer `{ dismissed, result, response }`, `result` being the `data-result` of the button that closed it; removed while open, it answers a dismissal
- [NEW] `ful-dialog` takes `requires-answer` (no close button, no Escape, no backdrop dismissal) and `close-on-submit` (closes on its own form's `submit:success`, answering the response); `update(callback)` shows a loading state and then the body or the callback's problems
- [NEW] `Dialog.ask(header, body, buttons, options)` and `Dialog.confirm(header, body, labels, options)` build, show and remove a transient dialog; `confirm` resolves a boolean, and `options.className` dresses the dialog
- [NEW] `ful-drawer`: the same dialog as a side panel (`placement="end|start"`, full screen below 30rem), with a `header` attribute and slot, `update(header, callback)`, `close-on-submit`, and a `close` event carrying `{ dismissed, response }`. It slides in and out, writing a `closing` attribute on its `<dialog>` while it leaves
- [NEW] `ful-dialog` and `ful-drawer` dismiss on Escape, the close button and a click on the backdrop, are named by their heading, and open from any element carrying `dialog-target` set to their id
- [NEW] `ful-dialog` and `ful-drawer` dispatch a cancelable `dialog:dismiss` / `drawer:dismiss`, with `detail.reason` (`button`, `escape` or `backdrop`), before one of those gestures closes them, so a page with unsaved edits can keep them open
- [NEW] `ful-menu`: a menu of the buttons and links written inside it, opened by the invoker `for` names, with roving focus, `Home`/`End`, type-ahead, and `Escape` returning the focus to the invoker
- [NEW] `ful-toasts`: one region per page, where `show(message, { severity, timeout, action })` or a `show-toast` event stacks a toast that retires on its timer (5 seconds by default) or its dismiss button; the timer holds while the toast is hovered or focused, and `error` is announced as an alert
- [ENH] the `ful-toasts` region is a manual popover shown again on every toast, so a toast raised while a dialog or drawer is open shows above it
- [NEW] `Anchors.show(popover, anchor, options)` places a popover beside an element or a rectangle once, and `Anchors.wire(invoker, popover, options)` pairs a popover with its invoker, placing it by hand where the platform lacks css anchor positioning
- [ENH] the anchored popovers (the select's dropdown, the filter menus, the tooltip's note) are placed on every platform, by the stylesheet where css anchor positioning exists and by the library elsewhere, before they are first shown
- [BUG] a tooltip slotted in a field's `before` or `after` affix wraps its note instead of running it off the screen on one line
- [BUG] `ful-menu` and the filters' operator, sensitivity and value menus open above their invoker where there is no room below, instead of running off the viewport
- [ENH] a dialog taller than the viewport scrolls its body between a header and a footer that stay in view, a footer closing a form in the body included, and a drawer keeps the last footer of its content, or of the form it holds, at the bottom of the panel
- [ENH] the geometry and the backdrop are themed through `--ful-dialog-width`, `--ful-drawer-width`, `--ful-toasts-max-width` and `--ful-backdrop-color`; the dialog's sections also answer to the `ful-dialog-header`, `ful-dialog-body` and `ful-dialog-footer` classes at any depth

#### ful: navigation (tabs, accordion, wizard) and async sections

- [NEW] `ful-tabs`: `<tab>` elements in the `tabs` slot paired with the panels in order, arrow-key navigation, the `active` attribute or property picking the panel, and a `tabs:change` event carrying `{ active, previous }`
- [NEW] `ful-accordion`: styling over native `details`/`summary`, `exclusive` keeping one panel open
- [NEW] `ful-wizard`: `<step>` declarations over `data-step` sections, `next()`/`prev()`/`move(name)`, the focus moving to the entered section and a `wizard:change` event carrying `{ index, step }`; `progress` picks the chrome (the current step by default, `timeline`, `dots` or `none`)
- [NEW] async sections: entering a tab panel or a wizard section, or opening a dialog or drawer, fires `section:requested`, then `section:requested:#<index>` and, where the section has a name, `section:requested:<name>`, on the component. A listener registered through `AsyncEvents.asyncOn` delivers the section's content; the component shows a loading state and paints a failure, the wizard's `move()` rejecting on one, and `refresh()` fires the request again. Without a listener nothing changes

#### ful: theme, chrome and accessibility

- [NEW] `.ful-button`, opt-in button styling with `.ghost`, `.soft` and `.small` variants, themed through `--ful-button-*`
- [NEW] `ful-empty`, a style-only tag for empty states, used by the table and the dropdown
- [NEW] `.ful-sr-only` hides any element visually while leaving it to assistive technology, and `ful-sr-label` on a field does the same to its label, which stays the control's accessible name
- [NEW] the icons are mask-based `ful-icon` elements; a page adds its own with `ful-icon[name='...'] { mask-image: ... }`
- [ENH] the theme holds WCAG AA contrast in light and dark schemes: `--ful-accent-ink` for accent text, a real `--ful-muted-color`, and error and warning tokens as `light-dark()` pairs
- [ENH] the focus and invalid rings derive from `--ful-active-bg` and `--ful-invalid-color`; `--ful-controls-height` sizes every control alike
- [ENH] elements whose slotted markup would show wrongly before they render (`ful-select`, `ful-tabs`, `ful-wizard`, `ful-dialog`, `ful-drawer`) stay hidden until they do
- [ENH] an invalid field is marked by its border and its message, without the warning glyph inside text inputs
- [ENH] motion yields to `prefers-reduced-motion`
- [BUG] the select's and the boolean filter's chevron follows the text colour, so it shows in dark mode
- [ENH] the switch knob is painted with `--ful-active-color`, the colour on the accent, instead of a fixed white
- [BUG] a live region is revealed before it is filled, so `ful-errors` and error sections are announced reliably

#### Packaging

- [ENH] `dist/fml.d.mts` re-exports the three declaration files, so a type reached through `@optionfactory/fml` and through `@optionfactory/fml/ftl` is the same type
- [ENH] a release candidate is published under the `rc` dist-tag; a bare `npm install @optionfactory/fml` resolves to the latest release
- [REF] internal: the ful sources are grouped by family (`chrome/`, `disclosures/`, `forms/`, `navigation/`, `l10n/`); the entries and the published bundles are unchanged

### version 8.0.2

- [REF] the disabled protocol of `ful-input`, `ful-checkbox`, `ful-select`, `ful-radio-group` and `ful-filter-*` now follows native semantics: the attribute is the field's own claim and nothing but its author ever writes it, a disabled `<fieldset>` ancestry is honored through `:disabled` and the browser's own disabling of the inner controls, and the `disabled` property reflects the claim only, like a native input's. This replaces the `formDisabledCallback` and unclaiming machinery, which kept regressing: a re-enabled fieldset used to leave fields disabled for good, and a field declared disabled in markup inside a disabled fieldset used to lose its claim when the fieldset came back. Behavior change: a field disabled only by its ancestry now reads `.disabled === false`, ask `matches(':disabled')` for the effective state, as with a native input
- [ENH] `ful-select` declares the type of its keys with `k-type`: `string` (the default, like every other control), `number` or `boolean`. A key that does not decode is kept as it is. Unlike 8.0.0, which leaked whatever the endpoint carried into `value`, `change` and the submitted payload, typed keys are now an explicit opt in
- [BUG] `ful-select` keeps its selection when the endpoint carries typed keys: a `value="16"` assignment used to be dropped as soon as the loader answered with the numeric `16`, the internal lookup comparing strictly what the loaders match loosely. Keys are coerced to one canonical type at every entry point, an option picked from the dropdown included

- [BUG] a `ful-input`, `ful-checkbox`, `ful-select`, `ful-radio-group` or `ful-filter-*` inside a re-enabled `<fieldset>` follows it back to enabled. The form disabled state no longer puts the attribute on the host, which used to make the element disabled on its own: the platform only delivers `formDisabledCallback(false)` on an actual state change, so the element stayed disabled for good. A field disabled on its own while the fieldset was disabled still stays disabled
- [BUG] a component that throws while upgrading no longer keeps `ftl:ready` from firing for the whole page. The failure still reaches the console and the global error reporter as before, it just does not hold back everything else
- [ENH] the package ships IDE metadata for its custom elements: a custom elements manifest, web-types for the JetBrains IDEs and custom data for VS Code, so tags, attributes, slots and events complete in a template

### version 8.0.1

- [BUG] `VersionedSessionStorage` evicts from `sessionStorage` instead of `localStorage` on revision mismatch
- [BUG] `Template.evaluate` returns the evaluated expression result
- [ENH] `ful-select` survives prefetch failures and hides its dropdown on load errors
- [REF] tsc checkJs errors resolved; biome lint gate green (config hygiene + fixes)
- [BUG] `ful-input-file` no longer throws on render: observed attributes are now applied after the element internals are wired
- [ENH] `placeholder` is observed by every `ful-input` subclass (`ful-input-file`, `ful-input-local-date`, `ful-input-instant`, `ful-filter-*`)
- [BUG] `ful-select` no longer throws on `Enter` or arrow keys when the dropdown is empty or not rendered yet
- [BUG] `ful-sorter` now applies its declared `order` at render, so the first click cycles from the declared order
- [BUG] `ful-table` collects its sorters after the headers are rendered, so sorting a column clears the order of the others
- [BUG] `Timing.debounce` and `Timing.throttle` keep working after `abort()`, which used to leave the timer id set and block any further scheduling
- [BUG] `Bindings.mutate` matches radio values as strings, like `ful-radio-group` already did: booleans and numbers coming from a payload previously matched nothing and left the group unchecked
- [BUG] `ful-pagination` applies `total` and `current` at render, the properties used to stay at 0 whatever the attributes said
- [BUG] `ful-filter-instant` and `ful-filter-local-date` expose their `readonly` and `disabled` getters again, a setter declared without its getter shadowed the inherited pair
- [REF] tests: every registered element is mounted and each of its observed attributes is checked against the property it exposes
- [BUG] `HttpRequestBuilder.headers` and `.params` remove keys whose value is nullish, as documented: normalizing the initializer through `Headers`/`URLSearchParams` first turned them into the literal strings "null" and "undefined"
- [BUG] the client error reporter swallows the failure of its own report: an unreachable endpoint used to surface as an unhandled rejection, which re-entered the handler and looped, flooding the endpoint
- [BUG] `ful-select` no longer looks up an empty key set: a `multiple` select without a value, or one whose `value` attribute is removed, used to query its loader, which is a request per element with `mode="chunked"`
- [BUG] `ful-form` counts nested submits when spinning: overlapping submits used to hide the spinner early and to enable buttons that were disabled before the submit started
- [BUG] `ful-select` applies assigned keys synchronously, `value` used to lag behind the assignment until the loader answered: setting a form's values and reading them back lost every select
- [BUG] `ful-select` discards a lookup that resolves after a newer assignment, which used to overwrite the newer selection
- [BUG] `ful-select` keeps the requested keys when the `exact` lookup fails, instead of clearing them. The failure is still reported. Until the labels are resolved a key stands in for its own label, so badges can show a key briefly
- [BUG] `ful-table` does not hold up its own upgrade with the first load: a loader that fails or never answers used to keep `ftl:ready` from firing for the whole page. The error state is rendered and the failure stays reportable as before
- [BUG] `ftl:ready`, `Rendering.waitFor` and `Rendering.waitForChildren` also wait for the components enqueued while they are waiting: a component is only queued once its parent connects it, so a single pass used to report ready with nested components still unrendered
- [ENH] `Enter` on a `ful-select` whose dropdown is closed submits the surrounding form, as it does on a `ful-input`, instead of being swallowed
- [BUG] the css bundle concatenates its stylesheets in the order the modules evaluate, not the order rollup happened to transform them in: rollup loads in parallel, so the order was a race, and `theme.css`, the first import of the ful entry, landed 24KB into the built file. Rules of equal specificity therefore resolved differently in the bundle than in the source tree, and the layer order, which is fixed where each layer name is first seen, came out inverted. A build-time guard fails the build if a `@layer` block is ever emitted before the statement declaring the order
- [REF] the css bundle is minified by postcss and cssnano directly instead of rollup-plugin-postcss, unmaintained since 2023: same rules, slightly different minification of svg data uris, source maps still resolve to the original stylesheets
- [BUG] `HttpRequestBuilder.param` overrides a parameter already set, as its documentation always said and as `header`, `headers` and `params` all do. It used to append, so setting the same key twice silently sent it twice. Pass every value in one call, `param('k', 'a', 'b')`, to get a multi valued parameter
- [BUG] `LocalStorage.load` and `SessionStorage.load` treat unparseable content as absent and drop it, instead of throwing on every read: a single corrupt entry used to break a preloaded `ful-select` for good
- [ENH] `ful-input-local-time` resolves `now` and `+/-Nh`, `+/-Nm` offsets for `min` and `max`, truncated to the `step` grid so that every value on that grid stays selectable. It used to inherit the date offsets of `ful-input-local-date`, so `now` yielded a date and `-30m` was read as thirty months
- [BUG] an unset `placeholder` leaves a blank one on the inner input rather than none, so `:placeholder-shown` keeps matching and floating labels keep working. The property still reads `null`, and the blank one is not reflected onto the host
- [BUG] a disabled `ful-input`, `ful-checkbox`, `ful-select`, `ful-radio-group` or `ful-filter-*` is left out of the submitted values. Disabling put the attribute on the inner control only, so the element never matched `:disabled` and `Bindings.extractFrom` kept sending it
- [BUG] `ful-form` reports a failing request mapper, or a missing loader component, as a `submit:failure` like any other failure. It used to escape `submit()` as an unhandled rejection with no event at all
- [BUG] a `ful-filter-*` rendered from a `value` attribute shows the operator it is actually using, and a `BETWEEN` range reveals the second bound it carries. Both used to keep the template defaults, so the control disagreed with its own value
- [BUG] `ful-filter-text` reports back the sensitivity it was given instead of always reporting `IGNORE_CASE`, which silently downgraded a `CASE_SENSITIVE` query
- [ENH] `ful-filter-*` emits `change` when the second bound of a range is edited or a new operator is picked, not only when the first bound changes
- [BUG] `ful-input-file` shows one warning per violated constraint instead of only the last one, and clears them as soon as a later selection is clean
- [BUG] `ful-input-file` keeps its selection when a drop carries no file, so dragging text or a link over the dropzone no longer wipes the picked files
- [BUG] `ful-input-file` enforces its constraints and refreshes its item list when `files` or `file` is assigned programmatically, not only when the user picks or drops
- [BUG] `ful-input-file` removes only the clicked item when two selected files share a name
- [REF] the `unaccepptablefiletype` localization key is spelled `unacceptablefiletype`
- [BUG] the `mask` of a `ful-input` no longer throws on the input types that have no caret, `email`, `number` and the date ones: the value is masked and only the caret restore is skipped
- [BUG] the `mask` of a `ful-input` keeps the caret among the characters that survived. It used to shift left by every stripped character, including the ones after the caret
- [BUG] `ful-select` no longer brings back a selection removed while its label lookup was still in flight, which left the element disagreeing with the `change` it had just emitted
- [BUG] `ful-pagination` renders at most as many page links as `pages` asks for. An even value used to overshoot, `pages="4"` rendering seven links. With an even value the current page now sits just left of centre
- [BUG] a disabled previous or next in `ful-pagination` no longer requests a page, and next no longer points one past the last: clicking the greyed out arrow on the last page used to load a page that does not exist. Disabled arrows now carry no `data-page` at all

### version 8.0.0

**BREAKING**: `@optionfactory/ful` is now `@optionfactory/fml`, a single package merging the previously separate `ftl`, `httpc` and `ful` libraries (global `ftl`/`httpc`/`ful` namespaces are unchanged when loaded via IIFE builds).

**ftl (templating)**
- [REF] merged into `@optionfactory/fml` (previously a separate library)
- [ENH] `null`/`undefined` literals added to the expression grammar
- [ENH] AST cache for parsed expressions (bounded, FIFO eviction)

**httpc**
- [ENH] encodings (base64/hex) moved into httpc
- [REF] `RedirectOnUnauthorizedInterceptor` now returns an unresolved promise when it matches (page navigation race)
- [BUG] `Request` construction in `HttpCall.intercept` no longer drops `AbortSignal`s

**ful**
- [ENH] a11y for `ful-select` (combobox role, aria-expanded lifecycle)
- [ENH] `Bindings` extraction from textareas
- [BUG] `Bindings` subscript handling
- [BUG] `ful-input-file` null-safe value handling
- [ENH] `InMemoryTableLoader` supports pagination
- [BUG] `InMemoryTableLoader` loaded page property name
- [BUG] `LocalizationModule` null-safety
- [ENH] timing utilities use `performance.now`
- [ENH] `client-errors` uses `keepalive` to survive page changes

**tooling**
- [REF] tests run on web-test-runner with Playwright/Chromium (replaces jsdom); coverage ~71%
- [REF] biome for lint/format; tsc checkJs type checking
- [REF] examples reorganized under `examples/ftl` and `examples/ful`

### version 7.0.0

**BREAKING** : Changed the implicit default behavior of AsyncEvents.fireAsync from a single-value interception to a parallel 'broadcast' (which now returns an array of all resolved listener values). To maintain the previous behavior of intercepting a single return value from a middleware handler, you must now explicitly pass { mode: 'pipeline' }.

**jsconfig target**: jsconfig.json target is now "ES2024", was: "ES2022"
