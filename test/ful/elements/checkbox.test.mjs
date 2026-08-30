import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';

registry.plugin(new Plugin()).configure();

const mount = async (html) => {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
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
        const [el, container, input, label] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);

        label.click();
        assert.isTrue(el.value, 'first click checks');
        assert.isTrue(input.checked, 'the inner input follows the value');

        label.click();
        assert.isFalse(el.value, 'second click unchecks');
        assert.isFalse(input.checked);
        container.remove();
    });

    it('announces each toggle with a single bubbling change carrying the new value', async () => {
        const [el, container, , label] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);
        const seen = changes(container);

        label.click();

        assert.lengthOf(seen, 1, 'exactly one change per toggle');
        assert.strictEqual(seen[0].target, el, 'the host is the source, not the inner input');
        assert.deepStrictEqual(seen[0].detail, { value: true });
        container.remove();
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
        container.remove();
    });

    it('ignores label clicks while readonly', async () => {
        const [el, container, , label] = await mount(`<ful-checkbox name="a" readonly value="true">label</ful-checkbox>`);
        const seen = changes(container);

        label.click();

        assert.isTrue(el.value, 'the value is left alone');
        assert.lengthOf(seen, 0, 'and nothing is announced');
        container.remove();
    });

    it('ignores label clicks while disabled', async () => {
        const [el, container, , label] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);
        el.disabled = true;
        const seen = changes(container);

        label.click();

        assert.isFalse(el.value);
        assert.lengthOf(seen, 0);
        container.remove();
    });
});

describe('Checkbox value', () => {
    it('reads and writes the checked state of the inner input', async () => {
        const [el, container, input] = await mount(`<ful-checkbox name="a" value="true">label</ful-checkbox>`);
        assert.isTrue(input.checked, 'value:bool checks the box at render');

        el.value = false;
        assert.isFalse(input.checked);

        input.checked = true;
        assert.isTrue(el.value, 'the input is the single source of truth');
        container.remove();
    });

    it('follows a later value attribute change, where only the string true means checked', async () => {
        const [el, container, input] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);

        el.setAttribute('value', 'true');
        assert.isTrue(input.checked);

        el.setAttribute('value', 'false');
        assert.isFalse(input.checked);
        container.remove();
    });
});

describe('Checkbox states', () => {
    it('makes readonly inert rather than disabled, so the value still reaches the form', async () => {
        const [el, container] = await mount(`<ful-checkbox name="a" readonly value="true">label</ful-checkbox>`);
        const box = el.firstElementChild;
        const input = el.querySelector('input');

        assert.isTrue(box.inert, 'the whole control is inert');
        assert.isTrue(el.readonly);
        assert.isFalse(input.hasAttribute('disabled'), 'a disabled input would drop the value on submit');

        el.removeAttribute('readonly');
        assert.isFalse(box.inert, 'and it becomes interactive again');
        assert.isFalse(el.readonly);
        container.remove();
    });

    it('reflects readonly and required set as properties back onto the host attributes', async () => {
        const [el, container, input] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);

        el.readonly = true;
        el.required = true;

        assert.isTrue(el.hasAttribute('readonly'));
        assert.isTrue(el.hasAttribute('required'));
        assert.strictEqual(input.getAttribute('aria-required'), 'true', 'required is announced to screen readers');
        assert.isTrue(el.required);

        el.required = false;
        assert.isFalse(el.hasAttribute('required'));
        assert.isFalse(input.hasAttribute('aria-required'));
        container.remove();
    });

    it('disables the inner input, which is what keeps it out of a submitted payload', async () => {
        const [el, container, input] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);

        el.disabled = true;
        assert.isTrue(input.hasAttribute('disabled'));
        assert.isTrue(el.disabled);

        el.disabled = false;
        assert.isFalse(input.hasAttribute('disabled'));
        assert.isFalse(el.disabled);
        container.remove();
    });

    it('forwards focus to the inner input, so labels and form navigation land on something focusable', async () => {
        const [el, container, input] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);

        el.focus();

        assert.strictEqual(document.activeElement, input);
        container.remove();
    });
});

describe('Checkbox validity', () => {
    it('renders a custom validity message into its field error and clears it again', async () => {
        const [el, container] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);
        const fieldError = el.querySelector('ful-field-error');

        el.setCustomValidity('required');

        assert.strictEqual(fieldError.innerText, 'required');
        assert.isTrue(el.internals.validity.customError, 'and the element reports itself invalid');

        el.setCustomValidity(null);

        assert.strictEqual(fieldError.innerText, '');
        assert.isTrue(el.internals.validity.valid);
        container.remove();
    });

    it('describes the input by its field error, so the message is read out with the control', async () => {
        const [el, container, input, label] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);

        assert.deepStrictEqual(input.ariaDescribedByElements, [el.querySelector('ful-field-error')]);
        assert.deepStrictEqual(input.ariaLabelledByElements, [label]);
        container.remove();
    });
});

describe('Checkbox rendering', () => {
    it('renders the switch variant with the switch role, and the plain one without it', async () => {
        const [el, container, input] = await mount(`<ful-checkbox name="a" type="switch">label</ful-checkbox>`);

        assert.deepStrictEqual([...el.firstElementChild.classList], ['form-check', 'form-switch']);
        assert.strictEqual(input.getAttribute('role'), 'switch');

        const [plain, plainContainer, plainInput] = await mount(`<ful-checkbox name="a">label</ful-checkbox>`);
        assert.deepStrictEqual([...plain.firstElementChild.classList], ['form-check']);
        assert.isFalse(plainInput.hasAttribute('role'), 'a plain checkbox keeps the native checkbox role');
        container.remove();
        plainContainer.remove();
    });

    it('keeps the inner input out of the surrounding form, so only the host contributes a value', async () => {
        const container = document.createElement('div');
        container.innerHTML = `<form><ful-checkbox name="a">label</ful-checkbox></form>`;
        document.body.appendChild(container);
        const el = container.querySelector('ful-checkbox');
        await Rendering.waitFor(el);
        const form = container.querySelector('form');

        const elements = [...form.elements];
        assert.include(elements, el, 'the host is form associated');
        assert.notInclude(elements, el.querySelector('input'), 'the inner input is detached by form=""');
        container.remove();
    });
});
