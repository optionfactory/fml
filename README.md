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

Remote translations are the app's concern: `translations: await (await fetch(`/l10n/${language}/overrides.json`)).json()` awaited before `configure()` — elements stay queued until then, so no message can render ahead of its translations. Latency-sensitive pages skip the network entirely by server-rendering the translations inline (`translations: window.APP_L10N`). Bare ftl pages get the same module with `registry.defineModule('l10n', Localization)` and their own `l10n` overlay. See `examples/ftl/l10n.html` and `examples/ful/l10n.html`.

### Styling

`dist/ful.css` (bundled in `dist/fml.css`) is self-contained: no bootstrap, no icon fonts, no javascript dependencies. Every element is themed through the `--ful-*` custom properties (density included: `--ful-controls-height` sizes every control uniformly, defaulting to the native date/time widgets' height so no control is shrunk), and the structural styling hooks are the style-only tags `ful-control-group`, `ful-affix`, `ful-control`, `ful-icon`, `ful-choice`, `ful-badge`, `ful-note` (plus the pre-existing `ful-field-error`, `ful-field-warning(s)`, `ful-item-list`, `ful-item`). Icons are `ful-icon` elements (`<ful-icon name="search">`) carrying inline SVG masks, and glyph shapes come from [bootstrap-icons](https://icons.getbootstrap.com) 1.11.3, MIT licensed.

See `examples/ful/kitchen-sink.html` for a page showing every component in its normal, disabled, readonly, invalid and loading states; every example page is bootstrap-free, styled by `dist/ful.css` and its own few lines of page css.

## client-errors

A standalone IIFE (`dist/client-errors.iife.js`, no module machinery: one `script src` tag carrying `data-report-client-errors-uri`) listening for `error` and `unhandledrejection` and POSTing a json report (page url, message, stack) to that uri. The report travels same-origin with the page's csrf meta pair (`_csrf_header`/`_csrf`) when present, `keepalive` so it survives navigation away, and the script swallows its own failures: an unreachable endpoint is never re-reported as an error.

## Security and threat model

fml trusts the page author and treats everything arriving afterwards as hostile. Templates, expression modules, translations and the markup are part of the page's source, trusted by design exactly like the javascript that renders them — no sanitizer is bundled, because sanitization is application policy, not library policy. What arrives later (user input, api payloads, urls) reaches the page through two doors: `{{ expression }}` interpolates into text nodes, and attribute binding goes through `setAttribute`. The expressions themselves run on a tree-walking interpreter over a PEG grammar that calls no `eval` and builds no `new Function` of its own — but it is an interpreter, not a sandbox: name, member and module lookups resolve through the prototype chain exactly like the page's own javascript, so an expression can reach inherited builtins and their constructors (`{{ __proto__.constructor.constructor('…')() }}` evaluates), making an expression string exactly as powerful as a script tag. Expressions are authoring: function calls resolve against explicitly registered modules on the intended path, and untrusted values arrive as data the expression reads, never as text spliced into the expression itself. Attribute binding is `setAttribute` and nothing more: a URL sink (`data-tpl-href`, `data-tpl-src`, `data-tpl-formaction`) binds a `javascript:` url as faithfully as any other, and `data-tpl-on*` binds inline handler text. The escape hatches are explicit and few: `{{{ expression }}}` assigns through `innerHTML`, `data-tpl-attr-append` sets whatever `[name, value]` pairs the expression carries, and `Attributes.forward` forwards author attributes to inner controls, inline handlers included. All of them bind author-controlled or app-sanitized values only. httpc never evaluates a response body and sends credentials same-origin only (fetch's default); its default error branch embeds the response text in the failure's message, so mind endpoints whose error pages carry internals. The line to hold in review: never bind untrusted data to `{{{ }}}`, `data-tpl-on*`, a URL-sink attribute or `data-tpl-attr-append`, never splice untrusted data into an expression string, and never load templates or translations from an origin you don't trust.

## Documentation

[Check the documentation](https://github.com/optionfactory/fml/wiki) in the wiki.
