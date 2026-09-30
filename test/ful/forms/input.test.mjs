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
            assert.strictEqual(
                el.querySelector('input').getAttribute('placeholder'),
                'PH',
                `${tag} passes the placeholder attribute to its inner input`,
            );
            assert.strictEqual(el.placeholder, 'PH', `${tag} reads the placeholder back through its property`);
        });
        it(`${tag} applies a later placeholder change`, async () => {
            const [el] = await mount(`<${tag}>l</${tag}>`);
            el.setAttribute('placeholder', 'LATER');
            assert.strictEqual(
                el.querySelector('input').getAttribute('placeholder'),
                'LATER',
                `${tag} passes a placeholder written after the render to its inner input`,
            );
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

        assert.isNull(el.value, 'an undefined assignment reads back as null, the empty value');
        assert.strictEqual(
            el.querySelector('input').value,
            '',
            'an undefined assignment empties the input rather than showing the text undefined',
        );
    });

    it('decodes the value to a number under v-type, an explicit opt in', async () => {
        const [el] = await mount(`<ful-input name="a" type="number" v-type="number" value="42">l</ful-input>`);

        assert.strictEqual(el.value, 42, 'v-type number decodes the value attribute to a number');

        el.value = 6.5;
        assert.strictEqual(el.value, 6.5, 'an assigned number reads back as a number');
        assert.strictEqual(
            el.querySelector('input').value,
            '6.5',
            'an assigned number is shown in the input as its string form',
        );

        el.value = null;
        assert.isNull(el.value, 'blank stays null, never NaN');
    });

    it('keeps a v-type value that does not decode as it is, like the select keys', async () => {
        const [el] = await mount(`<ful-input name="a" type="text" v-type="number" value="abc">l</ful-input>`);

        assert.strictEqual(el.value, 'abc', 'a value that does not decode as a number is kept as the string it was');
    });

    it('defaults the native type to number under v-type, a declared type winning', async () => {
        const [defaulted, c1] = await mount(`<ful-input name="a" v-type="number">l</ful-input>`);
        assert.strictEqual(
            defaulted.querySelector('input').type,
            'number',
            'v-type number defaults the native input type to number',
        );
        c1.remove();

        const [declared] = await mount(`<ful-input name="a" type="range" v-type="number">l</ful-input>`);
        assert.strictEqual(
            declared.querySelector('input').type,
            'range',
            'a declared type wins over the default v-type brings',
        );
    });

    it('announces the decoded number through change', async () => {
        const [el] = await mount(`<ful-input name="a" type="number" v-type="number">l</ful-input>`);
        const seen = [];
        el.addEventListener('change', (evt) => seen.push(evt.detail.value));

        const input = el.querySelector('input');
        input.value = '7';
        input.dispatchEvent(new Event('change', { bubbles: true }));

        assert.deepStrictEqual(seen, [7], 'the change event carries the decoded number, not the input string');
    });

    it('leaves the value a string without the opt in', async () => {
        const [el] = await mount(`<ful-input name="a" type="number" value="42">l</ful-input>`);

        assert.strictEqual(el.value, '42', 'without v-type the value stays the string the input holds');
    });

    for (const tag of ['ful-input', 'ful-filter-text']) {
        it(`${tag} keeps a blank placeholder, so the label can float`, async () => {
            const [el] = await mount(`<${tag}>l</${tag}>`);
            const input = el.querySelector('input');

            assert.strictEqual(
                input.getAttribute('placeholder'),
                ' ',
                'a blank placeholder is written so the label can float over an empty control',
            );
            assert.isTrue(
                input.matches(':placeholder-shown'),
                'the blank placeholder makes the empty control match :placeholder-shown',
            );
            assert.isNull(el.placeholder, 'the blank one does not read back as a value');
        });
    }

    for (const tag of ['ful-input-file', 'ful-input-local-date', 'ful-input-instant']) {
        it(`${tag} keeps a blank placeholder without reporting it as a value`, async () => {
            const [el] = await mount(`<${tag}>l</${tag}>`);

            assert.strictEqual(
                el.querySelector('input').getAttribute('placeholder'),
                ' ',
                'a blank placeholder is written on the inner input',
            );
            assert.isNull(el.placeholder, 'the blank placeholder does not read back as a value');
        });
    }

    it('restores the blank placeholder when the attribute is removed', async () => {
        const [el] = await mount(`<ful-input placeholder="p">l</ful-input>`);
        const input = el.querySelector('input');
        assert.strictEqual(input.getAttribute('placeholder'), 'p', 'the declared placeholder reaches the inner input');

        el.removeAttribute('placeholder');

        assert.strictEqual(
            input.getAttribute('placeholder'),
            ' ',
            'removing the attribute writes the blank placeholder back so the label can float',
        );
        assert.isNull(el.placeholder, 'the blank placeholder does not read back as a value');
    });

    it('does not reflect the blank placeholder onto the host', async () => {
        const [el] = await mount(`<ful-input>l</ful-input>`);

        assert.isFalse(el.hasAttribute('placeholder'), 'the blank placeholder lives on the inner input only');
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

        assert.strictEqual(input.value, '1', 'the characters reject matches are removed from the input');
        assert.strictEqual(el.value, '1', 'the host reports the filtered value');
    });

    it('strips every match, not only the first one', async () => {
        const [el] = await mount(`<ful-input reject="[^0-9]">l</ful-input>`);

        const input = type(el, 'a1b2c3');

        assert.strictEqual(input.value, '123', 'reject removes every match, not only the first one');
    });

    it('keeps the caret next to the same character when earlier ones are stripped', async () => {
        const [el] = await mount(`<ful-input reject="[^0-9]">l</ful-input>`);

        const input = type(el, 'a1b23', 4);

        assert.strictEqual(input.value, '123', 'stripping earlier characters leaves only the kept digits');
        assert.strictEqual(input.selectionStart, 2, "still right after the '2'");
        assert.strictEqual(input.selectionEnd, 2, 'the selection end follows the caret, so nothing is selected');
    });

    it('leaves a value with nothing to strip completely alone, selection included', async () => {
        const [el] = await mount(`<ful-input reject="[^0-9]">l</ful-input>`);
        const input = el.querySelector('input');
        input.value = '123';
        input.setSelectionRange(1, 3);

        input.dispatchEvent(new Event('input'));

        assert.strictEqual(input.value, '123', 'a value with nothing to strip is left as it is');
        assert.strictEqual(input.selectionStart, 1, 'the selection is not collapsed');
        assert.strictEqual(input.selectionEnd, 3, 'the selection end is kept where it was');
    });

    it('does not touch the value when neither is declared', async () => {
        const [el] = await mount(`<ful-input>l</ful-input>`);

        const input = type(el, 'a1b2');

        assert.strictEqual(input.value, 'a1b2', 'without keep or reject what is typed is left as it is');
    });

    it('keeps only what keep matches, the same statement from the other side', async () => {
        const [el] = await mount(`<ful-input keep="[0-9]">l</ful-input>`);

        const input = type(el, 'a1b2c3');

        assert.strictEqual(input.value, '123', 'keep leaves only the characters it matches in the input');
        assert.strictEqual(el.value, '123', 'the host reports the value keep filtered');
    });

    it('keeps the caret in place under keep too', async () => {
        const [el] = await mount(`<ful-input keep="[0-9]">l</ful-input>`);

        const input = type(el, 'a1b23', 4);

        assert.strictEqual(input.value, '123', 'keep leaves only the matched characters');
        assert.strictEqual(input.selectionStart, 2, "still right after the '2'");
    });

    it('keeps multi-character matches, not only single characters', async () => {
        const [el] = await mount(`<ful-input keep="[0-9]{2}">l</ful-input>`);

        const input = type(el, 'a12b3c45');

        assert.strictEqual(input.value, '1245', 'the lone 3 never forms a pair');
    });

    it('applies keep and warns once, at the upgrade, when both are declared', async () => {
        const originalWarn = console.warn;
        const warns = [];
        console.warn = (...args) => warns.push(args);
        try {
            const [el] = await mount(`<ful-input keep="[0-9]" reject="[0-9]">l</ful-input>`);
            assert.lengthOf(warns, 1, 'warned before any keystroke');

            const input = type(el, 'a1b2');
            assert.strictEqual(input.value, '12', 'keep won, so the digits survived');
            type(el, 'a1b2c3');
            assert.lengthOf(warns, 1, 'warned once, not per keystroke');
            assert.include(
                String(warns[0]),
                'both keep and reject',
                'the warning names both attributes so the author can find the conflict',
            );
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
            assert.strictEqual(el.value, 'a1', 'the host reports the value unfiltered as well');
            type(el, 'a12');
            assert.strictEqual(input.value, 'a12', 'the malformed pattern still filters nothing on the next keystroke');
            assert.lengthOf(warns, 1, 'warned once, not per keystroke');
            assert.isTrue(
                String(warns[0]).includes('reject'),
                'the warning names the attribute that carries the malformed pattern',
            );
            container.remove();
        } finally {
            console.warn = originalWarn;
        }
    });

    it('warns once for a malformed pattern however many fields declare it', async () => {
        const originalWarn = console.warn;
        const warns = [];
        console.warn = (...args) => warns.push(args);
        try {
            await mount(`<ful-input keep="(once">l</ful-input>`);
            await mount(`<ful-input keep="(once">l</ful-input>`);

            assert.lengthOf(warns, 1, 'a malformed pattern is warned about once however many fields declare it');
        } finally {
            console.warn = originalWarn;
        }
    });

    it('reads the filter once, at the upgrade, like the rest of its configuration', async () => {
        const [el] = await mount(`<ful-input keep="[0-9]">l</ful-input>`);
        assert.strictEqual(type(el, 'a1').value, '1', 'keep filters what is typed from the start');

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
        const [el] = await mount('type="email" reject="[^a-z@.]"');
        const input = el.querySelector('input');

        input.value = 'a1b2@x.com';
        input.dispatchEvent(new Event('input'));

        assert.strictEqual(
            input.value,
            'ab@x.com',
            'reject filters an email input as well, although it has no selection to restore',
        );
    });

    it('keeps the caret in place when characters after it are stripped too', async () => {
        const [el] = await mount('reject="[a-z]"');
        const input = el.querySelector('input');

        input.value = 'a1b2c3';
        input.setSelectionRange(4, 4);
        input.dispatchEvent(new Event('input'));

        assert.strictEqual(input.value, '123', 'the characters after the caret are stripped as well');
        assert.strictEqual(input.selectionStart, 2, 'the caret stays after the 2 it was after');
    });
});

