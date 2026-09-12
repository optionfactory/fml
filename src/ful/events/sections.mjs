import { Failure } from '../../httpc/index.mjs';
import { Claims } from '../claims.mjs';

/**
 * The async section machinery shared by ful-tabs, ful-wizard, ful-dialog and
 * ful-drawer: every activation of a section fires the section:requested family
 * on the host component (bubbling: the generic type, the #index type, and the
 * data-step name when present) and awaits the union of the answers, wherever
 * they were registered. The event's target is the component, whose local name
 * telling the family, e.target === e.currentTarget separating a host's own
 * sections from a nested component's, while detail.section stays the write
 * target. No listener is a plain pass-through, and the first-entry flag is not
 * even spent, so a listener attached later still sees the first activation. A
 * pending answer shows the loading chrome a frame late (answers that never
 * pend never flash) and declares the section aria-busy; a delivery superseded
 * by a newer activation of the same section owns no chrome; a rejection paints
 * the section's error chrome, replacing whatever a previous answer had
 * painted, and travels to the caller.
 */
class SectionRequests {
    #entered = new WeakSet();
    /** one generation of claims per section: the sections contend separately */
    #claims = new WeakMap();

    /**
     * @param {Element} host
     * @param {Element} section
     * @param {string|null} name
     * @param {number|null} index
     * @returns {Promise<any[]|undefined>} the union of the answers, or undefined when nobody listened
     */
    async request(host, section, name, index) {
        const first = !this.#entered.has(section);
        const detail = { name, section, index, first };
        const types = [
            'section:requested',
            ...(index !== null && index !== undefined ? [`section:requested:#${index}`] : []),
            ...(name ? [`section:requested:${name}`] : []),
        ];
        const promises = [];
        for (const type of types) {
            const evt = /** @type {CustomEvent & { async?: { promises: Promise<any>[] } }} */ (
                new CustomEvent(type, { bubbles: true, detail })
            );
            host.dispatchEvent(evt);
            promises.push(...(evt.async?.promises ?? []));
        }
        if (promises.length === 0) {
            return undefined;
        }
        this.#entered.add(section);
        let claims = this.#claims.get(section);
        if (!claims) {
            claims = new Claims();
            this.#claims.set(section, claims);
        }
        const claim = claims.take();
        const owned = () => !claim.stale;
        section.querySelector(':scope > .ful-section-error')?.remove();
        const frame = requestAnimationFrame(() => {
            if (owned()) {
                section.toggleAttribute('loading', true);
                section.setAttribute('aria-busy', 'true');
            }
        });
        try {
            return await Promise.all(promises);
        } catch (cause) {
            if (owned()) {
                this.#paintError(section, cause);
            }
            throw cause;
        } finally {
            cancelAnimationFrame(frame);
            if (owned()) {
                section.toggleAttribute('loading', false);
                section.removeAttribute('aria-busy');
            }
        }
    }

    #paintError(section, cause) {
        section.querySelector(':scope > .ful-section-error')?.remove();
        const error = document.createElement('div');
        error.className = 'ful-section-error';
        error.setAttribute('role', 'alert');
        error.textContent = Failure.problemsText(cause);
        section.prepend(error);
    }
}

export { SectionRequests };
