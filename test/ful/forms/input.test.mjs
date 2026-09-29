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
        const [el] = await mount(`<ful-input name="a" type="text" v-type="number" value="abc">l</ful-input>`);

        assert.strictEqual(el.value, 'abc');
    });

    it('defaults the native type to number under v-type, a declared type winning', async () => {
        const [defaulted, c1] = await mount(`<ful-input name="a" v-type="number">l</ful-input>`);
        assert.strictEqual(defaulted.querySelector('input').type, 'number');
        c1.remove();

        const [declared] = await mount(`<ful-input name="a" type="range" v-type="number">l</ful-input>`);
        assert.strictEqual(declared.querySelector('input').type, 'range');
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

        const input = type(el, 'a1b23', 4);

        assert.strictEqual(input.value, '123');
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

    it('warns once for a malformed pattern however many fields declare it', async () => {
        const originalWarn = console.warn;
        const warns = [];
        console.warn = (...args) => warns.push(args);
        try {
            await mount(`<ful-input keep="(once">l</ful-input>`);
            await mount(`<ful-input keep="(once">l</ful-input>`);

            assert.lengthOf(warns, 1);
        } finally {
            console.warn = originalWarn;
        }
    });

    it('reads the filter once, at the upgrade, like the rest of its configuration', async () => {
        const [el] = await mount(`<ful-input keep="[0-9]">l</ful-input>`);
        assert.strictEqual(type(el, 'a1').value, '1');

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
        const [el] = await mount('<ful-input autocomplete="off" input-autocomplete="street-address">l</ful-input>');
        assert.strictEqual(el.querySelector('input').getAttribute('autocomplete'), 'street-address');
    });
    it('is configuration, so a later write does not reach the control', async () => {
        const [el] = await mount('<ful-input autocomplete="off">l</ful-input>');
        el.setAttribute('autocomplete', 'street-address');
        assert.strictEqual(el.querySelector('input').getAttribute('autocomplete'), 'off');
    });
    it('does not let a ful-select loosen its own combobox', async () => {
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
        const [el] = await mount('<ful-input name="a">l<button class="ful-button" slot="after">Go</button></ful-input>');
        const button = el.querySelector('ful-affix > button');
        const style = getComputedStyle(button);
        assert.strictEqual(style.borderRadius, '0px');
        assert.strictEqual(style.borderTopWidth, '0px');
    });
});

describe('An input the page slots beside the control', () => {
    for (const tag of ['ful-input', 'ful-input-local-date', 'ful-filter-text', 'ful-select']) {
        it(`is not taken for the control of a ${tag}`, async () => {
            const [el] = await mount(`<${tag} name="a"><span slot="before"><input id="own"></span>label</${tag}>`);
            const label = el.querySelector(':scope > label');

            assert.notStrictEqual(label.htmlFor, 'own');
            assert.isNull(document.getElementById(label.htmlFor).closest('ful-affix'));
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
        assert.strictEqual(control.ariaLabelledByElements.length, 1);

        label.click();
        assert.isTrue(document.activeElement === control, 'the handler stands in for the click');
    });
});

describe('Field validity', () => {
    it('marks the control the caret is in as invalid, and clears it with the message', async () => {
        const [el] = await mount(`<ful-input name="a">l</ful-input>`);
        const input = el.querySelector('input');

        el.setCustomValidity('wrong');
        assert.strictEqual(input.getAttribute('aria-invalid'), 'true');

        el.setCustomValidity('');
        assert.isNull(input.getAttribute('aria-invalid'));
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
        assert.strictEqual(described[0], 'an-early-note');
        assert.strictEqual(described.length, 2, 'beside the error region');
    });
    it('reads the error region last, whenever the rest arrived', async () => {
        const [field] = await mount('<ful-input name="vat">VAT</ful-input>');
        const control = field.querySelector('input');
        const error = field.querySelector('ful-field-error');
        const note = document.createElement('div');
        note.id = 'a-late-note';
        field.append(note);

        field.describedBy(note);

        assert.deepStrictEqual(control.getAttribute('aria-describedby').split(' '), ['a-late-note', error.id]);
    });
    it('mints an id for a description that brought none, and takes it once', async () => {
        const [field] = await mount('<ful-input name="vat">VAT</ful-input>');
        const control = field.querySelector('input');
        const note = document.createElement('div');
        field.append(note);

        field.describedBy(note);
        field.describedBy(note);

        assert.match(note.id, /^ful-described/);
        assert.strictEqual(control.getAttribute('aria-describedby').split(' ').filter((id) => id === note.id).length, 1);
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

        assert.strictEqual(numeric.getAttribute('type'), 'text');
        assert.strictEqual(numeric.getAttribute('inputmode'), 'numeric');
        assert.strictEqual(decimal.getAttribute('type'), 'text');
        assert.strictEqual(decimal.getAttribute('inputmode'), 'decimal');
    });

    it('lets an input- passthrough replace the keyboard the type names', async () => {
        const [, input] = await mount(`<ful-input type="numeric" input-inputmode="tel">n</ful-input>`);

        assert.strictEqual(input.getAttribute('inputmode'), 'tel');
    });

    it('leaves type=number on the native widget', async () => {
        const [, input] = await mount(`<ful-input type="number">n</ful-input>`);

        assert.strictEqual(input.getAttribute('type'), 'number');
        assert.isNull(input.getAttribute('inputmode'));
    });

    it('keeps digits and a leading minus in a numeric field', async () => {
        const [, input] = await mount(`<ful-input type="numeric">n</ful-input>`);

        await type(input, '-12a3.4');

        assert.strictEqual(input.value, '-1234');
    });

    it('refuses the minus in an unsigned numeric field', async () => {
        const [, input] = await mount(`<ful-input type="numeric" unsigned>n</ful-input>`);

        await type(input, '-12a3');

        assert.strictEqual(input.value, '123');
    });

    it('refuses the minus in an unsigned decimal field while it still keeps one separator', async () => {
        const [, input] = await mount(`<ful-input type="decimal" unsigned>d</ful-input>`);

        await type(input, '-1,2,3');

        assert.strictEqual(input.value, '1,23', 'unsigned narrows the type filter rather than replacing it');
    });

    it('lets a declared keep outrank unsigned, as it outranks the type', async () => {
        const [, input] = await mount(`<ful-input type="numeric" unsigned keep="[0-9-]">n</ful-input>`);

        await type(input, '-12a3');

        assert.strictEqual(input.value, '-123');
    });

    it('keeps one separator in a decimal field, and drops the rest', async () => {
        const [, input] = await mount(`<ful-input type="decimal">d</ful-input>`);

        await type(input, '1,2,3');

        assert.strictEqual(input.value, '1,23');
    });

    it('answers a comma as a dot, because the wire takes one separator', async () => {
        const [el, input] = await mount(`<ful-input type="decimal">d</ful-input>`);

        await type(input, '1,5');

        assert.strictEqual(input.value, '1,5', 'what was typed stays on screen');
        assert.strictEqual(el.value, '1.5');
    });

    it('answers a number where v-type asks for one', async () => {
        const [el, input] = await mount(`<ful-input type="decimal" v-type="number">d</ful-input>`);

        await type(input, '1,5');

        assert.strictEqual(el.value, 1.5);
    });

    it('lets an author keep win over the type own filter', async () => {
        const [, input] = await mount(`<ful-input type="numeric" keep="[0-9a-f]">n</ful-input>`);

        await type(input, '1a2z3');

        assert.strictEqual(input.value, '1a23');
    });
});
