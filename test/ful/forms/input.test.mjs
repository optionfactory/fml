import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Field, Plugin } from '../../../src/ful/index.mjs';
import { appended, settle } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const mount = async (html) => {
    const container = appended(html);
    const el = container.firstElementChild;
    await Rendering.waitFor(el);
    return [el, container];
};

describe('Input placeholder', () => {
    for (const tag of ['ful-input', 'ful-input-local-date', 'ful-input-instant', 'ful-input-file', 'ful-filter-text']) {
        it(`${tag} applies the initial placeholder attribute`, async () => {
            const [el] = await mount(`<${tag} placeholder="PH">l</${tag}>`);
            assert.strictEqual(el.querySelector('input').getAttribute('placeholder'), 'PH', `${tag} inner input`);
            assert.strictEqual(el.placeholder, 'PH', `${tag} getter`);
        });
        it(`${tag} applies a later placeholder change`, async () => {
            const [el] = await mount(`<${tag}>l</${tag}>`);
            el.setAttribute('placeholder', 'LATER');
            assert.strictEqual(el.querySelector('input').getAttribute('placeholder'), 'LATER', `${tag} inner input`);
        });
    }
});

describe('Input placeholder and :placeholder-shown', () => {
    const mount = async (html) => {
        const container = appended(html);
        const el = container.firstElementChild;
        await Rendering.waitFor(el);
        return [el, container];
    };

    it('treats an undefined value assignment as empty, not the text "undefined"', async () => {
        const [el] = await mount(`<ful-input name="a" value="x">l</ful-input>`);

        el.value = undefined;

        assert.isNull(el.value);
        assert.strictEqual(el.querySelector('input').value, '');
    });

    it('decodes the value to a number under v-type, an explicit opt in', async () => {
        const [el] = await mount(`<ful-input name="a" type="number" v-type="number" value="42">l</ful-input>`);

        assert.strictEqual(el.value, 42);

        el.value = 6.5;
        assert.strictEqual(el.value, 6.5);
        assert.strictEqual(el.querySelector('input').value, '6.5');

        el.value = null;
        assert.isNull(el.value, 'blank stays null, never NaN');
    });

    it('keeps a v-type value that does not decode as it is, like the select keys', async () => {
        //an explicit text type: the defaulted number widget would sanitize the
        //garbage away before the getter ever saw it
        const [el] = await mount(`<ful-input name="a" type="text" v-type="number" value="abc">l</ful-input>`);

        assert.strictEqual(el.value, 'abc');
    });

    it('defaults the native type to number under v-type, a declared type winning', async () => {
        const [defaulted, c1] = await mount(`<ful-input name="a" v-type="number">l</ful-input>`);
        assert.strictEqual(defaulted.querySelector('input').type, 'number');
        c1.remove();

        const [declared, c2] = await mount(`<ful-input name="a" type="range" v-type="number">l</ful-input>`);
        assert.strictEqual(declared.querySelector('input').type, 'range');
        c2.remove();
    });

    it('announces the decoded number through change', async () => {
        const [el] = await mount(`<ful-input name="a" type="number" v-type="number">l</ful-input>`);
        const seen = [];
        el.addEventListener('change', (evt) => seen.push(evt.detail.value));

        const input = el.querySelector('input');
        input.value = '7';
        input.dispatchEvent(new Event('change', { bubbles: true }));

        assert.deepStrictEqual(seen, [7]);
    });

    it('leaves the value a string without the opt in', async () => {
        const [el] = await mount(`<ful-input name="a" type="number" value="42">l</ful-input>`);

        assert.strictEqual(el.value, '42');
    });

    //:placeholder-shown only matches on input types that take a placeholder at all,
    //so date, time and file inputs carry the blank one without ever matching
    for (const tag of ['ful-input', 'ful-filter-text']) {
        it(`${tag} keeps a blank placeholder, so the label can float`, async () => {
            const [el] = await mount(`<${tag}>l</${tag}>`);
            const input = el.querySelector('input');

            assert.strictEqual(input.getAttribute('placeholder'), ' ');
            assert.isTrue(input.matches(':placeholder-shown'));
            assert.isNull(el.placeholder, 'the blank one does not read back as a value');
        });
    }

    for (const tag of ['ful-input-file', 'ful-input-local-date', 'ful-input-instant']) {
        it(`${tag} keeps a blank placeholder without reporting it as a value`, async () => {
            const [el] = await mount(`<${tag}>l</${tag}>`);

            assert.strictEqual(el.querySelector('input').getAttribute('placeholder'), ' ');
            assert.isNull(el.placeholder);
        });
    }

    it('restores the blank placeholder when the attribute is removed', async () => {
        const [el] = await mount(`<ful-input placeholder="p">l</ful-input>`);
        const input = el.querySelector('input');
        assert.strictEqual(input.getAttribute('placeholder'), 'p');

        el.removeAttribute('placeholder');

        assert.strictEqual(input.getAttribute('placeholder'), ' ');
        assert.isNull(el.placeholder);
    });

    it('does not reflect the blank placeholder onto the host', async () => {
        const [el] = await mount(`<ful-input>l</ful-input>`);

        assert.isFalse(el.hasAttribute('placeholder'));
    });
});

