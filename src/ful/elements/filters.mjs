import { Attributes } from '../../ftl/index.mjs';
import { Instant } from './temporals.mjs';
import { Input } from './input.mjs';

class InstantFilter extends Input {
    static observed = ['value:json', 'readonly:presence', 'required:presence', 'placeholder'];
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
        //Input.render only re-dispatches changes coming from the first operand
        this.#value2.addEventListener('change', (evt) => {
            evt.stopPropagation();
            this.#notifyChange();
        });

        this.disabled = conf.disabled;
        this.readonly = conf.observed.readonly;
        this.required = conf.observed.required;
        this.placeholder = conf.observed.placeholder;
        this.value = conf.observed.value;

        this.addEventListener('click', (evt) => {
            const target = /** @type HTMLElement */ (evt.target);
            if (!target.matches('ul > li > a')) {
                return;
            }
            const btn = /** @type HTMLButtonElement */ (target.closest('ul')?.previousElementSibling);
            const value = /** @type String */ (target.getAttribute('value'));
            const previous = btn.getAttribute('value');
            Attributes.toggle(this.#value2, 'hidden', value !== 'BETWEEN');
            btn.setAttribute('value', value);
            btn.innerHTML = target.innerHTML;
            if (previous !== value) {
                this.#notifyChange();
            }
        });
    }

    get value() {
        const operator = this.#operator.getAttribute('value');
        const values = operator === 'BETWEEN' ? [this.#value1.value, this.#value2.value] : [this.#value1.value];
        return values.some((v) => v === '') ? undefined : [operator, ...values.map((v) => new Date(v).toISOString())];
    }
    set value(v) {
        if (v == null) {
            this.#value1.value = '';
            this.#value2.value = '';
            return;
        }
        const [operator, ...values] = v;
        this.#showOperator(operator);
        this.#value1.value = values[0] ? Instant.isoToLocal(values[0]) : values[0];
        this.#value2.value = values[1] ? Instant.isoToLocal(values[1]) : values[1];
    }
    #showOperator(operator) {
        this.#operator.setAttribute('value', operator);
        const items = Array.from(this.#operator.nextElementSibling?.querySelectorAll('li > a[value]') ?? []);
        const item = items.find((a) => a.getAttribute('value') === operator);
        if (item) {
            this.#operator.innerHTML = item.innerHTML;
        }
        Attributes.toggle(this.#value2, 'hidden', operator !== 'BETWEEN');
    }
    #notifyChange() {
        this.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                cancelable: false,
                detail: {
                    value: this.value,
                },
            }),
        );
    }
    get readonly() {
        return super.readonly;
    }
    set readonly(v) {
        this.#value2.readOnly = v;
        super.readonly = v;
    }
    get disabled() {
        return super.disabled;
    }
    set disabled(d) {
        Attributes.toggle(this.#value2, 'disabled', d);
        super.disabled = d;
    }
}

class LocalDateFilter extends Input {
    static observed = ['value:json', 'readonly:presence', 'required:presence', 'placeholder'];
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
        //Input.render only re-dispatches changes coming from the first operand
        this.#value2.addEventListener('change', (evt) => {
            evt.stopPropagation();
            this.#notifyChange();
        });

        this.disabled = conf.disabled;
        this.readonly = conf.observed.readonly;
        this.required = conf.observed.required;
        this.placeholder = conf.observed.placeholder;
        this.value = conf.observed.value;

        this.addEventListener('click', (evt) => {
            const target = /** @type HTMLElement */ (evt.target);
            if (!target.matches('ul > li > a')) {
                return;
            }
            const btn = /** @type HTMLButtonElement */ (target.closest('ul')?.previousElementSibling);
            const value = /** @type String */ (target.getAttribute('value'));
            const previous = btn.getAttribute('value');
            Attributes.toggle(this.#value2, 'hidden', value !== 'BETWEEN');
            btn.setAttribute('value', value);
            btn.innerHTML = target.innerHTML;
            if (previous !== value) {
                this.#notifyChange();
            }
        });
    }
    get value() {
        const operator = this.#operator.getAttribute('value');
        const values = operator === 'BETWEEN' ? [this.#value1.value, this.#value2.value] : [this.#value1.value];
        return values.some((v) => v === '') ? undefined : [operator, ...values];
    }
    set value(v) {
        if (v == null) {
            this.#value1.value = '';
            this.#value2.value = '';
            return;
        }
        const [operator, ...values] = v;
        this.#showOperator(operator);
        this.#value1.value = values[0];
        this.#value2.value = values[1];
    }
    #showOperator(operator) {
        this.#operator.setAttribute('value', operator);
        const items = Array.from(this.#operator.nextElementSibling?.querySelectorAll('li > a[value]') ?? []);
        const item = items.find((a) => a.getAttribute('value') === operator);
        if (item) {
            this.#operator.innerHTML = item.innerHTML;
        }
        Attributes.toggle(this.#value2, 'hidden', operator !== 'BETWEEN');
    }
    #notifyChange() {
        this.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                cancelable: false,
                detail: {
                    value: this.value,
                },
            }),
        );
    }
    get readonly() {
        return super.readonly;
    }
    set readonly(v) {
        this.#value2.readOnly = v;
        super.readonly = v;
    }
    get disabled() {
        return super.disabled;
    }
    set disabled(d) {
        Attributes.toggle(this.#value2, 'disabled', d);
        super.disabled = d;
    }
}

class TextFilter extends Input {
    static observed = ['value:json', 'readonly:presence', 'required:presence', 'placeholder'];
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
    //the sensitivity has no control of its own: it is carried through from whoever set the value
    #sensitivity = 'IGNORE_CASE';
    render(conf) {
        super.render({ ...conf, skipObservedSetup: true });

        this.#operator = this.querySelector('[data-ref=operator]');
        this.#value = this.querySelector('[data-ref=value]');

        this.disabled = conf.disabled;
        this.readonly = conf.observed.readonly;
        this.required = conf.observed.required;
        this.placeholder = conf.observed.placeholder;
        this.value = conf.observed.value;

        this.addEventListener('click', (evt) => {
            const target = /** @type HTMLElement */ (evt.target);
            if (!target.matches('ul > li > a')) {
                return;
            }
            const btn = /** @type HTMLButtonElement */ (target.closest('ul')?.previousElementSibling);
            const value = /** @type String */ (target.getAttribute('value'));
            const previous = btn.getAttribute('value');
            btn.setAttribute('value', value);
            btn.innerHTML = target.innerHTML;
            if (previous !== value) {
                this.#notifyChange();
            }
        });
    }
    get value() {
        const operator = this.#operator.getAttribute('value');
        return this.#value.value === '' ? undefined : [operator, this.#sensitivity, this.#value.value];
    }
    set value(v) {
        if (v == null) {
            this.#value.value = '';
            return;
        }
        const [operator, sensitivity, value] = v;
        this.#showOperator(operator);
        this.#sensitivity = sensitivity ?? 'IGNORE_CASE';
        this.#value.value = value;
    }
    #showOperator(operator) {
        this.#operator.setAttribute('value', operator);
        const items = Array.from(this.#operator.nextElementSibling?.querySelectorAll('li > a[value]') ?? []);
        const item = items.find((a) => a.getAttribute('value') === operator);
        if (item) {
            this.#operator.innerHTML = item.innerHTML;
        }
    }
    #notifyChange() {
        this.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                cancelable: false,
                detail: {
                    value: this.value,
                },
            }),
        );
    }
}

export { InstantFilter, LocalDateFilter, TextFilter };
