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
 *
 * The tablist stays on one line. When the tabs do not fit it scrolls sideways,
 * and a previous and a next button appear at the side that has more tabs,
 * each bringing the next hidden tab into view. They stay out of the tab order:
 * the keyboard moves through the tabs with the arrow keys. The active tab is
 * kept in view when it changes and when the tablist changes width.
 */
class Tabs extends ParsedElement {
    static slots = true;
    static observed = ['active:number'];
    static template = `
        <button type="button" class="ful-tabs-scroll" data-ref="scroll-start" tabindex="-1" hidden data-tpl-aria-label="#l10n:t('tabs.previous')"><ful-icon name="chevron-left" aria-hidden="true"></ful-icon></button>
        <ful-tablist role="tablist">{{{{ slots.tabs }}}}</ful-tablist>
        <button type="button" class="ful-tabs-scroll" data-ref="scroll-end" tabindex="-1" hidden data-tpl-aria-label="#l10n:t('tabs.next')"><ful-icon name="chevron-right" aria-hidden="true"></ful-icon></button>
        {{{{ slots.default }}}}
    `;
    #tablist;
    #scrollStart;
    #scrollEnd;
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
        this.#scrollStart = fragment.querySelector('[data-ref="scroll-start"]');
        this.#scrollEnd = fragment.querySelector('[data-ref="scroll-end"]');
        const chrome = [this.#tablist, this.#scrollStart, this.#scrollEnd];
        const declared = [...this.#tablist.children];
        this.#panels = [...fragment.children].filter((el) => !chrome.includes(el));
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
        this.#scrollStart.addEventListener('click', () => this.#scrollByOneTab(-1));
        this.#scrollEnd.addEventListener('click', () => this.#scrollByOneTab(1));
        this.#tablist.addEventListener('scroll', () => this.#showScrollButtons(), { passive: true });
        let width = -1;
        const resizes = new ResizeObserver(() => {
            this.#showScrollButtons();
            if (this.#tablist.clientWidth !== width) {
                width = this.#tablist.clientWidth;
                this.#bringIntoView(this.#tabs[this.#active], 'auto');
            }
        });
        resizes.observe(this.#tablist);
        for (const tab of this.#tabs) {
            resizes.observe(tab);
        }
        this.replaceChildren(fragment);
    }
    /**
     * Shows each scroll button only when there are tabs beyond its side, and
     * sizes both to the height of the tablist above its border.
     * @returns {void}
     */
    #showScrollButtons() {
        const list = this.#tablist;
        const overflow = list.scrollWidth - list.clientWidth;
        this.#scrollStart.hidden = list.scrollLeft <= 1;
        this.#scrollEnd.hidden = list.scrollLeft >= overflow - 1;
        this.#scrollStart.style.blockSize = this.#scrollEnd.style.blockSize = `${list.clientHeight}px`;
    }
    /**
     * The part of the tablist that no scroll button covers.
     * @returns {{ start: number, end: number }}
     */
    #visibleRange() {
        const view = this.#tablist.getBoundingClientRect();
        return { start: view.left + this.#scrollStart.offsetWidth, end: view.right - this.#scrollEnd.offsetWidth };
    }
    /**
     * Scrolls the tablist so that the first tab cut by the side the direction
     * points to is wholly visible.
     * @param {1 | -1} direction 1 towards the end, -1 towards the start
     * @returns {void}
     */
    #scrollByOneTab(direction) {
        const { start, end } = this.#visibleRange();
        const target =
            direction > 0
                ? this.#tabs.find((tab) => tab.getBoundingClientRect().right > end + 1)
                : this.#tabs.findLast((tab) => tab.getBoundingClientRect().left < start - 1);
        this.#bringIntoView(target, matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
    }
    /**
     * Scrolls the tablist, and only the tablist, the least needed to show a tab
     * wholly.
     * @param {HTMLElement | undefined} tab
     * @param {ScrollBehavior} behavior
     * @returns {void}
     */
    #bringIntoView(tab, behavior) {
        if (!tab) {
            return;
        }
        const { start, end } = this.#visibleRange();
        const box = tab.getBoundingClientRect();
        const delta = box.right > end ? Math.ceil(box.right - end) : box.left < start ? Math.floor(box.left - start) : 0;
        if (delta !== 0) {
            this.#tablist.scrollBy({ left: delta, behavior });
        }
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
        this.#bringIntoView(this.#tabs[index], 'auto');
        if (this.rendered && index !== previous) {
            this.dispatchEvent(new CustomEvent('tabs:change', { detail: { active: index, previous } }));
        }
        if (this.#panels.length > 0 && (index !== previous || !this.rendered)) {
            this.#requests.request(this, this.#panels[index], null, index).catch(() => undefined);
        }
    }
}

export { Tabs };
