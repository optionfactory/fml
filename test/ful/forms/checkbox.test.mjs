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
    it('toggles the value when the label is clicked, as the label is not natively bound to the input', async () => {
        const [el, , input, label] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);

        label.click();
        assert.isTrue(el.value, 'first click checks');
        assert.isTrue(input.checked, 'the inner input follows the value');

        label.click();
        assert.isFalse(el.value, 'second click unchecks');
        assert.isFalse(input.checked);
    });

    it('announces each toggle with a single bubbling change carrying the new value', async () => {
        const [el, container, , label] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);
        const seen = changes(container);

        label.click();

        assert.lengthOf(seen, 1, 'exactly one change per toggle');
        assert.strictEqual(seen[0].target, el, 'the host is the source, not the inner input');
        assert.deepStrictEqual(seen[0].detail, { value: true });
    });

    it('republishes the inner input change as its own, so listeners never see it twice', async () => {
        const [el, container, input] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);
        const seen = changes(container);

        //what a real click on the checkbox itself produces
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));

        assert.lengthOf(seen, 1, 'the inner change must be stopped and replaced, not forwarded too');
        assert.strictEqual(seen[0].target, el);
        assert.deepStrictEqual(seen[0].detail, { value: true });
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

        assert.isFalse(el.value);
        assert.lengthOf(seen, 0);
    });
});

describe('Checkbox value', () => {
    it('reads and writes the checked state of the inner input', async () => {
        const [el, , input] = await mount(`<ful-checkbox name="a" value="true">label</ful-checkbox>`);
        assert.isTrue(input.checked, 'value:bool checks the box at render');

        el.value = false;
        assert.isFalse(input.checked);

        input.checked = true;
        assert.isTrue(el.value, 'the input is the single source of truth');
    });

    it('follows a later value attribute change, where only the string true means checked', async () => {
        const [el, , input] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);

        el.setAttribute('value', 'true');
        assert.isTrue(input.checked);

        el.setAttribute('value', 'false');
        assert.isFalse(input.checked);
    });
});

describe('Checkbox states', () => {
    it('freezes readonly without leaving the accessibility tree, so the value stays readable', async () => {
        const [el] = await mount(`<ful-checkbox name="a" readonly value="true">label</ful-checkbox>`);
        const box = el.firstElementChild;
        const input = el.querySelector('input');

        assert.isFalse(box.inert, 'inert would take the whole choice out of the accessibility tree');
        assert.strictEqual(input.getAttribute('aria-readonly'), 'true', 'the claim is announced instead');
        assert.isTrue(el.readonly);
        assert.isFalse(input.hasAttribute('disabled'), 'a disabled input would drop the value on submit');

        //the gesture is refused, so the box keeps the value it was given
        input.click();
        assert.isTrue(el.value, 'a click on a readonly checkbox does not toggle it');

        el.removeAttribute('readonly');
        assert.isFalse(el.readonly);
        assert.isNull(input.getAttribute('aria-readonly'));
        input.click();
        assert.isFalse(el.value, 'and it toggles again once the claim is lifted');
    });

    it('reflects readonly and required set as properties back onto the host attributes', async () => {
        const [el, , input] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);

        el.readonly = true;
        el.required = true;

        assert.isTrue(el.hasAttribute('readonly'));
        assert.isTrue(el.hasAttribute('required'));
        assert.strictEqual(input.getAttribute('aria-required'), 'true', 'required is announced to screen readers');
        assert.isTrue(el.required);

        el.required = false;
        assert.isFalse(el.hasAttribute('required'));
        assert.isFalse(input.hasAttribute('aria-required'));
    });

    it('disables the inner input, which is what keeps it out of a submitted payload', async () => {
        const [el, , input] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);

        el.disabled = true;
        assert.isTrue(input.hasAttribute('disabled'));
        assert.isTrue(el.disabled);

        el.disabled = false;
        assert.isFalse(input.hasAttribute('disabled'));
        assert.isFalse(el.disabled);
    });

    it('forwards focus to the inner input, so labels and form navigation land on something focusable', async () => {
        const [el, , input] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);

        el.focus();

        assert.strictEqual(document.activeElement, input);
    });
});

describe('Checkbox validity', () => {
    it('renders a custom validity message into its field error and clears it again', async () => {
        const [el] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);
        const fieldError = el.querySelector('ful-field-error');

        el.setCustomValidity('required');

        assert.strictEqual(fieldError.innerText, 'required');
        assert.isTrue(el.internals.validity.customError, 'and the element reports itself invalid');

        el.setCustomValidity(null);

        assert.strictEqual(fieldError.innerText, '');
        assert.isTrue(el.internals.validity.valid);
    });

    it('describes the input by its field error, so the message is read out with the control', async () => {
        const [el, , input, label] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);

        assert.deepStrictEqual(input.ariaDescribedByElements, [el.querySelector('ful-field-error')]);
        assert.deepStrictEqual(input.ariaLabelledByElements, [label]);
    });
});

describe('Checkbox rendering', () => {
    it('renders the switch variant with the switch role, and the plain one without it', async () => {
        const [el, , input] = await mount(`<ful-checkbox name="a" type="switch">label</ful-checkbox>`);

        assert.strictEqual(el.firstElementChild.localName, 'ful-choice');
        assert.isTrue(el.firstElementChild.hasAttribute('switch'));
        assert.strictEqual(input.getAttribute('role'), 'switch');

        const [plain, plainContainer, plainInput] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);
        assert.strictEqual(plain.firstElementChild.localName, 'ful-choice');
        assert.isFalse(plain.firstElementChild.hasAttribute('switch'));
        assert.isFalse(plainInput.hasAttribute('role'), 'a plain checkbox keeps the native checkbox role');
        plainContainer.remove();
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
