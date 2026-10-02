# 0005. Evergreen browser floor, spring 2024

Status: accepted

## Context

Zero polyfills (0001) means the platform feature set is the support contract.
The question is which date to pin: every year of floor buys simplifications,
and every year costs users.

## Decision

The hard floor is Chrome/Edge 123 (March 2024), Firefox 125 (April 2024) and
Safari 17.5 (May 2024), the evergreen browsers of spring 2024, set by the
newest platform features the library leans on everywhere: `light-dark()`, the
Popover API, `Promise.withResolvers`, `:has()` and native CSS nesting. Below
the floor, script or styling fail outright; there is no degraded mode below it.

Two features degrade *within* the floor rather than breaking:

- the flash guard's `:state()` is Baseline slightly above the floor; below it
  the rule is dropped and a field shows for the moment between parse and render;
- anchored popovers need CSS anchor positioning (a newer floor of their own);
  where it is missing a hand-placed fallback keeps them beside their invoker,
  and never runs where the css works.

On iOS the floor reads in iOS versions: 17.5+, reachable by every iPhone from
the XS/XR (2018) onward.

## Consequences

- The floor is stated with dated features in the wiki (Getting started,
  "Browser support") so a future bump is an act of writing down new dates,
  not research. Features newer than the floor that a page may opt into (an
  import map's `integrity`) are stated there with their own versions.
- The palette is `light-dark()` over `color-scheme` and declares nothing
  itself; dark mode follows the page.
- `:has()`-anchored chrome (`*:has(> ful-control-group)`) is safe everywhere
  in the floor.
- The test matrix is current Chromium, Firefox and WebKit, which over-covers
  the floor; regressions against the floor itself would need pinning engines
  to the floor versions, which the suite does not do today.