describe('Input enter key inside a form', () => {
    let submitters;
    let submits;
    const mount = async (html) => {
        const container = appended(html);
        const inputEl = container.querySelector('ful-input');
        await Rendering.waitFor(container.firstElementChild);
        await Rendering.waitFor(inputEl);
        await settle();
        return [inputEl, container];
    };
    const enter = (inputEl) => {
        inputEl
            .querySelector('input,textarea')
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
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

    it('does not submit on Enter from a file field, whose Enter opens the picker', async () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <ful-form>
                <ful-input-file name="f">file</ful-input-file>
                <button type="submit">go</button>
            </ful-form>`;
        document.body.appendChild(container);
        const fileEl = container.querySelector('ful-input-file');
        await Rendering.waitFor(container.firstElementChild);
        await Rendering.waitFor(fileEl);
        await settle();

        fileEl
            .querySelector('input')
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        await settle();

        assert.deepStrictEqual(submits, [], 'the picker opens, the form stays put');
    });

    it('submits the enclosing form, which the detached inner input can never do', async () => {
        const [inputEl] = await mount(`
            <ful-form>
                <ful-input name="i">label</ful-input>
                <button type="submit">go</button>
            </ful-form>`);
        assert.strictEqual(inputEl.querySelector('input').getAttribute('form'), '', 'the inner input is detached');

        enter(inputEl);
        await settle();

        assert.strictEqual(submits.length, 1);
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
    });

    it('submits without a submitter when the only candidate belongs to another form', async () => {
        const [inputEl, container] = await mount(`
            <ful-form>
                <ful-input name="i">label</ful-input>
                <button type="submit" form="">foreign</button>
            </ful-form>`);
        container.firstElementChild.addEventListener('submit', (e) => submitters.push(e.detail.submitter));

        enter(inputEl);
        await settle();

        assert.strictEqual(submits.length, 1);
        assert.deepStrictEqual(
            submitters,
            [undefined],
            'the foreign button is neither passed to requestSubmit nor recorded',
        );
    });

    it('picks the owned submitter over a foreign one coming first in document order', async () => {
        const [inputEl, container] = await mount(`
            <ful-form>
                <ful-input name="i">label</ful-input>
                <button type="submit" form="">foreign</button>
                <button type="submit" id="the-submitter">go</button>
            </ful-form>`);
        container.firstElementChild.addEventListener('submit', (e) => submitters.push(e.detail.submitter));

        enter(inputEl);
        await settle();

        assert.strictEqual(submits.length, 1);
        assert.strictEqual(submitters[0].id, 'the-submitter');
    });

    it('leaves enter alone in a textarea, where it inserts a newline', async () => {
        const [inputEl] = await mount(`
            <ful-form>
                <ful-input type="textarea" name="i">label</ful-input>
                <button type="submit">go</button>
            </ful-form>`);
        assert.isNotNull(inputEl.querySelector('textarea'));

        enter(inputEl);
        await settle();

        assert.strictEqual(submits.length, 0);
    });

    it('does not submit on any other key', async () => {
        const [inputEl] = await mount(`
            <ful-form>
                <ful-input name="i">label</ful-input>
                <button type="submit">go</button>
            </ful-form>`);

        inputEl
            .querySelector('input')
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true }));
        await settle();

        assert.strictEqual(submits.length, 0);
    });

    it('does nothing on enter outside a form', async () => {
        const [inputEl] = await mount(`<ful-input name="i">label</ful-input>`);

        enter(inputEl);
        await settle();

        assert.strictEqual(submits.length, 0);
    });
});

describe('Input keep and reject', () => {
    const type = (el, value, caret) => {
        const input = el.querySelector('input');
        input.value = value;
        if (caret !== undefined) {
            input.setSelectionRange(caret, caret);
        }
        input.dispatchEvent(new Event('input'));
        return input;
    };

    it('strips the characters reject matches as they are typed', async () => {
        const [el] = await mount(`<ful-input reject="[^0-9]">l</ful-input>`);

        const input = type(el, 'a1');

        assert.strictEqual(input.value, '1');
        assert.strictEqual(el.value, '1', 'the host reports the filtered value');
    });

    it('strips every match, not only the first one', async () => {
        const [el] = await mount(`<ful-input reject="[^0-9]">l</ful-input>`);

        const input = type(el, 'a1b2c3');

        assert.strictEqual(input.value, '123');
    });

    it('keeps the caret next to the same character when earlier ones are stripped', async () => {
        const [el] = await mount(`<ful-input reject="[^0-9]">l</ful-input>`);

        //caret sits right after the '2' of 'a1b2|3'
        const input = type(el, 'a1b23', 4);

        assert.strictEqual(input.value, '123');
        assert.strictEqual(input.selectionStart, 2, "still right after the '2'");
        assert.strictEqual(input.selectionEnd, 2);
    });

    it('leaves a value with nothing to strip completely alone, selection included', async () => {
        const [el] = await mount(`<ful-input reject="[^0-9]">l</ful-input>`);
        const input = el.querySelector('input');
        input.value = '123';
        input.setSelectionRange(1, 3);

        input.dispatchEvent(new Event('input'));

        assert.strictEqual(input.value, '123');
        assert.strictEqual(input.selectionStart, 1, 'the selection is not collapsed');
        assert.strictEqual(input.selectionEnd, 3);
    });

    it('does not touch the value when neither is declared', async () => {
        const [el] = await mount(`<ful-input>l</ful-input>`);

        const input = type(el, 'a1b2');

        assert.strictEqual(input.value, 'a1b2');
    });

    it('keeps only what keep matches, the same statement from the other side', async () => {
        const [el] = await mount(`<ful-input keep="[0-9]">l</ful-input>`);

        const input = type(el, 'a1b2c3');

        assert.strictEqual(input.value, '123');
        assert.strictEqual(el.value, '123');
    });

    it('keeps the caret in place under keep too', async () => {
        const [el] = await mount(`<ful-input keep="[0-9]">l</ful-input>`);

        //caret sits right after the '2' of 'a1b2|3'
        const input = type(el, 'a1b23', 4);

        assert.strictEqual(input.value, '123');
        assert.strictEqual(input.selectionStart, 2, "still right after the '2'");
    });

    it('keeps multi-character matches, not only single characters', async () => {
        //keep takes a pattern, not a character class: negating it would not have
        //given this, which is why the kept text is matched rather than the rest stripped
        const [el] = await mount(`<ful-input keep="[0-9]{2}">l</ful-input>`);

        const input = type(el, 'a12b3c45');

        assert.strictEqual(input.value, '1245', 'the lone 3 never forms a pair');
    });

    it('applies keep and warns once when both are declared', async () => {
        const originalWarn = console.warn;
        const warns = [];
        console.warn = (...args) => warns.push(args);
        try {
            const [el] = await mount(`<ful-input keep="[0-9]" reject="[0-9]">l</ful-input>`);

            const input = type(el, 'a1b2');
            assert.strictEqual(input.value, '12', 'keep won, so the digits survived');
            type(el, 'a1b2c3');
            assert.lengthOf(warns, 1, 'warned once, not per keystroke');
            assert.include(String(warns[0]), 'both keep and reject');
        } finally {
            console.warn = originalWarn;
        }
    });

    it('warns once and ignores a malformed pattern instead of throwing per keystroke', async () => {
        const originalWarn = console.warn;
        const warns = [];
        console.warn = (...args) => warns.push(args);
        try {
            const [el, container] = await mount(`<ful-input reject="[">l</ful-input>`);

            const input = type(el, 'a1');
            assert.strictEqual(input.value, 'a1', 'an invalid pattern behaves as none at all');
            assert.strictEqual(el.value, 'a1');
            type(el, 'a12');
            assert.strictEqual(input.value, 'a12');
            assert.lengthOf(warns, 1, 'warned once, not per keystroke');
            assert.isTrue(String(warns[0]).includes('reject'));
            container.remove();
        } finally {
            console.warn = originalWarn;
        }
    });

    it('reads the filter once, at the upgrade, like the rest of its configuration', async () => {
        const [el] = await mount(`<ful-input keep="[0-9]">l</ful-input>`);
        assert.strictEqual(type(el, 'a1').value, '1');

        //configuration, not a live claim: the filter says how the control treats
        //what is typed into it, which is decided when the element is written
        el.setAttribute('keep', '[a-z]');
        assert.strictEqual(type(el, 'a1').value, '1', 'a later attribute write does not change it');

        const [fresh] = await mount(`<ful-input keep="[a-z]">l</ful-input>`);
        assert.strictEqual(type(fresh, 'a1').value, 'a', 'a new element reads what its markup says');
    });
});

describe('Input filters on values it cannot place a caret in', () => {
    const mount = async (attrs) => {
        const container = appended(`<ful-input name="a" ${attrs}>label</ful-input>`);
        const el = container.querySelector('ful-input');
        await Rendering.waitFor(el);
        return [el, container];
    };

    it('filters an email, which has no selection to restore', async () => {
        //setSelectionRange throws on the types that report a null selectionStart, and an
        //uncaught error in the listener fails this test on its own
        const [el] = await mount('type="email" reject="[^a-z@.]"');
        const input = el.querySelector('input');

        input.value = 'a1b2@x.com';
        input.dispatchEvent(new Event('input'));

        assert.strictEqual(input.value, 'ab@x.com');
    });

    it('keeps the caret in place when characters after it are stripped too', async () => {
        const [el] = await mount('reject="[a-z]"');
        const input = el.querySelector('input');

        input.value = 'a1b2c3';
        input.setSelectionRange(4, 4);
        input.dispatchEvent(new Event('input'));

        assert.strictEqual(input.value, '123');
        assert.strictEqual(input.selectionStart, 2, 'the caret stays after the 2 it was after');
    });
});

describe('Input focus and reset', () => {
    it('hands its focus to the inner control', async () => {
        const [el] = await mount(`<ful-input>l</ful-input>`);

        el.focus();

        assert.strictEqual(document.activeElement, el.querySelector('input'));
    });

    it('restores the value it was rendered with when the form resets', async () => {
        const [el] = await mount(`
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
    });
});

