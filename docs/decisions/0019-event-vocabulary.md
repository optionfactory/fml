# 0019. Events: platform names for platform meanings, namespaced requests and outcomes

Status: accepted

## Context

A component library dispatches two kinds of events that look alike and mean
opposite things: some ask the page for something (deliver a section, accept a
submit, move to a page), others report what already happened (the value
changed, the rows loaded). Listeners also need to know which events they can
veto, and whether a change they made themselves will come back to them as an
event.

## Decision

An event that means what the platform's event of that name means keeps the
platform's name: a field's `change`, `ful-form`'s `submit`, a dialog's or a
drawer's `close`. Every event of the library's own is namespaced as
`noun:verb`: `ftl:ready`, `page:requested`, `sort:requested`,
`section:requested` (with its `:#index` and `:name` variants),
`submit:requested`, `submit:success`, `submit:failure`, `load:success`,
`load:failure`, `tabs:change`, `wizard:change`.

A `:requested` event asks. The component that owns the outcome dispatches it
and either acts on it itself (a table answers its pagination's
`page:requested`) or awaits what listeners answer (`section:requested`,
`submit:requested`, 0017). It is not cancelable: the component has already
decided to ask, and an answer is how a listener takes part.

A veto is a separate event, dispatched before the action and cancelable:
`ful-form`'s `submit`, before anything is sent, whose `preventDefault()` drops
the submission as the platform's own submit does, and `dialog:dismiss` /
`drawer:dismiss`, before the close button, Escape or the backdrop closes the
dialog or the drawer, whose `preventDefault()` keeps it open. A veto exists
only for an action the user started: `close()` from code, a `data-result`
button and `close-on-submit` dispatch no dismissal, the page having decided.
Where the platform does not let the page refuse (a second Escape with no
interaction in between), the dismissal is still dispatched, not cancelable, so
a listener is never told it stopped what it did not.

Every other event reports an outcome and is not cancelable either, since what
it reports has already happened (0016). A field's `change` reports the user's
edit once it is committed, as a text input's does: a date, time or
datetime-local field reports when the control is left or Enter is pressed,
not at each segment the browser completes. Assigning `value`, `reload()` and
writing `src` dispatch nothing, and `reconfigure(…, { notify: true })` on a
select is the one explicit opt-in, for a dropped key. A navigation component reports
every move once it has rendered, whoever made it, because a move is an
outcome a listener tracks rather than an edit it would echo.

## Consequences

- A listener reads the name and knows whether it is being asked or told, and
  that `preventDefault()` matters on the vetoes alone: `submit` and the two
  dismissals.
- `tabs:change` and `wizard:change` are namespaced because a field's `change`
  bubbles out of the panels and the steps, and would arrive at the same
  listener under the same name. The dismissals are namespaced for the same
  reason: the platform's `cancel` bubbles out of a file input inside the
  dialog.
- `ful-dropdown`'s `activechange` and the document-level `show-toast` predate
  the namespacing and are not renamed: the first is internal to `ful-select`,
  the second is a page-to-library command rather than a component's event.
- A new event gets a namespaced name unless it means exactly what a platform
  event of that name means, and is cancelable only if cancelling it is the
  intended way to stop the action.
