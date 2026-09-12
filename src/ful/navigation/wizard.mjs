import { ParsedElement } from '../../ftl/index.mjs';
import { SectionRequests } from '../events/sections.mjs';

/**
 * A wizard: a progress of steps over one-of-N sections, the homeinsurance
 * layout distilled. The steps are declared as <step> elements in the steps
 * slot, the sections as the slotless children, paired in order; each section
 * may carry a data-step name, which is what move() answers to. The current
 * step is the aria-current=step claim, carried in lockstep by the step and
 * its section: the chrome (including which section is shown) follows the
 * claim alone, so the markup state and the style can never disagree. The
 * progress chrome shows the current step alone by default; the progress
 * attribute picks another shape over the same claims (timeline, dots, none).
 * Entering a section
 * fires the section:requested family on it and awaits the answers, so a
 * section can deliver itself asynchronously; move() resolves when the entered
 * section is painted, and rejects when its delivery fails.
 */
class Wizard extends ParsedElement {
    static slots = true;
    static observed = ['progress'];
    static template = `
        <ful-steps><ol data-tpl-aria-label="#l10n:t('wizard.progress')">{{{{ slots.steps }}}}</ol></ful-steps>
        {{{{ slots.default }}}}
    `;
    #steps = [];
    #sections = [];
    #requests = new SectionRequests();
    #index = 0;
    #progress;
    render({ slots }) {
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
        if (count > 0) {
            //a section already carrying the claim keeps it: server-rendered state wins
            const claimed = this.#sections.findIndex((s) => s.getAttribute('aria-current') === 'step');
            this.#apply(claimed === -1 ? 0 : Math.min(claimed, count - 1));
            this.#enter(this.#index)?.catch(() => undefined);
        }
    }
    get index() {
        return this.#index;
    }
    get step() {
        return this.#sections[this.#index]?.getAttribute('data-step') ?? null;
    }
    get progress() {
        return this.#progress;
    }
    set progress(v) {
        this.#progress = v;
        this.reflectTo('progress', v);
    }
    next() {
        return this.#move(this.#index + 1);
    }
    prev() {
        return this.#move(this.#index - 1);
    }
    move(ref) {
        const index = this.#sections.findIndex((s) => s.getAttribute('data-step') === ref);
        if (index === -1) {
            console.warn(`ful-wizard: no section carries data-step="${ref}"`);
            return undefined;
        }
        return this.#move(index);
    }
    /**
     * Re-fires the section:requested family on the named section (or the
     * section element itself), whether active or not: the explicit request for a
     * content that wants refreshing. A failed refresh paints its problems,
     * nothing rejects — move() stays the rejecting call.
     */
    refresh(ref) {
        const section =
            ref instanceof Element
                ? ref
                : typeof ref === 'string'
                  ? this.#sections.find((s) => s.getAttribute('data-step') === ref)
                  : undefined;
        const index = this.#sections.indexOf(section);
        if (index === -1) {
            console.warn(`ful-wizard: no section answers to "${ref}"`);
            return undefined;
        }
        return this.#enter(index)?.then(undefined, () => undefined);
    }
    #enter(index) {
        return this.#requests.request(
            this,
            this.#sections[index],
            this.#sections[index].getAttribute('data-step'),
            index,
        );
    }
    #move(index) {
        const clamped = Math.min(Math.max(0, index), Math.max(0, this.#steps.length - 1));
        if (clamped === this.#index) {
            return undefined;
        }
        this.#apply(clamped);
        //the moving control lived in the section that just hid: focus follows
        //the step, or the reader lands on the body knowing nothing happened
        this.#sections[this.#index].focus();
        if (this.rendered) {
            this.dispatchEvent(new CustomEvent('change', { detail: { index: this.#index, step: this.step } }));
        }
        return this.#enter(clamped);
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
