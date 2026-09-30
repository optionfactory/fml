import { tick } from '../../tick.mjs';
import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';
import { appended, settle, attached } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const mount = async (html) => {
    const container = appended(html);
    const el = container.firstElementChild;
    await Rendering.waitFor(el);
    return [el, container];
};

describe('Filter value tuples', () => {
    it('reads operator, sensitivity and operand out of the value attribute', async () => {
        const [el] = await mount(`<ful-filter-text value='["STARTS_WITH","IGNORE_CASE","ab"]'>t</ful-filter-text>`);

        assert.strictEqual(
            el.querySelector('[data-ref=value1]').value,
            'ab',
            'the operand in the value tuple is shown in the first input',
        );
        assert.deepEqual(
            el.value,
            ['STARTS_WITH', 'IGNORE_CASE', 'ab'],
            'the value reads back the tuple the attribute declared',
        );
    });

    it('picks up a value attribute set after rendering', async () => {
        const [el] = await mount(`<ful-filter-text>t</ful-filter-text>`);

        el.setAttribute('value', JSON.stringify(['EQ', 'IGNORE_CASE', 'zz']));

        assert.strictEqual(
            el.querySelector('[data-ref=value1]').value,
            'zz',
            'a value attribute written after the render is applied to the operand input',
        );
        assert.deepEqual(
            el.value,
            ['EQ', 'IGNORE_CASE', 'zz'],
            'the value reads back the tuple written after the render',
        );
    });

    it('fills both operands of a BETWEEN tuple', async () => {
        const [el] = await mount(
            `<ful-filter-local-date value='["BETWEEN","2024-01-01","2024-02-01"]'>d</ful-filter-local-date>`,
        );

        assert.strictEqual(
            el.querySelector('[data-ref=value1]').value,
            '2024-01-01',
            'the lower bound of a BETWEEN tuple goes into the first input',
        );
        assert.strictEqual(
            el.querySelector('[data-ref=value2]').value,
            '2024-02-01',
            'the upper bound of a BETWEEN tuple goes into the second input',
        );
        assert.deepEqual(
            el.value,
            ['BETWEEN', '2024-01-01', '2024-02-01'],
            'the value reads back both bounds of the BETWEEN tuple',
        );
    });

    it('empties both operands when the value attribute is removed', async () => {
        const [el] = await mount(
            `<ful-filter-local-date value='["BETWEEN","2024-01-01","2024-02-01"]'>d</ful-filter-local-date>`,
        );

        el.removeAttribute('value');

        assert.strictEqual(
            el.querySelector('[data-ref=value1]').value,
            '',
            'removing the value attribute empties the first operand',
        );
        assert.strictEqual(
            el.querySelector('[data-ref=value2]').value,
            '',
            'removing the value attribute empties the second operand as well',
        );
        assert.isNull(el.value, 'an emptied filter contributes no criteria');
    });

    it('reports null instead of a tuple with an empty operand', async () => {
        const [el] = await mount(`<ful-filter-text>t</ful-filter-text>`);

        assert.isNull(el.value, 'an unfilled filter contributes no criteria');
    });

    it('reports null while a range is missing its upper bound', async () => {
        const [el] = await mount(`<ful-filter-local-date value='["EQ","2024-01-01"]'>d</ful-filter-local-date>`);
        assert.deepEqual(el.value, ['EQ', '2024-01-01'], 'a complete single operand tuple is reported as declared');

        el.querySelector('a[value=BETWEEN]').click();

        assert.isNull(el.value, 'half a range is never reported as a partial tuple');
    });

    it('leaves the second operand empty when a shorter tuple is applied', async () => {
        const [el] = await mount(`<ful-filter-text value='["EQ","IGNORE_CASE","ab"]'>t</ful-filter-text>`);

        el.querySelector('a[value=BETWEEN]').click();

        assert.strictEqual(
            el.querySelector('[data-ref=value2]').value,
            '',
            'the second operand stays empty since the tuple had none to give it',
        );
        assert.isNull(el.value, 'half a range is never reported as a partial tuple');
    });

    it('announces the whole tuple, not the raw input value, when an operand changes', async () => {
        const [el] = await mount(`<ful-filter-text>t</ful-filter-text>`);
        const seen = [];
        el.addEventListener('change', (evt) => seen.push(evt.detail));

        const input = el.querySelector('[data-ref=value1]');
        input.value = 'abc';
        input.dispatchEvent(new Event('change', { bubbles: true }));

        assert.deepEqual(
            seen,
            [{ value: ['CONTAINS', 'IGNORE_CASE', 'abc'] }],
            'the change event carries the full tuple with the default operator and sensitivity, not the bare input value',
        );
    });
});

describe('A range filter configures both bounds', () => {
    const typeInto = (input, text) => {
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return input.value;
    };

    it('filters what is typed into the upper bound as into the lower one', async () => {
        const [el] = await mount('<ful-filter-text keep="[0-9]" name="f">t</ful-filter-text>');

        assert.strictEqual(
            typeInto(el.querySelector('[data-ref=value1]'), 'a1b2'),
            '12',
            'the keep pattern filters what is typed into the lower bound',
        );
        assert.strictEqual(
            typeInto(el.querySelector('[data-ref=value2]'), 'c3d4'),
            '34',
            'the keep pattern applies to the upper bound as well',
        );
    });

    it('passes input- attributes to both bounds, except the id', async () => {
        const [el] = await mount('<ful-filter-number input-data-x="y" input-id="bound" name="f">n</ful-filter-number>');
        const [lower, upper] = [el.querySelector('[data-ref=value1]'), el.querySelector('[data-ref=value2]')];

        assert.strictEqual(lower.dataset.x, 'y', 'input- attributes are passed to the lower bound');
        assert.strictEqual(upper.dataset.x, 'y', 'input- attributes are passed to the upper bound as well');
        assert.strictEqual(lower.id, 'bound', 'the label names the lower bound');
        assert.isFalse(upper.hasAttribute('id'), 'no two controls share the id');
    });

    it('puts the autocomplete and the placeholder on both bounds, the placeholder live', async () => {
        const [el] = await mount('<ful-filter-text autocomplete="off" placeholder="from" name="f">t</ful-filter-text>');
        const bounds = [el.querySelector('[data-ref=value1]'), el.querySelector('[data-ref=value2]')];

        assert.deepStrictEqual(
            bounds.map((b) => b.getAttribute('autocomplete')),
            ['off', 'off'],
            'the autocomplete attribute reaches both bounds',
        );
        assert.deepStrictEqual(
            bounds.map((b) => b.getAttribute('placeholder')),
            ['from', 'from'],
            'the placeholder attribute reaches both bounds',
        );
        el.placeholder = 'search';
        assert.deepStrictEqual(
            bounds.map((b) => b.getAttribute('placeholder')),
            ['search', 'search'],
            'writing the placeholder property updates both bounds',
        );
    });
});

describe('InstantFilter instant conversion', () => {
    it('shows an ISO instant as local wall clock time and reports it back as UTC', async () => {
        const [el] = await mount(
            `<ful-filter-instant value='["GTE","2024-03-15T10:30:00.000Z"]'>i</ful-filter-instant>`,
        );
        const first = el.querySelector('[data-ref=value1]');

        assert.notInclude(first.value, 'Z', 'the input holds local time, not the raw instant');
        assert.strictEqual(
            new Date(first.value).toISOString(),
            '2024-03-15T10:30:00.000Z',
            'the local time in the input is the same instant as the declared UTC value',
        );
        assert.deepEqual(
            el.value,
            ['GTE', '2024-03-15T10:30:00.000Z'],
            'the tuple reports the instant back as the UTC ISO string it was given',
        );
    });

    it('converts both bounds of a range typed into the inputs', async () => {
        const [el] = await mount(`<ful-filter-instant>i</ful-filter-instant>`);
        el.querySelector('a[value=BETWEEN]').click();

        el.querySelector('[data-ref=value1]').value = '2024-03-15T10:30';
        el.querySelector('[data-ref=value2]').value = '2024-03-16T22:45';

        assert.deepEqual(
            el.value,
            ['BETWEEN', new Date('2024-03-15T10:30').toISOString(), new Date('2024-03-16T22:45').toISOString()],
            'both bounds typed as local time are reported as UTC ISO instants',
        );
    });
});

