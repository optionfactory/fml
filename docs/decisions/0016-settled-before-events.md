# 0016. State settles before events fire

Status: accepted

## Context

An event listener that reads the emitting component during the event must see
the state that caused it. Components that notify mid-mutation force listeners
into `setTimeout` dances and microtask folklore.

## Decision

Every notifying component settles its own observable state before it
dispatches: `ful-select`'s change carries badges already synced and the
control already displaying the selection; `ful-table`'s `load:success` /
`load:failure` carry the rows in place and `aria-busy` already removed; the
async sections await the union of the answers before the section activates
(0017). Superseded work dispatches nothing at all: a stale load owns neither
the outcome nor the busy state (0021).

## Consequences

- Listeners read the component synchronously and correctly during events;
  no deferred-read folklore in consumer code.
- The ordering is a testable contract, and the suite tests it ("settles the
  table before load:success reaches its listeners").
- New events must follow it; a review question for any new dispatch is "what
  does a listener see?". What an event means and whether it can be vetoed is
  0019.
