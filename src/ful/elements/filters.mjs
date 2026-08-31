import { Attributes } from '../../ftl/index.mjs';
import { Instant } from './temporals.mjs';
import { Input } from './input.mjs';

const wireOperatorMenu = (operator) => {
    const menu = /** @type HTMLElement */ (operator.nextElementSibling);
    const id = Attributes.uid('ful-filter-menu');
    operator.setAttribute('popovertarget', id);
    menu.id = id;
    const anchor = `--${id}`;
    operator.style.anchorName = anchor;
    menu.style.positionAnchor = anchor;
    menu.addEventListener('toggle', (evt) => {
        operator.setAttribute('aria-expanded', String(/** @type any */ (evt).newState === 'open'));
    });
};

const hideOperatorMenu = (target) => {
    /** @type any */ (target.closest('ul[popover]'))?.hidePopover?.();
};

class InstantFilter extends Input {
    static observed = ['value:json', 'readonly:presence', 'required:presence', 'placeholder'];
    static template = `
        <label>{{{{ slots.default }}}}</label>
        {{{{ slots.info }}}}
        <ful-control-group>
            <ful-affix data-tpl-if="slots.ibefore">{{{{ slots.ibefore }}}}</ful-affix>
            {{{{ slots.before }}}}
            <ful-affix>
                <button data-ref="operator" type="button" value="LTE" form="" aria-expanded="false" aria-haspopup="true">&PrecedesSlantEqual;</button>
                <ul popover>
                    <li><a role="button" value="EQ">=</a></li>
                    <li><a role="button" value="NEQ">&ne;</a></li>
                    <li><a role="button" value="LT">&prec;</a></li>
                    <li><a role="button" value="GT">&succ;</a></li>
                    <li><a role="button" value="LTE">&PrecedesSlantEqual;</a></li>
                    <li><a role="button" value="GTE">&SucceedsSlantEqual;</a></li>
                    <li><a role="button" value="BETWEEN">&LeftRightArrow;</a></li>
                </ul>
            </ful-affix>
            <input data-ref="value1" type="datetime-local" form="">
            <input data-ref="value2" type="datetime-local" form="" hidden>
            {{{{ slots.after }}}}
            <ful-affix data-tpl-if="slots.iafter">{{{{ slots.iafter }}}}</ful-affix>
        </ful-control-group>
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
        wireOperatorMenu(this.#operator);
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
            hideOperatorMenu(target);
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
        //the claim and the first operand are the base's, the second operand mirrors
        //the claim like the first one does
        super.disabled = d;
        Attributes.toggle(this.#value2, 'disabled', d);
    }
}

class LocalDateFilter extends Input {
    static observed = ['value:json', 'readonly:presence', 'required:presence', 'placeholder'];
    static template = `
        <label>{{{{ slots.default }}}}</label>
        {{{{ slots.info }}}}
        <ful-control-group>
            <ful-affix data-tpl-if="slots.ibefore">{{{{ slots.ibefore }}}}</ful-affix>
            {{{{ slots.before }}}}
            <ful-affix>
                <button data-ref="operator" type="button" value="EQ" form="" aria-expanded="false" aria-haspopup="true">=</button>
                <ul popover>
                    <li><a role="button" value="EQ">=</a></li>
                    <li><a role="button" value="NEQ">&ne;</a></li>
                    <li><a role="button" value="LT">&prec;</a></li>
                    <li><a role="button" value="GT">&succ;</a></li>
                    <li><a role="button" value="LTE">&PrecedesSlantEqual;</a></li>
                    <li><a role="button" value="GTE">&SucceedsSlantEqual;</a></li>
                    <li><a role="button" value="BETWEEN">&LeftRightArrow;</a></li>
                </ul>
            </ful-affix>
            <input data-ref="value1" type="date" form="">
            <input data-ref="value2" type="date" form="" hidden>
            {{{{ slots.after }}}}
            <ful-affix data-tpl-if="slots.iafter">{{{{ slots.iafter }}}}</ful-affix>
        </ful-control-group>
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
        wireOperatorMenu(this.#operator);
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
            hideOperatorMenu(target);
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
        //the claim and the first operand are the base's, the second operand mirrors
        //the claim like the first one does
        super.disabled = d;
        Attributes.toggle(this.#value2, 'disabled', d);
    }
}

class TextFilter extends Input {
    static observed = ['value:json', 'readonly:presence', 'required:presence', 'placeholder'];
    static template = `
        <label>{{{{ slots.default }}}}</label>
        {{{{ slots.info }}}}
        <ful-control-group>
            <ful-affix data-tpl-if="slots.ibefore">{{{{ slots.ibefore }}}}</ful-affix>
            {{{{ slots.before }}}}
            <ful-affix>
                <button data-ref="operator" type="button" value="CONTAINS" form="" aria-expanded="false" aria-haspopup="true">&mldr;a&mldr;</button>
                <ul popover>
                    <li><a role="button" value="CONTAINS">&mldr;a&mldr;</a></li>
                    <li><a role="button" value="STARTS_WITH">a&mldr;</a></li>
                    <li><a role="button" value="ENDS_WITH">&mldr;a</a></li>
                    <li><a role="button" value="EQ">=</a></li>
                </ul>
            </ful-affix>
            <input data-ref="value" type="text" form="">
            {{{{ slots.after }}}}
            <ful-affix data-tpl-if="slots.iafter">{{{{ slots.iafter }}}}</ful-affix>
        </ful-control-group>
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
        wireOperatorMenu(this.#operator);

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
            hideOperatorMenu(target);
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
