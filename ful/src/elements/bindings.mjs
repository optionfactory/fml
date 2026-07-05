
class Bindings {

    /**
     * @param {{ [x: string]: any; }} obj
     * @param {string} prefix
     * @param {Set<String>} stops
     * @return {{ [x: string]: any; }}
     */
    static flatten(obj, prefix, stops) {
        return Object.keys(obj).reduce((acc, k) => {
            const pre = prefix.length ? prefix + '.' + k : k;
            if (!stops.has(pre) && typeof obj[k] === 'object' && obj[k] !== null) {
                Object.assign(acc, Bindings.flatten(obj[k], pre, stops));
            } else {
                acc[pre] = obj[k];
            }
            return acc;
        }, {});
    }
    
    /**
     * @param {any} result
     * @param {string} path
     * @param {any} value
     */
    static providePath(result, path, value) {
        const keys = path.split(".").map((k) => /^[0-9]+$/.test(k) ? +k : k);
        let current = result ?? {};
        let previous = null;
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
                current[ckey] = value !== undefined ? value : (ckey in current ? current[ckey] : null);
                return result;
            }
            if (current[ckey] === undefined) {
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
            return el.dataset['fulBindType'] === 'boolean' ? el.value === 'true' : el.value;
        }
        if (el.getAttribute('type') === 'checkbox') {
            return el.checked;
        }
        if (el.dataset['fulBindType'] === 'boolean') {
            return !el.value ? null : el.value === 'true';
        }
        if (el.tagName === 'INPUT' || el.tagName === 'SELECT') {
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
    static extractFrom(form, submitter){
        let result = {};
        for(const el of form.elements){
            // we are assuming submitters are disabled during submit.
            if(!el.hasAttribute("name") || (el.matches(":disabled") && el !== submitter)){
                continue;
            }
            result = Bindings.providePath(result, /** @type {string} */(el.getAttribute('name')), Bindings.extract(el))
        }
        return result;
    }
   
    /**
     * 
     * @param {Element  & {checked?: boolean} & {value?: any}} el 
     * @returns 
     */    
    static mutate(el, raw) {
        if (el.getAttribute('type') === 'radio') {
            el.checked = el.getAttribute('value') === raw;
            return;
        }
        if (el.getAttribute('type') === 'checkbox') {
            el.checked = raw;
            return;
        }
        el.value = raw;
    }

    static mutateIn(form, values){
        const names = Array.from(form.elements)
            .map(el => el.getAttribute("name"))
            .filter(n => n);
        for (const [flattenedKey, value] of Object.entries(Bindings.flatten(values, '', new Set(names)))) {
            for(const el of form.querySelectorAll(`[name='${CSS.escape(flattenedKey)}']`)){
                Bindings.mutate(el, value)
            }
        }
    }


    static errors(form, es, scrollOnError){
        const fieldErrors = es.filter(e => e.type === 'FIELD_ERROR' || e.type === 'INVALID_FORMAT');
        const globalErrors = es.filter(e => e.type !== 'FIELD_ERROR' && e.type !== 'INVALID_FORMAT');
        form.querySelectorAll(`[name]`).forEach(el => el.setCustomValidity?.(""));
        form.querySelectorAll("ful-errors").forEach(el => {
            el.replaceChildren();
            el.setAttribute('hidden', '');
        });
        fieldErrors.forEach(e => {
            const name = e.context.replace("[", ".").replace("].", ".").replace("]", "");
            const parts = name.split(".");
            for (let i = parts.length; i != 0; --i) {
                const prefix = parts.slice(0, i).join(".");
                const suffix = parts.slice(i, parts.length).join(".");
                form.querySelectorAll(`[name='${CSS.escape(prefix)}']`).forEach(input => input.setCustomValidity?.(e.reason, suffix));
            }
        });
        form.querySelectorAll("ful-errors").forEach(el => {
            const hel = /** @type HTMLElement} */ (el);
            hel.innerText = globalErrors.map(e => e.reason).join("\n");
            if (globalErrors.length !== 0) {
                el.removeAttribute('hidden');
            }
        });
        if (es.length == 0 || !scrollOnError) {
            return;
        }
        Array.from(form.querySelectorAll(`:invalid`)).sort((a,b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y)[0]?.focus();
    }
}


export { Bindings }
