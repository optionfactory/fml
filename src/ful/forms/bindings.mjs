/** Field wiring: extracting and filling values, pinning problems to the fields they name. */
class Bindings {
    /**
     * @param {{ [x: string]: any; }} obj
     * @param {string} prefix
     * @param {Set<String>} stops
     * @return {{ [x: string]: any; }}
     */
    static flatten(obj, prefix, stops) {
        return Object.keys(obj).reduce((acc, k) => {
            const pre = prefix.length ? `${prefix}.${k}` : k;
            if (!stops.has(pre) && typeof obj[k] === 'object' && obj[k] !== null) {
                Object.assign(acc, Bindings.flatten(obj[k], pre, stops));
            } else {
                acc[pre] = obj[k];
            }
            return acc;
        }, {});
    }

    /**
     * Walking a dotted name would otherwise descend into `Object.prototype`:
     * `__proto__` passes the `typeof === 'object'` test below and becomes the
     * walk's target, so `providePath({}, '__proto__.x', v)` would write on every
     * object in the page. A field name reaching here is author markup, but it can
     * be bound from data through `data-tpl-name` and `providePath` is public, so
     * the segments that can reach the prototype chain are refused outright rather
     * than left to the caller to prove unreachable.
     */
    static #FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
    /**
     * @param {any} result
     * @param {string} path
     * @param {any} value
     */
    static providePath(result, path, value) {
        const keys = path.split('.').map((k) => (/^[0-9]+$/.test(k) ? +k : k));
        for (const key of keys) {
            if (Bindings.#FORBIDDEN.has(/** @type any */ (key))) {
                throw new Error(`unsupported name segment '${key}' in '${path}'`);
            }
        }
        let current = result ?? {};
        let previous = /** @type {any} */ (null);
        for (let i = 0; ; ++i) {
            const ckey = keys[i];
            const pkey = keys[i - 1];
            if (Number.isInteger(ckey) && !Array.isArray(current)) {
                if (previous !== null) {
                    previous[pkey] = current = [];
                } else {
                    result = current = [];
                }
            }
            if (i === keys.length - 1) {
                //when value is undefined we only want to define the property if it's not defined
                current[ckey] = value !== undefined ? value : ckey in current ? current[ckey] : null;
                return result;
            }
            //an overlapping name (a before a.b) leaves a scalar or a null here:
            //the later, more specific name rebuilds the container, exactly as the
            //reverse order always replaced the container with the scalar
            if (typeof current[ckey] !== 'object' || current[ckey] === null) {
                current[ckey] = {};
            }
            previous = current;
            current = current[ckey];
        }
    }
    /**
     *
     * @param {Element & {dataset?: any} & {checked?: boolean} & {value?: any}} el
     * @returns
     */
    static extract(el) {
        if (el.getAttribute('type') === 'radio') {
            if (!el.checked) {
                return undefined;
            }
            return el.dataset.fulBindType === 'boolean' ? el.value === 'true' : el.value;
        }
        if (el.getAttribute('type') === 'checkbox') {
            return el.checked;
        }
        if (el.dataset.fulBindType === 'boolean') {
            return !el.value ? null : el.value === 'true';
        }
        if (el.tagName === 'SELECT' && /** @type {HTMLSelectElement} */ (el).multiple) {
            return Array.from(/** @type {HTMLSelectElement} */ (el).selectedOptions).map((o) => o.value);
        }
        if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
            return el.value === '' || el.value === undefined ? null : el.value;
        }
        return el.value;
    }

    /**
     *
     * @param {HTMLFormElement} form
     * @param {HTMLElement} [submitter]
     * @returns
     */
    static extractFrom(form, submitter) {
        let result = {};
        for (const el of form.elements) {
            // we are assuming submitters are disabled during submit.
            if (!el.hasAttribute('name') || (el.matches(':disabled') && el !== submitter)) {
                continue;
            }
            result = Bindings.providePath(
                result,
                /** @type {string} */ (el.getAttribute('name')),
                Bindings.extract(el),
            );
        }
        return result;
    }

    /**
     *
     * @param {Element & {dataset?: any} & {checked?: boolean} & {value?: any}} el
     * @returns
     */
    static mutate(el, raw) {
        if (el.getAttribute('type') === 'radio') {
            //values are matched as strings, as ful-radio-group does: extract decodes
            //boolean radios, and payloads carry numbers where the attribute is text
            el.checked = raw != null && el.getAttribute('value') === String(raw);
            return;
        }
        if (el.getAttribute('type') === 'checkbox') {
            el.checked = raw;
            return;
        }
        if (el.tagName === 'SELECT' && /** @type {HTMLSelectElement} */ (el).multiple) {
            const values = Array.isArray(raw) ? raw.map(String) : raw == null ? [] : [String(raw)];
            Array.from(/** @type {HTMLSelectElement} */ (el).options).forEach((o) => {
                o.selected = values.includes(o.value);
            });
            return;
        }
        el.value = raw;
    }

    static mutateIn(form, values) {
        const names = Array.from(form.elements)
            .map((el) => el.getAttribute('name'))
            .filter((n) => n);
        for (const [flattenedKey, value] of Object.entries(Bindings.flatten(values, '', new Set(names)))) {
            for (const el of form.querySelectorAll(`[name='${CSS.escape(flattenedKey)}']`)) {
                Bindings.mutate(el, value);
            }
        }
    }

    static errors(form, es, scrollOnError) {
        //focus management announces the error of the field it lands on through
        //aria-describedby: a live region on top of that would read everything twice,
        //so the polite announcement exists only when nothing takes the focus
        form.querySelectorAll('ful-field-error').forEach((el) => {
            el.setAttribute('aria-live', scrollOnError ? 'off' : 'polite');
        });
        const pinned = (e) => (e.type === 'FIELD_ERROR' || e.type === 'INVALID_FORMAT') && e.context;
        const fieldErrors = es.filter(pinned);
        const globalErrors = es.filter((e) => !pinned(e));
        form.querySelectorAll(`[name]`).forEach((el) => {
            el.setCustomValidity?.('');
        });
        form.querySelectorAll('ful-errors').forEach((el) => {
            el.setAttribute('role', 'alert');
            el.replaceChildren();
            el.setAttribute('hidden', '');
        });
        const unmatched = [];
        fieldErrors.forEach((e) => {
            const name = e.context.replace(/\[/g, '.').replace(/\]\./g, '.').replace(/\]/g, '');
            const parts = name.split('.');
            for (let i = parts.length; i !== 0; --i) {
                const prefix = parts.slice(0, i).join('.');
                const targets = form.querySelectorAll(`[name='${CSS.escape(prefix)}']`);
                if (targets.length === 0) {
                    continue;
                }
                //the most specific name wins: the walk exists so a composite field
                //owning a whole subtree catches its inner contexts, not so an outer
                //field doubles a problem an exact one already shows. The remaining
                //path rides along ('' on an exact match), so a composite can route
                //the problem to the inner control it names
                const context = parts.slice(i).join('.');
                targets.forEach((input) => {
                    input.setCustomValidity?.(e.reason, context);
                });
                return;
            }
            //a context naming no field must not vanish: it reads in the banner
            unmatched.push(e);
        });
        const bannered = [...globalErrors, ...unmatched];
        form.querySelectorAll('ful-errors').forEach((el) => {
            const hel = /** @type HTMLElement} */ (el);
            if (bannered.length === 0) {
                hel.innerText = '';
                return;
            }
            //revealed before it is filled: a live region mutated while hidden and
            //shown afterwards is announced unreliably, the change having happened
            //where nothing was watching
            el.removeAttribute('hidden');
            hel.innerText = bannered.map((e) => e.reason).join('\n');
        });
        if (es.length === 0 || !scrollOnError) {
            return;
        }
        Array.from(form.querySelectorAll(`:invalid`))
            .sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y)[0]
            ?.focus();
    }
}

export { Bindings };
