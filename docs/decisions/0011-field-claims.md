# 0011. Fields are claims over pieces, not widget contracts

Status: accepted

## Context

Every field library reinvents the same three-way problem: a field is one host
element wrapping several pieces (label, control, error region, chips, notes),
and states like `disabled`, `readonly` and `required` must land on the right
pieces without the subclass re-implementing the routing for each new layout.

## Decision

A `Field` builds pieces and the base owns the claims. The subclass's `_build`
returns pieces: control, label, error, and declarative routing, which is
`claims` (the element the claims land on, the control by default), `also`
(elements mirroring a claim), `freeze` (elements a claim locks) and `announces`
(where `required` and `aria-invalid` announce). The base setters (`disabled`,
`readonly`, `required`, validity) drive the claims across the pieces, set
`aria-invalid` and the custom validity, and the form protocol
(`formResetCallback`, intercepted submits) is the base's too. Server-routed
problems reach the right piece through `setCustomValidity(reason, context)`.

Values are the field's own: a plain `<form>` carrying ful fields submits none
of their values, because the controls are rendered with `form=""`; the host is
the only thing that submits.

## Consequences

- Subclasses override setters only to *route*, never to re-implement: the
  failure mode review found in consumers (TMS's counterparty field) is doing
  the base's job by hand.
- Accessibility and autofill read the same structure: every field names its
  control in the markup (`label for`, or `aria-labelledby` where `for` cannot
  target it).
- The composite pattern is the extension path (wiki: Extending-fields), and a
  review of a custom field is a review of its pieces and routing, not of its
  event plumbing.
