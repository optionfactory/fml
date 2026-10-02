# Architecture Decision Records

Choices that constrain the whole library, with the reasoning behind each. They
are recorded here because no single file is the right place to explain them:
rationale about one piece of code belongs in a comment beside it.

| # | Decision |
|---|----------|
| 0001 | [No build step, no runtime dependencies](0001-no-build-no-runtime-deps.md) |
| 0002 | [Light DOM only, no shadow DOM](0002-light-dom.md) |
| 0003 | [Render once, then live properties](0003-render-once-then-live.md) |
| 0004 | [Cascade layer contract, `[hidden]` last](0004-css-layers.md) |
| 0005 | [Evergreen browser floor, spring 2024](0005-browser-floor.md) |
| 0006 | [Expressions are interpreted, escaping is the default](0006-templates-and-expressions.md) |
| 0007 | [Trust the page author, distrust what arrives later](0007-trust-model.md) |
| 0008 | [Two tiers of attributes: observed and configuration](0008-attribute-tiers.md) |
| 0009 | [Declarations compose base-first, re-declaration moves to the subclass](0009-declaration-composition.md) |
| 0010 | [One registry seam for elements, components and loaders](0010-registry.md) |
| 0011 | [Fields are claims over pieces, not widget contracts](0011-field-claims.md) |
| 0012 | [Localization is a flat overlay, fixed per page](0012-localization.md) |
| 0013 | [httpc answers failures, not exceptions of last resort](0013-httpc-failure-model.md) |
| 0014 | [Revision-guarded local storage, denial is a miss](0014-storage.md) |
| 0015 | [Loaders are the shared seam between views](0015-loaders.md) |
| 0016 | [State settles before events fire](0016-settled-before-events.md) |
| 0017 | [Async sections: the component awaits the union of the answers](0017-async-sections.md) |
| 0018 | [Docs and manifests are generated, or they do not ship](0018-generated-artifacts.md) |
| 0019 | [Events: platform names for platform meanings, namespaced requests and outcomes](0019-event-vocabulary.md) |
| 0020 | [Floating ui lives in the top layer](0020-top-layer.md) |
| 0021 | [Superseded work is dropped through claims](0021-claims.md) |

Status of all: accepted. Dates are enactment-agnostic; most decisions predate
this record, which writes down what the code and the wiki already say.
