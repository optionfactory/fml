# 0001. No build step, no runtime dependencies

Status: accepted

## Context

A frontend library that requires a bundler to evaluate cannot be dropped into a
server-rendered page, and every runtime dependency imports its own release
cadence, its own vulnerabilities and its own breakage into every consumer.

## Decision

fml ships as plain ES modules, and as IIFE bundles of the same code for a
classic `<script>` tag: per library (`ftl`, `httpc`, `ful`, `client-errors`) or
all of them in `fml.iife.min.js`. Either loads with one tag and no
transpilation. `package.json` declares
zero runtime dependencies; everything in `devDependencies` is build- or
test-time only. The distributed `dist/ful.css` is self-contained: no bootstrap,
no icon fonts, no javascript dependencies.

## Consequences

- Pages adopt it by referencing `dist/` assets; the wiki examples run from
  static html files with no toolchain.
- Platform features are used directly rather than polyfilled (see 0005), which
  is what makes the dated browser floor necessary.
- The library owns every line that runs in the page, which is also a promise:
  nothing arrives transitively.
- Icon glyphs are vendored as inline SVG masks (bootstrap-icons 1.11.3, MIT)
  rather than taken from a font package.
