import { tick } from '../../tick.mjs';
import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const mount = async (html) => {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const el = container.firstElementChild;
    await Rendering.waitFor(el);
    return [el, container];
};

describe('Input placeholder', () => {
    for (const tag of ['ful-input', 'ful-input-local-date', 'ful-input-instant', 'ful-input-file', 'ful-filter-text']) {
        it(`${tag} applies the initial placeholder attribute`, async () => {
            const [el, container] = await mount(`<${tag} placeholder="PH">l</${tag}>`);
            assert.strictEqual(el.querySelector('input').getAttribute('placeholder'), 'PH', `${tag} inner input`);
            assert.strictEqual(el.placeholder, 'PH', `${tag} getter`);
            container.remove();
        });
        it(`${tag} applies a later placeholder change`, async () => {
            const [el, container] = await mount(`<${tag}>l</${tag}>`);
            el.setAttribute('placeholder', 'LATER');
            assert.strictEqual(el.querySelector('input').getAttribute('placeholder'), 'LATER', `${tag} inner input`);
            container.remove();
        });
    }
});

describe('Input placeholder and :placeholder-shown', () => {
    const mount = async (html) => {
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const el = container.firstElementChild;
        await Rendering.waitFor(el);
        return [el, container];
    };

    //:placeholder-shown only matches on input types that take a placeholder at all,
    //so date, time and file inputs carry the blank one without ever matching
    for (const tag of ['ful-input', 'ful-filter-text']) {
        it(`${tag} keeps a blank placeholder, so the label can float`, async () => {
            const [el, container] = await mount(`<${tag}>l</${tag}>`);
            const input = el.querySelector('input');

            assert.strictEqual(input.getAttribute('placeholder'), ' ');
            assert.isTrue(input.matches(':placeholder-shown'));
            assert.isNull(el.placeholder, 'the blank one does not read back as a value');
            container.remove();
        });
    }

    for (const tag of ['ful-input-file', 'ful-input-local-date', 'ful-input-instant']) {
        it(`${tag} keeps a blank placeholder without reporting it as a value`, async () => {
            const [el, container] = await mount(`<${tag}>l</${tag}>`);

            assert.strictEqual(el.querySelector('input').getAttribute('placeholder'), ' ');
            assert.isNull(el.placeholder);
            container.remove();
        });
    }

    it('restores the blank placeholder when the attribute is removed', async () => {
        const [el, container] = await mount(`<ful-input placeholder="p">l</ful-input>`);
        const input = el.querySelector('input');
        assert.strictEqual(input.getAttribute('placeholder'), 'p');

        el.removeAttribute('placeholder');

        assert.strictEqual(input.getAttribute('placeholder'), ' ');
        assert.isNull(el.placeholder);
        container.remove();
    });

    it('does not reflect the blank placeholder onto the host', async () => {
        const [el, container] = await mount(`<ful-input>l</ful-input>`);

        assert.isFalse(el.hasAttribute('placeholder'));
        container.remove();
    });
});

describe('Input enter key inside a form', () => {
    let submitters;
    let submits;
    const settle = async () => {
        for (let i = 0; i !== 20; ++i) {
            await tick();
        }
    };
    const mount = async (html) => {
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const inputEl = container.querySelector('ful-input');
        await Rendering.waitFor(container.firstElementChild);
        await Rendering.waitFor(inputEl);
        await settle();
        return [inputEl, container];
    };
    const enter = (inputEl) => {
        inputEl.querySelector('input,textarea').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }),
        );
    };
    beforeEach(() => {
        submits = [];
        submitters = [];
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

    it('submits the enclosing form, which the detached inner input can never do', async () => {
        const [inputEl, container] = await mount(`
            <ful-form>
                <ful-input name="i">label</ful-input>
                <button type="submit">go</button>
            </ful-form>`);
        assert.strictEqual(inputEl.querySelector('input').getAttribute('form'), '', 'the inner input is detached');

        enter(inputEl);
        await settle();

        assert.strictEqual(submits.length, 1);
        container.remove();
    });

    it('submits with the first enabled submit control as the submitter', async () => {
        const [inputEl, container] = await mount(`
            <ful-form>
                <ful-input name="i">label</ful-input>
                <button type="button" id="not-a-submitter">cancel</button>
                <button type="submit" id="disabled-submitter" disabled>stale</button>
                <button type="submit" id="the-submitter">go</button>
                <button type="submit" id="later-submitter">also go</button>
            </ful-form>`);
        container.firstElementChild.addEventListener('submit', (e) => submitters.push(e.detail.submitter));

        enter(inputEl);
        await settle();

        assert.strictEqual(submits.length, 1);
        assert.strictEqual(submitters.length, 1);
        assert.strictEqual(submitters[0].id, 'the-submitter');
        container.remove();
    });

    it('submits without a submitter when the form has no submit control', async () => {
        const [inputEl, container] = await mount(`
            <ful-form>
                <ful-input name="i">label</ful-input>
            </ful-form>`);
        container.firstElementChild.addEventListener('submit', (e) => submitters.push(e.detail.submitter));

        enter(inputEl);
        await settle();

        assert.strictEqual(submits.length, 1);
        assert.deepStrictEqual(submitters, [undefined]);
        container.remove();
    });

    it('leaves enter alone in a textarea, where it inserts a newline', async () => {
        const [inputEl, container] = await mount(`
            <ful-form>
                <ful-input type="textarea" name="i">label</ful-input>
                <button type="submit">go</button>
            </ful-form>`);
        assert.isNotNull(inputEl.querySelector('textarea'));

        enter(inputEl);
        await settle();

        assert.strictEqual(submits.length, 0);
        container.remove();
    });

    it('does not submit on any other key', async () => {
        const [inputEl, container] = await mount(`
            <ful-form>
                <ful-input name="i">label</ful-input>
                <button type="submit">go</button>
            </ful-form>`);

        inputEl.querySelector('input').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true }),
        );
        await settle();

        assert.strictEqual(submits.length, 0);
        container.remove();
    });

    it('does nothing on enter outside a form', async () => {
        const [inputEl, container] = await mount(`<ful-input name="i">label</ful-input>`);

        enter(inputEl);
        await settle();

        assert.strictEqual(submits.length, 0);
        container.remove();
    });
});

