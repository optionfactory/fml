import { Localization } from '../../ftl/index.mjs';
import { ChoiceButton } from './choice-button.mjs';
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

/**
 * The shared shape of every operator-and-operands filter: an operator menu, one
 * or two operands of the type the subclass declares, and a tuple that mirrors
 * the data-jpa compare annotations.
 */
class CompareFilter extends Input {
    static observed = ['value:json', 'operators:csv'];
    static OPERATORS = COMPARE_OPERATORS;
    static DEFAULT_OPERATOR = 'EQ';
    static template = `
        <label>{{{{ slots.default }}}}</label>
        {{{{ slots.info }}}}
        <ful-control-group>
            <ful-affix data-tpl-if="slots.before">{{{{ slots.before }}}}</ful-affix>
            <ful-affix>
                <button data-ref="operator" type="button" form="" aria-expanded="false" aria-haspopup="true"></button>
                <ul popover role="menu"></ul>
            </ful-affix>
            <ful-control>
                <input data-ref="value1" data-tpl-type="type" form="">
                <input data-ref="value2" data-tpl-type="type" form="" hidden>
            </ful-control>
            <ful-affix data-tpl-if="slots.after">{{{{ slots.after }}}}</ful-affix>
        </ful-control-group>
        <ful-field-error></ful-field-error>
    `;
    _operator;
    _container;
    _value1;
    _value2;
    _build(conf) {
        const pieces = super._build(conf);
        const fragment = pieces.fragment;
        this._container = fragment.querySelector('ful-control-group');
        this._value1 = fragment.querySelector('[data-ref=value1]');
        this._value2 = fragment.querySelector('[data-ref=value2]');
        this._operator = new ChoiceButton(/** @type HTMLElement */ (fragment.querySelector('[data-ref=operator]')), {
            vocabulary: this._vocabulary(),
            glyphs: GLYPHS,
            labelFor: operatorLabel,
            interactive: () => this._interactive(),
            onPick: () => {
                this._syncBetween();
                this._notifyChange();
            },
        });
        //the default operator below reads the whitelist, so it is resolved here
        //rather than waiting for the base's declared pass
        this.operators = this.declared('operators');
        //Input.render only re-dispatches changes coming from the first operand
        this._value2.addEventListener('change', (evt) => {
            evt.stopPropagation();
            this._notifyChange();
        });
        if (this._operator.value === null) {
            this._showDefaultOperator();
        }
        //the second operand mirrors the claims like the first one does, and the
        //freeze reaches the operator and sensitivity buttons, whose popovers an
        //input's readOnly cannot touch
        return { ...pieces, freeze: this._container, also: [this._value2] };
    }
    _showDefaultOperator() {
        const preferred = this._defaultOperator();
        const allowed = this._operator.allowed;
        this._showOperator(allowed.includes(preferred) ? preferred : allowed[0]);
    }
    formResetCallback() {
        //a declared tuple restores its operator through the base's assignment; a
        //valueless reset also brings the operator back to the default it rendered with
        super.formResetCallback();
        if (!this.hasAttribute('value')) {
            this._showDefaultOperator();
        }
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
    _declaredOperators;
    get operators() {
        //a page may whitelist before the upgrade: the narrowed set is held until
        //the button exists, and the declared attribute lands over it when the
        //base applies the declared state
        return this._operator ? this._operator.allowed : this._declaredOperators;
    }
    set operators(declared) {
        if (!this._operator) {
            this._declaredOperators = ChoiceButton.narrow(declared, this._vocabulary());
            return;
        }
        this._operator.allowed = declared;
        this._syncBetween();
    }
    get value() {
        return this._tuple();
    }
    set value(v) {
        this._applyTuple(v);
    }
    _tuple() {
        const operator = this._operator.value;
        const values = operator === 'BETWEEN' ? [this._value1.value, this._value2.value] : [this._value1.value];
        return values.some((v) => v === '') ? null : [operator, ...values.map((v) => this._serialize(v))];
    }
    _applyTuple(v) {
        if (v == null) {
            this._value1.value = '';
            this._value2.value = '';
            return;
        }
        const [declared, ...values] = v;
        //a pinned operator wins over whatever the tuple carries
        const operator = this._operator.pinned ? this._operator.allowed[0] : declared;
        this._showOperator(operator);
        //a tuple shorter than the operands leaves the missing ones empty: the DOM
        //would stringify a nullish assignment to "undefined"
        this._value1.value = values[0] ? this._deserialize(values[0]) : (values[0] ?? '');
        this._value2.value = values[1] ? this._deserialize(values[1]) : (values[1] ?? '');
    }
    _showOperator(operator) {
        this._operator.value = operator;
        this._syncBetween();
    }
    /** only a BETWEEN carries a second operand */
    _syncBetween() {
        this._value2.toggleAttribute('hidden', this._operator.value !== 'BETWEEN');
    }
    get disabled() {
        return super.disabled;
    }
    set disabled(d) {
        //the claim and both operands are the base's; the chrome buttons are not,
        //frozen by a pin, disabled by the claim, or both
        super.disabled = d;
        for (const choice of this._choices()) {
            choice.claimed = d;
        }
    }
    /** every menu button the filter composes, so one claim reaches them all */
    _choices() {
        return [this._operator].filter((c) => c);
    }
}

/** The compare filter over ISO instants, defaulting to LTE. */
class InstantFilter extends CompareFilter {
    _defaultOperator() {
        return 'LTE';
    }
    _type() {
        return 'datetime-local';
    }
    _serialize(v) {
        return Instant.localToIso(v);
    }
    _deserialize(v) {
        return Instant.isoToLocal(v);
    }
}

/** The compare filter over dates. */
class LocalDateFilter extends CompareFilter {
    _type() {
        return 'date';
    }
}

/** The compare filter over numbers. */
class NumberFilter extends CompareFilter {
    _type() {
        return 'number';
    }
}

/** The compare filter over text, carrying a case sensitivity beside the operator. */
class TextFilter extends CompareFilter {
    static observed = ['sensitivities:csv'];
    static template = `
        <label>{{{{ slots.default }}}}</label>
        {{{{ slots.info }}}}
        <ful-control-group>
            <ful-affix data-tpl-if="slots.before">{{{{ slots.before }}}}</ful-affix>
            <ful-affix>
                <button data-ref="operator" type="button" form="" aria-expanded="false" aria-haspopup="true"></button>
                <ul popover role="menu"></ul>
                <button data-ref="sensitivity" type="button" form="" aria-expanded="false" aria-haspopup="true"></button>
                <ul popover role="menu"></ul>
            </ful-affix>
            <ful-control>
                <input data-ref="value1" data-tpl-type="type" form="">
                <input data-ref="value2" data-tpl-type="type" form="" hidden>
            </ful-control>
            <ful-affix data-tpl-if="slots.after">{{{{ slots.after }}}}</ful-affix>
        </ful-control-group>
        <ful-field-error></ful-field-error>
    `;
    _defaultOperator() {
        return 'CONTAINS';
    }
    _vocabulary() {
        return TEXT_OPERATORS;
    }
    //the sensitivity is carried through from whoever set the value, switched
    //through its own menu, or pinned to the single mode the sensitivities
    //attribute whitelists
    _sensitivityButton;
    _build(conf) {
        const pieces = super._build(conf);
        this._sensitivityButton = new ChoiceButton(
            /** @type HTMLElement */ (pieces.fragment.querySelector('[data-ref=sensitivity]')),
            {
                vocabulary: SENSITIVITIES,
                glyphs: SENSITIVITY_GLYPHS,
                labelFor: sensitivityLabel,
                interactive: () => this._interactive(),
                onPick: () => this._notifyChange(),
            },
        );
        this._sensitivityButton.allowed = null;
        this._sensitivityButton.value = SENSITIVITIES[0];
        return pieces;
    }
    _choices() {
        return [...super._choices(), this._sensitivityButton].filter((c) => c);
    }
    get _sensitivity() {
        return this._sensitivityButton.value;
    }
    _declaredSensitivities;
    get sensitivities() {
        return this._sensitivityButton ? this._sensitivityButton.allowed : this._declaredSensitivities;
    }
    set sensitivities(declared) {
        if (!this._sensitivityButton) {
            this._declaredSensitivities = ChoiceButton.narrow(declared, SENSITIVITIES);
            return;
        }
        const previous = this._sensitivityButton.value;
        this._sensitivityButton.allowed = declared;
        if (!this._sensitivityButton.allowed.includes(previous)) {
            this._sensitivityButton.value = this._sensitivityButton.allowed[0];
        }
    }
    get value() {
        const tuple = this._tuple();
        return tuple == null ? null : [tuple[0], this._sensitivity, ...tuple.slice(1)];
    }
    set value(v) {
        if (v == null) {
            this._applyTuple(v);
            return;
        }
        if (this._sensitivityButton.allowed.includes(v[1])) {
            this._sensitivityButton.value = v[1];
        }
        this._applyTuple([v[0], ...v.slice(2)]);
    }
    formResetCallback() {
        //a declared tuple restores its sensitivity through the value assignment;
        //a valueless reset brings it back to the default it rendered with, the
        //class default normalized against the whitelist
        super.formResetCallback();
        if (!this.hasAttribute('value')) {
            const allowed = this._sensitivityButton.allowed;
            this._sensitivityButton.value = allowed.includes('IGNORE_CASE') ? 'IGNORE_CASE' : allowed[0];
        }
    }
}

const BOOLEAN_VALUES = ['', 'true', 'false'];
const BOOLEAN_VALUE_GLYPHS = { true: '✓', false: '✗' };

/** The boolean filter: an EQ or NEQ operator and an any/yes/no menu. */
class BooleanFilter extends Field {
    static observed = ['value:json', 'operators:csv'];
    static slots = true;
    static OPERATORS = ['EQ', 'NEQ'];
    static DEFAULT_OPERATOR = 'EQ';
    static template = `
        <label>{{{{ slots.default }}}}</label>
        {{{{ slots.info }}}}
        <ful-control-group>
            <ful-affix data-tpl-if="slots.before">{{{{ slots.before }}}}</ful-affix>
            <ful-affix>
                <button data-ref="operator" type="button" form="" aria-expanded="false" aria-haspopup="true"></button>
                <ul popover role="menu"></ul>
            </ful-affix>
            <button data-ref="value" type="button" form=""></button>
            <ul popover role="menu"></ul>
            <ful-affix data-tpl-if="slots.after">{{{{ slots.after }}}}</ful-affix>
        </ful-control-group>
        <ful-field-error></ful-field-error>
    `;
    _operator;
    _value;
    _container;
    _build({ slots }) {
        const fragment = this.template().withOverlay({ slots }).render();
        this._container = fragment.querySelector('ful-control-group');
        const valueButton = fragment.querySelector('[data-ref=value]');
        this._operator = new ChoiceButton(fragment.querySelector('[data-ref=operator]'), {
            vocabulary: BooleanFilter.OPERATORS,
            glyphs: GLYPHS,
            labelFor: operatorLabel,
            interactive: () => this._interactive(),
            onPick: () => this._notifyChange(),
        });
        //the value button carries the word rather than a glyph: 'any' has none
        this._value = new ChoiceButton(valueButton, {
            vocabulary: BOOLEAN_VALUES,
            glyphs: BOOLEAN_VALUE_GLYPHS,
            labelFor: booleanValueLabel,
            display: booleanValueLabel,
            interactive: () => this._interactive(),
            onPick: () => this._notifyChange(),
        });
        this.operators = this.declared('operators');
        const allowed = this._operator.allowed;
        this._operator.value = allowed.includes(BooleanFilter.DEFAULT_OPERATOR)
            ? BooleanFilter.DEFAULT_OPERATOR
            : allowed[0];
        this._value.allowed = null;
        this._value.value = '';
        return {
            fragment,
            control: valueButton,
            error: fragment.querySelector('ful-field-error'),
            label: fragment.querySelector('label'),
            //a button accepts neither aria-readonly nor aria-required
            announces: null,
            freeze: this._container,
        };
    }
    _declaredOperators;
    get operators() {
        //a page may whitelist before the upgrade: the narrowed set is held until
        //the button exists, and the declared attribute lands over it when the
        //base applies the declared state
        return this._operator ? this._operator.allowed : this._declaredOperators;
    }
    set operators(declared) {
        if (!this._operator) {
            this._declaredOperators = ChoiceButton.narrow(declared, this._vocabulary());
            return;
        }
        this._operator.allowed = declared;
    }
    _vocabulary() {
        return BooleanFilter.OPERATORS;
    }
    get value() {
        return this._value.value === '' ? null : [this._operator.value, this._value.value];
    }
    set value(v) {
        if (v == null) {
            this._value.value = '';
            return;
        }
        //a pinned operator wins over whatever the tuple carries
        this._operator.value = this._operator.pinned ? this._operator.allowed[0] : v[0];
        this._value.value = v[1] ?? '';
    }
    get disabled() {
        return super.disabled;
    }
    set disabled(d) {
        super.disabled = d;
        //the menu buttons are frozen by a pin, disabled by the claim, or both
        for (const choice of [this._operator, this._value].filter((c) => c)) {
            choice.claimed = d;
        }
    }
}

export { BooleanFilter, CompareFilter, InstantFilter, LocalDateFilter, NumberFilter, TextFilter };