describe('An invalid field that has the caret', () => {
    //the focus rule and the invalid rule both paint the control group, and the
    //focus one used to win: an invalid field turned the focus colour as soon as
    //it was focused and read as healthy while the user was being told it was
    //wrong. It showed longest on the date inputs, whose calendar holds the focus
    for (const tag of ['ful-input', 'ful-input-local-date', 'ful-input-instant', 'ful-select']) {
        it(`${tag} keeps the invalid border and glow`, async () => {
            const [el] = await mount(`<${tag}>l</${tag}>`);
            const group = el.querySelector('ful-control-group');

            const validBorder = getComputedStyle(group).borderTopColor;
            el.setCustomValidity('nope');
            const invalidBorder = getComputedStyle(group).borderTopColor;
            assert.notStrictEqual(invalidBorder, validBorder, 'the invalid border is its own colour');

            el.setCustomValidity('');
            el.querySelector('input').focus();
            assert.isTrue(!!group.querySelector(':focus-visible'), 'the inner control has the visible focus');
            const focusedValidBorder = getComputedStyle(group).borderTopColor;
            const focusedValidShadow = getComputedStyle(group).boxShadow;
            assert.notStrictEqual(focusedValidShadow, 'none', 'a focused field glows');

            el.setCustomValidity('nope');
            assert.strictEqual(
                getComputedStyle(group).borderTopColor,
                invalidBorder,
                'the border stays the invalid colour under focus',
            );
            assert.notStrictEqual(
                getComputedStyle(group).borderTopColor,
                focusedValidBorder,
                'the focus rule does not repaint it',
            );
            assert.notStrictEqual(
                getComputedStyle(group).boxShadow,
                focusedValidShadow,
                'the glow is the invalid one, not the focus one',
            );
        });
    }
});

