import { Attributes, ParsedElement } from '../../ftl/index.mjs';
import { SectionRequests } from '../events/sections.mjs';

/**
 * A tab panel: one visible panel at a time, announced through the tab pattern
 * (a tablist of tab buttons, each panel a tabpanel labelled by its tab). The
 * tabs are declared as `<tab>` elements in the `tabs` slot, the panels as the
 * slotless children, paired in order. Each `<tab>` becomes a `button` with the
 * `tab` role carrying the tab's content, inside a `ful-tablist` with the
 * `tablist` role. A panel that already has an id keeps it and its tab points at
 * it; a panel without one gets a generated id. Every panel carries
 * `tabindex="0"`, so the visible one follows its tab in the tab order and the
 * hidden ones stay out of it.
 *
 * The tabs use a roving tabindex and automatic activation: a click activates
 * its tab, and on the tablist ArrowRight and ArrowLeft move to the next and
 * previous tab, wrapping around, while Home and End jump to the first and the
 * last, moving the focus with the activation.
 *
 * Entering a panel fires `section:requested` and `section:requested:#<index>`
 * on the host, bubbling, with detail `{ name: null, section, index, first }`,
 * and awaits the answers registered through `AsyncEvents.asyncOn`, so a panel
 * can deliver itself asynchronously: see `SectionRequests`.
 */
class Tabs extends ParsedElement {
    static slots = true;
    static observed = ['active:number'];
    static template = `
        <ful-tablist role="tablist">{{{{ slots.tabs }}}}</ful-tablist>
        {{{{ slots.default }}}}
    `;
    #tablist;
    #tabs = [];
    #panels = [];
    #requests = new SectionRequests();
    #active = 0;
    /**
     * Pairs the declared tabs with the panels in order. When the counts
     * differ, the unpaired tabs and panels are left in the dom as they are and
     * a warning is logged.
     * @param {{ slots: Record<string, DocumentFragment> }} conf
     * @returns {void}
     */
    render({ slots }) {
        const fragment = this.template().withOverlay({ slots }).render();
        this.#tablist = fragment.querySelector('ful-tablist');
        const declared = [...this.#tablist.children];
        this.#panels = [...fragment.children].filter((el) => el !== this.#tablist);
        if (declared.length !== this.#panels.length) {
            console.warn(
                `ful-tabs: ${declared.length} tabs declared for ${this.#panels.length} panels, the surplus is left alone`,
            );
        }
        const count = Math.min(declared.length, this.#panels.length);
        this.#tabs = [];
        for (let i = 0; i !== count; ++i) {
            const panel = this.#panels[i];
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.role = 'tab';
            tab.id = Attributes.uid('ful-tab');
            if (!panel.id) {
                panel.id = Attributes.uid('ful-tabpanel');
            }
            tab.setAttribute('aria-controls', panel.id);
            panel.role = 'tabpanel';
            panel.setAttribute('aria-labelledby', tab.id);
            panel.tabIndex = 0;
            tab.append(...declared[i].childNodes);
            tab.addEventListener('click', () => {
                this.active = i;
            });
            declared[i].replaceWith(tab);
            this.#tabs.push(tab);
        }
        this.#tablist.addEventListener('keydown', (e) => {
            const current = this.#active;
            /** @type {number|null} */
            let target = null;
            if (e.key === 'ArrowRight') {
                target = (current + 1) % this.#tabs.length;
            } else if (e.key === 'ArrowLeft') {
                target = (current - 1 + this.#tabs.length) % this.#tabs.length;
            } else if (e.key === 'Home') {
                target = 0;
            } else if (e.key === 'End') {
                target = this.#tabs.length - 1;
            }
            if (target === null || target === current) {
                return;
            }
            e.preventDefault();
            this.active = target;
            this.#tabs[target].focus();
        });
        this.replaceChildren(fragment);
    }
    /**
     * The index of the visible panel, reflected to the `active` attribute.
     * Writing it clamps the value to the paired tabs, a value that is not a
     * number counting as 0, and selects that tab and shows its panel. When the
     * index changes on a rendered element it dispatches `tabs:change` on the
     * host (not bubbling) with detail `{ active, previous }`, then fires the
     * section requests for the entered panel. The first write, which applies
     * the attribute after the render, fires the requests without the event.
     * A failed delivery paints the panel's error and rejects nowhere.
     * @type {number}
     */
    get active() {
        return this.#active;
    }
    /**
     * Fires the section requests again for a panel, whether it is visible or
     * not, with `first` false once an earlier request was answered.
     * @param {number | Element} ref the panel's index, or the panel itself
     * @returns {Promise<any[] | undefined> | undefined} a promise resolving to
     * the answers, or to undefined when nobody listened or the delivery
     * failed (its error painted in the panel); undefined, with a warning, when
     * `ref` names no panel
     */
    refresh(ref) {
        const index = ref instanceof Element ? this.#panels.indexOf(ref) : Number.isInteger(ref) ? ref : NaN;
        const panel = this.#panels[index];
        if (!panel) {
            console.warn(`ful-tabs: no panel answers to "${ref}"`);
            return undefined;
        }
        return this.#requests.request(this, panel, null, index).catch(() => undefined);
    }
    set active(v) {
        const index = Math.min(Math.max(0, Number(v) || 0), Math.max(0, this.#tabs.length - 1));
        const previous = this.#active;
        for (const [i, tab] of this.#tabs.entries()) {
            tab.setAttribute('aria-selected', i === index ? 'true' : 'false');
            tab.tabIndex = i === index ? 0 : -1;
            this.#panels[i].hidden = i !== index;
        }
        this.#active = index;
        this.reflectTo('active', index);
        if (this.rendered && index !== previous) {
            this.dispatchEvent(new CustomEvent('tabs:change', { detail: { active: index, previous } }));
        }
        if (this.#panels.length > 0 && (index !== previous || !this.rendered)) {
            this.#requests.request(this, this.#panels[index], null, index).catch(() => undefined);
        }
    }
}

export { Tabs };
