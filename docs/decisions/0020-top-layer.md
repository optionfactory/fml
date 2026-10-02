# 0020. Floating ui lives in the top layer

Status: accepted

## Context

Dropdowns, menus, notes and toasts have to show above the page whatever
contains them. Positioning them with `position: absolute` and `z-index`
breaks as soon as an ancestor clips (`overflow`) or stacks (`transform`,
`z-index`), and a modal dialog sits in the browser's top layer, above every
fixed element whatever its `z-index`.

## Decision

Everything that floats is a native popover or a modal dialog, so it is drawn
in the top layer and no ancestor can clip it:

- `ful-select`'s `ful-dropdown`, a manual popover the select opens and closes;
- the filters' operator, sensitivity and boolean menus, and `ful-menu`, auto
  popovers with light dismiss;
- `ful-tooltip`'s `ful-note`, an auto popover;
- the `ful-toasts` region, a manual popover whatever `popover` the page
  declared, shown again on every toast so it is the most recent entry in the
  top layer, above a dialog or drawer opened before it;
- `ful-dialog` and `ful-drawer`, `<dialog>` elements opened with
  `showModal()`.

An anchored popover is placed by `Anchors`: `wire(invoker, popover)` pairs it
with its invoker for life and relies on css anchor positioning, placing it in
script only where the platform lacks it or the caller asks for it; `show`
places a popover once beside an element or a rectangle (0005).

## Consequences

- No `z-index` scale to maintain and no portal: a popover stays where its
  markup is, inside its component, and the platform decides what is on top.
- The top layer's own rules apply. While a modal is open the page outside it
  is inert, a toast region included: a toast raised over a drawer is read,
  retires on its timer, and its buttons answer once the modal closes.
- An auto popover closes the other auto popovers that are not its ancestors
  when it opens, so the toast region is manual: a menu opening must not take
  the toasts with it.
- New floating ui is a popover or a dialog, placed through `Anchors`, never a
  positioned element with a `z-index`.
