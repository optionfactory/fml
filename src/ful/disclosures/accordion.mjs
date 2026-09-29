import { Attributes, ParsedElement } from '../../ftl/index.mjs';

/**
 * An accordion over native `details`/`summary` disclosures: the browser
 * provides the semantics, the keyboard and the toggling, and the element adds
 * the group's styling. The `details` written as its children are rendered,
 * unchanged, inside a `ful-accordion-group`.
 */
class Accordion extends ParsedElement {
    static slots = true;
    /** @type {string[]} */
    static observed = ['exclusive:presence'];
    static template = `
        <ful-accordion-group>{{{{ slots.default }}}}</ful-accordion-group>
    `;
    #group;
    #exclusive = false;
    /**
     * @param {{ slots: Record<string, DocumentFragment> | undefined }} c
     * @returns {void}
     */
    render({ slots }) {
        const fragment = this.template().withOverlay({ slots }).render();
        this.#group = fragment.querySelector('ful-accordion-group');
        this.replaceChildren(fragment);
    }
    /**
     * Whether opening one panel closes the others, reflected to the
     * `exclusive` attribute; only `true` turns it on. Setting it gives the
     * group's direct `details` children one shared, newly generated `name`,
     * the platform's exclusive grouping, or removes their `name` when off.
     * A `details` added to the group afterwards is not named until the next
     * write.
     * @type {boolean}
     */
    get exclusive() {
        return this.#exclusive;
    }
    set exclusive(v) {
        this.#exclusive = v === true;
        this.reflectTo('exclusive', this.#exclusive);
        const name = this.#exclusive ? Attributes.uid('ful-accordion') : null;
        for (const details of this.#group.querySelectorAll(':scope > details')) {
            if (name === null) {
                details.removeAttribute('name');
            } else {
                details.setAttribute('name', name);
            }
        }
    }
}

export { Accordion };
