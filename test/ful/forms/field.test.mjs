import { tick } from '../../tick.mjs';
import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin, Field } from '../../../src/ful/index.mjs';
import { appended, settle } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const mount = async (html) => {
    const container = appended(html);
    await Rendering.waitFor(container);
    await settle();
    return container;
};

describe('Field', () => {
    it('tolerates a claim arriving while an async render is still in flight', async () => {
        const uncaught = [];
        const onError = (e) => {
            uncaught.push(e.error?.message ?? e.message);
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
                exact: async (...keys) => keys.map((k) => ({ key: k, label: String(k) })),
            }),
        });
        const container = appended('<ful-select name="a">l</ful-select>');
        const selectEl = container.querySelector('ful-select');
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

    it('ignores a value property written before the render, without crashing', async () => {
        const uncaught = [];
        const onError = (e) => {
            uncaught.push(e.error?.message ?? e.message);
            e.preventDefault();
        };
        window.addEventListener('error', onError);
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                load: async () => [],
                exact: async (...k) => k.map((v) => ({ key: v, label: v })),
            }),
        });
        const container = appended('<ful-select name="a">l</ful-select>');
        const selectEl = container.querySelector('ful-select');
        selectEl.value = 'early';
        await Rendering.waitFor(selectEl);
        await settle();

        assert.deepStrictEqual(uncaught, [], 'the property write does not crash the unrendered field');
        assert.strictEqual(
            selectEl.value,
            null,
            'the declared state wins, a property written before the render being unsupported',
        );
        window.removeEventListener('error', onError);
    });

    it('an async _build renders the field once its pieces arrive', async () => {
        class SlowField extends Field {
            static slots = true;
            static template = '<label>{{{{ slots.default }}}}</label><input form="">';
            async _build({ slots }) {
                await new Promise((r) => setTimeout(r, 0));
                const fragment = this.template().withOverlay({ slots }).render();
                return {
                    fragment,
                    control: fragment.querySelector('input'),
                    error: null,
                };
            }
            get value() {
                return this.querySelector('input')?.value || null;
            }
            set value(v) {
                const input = this.querySelector('input');
                if (input) {
                    input.value = v ?? '';
                }
            }
        }
        registry.defineElement('x-slow-field', SlowField);

        const container = await mount('<x-slow-field name="a" value="late">l</x-slow-field>');
        const field = container.querySelector('x-slow-field');

        assert.isTrue(field.rendered, 'the upgrade waited for the promise');
        assert.strictEqual(
            String(field.querySelector('input').value),
            'late',
            'the value attribute reaches the control that the async build delivered',
        );
    });

    it('a focus() asked before the render lands once the control exists', async () => {
        let release;
        const gate = new Promise((r) => {
            release = r;
        });
        class GatedField extends Field {
            static slots = true;
            static template = '<input form="">';
            async _build() {
                await gate;
                const fragment = this.template().render();
                return {
                    fragment,
                    control: fragment.querySelector('input'),
                    error: null,
                };
            }
            get value() {
                return null;
            }
            set value(_v) {}
        }
        registry.defineElement('x-gated-field', GatedField);

        const container = appended('<x-gated-field name="a">l</x-gated-field>');
        const field = container.querySelector('x-gated-field');
        assert.isFalse(field.rendered, 'the field is still building');
        field.focus();
        assert.notStrictEqual(document.activeElement, field, 'the waiting host itself takes no focus');

        release();
        await Rendering.waitFor(field);
        await settle();
        assert.isTrue(document.activeElement === field.querySelector('input'), 'the control is focused once it exists');
    });

    it('a field that never implements _build says so by name', async () => {
        class NoBuildField extends Field {}
        registry.defineElement('x-no-build-field', NoBuildField);

        const el = document.createElement('x-no-build-field');
        assert.isUndefined(el.value, 'a subclass without its own value pair reads the base value, undefined');
        el.value = 'ignored';
        assert.isUndefined(el.value, 'the base value pair ignores writes');

        appended('').appendChild(el);
        let complaint = null;
        try {
            await registry.whenUpgraded(el);
        } catch (ex) {
            complaint = String(/** @type any */ (ex).message);
        }
        assert.strictEqual(
            complaint,
            'NoBuildField must implement _build',
            'the upgrade fails with an error naming the subclass that lacks _build',
        );
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
        assert.isFalse(input.matches(':disabled'), 'lifting the disabled claim reaches the subclass control as well');

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
        assert.isFalse(input.readOnly, 'lifting the readonly claim reaches the subclass control as well');
        assert.isNull(
            input.getAttribute('aria-required'),
            'lifting the required claim removes aria-required from the subclass control',
        );
        assert.strictEqual(field.value, 'x', 'the base-delivered value mapper feeds the subclass');
    });

    it('resets a custom field that never declared a value, instead of crashing', async () => {
        class BareField extends Field {
            static slots = true;
            static template = '<label>{{{{ slots.default }}}}</label><input form="">';
            _build({ slots }) {
                const fragment = this.template().withOverlay({ slots }).render();
                return {
                    fragment,
                    control: fragment.querySelector('input'),
                    error: null,
                };
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
