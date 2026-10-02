import { Localization } from '../../ftl/index.mjs';
import { ChoiceButton } from './choice-button.mjs';
import { Field } from './field.mjs';
import { Instant } from './temporals.mjs';
import { Input } from './input.mjs';
import { Select } from './select.mjs';

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

const { t } = Localization.of();
const operatorLabel = (op) => t(`filters.op.${op}`);
const sensitivityLabel = (sensitivity) => t(`filters.sensitivity.${sensitivity}`);
const booleanValueLabel = (token) => t(token === '' ? 'filters.boolean.any' : `filters.boolean.${token}`);

/**
 * What a filter currently filters on, in the words a reader sees: the text of
 * its label, the operator in force (null for a set membership filter declaring
 * none) and the non-empty operands as text. The operands are what the controls
 * show, such as a select's labels, not the keys the value carries.
 * @typedef {{ label: string|null, operator: string|null, operands: string[] }} FilterCriterion
 */

const labelTextOf = (filter) => filter.querySelector(':scope > label')?.textContent.trim() || null;

/**
 * Pins a button to the choice the singular attribute names, hiding it. A name
 * outside the vocabulary pins the fallback instead, and declaring the plural
 * beside the singular is ignored: both are warned about.
 * @param {HTMLElement & { declared(name: string): any }} el
 * @param {ChoiceButton} button
 * @param {{ singular: string, plural: string, vocabulary: string[], fallback: string }} names
 */
const fixChoice = (el, button, { singular, plural, vocabulary, fallback }) => {
    const fixed = el.declared(singular);
    if (fixed === null) {
        return;
    }
    if (el.hasAttribute(plural)) {
        console.warn(`${el.localName}: ${singular} fixes what ${plural} offers a menu for, the plural is ignored`, el);
    }
    const known = vocabulary.includes(fixed);
    if (!known) {
        console.warn(`${el.localName}: '${fixed}' is not one of its ${plural}, the default is pinned instead`, el);
    }
    button.allowed = [known ? fixed : fallback];
    button.fixed = true;
};

/** @returns {FilterCriterion|null} */
const asCriterion = (label, operator, operands) => {
    const shown = operands.filter((o) => o !== null && o !== undefined && `${o}` !== '');
    return shown.length === 0 ? null : { label, operator, operands: shown.map((o) => `${o}`) };
};

/**
 * The shared shape of every operator-and-operands filter: an operator menu, one
 * or two operands of the type the subclass declares, and a tuple that mirrors
 * the data-jpa compare annotations.
 *
 * The value is `[operator, operand]`, or `[operator, from, to]` for BETWEEN,
 * the only operator that shows the second operand. The `operators` attribute
 * whitelists the menu; the `operator` attribute fixes the operator for the
 * element's life instead, hiding its button, and every tuple then carries it.
 * Declaring both warns and the singular wins; a fixed name outside the
 * vocabulary warns and fixes the default operator.
 *
 * Both operands mirror the disabled and readonly claims, and readonly also
 * refuses the clicks that would open the operator menu. The change event fires
 * when either operand changes or a different operator is picked.
 */
