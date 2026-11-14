# 0021. Superseded work is dropped as stale

Status: accepted

## Context

Asynchronous work overlaps: a table asks for page 2 and then page 3 before
page 2 answers, a select's value is assigned while the lookup of the previous
value is in flight, a dialog is updated again before the first update
delivered. Whichever answer arrives last would win if every answer were
applied, and that is often the stale one. Cancelling the work is not enough
either, because a fetch already in flight still resolves.

## Decision

Every contended resource holds a `Claims` (`src/ful/claims.mjs`, exported as
`ful.Claims` for components built outside the library). Starting a
piece of work starts a new generation, making every earlier one stale. When
the work finishes, it checks `stale` before painting chrome, storing state,
dispatching an event or throwing towards a caller: a stale result is dropped.
`hold()` joins the current generation without superseding it (a shared fetch
that a later reconfiguration must detach), and `invalidate()` makes every
generation stale without starting one that is held (a hide ending every
pending show).

One `Claims` per resource, not per component: `ful-select` holds one for its
dropdown's shows, one for its value lookups and its remote loader one for its
fetch configuration; `ful-table` one for its loads; the dialog and drawer
sections one for their updates; the async sections one per section.

## Consequences

- The last request wins, whatever order the answers arrive in, and a stale
  answer neither renders nor dispatches (0016): no `load:success` for a
  superseded page.
- A superseded caller that awaits the work is told so (the select loader
  rejects it as superseded) instead of receiving an answer for a state it no
  longer is in.
- Concurrency is reasoned about per resource. Two resources that contend
  separately hold separate `Claims`, so a new value lookup never cancels an
  open dropdown's search.
- New asynchronous work in a component starts a generation on the `Claims` of
  the resource it contends for; checking `stale` before every effect is the
  part that is easy to forget and that the tests for stale loads exist to
  catch.
