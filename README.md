# fml

A minimalist frontend library


## ftl
A no-build templating and web components library.

## httpc

An http client

## ful
A no-build web components library based on ftl

ful fields report their values through `ful-form`'s intercepted submit: a plain `<form>` carrying them submits none of their values. Expressions compare strictly (`==` is `===`, and there is no coercing spelling), and message placeholders are `\w+` names — `{amount}` yes, `{user-name}` no.

### Localization

`ftl.Localization` is a plain template module: a single flat translations overlay (`{ 'pagination.showing': 'Page {current} of {total}', … }`, dotted keys, named placeholders, `{ one, other }` plural leaves selected through `Intl.PluralRules` over a numeric `{count}`) plus `#l10n:date()`, `#l10n:number()` and `#l10n:bytes()` formatters honoring the page locale. Outside the templates, `Localization.of()` exposes the same functions imperatively.

The language is fixed per page. The ful plugin bakes the fallback chain once at configure:

```js
new ful.Plugin({
    language: 'it', // a full BCP-47 tag or a primary subtag, defaulting to the browser's language
    translations: { // flat, active-language only: reword built-ins or add your own keys
        'pagination.next': 'Avanti ancora',
        'checkout.total': 'Totale: {amount}',
    },
});
```

Remote translations are the app's concern: `translations: await (await fetch(`/l10n/${language}/overrides.json`)).json()` awaited before `configure()` — elements stay queued until then, so no message can render ahead of its translations. Latency-sensitive pages skip the network entirely by server-rendering the translations inline (`translations: window.APP_L10N`); the same flat map rewords built-ins and carries external components' strings. Bare ftl pages get the same module with `registry.defineModule('l10n', Localization)` and their own `l10n` overlay. See `examples/ftl/l10n.html`.

### Styling

