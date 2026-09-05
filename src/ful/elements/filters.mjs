import { Attributes, Localization } from '../../ftl/index.mjs';
import { Field } from './field.mjs';
import { Instant } from './temporals.mjs';
import { Input } from './input.mjs';

const GLYPHS = {
    EQ: '=',
    NEQ: '≠',
    LT: '<',
    GT: '>',
    LTE: '≤',
    GTE: '≥',
    BETWEEN: '↔',
    CONTAINS: '…a…',
    STARTS_WITH: 'a…',
    ENDS_WITH: '…a',
};
const COMPARE_OPERATORS = ['EQ', 'NEQ', 'LT', 'GT', 'LTE', 'GTE', 'BETWEEN'];
const TEXT_OPERATORS = [...COMPARE_OPERATORS, 'CONTAINS', 'STARTS_WITH', 'ENDS_WITH'];
const SENSITIVITIES = ['IGNORE_CASE', 'CASE_SENSITIVE'];

const SENSITIVITY_GLYPHS = {
    IGNORE_CASE: 'aa',
    CASE_SENSITIVE: 'Aa',
};

/** the labels live in the built-in translations, resolved through the same localization every template uses */
const { t } = Localization.of();
const operatorLabel = (op) => t(`filters.op.${op}`);
const sensitivityLabel = (sensitivity) => t(`filters.sensitivity.${sensitivity}`);
const booleanValueLabel = (token) => t(token === '' ? 'filters.boolean.any' : `filters.boolean.${token}`);

const fillMenu = (menu, allowed, labelFor, glyphs) => {
    menu.replaceChildren(
        ...allowed.map((op) => {
            const li = document.createElement('li');
            li.setAttribute('role', 'none');
            const a = document.createElement('a');
            a.setAttribute('role', 'menuitem');
            a.setAttribute('tabindex', '-1');
            a.setAttribute('value', op);
            const word = labelFor(op);
            const glyph = glyphs[op] ?? op;
            if (word === op && glyph === op) {
                a.innerText = op;
            } else {
                const glyphSpan = document.createElement('span');
                glyphSpan.innerText = glyph;
                const wordSpan = document.createElement('span');
                wordSpan.innerText = word;
                a.append(glyphSpan, wordSpan);
            }
            li.append(a);
            return li;
        }),
    );
};

const fillOperatorMenu = (menu, allowed) => {
    fillMenu(menu, allowed, operatorLabel, GLYPHS);
};

const whitelisted = (declared, vocabulary) => {
    const allowed = (declared ?? []).filter((op) => vocabulary.includes(op));
    return allowed.length > 0 ? allowed : [...vocabulary];
};

/**
 * A single whitelisted operator pins it: the button stops being a popup
 * invoker and becomes a static glyph, and every tuple emits the pinned
 * operator no matter what an assignment carries.
 */