describe('Input autocomplete', () => {
    for (const tag of ['ful-input', 'ful-input-local-date', 'ful-input-instant']) {
        it(`${tag} carries the token to its control`, async () => {
            const [el] = await mount(`<${tag} autocomplete="street-address">l</${tag}>`);
            assert.strictEqual(el.querySelector('input').getAttribute('autocomplete'), 'street-address');
        });
        it(`${tag} leaves the control alone when nothing is declared`, async () => {
            const [el] = await mount(`<${tag}>l</${tag}>`);
            assert.isFalse(el.querySelector('input').hasAttribute('autocomplete'));
        });
    }
    it('carries the token to a textarea', async () => {
        const [el] = await mount('<ful-input type="textarea" autocomplete="off">l</ful-input>');
        assert.strictEqual(el.querySelector('textarea').getAttribute('autocomplete'), 'off');
    });
    it('lets the input- passthrough have the last word', async () => {
        //the prefix is the escape hatch under the promoted attribute, not beside it
        const [el] = await mount('<ful-input autocomplete="off" input-autocomplete="street-address">l</ful-input>');
        assert.strictEqual(el.querySelector('input').getAttribute('autocomplete'), 'street-address');
    });
    it('is configuration, so a later write does not reach the control', async () => {
        const [el] = await mount('<ful-input autocomplete="off">l</ful-input>');
        el.setAttribute('autocomplete', 'street-address');
        assert.strictEqual(el.querySelector('input').getAttribute('autocomplete'), 'off');
    });
    it('does not let a ful-select loosen its own combobox', async () => {
        //a filled combobox shows text matching no key: the select owns this one
        const [el] = await mount('<ful-select autocomplete="street-address">l</ful-select>');
        assert.strictEqual(el.querySelector('input').getAttribute('autocomplete'), 'off');
    });
});

