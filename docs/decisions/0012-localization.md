# 0012. Localization is a flat overlay, fixed per page

Status: accepted

## Context

Runtime language switching pushes i18n into every render path and every
element's state; message catalogs with nesting and per-namespace loading make
the common case (one language per page) pay for the rare one.

## Decision

`ftl.Localization` is a plain template module: one flat translations overlay
with dotted keys and named `{placeholders}` (`{amount}` yes, `{user-name}` no),
`{ one, other }` plural leaves selected through `Intl.PluralRules`, the
`#l10n:date()/number()/bytes()` formatters honoring the page locale, and
`#l10n:failure()`, the one reading of what went wrong (a failure's reasons one
per line, otherwise an error's message), which every ful surface paints a
rejection through. The
language is fixed per page: the ful plugin bakes the fallback chain once at
`configure()`, and elements stay queued until configuration completes, so no
message can render ahead of its translations.

Remote translations are the app's concern and the app's timing: fetch and
await before `configure()`, or server-render the flat map inline
(`translations: window.APP_L10N`) on latency-sensitive pages. The same map
rewords built-ins and carries external components' strings.

## Consequences

- Switching language is a page load, which is stated, not hidden; nothing in
  an element observes a locale change.
- Built-in strings (pagination, table states, filter words) are overridable
  with plain keys, so a product rewords the library without forking it.
- The strict placeholder grammar keeps messages parseable and greppable.