describe('Filter operator selection', () => {
    for (const tag of ['ful-filter-instant', 'ful-filter-local-date']) {
        it(`${tag} reveals the second operand only for BETWEEN`, async () => {
            const [el] = await mount(`<${tag}>f</${tag}>`);
            const second = el.querySelector('[data-ref=value2]');
            assert.isTrue(second.hidden, 'hidden until a range is asked for');

            el.querySelector('a[value=BETWEEN]').click();
            assert.isFalse(second.hidden, 'BETWEEN reveals the second operand');

            el.querySelector('a[value=LTE]').click();
            assert.isTrue(second.hidden, 'hidden again for single operand operators');
        });
    }

    it('keeps the affix width stable while operators change', async () => {
        const [el] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        const affix = el.querySelector('[data-ref=operator]').closest('ful-affix');
        const width = () => affix.getBoundingClientRect().width;

        const withContains = width();
        el.querySelector('a[value=EQ]').click();
        const withEquals = width();
        el.querySelector('a[value=BETWEEN]').click();
        const withBetween = width();

        assert.closeTo(
            withEquals,
            withContains,
            0.5,
            'the operator affix keeps its width when a narrow glyph replaces the default one',
        );
        assert.closeTo(
            withBetween,
            withContains,
            0.5,
            'the operator affix keeps its width when a wide glyph replaces the default one',
        );
    });

    it('relabels the operator button with the chosen item', async () => {
        const [el] = await mount(`<ful-filter-local-date value='["EQ","2024-01-01"]'>d</ful-filter-local-date>`);
        const button = el.querySelector('[data-ref=operator]');
        const item = el.querySelector('a[value=GTE]');

        assert.strictEqual(
            item.querySelector('span:first-child').innerText,
            '≥',
            'each menu item shows the operator glyph in its first span',
        );
        assert.strictEqual(
            item.querySelector('span:last-child').innerText,
            'At least',
            'each menu item shows the operator word in its last span',
        );

        item.click();

        assert.strictEqual(
            button.getAttribute('value'),
            'GTE',
            'picking a menu item stores its operator in the button value attribute',
        );
        assert.strictEqual(button.textContent, '≥', 'the button shows the chosen glyph, not the word');
        assert.strictEqual(button.getAttribute('aria-label'), 'At least', 'the word announces it instead');
        assert.deepEqual(el.value, ['GTE', '2024-01-01'], 'and the tuple carries the chosen operator');
    });

    it('uses continuation glyphs for the text operators and words in the menu', async () => {
        const [el] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        const button = el.querySelector('[data-ref=operator]');

        assert.strictEqual(button.textContent, '…a…', 'contains is the default');
        el.querySelector('a[value=STARTS_WITH]').click();
        assert.strictEqual(
            button.textContent,
            'a…',
            'STARTS_WITH shows the glyph with the continuation after the letter',
        );
        el.querySelector('a[value=ENDS_WITH]').click();
        assert.strictEqual(
            button.textContent,
            '…a',
            'ENDS_WITH shows the glyph with the continuation before the letter',
        );
        assert.strictEqual(
            el.querySelector('a[value=CONTAINS] span:last-child').innerText,
            'Contains',
            'the menu names CONTAINS with a word, not the glyph',
        );
        assert.strictEqual(
            el.querySelector('a[value=STARTS_WITH] span:last-child').innerText,
            'Starts with',
            'the menu names STARTS_WITH with a word, not the glyph',
        );
        assert.strictEqual(
            button.getAttribute('aria-label'),
            'Ends with',
            'the button announces the operator in force with its word',
        );
    });

    it('labels the sensitivity control and its menu with words', async () => {
        const [el] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        const button = el.querySelector('[data-ref=sensitivity]');

        assert.strictEqual(
            button.textContent,
            'aa',
            'the sensitivity button shows the lowercase glyph for the default IGNORE_CASE',
        );
        assert.strictEqual(
            button.getAttribute('aria-label'),
            'Ignore case',
            'the sensitivity button announces its mode with a word',
        );
        assert.strictEqual(
            button.nextElementSibling.querySelector('a[value=CASE_SENSITIVE] span:last-child').innerText,
            'Case sensitive',
            'the sensitivity menu names each mode with a word',
        );

        button.nextElementSibling.querySelector('a[value=CASE_SENSITIVE]').click();

        assert.strictEqual(button.getAttribute('aria-label'), 'Case sensitive', 'the announcement follows the mode');
    });

    const labelled = [
        ['ful-filter-text', ['EQ', 'IGNORE_CASE', 'ab'], 'EQ'],
        ['ful-filter-local-date', ['GTE', '2024-01-01'], 'GTE'],
        ['ful-filter-instant', ['GT', '2024-03-15T10:30:00.000Z'], 'GT'],
    ];
    for (const [tag, initial, operator] of labelled) {
        it(`${tag} labels the operator button with the operator it was given`, async () => {
            const [el] = await mount(`<${tag} value='${JSON.stringify(initial)}'>f</${tag}>`);
            const button = el.querySelector('[data-ref=operator]');

            assert.strictEqual(
                button.getAttribute('value'),
                operator,
                'the button value carries the operator the value tuple declared',
            );
            assert.strictEqual(
                button.textContent,
                { EQ: '=', GTE: '≥', GT: '>' }[operator],
                'the button shows the glyph of the operator in force, not the template default',
            );
            assert.notStrictEqual(el.querySelector(`a[value=${operator}]`).innerText, '', 'the menu shows the word');
        });
    }

    const ranges = [
        [
            'ful-filter-instant',
            ['BETWEEN', '2024-03-15T10:30:00.000Z', '2024-03-16T22:45:00.000Z'],
            ['GT', '2024-03-15T10:30:00.000Z'],
        ],
        ['ful-filter-local-date', ['BETWEEN', '2024-01-01', '2024-02-01'], ['GT', '2024-01-01']],
    ];
    for (const [tag, range, single] of ranges) {
        it(`${tag} reveals the second operand for a BETWEEN value`, async () => {
            const [el] = await mount(`<${tag} value='${JSON.stringify(range)}'>f</${tag}>`);
            const second = el.querySelector('[data-ref=value2]');
            assert.isFalse(second.hidden, 'a range must show the bound it is carrying');

            el.setAttribute('value', JSON.stringify(single));
            assert.isTrue(second.hidden, 'hidden again for single operand operators');
        });
    }

    it('keeps the text filter operand and sensitivity when the operator changes', async () => {
        const [el] = await mount(`<ful-filter-text value='["CONTAINS","IGNORE_CASE","ab"]'>t</ful-filter-text>`);

        el.querySelector('a[value=ENDS_WITH]').click();

        assert.deepEqual(
            el.value,
            ['ENDS_WITH', 'IGNORE_CASE', 'ab'],
            'changing the operator keeps the operand and the sensitivity already in the tuple',
        );
    });

    const strays = [
        ['ful-filter-text', ['EQ', 'IGNORE_CASE', 'ab'], ['EQ', 'IGNORE_CASE', 'ab']],
        ['ful-filter-local-date', ['GT', '2024-01-01'], ['GT', '2024-01-01']],
        ['ful-filter-instant', ['GT', '2024-03-15T10:30:00.000Z'], ['GT', '2024-03-15T10:30:00.000Z']],
    ];
    for (const [tag, initial, expected] of strays) {
        it(`${tag} ignores clicks that did not land on a dropdown item`, async () => {
            const [el] = await mount(`<${tag} value='${JSON.stringify(initial)}'>f</${tag}>`);

            el.querySelector('input').click();
            el.querySelector('[data-ref=operator]').click();
            el.querySelector('ul').click();

            assert.deepEqual(el.value, expected, 'only the menu items pick an operator');
        });
    }
});