describe('Input focus and reset', () => {
    it('hands its focus to the inner control', async () => {
        const [el] = await mount(`<ful-input>l</ful-input>`);

        el.focus();

        assert.strictEqual(
            document.activeElement,
            el.querySelector('input'),
            'focusing the field focuses its inner input',
        );
    });

    it('restores the value it was rendered with when the form resets', async () => {
        const [el] = await mount(`
            <ful-form>
                <ful-input name="who" value="ann">who</ful-input>
            </ful-form>`);
        const input = el.querySelector('ful-input');
        await Rendering.waitFor(input);
        assert.strictEqual(input.value, 'ann', 'the input starts with the value it was rendered with');

        input.value = 'bob';
        assert.strictEqual(input.value, 'bob', 'an assignment changes the value before the reset');

        el.reset();

        assert.strictEqual(input.value, 'ann', 'the reset brings back the rendered value');
    });
});

describe('An invalid field that has the caret', () => {
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
            assert.strictEqual(
                el.querySelector('input').getAttribute('autocomplete'),
                'street-address',
                'the autocomplete token is passed to the inner input',
            );
        });
        it(`${tag} leaves the control alone when nothing is declared`, async () => {
            const [el] = await mount(`<${tag}>l</${tag}>`);
            assert.isFalse(
                el.querySelector('input').hasAttribute('autocomplete'),
                'without a declared token the input has no autocomplete attribute, so the browser default applies',
            );
        });
    }
    it('carries the token to a textarea', async () => {
        const [el] = await mount('<ful-input type="textarea" autocomplete="off">l</ful-input>');
        assert.strictEqual(
            el.querySelector('textarea').getAttribute('autocomplete'),
            'off',
            'the autocomplete token is passed to a textarea as well',
        );
    });
    it('lets the input- passthrough have the last word', async () => {
        const [el] = await mount('<ful-input autocomplete="off" input-autocomplete="street-address">l</ful-input>');
        assert.strictEqual(
            el.querySelector('input').getAttribute('autocomplete'),
            'street-address',
            'the input-autocomplete passthrough wins over the autocomplete attribute',
        );
    });
    it('is configuration, so a later write does not reach the control', async () => {
        const [el] = await mount('<ful-input autocomplete="off">l</ful-input>');
        el.setAttribute('autocomplete', 'street-address');
        assert.strictEqual(
            el.querySelector('input').getAttribute('autocomplete'),
            'off',
            'autocomplete is read at the render, so a later attribute write does not reach the control',
        );
    });
    it('does not let a ful-select loosen its own combobox', async () => {
        const [el] = await mount('<ful-select autocomplete="street-address">l</ful-select>');
        assert.strictEqual(
            el.querySelector('input').getAttribute('autocomplete'),
            'off',
            'the select combobox keeps autocomplete off whatever the page declares',
        );
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
        assert.strictEqual(
            el.querySelector('input').getAttribute('autocomplete'),
            'off',
            'a field inherits the autocomplete token its ful-form declares',
        );
    });
    it('puts it on the form it renders too, so the dom says what it means', async () => {
        const el = await mountIn('<ful-form autocomplete="off"><ful-input name="a">l</ful-input></ful-form>');
        assert.strictEqual(
            el.closest('form').getAttribute('autocomplete'),
            'off',
            'the ful-form writes its token on the form element it renders',
        );
    });
    it('lets a field keep its own token', async () => {
        const el = await mountIn(
            '<ful-form autocomplete="off"><ful-input name="a" autocomplete="street-address">l</ful-input></ful-form>',
        );
        assert.strictEqual(
            el.querySelector('input').getAttribute('autocomplete'),
            'street-address',
            'a token declared on the field wins over the one inherited from the form',
        );
    });
    it('takes it from a plain form as well', async () => {
        const el = await mountIn('<form autocomplete="off"><ful-input name="a">l</ful-input></form>');
        assert.strictEqual(
            el.querySelector('input').getAttribute('autocomplete'),
            'off',
            'a field inherits the autocomplete token of a plain form as well',
        );
    });
    it('leaves the control alone when neither declares one', async () => {
        const el = await mountIn('<ful-form><ful-input name="a">l</ful-input></ful-form>');
        assert.isFalse(
            el.querySelector('input').hasAttribute('autocomplete'),
            'with no token on the field or the form the input has no autocomplete attribute',
        );
    });
    it('does not reach a ful-select combobox, which stays off', async () => {
        const container = appended(
            '<ful-form autocomplete="street-address"><ful-select name="s">l</ful-select></ful-form>',
        );
        const el = container.querySelector('ful-select');
        await Rendering.waitFor(container.firstElementChild);
        await Rendering.waitFor(el);
        assert.strictEqual(
            el.querySelector('input').getAttribute('autocomplete'),
            'off',
            'the select combobox keeps autocomplete off whatever the form declares',
        );
    });
});

