# 0006. Expressions are interpreted, escaping is the default

Status: accepted

## Context

Templates need expressions over the data they render. The usual
implementations either compile to functions (which is `new Function` with extra
steps, and a CSP problem) or interpolate text (which is an injection problem).

## Decision

Template expressions (`{{ … }}`) run on a tree-walking interpreter over a PEG
grammar (`expressions-parser.peggy`): no `eval`, no `new Function`. Text
interpolation creates text nodes; attribute binding goes through `setAttribute`
and nothing more. There is no coercing equality (`==` is `===`) and no string
splicing of values into expression source: untrusted values arrive as data the
expression reads, never as expression text.

The escape hatches are explicit and few: `{{{ … }}}` assigns through
`innerHTML`, `data-tpl-attr-append` sets whatever `[name, value]` pairs the
expression carries, `Attributes.forward` forwards author attributes to inner
controls, inline handlers included. Attribute binding is `setAttribute` and
nothing more, so two ordinary bindings are sinks too: a URL attribute
(`data-tpl-href`, `data-tpl-src`, `data-tpl-formaction`) binds a `javascript:`
url as faithfully as any other, and `data-tpl-on*` binds inline handler text.
All of them take author-controlled or app-sanitized values only.

## Consequences

- The interpreter is not a sandbox: name, member and module lookups resolve
  through the prototype chain, so an expression is exactly as powerful as a
  script tag (see 0007). That is a statement about authorship, not a bug.
- Safe-by-default rendering means the hatches and the sinks are the audit
  surface; a review greps for `{{{`, `attr-append`, `data-tpl-on`, the URL
  attributes and `Attributes.forward`, and checks what reaches each. The
  README's security section states the same list for page authors.
- PEG parsing plus a compiled-attribute cache keeps repeated renders cheap
  without generated code.
