/**
 * Something that adds elements to the accessible description of the control it
 * owns, such as a field: `describedBy(el)` adds `el` to the control's
 * `aria-describedby` and answers whether it did.
 * @typedef {{ describedBy(el: HTMLElement): boolean }} Describable
 */

/**
 * The nearest ancestor of `el` that has a `describedBy` method. Content
 * slotted inside a field does not write the control's `aria-describedby`
 * itself: once it has something to offer, it hands the element carrying the
 * words to the `describedBy` of the ancestor this answers.
 * @param {Element} el
 * @returns {(Element & Describable) | null} null when no ancestor has one
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