describe('Input autocomplete inherited from the form', () => {
    const mountIn = async (html) => {
        const container = appended(html);
        const el = container.querySelector('ful-input');
        await Rendering.waitFor(container.firstElementChild);
        await Rendering.waitFor(el);
        return el;
    };
    it('takes the token a ful-form declares', async () => {
        const el = await mountIn('<ful-form autocomplete="off"><ful-input name="a">l</ful-input></ful-form>');
        assert.strictEqual(el.querySelector('input').getAttribute('autocomplete'), 'off');
    });
    it('puts it on the form it renders too, so the dom says what it means', async () => {
        const el = await mountIn('<ful-form autocomplete="off"><ful-input name="a">l</ful-input></ful-form>');
        assert.strictEqual(el.closest('form').getAttribute('autocomplete'), 'off');
    });
    it('lets a field keep its own token', async () => {
        const el = await mountIn(
            '<ful-form autocomplete="off"><ful-input name="a" autocomplete="street-address">l</ful-input></ful-form>',
        );
        assert.strictEqual(el.querySelector('input').getAttribute('autocomplete'), 'street-address');
    });
    it('takes it from a plain form as well', async () => {
        //form="" breaks the platform's own inheritance there for the same reason
        const el = await mountIn('<form autocomplete="off"><ful-input name="a">l</ful-input></form>');
        assert.strictEqual(el.querySelector('input').getAttribute('autocomplete'), 'off');
    });
    it('leaves the control alone when neither declares one', async () => {
        const el = await mountIn('<ful-form><ful-input name="a">l</ful-input></ful-form>');
        assert.isFalse(el.querySelector('input').hasAttribute('autocomplete'));
    });
    it('does not reach a ful-select combobox, which stays off', async () => {
        const container = appended('<ful-form autocomplete="street-address"><ful-select name="s">l</ful-select></ful-form>');
        const el = container.querySelector('ful-select');
        await Rendering.waitFor(container.firstElementChild);
        await Rendering.waitFor(el);
        assert.strictEqual(el.querySelector('input').getAttribute('autocomplete'), 'off');
    });
});

describe('Input autocomplete under a form built in script', () => {
    it('takes the token when the tree is assembled before it is attached', async () => {
        //the field is a child of a ful-form that has not rendered when the tree
        //lands in the document: the form still upgrades first, being the ancestor
        const form = document.createElement('ful-form');
        form.setAttribute('autocomplete', 'off');
        const input = document.createElement('ful-input');
        input.setAttribute('name', 'a');
        input.textContent = 'l';
        form.append(input);
        const container = appended('<div></div>');
        container.firstElementChild.append(form);
        await Rendering.waitFor(form);
        await Rendering.waitFor(input);
        assert.strictEqual(input.querySelector('input').getAttribute('autocomplete'), 'off');
    });
});