`dist/ful.css` (bundled in `dist/fml.css`) is self-contained: no bootstrap, no icon fonts, no javascript dependencies. Every element is themed through the `--ful-*` custom properties (density included: `--ful-controls-height` sizes every control uniformly, defaulting to the native date/time widgets' height so no control is shrunk), and the structural styling hooks are the style-only tags `ful-control-group`, `ful-affix`, `ful-control`, `ful-icon`, `ful-choice`, `ful-badge`, `ful-note`, `ful-toast`, `ful-table-wrapper`, `ful-pagination-bar`, `ful-radio-list`, `ful-tablist`, `ful-accordion-group`, `ful-steps` (plus the pre-existing `ful-field-error`, `ful-field-warning(s)`, `ful-item-list`, `ful-item`). The chrome matches the rendered structure, never the host tag enumeration: a component's css anchors on whoever hosts its pieces (`*:has(> ful-control-group)`, `*:has(> ful-toast)`, the `ful-dialog`/`ful-drawer` classes on the native dialog), so a subclass under any tag keeps the look, and foreign markup built from the same tags picks it up too — only the pre-render flash guards stay tag-based. Icons are `ful-icon` elements (`<ful-icon name="search">`) carrying inline SVG masks, and glyph shapes come from [bootstrap-icons](https://icons.getbootstrap.com) 1.11.3, MIT licensed. Buttons are opt-in chrome: `.ful-button` and its `.ghost` and `.soft` mirrors theme any `button` or `a` through the `--ful-button-*` properties — the ghost an accent outline filling on hover, the soft a neutral fill turning accent on intent (the dialog's own answer buttons).

Everything ful ships lives in a cascade layer, declared in that order:

```css
@layer ful.theme, ful.components, ful.hidden;
```

That is the whole override contract. A rule the page writes **outside** any layer wins over every rule ful ships, whatever its specificity, so overriding takes a plain selector rather than one built to out-specify the library:

```css
/* enough, on its own */
.ful-tip { display: block }
```

A page that layers its own styles decides by declaration order instead: name your layer after `ful.hidden` and it wins, before `ful.theme` and it loses. `ful.hidden` is last so `[hidden]` beats the chrome that would otherwise lay an element out, which is what an `!important` used to do here; because it is a plain declaration in a layer, a page can still show such an element with an ordinary rule.

Two page-wide defaults come with the stylesheet, deliberately. `box-sizing: border-box` applies to everything, on the assumption a page wants it and because a custom field extending `Field` should get the same box model as the built-in ones without naming its tag anywhere. `[hidden]` is hidden. Both are in layers, so one unlayered rule turns either off:

```css
*, *::before, *::after { box-sizing: content-box }
```

### Async sections

Every content surface can deliver itself: entering a panel of `ful-tabs`, a section of `ful-wizard` (its `progress` attribute picking the shape: the current step alone by default, `timeline` the full timeline, `dots`, `none`), or opening a `ful-dialog`/`ful-drawer` fires the `section:requested` family on the component — the generic type, its zero-based `#index`, and its `data-step` name when it has one — the event's target being the component itself, so a host's own sections are told from a nested component's by `e.target === e.currentTarget`. Answer through one door per section:

```js
ful.AsyncEvents.asyncOn(wizard, 'section:requested:dettagli', async (e) => {
    if (!e.detail.first) {
        return;                                          // load once, refresh() re-fires
    }
    e.detail.section.prepend(ftl.Fragments.fromHtml(await httpc.get(`/steps/${e.detail.name}`).fetchText()));
});
```

The component awaits the union of the answers: the loading ring covers the wait, a failed delivery paints the section's problems and rejects the wizard's `move()`, and nobody listening is a plain activation at zero cost — server-rendered sections never know the door exists. `refresh()` re-fires explicitly (wizard by name or section, tabs by index or section; dialog and drawer argument-less), the drawer's `update()` keeping its own open-answer-deliver cycle.

The palette is `light-dark()` based and follows the page's `color-scheme` alone: pin `color-scheme: light` to disable the dark side, declare `light dark` to follow the os, `dark` to force it — the library declares nothing itself, and it works per-subtree too. The theme's ink pairs hold WCAG AA in both schemes, kept honest by a suite that computes the ratios; wherever the accent is read instead of filled (ghost outlines, done steps, success toasts) use `--ful-accent-ink`, the accent tuned for text.

See `examples/ful/kitchen-sink.html` for a page showing every component in its normal, disabled, readonly, invalid and loading states; every example page is bootstrap-free, styled by `dist/ful.css` and the shared `examples/base.css` page skeleton, with each demonstration grouped in a legended card that shows its own authored markup in a collapsible block (the kitchen sink excepted). A `ful-select` with `itemlist` renders its entries as deletable chips — one pill per entry with the remove zone at its end — and shapes them through a `<template slot="items">` when the stock chip is not enough; the open dropdown marks the options already picked.

## Browser support

fml targets evergreen browsers from spring 2024. The hard floor is Chrome/Edge 123 (March 2024), Firefox 125 (April 2024) and Safari 17.5 (May 2024), set by the newest platform features the library leans on everywhere: `light-dark()`, the Popover API, `Promise.withResolvers`, `:has()` and native CSS nesting. Below the floor, script or styling fail outright.

One feature degrades instead of breaking under a newer floor of its own, and another carries its own fallback:

- the fields' label and description wiring uses aria element reflection, Baseline since April 2025: an older browser keeps the visible layout intact while assistive technology silently loses the label and description associations
- anchored popovers (the tooltip's note, the select's dropdown, the filter and boolean-value menus) need CSS anchor positioning: Chrome/Edge 129 (September 2024), Safari 26 (September 2025), Firefox 147 (January 2026; Firefox's support is partial against the full specification, but covers the subset fml uses, `anchor-name`, `position-anchor`, `position-area` — Baseline since January 2026 — `anchor()` and `anchor-size()`). Below these a hand-placed fallback keeps the popovers anchored beside their invoker, and never runs where the css works

On iOS every browser runs the system WebKit, so the floor reads in iOS versions: iOS 17.5 (May 2024) or newer, which every iPhone from the XS/XR (2018) onward can reach; the anchored popovers fall back to hand placing below iOS 26 (September 2025).

The test suite runs on current Chromium, Firefox and WebKit on every `npm run verify`.

## client-errors

A standalone IIFE (`dist/client-errors.iife.js`, no module machinery: one `script src` tag carrying `data-report-client-errors-uri`) listening for `error` and `unhandledrejection` and POSTing a json report (page url, message, stack) to that uri. The report travels same-origin with the page's csrf meta pair (`_csrf_header`/`_csrf`) when present, `keepalive` so it survives navigation away, and the script swallows its own failures: an unreachable endpoint is never re-reported as an error.

## Security and threat model

fml trusts the page author and treats everything arriving afterwards as hostile. Templates, expression modules, translations and the markup are part of the page's source, trusted by design exactly like the javascript that renders them — no sanitizer is bundled, because sanitization is application policy, not library policy. What arrives later (user input, api payloads, urls) reaches the page through two doors: `{{ expression }}` interpolates into text nodes, and attribute binding goes through `setAttribute`. The expressions themselves run on a tree-walking interpreter over a PEG grammar that calls no `eval` and builds no `new Function` of its own — but it is an interpreter, not a sandbox: name, member and module lookups resolve through the prototype chain exactly like the page's own javascript, so an expression can reach inherited builtins and their constructors (`{{ __proto__.constructor.constructor('…')() }}` evaluates), making an expression string exactly as powerful as a script tag. Expressions are authoring: function calls resolve against explicitly registered modules on the intended path, and untrusted values arrive as data the expression reads, never as text spliced into the expression itself. Attribute binding is `setAttribute` and nothing more: a URL sink (`data-tpl-href`, `data-tpl-src`, `data-tpl-formaction`) binds a `javascript:` url as faithfully as any other, and `data-tpl-on*` binds inline handler text. The escape hatches are explicit and few: `{{{ expression }}}` assigns through `innerHTML`, `data-tpl-attr-append` sets whatever `[name, value]` pairs the expression carries, and `Attributes.forward` forwards author attributes to inner controls, inline handlers included. All of them bind author-controlled or app-sanitized values only. httpc never evaluates a response body and sends credentials same-origin only (fetch's default); its default error branch embeds the response text in the failure's message, so mind endpoints whose error pages carry internals. The line to hold in review: never bind untrusted data to `{{{ }}}`, `data-tpl-on*`, a URL-sink attribute or `data-tpl-attr-append`, never splice untrusted data into an expression string, and never load templates or translations from an origin you don't trust.

## Documentation

[Check the documentation](https://github.com/optionfactory/fml/wiki) in the wiki.
