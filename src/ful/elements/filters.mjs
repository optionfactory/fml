import { Attributes } from '../../ftl/index.mjs';
import { Instant } from './temporals.mjs';
import { Input } from './input.mjs';

const wireOperatorMenu = (operator) => {
    const menu = /** @type HTMLElement */ (operator.nextElementSibling);
    const itemsOf = () => Array.from(menu.querySelectorAll('li > a'), (a) => /** @type HTMLAnchorElement */ (a));
    const id = Attributes.uid('ful-filter-menu');
    operator.setAttribute('popovertarget', id);
    menu.id = id;
    const anchor = `--${id}`;
    operator.style.anchorName = anchor;
    menu.style.positionAnchor = anchor;
    menu.addEventListener('toggle', (evt) => {
        const open = /** @type any */ (evt).newState === 'open';
        operator.setAttribute('aria-expanded', String(open));
        if (!open) {
            //give the invoker back the focus the menu had borrowed, without
            //stealing it from wherever else the close came from
            if (menu.contains(document.activeElement)) {
                operator.focus();
            }
            return;
        }
        const items = itemsOf();
        const current = items.find((a) => a.getAttribute('value') === operator.getAttribute('value'));
        (current ?? items[0])?.focus();
    });
    menu.addEventListener('keydown', (evt) => {
        const target = /** @type HTMLElement */ (evt.target);
        const item = /** @type HTMLAnchorElement | null */ (target.closest('li > a'));
        if (!item) {
            return;
        }
        const items = itemsOf();
        switch (evt.code) {
            case 'ArrowDown': {
                evt.preventDefault();
                items[Math.min(items.length - 1, items.indexOf(item) + 1)]?.focus();
                break;
            }
            case 'ArrowUp': {
                evt.preventDefault();
                items[Math.max(0, items.indexOf(item) - 1)]?.focus();
                break;
            }
            case 'Home': {
                evt.preventDefault();
                items[0]?.focus();
                break;
            }
            case 'End': {
                evt.preventDefault();
                items[items.length - 1]?.focus();
                break;
            }
            case 'Enter':
            case 'Space': {
                evt.preventDefault();
                item.click();
                operator.focus();
                break;
            }
            case 'Escape': {
                //the platform's close request hides the menu, the focus is placed
                //on the invoker before the focused item is detached from it
                operator.focus();
                break;
            }
        }
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
                <ul popover role="menu">
                    <li role="none"><a role="menuitem" tabindex="-1" value="EQ">=</a></li>
                    <li role="none"><a role="menuitem" tabindex="-1" value="NEQ">&ne;</a></li>
                    <li role="none"><a role="menuitem" tabindex="-1" value="LT">&prec;</a></li>
                    <li role="none"><a role="menuitem" tabindex="-1" value="GT">&succ;</a></li>
                    <li role="none"><a role="menuitem" tabindex="-1" value="LTE">&PrecedesSlantEqual;</a></li>
                    <li role="none"><a role="menuitem" tabindex="-1" value="GTE">&SucceedsSlantEqual;</a></li>
                    <li role="none"><a role="menuitem" tabindex="-1" value="BETWEEN">&LeftRightArrow;</a></li>
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
                <ul popover role="menu">
                    <li role="none"><a role="menuitem" tabindex="-1" value="EQ">=</a></li>
                    <li role="none"><a role="menuitem" tabindex="-1" value="NEQ">&ne;</a></li>
                    <li role="none"><a role="menuitem" tabindex="-1" value="LT">&prec;</a></li>
                    <li role="none"><a role="menuitem" tabindex="-1" value="GT">&succ;</a></li>
                    <li role="none"><a role="menuitem" tabindex="-1" value="LTE">&PrecedesSlantEqual;</a></li>
                    <li role="none"><a role="menuitem" tabindex="-1" value="GTE">&SucceedsSlantEqual;</a></li>
                    <li role="none"><a role="menuitem" tabindex="-1" value="BETWEEN">&LeftRightArrow;</a></li>
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
                <ul popover role="menu">
                    <li role="none"><a role="menuitem" tabindex="-1" value="CONTAINS">&mldr;a&mldr;</a></li>
                    <li role="none"><a role="menuitem" tabindex="-1" value="STARTS_WITH">a&mldr;</a></li>
                    <li role="none"><a role="menuitem" tabindex="-1" value="ENDS_WITH">&mldr;a</a></li>
                    <li role="none"><a role="menuitem" tabindex="-1" value="EQ">=</a></li>
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
