# 0018. Docs and manifests are generated, or they do not ship

Status: accepted

## Context

Hand-written element references rot: attributes drift from the mappers,
examples stop running, IDE metadata goes stale. The wiki is a separate repo
with its own cadence, which makes silent rot the default outcome.

## Decision

Everything derived is generated in the same working session as the code it
derives from: `manifest/metadata.json` (the human-edited source of attribute,
slot and event prose) builds `custom-elements.json`, `web-types.json` and
`vscode.html-custom-data.json` for IDE support; `wiki-reference.mjs` regenerates
the wiki's element reference from it; `wiki-examples.mjs` verifies that the
wiki's examples run; `wiki-screenshots.mjs` regenerates the pictures. The tags,
attribute names, types and slots in those artifacts are introspected from the
built bundle, so only the prose is written by hand, and
`test/manifest/metadata.test.mjs` fails when the prose and the declarations
disagree. The whole gate is `npm run verify` (lint, types, build, tests), and
publishing runs it as `prepublishOnly`.

Tests hold the same posture: three engines, and assertions on geometry and
computed style rather than only on properties, because a component library's
contract includes its layout. Accessibility is audited in the suite (axe), and
the palette's contrast ratios are computed by a test, not asserted by eye.
Every chai assertion carries a message stating the expectation, so a failure
reads as the contract it broke.

## Consequences

- A PR that changes an element and not its metadata is incomplete by
  definition; the generated artifacts are the diff that shows it.
- The wiki can lag rc-phase features (it has); the generated reference is the
  recovery path: regenerate rather than hand-patch.
- The cost is a manifest pipeline a contributor must know about; the `docs/decisions`
  you are reading is deliberately *not* generated, because decisions do not
  derive from anything.
