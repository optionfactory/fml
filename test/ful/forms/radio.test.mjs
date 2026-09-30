import { assert } from 'chai';
import { registry } from '../../../src/ftl/index.mjs';
import { Bindings, Plugin } from '../../../src/ful/index.mjs';
import { mount } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const GROUP = `<ful-radio-group name="a">label<ful-radio value="k1">one</ful-radio><ful-radio value="k2">two</ful-radio></ful-radio-group>`;

describe('RadioGroup rendering', () => {
    it('turns every ful-radio into a labelled input and drops the placeholder element', async () => {
        const container = await mount(GROUP, { children: true });
        const group = container.querySelector('ful-radio-group');

        assert.isNull(group.querySelector('ful-radio'), 'the placeholders are consumed');
        assert.deepEqual(
            Array.from(group.querySelectorAll('input[type=radio]'), (i) => i.value),
            ['k1', 'k2'],
            'each ful-radio becomes a radio input carrying its value, in the declared order',
        );
        assert.deepEqual(
            Array.from(group.querySelectorAll('label'), (l) => l.innerText.trim()),
            ['one', 'two'],
            'the ful-radio content becomes the label of its input',
        );
        assert.strictEqual(
            group.querySelector('legend').innerText.trim(),
            'label',
            "the default slot of the group is rendered as the fieldset's legend",
        );
    });

    it('gives nameless groups a name of their own, so two groups do not share a selection', async () => {
        const nameless = `<ful-radio-group><ful-radio value="k1">one</ful-radio><ful-radio value="k2">two</ful-radio></ful-radio-group>`;
        const container = await mount(`${nameless}${nameless}`, { children: true });
        const [first, second] = container.querySelectorAll('ful-radio-group');

        first.querySelector('input').click();
        second.querySelector('input').click();

        assert.notStrictEqual(
            first.querySelector('input').getAttribute('name'),
            second.querySelector('input').getAttribute('name'),
            'each nameless group mints a name of its own for its radios',
        );
        assert.strictEqual(first.value, 'k1', 'the other group must not steal the selection');
        assert.strictEqual(second.value, 'k1', 'the second group keeps its own selection beside the first');
    });

    it('forwards the ful-radio attributes and the group input- attributes onto the generated input', async () => {
        const container = await mount(`
            <ful-radio-group name="a" input-class="check" input-data-shared="s">
                <ful-radio value="k1" class="first" data-ful-bind-type="boolean" disabled>one</ful-radio>
                <ful-radio value="k2">two</ful-radio>
            </ful-radio-group>`);
        const [first, second] = container.querySelectorAll('input[type=radio]');

        assert.deepEqual(Array.from(first.classList).sort(), ['check', 'first'], 'classes merge, not overwrite');
        assert.strictEqual(
            first.dataset.shared,
            's',
            'an input- attribute on the group is forwarded onto each radio without its prefix',
        );
        assert.strictEqual(
            first.dataset.fulBindType,
            'boolean',
            'a data attribute written on the ful-radio is carried onto its input',
        );
        assert.isTrue(first.disabled, 'a single radio can be disabled on its own');
        assert.deepEqual(
            Array.from(second.classList),
            ['check'],
            "a radio with no class of its own gets only the group's input-class",
        );
        assert.isFalse(second.disabled, 'disabling one ful-radio leaves the other radios enabled');
    });
});