const syncOperatorControl = (operator, allowed, claimed = false) => {
    const pinned = allowed.length < 2;
    Attributes.toggle(operator, 'disabled', pinned || claimed);
    Attributes.set(operator, 'aria-haspopup', pinned ? null : 'true');
    Attributes.set(operator, 'aria-expanded', pinned ? null : 'false');
    if (pinned) {
        operator.removeAttribute('popovertarget');
    }
    return pinned;
};

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
                items[(items.indexOf(item) + 1) % items.length]?.focus();
                break;
            }
            case 'ArrowUp': {
                evt.preventDefault();
                items[(items.indexOf(item) - 1 + items.length) % items.length]?.focus();
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

/**
 * The operator menu protocol: refill the menu, wire it the first time more
 * than one operator is allowed, then sync the invoker, pinning it to the
 * first allowed operator when a single one survives the whitelist.
 */
const refreshOperators = (filter) => {
    if (!filter._menu) {
        return;
    }
    fillOperatorMenu(filter._menu, filter._allowed);
    if (!filter._operatorMenuWired && filter._allowed.length > 1) {
        wireOperatorMenu(filter._operator);
        filter._operatorMenuWired = true;
    }
    if (syncOperatorControl(filter._operator, filter._allowed, filter.hasAttribute('disabled'))) {
        filter._showOperator(filter._allowed[0]);
    }
};

/**
 * The shared shape of every operator-and-operands filter: an operator menu, one
 * or two operands of the type the subclass declares, and a tuple that mirrors
 * the data-jpa compare annotations.
 */
class CompareFilter extends Input {
    static observed = ['value:json', 'operators:csv', 'readonly:presence', 'required:presence', 'placeholder'];
    static OPERATORS = COMPARE_OPERATORS;
    static DEFAULT_OPERATOR = 'EQ';
    static template = `
        <label>{{{{ slots.default }}}}</label>
        {{{{ slots.info }}}}
        <ful-control-group>
            <ful-affix data-tpl-if="slots.ibefore">{{{{ slots.ibefore }}}}</ful-affix>
            {{{{ slots.before }}}}
            <ful-affix>
                <button data-ref="operator" type="button" form="" aria-expanded="false" aria-haspopup="true"></button>
                <ul popover role="menu"></ul>
            </ful-affix>
            <input data-ref="value1" data-tpl-type="type" form="">
            <input data-ref="value2" data-tpl-type="type" form="" hidden>
            {{{{ slots.after }}}}
            <ful-affix data-tpl-if="slots.iafter">{{{{ slots.iafter }}}}</ful-affix>
        </ful-control-group>
        <ful-field-error></ful-field-error>
    `;
    _operator;
    _menu;
    _container;
    _value1;
    _value2;
    _allowed;
    render(conf) {
        super.render({ ...conf, skipObservedSetup: true });
        this._container = this.querySelector('ful-control-group');
        this._operator = this.querySelector('[data-ref=operator]');
        this._menu = this._operator.nextElementSibling;
        this._value1 = this.querySelector('[data-ref=value1]');
        this._value2 = this.querySelector('[data-ref=value2]');
        this.operators = conf.observed.operators;
        //Input.render only re-dispatches changes coming from the first operand
        this._value2.addEventListener('change', (evt) => {
            evt.stopPropagation();
            this._notifyChange();
        });
        this.disabled = conf.disabled;
        this.readonly = conf.observed.readonly;
        this.required = conf.observed.required;
        this.placeholder = conf.observed.placeholder;
        this.value = conf.observed.value;
        if (!this._operator.hasAttribute('value')) {
            const preferred = this._defaultOperator();
            this._showOperator(this._allowed.includes(preferred) ? preferred : this._allowed[0]);
        }
        this.addEventListener('click', (evt) => {
            const target = /** @type HTMLElement */ (evt.target);
            const item = /** @type HTMLElement | null */ (target.closest('ul > li > a'));
            if (!item) {
                return;
            }
            //buttons and menus are not form controls, the guard must ask the
            //effective state
            if (this.matches(':disabled') || this.readonly) {
                return;
            }
            const btn = /** @type HTMLButtonElement */ (item.closest('ul')?.previousElementSibling);
            if (btn !== this._operator) {
                return;
            }
            const value = /** @type String */ (item.getAttribute('value'));
            const previous = btn.getAttribute('value');
            btn.setAttribute('value', value);
            this._showOperator(value);
            hideOperatorMenu(item);
            if (previous !== value) {
                this._notifyChange();
            }
        });
    }
    _type() {
        return 'text';
    }
    _serialize(v) {
        return v;
    }
    _deserialize(v) {
        return v;
    }
    _defaultOperator() {
        return 'EQ';
    }
    _vocabulary() {
        return COMPARE_OPERATORS;
    }
    get operators() {
        return this._allowed;
    }
    set operators(declared) {
        this._allowed = whitelisted(declared, this._vocabulary());
        refreshOperators(this);
    }
    _operatorMenuWired = false;
    get value() {
        return this._tuple();
    }
    set value(v) {
        this._applyTuple(v);
    }
    _tuple() {
        const operator = this._operator.getAttribute('value');
        const values = operator === 'BETWEEN' ? [this._value1.value, this._value2.value] : [this._value1.value];
        return values.some((v) => v === '') ? undefined : [operator, ...values.map((v) => this._serialize(v))];
    }
    _applyTuple(v) {
        if (v == null) {
            this._value1.value = '';
            this._value2.value = '';
            return;
        }
        const [declared, ...values] = v;
        //a pinned operator wins over whatever the tuple carries
        const operator = this._allowed?.length === 1 ? this._allowed[0] : declared;
        this._showOperator(operator);
        this._value1.value = values[0] ? this._deserialize(values[0]) : values[0];
        this._value2.value = values[1] ? this._deserialize(values[1]) : values[1];
    }
    _showOperator(operator) {
        this._operator.setAttribute('value', operator);
        //the button carries the compact glyph, announced through its label: the
        //menu is where the localized words live
        this._operator.textContent = GLYPHS[operator] ?? operator;
        Attributes.set(this._operator, 'aria-label', operatorLabel(operator));
        Attributes.toggle(this._value2, 'hidden', operator !== 'BETWEEN');
    }
    _notifyChange() {
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
        this._value2.readOnly = v;
        super.readonly = v;
        //inert reaches the operator and sensitivity buttons, whose popovers an
        //input's readOnly cannot touch
        this._container.inert = v;
    }
    get disabled() {
        return super.disabled;
    }
    set disabled(d) {
        //the claim and the first operand are the base's, the second operand mirrors
        //the claim like the first one does
        super.disabled = d;
        Attributes.toggle(this._value2, 'disabled', d);
        //so do the chrome buttons, frozen by a pin, disabled by the claim, or both
        if (this._allowed) {
            syncOperatorControl(this._operator, this._allowed, d);
        }
        this._syncSensitivity();
    }
    _syncSensitivity() {}
}

class InstantFilter extends CompareFilter {
    _defaultOperator() {
        return 'LTE';
    }
    _type() {
        return 'datetime-local';
    }
    _serialize(v) {
        return new Date(v).toISOString();
    }
    _deserialize(v) {
        return Instant.isoToLocal(v);
    }
}

class LocalDateFilter extends CompareFilter {
    _type() {
        return 'date';
    }
}

class NumberFilter extends CompareFilter {
    _type() {
        return 'number';
    }
}

class TextFilter extends CompareFilter {
    static observed = [
        'value:json',
        'operators:csv',
        'sensitivities:csv',
        'readonly:presence',
        'required:presence',
        'placeholder',
    ];
    static template = `
        <label>{{{{ slots.default }}}}</label>
        {{{{ slots.info }}}}
        <ful-control-group>
            <ful-affix data-tpl-if="slots.ibefore">{{{{ slots.ibefore }}}}</ful-affix>
            {{{{ slots.before }}}}
            <ful-affix>
                <button data-ref="operator" type="button" form="" aria-expanded="false" aria-haspopup="true"></button>
                <ul popover role="menu"></ul>
                <button data-ref="sensitivity" type="button" form="" aria-expanded="false" aria-haspopup="true"></button>
                <ul popover role="menu"></ul>
            </ful-affix>
            <input data-ref="value1" data-tpl-type="type" form="">
            <input data-ref="value2" data-tpl-type="type" form="" hidden>
            {{{{ slots.after }}}}
            <ful-affix data-tpl-if="slots.iafter">{{{{ slots.iafter }}}}</ful-affix>
        </ful-control-group>
        <ful-field-error></ful-field-error>
    `;
    _defaultOperator() {
        return 'CONTAINS';
    }
    _vocabulary() {
        return TEXT_OPERATORS;
    }
    _sensitivities = [...SENSITIVITIES];
    //the sensitivity is carried through from whoever set the value, switched
    //through its own menu, or pinned to the single mode the sensitivities
    //attribute whitelists
    _sensitivity = 'IGNORE_CASE';
    _sensitivityButton;
    render(conf) {
        //before the value assignment, which normalizes against the whitelist
        this.sensitivities = conf.observed.sensitivities;
        super.render(conf);
        this._sensitivityButton = this.querySelector('[data-ref=sensitivity]');
        this._syncSensitivity();
        this.addEventListener('click', (evt) => {
            const target = /** @type HTMLElement */ (evt.target);
            const item = /** @type HTMLElement | null */ (target.closest('ul > li > a'));
            if (!item) {
                return;
            }
            if (this.matches(':disabled') || this.readonly) {
                return;
            }
            const btn = /** @type HTMLButtonElement */ (item.closest('ul')?.previousElementSibling);
            if (btn !== this._sensitivityButton) {
                return;
            }
            const value = /** @type String */ (item.getAttribute('value'));
            const previous = this._sensitivity;
            this._sensitivity = value;
            this._syncSensitivity();
            hideOperatorMenu(item);
            if (previous !== value) {
                this._notifyChange();
            }
        });
    }
    get sensitivities() {
        return this._sensitivities;
    }
    set sensitivities(declared) {
        this._sensitivities = whitelisted(declared, SENSITIVITIES);
        if (!this._sensitivities.includes(this._sensitivity)) {
            this._sensitivity = this._sensitivities[0];
        }
        this._syncSensitivity();
    }
    _syncSensitivity() {
        if (!this._sensitivityButton) {
            return;
        }
        const menu = this._sensitivityButton.nextElementSibling;
        fillMenu(menu, this._sensitivities, sensitivityLabel, SENSITIVITY_GLYPHS);
        if (!this._sensitivityMenuWired && this._sensitivities.length > 1) {
            wireOperatorMenu(this._sensitivityButton);
            this._sensitivityMenuWired = true;
        }
        //a pin freezes the control in place, like a pinned operator: same glyph,
        //documenting the mode, without the popup
        syncOperatorControl(this._sensitivityButton, this._sensitivities, this.hasAttribute('disabled'));
        this._sensitivityButton.setAttribute('value', this._sensitivity);
        this._sensitivityButton.textContent = SENSITIVITY_GLYPHS[this._sensitivity] ?? this._sensitivity;
        Attributes.set(this._sensitivityButton, 'aria-label', sensitivityLabel(this._sensitivity));
    }
    _sensitivityMenuWired = false;
    get value() {
        const tuple = this._tuple();
        return tuple == null ? undefined : [tuple[0], this._sensitivity, ...tuple.slice(1)];
    }
    set value(v) {
        if (v == null) {
            this._applyTuple(v);
            return;
        }
        if (this._sensitivities.includes(v[1])) {
            this._sensitivity = v[1];
        }
        this._applyTuple([v[0], ...v.slice(2)]);
        this._syncSensitivity();
    }
}

const BOOLEAN_VALUES = ['', 'true', 'false'];
const BOOLEAN_VALUE_GLYPHS = { true: '✓', false: '✗' };

class BooleanFilter extends Field {
    static observed = ['value:json', 'operators:csv', 'readonly:presence', 'required:presence'];
    static slots = true;
    static OPERATORS = ['EQ', 'NEQ'];
    static DEFAULT_OPERATOR = 'EQ';
    static template = `
        <label>{{{{ slots.default }}}}</label>
        {{{{ slots.info }}}}
        <ful-control-group>
            <ful-affix data-tpl-if="slots.ibefore">{{{{ slots.ibefore }}}}</ful-affix>
            {{{{ slots.before }}}}
            <ful-affix>
                <button data-ref="operator" type="button" form="" aria-expanded="false" aria-haspopup="true"></button>
                <ul popover role="menu"></ul>
            </ful-affix>
            <button data-ref="value" type="button" form=""></button>
            <ul popover role="menu"></ul>
            {{{{ slots.after }}}}
            <ful-affix data-tpl-if="slots.iafter">{{{{ slots.iafter }}}}</ful-affix>
        </ful-control-group>
        <ful-field-error></ful-field-error>
    `;
    _operator;
    _menu;
    _value;
    _container;
    _allowed;
    render({ slots, observed, disabled }) {
        const fragment = this.template().withOverlay({ slots }).render();
        this._container = fragment.querySelector('ful-control-group');
        this._operator = fragment.querySelector('[data-ref=operator]');
        this._menu = this._operator.nextElementSibling;
        this._value = fragment.querySelector('[data-ref=value]');
        this._adopt(this._value, fragment.querySelector('ful-field-error'));
        this.operators = observed.operators;
        this._showOperator(
            this._allowed.includes(BooleanFilter.DEFAULT_OPERATOR) ? BooleanFilter.DEFAULT_OPERATOR : this._allowed[0],
        );
        fillMenu(this._value.nextElementSibling, BOOLEAN_VALUES, booleanValueLabel, BOOLEAN_VALUE_GLYPHS);
        wireOperatorMenu(this._value);
        this._showValue('');
        this._wireLabel(fragment.querySelector('label'));
        this.disabled = disabled;
        this.readonly = observed.readonly;
        this.required = observed.required;
        this.value = observed.value;
        this.addEventListener('click', (evt) => {
            const target = /** @type HTMLElement */ (evt.target);
            const item = /** @type HTMLElement | null */ (target.closest('ul > li > a'));
            if (!item) {
                return;
            }
            if (this.matches(':disabled') || this.readonly) {
                return;
            }
            const btn = /** @type HTMLButtonElement */ (item.closest('ul')?.previousElementSibling);
            const value = /** @type String */ (item.getAttribute('value'));
            const previous = btn.getAttribute('value');
            btn.setAttribute('value', value);
            if (btn === this._operator) {
                this._showOperator(value);
            } else {
                this._showValue(value);
            }
            hideOperatorMenu(item);
            if (previous !== value) {
                this._notifyChange();
            }
        });
        this.replaceChildren(fragment);
    }
    get operators() {
        return this._allowed;
    }
    set operators(declared) {
        this._allowed = whitelisted(declared, this._vocabulary());
        refreshOperators(this);
    }
    _operatorMenuWired = false;
    _vocabulary() {
        return BooleanFilter.OPERATORS;
    }
    get value() {
        const operator = this._operator.getAttribute('value');
        return this._value.value === '' ? undefined : [operator, this._value.value];
    }
    set value(v) {
        if (v == null) {
            this._showValue('');
            return;
        }
        //a pinned operator wins over whatever the tuple carries
        const operator = this._allowed?.length === 1 ? this._allowed[0] : v[0];
        this._showOperator(operator);
        this._showValue(v[1] ?? '');
    }
    _showOperator(operator) {
        this._operator.setAttribute('value', operator);
        this._operator.textContent = GLYPHS[operator] ?? operator;
        Attributes.set(this._operator, 'aria-label', operatorLabel(operator));
    }
    _showValue(token) {
        this._value.value = token;
        this._value.innerText = booleanValueLabel(token);
    }
    _notifyChange() {
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
    //the base's native readOnly cannot freeze the popover buttons, so the whole
    //control group inerts
    get readonly() {
        return this._container.inert;
    }
    set readonly(v) {
        this._container.inert = v;
        this.reflect(() => {
            Attributes.toggle(this, 'readonly', v);
        });
    }
    get disabled() {
        return super.disabled;
    }
    set disabled(d) {
        super.disabled = d;
        Attributes.toggle(this._value, 'disabled', d);
        //the operator button is frozen by a pin, disabled by the claim, or both
        if (this._allowed) {
            syncOperatorControl(this._operator, this._allowed, d);
        }
    }
}

export { BooleanFilter, CompareFilter, InstantFilter, LocalDateFilter, NumberFilter, TextFilter };
