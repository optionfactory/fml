# 0015. Loaders are the shared seam between views

Status: accepted

## Context

Selects, tables, kanbans and anything else paged all want the same things:
async vocabularies or pages, revision caching, and a request vocabulary
(`page`, `size`, `sort`, `filters`). Building those per view duplicates the
contract and guarantees drift.

## Decision

Loaders are registry components with documented contracts, not private
machinery: `loaders:select` owns the vocabulary lifecycle (prefetch, search,
`exact` key lookups, revision caching) and `loaders:table` owns the page
request (`?page=&size=&sort=&filters={json}` with the table's `method`, `GET`
by default, falsy filters dropped), and `loaders:form` owns a form's
prepare-and-submit exchange. Any view can resolve one through its registry and
share the request vocabulary: a kanban should reuse the table loader's request
building rather than re-derive it. Elements hand their loader over for runtime
changes (`withLoader(fn)`, `withLoader(l => l.update(entries))` for in-memory
vocabularies). Pointing a view at another url is the element's job, not the
loader's: writing `src` or `method`, or calling `reconfigure({ src, method })`,
builds the loader again through the same component (0008), so a custom loader
follows the change without implementing anything.

A load is never awaited into the element's render (the autoload discipline:
a slow or failing loader cannot hold up the page), and superseded loads are
dropped through claims (0021), never rendered.

## Consequences

- The wire contract lives in one place per kind of data; a review comparing
  what the app sends to what the server expects reads the loader, not every
  view.
- Custom vocabulary sources are a component away (`defineComponent` on a
  registry), which is how tests stub http and how apps plug in-memory data.
- Views that bypass the seam (re-building `filters` shapes by hand) are the
  drift risk, and reviews should flag them.