class CompareFilter extends Input {
    static observed = ['value:json', 'operators:csv'];
    static attributes = ['operator'];
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
        this.operators = this.declared('operators');
        if (this._operator.value === null) {
            this._showDefaultOperator();
        }
        fixChoice(this, this._operator, {
            singular: 'operator',
            plural: 'operators',
            vocabulary: this._vocabulary(),
            fallback: this._defaultOperator(),
        });
        return { ...pieces, freeze: this._container, also: [this._value2] };
    }
    _showDefaultOperator() {
        this._showOperator(this._operator.preferring(this._defaultOperator()));
    }
    /**
     * Restores the declared `value` tuple, operator included, as a field reset
     * does. Without a `value` attribute it empties the operands and also shows
     * the default operator again, or the first whitelisted one where the
     * default is not allowed.
     */
    formResetCallback() {
        super.formResetCallback();
        if (!this.hasAttribute('value')) {
            this._showDefaultOperator();
        }
    }
    /**
     * The native input type both operands render with.
     * @returns {string}
     */
    _type() {
        return 'text';
    }
    /**
     * Converts an operand from its input's value to the form the tuple carries.
     * @param {string} v
     * @returns {string|null}
     */
    _serialize(v) {
        return v;
    }
    /**
     * Converts an operand from the tuple to the value its input shows.
     * @param {string} v
     * @returns {string}
     */
    _deserialize(v) {
        return v;
    }
    /**
     * The operator shown on render and after a valueless reset, when the whitelist allows it.
     * @returns {string}
     */
    _defaultOperator() {
        return 'EQ';
    }
    /**
     * Every operator the filter knows, which `operators` narrows.
     * @returns {string[]}
     */
    _vocabulary() {
        return COMPARE_OPERATORS;
    }
    _declaredOperators;
    /**
     * The operators the menu offers, narrowed to the vocabulary: an empty list,
     * or one where no name is known, offers all of it. A single operator pins
     * the button, and an assigned tuple then carries that operator whatever it
     * names. An assignment made before the upgrade is held narrowed and
     * answered back until the render, when the `operators` attribute is applied
     * over it, an absent attribute meaning the whole vocabulary. Assignments are
     * ignored while the `operator` attribute fixes the operator.
     * @returns {string[]|undefined} undefined before the upgrade when nothing was assigned
     */
    get operators() {
        return this._operator ? this._operator.allowed : this._declaredOperators;
    }
    /** @param {string[]|null} declared */
    set operators(declared) {
        if (this.declared('operator') !== null) {
            return;
        }
        if (!this._operator) {
            this._declaredOperators = ChoiceButton.narrow(declared, this._vocabulary());
            return;
        }
        this._operator.allowed = declared;
        this._syncBetween();
    }
    /**
     * The filter's tuple, `[operator, operand]` or `[operator, from, to]` for
     * BETWEEN, each operand converted by `_serialize` (an ISO instant for the
     * instant filter). Null while any operand the operator uses is empty.
     * @returns {any[]|null}
     */
    get value() {
        return this._tuple();
    }
    /**
     * Shows a tuple: the operator it names, unless a pinned or fixed operator
     * replaces it, and its operands, an operand missing from a shorter tuple
     * leaving its input empty. Null or undefined empties both operands and
     * keeps the operator.
     * @param {any[]|null|undefined} v
     */
    set value(v) {
        this._applyTuple(v);
    }
    _tuple() {
        const operator = this._operator.value;
        const values = this.#operands();
        return values.some((v) => v === '') ? null : [operator, ...values.map((v) => this._serialize(v))];
    }
    _applyTuple(v) {
        if (v == null) {
            this._value1.value = '';
            this._value2.value = '';
            return;
        }
        const [declared, ...values] = v;
        const operator = this._operator.pinned ? this._operator.allowed[0] : declared;
        this._showOperator(operator);
        this._value1.value = values[0] ? this._deserialize(values[0]) : (values[0] ?? '');
        this._value2.value = values[1] ? this._deserialize(values[1]) : (values[1] ?? '');
    }
    _showOperator(operator) {
        this._operator.value = operator;
        this._syncBetween();
    }
    /** Shows the second operand only while the operator is BETWEEN. */
    _syncBetween() {
        this._value2.toggleAttribute('hidden', this._operator.value !== 'BETWEEN');
    }
    /**
     * The operator and the operands the operator uses, as their inputs show
     * them rather than as serialized: a date filter describes what is in its
     * control, not the ISO string it sends. Null while every one of those
     * operands is empty, so a BETWEEN with one bound answers that bound while
     * its value is still null.
     * @returns {FilterCriterion|null}
     */
    get criterion() {
        return asCriterion(labelTextOf(this), this._operator.value, this.#operands());
    }
    #operands() {
        return this._operator.value === 'BETWEEN' ? [this._value1.value, this._value2.value] : [this._value1.value];
    }
    /**
     * The field's own disabled claim. Setting it disables both operands and
     * every menu button the filter composes; a button pinned to one choice
     * stays disabled when the claim is lifted.
     * @returns {boolean}
     */
    get disabled() {
        return super.disabled;
    }
    /** @param {boolean} d */
    set disabled(d) {
        super.disabled = d;
        for (const choice of this._choices()) {
            choice.claimed = d;
        }
    }
    /**
     * The menu buttons the filter composes, which the disabled claim reaches. A
     * subclass adding a menu appends its own to the base's.
     * @returns {ChoiceButton[]}
     */
    _choices() {
        return [this._operator].filter((c) => c);
    }
}

/**
 * The compare filter over ISO instants, defaulting to LTE. The operands are
 * shown as local date and time in the page's timezone and carried in the tuple
 * as UTC ISO instants.
 */
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

/**
 * The compare filter over text, defaulting to CONTAINS and adding CONTAINS,
 * STARTS_WITH and ENDS_WITH to the compare operators.
 *
 * Its tuple carries a case sensitivity after the operator, `[operator,
 * sensitivity, operand]` or `[operator, sensitivity, from, to]`, the
 * sensitivity being IGNORE_CASE (the default) or CASE_SENSITIVE and switched
 * through a second menu. The `sensitivities` attribute whitelists that menu and
 * `sensitivity` fixes one mode, with the same rules and warnings as
 * `operators` and `operator`.
 */
