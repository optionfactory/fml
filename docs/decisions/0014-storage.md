# 0014. Revision-guarded local storage, denial is a miss

Status: accepted

## Context

Fetched vocabularies (select options) outlive a session and are worth caching,
but localStorage is deniable (blocked cookies, embedded or private contexts),
and a cache needs an invalidation story that does not involve the server.

## Decision

`ful-select` caches a fetched vocabulary in local storage under its `src` and
`method`, guarded by `revision`: a load under a different revision is a miss
that also evicts the entry. The revision is the cache's namespace and the page
author's to choose, including the principal when a vocabulary differs per
user (`revision="{userId}-v3"`). Left valueless, the revision the registry's
`revision` component answers is used, so a page states its build once instead
of every element repeating it; when neither is resolvable, the loader warns
that nothing will be cached rather than failing quietly.

The storage wrapper treats an unreachable backing as a miss on read and a
no-op on remove, never an exception at module load, and drops entries that
fail to decode. A registry component answering a function is called; a written
attribute always wins.

## Consequences

- Caching is per-origin-keyed and server-free to invalidate: bump the
  revision, or the build revision component, and every vocabulary refetches.
- The author-facing obligation (principal in the revision) is documented in
  the README because the library cannot enforce it, and the failure is silent.
- Storage-denied contexts degrade to no caching with a console warning, not to
  broken selects.
