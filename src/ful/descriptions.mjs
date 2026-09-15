/**
 * The protocol by which content standing inside a field becomes part of the
 * accessible description of that field's control.
 *
 * A field owns its control's `aria-describedby`: it is the only thing that
 * knows which element the description belongs on, and it already writes the
 * entry for its own error region. Content the author slotted into the field
 * cannot write that attribute itself without becoming a second owner of it, and
 * it cannot be wired by the field either, because a slotted custom element
 * renders after the field has mounted and has nothing to point at when the
 * field looks.
 *
 * So the content asks, once it has something to offer. `describable(el)`
 * answers the nearest ancestor that accepts a description, and the caller hands
 * its element to that ancestor's `describedBy`, which answers whether it was
 * taken. Nothing here names a field or a tooltip: the relation is expressed as
 * a capability, so the two ends need not import each other, which matters
 * because the library's own arrow runs from the forms to the disclosures.
 *
 * The lookup lives here rather than at its one call site so the protocol has a
 * name, a place to be documented and a single definition to change.
 */

/**
 * @typedef {{ describedBy(el: HTMLElement): boolean }} Describable
 */

/**
 * The nearest ancestor of `el` that accepts elements into the description of
 * whatever it considers its control, or null when nothing in the ancestry does.
 * @param {Element} el
 * @returns {(Element & Describable) | null}
 */
const describable = (el) => {
    for (let at = el.parentElement; at; at = at.parentElement) {
        if (typeof (/** @type {any} */ (at).describedBy) === 'function') {
            return /** @type {any} */ (at);
        }
    }
    return null;
};

export { describable };
