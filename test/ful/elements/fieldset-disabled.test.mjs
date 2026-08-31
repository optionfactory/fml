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
    //the form disabled state must not end up claimed on the host: the element matches
    //:disabled through its ancestry, and an attribute of its own would keep it
    //disabled once the fieldset is re-enabled, as formDisabledCallback(false) is only
    //delivered on an actual state change
    const cases = [
        ['ful-input', `<ful-input name="a" value="x">l</ful-input>`],
        ['ful-checkbox', `<ful-checkbox name="a" value="true">l</ful-checkbox>`],
        ['ful-select', `<ful-select name="a" value="x">l</ful-select>`],
        ['ful-radio-group', `<ful-radio-group name="a" value="x">l<ful-radio value="x">x</ful-radio></ful-radio-group>`],
        ['ful-filter-text', `<ful-filter-text name="a">l</ful-filter-text>`],
    ];

    for (const [tag, markup] of cases) {
        it(`${tag} stays enabled inside a fieldset without the disabled attribute`, async () => {
            const [, field, container] = await mount('', markup);

            assert.isFalse(field.disabled);
            assert.isFalse(field.hasAttribute('disabled'));
            assert.isFalse(field.matches(':disabled'));
            container.remove();
        });

        it(`${tag} re-enables when the fieldset is re-enabled`, async () => {
            const [fieldset, field, container] = await mount('disabled', markup);

            assert.isTrue(field.disabled, 'the form disabled state reaches the element');
            assert.isFalse(field.hasAttribute('disabled'), 'the element does not claim the state as its own');
            assert.isTrue(field.matches(':disabled'), 'it matches :disabled through the fieldset');

            fieldset.removeAttribute('disabled');

            assert.isFalse(field.disabled, 'the element follows the fieldset back to enabled');
            assert.isFalse(field.matches(':disabled'));
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
    }
});