describe('Filter operator keyboard access', () => {
    const keydown = (el, code) => {
        el.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    };

    it('focuses the operator in force when the menu opens', async () => {
        const [el] = await mount(`<ful-filter-local-date value='["GTE","2024-01-01"]'>d</ful-filter-local-date>`);
        const button = el.querySelector('[data-ref=operator]');

        button.click();
        await settle();

        assert.isTrue(el.querySelector('ul').matches(':popover-open'), 'clicking the operator button opens its menu');
        assert.strictEqual(
            document.activeElement,
            el.querySelector('a[value=GTE]'),
            'the menu focuses the item of the operator in force so the keyboard starts from it',
        );
    });

    it('starts from the top when no operator is in force', async () => {
        const [el] = await mount(`<ful-filter-text>t</ful-filter-text>`);
        const button = el.querySelector('[data-ref=operator]');

        button.click();
        await settle();

        assert.strictEqual(
            document.activeElement,
            el.querySelector('a[value=CONTAINS]'),
            'with the default operator in force the menu focuses its item, the first one',
        );
    });

    it('picks with Enter and gives the button the focus back', async () => {
        const [el] = await mount(`<ful-filter-text value='["EQ","IGNORE_CASE","ab"]'>t</ful-filter-text>`);
        const button = el.querySelector('[data-ref=operator]');
        button.click();
        await settle();
        assert.strictEqual(document.activeElement, el.querySelector('a[value=EQ]'), 'the operator in force is focused');

        keydown(document.activeElement, 'ArrowUp');
        keydown(document.activeElement, 'Enter');

        assert.strictEqual(
            button.getAttribute('value'),
            'ENDS_WITH',
            'ArrowUp from EQ reaches ENDS_WITH, which Enter picks',
        );
        assert.deepStrictEqual(
            el.value,
            ['ENDS_WITH', 'IGNORE_CASE', 'ab'],
            'the pick through the keyboard updates the tuple',
        );
        assert.strictEqual(document.activeElement, button, 'the invoker takes the focus back');
    });

    it('anchors the menu under its operator button', async () => {
        const [el] = await mount(`<ful-filter-text>t</ful-filter-text>`);
        const button = el.querySelector('[data-ref=operator]');
        button.click();
        await settle();

        const menu = el.querySelector('ul[popover]');
        const b = button.getBoundingClientRect();
        const m = menu.getBoundingClientRect();
        assert.closeTo(m.left, b.left, 1, 'the menu follows its anchor horizontally');
        assert.isAtLeast(m.top, b.bottom, 'the menu sits below its anchor');
    });

    it('carries menu semantics', async () => {
        const [el] = await mount(`<ful-filter-text>t</ful-filter-text>`);
        const menu = el.querySelector('ul');

        assert.strictEqual(menu.getAttribute('role'), 'menu', 'the operator list carries the menu role');
        for (const item of menu.querySelectorAll('a')) {
            assert.strictEqual(
                item.getAttribute('role'),
                'menuitemradio',
                'each operator item is a radio menu item, since exactly one is chosen',
            );
            assert.strictEqual(item.getAttribute('tabindex'), '-1', 'the button is the tab stop, not every item');
        }
    });
    it('marks the choice the button holds, and moves the mark on a pick', async () => {
        const [el] = await mount(`<ful-filter-text>t</ful-filter-text>`);
        const button = el.querySelector('[data-ref=operator]');
        const menu = button.nextElementSibling;
        const checked = () => [...menu.querySelectorAll('a[aria-checked="true"]')].map((a) => a.getAttribute('value'));

        assert.deepEqual(checked(), [button.getAttribute('value')], 'exactly the current operator is marked');

        menu.querySelector('a[value=CONTAINS]').click();

        assert.strictEqual(
            button.getAttribute('value'),
            'CONTAINS',
            'picking CONTAINS stores it in the button value attribute',
        );
        assert.deepEqual(checked(), ['CONTAINS'], 'the mark follows the pick, and only one item carries it');
    });
    it('marks the sensitivity the button holds too', async () => {
        const [el] = await mount(`<ful-filter-text>t</ful-filter-text>`);
        const button = el.querySelector('[data-ref=sensitivity]');
        const menu = button.nextElementSibling;

        assert.deepEqual(
            [...menu.querySelectorAll('a[aria-checked="true"]')].map((a) => a.getAttribute('value')),
            [button.getAttribute('value')],
            'exactly the sensitivity in force is marked checked in its menu',
        );
    });
});

