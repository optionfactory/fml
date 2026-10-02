# 0002. Light DOM only, no shadow DOM

Status: accepted

## Context

Shadow DOM buys style encapsulation at the cost of a second document: forms do
not cross it, autofill and accessibility tooling degrade around it, and page
authors cannot restyle what they cannot reach without a slot-and-part protocol
for every piece.

## Decision

Every element renders into the light DOM: its `render()` builds a fragment
and the element adopts it as its own children (`replaceChildren`). No element ever
calls `attachShadow`. Structure is carried by style-only tags
(`ful-control-group`, `ful-affix`, `ful-control`, `ful-icon`, `ful-badge`,
`ful-note`, `ful-table-wrapper`, …) that carry no behavior, and the chrome
anchors on whoever hosts its pieces (`*:has(> ful-control-group)`), never on a
tag enumeration, so a subclass under any tag keeps the look and foreign markup
built from the same tags picks it up too.

## Consequences

- Page CSS reaches everything with ordinary selectors; theming is custom
  properties plus cascade layers (0004) instead of shadow parts.
- Fields live in the page's form: a `ful-form` intercepts the submit and reads
  them, since a plain `<form>` would submit none of their values.
- Content renders before the element upgrades (server-rendered markup is
  visible as-is), and the flash guard is a `:state(rendered)` rule rather than
  shadow-boundary opacity.
- Accessibility relationships (`label for`, `aria-controls`) stay native
  document relationships; no `aria-labelledby` bridging across roots.
