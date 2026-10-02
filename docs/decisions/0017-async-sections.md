# 0017. Async sections: the component awaits the union of the answers

Status: accepted

## Context

Tab panels, wizard steps and dialog bodies often need server content, but
wiring per-page fetch/replace code for each one is boilerplate, and a
declarative-only mechanism cannot express an authorization-aware or
client-cached delivery.

## Decision

Every content surface can deliver itself: entering a tab, a wizard section, or
opening a dialog/drawer fires the `section:requested` family (generic type,
zero-based `#index`, `data-step` name) on the component, the event's target
being the component itself so a host's sections are told from a nested
component's. Answer at most once per section with an async listener; the
component awaits the union of the answers. The loading ring covers the wait,
a failed delivery paints the section's problems and rejects the move, and
nobody listening is a plain activation at zero cost, so server-rendered
sections never use the mechanism at all. `refresh()` re-fires explicitly.

Dialogs and drawers carry the same shape at the top level: `update()` holds
its own open-answer-deliver cycle, and a dialog's `ask()` resolves an outcome
object (`{dismissed, result, response}`) once, when the dialog closes, which
under `close-on-submit` is its own form's `submit:success`.

## Consequences

- Pages opt into asynchrony per section; nothing forces a fetch for static
  content.
- Failure semantics are uniform (problems painted in place, movement
  rejected), which is also why loaders' `Failure` model (0013) plugs straight
  in.
- One mechanism to document and test, reused by four surfaces: tabs, wizard,
  dialog and drawer.
