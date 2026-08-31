import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';

registry.plugin(new Plugin()).configure();

const mount = async (fieldsetAttr, inner) => {
    registry.defineComponent('loaders:select', {
        create: () => ({ prefetch: async () => { }, load: async () => [], exact: async (...k) => k.map((v) => [v, v]) })
    });
    const container = document.createElement('div');
    container.innerHTML = `<fieldset ${fieldsetAttr}>${inner}</fieldset>`;
    document.body.appendChild(container);
    await Rendering.waitFor(container);
    for (let i = 0; i !== 20; ++i) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const fieldset = container.querySelector('fieldset');
    return [fieldset, fieldset.firstElementChild, container];
};

describe('Disabled fields and fieldsets', () => {
    //disabled follows native semantics: the attribute is the field's own claim and
    //nothing but its author ever writes it, a disabled fieldset ancestry is honored
    //through :disabled and the browser's own disabling of the inner controls. the
    //property reflects the claim only, exactly like a native input's
    const cases = [
        ['ful-input', `<ful-input name="a" value="x">l</ful-input>`],
        ['ful-checkbox', `<ful-checkbox name="a" value="true">l</ful-checkbox>`],
        ['ful-select', `<ful-select name="a" value="x">l</ful-select>`],
        ['ful-radio-group', `<ful-radio-group name="a" value="x">l<ful-radio value="x">x</ful-radio></ful-radio-group>`],
        ['ful-filter-text', `<ful-filter-text name="a">l</ful-filter-text>`],
    ];
    //the first native control inside the field: the ancestry disables it as a
    //descendant of the fieldset, without any attribute of its own
    const inner = (field) => field.querySelector('input');

    for (const [tag, markup] of cases) {
        it(`${tag} stays enabled inside a fieldset without the disabled attribute`, async () => {
            const [, field, container] = await mount('', markup);

            assert.isFalse(field.disabled);
            assert.isFalse(field.hasAttribute('disabled'));
            assert.isFalse(field.matches(':disabled'));
            assert.isFalse(inner(field).matches(':disabled'));
            container.remove();
        });

        it(`${tag} follows a disabled fieldset without claiming it, and follows it back`, async () => {
            const [fieldset, field, container] = await mount('disabled', markup);

            assert.isFalse(field.disabled, 'the property reflects the claim only, like a native input');
            assert.isFalse(field.hasAttribute('disabled'), 'the ancestry is not claimed as its own');
            assert.isTrue(field.matches(':disabled'), 'the ancestry is honored through :disabled');
            assert.isTrue(inner(field).matches(':disabled'), 'the inner control is disabled by the browser');

            fieldset.removeAttribute('disabled');

            assert.isFalse(field.disabled);
            assert.isFalse(field.matches(':disabled'));
            assert.isFalse(inner(field).matches(':disabled'), 'the inner control follows the fieldset back');
            container.remove();
        });

        it(`${tag} disabled before the fieldset is disabled stays disabled when it is re-enabled`, async () => {
            const [fieldset, field, container] = await mount('', markup);

            field.disabled = true;
            assert.isTrue(field.hasAttribute('disabled'), 'the element claims its own state');

            fieldset.setAttribute('disabled', '');
            assert.isTrue(field.disabled, 'the element stays disabled under the fieldset');

            fieldset.removeAttribute('disabled');

            assert.isTrue(field.disabled, 'the claim made before the fieldset survived the re-enable');
            assert.isTrue(field.hasAttribute('disabled'));
            assert.isTrue(field.matches(':disabled'));
            assert.isTrue(inner(field).matches(':disabled'));
            container.remove();
        });

        it(`${tag} disabled while the fieldset is disabled stays disabled when it is re-enabled`, async () => {
            const [fieldset, field, container] = await mount('disabled', markup);

            field.disabled = true;
            fieldset.removeAttribute('disabled');

            assert.isTrue(field.disabled, 'the element stays on its own disabled state');
            assert.isTrue(field.matches(':disabled'));
            container.remove();
        });

        it(`${tag} declared disabled in markup under a disabled fieldset keeps its claim`, async () => {
            const [fieldset, field, container] = await mount('disabled', markup.replace(tag, `${tag} disabled`));

            assert.isTrue(field.disabled, 'the declared claim and the form state agree');
            assert.isTrue(field.hasAttribute('disabled'), 'the declared claim is not wiped by the ancestry');

            fieldset.removeAttribute('disabled');

            assert.isTrue(field.disabled, 'the element stays on its declared claim');
            assert.isTrue(field.hasAttribute('disabled'));
            assert.isTrue(field.matches(':disabled'));
            container.remove();
        });

        it(`${tag} cannot be enabled out of a disabled fieldset by un-claiming`, async () => {
            const [, field, container] = await mount('disabled', markup);

            field.disabled = true;
            field.disabled = false;

            assert.isFalse(field.disabled, 'the claim is gone');
            assert.isTrue(field.matches(':disabled'), 'the ancestry still disables it');
            assert.isTrue(inner(field).matches(':disabled'), 'the inner control stays disabled');
            container.remove();
        });
    }
});