describe('Input autocomplete under a form built in script', () => {
    it('takes the token when the tree is assembled before it is attached', async () => {
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
        assert.strictEqual(
            input.querySelector('input').getAttribute('autocomplete'),
            'off',
            'a field assembled in script before attachment inherits the form token too',
        );
    });
});

describe('A button in an affix', () => {
    it('takes the cell geometry even carrying the accent class', async () => {
        const [el] = await mount(
            '<ful-input name="a">l<button class="ful-button" slot="after">Go</button></ful-input>',
        );
        const button = el.querySelector('ful-affix > button');
        const style = getComputedStyle(button);
        assert.strictEqual(
            style.borderRadius,
            '0px',
            'the button inside an affix takes the square corners of the cell, not its own rounding',
        );
        assert.strictEqual(
            style.borderTopWidth,
            '0px',
            'the button inside an affix has no border of its own, the cell draws it',
        );
    });
});

describe('An input the page slots beside the control', () => {
    for (const tag of ['ful-input', 'ful-input-local-date', 'ful-filter-text', 'ful-select']) {
        it(`is not taken for the control of a ${tag}`, async () => {
            const [el] = await mount(`<${tag} name="a"><span slot="before"><input id="own"></span>label</${tag}>`);
            const label = el.querySelector(':scope > label');

            assert.notStrictEqual(
                label.htmlFor,
                'own',
                'the label does not point at an input the page placed in an affix',
            );
            assert.isNull(
                document.getElementById(label.htmlFor).closest('ful-affix'),
                'the label points at the field control, which lives outside the affixes',
            );
        });
    }
});