class TextFilter extends CompareFilter {
    static observed = ['sensitivities:csv'];
    static attributes = ['sensitivity'];
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
        fixChoice(this, this._sensitivityButton, {
            singular: 'sensitivity',
            plural: 'sensitivities',
            vocabulary: SENSITIVITIES,
            fallback: 'IGNORE_CASE',
        });
        return pieces;
    }
    _choices() {
        return [...super._choices(), this._sensitivityButton].filter((c) => c);
    }
    get _sensitivity() {
        return this._sensitivityButton.value;
    }
    _declaredSensitivities;
    /**
     * The sensitivities the menu offers, narrowed to IGNORE_CASE and
     * CASE_SENSITIVE: an empty list, or one where no name is known, offers both.
     * When the mode shown leaves the list, the first listed one is shown. Held
     * before the upgrade and ignored under a fixed `sensitivity`, as `operators` is.
     * @returns {string[]|undefined} undefined before the upgrade when nothing was assigned
     */
    get sensitivities() {
        return this._sensitivityButton ? this._sensitivityButton.allowed : this._declaredSensitivities;
    }
    /** @param {string[]|null} declared */
    set sensitivities(declared) {
        if (this.declared('sensitivity') !== null) {
            return;
        }
        if (!this._sensitivityButton) {
            this._declaredSensitivities = ChoiceButton.narrow(declared, SENSITIVITIES);
            return;
        }
        const previous = this._sensitivityButton.value;
        this._sensitivityButton.allowed = declared;
        this._sensitivityButton.value = this._sensitivityButton.preferring(previous);
    }
    /**
     * The tuple with the sensitivity after the operator, `[operator,
     * sensitivity, ...operands]`. Null while any operand the operator uses is empty.
     * @returns {any[]|null}
     */
    get value() {
        const tuple = this._tuple();
        return tuple == null ? null : [tuple[0], this._sensitivity, ...tuple.slice(1)];
    }
    /**
     * Shows a tuple as the compare filter does, reading the sensitivity at
     * index 1. A sensitivity the whitelist does not allow leaves the current
     * one in place. Null or undefined empties the operands and keeps the
     * operator and the sensitivity.
     * @param {any[]|null|undefined} v
     */
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
    /**
     * Restores the declared `value` tuple, sensitivity included. Without a
     * `value` attribute it also shows the default operator and IGNORE_CASE
     * again, or the first whitelisted mode where IGNORE_CASE is not allowed.
     */
    formResetCallback() {
        super.formResetCallback();
        if (!this.hasAttribute('value')) {
            this._sensitivityButton.value = this._sensitivityButton.preferring('IGNORE_CASE');
        }
    }
}

const BOOLEAN_VALUES = ['', 'true', 'false'];
const BOOLEAN_VALUE_GLYPHS = { true: '✓', false: '✗' };

/**
 * The boolean filter: an EQ or NEQ operator menu and a value menu of any, yes
 * and no, the value button showing the localized word.
 *
 * The value is `[operator, 'true']` or `[operator, 'false']`, null while the
 * value menu is on any. The `operators` attribute whitelists the operator menu
 * as on the compare filters. The disabled claim reaches the value button and
 * both menus, and readonly refuses the clicks that would open them. The
 * required and readonly claims reflect on the host only: no `aria-required` or
 * `aria-readonly` is written, since the value button's role accepts neither.
 */
