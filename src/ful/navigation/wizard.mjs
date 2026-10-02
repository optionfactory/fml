import { ParsedElement } from '../../ftl/index.mjs';
import { SectionRequests } from '../events/sections.mjs';

/**
 * A wizard: a progress of steps over one-of-N sections. The steps are declared
 * as `<step>` elements in the `steps` slot, the sections as the slotless
 * children, paired in order; each section may carry a `data-step` name, which
 * is what `move()` and `refresh()` answer to. The steps become the items of an
 * `ol` inside `ful-steps`, labelled by the localized `wizard.progress`.
 *
 * The current step is the `aria-current="step"` claim, carried by the step and
 * its section together, and the stylesheet hides every `section` child that
 * does not carry it. A section that carries the claim in the markup when the
 * wizard renders stays current; otherwise the first section is. Every paired
 * section gets `tabindex="-1"`, so a move can focus it.
 *
 * Entering a section, the first one at the render included, fires
 * `section:requested`, `section:requested:#<index>` and, when the section has a
 * `data-step`, `section:requested:<name>` on the host, bubbling, with detail
 * `{ name, section, index, first }`, and awaits the answers registered through
 * `AsyncEvents.asyncOn`: see `SectionRequests`. A failure of the initial entry
 * paints the section's error and rejects nowhere.
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
    /**
     * Pairs the declared steps with the sections in order. When the counts
     * differ, the unpaired steps and sections are left in the dom as they are
     * and a warning is logged.
     * @param {{ slots: Record<string, DocumentFragment> }} conf
     * @returns {void}
     */
    render({ slots }) {
        const fragment = this.template().withOverlay({ slots }).render();
        const list = /** @type {HTMLElement} */ (fragment.querySelector('ful-steps ol'));
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
            this.#sections[i].tabIndex = -1;
        }
        this.replaceChildren(fragment);
        if (count > 0) {
            const claimed = this.#sections.findIndex((s) => s.getAttribute('aria-current') === 'step');
            this.#apply(claimed === -1 ? 0 : Math.min(claimed, count - 1));
            this.#enter(this.#index).catch(() => undefined);
        }
    }
    /**
     * The zero-based position of the current step.
     * @type {number}
     */
    get index() {
        return this.#index;
    }
    /**
     * The `data-step` of the current section, or null when it has none or no
     * section is paired.
     * @type {string | null}
     */
    get step() {
        return this.#sections[this.#index]?.getAttribute('data-step') ?? null;
    }
    /**
     * The shape of the progress chrome, reflected to the `progress` attribute:
     * unset shows the current step alone, `timeline` every step as done,
     * current or future, `dots` one dot per step, `none` no progress at all.
     * The value only drives the stylesheet; the moves are the same in every
     * shape.
     * @type {string | null}
     */
    get progress() {
        return this.#progress;
    }
    set progress(v) {
        this.#progress = v;
        this.reflectTo('progress', v);
    }
    /**
     * Moves to the following step; at the last step nothing happens.
     * @returns {Promise<any[] | undefined> | undefined} what `move()` answers
     * @throws what the entered section's delivery rejected with, as the rejection
     * of the returned promise
     */
    next() {
        return this.#move(this.#index + 1);
    }
    /**
     * Moves to the preceding step; at the first step nothing happens.
     * @returns {Promise<any[] | undefined> | undefined} what `move()` answers
     * @throws what the entered section's delivery rejected with, as the rejection
     * of the returned promise
     */
    prev() {
        return this.#move(this.#index - 1);
    }
    /**
     * Moves to the section carrying `data-step="<ref>"`. A move makes that step
     * and section current, moves the focus to the section, dispatches
     * `wizard:change` on the host (not bubbling) with detail `{ index, step }`,
     * then fires the section requests for it.
     * @param {string} ref the section's `data-step`
     * @returns {Promise<any[] | undefined> | undefined} a promise resolving to
     * the answers once they are delivered, or to undefined when nobody
     * listened; undefined when the section is already current, and undefined
     * with a warning when no section carries `ref`
     * @throws what the entered section's delivery rejected with, as the rejection
     * of the returned promise, after its error is painted in the section
     */
    move(ref) {
        const index = this.#sections.findIndex((s) => s.getAttribute('data-step') === ref);
        if (index === -1) {
            console.warn(`ful-wizard: no section carries data-step="${ref}"`);
            return undefined;
        }
        return this.#move(index);
    }
    /**
     * Fires the section requests again for a section, whether it is current or
     * not, with `first` false once an earlier request was answered.
     * @param {string | Element} ref the section's `data-step`, or the section
     * itself
     * @returns {Promise<any[] | undefined> | undefined} a promise resolving to
     * the answers, or to undefined when nobody listened or the delivery failed
     * (its error painted in the section); undefined, with a warning, when `ref`
     * names no section
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
        return this.#enter(index).catch(() => undefined);
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
        this.#sections[this.#index].focus();
        if (this.rendered) {
            this.dispatchEvent(new CustomEvent('wizard:change', { detail: { index: this.#index, step: this.step } }));
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
