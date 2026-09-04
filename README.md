# fml

A minimalist frontend library


## ftl
A no-build templating and web components library.

## httpc

An http client

## ful
A no-build web components library based on ftl

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

`dist/ful.css` (bundled in `dist/fml.css`) is self-contained: no bootstrap, no icon fonts, no javascript dependencies. Every element is themed through the `--ful-*` custom properties (density included: `--ful-controls-height` sizes every control uniformly, defaulting to the native date/time widgets' height so no control is shrunk), and the structural styling hooks are the style-only tags `ful-control-group`, `ful-affix`, `ful-control`, `ful-icon`, `ful-choice`, `ful-badge` (plus the pre-existing `ful-field-error`, `ful-field-warning(s)`, `ful-item-list`, `ful-item`). Icons are `ful-icon` elements (`<ful-icon name="search">`) carrying inline SVG masks, and glyph shapes come from [bootstrap-icons](https://icons.getbootstrap.com) 1.11.3, MIT licensed.

See `examples/ful/kitchen-sink.html` for a bootstrap-free page showing every component in its normal, disabled, readonly, invalid and loading states; the other examples embed bootstrap css for their own layout.

## client-errors



## Documentation

[Check the documentation](https://github.com/optionfactory/fml/wiki) in the wiki.
