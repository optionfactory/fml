import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';
import { appended, settle } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

/**
 * Enter submits the form from a field's control, the way it does from a native
 * one. Every field detaches its inner control with form="", so the platform's
 * own implicit submission has nothing to act on and the base stands in for it.
 *
 * The expectations below are the platform's, measured on Chromium, Firefox and
 * WebKit with the same controls in a plain form: every input but the file picker
 * submits, the checkbox and the radio included, and a textarea, a select and a
 * button keep the key for themselves.
 */
describe('Field implicit submission', () => {
    let submits;
    beforeEach(() => {
        submits = [];
        registry.defineComponent('loaders:form', {
            create: () => ({
                prepare: async (v) => v,
                submit: async (values) => {
                    submits.push(values);
                    return {};
                },
                transform: async (r) => r,
            }),
        });
    });
    const mount = async (field) => {
        const container = appended(`
            <ful-form>
                ${field}
                <button type="submit">go</button>
            </ful-form>`);
        const form = container.firstElementChild;
        await Rendering.waitFor(form);
        await Rendering.waitForChildren(form);
        await settle();
        return form;
    };
    const enter = (el) => {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    };

    const submitting = [
        ['ful-input', `<ful-input name="a">label</ful-input>`, 'input'],
        ['ful-input type=number', `<ful-input type="number" name="a">label</ful-input>`, 'input'],
        ['ful-input-local-date', `<ful-input-local-date name="a">label</ful-input-local-date>`, 'input'],
        ['ful-input-instant', `<ful-input-instant name="a">label</ful-input-instant>`, 'input'],
        ['ful-input-local-time', `<ful-input-local-time name="a">label</ful-input-local-time>`, 'input'],
        ['ful-checkbox', `<ful-checkbox name="a">label</ful-checkbox>`, 'input'],
        [
            'ful-radio-group',
            `<ful-radio-group name="a">label<ful-radio value="k1">one</ful-radio></ful-radio-group>`,
            'input[type=radio]',
        ],
        ['ful-filter-text first operand', `<ful-filter-text name="a">label</ful-filter-text>`, '[data-ref=value1]'],
        ['ful-filter-text second operand', `<ful-filter-text name="a">label</ful-filter-text>`, '[data-ref=value2]'],
        ['ful-filter-number', `<ful-filter-number name="a">label</ful-filter-number>`, '[data-ref=value1]'],
        [
            'ful-filter-local-date',
            `<ful-filter-local-date name="a">label</ful-filter-local-date>`,
            '[data-ref=value1]',
        ],
    ];
    for (const [name, markup, selector] of submitting) {
        it(`submits from ${name}, as the native control it wraps does`, async () => {
            const form = await mount(markup);
            const control = form.querySelector(selector);
            assert.strictEqual(control.getAttribute('form'), '', 'the inner control is detached from the form');

            enter(control);
            await settle();

            assert.strictEqual(submits.length, 1);
        });
    }

    const keeping = [
        ['a textarea, where Enter inserts a newline', `<ful-input type="textarea" name="a">l</ful-input>`, 'textarea'],
        ['a file field, whose Enter opens the picker', `<ful-input-file name="a">l</ful-input-file>`, 'input'],
        [
            "a filter's operator button, whose Enter opens its menu",
            `<ful-filter-text name="a">l</ful-filter-text>`,
            '[data-ref=operator]',
        ],
        [
            "ful-filter-boolean, whose control is a button and whose Enter opens its menu",
            `<ful-filter-boolean name="a">l</ful-filter-boolean>`,
            '[data-ref=value]',
        ],
    ];
    for (const [name, markup, selector] of keeping) {
        it(`leaves Enter to ${name}`, async () => {
            const form = await mount(markup);

            enter(form.querySelector(selector));
            await settle();

            assert.deepStrictEqual(submits, []);
        });
    }

    it('leaves Enter alone while an input method is composing', async () => {
        const form = await mount(`<ful-input name="a">label</ful-input>`);

        form.querySelector('input').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, isComposing: true }),
        );
        await settle();

        assert.deepStrictEqual(submits, [], 'the key closes the composition instead');
    });

    it('leaves Enter alone once the field has consumed it', async () => {
        const form = await mount(`<ful-input name="a">label</ful-input>`);
        const input = form.querySelector('input');
        input.addEventListener('keydown', (evt) => evt.preventDefault());

        enter(input);
        await settle();

        assert.deepStrictEqual(submits, [], 'a field that handled the key owns it');
    });

    it('does not stand in for a control the platform still submits itself', async () => {
        const form = await mount(`<ful-input name="a"><span slot="after"><input id="own"></span>label</ful-input>`);
        const own = form.querySelector('#own');
        assert.strictEqual(own.form, form.querySelector('form'), "an author's own input is in the form");

        enter(own);
        await settle();

        assert.deepStrictEqual(submits, [], 'the platform submits it, so the base must not submit it again');
    });
});