describe('Input mask', () => {
    const type = (el, value, caret) => {
        const input = el.querySelector('input');
        input.value = value;
        if (caret !== undefined) {
            input.setSelectionRange(caret, caret);
        }
        input.dispatchEvent(new Event('input'));
        return input;
    };

    it('strips the characters the mask matches as they are typed', async () => {
        const [el, container] = await mount(`<ful-input mask="[^0-9]">l</ful-input>`);

        const input = type(el, 'a1');

        assert.strictEqual(input.value, '1');
        assert.strictEqual(el.value, '1', 'the host reports the masked value');
        container.remove();
    });

    it('strips every match, not only the first one', async () => {
        const [el, container] = await mount(`<ful-input mask="[^0-9]">l</ful-input>`);

        const input = type(el, 'a1b2c3');

        assert.strictEqual(input.value, '123');
        container.remove();
    });

    it('keeps the caret next to the same character when earlier ones are stripped', async () => {
        const [el, container] = await mount(`<ful-input mask="[^0-9]">l</ful-input>`);

        //caret sits right after the '2' of 'a1b2|3'
        const input = type(el, 'a1b23', 4);

        assert.strictEqual(input.value, '123');
        assert.strictEqual(input.selectionStart, 2, "still right after the '2'");
        assert.strictEqual(input.selectionEnd, 2);
        container.remove();
    });

    it('leaves a value with nothing to strip completely alone, selection included', async () => {
        const [el, container] = await mount(`<ful-input mask="[^0-9]">l</ful-input>`);
        const input = el.querySelector('input');
        input.value = '123';
        input.setSelectionRange(1, 3);

        input.dispatchEvent(new Event('input'));

        assert.strictEqual(input.value, '123');
        assert.strictEqual(input.selectionStart, 1, 'the selection is not collapsed');
        assert.strictEqual(input.selectionEnd, 3);
        container.remove();
    });

    it('does not touch the value when no mask is declared', async () => {
        const [el, container] = await mount(`<ful-input>l</ful-input>`);

        const input = type(el, 'a1b2');

        assert.strictEqual(input.value, 'a1b2');
        container.remove();
    });

    it('reads the mask on every input, so a later attribute change applies', async () => {
        const [el, container] = await mount(`<ful-input>l</ful-input>`);
        assert.strictEqual(type(el, 'a1').value, 'a1');

        el.setAttribute('mask', '[^0-9]');

        assert.strictEqual(type(el, 'a1').value, '1');
        container.remove();
    });
});

describe('Input mask on values it cannot place a caret in', () => {
    const mount = async (attrs) => {
        const container = document.createElement('div');
        container.innerHTML = `<ful-input name="a" ${attrs}>label</ful-input>`;
        document.body.appendChild(container);
        const el = container.querySelector('ful-input');
        await Rendering.waitFor(el);
        return [el, container];
    };

    it('masks an email, which has no selection to restore', async () => {
        //setSelectionRange throws on the types that report a null selectionStart, and an
        //uncaught error in the listener fails this test on its own
        const [el, container] = await mount('type="email" mask="[^a-z@.]"');
        const input = el.querySelector('input');

        input.value = 'a1b2@x.com';
        input.dispatchEvent(new Event('input'));

        assert.strictEqual(input.value, 'ab@x.com');
        container.remove();
    });

    it('keeps the caret in place when characters after it are stripped too', async () => {
        const [el, container] = await mount('mask="[a-z]"');
        const input = el.querySelector('input');

        input.value = 'a1b2c3';
        input.setSelectionRange(4, 4);
        input.dispatchEvent(new Event('input'));

        assert.strictEqual(input.value, '123');
        assert.strictEqual(input.selectionStart, 2, 'the caret stays after the 2 it was after');
        container.remove();
    });
});

describe('Input focus and reset', () => {
    it('hands its focus to the inner control', async () => {
        const [el, container] = await mount(`<ful-input>l</ful-input>`);

        el.focus();

        assert.strictEqual(document.activeElement, el.querySelector('input'));
        container.remove();
    });

    it('restores the value it was rendered with when the form resets', async () => {
        const [el, container] = await mount(`
            <ful-form>
                <ful-input name="who" value="ann">who</ful-input>
            </ful-form>`);
        const input = el.querySelector('ful-input');
        await Rendering.waitFor(input);
        assert.strictEqual(input.value, 'ann');

        input.value = 'bob';
        assert.strictEqual(input.value, 'bob');

        el.reset();

        assert.strictEqual(input.value, 'ann', 'the reset brings back the rendered value');
        container.remove();
    });
});