describe('Naming the control from the label', () => {
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
            assert.isNull(target.getAttribute('aria-labelledby'), `${tag}: the aria fallback is not used as well`);
        });
    }

    it('gives two fields on one page ids of their own', async () => {
        const [a] = await mount('<ful-input name="a">A</ful-input>');
        const [b] = await mount('<ful-input name="b">B</ful-input>');
        assert.notStrictEqual(
            a.querySelector('input').id,
            b.querySelector('input').id,
            'each field mints an id of its own so two labels never point at the same control',
        );
    });

    it('keeps a declared id rather than overwriting it', async () => {
        const [el] = await mount('<ful-input name="a" input-id="mine">A</ful-input>');
        assert.strictEqual(el.querySelector('input').id, 'mine', 'a declared input-id is kept on the control');
        assert.strictEqual(
            el.querySelector('label').getAttribute('for'),
            'mine',
            'the label points at the declared id',
        );
    });

    it('falls back to aria where the control is not labelable', async () => {
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
        assert.strictEqual(
            control.getAttribute('aria-labelledby'),
            label.id,
            'the control points at the label through aria-labelledby since for cannot reach it',
        );
        assert.strictEqual(
            control.ariaLabelledByElements.length,
            1,
            'the aria-labelledby reference resolves to exactly one element',
        );

        label.click();
        assert.isTrue(document.activeElement === control, 'the handler stands in for the click');
    });
});

