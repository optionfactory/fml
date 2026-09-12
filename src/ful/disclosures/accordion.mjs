import { Attributes, ParsedElement } from '../../ftl/index.mjs';

/**
 * An accordion over native details/summary disclosures: the platform carries
 * the semantics, the keyboard and the toggling, the chrome paints the group.
 * With the exclusive claim the render assigns one shared name to every panel,
 * which is the platform's own exclusive grouping: opening one closes the others.
 */
class Accordion extends ParsedElement {
    static slots = true;
    static observed = ['exclusive:presence'];
    static template = `
        <ful-accordion-group>{{{{ slots.default }}}}</ful-accordion-group>
    `;
    #group;
    #exclusive = false;
    render({ slots }) {
        const fragment = this.template().withOverlay({ slots }).render();
        this.#group = fragment.querySelector('ful-accordion-group');
        this.replaceChildren(fragment);
    }
    get exclusive() {
        return this.#exclusive;
    }
    set exclusive(v) {
        this.#exclusive = v === true;
        this.reflect(() => {
            this.toggleAttribute('exclusive', this.#exclusive);
        });
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
