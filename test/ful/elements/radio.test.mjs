import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Bindings, Plugin } from '../../../src/ful/index.mjs';

registry.plugin(new Plugin()).configure();

const mount = async (html) => {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    await Rendering.waitForChildren(container);
    return container;
};

const GROUP = `<ful-radio-group name="a">label<ful-radio value="k1">one</ful-radio><ful-radio value="k2">two</ful-radio></ful-radio-group>`;

describe('RadioGroup rendering', () => {
    it('turns every ful-radio into a labelled input and drops the placeholder element', async () => {
        const container = await mount(GROUP);
        const group = container.querySelector('ful-radio-group');

        assert.isNull(group.querySelector('ful-radio'), 'the placeholders are consumed');
        assert.deepEqual(
            Array.from(group.querySelectorAll('input[type=radio]'), (i) => i.value),
            ['k1', 'k2'],
        );
        assert.deepEqual(
            Array.from(group.querySelectorAll('label'), (l) => l.innerText.trim()),
            ['one', 'two'],
            'the ful-radio content becomes the label of its input',
        );
        assert.strictEqual(group.querySelector('legend').innerText.trim(), 'label');
        container.remove();
    });

    it('gives nameless groups a name of their own, so two groups do not share a selection', async () => {
        const nameless = `<ful-radio-group><ful-radio value="k1">one</ful-radio><ful-radio value="k2">two</ful-radio></ful-radio-group>`;
        const container = await mount(`${nameless}${nameless}`);
        const [first, second] = container.querySelectorAll('ful-radio-group');

        first.querySelector('input').click();
        second.querySelector('input').click();

        assert.notStrictEqual(
            first.querySelector('input').getAttribute('name'),
            second.querySelector('input').getAttribute('name'),
        );
        assert.strictEqual(first.value, 'k1', 'the other group must not steal the selection');
        assert.strictEqual(second.value, 'k1');
        container.remove();
    });

    it('forwards the ful-radio attributes and the group input- attributes onto the generated input', async () => {
        const container = await mount(`
            <ful-radio-group name="a" input-class="check" input-data-shared="s">
                <ful-radio value="k1" class="first" data-ful-bind-type="boolean" disabled>one</ful-radio>
                <ful-radio value="k2">two</ful-radio>
            </ful-radio-group>`);
        const [first, second] = container.querySelectorAll('input[type=radio]');

        assert.deepEqual(Array.from(first.classList).sort(), ['check', 'first'], 'classes merge, not overwrite');
        assert.strictEqual(first.dataset.shared, 's');
        assert.strictEqual(first.dataset.fulBindType, 'boolean');
        assert.isTrue(first.disabled, 'a single radio can be disabled on its own');
        assert.deepEqual(Array.from(second.classList), ['check']);
        assert.isFalse(second.disabled);
        container.remove();
    });
});

describe('RadioGroup value', () => {
    it('emits exactly one change event, carrying the group value, when a radio is checked', async () => {
        const container = await mount(GROUP);
        const group = container.querySelector('ful-radio-group');
        const seen = [];
        //listening outside the group: the inner input change must not escape too
        container.addEventListener('change', (evt) => seen.push(evt));

        group.querySelectorAll('input[type=radio]')[1].click();

        assert.lengthOf(seen, 1);
        assert.strictEqual(seen[0].target, group, 'the group speaks for its radios');
        assert.strictEqual(seen[0].detail.value, 'k2');
        assert.strictEqual(group.value, 'k2');
        container.remove();
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

        assert.deepEqual(seen, [false]);
        assert.strictEqual(group.value, false);
        group.value = true;
        assert.strictEqual(group.value, true, 'a boolean round trips through the setter');
        container.remove();
    });

    it('clears the selection when the value is set to null', async () => {
        const container = await mount(
            `<ful-radio-group name="a" value="k1"><ful-radio value="k1">one</ful-radio><ful-radio value="k2">two</ful-radio></ful-radio-group>`,
        );
        const group = container.querySelector('ful-radio-group');
        assert.strictEqual(group.value, 'k1', 'the value attribute selects on render');

        group.value = null;

        assert.isNull(group.value);
        assert.isNull(group.querySelector('input[type=radio]:checked'), 'no radio stays checked');
        container.remove();
    });

    it('selects values that are not valid css identifiers', async () => {
        const container = await mount(
            `<ful-radio-group name="a"><ful-radio value="1">one</ful-radio><ful-radio value="a b">two</ful-radio></ful-radio-group>`,
        );
        const group = container.querySelector('ful-radio-group');

        group.value = 1;
        assert.strictEqual(group.value, '1', 'a number is matched against the attribute text');

        group.value = 'a b';
        assert.strictEqual(group.value, 'a b');
        container.remove();
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
        );
        assert.isNull(inputs[0].form, 'form="" detaches them from the form');
        assert.notInclude(Array.from(form.elements), inputs[0]);
        assert.deepEqual(Bindings.extractFrom(form), { a: 'k2' });
        container.remove();
    });
});