describe('Filter operator whitelisting', () => {
    const mount = async (html) => {
        const container = appended(html);
        const el = container.firstElementChild;
        await Rendering.waitFor(el);
        await settle();
        return [el, container];
    };
    const menuValues = (el) =>
        [...el.querySelector('[data-ref=operator]').nextElementSibling.querySelectorAll('li > a')].map((a) =>
            a.getAttribute('value'),
        );

    it('offers every operator of its vocabulary by default', async () => {
        const [text, textContainer] = await mount(`<ful-filter-text>t</ful-filter-text>`);
        const [date, dateContainer] = await mount(`<ful-filter-local-date>d</ful-filter-local-date>`);
        const [bool] = await mount(`<ful-filter-boolean>b</ful-filter-boolean>`);

        assert.deepStrictEqual(
            menuValues(text),
            ['EQ', 'NEQ', 'LT', 'GT', 'LTE', 'GTE', 'BETWEEN', 'CONTAINS', 'STARTS_WITH', 'ENDS_WITH'],
            'a text filter offers the compare operators and the text operators',
        );
        assert.deepStrictEqual(
            menuValues(date),
            ['EQ', 'NEQ', 'LT', 'GT', 'LTE', 'GTE', 'BETWEEN'],
            'a date filter offers the compare operators only',
        );
        assert.deepStrictEqual(menuValues(bool), ['EQ', 'NEQ'], 'a boolean filter offers only EQ and NEQ');
        textContainer.remove();
        dateContainer.remove();
    });

    it('restricts the menu to the declared operators', async () => {
        const [el] = await mount(`<ful-filter-text operators="CONTAINS,EQ" name="f">t</ful-filter-text>`);

        assert.deepStrictEqual(
            menuValues(el),
            ['CONTAINS', 'EQ'],
            'the menu lists only the declared operators, in the declared order',
        );
        assert.deepStrictEqual(
            el.operators,
            ['CONTAINS', 'EQ'],
            'the operators property reads back the declared whitelist',
        );
    });

    it('falls back to the whole vocabulary when nothing declared survives', async () => {
        const [el] = await mount(`<ful-filter-text operators="NOPE" name="f">t</ful-filter-text>`);

        assert.include(menuValues(el), 'BETWEEN', 'unknown names are dropped, the vocabulary stands in');
    });

    it('keeps the default operator when whitelisted, falls back to the first when not', async () => {
        const [date, dateContainer] = await mount(
            `<ful-filter-local-date operators="GTE,EQ,BETWEEN" name="f">d</ful-filter-local-date>`,
        );
        const [instant] = await mount(`<ful-filter-instant operators="GTE,BETWEEN" name="f">i</ful-filter-instant>`);

        assert.strictEqual(
            date.querySelector('[data-ref=operator]').getAttribute('value'),
            'EQ',
            'EQ is the date default and it is whitelisted',
        );
        assert.strictEqual(
            instant.querySelector('[data-ref=operator]').getAttribute('value'),
            'GTE',
            'LTE is not whitelisted, the first declared stands in',
        );

        dateContainer.remove();
    });

    it('re-applies the whitelist when the attribute changes after rendering', async () => {
        const [el] = await mount(`<ful-filter-local-date name="f">d</ful-filter-local-date>`);
        assert.lengthOf(menuValues(el), 7, 'a date filter starts with its whole vocabulary of seven operators');

        el.setAttribute('operators', 'GTE,BETWEEN');
        await settle();

        assert.deepStrictEqual(
            menuValues(el),
            ['GTE', 'BETWEEN'],
            'the menu follows the operators attribute written after the render',
        );
        assert.deepStrictEqual(
            el.operators,
            ['GTE', 'BETWEEN'],
            'the operators property follows the attribute written after the render',
        );
    });

    it('pins the operator when a single one is declared', async () => {
        const [el] = await mount(`<ful-filter-number operators="GTE" name="f">n</ful-filter-number>`);
        const button = el.querySelector('[data-ref=operator]');

        assert.strictEqual(button.getAttribute('value'), 'GTE', 'the single declared operator is the one shown');
        assert.isTrue(button.disabled, 'the glyph is not a popup invoker anymore');
        assert.isNull(button.getAttribute('popovertarget'), 'a pinned button is no longer linked to a menu');
        assert.isNull(button.getAttribute('aria-haspopup'), 'nothing expands');

        el.value = ['EQ', '5'];
        assert.deepStrictEqual(el.value, ['GTE', '5'], 'a pinned operator wins over the assignment');
    });

    it('re-arms the menu when the pin is lifted after rendering', async () => {
        const [el] = await mount(`<ful-filter-number operators="GTE" name="f">n</ful-filter-number>`);
        const button = el.querySelector('[data-ref=operator]');
        assert.isTrue(button.disabled, 'a single declared operator disables the button');

        el.setAttribute('operators', 'GTE,EQ');
        await settle();

        assert.isFalse(button.disabled, 'two declared operators enable the button again');
        assert.isNotNull(button.getAttribute('popovertarget'), 'the button is linked to its menu again');
        assert.strictEqual(button.getAttribute('aria-haspopup'), 'true', 'the button announces a popup again');
    });

    it('re-links the invoker when a pin that arrived after wiring is lifted', async () => {
        const [el] = await mount(`<ful-filter-number operators="GTE,EQ" name="f">n</ful-filter-number>`);
        const button = el.querySelector('[data-ref=operator]');
        assert.isNotNull(button.getAttribute('popovertarget'), 'the menu was wired at render');

        el.setAttribute('operators', 'GTE');
        await settle();
        assert.isNull(button.getAttribute('popovertarget'), 'the pin broke the link');

        el.setAttribute('operators', 'GTE,EQ');
        await settle();
        assert.strictEqual(
            button.getAttribute('popovertarget'),
            button.nextElementSibling.id,
            'lifting the pin restores it',
        );
        assert.strictEqual(button.getAttribute('aria-haspopup'), 'true', 'the button announces a popup again');
    });

    it('re-links the sensitivity invoker the same way', async () => {
        const [el] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        const button = el.querySelector('[data-ref=sensitivity]');
        assert.isNotNull(button.getAttribute('popovertarget'), 'the sensitivity button is wired to its menu at render');

        el.setAttribute('sensitivities', 'CASE_SENSITIVE');
        await settle();
        assert.isNull(
            button.getAttribute('popovertarget'),
            'a single declared sensitivity unlinks the button from its menu',
        );

        el.setAttribute('sensitivities', 'IGNORE_CASE,CASE_SENSITIVE');
        await settle();
        assert.strictEqual(
            button.getAttribute('popovertarget'),
            button.nextElementSibling.id,
            'two declared sensitivities link the button to its menu again',
        );
    });

    it('pins the boolean operator the same way', async () => {
        const [el] = await mount(
            `<ful-filter-boolean operators="NEQ" value='["EQ","true"]' name="f">b</ful-filter-boolean>`,
        );
        const button = el.querySelector('[data-ref=operator]');

        assert.isTrue(button.disabled, 'a single declared operator disables the boolean operator button');
        assert.strictEqual(
            button.getAttribute('value'),
            'NEQ',
            'the button shows the pinned operator, not the one in the value tuple',
        );
        assert.deepStrictEqual(el.value, ['NEQ', 'true'], 'the pinned operator wins over the assigned tuple');
    });
});

describe('Filter sensitivity whitelisting', () => {
    const mount = async (html) => {
        const container = appended(html);
        const el = container.firstElementChild;
        await Rendering.waitFor(el);
        await settle();
        return [el, container];
    };

    it('pins the tuple sensitivity when a single mode is declared', async () => {
        const [el] = await mount(`<ful-filter-text sensitivities="CASE_SENSITIVE" name="f">t</ful-filter-text>`);
        const input = el.querySelector('[data-ref=value1]');
        input.value = 'ab';

        assert.deepStrictEqual(
            el.value,
            ['CONTAINS', 'CASE_SENSITIVE', 'ab'],
            'the tuple carries the single declared sensitivity',
        );

        el.value = ['EQ', 'IGNORE_CASE', 'zz'];
        input.value = 'zz';
        assert.deepStrictEqual(
            el.value,
            ['EQ', 'CASE_SENSITIVE', 'zz'],
            'an assignment out of the whitelist is normalized',
        );
    });

    it('re-applies the sensitivity whitelist when the attribute changes after rendering', async () => {
        const [el] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        el.value = ['EQ', 'IGNORE_CASE', 'x'];
        assert.deepStrictEqual(
            el.value,
            ['EQ', 'IGNORE_CASE', 'x'],
            'both sensitivities are allowed before the whitelist narrows them',
        );

        el.setAttribute('sensitivities', 'CASE_SENSITIVE');
        await settle();

        assert.deepStrictEqual(
            el.sensitivities,
            ['CASE_SENSITIVE'],
            'the sensitivities property follows the attribute written after the render',
        );
        assert.deepStrictEqual(
            el.value,
            ['EQ', 'CASE_SENSITIVE', 'x'],
            'the tuple takes the only sensitivity the new whitelist allows',
        );
    });

    it('switches the mode through its own menu without touching the operator', async () => {
        const [el] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        const changes = [];
        el.addEventListener('change', (e) => changes.push(e.detail.value));
        const input = el.querySelector('[data-ref=value1]');
        const button = el.querySelector('[data-ref=sensitivity]');
        input.value = 'ab';

        assert.isFalse(button.hidden, 'both modes are allowed, the control is offered');
        assert.strictEqual(button.getAttribute('value'), 'IGNORE_CASE', 'the default sensitivity is IGNORE_CASE');

        button.nextElementSibling.querySelector('a[value=CASE_SENSITIVE]').click();

        assert.deepStrictEqual(
            el.value,
            ['CONTAINS', 'CASE_SENSITIVE', 'ab'],
            'the tuple carries the sensitivity picked from the menu',
        );
        assert.strictEqual(
            el.querySelector('[data-ref=operator]').getAttribute('value'),
            'CONTAINS',
            'the operator menu is not involved',
        );
        assert.deepStrictEqual(
            changes,
            [['CONTAINS', 'CASE_SENSITIVE', 'ab']],
            'the switch is announced with the tuple it produced',
        );
    });

    it('freezes the control when a single mode is pinned, and when the pin arrives later', async () => {
        const [pinned, pinnedContainer] = await mount(
            `<ful-filter-text sensitivities="CASE_SENSITIVE" name="f">t</ful-filter-text>`,
        );
        const [late] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        const button = pinned.querySelector('[data-ref=sensitivity]');

        assert.isFalse(button.hidden, 'the glyph stays: it documents the mode');
        assert.isTrue(
            button.disabled,
            'a single declared sensitivity disables the button so the mode cannot be changed',
        );
        assert.isNull(button.getAttribute('popovertarget'), 'a pinned sensitivity button is not linked to a menu');
        assert.isNull(button.getAttribute('aria-haspopup'), 'a pinned sensitivity button does not announce a popup');
        assert.strictEqual(
            button.getAttribute('value'),
            'CASE_SENSITIVE',
            'the button value carries the pinned sensitivity',
        );
        assert.strictEqual(button.textContent, 'Aa', 'the uppercase glyph shows the pinned CASE_SENSITIVE mode');

        late.setAttribute('sensitivities', 'IGNORE_CASE');
        await settle();
        const lateButton = late.querySelector('[data-ref=sensitivity]');
        assert.isTrue(lateButton.disabled, 'a pin arriving after rendering freezes it too');
        assert.strictEqual(lateButton.textContent, 'aa', 'the lowercase glyph shows the late pinned IGNORE_CASE mode');

        pinnedContainer.remove();
    });
});

