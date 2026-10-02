# 0008. Two tiers of attributes: observed and configuration

Status: accepted

## Context

Web component attributes traditionally serve two masters: some are live state
(the author and the page both write them at any time), others are build-time
configuration the element reads once and honoring later writes would only
create half-implemented states.

## Decision

Declarations come in two tiers, both declared statically:

- `static observed` attributes become **properties** once the render is done;
  from then on an attribute write forwards to the property and back through
  reflection. They are live state (`value`, `disabled`, `multiple`).
- `static attributes` are **configuration**: read once at upgrade into a frozen
  snapshot, never becoming properties, never re-read.

`declared(name)` answers a configuration name from the frozen snapshot for the
element's whole life. It answers an observed name from the snapshot while the
render is pending (kept open to attribute writes landing in that window) and
from the live attribute afterwards, the property being live by then. Asking
for a name neither tier declared is an error that says so: content an element
does not own (a custom loader's own knobs) is read with `getAttribute`, the
platform's own answer.

The snapshot exists rather than a live read of the dom because an element may
write its own observed attributes while it renders (a reflection, or a value
the platform normalizes on the way in), and what the author *declared* is what
the base applies, not what the render left behind.

Which tier an attribute belongs to follows from whether the page needs to
change it while the element lives, not from what it configures. A table's or a
select's `src` and `method` configure its loader, yet a page follows a
selection by pointing the table at another url, so they are observed: the
setter builds the loader again through the same component and reloads, and
`reconfigure({ src, method })` writes both with one rebuild and one load.
`page-size` is observed for the same reason. The rest of a select's loader
configuration (`mode`, `revision`, the `*-expr` mappings, `response-mapper`)
stays in the frozen tier.

Every multiword attribute is spelled with a dash (`max-file-size`,
`item-list`, `clear-invalid-on-change`), and an observed one drives the
camelCase property `Registry.propertyOf` names by the rule `dataset` applies
(`maxFileSize`). Only that direction is mapped: a setter reflects through
`reflectTo`, naming the attribute it writes.

## Consequences

- Authors get a hard line: change state through the property or the observed
  attribute, change configuration by re-creating the element. Moving an
  attribute from the frozen tier to the live one is a feature with a setter
  to write, never a change of mapper.
- Setters driven by configuration (`InFilter` reading `operator`, `Input`
  reading `type`) read it through `declared()`, which works before, during and
  after the render via the snapshot.
- The error message on an undeclared name teaches the tiers instead of
  mysteriously failing.
- A squashed multiword name (`itemlist`) is a naming bug, not a style choice:
  the 9.0 migration renamed every one of them.
