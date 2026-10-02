# 0010. One registry seam for elements, components and loaders

Status: accepted

## Context

A component library grows three vocabularies fast: elements (tags), components
(named services an element resolves, like an `http-client` or a `revision`),
and loaders (vocabulary/page providers). Left as separate mechanisms they
become three registration lifecycles and three lookup scoping rules.

## Decision

All three are defined on one `Registry`. `defineElement(tag, klass)` composes
the class's declarations (0008, 0009), templates and config into `BITS`, which
travels with the definition: an element resolves its templates, its evaluator
and its components through the registry that *defined it*, not through
whichever module happened to import it. `defineComponent(name, value)` names a
service (`el.component('revision')`), `defineModule` merges expression
modules, and loaders are components with a documented contract rather than a
mechanism of their own (0015).

Elements enqueue for upgrade through their defining registry, so a page that
configures late (remote translations awaited before `configure()`) delays
every upgrade behind it without any element knowing.

## Consequences

- A page's whole environment (elements, http client, localization, revisions,
  custom services) is one object graph, and a separate `Registry` is a
  separate environment: the suites build their own to stub http or define
  test elements. It does not vary per subtree of one page, since custom
  element tags are global to the document.
- Subclassing stays cheap: a subclass under a new tag inherits `BITS`
  composition for free, which is what the extending wiki chapters rely on.
- `declared()` stays strict (0008) precisely because the registry is also the
  boundary between an element's own vocabulary and a component's knobs.
