# fml

A frontend library with no build step and no dependencies: plain ES modules and script tags that run in the browser as they are.

- **ftl**: html templates driven by `data-tpl-*` attributes and a small expression language, and a registry that upgrades your web components once the page has parsed them.
- **httpc**: an http client with a composable request builder, interceptors, and a `problems` contract that turns error responses into typed failures.
- **ful**: 29 web components for forms, tables, disclosures and navigation, built on ftl and httpc, with a self-contained stylesheet themed through custom properties and messages in en, it, es and fr.
- **client-errors**: a one-tag script that posts uncaught errors and unhandled rejections to an endpoint of yours.

## Installing

The four libraries ship as one package, `@optionfactory/fml`. The quickest start is the single bundle and ful's stylesheet:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@optionfactory/fml@{VERSION}/dist/ful.css"
    integrity="{INTEGRITY}" crossorigin="anonymous">
<script src="https://cdn.jsdelivr.net/npm/@optionfactory/fml@{VERSION}/dist/fml.iife.min.js"
    integrity="{INTEGRITY}" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
```

Through a bundler, `npm install @optionfactory/fml` and import `@optionfactory/fml/ftl`, `@optionfactory/fml/httpc` and `@optionfactory/fml/ful`. [Getting started](https://github.com/optionfactory/fml/wiki/01-Getting-started#installing) shows every flavour, including ES modules loaded through an import map, and what each costs.

## Documentation

[Check the documentation](https://github.com/optionfactory/fml/wiki) in the wiki. The choices that constrain the whole library are written down in [docs/decisions](docs/decisions/README.md).

## client-errors

A standalone script, loaded by one tag of its own, that reports the page's uncaught errors to an endpoint of yours: the payload and the endpoint contract are on the [client-errors](https://github.com/optionfactory/fml/wiki/25-Client-errors) wiki page.

## Security and threat model

fml trusts the page author and treats everything arriving afterwards as hostile. Templates, expression modules, translations and the markup are part of the page's source, trusted by design exactly like the javascript that renders them; no sanitizer is bundled, because sanitization is application policy, not library policy. What arrives later (user input, api payloads, urls) reaches the page through two channels: `{{ expression }}` interpolates into text nodes, and attribute binding goes through `setAttribute`. The expressions themselves run on a tree-walking interpreter over a PEG grammar that calls no `eval` and builds no `new Function` of its own. But it is an interpreter, not a sandbox: name, member and module lookups resolve through the prototype chain exactly like the page's own javascript, so an expression can reach inherited builtins and their constructors (`{{ __proto__.constructor.constructor('…')() }}` evaluates), making an expression string exactly as powerful as a script tag. Expressions are authoring: function calls resolve against explicitly registered modules on the intended path, and untrusted values arrive as data the expression reads, never as text spliced into the expression itself. Attribute binding is `setAttribute` and nothing more: a URL sink (`data-tpl-href`, `data-tpl-src`, `data-tpl-formaction`) binds a `javascript:` url as faithfully as any other, and `data-tpl-on*` binds inline handler text. The escape hatches are explicit and few: `{{{ expression }}}` assigns through `innerHTML`, `data-tpl-attr-append` sets whatever `[name, value]` pairs the expression carries, and `Attributes.forward` forwards author attributes to inner controls, inline handlers included. All of them bind author-controlled or app-sanitized values only. httpc never evaluates a response body and sends credentials same-origin only (fetch's default); its default error branch embeds the response text in the failure's message, so mind endpoints whose error pages carry internals. The line to hold in review: never bind untrusted data to `{{{ }}}`, `data-tpl-on*`, a URL-sink attribute or `data-tpl-attr-append`, never splice untrusted data into an expression string, and never load templates or translations from an origin you don't trust. No message ful ships is html-privileged: every built-in string renders through `{{ }}`, so a translation you override is text and cannot carry markup into the page.

A component you register as a `loader` receives the host element and reads whatever configuration you put on it with `getAttribute`, including attributes ful knows nothing about; `declared(name)` answers for the element's own declared vocabulary alone and says so when asked for anything else.

One storage note, since caching outlives a session: `ful-select` caches a fetched vocabulary in local storage under its `src` and `method`, guarded by `revision`: a load under a different revision is a miss that also evicts the entry. The revision is therefore the cache's namespace, and it is the page author's to choose. A vocabulary that differs per user, or that the next person at a shared browser should not see, wants the principal in it (`revision="{userId}-v3"`); without one, the previous user's options are served to the next while the revision matches.
