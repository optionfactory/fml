import { tick } from '../../tick.mjs';
import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin, Field, Bindings } from '../../../src/ful/index.mjs';
import { appended, settle } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();
registry.defineComponent('loaders:select', {
    create: () => ({ prefetch: async () => {}, load: async () => [], exact: async (...k) => k.map((v) => ({ key: v, label: v })) }),
});

const mount = async (html) => {
    const container = appended(html);
    await Rendering.waitFor(container);
    await settle();
    return container;
};

describe('The disabled attribute after the upgrade', () => {
    it('stays live: the claim, the control and the extraction move together', async () => {
        const container = await mount('<form><ful-input name="a" value="x">l</ful-input></form>');
        const field = container.querySelector('ful-input');
        const input = field.querySelector('input');

        field.setAttribute('disabled', '');

        assert.isTrue(field.disabled, 'the claim reads back');
        assert.isTrue(field.matches(':disabled'), 'the host matches :disabled');
        assert.isTrue(input.matches(':disabled'), 'the inner control is disabled');
        assert.deepStrictEqual(Bindings.extractFrom(container.querySelector('form')), {}, 'the value is left out');

        field.removeAttribute('disabled');

        assert.isFalse(field.matches(':disabled'));
        assert.isFalse(input.matches(':disabled'));
        assert.deepStrictEqual(Bindings.extractFrom(container.querySelector('form')), { a: 'x' });

        //the property still behaves, the reflection guard keeps it out of the observer
        field.disabled = true;
        assert.isTrue(field.hasAttribute('disabled'));
        assert.isTrue(input.matches(':disabled'));
        field.disabled = false;
        assert.isFalse(field.hasAttribute('disabled'));
        assert.isFalse(input.matches(':disabled'));
    });

    const cases = [
        ['ful-checkbox', `<ful-checkbox name="a" value="true">l</ful-checkbox>`],
        ['ful-select', `<ful-select name="a" value="x">l</ful-select>`],
        [
            'ful-radio-group',
            `<ful-radio-group name="a" value="x">l<ful-radio value="x">x</ful-radio></ful-radio-group>`,
        ],
        ['ful-filter-text', `<ful-filter-text name="a">l</ful-filter-text>`],
    ];
    for (const [tag, markup] of cases) {
        it(`${tag} mirrors the attribute onto its control, and takes it back off`, async () => {
            const container = await mount(markup);
            const field = container.querySelector(tag);
            const inner = field.querySelector('input');

            field.setAttribute('disabled', '');
            assert.isTrue(inner.matches(':disabled'), `${tag} disables its control`);
            field.removeAttribute('disabled');
            assert.isFalse(inner.matches(':disabled'));
        });
    }

    it('composes with a disabled fieldset ancestry like the property does', async () => {
        const container = await mount('<form><fieldset><ful-input name="a" value="x">l</ful-input></fieldset></form>');
        const fieldset = container.querySelector('fieldset');
        const field = container.querySelector('ful-input');
        const input = field.querySelector('input');

        field.setAttribute('disabled', '');
        fieldset.setAttribute('disabled', '');
        assert.isTrue(input.matches(':disabled'), 'claim and ancestry agree while both are on');

        fieldset.removeAttribute('disabled');
        assert.isTrue(input.matches(':disabled'), 'the claim alone holds the control');
        assert.isTrue(field.matches(':disabled'));

        //un-claiming inside a disabled fieldset cannot enable the field
        fieldset.setAttribute('disabled', '');
        field.removeAttribute('disabled');
        assert.isFalse(field.hasAttribute('disabled'), 'the claim is gone');
        assert.isTrue(field.matches(':disabled'), 'the ancestry still disables it');
        assert.isTrue(input.matches(':disabled'), 'the inner control stays disabled');
    });

    it("composes with a radio group's own fieldset under an outer one", async () => {
        const container = await mount(
            '<form><fieldset><ful-radio-group name="a" value="x">l<ful-radio value="x">x</ful-radio></ful-radio-group></fieldset></form>',
        );
        const fieldset = container.querySelector('fieldset');
        const group = container.querySelector('ful-radio-group');
        const radio = group.querySelector('input[type=radio]');

        fieldset.setAttribute('disabled', '');
        group.setAttribute('disabled', '');
        assert.isTrue(radio.matches(':disabled'), 'ancestry and the group claim agree');

        fieldset.removeAttribute('disabled');
        assert.isTrue(radio.matches(':disabled'), "the group's own claim survives the outer fieldset");

        group.removeAttribute('disabled');
        assert.isFalse(radio.matches(':disabled'), 'un-claiming under a plain fieldset enables it');
    });

    it('tolerates a claim arriving while an async render is still in flight', async () => {
        const uncaught = [];
        const onError = (e) => {
            uncaught.push(e.error ?? e.message);
            e.preventDefault();
        };
        window.addEventListener('error', onError);
        let release = /** @type any */ (null);
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: () =>
                    new Promise((resolve) => {
                        release = resolve;
                    }),
                load: async () => [],
            }),
        });
        const container = appended('<ful-select name="a">l</ful-select>');
        const selectEl = container.querySelector('ful-select');
        //let the upgrade reach the prefetch await, then claim through the attribute
        for (let i = 0; i !== 5; ++i) {
            await tick();
        }
        selectEl.setAttribute('disabled', '');
        release();
        await Rendering.waitFor(selectEl);
        await settle();

        assert.deepStrictEqual(uncaught, [], 'the claim does not crash the unrendered field');
        assert.isTrue(selectEl.matches(':disabled'), 'the claim is live');
        assert.isTrue(selectEl.querySelector('input').matches(':disabled'), 'the render applied it to the control');
        window.removeEventListener('error', onError);
    });

    it('applies a value arriving while an async render is still in flight', async () => {
        const uncaught = [];
        const onError = (e) => {
            uncaught.push(e.error ?? e.message);
            e.preventDefault();
        };
        window.addEventListener('error', onError);
        let release = /** @type any */ (null);
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: () =>
                    new Promise((resolve) => {
                        release = resolve;
                    }),
                load: async () => [],
                exact: async (...k) => k.map((v) => ({ key: v, label: v })),
            }),
        });
        const container = appended('<ful-select name="a">l</ful-select>');
        const selectEl = container.querySelector('ful-select');
        //let the upgrade reach the prefetch await, then write through the attribute
        for (let i = 0; i !== 5; ++i) {
            await tick();
        }
        selectEl.setAttribute('value', 'kept');
        release();
        await Rendering.waitFor(selectEl);
        await settle();

        assert.deepStrictEqual(uncaught, [], 'the write does not crash the unrendered field');
        assert.strictEqual(selectEl.value, 'kept', 'the render applied it');
        assert.strictEqual(selectEl.querySelector('input').value, 'kept');
        window.removeEventListener('error', onError);
    });

    it('reaches custom Field subclasses that never list it', async () => {
        class TestField extends Field {
            static slots = true;
            static template = '<label>{{{{ slots.default }}}}</label><input form="">';
            #input;
            _build({ slots }) {
                const fragment = this.template().withOverlay({ slots }).render();
                this.#input = fragment.querySelector('input');
                return { fragment, control: this.#input, error: null };
            }
            get value() {
                return this.#input.value === '' ? null : this.#input.value;
            }
            set value(v) {
                this.#input.value = v ?? '';
            }
        }
        registry.defineElement('x-test-field', TestField);

        const container = await mount('<x-test-field name="a" value="x">l</x-test-field>');
        const field = container.querySelector('x-test-field');
        const input = field.querySelector('input');

        field.setAttribute('disabled', '');

        assert.isTrue(field.disabled, 'the base-observed claim reaches the subclass');
        assert.isTrue(input.matches(':disabled'), 'the subclass mirror ran');
        field.removeAttribute('disabled');
        assert.isFalse(input.matches(':disabled'));

        field.setAttribute('readonly', '');
        assert.isTrue(input.readOnly, 'the readonly claim reaches the subclass mirror');
        field.setAttribute('required', '');
        assert.strictEqual(
            input.getAttribute('aria-required'),
            'true',
            'the required claim reaches the subclass mirror',
        );
        field.removeAttribute('readonly');
        field.removeAttribute('required');
        assert.isFalse(input.readOnly);
        assert.isNull(input.getAttribute('aria-required'));
        assert.strictEqual(field.value, 'x', 'the base-delivered value mapper feeds the subclass');
    });

    it('resets a custom field that never declared a value, instead of crashing', async () => {
        class BareField extends Field {
            static slots = true;
            static template = '<label>{{{{ slots.default }}}}</label><input form="">';
            _build({ slots }) {
                const fragment = this.template().withOverlay({ slots }).render();
                return { fragment, control: fragment.querySelector('input'), error: null };
            }
        }
        registry.defineElement('x-bare-field', BareField);
        const uncaught = [];
        const onError = (e) => {
            uncaught.push(e.error?.message ?? e.message);
            e.preventDefault();
        };
        window.addEventListener('error', onError);

        const container = await mount('<form><x-bare-field name="a">l</x-bare-field></form>');
        try {
            container.querySelector('form').reset();
        } finally {
            window.removeEventListener('error', onError);
        }

        assert.deepStrictEqual(uncaught, [], 'the inert base value pair absorbs the reset write');
    });
});