describe('NumberFilter tuples', () => {
    const mount = async (attrs) => {
        const container = appended(`<ful-filter-number ${attrs} name="f">n</ful-filter-number>`);
        const el = container.querySelector('ful-filter-number');
        await Rendering.waitFor(el);
        await settle();
        return [el, container];
    };

    it('contributes nothing until an operand is given', async () => {
        const [el] = await mount('');
        assert.isNull(el.value, 'a number filter reports no tuple while its operand is empty');
        assert.strictEqual(
            el.querySelector('[data-ref=value1]').type,
            'number',
            'a number filter renders its operand as a number input',
        );
    });

    it('emits the operator and the operand as entered', async () => {
        const [el] = await mount('');
        el.querySelector('[data-ref=value1]').value = '18';

        assert.deepStrictEqual(
            el.value,
            ['EQ', '18'],
            'the tuple carries the default EQ operator and the operand as typed',
        );
    });

    it('reveals the second operand for BETWEEN and emits both bounds', async () => {
        const [el] = await mount('');
        const second = el.querySelector('[data-ref=value2]');
        assert.isTrue(second.hidden, 'the second operand is hidden while the operator is not BETWEEN');

        el.querySelector('a[value=BETWEEN]').click();
        assert.isFalse(second.hidden, 'BETWEEN reveals the second operand');

        el.querySelector('[data-ref=value1]').value = '10';
        second.value = '15';
        assert.deepStrictEqual(el.value, ['BETWEEN', '10', '15'], 'the BETWEEN tuple carries both bounds as typed');
    });
});

describe('BooleanFilter tuples', () => {
    const mount = async (attrs) => {
        const container = appended(`<ful-filter-boolean ${attrs} name="f">b</ful-filter-boolean>`);
        const el = container.querySelector('ful-filter-boolean');
        await Rendering.waitFor(el);
        await settle();
        return [el, container];
    };

    it('contributes nothing until a value is picked', async () => {
        const [el] = await mount('');
        assert.isNull(el.value, 'a boolean filter reports no tuple while the value menu is on any');
        assert.strictEqual(
            el.querySelector('[data-ref=operator]').getAttribute('value'),
            'EQ',
            'the boolean filter defaults to EQ',
        );
        assert.strictEqual(
            el.querySelector('[data-ref=value]').tagName,
            'BUTTON',
            'the boolean value is picked through a menu button, not an input',
        );
    });

    it('a reset restores the default operator, like its siblings', async () => {
        const container = appended('<form><ful-filter-boolean name="f">b</ful-filter-boolean></form>');
        const el = container.querySelector('ful-filter-boolean');
        await Rendering.waitFor(el);
        await settle();

        el.value = ['NEQ', 'true'];
        assert.deepStrictEqual(el.value, ['NEQ', 'true'], 'the assigned tuple is reported back before the reset');

        container.querySelector('form').reset();
        await settle();

        assert.isNull(el.value, 'a form reset puts the value menu back on any, so the filter reports no tuple');
        assert.strictEqual(
            el.querySelector('[data-ref=operator]').getAttribute('value'),
            'EQ',
            'a form reset also restores the default operator',
        );
    });

    it('emits the operator with the picked token', async () => {
        const [el] = await mount('');
        const button = el.querySelector('[data-ref=value]');

        assert.strictEqual(button.innerText, 'Any', 'nothing is picked until something is');
        button.nextElementSibling.querySelector('a[value=true]').click();
        assert.deepStrictEqual(
            el.value,
            ['EQ', 'true'],
            'picking yes reports the true token with the operator in force',
        );
        assert.strictEqual(button.innerText, 'Yes', 'the value button shows the localized word for the picked token');

        el.querySelector('a[value=NEQ]').click();
        button.nextElementSibling.querySelector('a[value=false]').click();
        assert.deepStrictEqual(
            el.value,
            ['NEQ', 'false'],
            'the tuple carries the operator and token picked from both menus',
        );
        assert.strictEqual(button.innerText, 'No', 'the value button shows the localized word for false');
    });

    it('clears back to any through the menu', async () => {
        const [el] = await mount(`value='["EQ","true"]'`);
        const changes = [];
        el.addEventListener('change', (e) => changes.push(e.detail.value));

        el.querySelector('[data-ref=value]').nextElementSibling.querySelector('a[value=""]').click();

        assert.isNull(el.value, 'any contributes nothing');
        assert.deepStrictEqual(changes, [null], 'the change event announces that the filter no longer applies');
        assert.strictEqual(
            el.querySelector('[data-ref=value]').innerText,
            'Any',
            'the value button shows the localized word for any again',
        );
    });

    it('whitelists the operators like its siblings', async () => {
        const [el] = await mount('operators="NEQ"');
        assert.deepStrictEqual(el.operators, ['NEQ'], 'the operators property reads back the declared whitelist');
        assert.strictEqual(
            el.querySelector('[data-ref=operator]').getAttribute('value'),
            'NEQ',
            'a single declared operator is the one shown on the button',
        );
    });

    it('applies an assigned tuple back onto the controls', async () => {
        const [el] = await mount(`value='["NEQ","true"]'`);
        assert.strictEqual(
            el.querySelector('[data-ref=operator]').getAttribute('value'),
            'NEQ',
            'the assigned tuple sets the operator button',
        );
        assert.strictEqual(
            el.querySelector('[data-ref=value]').value,
            'true',
            'the assigned tuple sets the token on the value button',
        );
        assert.strictEqual(
            el.querySelector('[data-ref=value]').innerText,
            'Yes',
            'the value button shows the localized word for the assigned token',
        );
        assert.deepStrictEqual(el.value, ['NEQ', 'true'], 'the value reads back the assigned tuple');
    });
});

describe('Filters and selects together', () => {
    it('a multiple select in a form emits the bare array the in-list filters expect', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
                load: async () => [],
            }),
        });
        const container = document.createElement('div');
        container.innerHTML = `
            <ful-form>
                <ful-select multiple name="byPetType">
                    <select slot="options">
                        <option value="DOG">Dog</option>
                        <option value="CAT">Cat</option>
                    </select>
                    types
                </ful-select>
            </ful-form>`;
        attached(container);
        const form = container.querySelector('ful-form');
        await Rendering.waitFor(form);
        const select = container.querySelector('ful-select');
        select.value = ['DOG', 'CAT'];
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }

        assert.deepStrictEqual(
            form.values.byPetType,
            ['DOG', 'CAT'],
            'no operator wraps the keys: the in-list contract',
        );
    });

    it('a single ful-filter-in reads a present but empty value attribute as the empty key', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                exact: async (...keys) => keys.map((k) => ({ key: k, label: `Label ${k}` })),
                load: async () => [
                    { key: '', label: 'Unset' },
                    { key: 'DOG', label: 'Dog' },
                ],
            }),
        });
        const container = document.createElement('div');
        container.innerHTML = '<ful-filter-in value="">status</ful-filter-in>';
        attached(container);
        const el = container.querySelector('ful-filter-in');
        await Rendering.waitFor(el);
        await settle();

        assert.deepStrictEqual(el.value, [''], 'the empty key is a criterion, not no filter');
        container.remove();
    });
});

