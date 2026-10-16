# 0022. Unsaved edits are the user's edits, not a difference from a snapshot

Status: accepted

## Context

A form that warns about unsaved edits (a dot on its save button, a prompt
before the page is left) has to tell what the user changed from everything
else that moves a value or a control after the page loaded: a select dropping
a key its vocabulary no longer knows, a section delivering its fields when its
tab is entered, a field filled by the page after a fetch. Comparing the values
with a snapshot taken at some moment counts all of those as edits, and every
new component that loads late adds a false positive. The platform's own dirty
value flag does not help either: a script assigning `value` sets it too.

## Decision

Under `track-changes` a `ful-form` counts as edited only the controls that
reported an edit since the last commit, and an edit is what 0019 already
defines as one: an `input` or a `change` bubbling from a named control of this
form. Assigning `value`, `reload()`, writing `src` and delivering a section
report nothing, so they are not edits, whatever their timing. The form is
dirty while an edited name holds values other than the committed ones, so an
edit undone is clean again; a name the commit did not see compares with its
values when it was first focused.

The form commits once its fields have rendered and after each successful
submit, with the values that submit sent, before `submit:success` is
dispatched (0016). A page commits a save of its own with `commit()`, and
reports a value it writes on the user's behalf with `edited(el)`.

## Consequences

- A component that loads late, or that the library does not know about, needs
  nothing to stay out of the count: following 0019 is enough.
- A component that changes its value or its structure because of the user
  (rows added or removed in a composite field) must dispatch `change`, as 0019
  already asks; one that does not goes unnoticed rather than breaking anything.
- "Dirty" here means "edited by the user and not saved", deliberately not the
  platform's dirty value flag.
- The values are compared through `Bindings.extract`, so a file field compares
  the names of its files: picking another file with the same name is not seen.