describe('A button in an affix', () => {
    it('takes the cell geometry even carrying the accent class', async () => {
        //.ful-button outranks the shared affix rule, and should for its colours:
        //the corner radius and the border are the cell's to draw, not the button's
        const [el] = await mount('<ful-input name="a">l<button class="ful-button" slot="after">Go</button></ful-input>');
        const button = el.querySelector('ful-affix > button');
        const style = getComputedStyle(button);
        assert.strictEqual(style.borderRadius, '0px');
        assert.strictEqual(style.borderTopWidth, '0px');
    });
});

describe('Naming the control from the label', () => {
    //every assertion here compares primitives: chai formats a failed compare over
    //a dom node or a NodeList and the run hangs instead of reporting the failure
    for (const [tag, control] of [
        ['ful-input', 'input'],
        ['ful-input-local-date', 'input'],
        ['ful-select', 'input'],
        ['ful-input-file', 'input'],
        ['ful-filter-text', 'input'],
        ['ful-filter-boolean', '[data-ref=value]'],
    ]) {
        it(`${tag} points its label at the control with for and id`, async () => {
            const [el] = await mount(`<${tag} name="a">Città</${tag}>`);
            const target = el.querySelector(control);
            const label = el.querySelector('label');

            assert.isNotEmpty(target.id, `${tag}: the control is given an id to be pointed at`);
            assert.strictEqual(label.getAttribute('for'), target.id, `${tag}: for points at it`);
            assert.strictEqual(target.labels.length, 1, `${tag}: the dom carries the association`);
            assert.isTrue(target.labels[0] === label, `${tag}: and it is this label`);
            assert.isNull(
                target.getAttribute('aria-labelledby'),
                `${tag}: the aria fallback is not used as well`,
            );
        });
    }

    it('gives two fields on one page ids of their own', async () => {
        const [a] = await mount('<ful-input name="a">A</ful-input>');
        const [b] = await mount('<ful-input name="b">B</ful-input>');
        assert.notStrictEqual(a.querySelector('input').id, b.querySelector('input').id);
    });

    it('keeps a declared id rather than overwriting it', async () => {
        const [el] = await mount('<ful-input name="a" input-id="mine">A</ful-input>');
        assert.strictEqual(el.querySelector('input').id, 'mine');
        assert.strictEqual(el.querySelector('label').getAttribute('for'), 'mine');
    });

    it('falls back to aria where the control is not labelable', async () => {
        //nothing in the library reaches this branch: every field that hands the base
        //a label hands it a labelable control too. It is here for a ful.Field of your
        //own, the Rating in the extending-fields page among them, whose control is a
        //ful-control carrying role=radiogroup
        class Rating extends Field {
            static slots = true;
            static template = `
                <label>{{{{ slots.default }}}}</label>
                <ful-control-group><ful-control data-ref="stars" role="radiogroup" tabindex="0"></ful-control></ful-control-group>
                <ful-field-error></ful-field-error>`;
            _build({ slots }) {
                const fragment = this.template().withOverlay({ slots }).render();
                return {
                    fragment,
                    control: fragment.querySelector('[data-ref=stars]'),
                    error: fragment.querySelector('ful-field-error'),
                    label: fragment.querySelector('label'),
                };
            }
        }
        registry.defineElement('x-rating', Rating);

        const [el] = await mount('<x-rating name="a">Voto</x-rating>');
        const control = el.querySelector('[data-ref=stars]');
        const label = el.querySelector('label');

        assert.isNull(label.getAttribute('for'), 'for would point at nothing labelable');
        assert.isNotEmpty(label.id, 'the label is given an id to be pointed at');
        assert.strictEqual(control.getAttribute('aria-labelledby'), label.id);
        //the attribute and the aria element property are the same thing reflected,
        //so writing the attribute drives the property too where it is supported and
        //stands on its own where it is not
        assert.strictEqual(control.ariaLabelledByElements.length, 1);

        label.click();
        assert.isTrue(document.activeElement === control, 'the handler stands in for the click');
    });
});
