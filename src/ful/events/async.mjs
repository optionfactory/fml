/**
 * @typedef {Object} AsyncExtension
 * @property {Promise<any>[]} promises one per `asyncOn` listener the event
 * reached, in the order they ran
 * @typedef {Event & { async?: AsyncExtension }} AsyncEvent
 */
/**
 * Dispatching an event and waiting for what its listeners answer. A listener
 * registered through `asyncOn` attaches its promise to the event, and
 * `fireAsync` resolves once they have all settled: `broadcast` collects every
 * answer, `pipeline` allows at most one, `delegate` requires exactly one.
 */
class AsyncEvents {
    /**
     * Dispatches `evt` on `el` synchronously, then waits for the answers of the
     * `asyncOn` listeners it reached, on `el` or, for a bubbling event, on its
     * ancestors. Listeners added with a plain `addEventListener` run but are not
     * awaited. In `broadcast` mode, the default, it resolves with every answer
     * in the order the listeners ran, an empty array when none did. In
     * `pipeline` mode it accepts at most one listener and resolves with its
     * answer, or undefined when none ran. In `delegate` mode it requires exactly
     * one listener and resolves with its answer.
     * @param {HTMLElement} el the element to dispatch on
     * @param {AsyncEvent} evt the event to dispatch
     * @param {{mode?: 'broadcast' | 'pipeline' | 'delegate'}} [options]
     * @returns {Promise<any>} the answer or answers as the mode describes
     * @throws what the first answer to fail threw or rejected with; or an
     * Error naming the event and the mode when `pipeline` reached more than one
     * listener or `delegate` did not reach exactly one, in which case the
     * listeners have already run and their outcome is discarded. Both arrive as
     * the rejection of the returned promise.
     */
    static async fireAsync(el, evt, options) {
        el.dispatchEvent(evt);
        const promises = evt.async?.promises ?? [];
        const mode = options?.mode ?? 'broadcast';
        if ((mode === 'pipeline' && promises.length > 1) || (mode === 'delegate' && promises.length !== 1)) {
            Promise.all(promises).catch(() => {});
            throw new Error(
                mode === 'pipeline'
                    ? `[AsyncEvents] Event "${evt.type}" is configured in 'pipeline' mode and expects at most one async listener, but ${promises.length} listeners were triggered on this element.`
                    : `[AsyncEvents] Event "${evt.type}" is configured in 'delegate' mode and requires exactly one async listener, but ${promises.length} were registered.`,
            );
        }
        return mode === 'broadcast' ? Promise.all(promises) : Promise.resolve(promises[0]);
    }

    /**
     * Adds a listener whose answer `fireAsync` can await. When the event
     * reaches it, the listener attaches a promise to `evt.async.promises`,
     * creating the list when it is the first, then calls `fn` with the event;
     * the promise settles with what `fn` returns or throws, awaited when it is a
     * promise. The event is dispatched the usual way, so an event fired with a
     * plain `dispatchEvent` runs `fn` too, and nobody awaits its answer.
     * @param {HTMLElement} el the element to listen on
     * @param {string} type the event type
     * @param {(evt: any) => any} fn called with the event; its result is the answer
     * @param {AddEventListenerOptions} [options] passed to `addEventListener`
     * @returns {EventListener} the listener actually added, which `asyncOff` takes
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
     * Removes a listener added by `asyncOn`.
     * @param {HTMLElement} el the element it listens on
     * @param {string} type the event type it was added for
     * @param {EventListener} listener what `asyncOn` returned, not the `fn` given to it
     * @param {EventListenerOptions} [options] passed to `removeEventListener`
     * @returns {void}
     */
    static asyncOff(el, type, listener, options) {
        el.removeEventListener(type, listener, options);
    }
    /**
     * Assigns `fireAsync(evt, options)`, `asyncOn(type, fn, options)` and
     * `asyncOff(type, listener, options)` onto each class's prototype, each
     * calling the static of the same name with the instance as the element.
     * Members of those names already on the prototype are overwritten.
     * @param {...Function} classes the classes to extend
     * @returns {void}
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
                 * @param {(evt: any) => any} fn
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
