# 0016. State settles before events fire

Status: accepted

## Context

An event listener that reads the emitting component during the event must see
the state that caused it. Components that notify mid-mutation force listeners
into `setTimeout` dances and microtask folklore.

## Decision

Every notifying component settles its own observable state before it
dispatches: `ful-select`'s change carries badges already synced and the
control already displaying the selection; `ful-form`'s `submit:success` /
`submit:failure` carry the form released (spinner hidden, buttons no longer
held off, the submit no longer in flight) and a `Failure`'s problems shown;
`ful-table`'s `load:success` / `load:failure` carry the rows in place (the
elements in them rendered) and `aria-busy` already removed; the async
sections make the section current before asking for its content, so it shows
under its loading state while the answers are awaited, and the move or the
open settles once the union of the answers has, the loading state removed and
a failure's problems painted (0017).
Superseded work dispatches nothing at all: a stale load owns neither the
outcome nor the busy state (0021).

## Consequences

- Listeners read the component synchronously and correctly during events;
  no deferred-read folklore in consumer code.
- The ordering is a testable contract, and the suite tests it ("settles the
  table before load:success reaches its listeners").
- New events must follow it; a review question for any new dispatch is "what
  does a listener see?". What an event means and whether it can be vetoed is
  0019.