describe('RadioGroup state', () => {
    it('makes the fieldset inert while readonly, following the attribute both ways', async () => {
        const container = await mount(GROUP.replace('name="a"', 'name="a" readonly'));
        const group = container.querySelector('ful-radio-group');
        const fieldset = group.querySelector('fieldset');
        assert.isTrue(group.readonly);
        assert.isTrue(fieldset.inert, 'inert is what stops the radios from being changed');

        group.removeAttribute('readonly');
        assert.isFalse(group.readonly);
        assert.isFalse(fieldset.inert);

        group.readonly = true;
        assert.isTrue(fieldset.inert);
        assert.isTrue(group.hasAttribute('readonly'), 'the property reflects back onto the attribute');
        container.remove();
    });

    it('disables every radio when the group is disabled', async () => {
        const container = await mount(GROUP);
        const group = container.querySelector('ful-radio-group');
        assert.isFalse(group.disabled);

        group.disabled = true;

        assert.isTrue(group.disabled);
        assert.isTrue(Array.from(group.querySelectorAll('input[type=radio]')).every((i) => i.matches(':disabled')));

        group.disabled = false;
        assert.isFalse(group.disabled);
        assert.isFalse(group.querySelector('input[type=radio]').matches(':disabled'));
        container.remove();
    });

    it('renders disabled inside a disabled fieldset', async () => {
        const container = await mount(`<form><fieldset disabled>${GROUP}</fieldset></form>`);
        const group = container.querySelector('ful-radio-group');

        assert.isTrue(group.disabled, 'the form disabled state reaches the group before its first render');
        assert.isTrue(Array.from(group.querySelectorAll('input[type=radio]')).every((i) => i.matches(':disabled')));
        container.remove();
    });

    it('announces a required group with aria-required on the fieldset', async () => {
        const container = await mount(GROUP.replace('name="a"', 'name="a" required'));
        const group = container.querySelector('ful-radio-group');
        const fieldset = group.querySelector('fieldset');
        assert.isTrue(group.required);
        assert.strictEqual(fieldset.getAttribute('aria-required'), 'true');

        group.required = false;
        assert.isFalse(group.required);
        assert.isFalse(fieldset.hasAttribute('aria-required'), 'aria-required is removed, not set to false');
        assert.isFalse(group.hasAttribute('required'));
        container.remove();
    });

    it('focuses the first radio, so a form can focus the group', async () => {
        const container = await mount(GROUP);
        const group = container.querySelector('ful-radio-group');

        group.focus();

        assert.strictEqual(document.activeElement, group.querySelector('input[type=radio]'));
        container.remove();
    });

    it('shows a custom validity in ful-field-error and clears both when it is reset', async () => {
        const container = await mount(GROUP);
        const group = container.querySelector('ful-radio-group');
        const fieldError = group.querySelector('ful-field-error');

        group.setCustomValidity('please pick one');
        assert.strictEqual(fieldError.innerText, 'please pick one');
        assert.isTrue(group.internals.validity.customError);
        assert.strictEqual(group.internals.validationMessage, ' ', 'the message is rendered, not shown natively');

        group.setCustomValidity('');
        assert.strictEqual(fieldError.innerText, '');
        assert.isTrue(group.internals.validity.valid);
        container.remove();
    });
});
