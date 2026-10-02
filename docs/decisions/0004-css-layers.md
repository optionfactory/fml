# 0004. Cascade layer contract, `[hidden]` last

Status: accepted

## Context

A component library that ships unlayered styles forces consumers into
specificity arms races: every override must out-specify the library's own
selectors, and `!important` becomes the only reliable win. Separately, an
author rule like `ful-empty { display: block }` defeats the platform's
`[hidden]`, because any author declaration beats the user-agent stylesheet.

## Decision

Everything fml ships lives in cascade layers, declared in this order:

```css
@layer ful.theme, ful.components, ful.hidden;
```

That is the whole override contract. A page rule written **outside** any layer
wins over every rule fml ships, whatever its specificity, so overriding takes a
plain selector. A page that layers its own styles decides by declaration order:
a layer named after `ful.hidden` wins, one before `ful.theme` loses.
`ful.hidden` is last so `[hidden]` beats the chrome that would otherwise lay an
element out (the job `!important` used to do), while remaining a plain
declaration a page can still beat with an ordinary unlayered rule. The
visually-hidden rules (`.ful-sr-only`, and a `ful-sr-label` field's label) sit
there too, for the same reason: they must win over the component chrome of
whatever they hide.

Two page-wide defaults ship in layers on purpose (`box-sizing: border-box`,
`[hidden]` is hidden), so one unlayered rule turns either off.

## Consequences

- `theme.css` owns the layer statement and must load first; consumers that
  declare layers name theirs relative to the three.
- Component css never needs `!important`; new chrome must respect that
  `ful.components` loses to `ful.hidden` (see `ful-empty` and every popover).
- The pre-render flash guards are tag-based only because they predate the
  render; they key on `:state(rendered)`, not `:defined`.