describe('RadioGroup value', () => {
    it('emits exactly one change event, carrying the group value, when a radio is checked', async () => {
        const container = await mount(GROUP, { children: true });
        const group = container.querySelector('ful-radio-group');
        const seen = [];
        container.addEventListener('change', (evt) => seen.push(evt));

        group.querySelectorAll('input[type=radio]')[1].click();

        assert.lengthOf(
            seen,
            1,
            'a click on a radio publishes one change, the native one being stopped and republished by the group',
        );
        assert.strictEqual(seen[0].target, group, 'the group speaks for its radios');
        assert.strictEqual(seen[0].detail.value, 'k2', 'the change carries the group value in its detail');
        assert.strictEqual(group.value, 'k2', "the group value answers the checked radio's value");
    });

    it('reads a type=boolean group back as a real boolean instead of the attribute text', async () => {
        const container = await mount(
            `<ful-radio-group name="a" type="boolean"><ful-radio value="true">yes</ful-radio><ful-radio value="false">no</ful-radio></ful-radio-group>`,
        );
        const group = container.querySelector('ful-radio-group');
        const seen = [];
        group.addEventListener('change', (evt) => seen.push(evt.detail.value));

        assert.isNull(group.value, 'nothing is selected yet');
        group.querySelectorAll('input[type=radio]')[1].click();

        assert.deepEqual(seen, [false], 'the change detail carries a real false under type boolean');
        assert.strictEqual(group.value, false, 'under type boolean the value reads back as a boolean');
        group.value = true;
        assert.strictEqual(group.value, true, 'a boolean round trips through the setter');
    });

    it('clears the selection when the value is set to null', async () => {
        const container = await mount(
            `<ful-radio-group name="a" value="k1"><ful-radio value="k1">one</ful-radio><ful-radio value="k2">two</ful-radio></ful-radio-group>`,
        );
        const group = container.querySelector('ful-radio-group');
        assert.strictEqual(group.value, 'k1', 'the value attribute selects on render');

        group.value = null;

        assert.isNull(group.value, 'setting null clears the value');
        assert.isNull(group.querySelector('input[type=radio]:checked'), 'no radio stays checked');
    });

    it('clears the selection when the value is set to an unknown key', async () => {
        const container = await mount(
            `<ful-radio-group name="a" value="k1"><ful-radio value="k1">one</ful-radio><ful-radio value="k2">two</ful-radio></ful-radio-group>`,
        );
        const group = container.querySelector('ful-radio-group');
        assert.strictEqual(group.value, 'k1', 'the value attribute selects its radio on render');

        group.value = 'unknown';

        assert.isNull(group.value, 'an unknown key answers as no selection');
        assert.isNull(group.querySelector('input[type=radio]:checked'), 'the stale radio does not keep answering');
    });

    it('selects values that are not valid css identifiers', async () => {
        const container = await mount(
            `<ful-radio-group name="a"><ful-radio value="1">one</ful-radio><ful-radio value="a b">two</ful-radio></ful-radio-group>`,
        );
        const group = container.querySelector('ful-radio-group');

        group.value = 1;
        assert.strictEqual(group.value, '1', 'a number is matched against the attribute text');

        group.value = 'a b';
        assert.strictEqual(
            group.value,
            'a b',
            'a value holding a space, not a valid css identifier, still selects its radio',
        );
    });

    it('keeps the generated inputs out of the surrounding form, so only the group provides a value', async () => {
        const container = await mount(
            `<form><ful-radio-group name="a" value="k2"><ful-radio value="k1">one</ful-radio><ful-radio value="k2">two</ful-radio></ful-radio-group></form>`,
        );
        const form = container.querySelector('form');
        const inputs = Array.from(form.querySelectorAll('input[type=radio]'));

        assert.deepEqual(
            inputs.map((i) => i.getAttribute('name')),
            ['a-ignore', 'a-ignore'],
            'the radios carry a name of their own derived from the group name, so the form does not submit them',
        );
        assert.isNull(inputs[0].form, 'form="" detaches them from the form');
        assert.notInclude(Array.from(form.elements), inputs[0], "the radios are not among the form's elements");
        assert.deepEqual(
            Bindings.extractFrom(form),
            { a: 'k2' },
            "the form sees only the group's value under the group's name",
        );
    });
});

describe('RadioGroup state', () => {
    it('freezes the radios while readonly, following the attribute both ways', async () => {
        const container = await mount(GROUP.replace('name="a"', 'name="a" readonly'), { children: true });
        const group = container.querySelector('ful-radio-group');
        const fieldset = group.querySelector('fieldset');
        const first = group.querySelector('input[type=radio]');
        assert.isTrue(group.readonly, 'the readonly attribute is read into the readonly property');
        assert.isFalse(fieldset.inert, 'inert would take the whole group out of the accessibility tree');
        assert.strictEqual(group.getAttribute('aria-readonly'), 'true', 'announced on the radiogroup host');

        first.click();
        assert.isFalse(first.checked, 'a click on a readonly group picks nothing');

        group.removeAttribute('readonly');
        assert.isFalse(group.readonly, 'removing the readonly attribute lifts the readonly property');
        assert.isNull(
            group.getAttribute('aria-readonly'),
            'aria-readonly is removed from the host once the group is no longer readonly',
        );
        first.click();
        assert.isTrue(first.checked, 'and it picks again once the claim is lifted');

        group.readonly = true;
        assert.isTrue(group.hasAttribute('readonly'), 'the property reflects back onto the attribute');
    });

    it('announces a required group on the radiogroup host, the role that accepts it', async () => {
        const container = await mount(GROUP.replace('name="a"', 'name="a" required'), { children: true });
        const group = container.querySelector('ful-radio-group');
        const fieldset = group.querySelector('fieldset');
        assert.isTrue(group.required, 'the required attribute is read into the required property');
        assert.isFalse(
            fieldset.hasAttribute('aria-required'),
            'aria-required is not put on the fieldset, a role that does not accept it',
        );
        assert.strictEqual(group.getAttribute('aria-required'), 'true', 'the host announces the group as required');

        group.required = false;
        assert.isFalse(group.required, 'writing false to required turns the claim off');
        assert.isFalse(group.hasAttribute('aria-required'), 'aria-required is removed, not set to false');
        assert.isFalse(group.hasAttribute('required'), 'writing false to required removes the required attribute');
    });

    it('focuses the first radio, so a form can focus the group', async () => {
        const container = await mount(GROUP, { children: true });
        const group = container.querySelector('ful-radio-group');

        group.focus();

        assert.strictEqual(
            document.activeElement,
            group.querySelector('input[type=radio]'),
            'focus() on the group lands on its first radio',
        );
    });

    it('shows a custom validity in ful-field-error and clears both when it is reset', async () => {
        const container = await mount(GROUP, { children: true });
        const group = container.querySelector('ful-radio-group');
        const fieldError = group.querySelector('ful-field-error');

        group.setCustomValidity('please pick one');
        assert.strictEqual(
            fieldError.innerText,
            'please pick one',
            "the custom validity message is rendered in the group's ful-field-error",
        );
        assert.isTrue(
            group.internals.validity.customError,
            'a non-empty custom validity marks the group with a custom error',
        );
        assert.strictEqual(group.internals.validationMessage, ' ', 'the message is rendered, not shown natively');

        group.setCustomValidity('');
        assert.strictEqual(fieldError.innerText, '', 'an empty custom validity empties the rendered error');
        assert.isTrue(group.internals.validity.valid, 'an empty custom validity makes the group valid again');
    });
});