describe('Field validity', () => {
    it('marks the control the caret is in as invalid, and clears it with the message', async () => {
        const [el] = await mount(`<ful-input name="a">l</ful-input>`);
        const input = el.querySelector('input');

        el.setCustomValidity('wrong');
        assert.strictEqual(
            input.getAttribute('aria-invalid'),
            'true',
            'a custom error marks the inner input aria-invalid',
        );

        el.setCustomValidity('');
        assert.isNull(
            input.getAttribute('aria-invalid'),
            'clearing the custom error removes aria-invalid from the inner input',
        );
    });
});

describe('Field descriptions', () => {
    it('takes a description offered before it has anywhere to write it', async () => {
        const field = document.createElement('ful-input');
        field.setAttribute('name', 'vat');
        field.append('VAT');
        const note = document.createElement('div');
        note.id = 'an-early-note';

        assert.isTrue(/** @type any */ (field).describedBy(note), 'the field takes it unrendered');

        const container = appended('<div></div>');
        container.append(field, note);
        await Rendering.waitFor(container);
        await settle();

        const described = field.querySelector('input').getAttribute('aria-describedby').split(' ');
        assert.strictEqual(
            described[0],
            'an-early-note',
            'a description offered before the render is applied to the control once rendered',
        );
        assert.strictEqual(described.length, 2, 'the description list holds the early note and the error region');
    });
    it('reads the error region last, whenever the rest arrived', async () => {
        const [field] = await mount('<ful-input name="vat">VAT</ful-input>');
        const control = field.querySelector('input');
        const error = field.querySelector('ful-field-error');
        const note = document.createElement('div');
        note.id = 'a-late-note';
        field.append(note);

        field.describedBy(note);

        assert.deepStrictEqual(
            control.getAttribute('aria-describedby').split(' '),
            ['a-late-note', error.id],
            'a description added later comes before the error region, which is always read last',
        );
    });
    it('mints an id for a description that brought none, and takes it once', async () => {
        const [field] = await mount('<ful-input name="vat">VAT</ful-input>');
        const control = field.querySelector('input');
        const note = document.createElement('div');
        field.append(note);

        field.describedBy(note);
        field.describedBy(note);

        assert.match(note.id, /^ful-described/, 'a description without an id is given a minted one');
        assert.strictEqual(
            control
                .getAttribute('aria-describedby')
                .split(' ')
                .filter((id) => id === note.id).length,
            1,
            'describing the same element twice lists its id once',
        );
    });
});

