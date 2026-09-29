import { Failure } from '../../httpc/index.mjs';
import { Claims } from '../claims.mjs';

/**
 * The section requests shared by ful-tabs, ful-wizard, ful-dialog and
 * ful-drawer. Each activation of a section fires a family of events on the host
 * component and waits for the answers that listeners registered through
 * `AsyncEvents.asyncOn` attach to them. The events target the component, so
 * `e.target.localName` names the family and `e.target === e.currentTarget`
 * separates a host's own sections from those of a nested component, while
 * `detail.section` is the element the content goes in.
 *
 * While an answer is pending, from the next animation frame, the section
 * carries the `loading` attribute and `aria-busy="true"`; answers that settle
 * before that frame show neither. A new request for the same section
 * supersedes the one in flight, which then no longer touches the section's
 * chrome. A failure removes the section's previous error and prepends a
 * `.ful-section-error` with the `alert` role, holding the reasons of the
 * failure's problems, one per line, or its message when it carries none.
 */
class SectionRequests {
    /** @type {WeakSet<Element>} */
    #entered = new WeakSet();
    /** @type {WeakMap<Element, Claims>} */
    #claims = new WeakMap();

    /**
     * Fires `section:requested`, then `section:requested:#<index>` when an index
     * is given, then `section:requested:<name>` when a name is given, each
     * bubbling from `host` with the same detail `{ name, section, index, first }`,
     * and awaits every answer attached to any of them. `first` is true until a
     * request for the section is answered by at least one listener, so a request
     * nobody listened to does not spend it. A request with answers removes the
     * error a previous failure painted before it waits.
     * @param {Element} host the component the events are dispatched on
     * @param {Element} section the element the answers deliver into
     * @param {string|null} name the section's `data-step`, when it has one
     * @param {number|null} index the section's zero-based position, when it has one
     * @returns {Promise<any[]|undefined>} the answers in the order they were
     * attached, or undefined when nobody listened
     * @throws what the first failing answer rejected with, after painting its
     * problems in the section unless a newer request superseded this one
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

    /**
     * @param {Element} section
     * @param {unknown} cause
     */
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
