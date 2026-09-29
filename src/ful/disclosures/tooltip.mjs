import { ParsedElement } from '../../ftl/index.mjs';
import { describable } from '../descriptions.mjs';
import { Anchors } from './anchors.mjs';

/**
 * An icon button that toggles a native popover, a `ful-note`, holding the
 * default slot as a short explanation. The popover gives light dismiss and
 * Escape, and the button carries an `aria-expanded` kept in step with it and
 * a localized `aria-label`.
 *
 * The marker is the `ful-icon` that `Tooltip.config.icon` names for the whole
 * page, or the one the `icon` attribute names for a single tooltip. A name the
 * library does not paint is declared by the page as
 * `ful-icon[name='...'] { mask-image: ... }`.
 *
 * `placement` picks the side of the marker the note opens on: `top` (the
 * default), `bottom`, `left` or `right`. The note is placed in script on every
 * platform, centred on the marker, clamped into the viewport and following the
 * marker on scroll and resize, with a callout on the edge facing the marker.
 *
 * `describes` offers the note to the nearest ancestor that takes a description
 * (see `describable`), a field's control in practice: when it is taken, the
 * note becomes part of that control's accessible description and the marker
 * leaves the tab order, staying clickable. When nothing takes it, the marker
 * keeps its tab stop and a warning is logged.
 */
class Tooltip extends ParsedElement {
    static slots = true;
    static attributes = ['placement', 'icon', 'describes:presence'];
    /** The page-wide defaults: `icon` is the `ful-icon` name of the marker. */
    static config = {
        icon: 'info-circle-fill',
    };
    static template = `
        <span role="button" tabindex="0" class="ful-tip" data-ref="trigger" data-tpl-aria-label="#l10n:t('info.tooltip')"><ful-icon data-tpl-name="icon ?? config.icon" aria-hidden="true"></ful-icon></span>
        <ful-note popover data-ref="content">{{{{ slots.default }}}}</ful-note>
    `;
    /**
     * @param {{ slots: Record<string, DocumentFragment> }} c
     */
    render({ slots }) {
        const fragment = this.template().withOverlay({ slots, icon: this.declared('icon') }).render();
        const trigger = /** @type {HTMLElement} */ (fragment.querySelector('[data-ref=trigger]'));
        const content = /** @type {HTMLElement} */ (fragment.querySelector('[data-ref=content]'));
        Anchors.wire(trigger, content, { prefix: 'ful-tooltip', invoke: true, expanded: true, handPlace: true });
        content.setAttribute('placement', this.declared('placement') ?? 'top');
        this.replaceChildren(fragment);
        if (this.declared('describes')) {
            Tooltip.#describe(this, trigger, content);
        }
    }
    /**
     * @param {Tooltip} tooltip
     * @param {HTMLElement} trigger
     * @param {HTMLElement} content
     */
    static #describe(tooltip, trigger, content) {
        if (!describable(tooltip)?.describedBy(content)) {
            console.warn('a ful-tooltip declares describes but stands in nothing that takes a description', tooltip);
            return;
        }
        trigger.tabIndex = -1;
    }
}

export { Tooltip };
