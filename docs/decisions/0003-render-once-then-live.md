# 0003. Render once, then live properties

Status: accepted

## Context

Component models choose between rebuilding their dom on every state change
(virtual dom, diffing, keys) and building it once and driving it afterwards.
For a library whose elements wrap native controls that hold *user* state
(focus, caret, selection, half-typed text), rebuilding under the user is a
liability: every re-render is a chance to drop that state, and reconciling it
back is an entire discipline (keys, focus management) that the platform
already solved by not rebuilding in the first place.

## Decision

An element renders exactly once. The registry queues elements and upgrades
them after the parser has seen their markup (children are input, so it
cannot render before they exist), and the single `render()`/`_build` produces
a fragment the element adopts (`replaceChildren`). From that moment the
observed attributes become properties (0008), and **setters drive the dom they
built**. There is no re-render method, no diffing, and the structural template
never runs again.

The consequences are embraced, not apologized for:

- a render that throws leaves the element half-built and shut: properties
  never go live, so a later attribute write cannot reach setters that assume
  pieces a failed render never adopted; the failure surfaces through
  `client-errors`
- templates are immutable: a compiled fragment plus a scope, where
  `withOverlay` returns a new template rather than mutating, so
  data-driven re-rendering (`data-tpl-each`, a table's rows) renders a *new*
  fragment from the same compiled markup and deep-clones into the page; the
  live dom is never edited in place by the template engine
- `ftl:ready` and `Rendering.waitFor` exist because there is no re-render to
  recover late state: coordination happens by waiting for the fixed point,
  not by re-running
- updates that span several nodes land as one batched change (a table's rows,
  its pager and its count are the same state and are replaced together), which
  is the paint-level half of settling state before events fire (0016)

## Consequences

- No virtual dom, no keys, no reconciliation: updates are targeted property
  writes, and the cost of an update is the cost of the dom it touches.
- User state is preserved by construction, since the dom is never rebuilt
  under the user, which is what lets a combobox keep its caret mid-edit.
- The cost sits on the element author: a setter must know how to drive every
  piece it owns, which is the problem the claims protocol (0011) shares, and
  a failed render is unrecoverable for that instance rather than retried.
- Slot and attribute configuration is read once, at the render, which is why
  the two attribute tiers (0008) split into live state and frozen
  configuration. An attribute that has to change afterwards (a table's `src`)
  is moved to the live tier and given a setter that rebuilds what depends on
  it; the structural template still never runs again.
