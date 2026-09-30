import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';
import { appended } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const mount = async (html) => {
    const container = appended(html);
    const el = container.firstElementChild;
    await Rendering.waitFor(el);
    return [el, container, el.querySelector('input'), el.querySelector('label')];
};

/** records every change event seen at the container, so duplicates are visible */
const changes = (container) => {
    const seen = [];
    container.addEventListener('change', (evt) => seen.push(evt));
    return seen;
};

describe('Checkbox toggling', () => {
    it('toggles the value when the label is clicked, the label being bound to the input by for and id', async () => {
        const [el, , input, label] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);

        label.click();
        assert.isTrue(el.value, 'a click on the label, bound to the input by for and id, checks the box');
        assert.isTrue(input.checked, 'the inner input follows the value');

        label.click();
        assert.isFalse(el.value, 'a second click on the label unchecks the box');
        assert.isFalse(input.checked, 'the inner input follows the value back to unchecked');
    });

    it('announces each toggle with a single bubbling change carrying the new value', async () => {
        const [el, container, , label] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);
        const seen = changes(container);

        label.click();

        assert.lengthOf(seen, 1, 'exactly one change per toggle');
        assert.strictEqual(seen[0].target, el, 'the host is the source, not the inner input');
        assert.deepStrictEqual(seen[0].detail, { value: true }, 'the change detail carries the new value');
    });

    it('republishes the inner input change as its own, so listeners never see it twice', async () => {
        const [el, container, input] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);
        const seen = changes(container);

        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));

        assert.lengthOf(seen, 1, 'the inner change must be stopped and replaced, not forwarded too');
        assert.strictEqual(seen[0].target, el, 'the republished change comes from the host, not from the inner input');
        assert.deepStrictEqual(
            seen[0].detail,
            { value: true },
            'the republished change carries the new value in its detail',
        );
    });

    it('ignores label clicks while readonly', async () => {
        const [el, container, , label] = await mount(
            `<ful-checkbox name="a" readonly value="true">label</ful-checkbox>`,
        );
        const seen = changes(container);

        label.click();

        assert.isTrue(el.value, 'the value is left alone');
        assert.lengthOf(seen, 0, 'and nothing is announced');
    });

    it('ignores label clicks while disabled', async () => {
        const [el, container, , label] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);
        el.disabled = true;
        const seen = changes(container);

        label.click();

        assert.isFalse(el.value, 'a click on the label of a disabled checkbox does not toggle it');
        assert.lengthOf(seen, 0, 'a disabled checkbox announces no change');
    });
});

describe('Checkbox value', () => {
    it('reads and writes the checked state of the inner input', async () => {
        const [el, , input] = await mount(`<ful-checkbox name="a" value="true">label</ful-checkbox>`);
        assert.isTrue(input.checked, 'value:bool checks the box at render');

        el.value = false;
        assert.isFalse(input.checked, 'writing false to the value unchecks the inner input');

        input.checked = true;
        assert.isTrue(el.value, 'the input is the single source of truth');
    });

    it('follows a later value attribute change, where only the string true means checked', async () => {
        const [el, , input] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);

        el.setAttribute('value', 'true');
        assert.isTrue(input.checked, 'a later value attribute of true checks the box');

        el.setAttribute('value', 'false');
        assert.isFalse(
            input.checked,
            'a later value attribute of false unchecks it, only the text true meaning checked',
        );
    });
});

describe('Checkbox states', () => {
    it('freezes readonly without leaving the accessibility tree, so the value stays readable', async () => {
        const [el] = await mount(`<ful-checkbox name="a" readonly value="true">label</ful-checkbox>`);
        const box = el.firstElementChild;
        const input = el.querySelector('input');

        assert.isFalse(box.inert, 'inert would take the whole choice out of the accessibility tree');
        assert.strictEqual(input.getAttribute('aria-readonly'), 'true', 'the claim is announced instead');
        assert.isTrue(el.readonly, 'the readonly attribute is read into the readonly property');
        assert.isFalse(input.hasAttribute('disabled'), 'a disabled input would drop the value on submit');

        input.click();
        assert.isTrue(el.value, 'a click on a readonly checkbox does not toggle it');

        el.removeAttribute('readonly');
        assert.isFalse(el.readonly, 'removing the readonly attribute lifts the readonly property');
        assert.isNull(
            input.getAttribute('aria-readonly'),
            'aria-readonly is removed from the input once the claim is lifted',
        );
        input.click();
        assert.isFalse(el.value, 'and it toggles again once the claim is lifted');
    });

    it('reflects readonly and required set as properties back onto the host attributes', async () => {
        const [el, , input] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);

        el.readonly = true;
        el.required = true;

        assert.isTrue(el.hasAttribute('readonly'), 'the readonly property is reflected to the host attribute');
        assert.isTrue(el.hasAttribute('required'), 'the required property is reflected to the host attribute');
        assert.strictEqual(input.getAttribute('aria-required'), 'true', 'required is announced to screen readers');
        assert.isTrue(el.required, 'the required property reads back what was written');

        el.required = false;
        assert.isFalse(el.hasAttribute('required'), 'writing false to required removes the host attribute');
        assert.isFalse(
            input.hasAttribute('aria-required'),
            'writing false to required removes aria-required from the input',
        );
    });

    it('forwards focus to the inner input, so labels and form navigation land on something focusable', async () => {
        const [el, , input] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);

        el.focus();

        assert.strictEqual(document.activeElement, input, 'focus() on the host lands on the inner input');
    });
});

