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
- [REF] the css bundle is minified by postcss and cssnano directly instead of rollup-plugin-postcss, unmaintained since 2023: same rules, slightly different minification of svg data uris, source maps still resolve to the original stylesheets
- [BUG] `HttpRequestBuilder.param` overrides a parameter already set, as its documentation always said and as `header`, `headers` and `params` all do. It used to append, so setting the same key twice silently sent it twice. Pass every value in one call, `param('k', 'a', 'b')`, to get a multi valued parameter
- [BUG] `LocalStorage.load` and `SessionStorage.load` treat unparseable content as absent and drop it, instead of throwing on every read: a single corrupt entry used to break a preloaded `ful-select` for good
- [ENH] `ful-input-local-time` resolves `now` and `+/-Nh`, `+/-Nm` offsets for `min` and `max`, truncated to the `step` grid so that every value on that grid stays selectable. It used to inherit the date offsets of `ful-input-local-date`, so `now` yielded a date and `-30m` was read as thirty months
- [BUG] an unset `placeholder` leaves a blank one on the inner input rather than none, so `:placeholder-shown` keeps matching and floating labels keep working. The property still reads `null`, and the blank one is not reflected onto the host

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