/**
 * @typedef {Object} AsyncExtension
 * @property {Promise<any>[]} promises
 * @typedef {Event & { async?: AsyncExtension }} AsyncEvent
 */
class AsyncEvents {
    /**
     * Dispatches an event and handles asynchronous resolution based on the execution mode.
     * @param {HTMLElement} el - The target element dispatching the event.
     * @param {AsyncEvent} evt - The event instance.
     * @param {{mode?: 'broadcast' | 'pipeline' | 'delegate'}} [options] - Configuration options (defaults to 'broadcast').
     * @returns {Promise<any>} Resolves with an array of values for broadcasts, a single value for pipelines/delegates, or undefined.
     */
    static async fireAsync(el, evt, options) {
        el.dispatchEvent(evt);
        const promises = evt.async?.promises ?? [];
        const mode = options?.mode ?? 'broadcast';
        if (mode === 'pipeline' && promises.length > 1) {
            throw new Error(
                `[AsyncEvents] Event "${evt.type}" is configured in 'pipeline' mode and expects at most one async listener, but ${promises.length} listeners were triggered on this element.`,
            );
        }
        if (mode === 'delegate' && promises.length !== 1) {
            throw new Error(
                `[AsyncEvents] Event "${evt.type}" is configured in 'delegate' mode and requires exactly one async listener, but ${promises.length} were registered.`,
            );
        }
        return mode === 'broadcast' ? Promise.all(promises) : Promise.resolve(promises[0]);
    }

    /**
     * Registers an asynchronous event listener wrapper.
     * @param {HTMLElement} el - The target element.
     * @param {string} type - The event name/type.
     * @param {Function} fn - The async listener middleware function returning the execution result.
     * @param {AddEventListenerOptions} [options] - Native addEventListener options.
     * @returns {EventListener} The underlying proxy listener function needed for cleanup via asyncOff.
     */
    static asyncOn(el, type, fn, options) {
        /** @type {(evt: Event) => Promise<void>} */
        const listener = async (event) => {
            const ae = /** @type {AsyncEvent} */ (event);
            if (!ae.async) {
                ae.async = { promises: [] };
            }
            const { promise, resolve, reject } = Promise.withResolvers();
            ae.async.promises.push(promise);
            try {
                resolve(await fn(ae));
            } catch (e) {
                reject(e);
            }
        };

        el.addEventListener(type, listener, options);
        return listener;
    }

    /**
     * Unregisters an asynchronous event listener proxy.
     * @param {HTMLElement} el - The target element.
     * @param {string} type - The event name/type.
     * @param {EventListener} listener - The proxy listener instance previously returned by asyncOn.
     * @param {EventListenerOptions} [options] - Native removeEventListener options.
     */
    static asyncOff(el, type, listener, options) {
        el.removeEventListener(type, listener, options);
    }

    /**
     * Mixes the asynchronous execution engine extensions into target class prototypes.
     * @param {...Function} classes - The target class constructors to decorate.
     */
    static mixInto(...classes) {
        for (const k of classes) {
            Object.assign(k.prototype, {
                /**
                 * @this {HTMLElement}
                 * @param {AsyncEvent} evt
                 * @param {{mode?: 'broadcast' | 'pipeline' | 'delegate'}} [options]
                 * @returns {Promise<any>}
                 */
                async fireAsync(evt, options) {
                    return await AsyncEvents.fireAsync(this, evt, options);
                },

                /**
                 * @this {HTMLElement}
                 * @param {string} type
                 * @param {Function} fn
                 * @param {AddEventListenerOptions} [options]
                 * @returns {EventListener}
                 */
                asyncOn(type, fn, options) {
                    return AsyncEvents.asyncOn(this, type, fn, options);
                },

                /**
                 * @this {HTMLElement}
                 * @param {string} type
                 * @param {EventListener} listener
                 * @param {EventListenerOptions} [options]
                 * @returns {void}
                 */
                asyncOff(type, listener, options) {
                    AsyncEvents.asyncOff(this, type, listener, options);
                },
            });
        }
    }
}

export { AsyncEvents };