describe('Filter readonly and disabled', () => {
    for (const tag of ['ful-filter-instant', 'ful-filter-local-date']) {
        it(`${tag} makes both operands readonly, not just the first`, async () => {
            const [el] = await mount(`<${tag}>f</${tag}>`);
            const [first, second] = el.querySelectorAll('input');

            el.setAttribute('readonly', '');
            assert.isTrue(first.readOnly, 'readonly reaches the first operand');
            assert.isTrue(second.readOnly, 'readonly reaches the second operand, not only the first');
            assert.isTrue(el.readonly, 'and the element reads its own state back');

            el.removeAttribute('readonly');
            assert.isFalse(first.readOnly, 'lifting readonly frees the first operand');
            assert.isFalse(second.readOnly, 'lifting readonly frees the second operand as well');
            assert.isFalse(el.readonly, 'the element reads back that readonly was lifted');
        });
    }

    it('a disabled filter keeps its operator through its menu', async () => {
        const [el] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        el.disabled = true;

        el.querySelector('a[value=NEQ]').click();

        assert.strictEqual(
            el.querySelector('[data-ref=operator]').getAttribute('value'),
            'CONTAINS',
            'the menu picks nothing',
        );
        assert.isNull(el.value, 'a disabled filter with no operand still reports no tuple');
    });

    it('a readonly filter does not change operator through its menu', async () => {
        const [el] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        const input = el.querySelector('[data-ref=value1]');
        input.value = 'ab';
        el.setAttribute('readonly', '');

        el.querySelector('a[value=NEQ]').click();

        assert.strictEqual(
            el.querySelector('[data-ref=operator]').getAttribute('value'),
            'CONTAINS',
            'a readonly filter keeps the operator in force when a menu item is clicked',
        );
        assert.deepStrictEqual(
            el.value,
            ['CONTAINS', 'IGNORE_CASE', 'ab'],
            'a readonly filter keeps its tuple unchanged',
        );
    });

    it('a readonly filter refuses to open its menu at all, without leaving the accessibility tree', async () => {
        const [el] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        const operator = el.querySelector('[data-ref=operator]');
        const menu = operator.nextElementSibling;
        el.setAttribute('readonly', '');

        operator.click();
        assert.isFalse(menu.matches(':popover-open'), 'the menu stays shut');
        assert.isFalse(el.querySelector('ful-control-group').inert, 'and the filter stays readable');

        el.removeAttribute('readonly');
        operator.click();
        assert.isTrue(menu.matches(':popover-open'), 'and it opens again once the claim is lifted');
    });

    it('a readonly filter freezes the sensitivity menu too', async () => {
        const [el] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        const input = el.querySelector('[data-ref=value1]');
        input.value = 'ab';
        el.setAttribute('readonly', '');

        el.querySelector('[data-ref=sensitivity]').nextElementSibling.querySelector('a[value=CASE_SENSITIVE]').click();

        assert.deepStrictEqual(el.value, ['CONTAINS', 'IGNORE_CASE', 'ab'], 'the mode did not move');
    });
});

describe('A fixed operator or sensitivity', () => {
    const warnings = () => {
        const seen = [];
        const original = console.warn;
        console.warn = (...args) => seen.push(args.map(String).join(' '));
        return [seen, () => (console.warn = original)];
    };

    it('leaves the chrome and keeps answering the tuple: a search field', async () => {
        const [el] = await mount(
            `<ful-filter-text operator="CONTAINS" sensitivity="IGNORE_CASE" name="f">t</ful-filter-text>`,
        );
        const operator = el.querySelector('[data-ref=operator]');
        const sensitivity = el.querySelector('[data-ref=sensitivity]');

        assert.isTrue(operator.hidden, 'a fixed operator is not a choice');
        assert.isTrue(sensitivity.hidden, 'a fixed sensitivity is hidden as well, since it is not a choice either');
        assert.strictEqual(
            getComputedStyle(operator.closest('ful-affix')).display,
            'none',
            'the affix goes too, not an empty box',
        );
        assert.strictEqual(el.value, null, 'an empty field contributes nothing');

        const input = el.querySelector('[data-ref=value1]');
        input.value = 'needle';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        assert.deepStrictEqual(
            el.value,
            ['CONTAINS', 'IGNORE_CASE', 'needle'],
            'the tuple still carries the fixed choices',
        );
    });

    it('keeps the affix for the choice left free when the other is fixed', async () => {
        for (const [attributes, free] of [
            ['operator="EQ"', 'sensitivity'],
            ['sensitivity="MATCH_CASE"', 'operator'],
        ]) {
            const [el] = await mount(`<ful-filter-text ${attributes} name="f">t</ful-filter-text>`);
            const button = el.querySelector(`[data-ref=${free}]`);

            assert.isFalse(button.hidden, `${attributes} leaves the ${free} a choice`);
            assert.notStrictEqual(
                getComputedStyle(button.closest('ful-affix')).display,
                'none',
                'the affix holding the free choice stays displayed',
            );
            assert.isAbove(button.getBoundingClientRect().width, 0, 'the free choice keeps a visible width');
        }
    });

    it('fixes a concrete filter to its operator, instant among them', async () => {
        const [el] = await mount(`<ful-filter-instant operator="GTE" name="f">i</ful-filter-instant>`);
        assert.isTrue(el.querySelector('[data-ref=operator]').hidden, 'a fixed operator hides the operator button');
        assert.strictEqual(
            getComputedStyle(el.querySelector('[data-ref=operator]').closest('ful-affix')).display,
            'none',
            'the affix goes too when the operator was its only content',
        );

        el.value = ['GTE', '2024-03-15T10:30:00.000Z'];
        assert.deepStrictEqual(
            el.value,
            ['GTE', '2024-03-15T10:30:00.000Z'],
            'a tuple with the fixed operator is taken as assigned',
        );
        el.value = ['LTE', '2024-03-15T10:30:00.000Z'];
        assert.deepStrictEqual(
            el.value,
            ['GTE', '2024-03-15T10:30:00.000Z'],
            'a fixed operator wins over the assignment',
        );
    });

    it('pins the default where the name is unknown, and says so', async () => {
        const [seen, restore] = warnings();
        try {
            const [el] = await mount(`<ful-filter-instant operator="WHENEVER" name="f">i</ful-filter-instant>`);
            const input = el.querySelector('[data-ref=value1]');
            input.value = '2024-03-15T10:30';
            input.dispatchEvent(new Event('change', { bubbles: true }));

            assert.strictEqual(el.value[0], 'LTE', 'the filter default is the pin');
            assert.match(String(el.value[1]), /^2024-03-15T/, 'the operand serializes as ever');
            assert.isTrue(
                seen.some((w) => w.includes('WHENEVER')),
                'the unknown name is named',
            );
        } finally {
            restore();
        }
    });

    it('names a page declaring the singular and the plural together', async () => {
        const [seen, restore] = warnings();
        try {
            const [el] = await mount(
                `<ful-filter-text operator="EQ" operators="CONTAINS,STARTS_WITH" name="f">t</ful-filter-text>`,
            );
            const input = el.querySelector('[data-ref=value1]');
            input.value = 'needle';
            input.dispatchEvent(new Event('change', { bubbles: true }));

            assert.deepStrictEqual(el.value, ['EQ', 'IGNORE_CASE', 'needle'], 'the singular wins');
            assert.isTrue(
                seen.some((w) => w.includes('the plural is ignored')),
                'the confusion is reported',
            );
        } finally {
            restore();
        }
    });

    it('names a page declaring the fixed sensitivity beside its plural', async () => {
        const [seen, restore] = warnings();
        try {
            const [el] = await mount(
                `<ful-filter-text sensitivity="CASE_SENSITIVE" sensitivities="IGNORE_CASE" name="f">t</ful-filter-text>`,
            );
            const input = el.querySelector('[data-ref=value1]');
            input.value = 'needle';
            input.dispatchEvent(new Event('change', { bubbles: true }));

            assert.isTrue(el.querySelector('[data-ref=sensitivity]').hidden, 'the fixed sensitivity leaves');
            assert.deepStrictEqual(el.value, ['CONTAINS', 'CASE_SENSITIVE', 'needle'], 'the singular wins');
            assert.isTrue(
                seen.some((w) => w.includes('sensitivities offers a menu for')),
                'the confusion is reported',
            );
        } finally {
            restore();
        }
    });
});

