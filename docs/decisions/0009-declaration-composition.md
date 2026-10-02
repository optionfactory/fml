# 0009. Declarations compose base-first, re-declaration moves to the subclass

Status: accepted

## Context

Subclasses re-declare attributes their base already declares, usually to change
the mapper (`value:csv` on a select re-typing the base field's plain `value`).
Two questions follow: which mapper wins, and, since the base applies declared
state to properties in declaration order, when does the property land?

## Decision

`Registry.declarationsOf` walks the prototype chain and concatenates the
`static observed`/`static attributes` arrays of every class in it, base first.
When the registry defines the element it deduplicates the observed names over
the reversed list, so a name a subclass re-declares takes the subclass's
position, and the later declaration's mapper wins. The applied order is: base
declarations in base order, then subclass declarations in subclass order,
re-declared names at their subclass position with the subclass's mapper.

This is how a field whose value setter reads its own shape attributes declares
that its value lands after them: `Select` re-declares `value:csv` after
`multiple:presence`, so `value` is applied once the shape is known.

## Consequences

- Value/shape ordering is declared, not accidental; a subclass that needs a
  property applied late re-declares it late.
- Re-declaring is also the mapper-override mechanism; the two effects travel
  together and should be understood together.
- The composition rule is stated in `declarationsOf`'s JSDoc and pinned by
  the registry suite ("moves a re-declared name to the position of its last
  declaration"); anything that changes it changes every subclass that relies
  on re-declared positioning, and that test is the tripwire.

## Rejected alternative: let a re-declaration keep the base's position

A second placement mode (re-declare for the mapper while keeping the base's
position, expressed in the attribute grammar as `value:csv@base` or similar)
was considered and rejected: it is a knob with no observable use case.

Placement is observable only when one property's setter reads another, and in
every such case the wanted position is the later one, which the rule already
gives. When order does not matter the move is invisible, so the base-position
mode could only ever preserve behavior nobody can see: a no-op
indistinguishable from a mistake, and a second way to say what one syntax
already says, against the library's posture of strict, single-vocabulary
declarations (`declared()` errors on an unknown name rather than guessing).

The one ordering the automatic move can appear to break is covered without new
syntax: a subclass that re-declares `a` for its mapper *and* declares `b`
whose setter reads `a` controls the segment it owns, because
`declarationsOf` preserves each class's array order: writing
`static observed = ['a:csv', 'b']` applies `a` before `b`. A subclass never
needs to reach back into the base's order; it declares its own.
