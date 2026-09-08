import { ParsedElement } from '../../ftl/index.mjs';

/**
 * A wizard: a progress of steps over one-of-N sections, the homeinsurance
 * layout distilled. The steps are declared as <step> elements in the steps
 * slot, the sections as the slotless children, paired in order; each section
 * may carry a data-step name, which is what move() answers to. The current
 * step is the aria-current=step claim, carried in lockstep by the step and
 * its section: the chrome (including which section is shown) follows the
 * claim alone, so the markup state and the style can never disagree.
 */
class Wizard extends ParsedElement {
    static slots = true;
    static template = `
        <ful-steps><ol data-tpl-aria-label="#l10n:t('wizard.progress')">{{{{ slots.steps }}}}</ol></ful-steps>
        {{{{ slots.default }}}}
    `;
    #steps = [];
    #sections = [];
    #index = 0;
    #ready = false;
    render({ slots, observed }) {
        const fragment = this.template().withOverlay({ slots }).render();
        const list = fragment.querySelector('ful-steps ol');
        const declared = [...list.children];
        this.#sections = [...fragment.children].filter((el) => el.localName !== 'ful-steps');
        if (declared.length !== this.#sections.length) {
            console.warn(
                `ful-wizard: ${declared.length} steps declared for ${this.#sections.length} sections, the surplus is left alone`,
            );
        }
        const count = Math.min(declared.length, this.#sections.length);
        this.#steps = [];
        for (let i = 0; i !== count; ++i) {
            const li = document.createElement('li');
            li.append(...declared[i].childNodes);
            declared[i].replaceWith(li);
            this.#steps.push(li);
            //the section is the focus target of a move: the step that just
            //became current must receive it, the button that moved it having
            //left the document with its own section
            this.#sections[i].tabIndex = -1;
        }
        this.replaceChildren(fragment);
        //a section already carrying the claim keeps it: server-rendered state wins
        const claimed = this.#sections.findIndex((s) => s.getAttribute('aria-current') === 'step');
        this.#apply(claimed === -1 ? 0 : Math.min(claimed, count - 1));
        this.#ready = true;
    }
    get index() {
        return this.#index;
    }
    get step() {
        return this.#sections[this.#index]?.getAttribute('data-step') ?? null;
    }
    next() {
        this.#move(this.#index + 1);
    }
    prev() {
        this.#move(this.#index - 1);
    }
    move(ref) {
        const index = this.#sections.findIndex((s) => s.getAttribute('data-step') === ref);
        if (index === -1) {
            console.warn(`ful-wizard: no section carries data-step="${ref}"`);
            return;
        }
        this.#move(index);
    }
    #move(index) {
        const clamped = Math.min(Math.max(0, index), this.#steps.length - 1);
        if (clamped === this.#index) {
            return;
        }
        this.#apply(clamped);
        //the moving control lived in the section that just hid: focus follows
        //the step, or the reader lands on the body knowing nothing happened
        this.#sections[this.#index].focus();
        if (this.#ready) {
            this.dispatchEvent(new CustomEvent('change', { detail: { index: this.#index, step: this.step } }));
        }
    }
    #apply(index) {
        for (const [i, step] of this.#steps.entries()) {
            if (i === index) {
                step.setAttribute('aria-current', 'step');
                this.#sections[i].setAttribute('aria-current', 'step');
            } else {
                step.removeAttribute('aria-current');
                this.#sections[i].removeAttribute('aria-current');
            }
        }
        this.#index = index;
    }
}

export { Wizard };
