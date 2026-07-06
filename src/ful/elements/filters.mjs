import { Attributes } from "@optionfactory/ftl";
import { Instant } from "./temporals.mjs";
import { Input } from "./input.mjs";

class InstantFilter extends Input {
    static observed = ['value:json', 'readonly:presence', 'required:presence'];
    static template = `
        <div class="form-label">
            <label>{{{{ slots.default }}}}</label>
            {{{{ slots.info }}}}
        </div>
        <div class="input-group">
            <span data-tpl-if="slots.ibefore" class="input-group-text">{{{{ slots.ibefore }}}}</span>
            {{{{ slots.before }}}}
            <button data-ref="operator" class="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" value="LTE" form="">&PrecedesSlantEqual;</button>
            <ul class="dropdown-menu">
                <li><a class="dropdown-item" role="button" value="EQ">=</a></li>
                <li><a class="dropdown-item" role="button" value="NEQ">&ne;</a></li>
                <li><a class="dropdown-item" role="button" value="LT">&prec;</a></li>
                <li><a class="dropdown-item" role="button" value="GT">&succ;</a></li>
                <li><a class="dropdown-item" role="button" value="LTE">&PrecedesSlantEqual;</a></li>
                <li><a class="dropdown-item" role="button" value="GTE">&SucceedsSlantEqual;</a></li>
                <li><a class="dropdown-item" role="button" value="BETWEEN">&LeftRightArrow;</a></li>
            </ul>
            <input data-ref="value1" type="datetime-local" class="form-control" form="">
            <input data-ref="value2" type="datetime-local" class="form-control" form="" hidden>
            {{{{ slots.after }}}}
            <span data-tpl-if="slots.iafter" class="input-group-text">{{{{ slots.iafter }}}}</span>
        </div>
        <ful-field-error></ful-field-error>
    `;
    #operator;
    #value1;
    #value2;
    render(conf) {
        super.render({ ...conf, skipObservedSetup: true });
        this.#operator = this.querySelector('[data-ref=operator]');
        this.#value1 = this.querySelector('[data-ref=value1]');
        this.#value2 = this.querySelector('[data-ref=value2]');

        this.disabled = conf.disabled;
        this.readonly = conf.observed.readonly;
        this.required = conf.observed.required;
        this.value = conf.observed.value;

        this.addEventListener('click', (evt) => {
            const target = /** @type HTMLElement */ (evt.target);
            if (!target.matches('ul > li > a')) {
                return;
            }
            const btn = /** @type HTMLButtonElement */ (target.closest('ul')?.previousElementSibling);
            const value = /** @type String */ (target.getAttribute("value"));
            Attributes.toggle(this.#value2, 'hidden', value !== 'BETWEEN');
            btn.setAttribute('value', value);
            btn.innerHTML = target.innerHTML;
        })
    }

    get value() {
        const operator = this.#operator.getAttribute('value');
        const values = operator === 'BETWEEN' ? [this.#value1.value, this.#value2.value] : [this.#value1.value];
        return values.some(v => v === '') ? undefined : [operator, ...values.map(v => new Date(v).toISOString())];
    }
    set value(v) {
        if (v == null) {
            this.#value1.value = '';
            this.#value2.value = '';
            return;
        }
        const [operator, ...values] = v;
        this.#operator.setAttribute('value', operator);
        this.#value1.value = values[0] ? Instant.isoToLocal(values[0]) : values[0];
        this.#value2.value = values[1] ? Instant.isoToLocal(values[1]) : values[1];
    }
    set readonly(v) {
        this.#value2.readOnly = v;
        super.readonly = v;
    }
    set disabled(d) {
        Attributes.toggle(this.#value2, 'disabled', d);
        super.disabled = d;
    }
}

class LocalDateFilter extends Input {
    static observed = ["value:json", 'readonly:presence', 'required:presence'];
    static template = `
        <div class="form-label">
            <label>{{{{ slots.default }}}}</label>
            {{{{ slots.info }}}}
        </div>
        <div class="input-group">
            <span data-tpl-if="slots.ibefore" class="input-group-text">{{{{ slots.ibefore }}}}</span>
            {{{{ slots.before }}}}
            <button data-ref="operator" class="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" value="EQ" form="">=</button>
            <ul class="dropdown-menu">
                <li><a class="dropdown-item" role="button" value="EQ">=</a></li>
                <li><a class="dropdown-item" role="button" value="NEQ">&ne;</a></li>
                <li><a class="dropdown-item" role="button" value="LT">&prec;</a></li>
                <li><a class="dropdown-item" role="button" value="GT">&succ;</a></li>
                <li><a class="dropdown-item" role="button" value="LTE">&PrecedesSlantEqual;</a></li>
                <li><a class="dropdown-item" role="button" value="GTE">&SucceedsSlantEqual;</a></li>
                <li><a class="dropdown-item" role="button" value="BETWEEN">&LeftRightArrow;</a></li>
            </ul>
            <input data-ref="value1" type="date" class="form-control" form="">
            <input data-ref="value2" type="date" class="form-control" form="" hidden>
            {{{{ slots.after }}}}
            <span data-tpl-if="slots.iafter" class="input-group-text">{{{{ slots.iafter }}}}</span>
        </div>
        <ful-field-error></ful-field-error>
    `;
    #operator;
    #value1;
    #value2;
    render(conf) {
        super.render({ ...conf, skipObservedSetup: true });

        this.#operator = this.querySelector('[data-ref=operator]');
        this.#value1 = this.querySelector('[data-ref=value1]');
        this.#value2 = this.querySelector('[data-ref=value2]');

        this.disabled = conf.disabled;
        this.readonly = conf.observed.readonly;
        this.required = conf.observed.required;
        this.value = conf.observed.value;

        this.addEventListener('click', (evt) => {
            const target = /** @type HTMLElement */(evt.target);
            if (!target.matches('ul > li > a')) {
                return;
            }
            const btn = /** @type HTMLButtonElement */ (target.closest('ul')?.previousElementSibling);
            const value = /** @type String */ (target.getAttribute("value"));
            Attributes.toggle(this.#value2, 'hidden', value !== 'BETWEEN');
            btn.setAttribute('value', value);
            btn.innerHTML = target.innerHTML;
        })
    }
    get value() {
        const operator = this.#operator.getAttribute('value');
        const values = operator == 'BETWEEN' ? [this.#value1.value, this.#value2.value] : [this.#value1.value];
        return values.some(v => v === '') ? undefined : [operator, ...values];
    }
    set value(v) {
        if (v == null) {
            this.#value1.value = '';
            this.#value2.value = '';
            return;
        }
        const [operator, ...values] = v;
        this.#operator.setAttibute('value', operator);
        this.#value1.value = values[0];
        this.#value2.value = values[1];
    }
    set readonly(v) {
        this.#value2.readOnly = v;
        super.readonly = v;
    }
    set disabled(d) {
        Attributes.toggle(this.#value2, 'disabled', d);
        super.disabled = d;
    }
}

class TextFilter extends Input {
    static observed = ["value:json", 'readonly:presence', 'required:presence'];
    static template = `
        <div class="form-label">
            <label>{{{{ slots.default }}}}</label>
            {{{{ slots.info }}}}
        </div>
        <div class="input-group">
            <span data-tpl-if="slots.ibefore" class="input-group-text">{{{{ slots.ibefore }}}}</span>
            {{{{ slots.before }}}}
            <button data-ref="operator" class="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" value="CONTAINS" form="">&mldr;a&mldr;</button>
            <ul class="dropdown-menu">
                <li><a class="dropdown-item" role="button" value="CONTAINS">&mldr;a&mldr;</a></li>
                <li><a class="dropdown-item" role="button" value="STARTS_WITH">a&mldr;</a></li>
                <li><a class="dropdown-item" role="button" value="ENDS_WITH">&mldr;a</a></li>
                <li><a class="dropdown-item" role="button" value="EQ">=</a></li>
            </ul>
            <input data-ref="value" type="text" class="form-control" form="">
            {{{{ slots.after }}}}
            <span data-tpl-if="slots.iafter" class="input-group-text">{{{{ slots.iafter }}}}</span>
        </div>
        <ful-field-error></ful-field-error>
    `;
    #operator;
    #value;
    render(conf) {
        super.render({ ...conf, skipObservedSetup: true });

        this.#operator = this.querySelector('[data-ref=operator]');
        this.#value = this.querySelector('[data-ref=value]');

        this.disabled = conf.disabled;
        this.readonly = conf.observed.readonly;
        this.required = conf.observed.required;
        this.value = conf.observed.value;

        this.addEventListener('click', (evt) => {
            const target = /** @type HTMLElement */(evt.target);
            if (!target.matches('ul > li > a')) {
                return;
            }
            const btn = /** @type HTMLButtonElement */ (target.closest('ul')?.previousElementSibling);
            const value = /** @type String */ (target.getAttribute("value"));
            btn.setAttribute('value', value);
            btn.innerHTML = target.innerHTML;
        })
    }
    get value() {
        const operator = this.#operator.getAttribute('value');
        return this.#value.value === '' ? undefined : [operator, 'IGNORE_CASE', this.#value.value];
    }
    set value(v) {
        if (v == null) {
            this.#value.value = '';
            return;
        }
        const [operator, sensitivity, value] = v;
        this.#operator.setAttribute('value', operator);
        this.#value.value = value;
    }
}

export { InstantFilter, LocalDateFilter, TextFilter }