describe('TextFilter case sensitivity', () => {
    it('reports back the sensitivity it was given', async () => {
        const [el] = await mount(`<ful-filter-text value='["EQ","CASE_SENSITIVE","x"]'>t</ful-filter-text>`);
        assert.deepEqual(
            el.value,
            ['EQ', 'CASE_SENSITIVE', 'x'],
            'the value reads back the CASE_SENSITIVE mode it was given',
        );

        el.querySelector('a[value=STARTS_WITH]').click();

        assert.deepEqual(
            el.value,
            ['STARTS_WITH', 'CASE_SENSITIVE', 'x'],
            'picking an operator is not a licence to fold case',
        );
    });

    it('is case insensitive until told otherwise', async () => {
        const [el] = await mount(`<ful-filter-text>t</ful-filter-text>`);

        el.querySelector('[data-ref=value1]').value = 'ab';

        assert.deepEqual(
            el.value,
            ['CONTAINS', 'IGNORE_CASE', 'ab'],
            'the tuple carries IGNORE_CASE when no sensitivity was given',
        );
    });
});

describe('Filter change notifications', () => {
    it('announces the whole tuple when the upper bound of a range changes', async () => {
        const [el] = await mount(
            `<ful-filter-local-date value='["BETWEEN","2024-01-01","2024-02-01"]'>d</ful-filter-local-date>`,
        );
        const seen = [];
        el.addEventListener('change', (evt) => seen.push(evt.detail));

        const second = el.querySelector('[data-ref=value2]');
        second.value = '2024-03-01';
        second.dispatchEvent(new Event('change', { bubbles: true }));

        assert.deepEqual(
            seen,
            [{ value: ['BETWEEN', '2024-01-01', '2024-03-01'] }],
            'changing the upper bound announces the whole BETWEEN tuple',
        );
    });

    it('announces the new tuple when an operator is picked', async () => {
        const [el] = await mount(`<ful-filter-local-date value='["EQ","2024-01-01"]'>d</ful-filter-local-date>`);
        const seen = [];
        el.addEventListener('change', (evt) => seen.push(evt.detail));

        el.querySelector('a[value=GTE]').click();
        el.querySelector('a[value=GTE]').click();

        assert.deepEqual(
            seen,
            [{ value: ['GTE', '2024-01-01'] }],
            'picking the operator already in force changes nothing',
        );
    });

    it('announces that a half filled range no longer filters anything', async () => {
        const [el] = await mount(`<ful-filter-local-date value='["EQ","2024-01-01"]'>d</ful-filter-local-date>`);
        const seen = [];
        el.addEventListener('change', (evt) => seen.push(evt.detail));

        el.querySelector('a[value=BETWEEN]').click();

        assert.deepEqual(seen, [{ value: null }], 'a listening form must learn the filter stopped applying');
    });
});

describe('Filter operator menu closing', () => {
    it('gives the operator button the focus back when the menu is dismissed', async () => {
        const [el] = await mount(`<ful-filter-local-date name="f">d</ful-filter-local-date>`);
        const button = el.querySelector('[data-ref=operator]');
        const menu = button.nextElementSibling;
        button.click();
        await settle();
        assert.strictEqual(document.activeElement, el.querySelector('a[value=EQ]'), 'the menu borrowed the focus');

        menu.hidePopover();
        await settle();

        assert.strictEqual(document.activeElement, button, 'closing gives the focus back to the invoker');
    });

    it('leaves the focus alone when a key lands on the menu itself, not on an item', async () => {
        const [el] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        const button = el.querySelector('[data-ref=operator]');
        const menu = button.nextElementSibling;
        button.click();
        await settle();
        const focused = document.activeElement;

        menu.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true }));

        assert.strictEqual(
            document.activeElement,
            focused,
            'a key on the menu itself does not move the focus away from the focused item',
        );
        assert.strictEqual(button.getAttribute('value'), 'CONTAINS', 'nothing was picked either');
    });
});

describe('Filter property access before rendering', () => {
    it('accepts an operators assignment on a filter that has not rendered yet', () => {
        const text = document.createElement('ful-filter-text');
        text.operators = ['GTE', 'EQ'];

        assert.deepStrictEqual(text.operators, ['GTE', 'EQ'], 'the whitelist is held until the menu exists');

        const bool = document.createElement('ful-filter-boolean');
        bool.operators = ['NEQ'];

        assert.deepStrictEqual(
            bool.operators,
            ['NEQ'],
            'the boolean filter holds an operators assignment made before its render as well',
        );
    });

    it('accepts a sensitivities assignment on a filter that has not rendered yet', async () => {
        const text = document.createElement('ful-filter-text');
        text.sensitivities = ['CASE_SENSITIVE', 'NOT_A_SENSITIVITY'];

        assert.deepStrictEqual(
            text.sensitivities,
            ['CASE_SENSITIVE'],
            'narrowed against the vocabulary while the menu is still missing',
        );

        appended('').appendChild(text);
        text.innerHTML = 't';
        await Rendering.waitFor(text);
        await settle();
        assert.deepStrictEqual(
            text.sensitivities,
            ['IGNORE_CASE', 'CASE_SENSITIVE'],
            'at render the absent sensitivities attribute replaces the early assignment with both modes',
        );
    });
});

describe('BooleanFilter interactions', () => {
    const mount = async (attrs = '') => {
        const container = appended(`<ful-filter-boolean ${attrs} name="f">b</ful-filter-boolean>`);
        const el = container.querySelector('ful-filter-boolean');
        await Rendering.waitFor(el);
        await settle();
        return [el, container];
    };

    it('keeps its tuple when a disabled filter is clicked', async () => {
        const [el] = await mount(`value='["EQ","true"]'`);
        const seen = [];
        el.addEventListener('change', (e) => seen.push(e.detail));
        el.disabled = true;
        assert.isTrue(el.disabled, 'the claim reads back');

        el.querySelector('a[value=NEQ]').click();
        el.querySelector('[data-ref=value]').nextElementSibling.querySelector('a[value=false]').click();

        assert.deepStrictEqual(
            el.value,
            ['EQ', 'true'],
            'a disabled filter keeps its tuple when its menu items are clicked',
        );
        assert.deepStrictEqual(seen, [], 'a disabled filter announces no change');
    });

    it('ignores clicks that did not land on a dropdown item', async () => {
        const [el] = await mount(`value='["EQ","true"]'`);
        const seen = [];
        el.addEventListener('change', (e) => seen.push(e.detail));

        el.querySelector('label').click();
        el.querySelector('[data-ref=operator]').click();
        el.querySelector('[data-ref=value]').click();

        assert.deepStrictEqual(el.value, ['EQ', 'true'], 'clicks outside the menu items leave the tuple unchanged');
        assert.deepStrictEqual(seen, [], 'clicks outside the menu items announce no change');
    });

    it('writes no aria-readonly or aria-required on the value button, whose role accepts neither', async () => {
        const [el] = await mount('readonly required');
        const button = el.querySelector('[data-ref=value]');

        assert.isTrue(el.readonly && el.required, 'the claims reflect on the host');
        assert.isFalse(button.hasAttribute('aria-readonly'), 'the value button role does not accept aria-readonly');
        assert.isFalse(button.hasAttribute('aria-required'), 'the value button role does not accept aria-required');
    });

    it('hands its focus to the value button', async () => {
        const [el] = await mount('');

        el.focus();

        assert.strictEqual(
            document.activeElement,
            el.querySelector('[data-ref=value]'),
            'focusing the boolean filter focuses its value button',
        );
    });

    it('reports and clears a custom validity through the field error', async () => {
        const [el] = await mount('');

        el.setCustomValidity('pick one');

        assert.strictEqual(
            el.querySelector('ful-field-error').innerText,
            'pick one',
            'the custom validity message is shown in the field error',
        );
        assert.strictEqual(
            el.internals.validationMessage,
            ' ',
            'the internals hold a single space, the shortest message setValidity accepts with a flag set, while the text itself goes to the field error',
        );

        el.setCustomValidity('');

        assert.strictEqual(
            el.querySelector('ful-field-error').innerText,
            '',
            'clearing the custom validity empties the field error',
        );
        assert.strictEqual(
            el.internals.validationMessage,
            '',
            'clearing the custom validity clears the internals message',
        );
    });
});

