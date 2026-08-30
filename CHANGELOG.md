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