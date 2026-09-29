import { tick } from '../../tick.mjs';
import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';
import { appended } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const mount = async (fieldsetAttr, inner) => {
    registry.defineComponent('loaders:select', {
        create: () => ({
            prefetch: async () => {},
            load: async () => [],
            exact: async (...k) => k.map((v) => ({ key: v, label: v })),
        }),
    });
    const container = appended(
        `<ful-form><fieldset ${fieldsetAttr}>${inner}</fieldset><input name="keep" value="kept"></ful-form>`,
    );
    await Rendering.waitFor(container);
    for (let i = 0; i !== 20; ++i) {
        await tick();
    }
    const fieldset = container.querySelector('fieldset');
    return [fieldset, fieldset.firstElementChild, container.querySelector('ful-form')];
};

describe('Disabled fields and fieldsets', () => {
    const FILTER_CONTROLS = 'input, [data-ref=operator]';
    const cases = [
        ['ful-input', `<ful-input name="a" value="x">l</ful-input>`, 'input'],
        ['ful-checkbox', `<ful-checkbox name="a" value="true">l</ful-checkbox>`, 'input'],
        ['ful-select', `<ful-select name="a" value="x">l</ful-select>`, 'input'],
        [
            'ful-radio-group',
            `<ful-radio-group name="a" value="x">l<ful-radio value="x">x</ful-radio><ful-radio value="y">y</ful-radio></ful-radio-group>`,
            'input',
            'fieldset',
        ],
        ['ful-input-file', `<ful-input-file name="a">l</ful-input-file>`, 'input'],
        ['ful-filter-text', `<ful-filter-text name="a">l</ful-filter-text>`, FILTER_CONTROLS],
        ['ful-filter-local-date', `<ful-filter-local-date name="a">l</ful-filter-local-date>`, FILTER_CONTROLS],
        ['ful-filter-instant', `<ful-filter-instant name="a">l</ful-filter-instant>`, FILTER_CONTROLS],
    ];

    for (const [tag, markup, selector, carriers = selector] of cases) {
        const across = (field, test, among = selector) => {
            const states = Array.from(field.querySelectorAll(among), test);
            return states.every(Boolean) ? 'all' : states.some(Boolean) ? 'some' : 'none';
        };
        const disabledControls = (field) => across(field, (c) => c.matches(':disabled'));
        const claimedControls = (field) => across(field, (c) => c.hasAttribute('disabled'), carriers);

        it(`${tag} stays enabled inside a fieldset without the disabled attribute`, async () => {
            const [, field] = await mount('', markup);

            assert.isFalse(field.disabled);
            assert.isFalse(field.hasAttribute('disabled'));
            assert.isFalse(field.matches(':disabled'));
            assert.strictEqual(disabledControls(field), 'none');
        });

        it(`${tag} mirrors the disabled attribute and property onto its controls, and takes them back off`, async () => {
            const [, field] = await mount('', markup);

            field.setAttribute('disabled', '');
            assert.isTrue(field.disabled, 'the claim reads back');
            assert.isTrue(field.matches(':disabled'), 'the host matches :disabled');
            assert.strictEqual(disabledControls(field), 'all', 'every control is disabled');
            assert.strictEqual(claimedControls(field), 'all', 'the controls carry the attribute');

            field.removeAttribute('disabled');
            assert.isFalse(field.disabled);
            assert.isFalse(field.matches(':disabled'));
            assert.strictEqual(disabledControls(field), 'none');
            assert.strictEqual(claimedControls(field), 'none');

            field.disabled = true;
            assert.isTrue(field.hasAttribute('disabled'), 'the property reflects onto the attribute');
            assert.strictEqual(disabledControls(field), 'all');
            field.disabled = false;
            assert.isFalse(field.hasAttribute('disabled'));
            assert.strictEqual(disabledControls(field), 'none');
        });

        it(`${tag} leaves the submitted values while disabled, and comes back once re-enabled`, async () => {
            const [, field, form] = await mount('', markup);
            assert.property(form.values, 'a', 'the field contributes while enabled');

            field.disabled = true;

            assert.notProperty(form.values, 'a');
            assert.strictEqual(form.values.keep, 'kept', 'the other fields still contribute');

            field.disabled = false;

            assert.property(form.values, 'a');
        });

        it(`${tag} follows a disabled fieldset without claiming it, and follows it back`, async () => {
            const [fieldset, field] = await mount('disabled', markup);

            assert.isFalse(field.disabled, 'the property reflects the claim only, like a native input');
            assert.isFalse(field.hasAttribute('disabled'), 'the ancestry is not claimed as its own');
            assert.isTrue(field.matches(':disabled'), 'the ancestry is honored through :disabled');
            assert.strictEqual(disabledControls(field), 'all', 'the controls are disabled by the browser');

            fieldset.removeAttribute('disabled');

            assert.isFalse(field.disabled);
            assert.isFalse(field.matches(':disabled'));
            assert.strictEqual(disabledControls(field), 'none', 'the controls follow the fieldset back');
        });

        it(`${tag} disabled before the fieldset is disabled stays disabled when it is re-enabled`, async () => {
            const [fieldset, field] = await mount('', markup);

            field.disabled = true;
            assert.isTrue(field.hasAttribute('disabled'), 'the element claims its own state');

            fieldset.setAttribute('disabled', '');
            assert.isTrue(field.disabled, 'the element stays disabled under the fieldset');
            assert.strictEqual(disabledControls(field), 'all', 'claim and ancestry agree while both are on');

            fieldset.removeAttribute('disabled');

            assert.isTrue(field.disabled, 'the claim made before the fieldset survived the re-enable');
            assert.isTrue(field.hasAttribute('disabled'));
            assert.isTrue(field.matches(':disabled'));
            assert.strictEqual(disabledControls(field), 'all', 'the claim alone holds the controls');

            field.disabled = false;
            assert.strictEqual(disabledControls(field), 'none', 'un-claiming under a plain fieldset enables it');
        });

        it(`${tag} disabled while the fieldset is disabled stays disabled when it is re-enabled`, async () => {
            const [fieldset, field] = await mount('disabled', markup);

            field.disabled = true;
            fieldset.removeAttribute('disabled');

            assert.isTrue(field.disabled, 'the element stays on its own disabled state');
            assert.isTrue(field.matches(':disabled'));
        });

        it(`${tag} declared disabled in markup under a disabled fieldset keeps its claim`, async () => {
            const [fieldset, field] = await mount('disabled', markup.replace(tag, `${tag} disabled`));

            assert.isTrue(field.disabled, 'the declared claim and the form state agree');
            assert.isTrue(field.hasAttribute('disabled'), 'the declared claim is not wiped by the ancestry');

            fieldset.removeAttribute('disabled');

            assert.isTrue(field.disabled, 'the element stays on its declared claim');
            assert.isTrue(field.hasAttribute('disabled'));
            assert.isTrue(field.matches(':disabled'));
            assert.strictEqual(disabledControls(field), 'all', 'the controls carry the declared claim');
        });

        it(`${tag} cannot be enabled out of a disabled fieldset by un-claiming`, async () => {
            const [, field] = await mount('disabled', markup);

            field.disabled = true;
            field.disabled = false;

            assert.isFalse(field.disabled, 'the claim is gone');
            assert.isTrue(field.matches(':disabled'), 'the ancestry still disables it');
            assert.strictEqual(disabledControls(field), 'all', 'the controls stay disabled');
        });
    }
});