describe('Checkbox validity', () => {
    it('renders a custom validity message into its field error and clears it again', async () => {
        const [el] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);
        const fieldError = el.querySelector('ful-field-error');

        el.setCustomValidity('required');

        assert.strictEqual(
            fieldError.innerText,
            'required',
            'the custom validity message is rendered in the field error',
        );
        assert.isTrue(el.internals.validity.customError, 'and the element reports itself invalid');

        el.setCustomValidity(null);

        assert.strictEqual(fieldError.innerText, '', 'a null custom validity empties the rendered error');
        assert.isTrue(el.internals.validity.valid, 'a null custom validity makes the checkbox valid again');
    });

    it('describes the input by its field error, so the message is read out with the control', async () => {
        const [el, , input] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);

        const fieldError = el.querySelector('ful-field-error');
        assert.isNotEmpty(fieldError.id, 'the error region is given an id to be pointed at');
        assert.strictEqual(
            input.getAttribute('aria-describedby'),
            fieldError.id,
            'the input is described by the field error, so the message is read out with the control',
        );
    });

    it('names the input with for and id, so the dom carries the association', async () => {
        const [, , input, label] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);

        assert.isNotEmpty(input.id, 'the control is given an id to be pointed at');
        assert.strictEqual(label.getAttribute('for'), input.id, 'the label points at the input through for');
        assert.lengthOf(input.labels, 1, 'the platform sees the association, not only the a11y tree');
        assert.isTrue(input.labels[0] === label, 'the one label the platform associates is the rendered label');
    });
});

describe('Checkbox rendering', () => {
    it('renders the switch variant with the switch role, and the plain one without it', async () => {
        const [el, , input] = await mount(`<ful-checkbox name="a" type="switch">label</ful-checkbox>`);

        assert.strictEqual(
            el.firstElementChild.localName,
            'ful-choice',
            'the switch variant renders its choice in a ful-choice container',
        );
        assert.isTrue(
            el.firstElementChild.hasAttribute('switch'),
            'the switch variant marks its ful-choice with the switch attribute, which styles it as a switch',
        );
        assert.strictEqual(input.getAttribute('role'), 'switch', 'the switch variant gives the input the switch role');

        const [plain, , plainInput] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);
        assert.strictEqual(
            plain.firstElementChild.localName,
            'ful-choice',
            'the plain checkbox renders its choice in a ful-choice container too',
        );
        assert.isFalse(
            plain.firstElementChild.hasAttribute('switch'),
            "the plain checkbox's ful-choice carries no switch attribute",
        );
        assert.isFalse(plainInput.hasAttribute('role'), 'a plain checkbox keeps the native checkbox role');
    });

    it('keeps the inner input out of the surrounding form, so only the host contributes a value', async () => {
        const container = appended(`<form><ful-checkbox name="a">label</ful-checkbox></form>`);
        const el = container.querySelector('ful-checkbox');
        await Rendering.waitFor(el);
        const form = container.querySelector('form');

        const elements = [...form.elements];
        assert.include(elements, el, 'the host is form associated');
        assert.notInclude(elements, el.querySelector('input'), 'the inner input is detached by form=""');
    });
});

describe('Checkbox stacked layout', () => {
    const heights = async (cls) => {
        const container = appended(
            `<div style="display:grid;grid-template-columns:1fr 1fr;align-items:start">
                <ful-input name="i" value="x">Input</ful-input>
                <ful-checkbox ${cls} name="c">Choice</ful-checkbox>
            </div>`,
        );
        await Rendering.waitFor(container);
        const input = container.querySelector('ful-input');
        const choice = container.querySelector('ful-checkbox');
        const box = (el) => el.getBoundingClientRect();
        return {
            container,
            sameHeight: Math.round(box(input).height) === Math.round(box(choice).height),
            labelsAligned:
                Math.round(box(input.querySelector('label')).top) ===
                Math.round(box(choice.querySelector('label')).top),
            controlBelowLabel: box(choice.querySelector('input')).top >= box(choice.querySelector('label')).bottom,
        };
    };

    it('stands a choice as tall as the input beside it, its label on the same line', async () => {
        const stacked = await heights('class="ful-stacked"');

        assert.isTrue(stacked.sameHeight, 'the field is as tall as an input in the same row');
        assert.isTrue(stacked.labelsAligned, 'the labels share a line');
        assert.isTrue(stacked.controlBelowLabel, 'the control sits under its label');
        stacked.container.remove();
    });

    it('leaves the label beside the control without the class', async () => {
        const plain = await heights('');

        assert.isFalse(
            plain.sameHeight,
            'without the ful-stacked class the choice is not stretched to the height of the input beside it',
        );
        assert.isFalse(plain.controlBelowLabel, 'the control shares the label line');
        plain.container.remove();
    });
});
