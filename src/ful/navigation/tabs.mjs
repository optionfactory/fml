import { Attributes, ParsedElement } from '../../ftl/index.mjs';
import { SectionRequests } from '../events/sections.mjs';

/**
 * A tab panel: one visible panel at a time, announced through the tab pattern
 * (a tablist of tab buttons, each panel a tabpanel named by its tab). The tabs
 * are declared as <tab> elements in the tabs slot, the panels as the slotless
 * children, paired in order. Entering a panel fires the section:requested
 * family on it (generic and #index, panels being nameless) and awaits the
 * answers, so a panel can deliver itself asynchronously.
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
            //an author-named panel keeps its name: the wiring adopts it
            if (!panel.id) {
                panel.id = Attributes.uid('ful-tabpanel');
            }
            tab.setAttribute('aria-controls', panel.id);
            panel.role = 'tabpanel';
            panel.setAttribute('aria-labelledby', tab.id);
            //the visible panel joins the tab order: keyboard and reader users
            //reach its content right after its tab, hidden ones stay out
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
    get active() {
        return this.#active;
    }
    /**
     * Re-fires the section:requested family on the panel (by index or the
     * panel element itself), whether active or not: the explicit request for a
     * content that wants refreshing. A failed refresh paints its problems,
     * nothing rejects — there is no caller to reject towards.
     */
    refresh(ref) {
        const index = ref instanceof Element ? this.#panels.indexOf(ref) : Number.isInteger(ref) ? ref : NaN;
        const panel = this.#panels[index];
        if (!panel) {
            console.warn(`ful-tabs: no panel answers to "${ref}"`);
            return undefined;
        }
        return this.#requests.request(this, panel, null, index)?.then(undefined, () => undefined);
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
            this.dispatchEvent(new CustomEvent('change', { detail: { active: index, previous } }));
        }
        if (this.#panels.length > 0 && (index !== previous || !this.rendered)) {
            //the activation is the reader's own gesture: the chrome reports a
            //failed delivery, there is no caller to reject towards
            this.#requests.request(this, this.#panels[index], null, index)?.catch(() => undefined);
        }
    }
}

export { Tabs };