class BooleanFilter extends Field {
    static observed = ['value:json', 'operators:csv'];
    static slots = true;
    /**
     * The operators the filter knows, which `operators` narrows.
     * @type {string[]}
     */
    static OPERATORS = ['EQ', 'NEQ'];
    /**
     * The operator shown on render and after a valueless reset, or the first
     * whitelisted one where the whitelist excludes it.
     * @type {string}
     */
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
        const valueButton = /** @type {HTMLElement} */ (fragment.querySelector('[data-ref=value]'));
        this._operator = new ChoiceButton(/** @type {HTMLElement} */ (fragment.querySelector('[data-ref=operator]')), {
            vocabulary: BooleanFilter.OPERATORS,
            glyphs: GLYPHS,
            labelFor: operatorLabel,
            interactive: () => this._interactive(),
            onPick: () => this._notifyChange(),
        });
        this._value = new ChoiceButton(valueButton, {
            vocabulary: BOOLEAN_VALUES,
            glyphs: BOOLEAN_VALUE_GLYPHS,
            labelFor: booleanValueLabel,
            display: booleanValueLabel,
            interactive: () => this._interactive(),
            onPick: () => this._notifyChange(),
        });
        this.operators = this.declared('operators');
        this._operator.value = this._operator.preferring(BooleanFilter.DEFAULT_OPERATOR);
        this._value.allowed = null;
        this._value.value = '';
        return {
            fragment,
            control: valueButton,
            error: fragment.querySelector('ful-field-error'),
            label: fragment.querySelector('label'),
            announces: null,
            freeze: this._container,
        };
    }
    _declaredOperators;
    /**
     * The operators the menu offers, narrowed to EQ and NEQ: an empty list, or
     * one where no name is known, offers both, and a single one pins the
     * button. Held before the upgrade and replaced by the `operators` attribute
     * at the render, as on the compare filters.
     * @returns {string[]|undefined} undefined before the upgrade when nothing was assigned
     */
    get operators() {
        return this._operator ? this._operator.allowed : this._declaredOperators;
    }
    /** @param {string[]|null} declared */
    set operators(declared) {
        if (!this._operator) {
            this._declaredOperators = ChoiceButton.narrow(declared, this._vocabulary());
            return;
        }
        this._operator.allowed = declared;
    }
    /** @returns {string[]} */
    _vocabulary() {
        return BooleanFilter.OPERATORS;
    }
    /**
     * `[operator, token]`, the token being 'true' or 'false'; null while the value menu is on any.
     * @returns {string[]|null}
     */
    get value() {
        return this._value.value === '' ? null : [this._operator.value, this._value.value];
    }
    /**
     * Shows a tuple: its operator, unless a pinned operator replaces it, and its
     * token, a missing token meaning any. Null or undefined sets the value menu
     * back to any and keeps the operator.
     * @param {any[]|null|undefined} v
     */
    set value(v) {
        if (v == null) {
            this._value.value = '';
            return;
        }
        this._operator.value = this._operator.pinned ? this._operator.allowed[0] : v[0];
        this._value.value = v[1] ?? '';
    }
    /**
     * Restores the declared `value` tuple. Without a `value` attribute it sets
     * the value menu back to any and also shows the default operator again.
     */
    formResetCallback() {
        super.formResetCallback();
        if (!this.hasAttribute('value')) {
            this._operator.value = this._operator.preferring(BooleanFilter.DEFAULT_OPERATOR);
        }
    }
    /**
     * The operator and the localized word the value menu shows, not the token.
     * Null while the value menu is on any.
     * @returns {FilterCriterion|null}
     */
    get criterion() {
        const token = this._value.value;
        return asCriterion(labelTextOf(this), this._operator.value, [token === '' ? '' : booleanValueLabel(token)]);
    }
    /**
     * The field's own disabled claim. Setting it disables the value button and
     * both menu buttons; an operator button pinned to one choice stays disabled
     * when the claim is lifted.
     * @returns {boolean}
     */
    get disabled() {
        return super.disabled;
    }
    /** @param {boolean} d */
    set disabled(d) {
        super.disabled = d;
        for (const choice of [this._operator, this._value].filter((c) => c)) {
            choice.claimed = d;
        }
    }
}

/**
 * Set membership over a select's vocabulary, answering for both of data-jpa's
 * set annotations: InEnum and InList take the same bare array of values and no
 * operator, differing only in what the server converts them to. A declared
 * `operator` attribute is sent in front of the keys instead, for a server field
 * that reads the set through a compare.
 */
class InFilter extends Select {
    static attributes = ['operator'];
    #keys() {
        const chosen = super.value;
        if (this.multiple) {
            return chosen;
        }
        return chosen === null || chosen === undefined ? [] : [chosen];
    }
    /**
     * The chosen keys as an array, a single choice included, led by the
     * declared `operator` when there is one. Null while nothing is chosen, so
     * that a table drops the filter instead of sending an empty set that
     * matches nothing.
     * @returns {any[]|null}
     */
    get value() {
        const keys = this.#keys();
        if (keys.length === 0) {
            return null;
        }
        const operator = this.declared('operator');
        return operator ? [operator, ...keys] : keys;
    }
    /**
     * Selects the keys of an array or a single bare key; a leading element equal
     * to the declared `operator` is dropped first, so the filter takes back what
     * it answered. A single select takes the first key. Null or undefined clears
     * the selection.
     * @param {any} v
     */
    set value(v) {
        const operator = this.declared('operator');
        let keys = v === null || v === undefined ? [] : Array.isArray(v) ? v : [v];
        if (operator && keys[0] === operator) {
            keys = keys.slice(1);
        }
        super.value = this.multiple ? keys : (keys[0] ?? null);
    }
    /**
     * The declared operator, or null, and the labels of the chosen entries. Null
     * while nothing is chosen.
     * @returns {FilterCriterion|null}
     */
    get criterion() {
        return asCriterion(
            labelTextOf(this),
            this.declared('operator'),
            [super.entry]
                .flat()
                .filter((e) => e)
                .map((e) => /** @type {{ label: string }} */ (e).label),
        );
    }
}

export { BooleanFilter, CompareFilter, InFilter, InstantFilter, LocalDateFilter, NumberFilter, TextFilter };