describe('Numeric widget types', () => {
    const mount = async (html) => {
        const container = appended(html);
        const el = container.firstElementChild;
        await Rendering.waitFor(el);
        return [el, el.querySelector('input'), container];
    };
    const type = async (input, text) => {
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await settle();
    };

    it('renders a text input carrying the keyboard the type names', async () => {
        const [, numeric] = await mount(`<ful-input type="numeric">n</ful-input>`);
        const [, decimal] = await mount(`<ful-input type="decimal">d</ful-input>`);

        assert.strictEqual(numeric.getAttribute('type'), 'text', 'type numeric renders a text input');
        assert.strictEqual(
            numeric.getAttribute('inputmode'),
            'numeric',
            'type numeric asks for the numeric keyboard through inputmode',
        );
        assert.strictEqual(decimal.getAttribute('type'), 'text', 'type decimal renders a text input');
        assert.strictEqual(
            decimal.getAttribute('inputmode'),
            'decimal',
            'type decimal asks for the decimal keyboard through inputmode',
        );
    });

    it('lets an input- passthrough replace the keyboard the type names', async () => {
        const [, input] = await mount(`<ful-input type="numeric" input-inputmode="tel">n</ful-input>`);

        assert.strictEqual(
            input.getAttribute('inputmode'),
            'tel',
            'the input-inputmode passthrough wins over the keyboard the type names',
        );
    });

    it('leaves type=number on the native widget', async () => {
        const [, input] = await mount(`<ful-input type="number">n</ful-input>`);

        assert.strictEqual(input.getAttribute('type'), 'number', 'type number stays the native number input');
        assert.isNull(input.getAttribute('inputmode'), 'type number adds no inputmode');
    });

    it('keeps digits and a leading minus in a numeric field', async () => {
        const [, input] = await mount(`<ful-input type="numeric">n</ful-input>`);

        await type(input, '-12a3.4');

        assert.strictEqual(input.value, '-1234', 'a numeric field keeps the digits and a leading minus only');
    });

    it('refuses the minus in an unsigned numeric field', async () => {
        const [, input] = await mount(`<ful-input type="numeric" unsigned>n</ful-input>`);

        await type(input, '-12a3');

        assert.strictEqual(input.value, '123', 'unsigned drops the minus from a numeric field');
    });

    it('refuses the minus in an unsigned decimal field while it still keeps one separator', async () => {
        const [, input] = await mount(`<ful-input type="decimal" unsigned>d</ful-input>`);

        await type(input, '-1,2,3');

        assert.strictEqual(input.value, '1,23', 'unsigned narrows the type filter rather than replacing it');
    });

    it('lets a declared keep outrank unsigned, as it outranks the type', async () => {
        const [, input] = await mount(`<ful-input type="numeric" unsigned keep="[0-9-]">n</ful-input>`);

        await type(input, '-12a3');

        assert.strictEqual(input.value, '-123', 'a declared keep replaces the filter unsigned narrows');
    });

    it('keeps one separator in a decimal field, and drops the rest', async () => {
        const [, input] = await mount(`<ful-input type="decimal">d</ful-input>`);

        await type(input, '1,2,3');

        assert.strictEqual(input.value, '1,23', 'a decimal field keeps the first separator and drops the later ones');
    });

    it('answers a comma as a dot, because the wire takes one separator', async () => {
        const [el, input] = await mount(`<ful-input type="decimal">d</ful-input>`);

        await type(input, '1,5');

        assert.strictEqual(input.value, '1,5', 'what was typed stays on screen');
        assert.strictEqual(el.value, '1.5', 'the value carries a dot as the separator, the single one the wire takes');
    });

    it('answers a number where v-type asks for one', async () => {
        const [el, input] = await mount(`<ful-input type="decimal" v-type="number">d</ful-input>`);

        await type(input, '1,5');

        assert.strictEqual(el.value, 1.5, 'v-type number decodes the comma separated text to a number');
    });

    it('lets an author keep win over the type own filter', async () => {
        const [, input] = await mount(`<ful-input type="numeric" keep="[0-9a-f]">n</ful-input>`);

        await type(input, '1a2z3');

        assert.strictEqual(input.value, '1a23', 'a declared keep replaces the filter the type brings');
    });
});