describe('Filter menus, where the platform lacks CSS anchor positioning', () => {
    //the engine under test carries the anchor css: the supports probe is stubbed out
    let supports;
    before(() => {
        supports = CSS.supports;
        CSS.supports = () => false;
    });
    after(() => {
        CSS.supports = supports;
    });

    it('places the operator menu under its invoker, start-aligned', async () => {
        const [el] = await mount(`<ful-filter-text>t</ful-filter-text>`);
        const button = el.querySelector('[data-ref=operator]');

        button.click();
        await settle();

        const m = el.querySelector('ul[popover]').getBoundingClientRect();
        const b = button.getBoundingClientRect();
        assert.closeTo(m.left, b.left, 1, 'the menu follows its invoker horizontally');
        assert.isAtLeast(m.top, b.bottom, 'the menu sits below its invoker');
    });

    it('places the boolean value menu under the value button', async () => {
        const [el] = await mount(`<ful-filter-boolean>b</ful-filter-boolean>`);
        const button = el.querySelector('[data-ref=value]');

        button.click();
        await settle();

        const m = button.nextElementSibling.getBoundingClientRect();
        const b = button.getBoundingClientRect();
        assert.closeTo(m.left, b.left, 1, 'the menu follows its invoker horizontally');
        assert.isAtLeast(m.top, b.bottom, 'the menu sits below its invoker');
    });
});

describe('Filters answering their criterion', () => {
    it('answers null while nothing is filtered on', async () => {
        const [el] = await mount(`<ful-filter-text>Position</ful-filter-text>`);

        assert.isNull(el.criterion, 'a filter with no operand has no criterion to describe');
    });

    it('carries the label, the operator and the operand', async () => {
        const [el] = await mount(`<ful-filter-text value='["CONTAINS","IGNORE_CASE","ab"]'>Position</ful-filter-text>`);

        assert.deepEqual(
            el.criterion,
            {
                label: 'Position',
                operator: 'CONTAINS',
                operands: ['ab'],
            },
            'the criterion carries the label text, the operator in force and the operand',
        );
    });

    it('carries both operands of a BETWEEN', async () => {
        const [el] = await mount(
            `<ful-filter-local-date value='["BETWEEN","2024-01-01","2024-02-01"]'>When</ful-filter-local-date>`,
        );

        assert.deepEqual(
            el.criterion.operands,
            ['2024-01-01', '2024-02-01'],
            'a BETWEEN criterion carries both operands',
        );
    });

    it('describes only the first operand while the operator takes one', async () => {
        const [el] = await mount(`<ful-filter-number value='["GT","3"]'>Count</ful-filter-number>`);

        assert.deepEqual(
            el.criterion,
            { label: 'Count', operator: 'GT', operands: ['3'] },
            'a single operand operator describes one operand only',
        );
    });

    it('answers a boolean filter in the words its menu shows, not the token', async () => {
        const [el] = await mount(`<ful-filter-boolean value='["EQ","true"]'>Active</ful-filter-boolean>`);

        assert.deepEqual(
            el.criterion,
            { label: 'Active', operator: 'EQ', operands: ['Yes'] },
            'the boolean criterion carries the localized word the value menu shows',
        );
    });

    it('answers null for a boolean filter left on any', async () => {
        const [el] = await mount(`<ful-filter-boolean>Active</ful-filter-boolean>`);

        assert.isNull(el.criterion, 'a boolean filter on any has no criterion to describe');
    });
});

describe('The set membership filter', () => {
    beforeEach(() => {
        const labels = { A: 'Alpha', B: 'Beta' };
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                exact: async (...keys) => keys.map((k) => ({ key: k, label: labels[k] ?? k })),
                load: async () => Object.entries(labels).map(([key, label]) => ({ key, label })),
            }),
        });
    });

    it('contributes nothing while empty, so the table drops it', async () => {
        const [el] = await mount(`<ful-filter-in name="byKind">Kind</ful-filter-in>`);

        assert.isNull(
            el.value,
            'an empty set filter reports no value, so the table drops it instead of sending an empty set that matches nothing',
        );
        assert.isNull(el.criterion, 'an empty set filter has no criterion to describe');
    });

    it('answers the chosen keys as an array', async () => {
        const [el] = await mount(`<ful-filter-in name="byKind" multiple value="A,B">Kind</ful-filter-in>`);

        assert.deepEqual(el.value, ['A', 'B'], 'a multiple set filter answers its chosen keys as an array');
    });

    it('answers an array for a single choice, which a bare key would not', async () => {
        const [el] = await mount(`<ful-filter-in name="byKind" value="A">Kind</ful-filter-in>`);

        assert.deepEqual(
            el.value,
            ['A'],
            'a single set filter wraps its key in an array, the bare array the in-list annotations take',
        );
    });

    it('gives the chosen labels rather than the keys', async () => {
        const [el] = await mount(`<ful-filter-in name="byKind" multiple value="A,B">Kind</ful-filter-in>`);
        await settle();

        assert.deepEqual(
            el.criterion,
            {
                label: 'Kind',
                operator: null,
                operands: ['Alpha', 'Beta'],
            },
            'the criterion shows the labels of the chosen entries, not their keys',
        );
    });

    it('picks one key unless multiple is declared, as a select does', async () => {
        const [single] = await mount(`<ful-filter-in name="byKind">Kind</ful-filter-in>`);
        const [many] = await mount(`<ful-filter-in name="byKind" multiple>Kind</ful-filter-in>`);

        assert.isFalse(single.multiple, 'a set filter picks one key unless multiple is declared');
        assert.isTrue(many.multiple, 'a set filter declaring multiple picks several keys');
    });

    it('sends the declared operator in front of the keys, for the field a compare reads', async () => {
        const [el] = await mount(`<ful-filter-in name="byKind" operator="EQ" value="A">Kind</ful-filter-in>`);

        assert.deepEqual(el.value, ['EQ', 'A'], 'the declared operator leads the chosen keys');
    });

    it('takes back what it answered, operator and all', async () => {
        const [el] = await mount(`<ful-filter-in name="byKind" operator="EQ">Kind</ful-filter-in>`);

        el.value = ['EQ', 'B'];
        assert.deepEqual(el.value, ['EQ', 'B'], 'the operator is not read back as a key');

        el.value = 'A';
        assert.deepEqual(el.value, ['EQ', 'A'], 'a bare key still assigns');
    });

    it('contributes nothing while empty even with an operator, so the table drops it', async () => {
        const [el] = await mount(`<ful-filter-in name="byKind" operator="EQ">Kind</ful-filter-in>`);

        assert.isNull(el.value, 'an empty set filter reports no value even with a declared operator');
    });

    it('reports the operator in the criterion, so a chip can show it', async () => {
        const [el] = await mount(`<ful-filter-in name="byKind" operator="NEQ" value="A">Kind</ful-filter-in>`);
        await settle();

        assert.deepEqual(
            el.criterion,
            { label: 'Kind', operator: 'NEQ', operands: ['Alpha'] },
            'the criterion carries the declared operator and the labels of the chosen keys',
        );
    });

    it('clears back to contributing nothing', async () => {
        const [el] = await mount(`<ful-filter-in name="byKind" value="A">Kind</ful-filter-in>`);

        el.value = null;

        assert.isNull(el.value, 'clearing a set filter makes it report no value');
        assert.isNull(el.criterion, 'a cleared set filter has no criterion to describe');
    });
});
