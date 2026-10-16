/**
 * Asks before the page is left, through the browser's own `beforeunload`
 * prompt.
 */
class PageLeave {
    /**
     * Asks before the page is left while `isDirty()` answers true, until
     * `signal` aborts. The browser words the prompt, and asks only once the
     * user has interacted with the page.
     * @param {() => boolean} isDirty
     * @param {AbortSignal} [signal]
     */
    static guard(isDirty, signal) {
        window.addEventListener(
            'beforeunload',
            (evt) => {
                if (isDirty()) {
                    evt.preventDefault();
                }
            },
            { signal },
        );
    }
}

export { PageLeave };
