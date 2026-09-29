/**
 * Moves values between a form's named controls and a nested object, and pins
 * problems onto the controls they name. Works on any native form, not only
 * the one inside a `ful-form`. Every method reads the controls through
 * `form.elements`, so a control in the subtree that belongs to another form
 * (a nested form, a `form` attribute pointing elsewhere) is never read,
 * written or marked.
 */
class Bindings {
    /**
     * Flattens a nested object into dotted keys, array indexes becoming numeric
     * segments (`a.0.b`). It does not descend below a key that `stops` names, so
     * with a field named `address` the whole object is kept under `address`,
     * while with one named `address.city` the leaf is kept under `address.city`.
     * A null value is kept as a leaf.
     * @param {{ [x: string]: any; }} obj
     * @param {string} prefix prepended to every key, `''` at the root
     * @param {Set<string>} stops the dotted keys to keep whole
     * @returns {{ [x: string]: any; }} a flat object keyed by dotted path
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

    static #FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
    /**
     * Writes a value into an object at a dotted path, creating the intermediate
     * objects and arrays the path implies: a numeric segment makes its container
     * an array. Brackets are not parsed, so `a[0]` is a plain key.
     *
     * An undefined value declares the path without filling it: an entry already
     * there is kept, a missing one is set to null. A scalar or a null left on the
     * path by a shorter overlapping name (`a` written before `a.b`) is replaced
     * by a container, so the longer name wins whichever order they arrive in.
     * @param {any} result the object or array to write into
     * @param {string} path a dotted name such as `a.b` or `a.0.b`
     * @param {any} value
     * @returns {any} the root written into, to be used in place of `result`: a
     * new array replaces it when the first segment is numeric and `result` is
     * not an array
     * @throws {Error} when a segment is `__proto__`, `prototype` or `constructor`,
     * before anything is written
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
                current[ckey] = value !== undefined ? value : ckey in current ? current[ckey] : null;
                return result;
            }
            if (typeof current[ckey] !== 'object' || current[ckey] === null) {
                current[ckey] = {};
            }
            previous = current;
            current = current[ckey];
        }
    }
    /**
     * Reads one control's value by its kind. The kind is read from the `type`
     * attribute and the tag, so a ful element answers its own `value`.
     *
     * - a radio answers its `value` when checked and undefined otherwise
     * - a checkbox answers its `checked` state
     * - `data-ful-bind-type="boolean"` decodes the value: a radio answers
     *   whether its value is `'true'`, any other control answers null when
     *   blank and whether its value is `'true'` otherwise
     * - a multiple select answers the array of its selected values
     * - a native input, select or textarea answers null when blank
     * - anything else answers its `value` unchanged
     * @param {Element & {dataset?: any} & {checked?: boolean} & {value?: any}} el
     * @returns {any} the value; undefined for an unchecked radio
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
     * @param {Element & {type?: string}} el
     */
    static #submits(el) {
        return el.type === 'submit' || el.type === 'reset' || el.type === 'button';
    }
    /**
     * Reads the form's named controls into a nested object, the dotted names
     * deciding its shape (see `providePath`) and each value read by `extract`.
     * Controls are read in document order, so of two overlapping names the
     * later one decides. A control is skipped when it has no `name`, when it
     * matches `:disabled` (its own `disabled` or a disabled fieldset's), or when
     * it is a submit, reset or plain button. The submitter is the exception to
     * both of the last two: it contributes its name and value even while
     * disabled.
     * @param {HTMLFormElement} form
     * @param {HTMLElement} [submitter] the button that submitted, when there is one
     * @returns {any} the nested values; an array when the first segment of a name is numeric
     * @throws {Error} when a name has a segment `providePath` refuses
     */
    static extractFrom(form, submitter) {
        let result = {};
        for (const el of form.elements) {
            if (!el.hasAttribute('name')) {
                continue;
            }
            if (Bindings.#submits(el) && el !== submitter) {
                continue;
            }
            if (el.matches(':disabled') && el !== submitter) {
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
     * Writes a value into one control, the inverse of `extract`.
     *
     * - a radio is checked when `raw` is not null and its `value` attribute
     *   equals `String(raw)`, so a number or a boolean matches its text
     * - a checkbox takes `raw` as its `checked` state
     * - a multiple select selects the options whose value is in `raw`, compared
     *   as text: an array selects each entry, a scalar selects one, null selects none
     * - anything else takes `raw` as its `value`
     * @param {Element & {dataset?: any} & {checked?: boolean} & {value?: any}} el
     * @param {any} raw
     */
    static mutate(el, raw) {
        if (el.getAttribute('type') === 'radio') {
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

    /**
     * Writes a nested object onto the form's named controls: the object is
     * flattened with the control names as stops (see `flatten`), and each key
     * is written by `mutate` into every control carrying exactly that name. A
     * key naming no control is ignored, and a control the object does not name
     * keeps its value.
     * @param {HTMLFormElement} form
     * @param {{ [x: string]: any; }} values
     */
    static mutateIn(form, values) {
        const named = Bindings.#named(form);
        for (const [flattenedKey, value] of Object.entries(Bindings.flatten(values, '', new Set(named.keys())))) {
            for (const el of named.get(flattenedKey) ?? []) {
                Bindings.mutate(el, value);
            }
        }
    }

    /**
     * @param {HTMLFormElement} form
     * @returns {Map<string, any[]>} the controls of `form.elements` grouped by name
     */
    static #named(form) {
        const named = new Map();
        for (const el of form.elements) {
            const name = el.getAttribute('name');
            if (!name) {
                continue;
            }
            const bucket = named.get(name);
            if (bucket) {
                bucket.push(el);
            } else {
                named.set(name, [el]);
            }
        }
        return named;
    }

    /**
     * Shows problems on the form, replacing whatever the previous call showed.
     *
     * Every named control's custom validity is first cleared. A problem whose
     * `type` is `FIELD_ERROR` or `INVALID_FORMAT` and whose `context` is not
     * empty is pinned to a control: brackets in the context are turned into
     * dots (`users[0].name` becomes `users.0.name`), and the longest leading
     * part of it that names a control wins, so an exact field takes the problem
     * alone and a composite field named for a prefix catches the problems of its
     * subtree. Each control of that name gets `setCustomValidity(reason, rest)`,
     * `rest` being the remainder of the path (`''` on an exact match) that a
     * composite can use to route the problem to an inner control.
     *
     * Every other problem, and a field problem naming no control, is shown in
     * each `ful-errors` banner of the form: the banner gets `role="alert"`, is
     * revealed and holds the reasons one per line. With no such problem the
     * banner is emptied and hidden.
     *
     * Each `ful-field-error` of the form gets `aria-live="off"` when
     * `scrollOnError` is set, since focusing the field announces its error, and
     * `aria-live="polite"` otherwise. With `scrollOnError` and at least one
     * problem, the topmost `:invalid` control is focused.
     *
     * A banner or `ful-field-error` belongs to the nearest enclosing form, so
     * those of a nested form are left alone.
     * @param {HTMLFormElement} form
     * @param {{ type: string; context?: string | null; reason: string; }[]} es the problems, as an httpc `Failure` carries them
     * @param {boolean} scrollOnError
     */
    static errors(form, es, scrollOnError) {
        const ofForm = (el) => el.closest('form') === form;
        Array.from(form.querySelectorAll('ful-field-error'))
            .filter(ofForm)
            .forEach((el) => {
                el.setAttribute('aria-live', scrollOnError ? 'off' : 'polite');
            });
        const pinned = (e) => (e.type === 'FIELD_ERROR' || e.type === 'INVALID_FORMAT') && e.context;
        const fieldErrors = es.filter(pinned);
        const globalErrors = es.filter((e) => !pinned(e));
        const named = Bindings.#named(form);
        for (const targets of named.values()) {
            targets.forEach((el) => {
                el.setCustomValidity?.('');
            });
        }
        const unmatched = [];
        fieldErrors.forEach((e) => {
            const name = /** @type {string} */ (e.context).replace(/\[/g, '.').replace(/\]\./g, '.').replace(/\]/g, '');
            const parts = name.split('.');
            for (let i = parts.length; i !== 0; --i) {
                const prefix = parts.slice(0, i).join('.');
                const targets = named.get(prefix) ?? [];
                if (targets.length === 0) {
                    continue;
                }
                const context = parts.slice(i).join('.');
                targets.forEach((input) => {
                    input.setCustomValidity?.(e.reason, context);
                });
                return;
            }
            unmatched.push(e);
        });
        const bannered = [...globalErrors, ...unmatched];
        form.querySelectorAll('ful-errors').forEach((el) => {
            if (!ofForm(el)) {
                return;
            }
            const hel = /** @type {HTMLElement} */ (el);
            el.setAttribute('role', 'alert');
            if (bannered.length === 0) {
                el.replaceChildren();
                el.setAttribute('hidden', '');
                return;
            }
            el.removeAttribute('hidden');
            hel.innerText = bannered.map((e) => e.reason).join('\n');
        });
        if (es.length === 0 || !scrollOnError) {
            return;
        }
        /** @type {HTMLElement[]} */ (Array.from(form.elements))
            .filter((el) => el.matches(':invalid'))
            .sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y)[0]
            ?.focus();
    }
}

export { Bindings };
