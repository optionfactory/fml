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

describe('Filter value tuples', () => {
    it('reads operator, sensitivity and operand out of the value attribute', async () => {
        const [el, container] = await mount(
            `<ful-filter-text value='["STARTS_WITH","IGNORE_CASE","ab"]'>t</ful-filter-text>`,
        );

        assert.strictEqual(el.querySelector('[data-ref=value1]').value, 'ab');
        assert.deepEqual(el.value, ['STARTS_WITH', 'IGNORE_CASE', 'ab']);
        container.remove();
    });

    it('picks up a value attribute set after rendering', async () => {
        const [el, container] = await mount(`<ful-filter-text>t</ful-filter-text>`);

        el.setAttribute('value', JSON.stringify(['EQ', 'IGNORE_CASE', 'zz']));

        assert.strictEqual(el.querySelector('[data-ref=value1]').value, 'zz');
        assert.deepEqual(el.value, ['EQ', 'IGNORE_CASE', 'zz']);
        container.remove();
    });

    it('fills both operands of a BETWEEN tuple', async () => {
        const [el, container] = await mount(
            `<ful-filter-local-date value='["BETWEEN","2024-01-01","2024-02-01"]'>d</ful-filter-local-date>`,
        );

        assert.strictEqual(el.querySelector('[data-ref=value1]').value, '2024-01-01');
        assert.strictEqual(el.querySelector('[data-ref=value2]').value, '2024-02-01');
        assert.deepEqual(el.value, ['BETWEEN', '2024-01-01', '2024-02-01']);
        container.remove();
    });

    it('empties both operands when the value attribute is removed', async () => {
        const [el, container] = await mount(
            `<ful-filter-local-date value='["BETWEEN","2024-01-01","2024-02-01"]'>d</ful-filter-local-date>`,
        );

        el.removeAttribute('value');

        assert.strictEqual(el.querySelector('[data-ref=value1]').value, '');
        assert.strictEqual(el.querySelector('[data-ref=value2]').value, '');
        assert.isUndefined(el.value, 'an emptied filter contributes no criteria');
        container.remove();
    });

    it('reports undefined instead of a tuple with an empty operand', async () => {
        const [el, container] = await mount(`<ful-filter-text>t</ful-filter-text>`);

        assert.isUndefined(el.value, 'an unfilled filter contributes no criteria');
        container.remove();
    });

    it('reports undefined while a range is missing its upper bound', async () => {
        const [el, container] = await mount(
            `<ful-filter-local-date value='["EQ","2024-01-01"]'>d</ful-filter-local-date>`,
        );
        assert.deepEqual(el.value, ['EQ', '2024-01-01']);

        el.querySelector('a[value=BETWEEN]').click();

        assert.isUndefined(el.value, 'half a range is never reported as a partial tuple');
        container.remove();
    });

    it('announces the whole tuple, not the raw input value, when an operand changes', async () => {
        const [el, container] = await mount(`<ful-filter-text>t</ful-filter-text>`);
        const seen = [];
        el.addEventListener('change', (evt) => seen.push(evt.detail));

        const input = el.querySelector('[data-ref=value1]');
        input.value = 'abc';
        input.dispatchEvent(new Event('change', { bubbles: true }));

        assert.deepEqual(seen, [{ value: ['CONTAINS', 'IGNORE_CASE', 'abc'] }]);
        container.remove();
    });
});

describe('InstantFilter instant conversion', () => {
    it('shows an ISO instant as local wall clock time and reports it back as UTC', async () => {
        const [el, container] = await mount(
            `<ful-filter-instant value='["GTE","2024-03-15T10:30:00.000Z"]'>i</ful-filter-instant>`,
        );
        const first = el.querySelector('[data-ref=value1]');

        assert.notInclude(first.value, 'Z', 'the input holds local time, not the raw instant');
        assert.strictEqual(new Date(first.value).toISOString(), '2024-03-15T10:30:00.000Z');
        assert.deepEqual(el.value, ['GTE', '2024-03-15T10:30:00.000Z']);
        container.remove();
    });

    it('converts both bounds of a range typed into the inputs', async () => {
        const [el, container] = await mount(`<ful-filter-instant>i</ful-filter-instant>`);
        el.querySelector('a[value=BETWEEN]').click();

        el.querySelector('[data-ref=value1]').value = '2024-03-15T10:30';
        el.querySelector('[data-ref=value2]').value = '2024-03-16T22:45';

        assert.deepEqual(el.value, [
            'BETWEEN',
            new Date('2024-03-15T10:30').toISOString(),
            new Date('2024-03-16T22:45').toISOString(),
        ]);
        container.remove();
    });
});

describe('Filter operator selection', () => {
    for (const tag of ['ful-filter-instant', 'ful-filter-local-date']) {
        it(`${tag} reveals the second operand only for BETWEEN`, async () => {
            const [el, container] = await mount(`<${tag}>f</${tag}>`);
            const second = el.querySelector('[data-ref=value2]');
            assert.isTrue(second.hidden, 'hidden until a range is asked for');

            el.querySelector('a[value=BETWEEN]').click();
            assert.isFalse(second.hidden);

            el.querySelector('a[value=LTE]').click();
            assert.isTrue(second.hidden, 'hidden again for single operand operators');
            container.remove();
        });
    }

    it('keeps the affix width stable while operators change', async () => {
        const [el, container] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        const affix = el.querySelector('[data-ref=operator]').closest('ful-affix');
        const width = () => affix.getBoundingClientRect().width;

        const withContains = width();
        el.querySelector('a[value=EQ]').click();
        const withEquals = width();
        el.querySelector('a[value=BETWEEN]').click();
        const withBetween = width();

        assert.closeTo(withEquals, withContains, 0.5, 'a narrow glyph does not shrink the row');
        assert.closeTo(withBetween, withContains, 0.5, 'nor does a wide one grow it');
        container.remove();
    });

    it('relabels the operator button with the chosen item', async () => {
        const [el, container] = await mount(
            `<ful-filter-local-date value='["EQ","2024-01-01"]'>d</ful-filter-local-date>`,
        );
        const button = el.querySelector('[data-ref=operator]');
        const item = el.querySelector('a[value=GTE]');

        assert.strictEqual(item.querySelector('span:first-child').innerText, '≥', 'the menu pairs the glyph');
        assert.strictEqual(item.querySelector('span:last-child').innerText, 'At least', 'with the word');

        item.click();

        assert.strictEqual(button.getAttribute('value'), 'GTE');
        assert.strictEqual(button.textContent, '≥', 'the button shows the chosen glyph, not the word');
        assert.strictEqual(button.getAttribute('aria-label'), 'At least', 'the word announces it instead');
        assert.deepEqual(el.value, ['GTE', '2024-01-01'], 'and the tuple carries the chosen operator');
        container.remove();
    });

    it('uses continuation glyphs for the text operators and words in the menu', async () => {
        const [el, container] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        const button = el.querySelector('[data-ref=operator]');

        assert.strictEqual(button.textContent, '…a…', 'contains is the default');
        el.querySelector('a[value=STARTS_WITH]').click();
        assert.strictEqual(button.textContent, 'a…');
        el.querySelector('a[value=ENDS_WITH]').click();
        assert.strictEqual(button.textContent, '…a');
        assert.strictEqual(el.querySelector('a[value=CONTAINS] span:last-child').innerText, 'Contains');
        assert.strictEqual(el.querySelector('a[value=STARTS_WITH] span:last-child').innerText, 'Starts with');
        assert.strictEqual(button.getAttribute('aria-label'), 'Ends with');
        container.remove();
    });

    it('labels the sensitivity control and its menu with words', async () => {
        const [el, container] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        const button = el.querySelector('[data-ref=sensitivity]');

        assert.strictEqual(button.textContent, 'aa');
        assert.strictEqual(button.getAttribute('aria-label'), 'Ignore case');
        assert.strictEqual(
            button.nextElementSibling.querySelector('a[value=CASE_SENSITIVE] span:last-child').innerText,
            'Case sensitive',
        );

        button.nextElementSibling.querySelector('a[value=CASE_SENSITIVE]').click();

        assert.strictEqual(button.getAttribute('aria-label'), 'Case sensitive', 'the announcement follows the mode');
        container.remove();
    });

    const labelled = [
        ['ful-filter-text', ['EQ', 'IGNORE_CASE', 'ab'], 'EQ'],
        ['ful-filter-local-date', ['GTE', '2024-01-01'], 'GTE'],
        ['ful-filter-instant', ['GT', '2024-03-15T10:30:00.000Z'], 'GT'],
    ];
    for (const [tag, initial, operator] of labelled) {
        it(`${tag} labels the operator button with the operator it was given`, async () => {
            const [el, container] = await mount(`<${tag} value='${JSON.stringify(initial)}'>f</${tag}>`);
            const button = el.querySelector('[data-ref=operator]');

            assert.strictEqual(button.getAttribute('value'), operator);
            assert.strictEqual(
                button.textContent,
                { EQ: '=', GTE: '≥', GT: '>' }[operator],
                'the button shows the glyph of the operator in force, not the template default',
            );
            assert.notStrictEqual(el.querySelector(`a[value=${operator}]`).innerText, '', 'the menu shows the word');
            container.remove();
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
            const [el, container] = await mount(`<${tag} value='${JSON.stringify(range)}'>f</${tag}>`);
            const second = el.querySelector('[data-ref=value2]');
            assert.isFalse(second.hidden, 'a range must show the bound it is carrying');

            el.setAttribute('value', JSON.stringify(single));
            assert.isTrue(second.hidden, 'hidden again for single operand operators');
            container.remove();
        });
    }

    it('keeps the text filter operand and sensitivity when the operator changes', async () => {
        const [el, container] = await mount(
            `<ful-filter-text value='["CONTAINS","IGNORE_CASE","ab"]'>t</ful-filter-text>`,
        );

        el.querySelector('a[value=ENDS_WITH]').click();

        assert.deepEqual(el.value, ['ENDS_WITH', 'IGNORE_CASE', 'ab']);
        container.remove();
    });

    //every stray click inside the element reaches the same delegated handler,
    //which has nothing to read an operator from
    const strays = [
        ['ful-filter-text', ['EQ', 'IGNORE_CASE', 'ab'], ['EQ', 'IGNORE_CASE', 'ab']],
        ['ful-filter-local-date', ['GT', '2024-01-01'], ['GT', '2024-01-01']],
        ['ful-filter-instant', ['GT', '2024-03-15T10:30:00.000Z'], ['GT', '2024-03-15T10:30:00.000Z']],
    ];
    for (const [tag, initial, expected] of strays) {
        it(`${tag} ignores clicks that did not land on a dropdown item`, async () => {
            const [el, container] = await mount(`<${tag} value='${JSON.stringify(initial)}'>f</${tag}>`);

            el.querySelector('input').click();
            el.querySelector('[data-ref=operator]').click();
            el.querySelector('ul').click();

            assert.deepEqual(el.value, expected, 'only the menu items pick an operator');
            container.remove();
        });
    }
});

describe('Filter operator keyboard access', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };
    const keydown = (el, code) => {
        el.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    };

    it('focuses the operator in force when the menu opens', async () => {
        const [el, container] = await mount(
            `<ful-filter-local-date value='["GTE","2024-01-01"]'>d</ful-filter-local-date>`,
        );
        const button = el.querySelector('[data-ref=operator]');

        button.click();
        await settle();

        assert.isTrue(el.querySelector('ul').matches(':popover-open'));
        assert.strictEqual(document.activeElement, el.querySelector('a[value=GTE]'));
        container.remove();
    });

    it('starts from the top when no operator is in force', async () => {
        const [el, container] = await mount(`<ful-filter-text>t</ful-filter-text>`);
        const button = el.querySelector('[data-ref=operator]');

        button.click();
        await settle();

        assert.strictEqual(document.activeElement, el.querySelector('a[value=CONTAINS]'));
        container.remove();
    });

    it('moves with the arrows and the jump keys', async () => {
        const [el, container] = await mount(`<ful-filter-text>t</ful-filter-text>`);
        const button = el.querySelector('[data-ref=operator]');
        button.click();
        await settle();
        const first = document.activeElement;

        keydown(first, 'ArrowDown');
        assert.strictEqual(document.activeElement, el.querySelector('a[value=STARTS_WITH]'));
        keydown(document.activeElement, 'ArrowUp');
        assert.strictEqual(document.activeElement, first);
        keydown(first, 'End');
        assert.strictEqual(document.activeElement, el.querySelector('a[value=ENDS_WITH]'));
        keydown(document.activeElement, 'Home');
        assert.strictEqual(document.activeElement, el.querySelector('a[value=EQ]'));
        container.remove();
    });

    it('picks with Enter and gives the button the focus back', async () => {
        const [el, container] = await mount(`<ful-filter-text value='["EQ","IGNORE_CASE","ab"]'>t</ful-filter-text>`);
        const button = el.querySelector('[data-ref=operator]');
        button.click();
        await settle();
        assert.strictEqual(document.activeElement, el.querySelector('a[value=EQ]'), 'the operator in force is focused');

        keydown(document.activeElement, 'ArrowUp');
        keydown(document.activeElement, 'Enter');

        assert.strictEqual(button.getAttribute('value'), 'ENDS_WITH');
        assert.deepStrictEqual(el.value, ['ENDS_WITH', 'IGNORE_CASE', 'ab']);
        assert.strictEqual(document.activeElement, button, 'the invoker takes the focus back');
        container.remove();
    });

    it('anchors the menu under its operator button', async () => {
        const [el, container] = await mount(`<ful-filter-text>t</ful-filter-text>`);
        const button = el.querySelector('[data-ref=operator]');
        button.click();
        await settle();

        const menu = el.querySelector('ul[popover]');
        const b = button.getBoundingClientRect();
        const m = menu.getBoundingClientRect();
        assert.closeTo(m.left, b.left, 1, 'the menu follows its anchor horizontally');
        assert.isAtLeast(m.top, b.bottom, 'the menu sits below its anchor');
        container.remove();
    });

    it('wraps the arrow navigation at the ends', async () => {
        const [el, container] = await mount(`<ful-filter-text>t</ful-filter-text>`);
        const button = el.querySelector('[data-ref=operator]');
        button.click();
        await settle();
        const first = document.activeElement;

        keydown(first, 'ArrowUp');
        assert.strictEqual(
            document.activeElement,
            el.querySelector('a[value=BETWEEN]'),
            'up from the default wraps to the item above it',
        );

        keydown(document.activeElement, 'ArrowDown');
        assert.strictEqual(document.activeElement, first, 'down again lands back on the default');
        container.remove();
    });

    it('gives the button the focus back on Escape', async () => {
        const [el, container] = await mount(`<ful-filter-instant>i</ful-filter-instant>`);
        const button = el.querySelector('[data-ref=operator]');
        button.click();
        await settle();
        const item = document.activeElement;
        assert.notStrictEqual(item, button);

        keydown(item, 'Escape');

        assert.strictEqual(document.activeElement, button);
        container.remove();
    });

    it('carries menu semantics', async () => {
        const [el, container] = await mount(`<ful-filter-text>t</ful-filter-text>`);
        const menu = el.querySelector('ul');

        assert.strictEqual(menu.getAttribute('role'), 'menu');
        for (const item of menu.querySelectorAll('a')) {
            assert.strictEqual(item.getAttribute('role'), 'menuitem');
            assert.strictEqual(item.getAttribute('tabindex'), '-1', 'the button is the tab stop, not every item');
        }
        container.remove();
    });
});

describe('Filter operator whitelisting', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };
    const mount = async (html) => {
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
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
        const [bool, boolContainer] = await mount(`<ful-filter-boolean>b</ful-filter-boolean>`);

        assert.deepStrictEqual(menuValues(text), [
            'EQ',
            'NEQ',
            'LT',
            'GT',
            'LTE',
            'GTE',
            'BETWEEN',
            'CONTAINS',
            'STARTS_WITH',
            'ENDS_WITH',
        ]);
        assert.deepStrictEqual(menuValues(date), ['EQ', 'NEQ', 'LT', 'GT', 'LTE', 'GTE', 'BETWEEN']);
        assert.deepStrictEqual(menuValues(bool), ['EQ', 'NEQ']);
        textContainer.remove();
        dateContainer.remove();
        boolContainer.remove();
    });

    it('restricts the menu to the declared operators', async () => {
        const [el, container] = await mount(`<ful-filter-text operators="CONTAINS,EQ" name="f">t</ful-filter-text>`);

        assert.deepStrictEqual(menuValues(el), ['CONTAINS', 'EQ']);
        assert.deepStrictEqual(el.operators, ['CONTAINS', 'EQ']);
        container.remove();
    });

    it('falls back to the whole vocabulary when nothing declared survives', async () => {
        const [el, container] = await mount(`<ful-filter-text operators="NOPE" name="f">t</ful-filter-text>`);

        assert.include(menuValues(el), 'BETWEEN', 'unknown names are dropped, the vocabulary stands in');
        container.remove();
    });

    it('keeps the default operator when whitelisted, falls back to the first when not', async () => {
        const [date, dateContainer] = await mount(
            `<ful-filter-local-date operators="GTE,EQ,BETWEEN" name="f">d</ful-filter-local-date>`,
        );
        const [instant, instantContainer] = await mount(
            `<ful-filter-instant operators="GTE,BETWEEN" name="f">i</ful-filter-instant>`,
        );

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
        instantContainer.remove();
    });

    it('re-applies the whitelist when the attribute changes after rendering', async () => {
        const [el, container] = await mount(`<ful-filter-local-date name="f">d</ful-filter-local-date>`);
        assert.lengthOf(menuValues(el), 7);

        el.setAttribute('operators', 'GTE,BETWEEN');
        await settle();

        assert.deepStrictEqual(menuValues(el), ['GTE', 'BETWEEN']);
        assert.deepStrictEqual(el.operators, ['GTE', 'BETWEEN']);
        container.remove();
    });

    it('pins the operator when a single one is declared', async () => {
        const [el, container] = await mount(`<ful-filter-number operators="GTE" name="f">n</ful-filter-number>`);
        const button = el.querySelector('[data-ref=operator]');

        assert.strictEqual(button.getAttribute('value'), 'GTE');
        assert.isTrue(button.disabled, 'the glyph is not a popup invoker anymore');
        assert.isNull(button.getAttribute('popovertarget'));
        assert.isNull(button.getAttribute('aria-haspopup'), 'nothing expands');

        el.value = ['EQ', '5'];
        assert.deepStrictEqual(el.value, ['GTE', '5'], 'a pinned operator wins over the assignment');
        container.remove();
    });

    it('re-arms the menu when the pin is lifted after rendering', async () => {
        const [el, container] = await mount(`<ful-filter-number operators="GTE" name="f">n</ful-filter-number>`);
        const button = el.querySelector('[data-ref=operator]');
        assert.isTrue(button.disabled);

        el.setAttribute('operators', 'GTE,EQ');
        await settle();

        assert.isFalse(button.disabled);
        assert.isNotNull(button.getAttribute('popovertarget'));
        assert.strictEqual(button.getAttribute('aria-haspopup'), 'true');
        container.remove();
    });

    it('pins the boolean operator the same way', async () => {
        const [el, container] = await mount(
            `<ful-filter-boolean operators="NEQ" value='["EQ","true"]' name="f">b</ful-filter-boolean>`,
        );
        const button = el.querySelector('[data-ref=operator]');

        assert.isTrue(button.disabled);
        assert.strictEqual(button.getAttribute('value'), 'NEQ');
        assert.deepStrictEqual(el.value, ['NEQ', 'true'], 'the pinned operator wins over the assigned tuple');
        container.remove();
    });
});

describe('Filter sensitivity whitelisting', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };
    const mount = async (html) => {
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const el = container.firstElementChild;
        await Rendering.waitFor(el);
        await settle();
        return [el, container];
    };

    it('pins the tuple sensitivity when a single mode is declared', async () => {
        const [el, container] = await mount(
            `<ful-filter-text sensitivities="CASE_SENSITIVE" name="f">t</ful-filter-text>`,
        );
        const input = el.querySelector('[data-ref=value1]');
        input.value = 'ab';

        assert.deepStrictEqual(el.value, ['CONTAINS', 'CASE_SENSITIVE', 'ab']);

        el.value = ['EQ', 'IGNORE_CASE', 'zz'];
        input.value = 'zz';
        assert.deepStrictEqual(
            el.value,
            ['EQ', 'CASE_SENSITIVE', 'zz'],
            'an assignment out of the whitelist is normalized',
        );
        container.remove();
    });

    it('re-applies the whitelist when the attribute changes after rendering', async () => {
        const [el, container] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        el.value = ['EQ', 'IGNORE_CASE', 'x'];
        assert.deepStrictEqual(el.value, ['EQ', 'IGNORE_CASE', 'x']);

        el.setAttribute('sensitivities', 'CASE_SENSITIVE');
        await settle();

        assert.deepStrictEqual(el.sensitivities, ['CASE_SENSITIVE']);
        assert.deepStrictEqual(el.value, ['EQ', 'CASE_SENSITIVE', 'x']);
        container.remove();
    });

    it('switches the mode through its own menu without touching the operator', async () => {
        const [el, container] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        const changes = [];
        el.addEventListener('change', (e) => changes.push(e.detail.value));
        const input = el.querySelector('[data-ref=value1]');
        const button = el.querySelector('[data-ref=sensitivity]');
        input.value = 'ab';

        assert.isFalse(button.hidden, 'both modes are allowed, the control is offered');
        assert.strictEqual(button.getAttribute('value'), 'IGNORE_CASE');

        button.nextElementSibling.querySelector('a[value=CASE_SENSITIVE]').click();

        assert.deepStrictEqual(el.value, ['CONTAINS', 'CASE_SENSITIVE', 'ab']);
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
        container.remove();
    });

    it('freezes the control when a single mode is pinned, and when the pin arrives later', async () => {
        const [pinned, pinnedContainer] = await mount(
            `<ful-filter-text sensitivities="CASE_SENSITIVE" name="f">t</ful-filter-text>`,
        );
        const [late, lateContainer] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        const button = pinned.querySelector('[data-ref=sensitivity]');

        assert.isFalse(button.hidden, 'the glyph stays: it documents the mode');
        assert.isTrue(button.disabled, 'but it is frozen');
        assert.isNull(button.getAttribute('popovertarget'));
        assert.isNull(button.getAttribute('aria-haspopup'));
        assert.strictEqual(button.getAttribute('value'), 'CASE_SENSITIVE');
        assert.strictEqual(button.textContent, 'Aa');

        late.setAttribute('sensitivities', 'IGNORE_CASE');
        await settle();
        const lateButton = late.querySelector('[data-ref=sensitivity]');
        assert.isTrue(lateButton.disabled, 'a pin arriving after rendering freezes it too');
        assert.strictEqual(lateButton.textContent, 'aa');

        pinnedContainer.remove();
        lateContainer.remove();
    });
});

describe('NumberFilter tuples', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };
    const mount = async (attrs) => {
        const container = document.createElement('div');
        container.innerHTML = `<ful-filter-number ${attrs} name="f">n</ful-filter-number>`;
        document.body.appendChild(container);
        const el = container.querySelector('ful-filter-number');
        await Rendering.waitFor(el);
        await settle();
        return [el, container];
    };

    it('contributes nothing until an operand is given', async () => {
        const [el, container] = await mount('');
        assert.isUndefined(el.value);
        assert.strictEqual(el.querySelector('[data-ref=value1]').type, 'number');
        container.remove();
    });

    it('emits the operator and the operand as entered', async () => {
        const [el, container] = await mount('');
        el.querySelector('[data-ref=value1]').value = '18';

        assert.deepStrictEqual(el.value, ['EQ', '18']);
        container.remove();
    });

    it('reveals the second operand for BETWEEN and emits both bounds', async () => {
        const [el, container] = await mount('');
        const second = el.querySelector('[data-ref=value2]');
        assert.isTrue(second.hidden);

        el.querySelector('a[value=BETWEEN]').click();
        assert.isFalse(second.hidden);

        el.querySelector('[data-ref=value1]').value = '10';
        second.value = '15';
        assert.deepStrictEqual(el.value, ['BETWEEN', '10', '15']);
        container.remove();
    });
});

describe('BooleanFilter tuples', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };
    const mount = async (attrs) => {
        const container = document.createElement('div');
        container.innerHTML = `<ful-filter-boolean ${attrs} name="f">b</ful-filter-boolean>`;
        document.body.appendChild(container);
        const el = container.querySelector('ful-filter-boolean');
        await Rendering.waitFor(el);
        await settle();
        return [el, container];
    };

    it('contributes nothing until a value is picked', async () => {
        const [el, container] = await mount('');
        assert.isUndefined(el.value);
        assert.strictEqual(el.querySelector('[data-ref=operator]').getAttribute('value'), 'EQ');
        assert.strictEqual(el.querySelector('[data-ref=value]').tagName, 'BUTTON');
        container.remove();
    });

    it('emits the operator with the picked token', async () => {
        const [el, container] = await mount('');
        const button = el.querySelector('[data-ref=value]');

        assert.strictEqual(button.innerText, 'Any', 'nothing is picked until something is');
        button.nextElementSibling.querySelector('a[value=true]').click();
        assert.deepStrictEqual(el.value, ['EQ', 'true']);
        assert.strictEqual(button.innerText, 'Yes');

        el.querySelector('a[value=NEQ]').click();
        button.nextElementSibling.querySelector('a[value=false]').click();
        assert.deepStrictEqual(el.value, ['NEQ', 'false']);
        assert.strictEqual(button.innerText, 'No');
        container.remove();
    });

    it('clears back to any through the menu', async () => {
        const [el, container] = await mount(`value='["EQ","true"]'`);
        const changes = [];
        el.addEventListener('change', (e) => changes.push(e.detail.value));

        el.querySelector('[data-ref=value]').nextElementSibling.querySelector('a[value=""]').click();

        assert.isUndefined(el.value, 'any contributes nothing');
        assert.deepStrictEqual(changes, [undefined]);
        assert.strictEqual(el.querySelector('[data-ref=value]').innerText, 'Any');
        container.remove();
    });

    it('whitelists the operators like its siblings', async () => {
        const [el, container] = await mount('operators="NEQ"');
        assert.deepStrictEqual(el.operators, ['NEQ']);
        assert.strictEqual(el.querySelector('[data-ref=operator]').getAttribute('value'), 'NEQ');
        container.remove();
    });

    it('applies an assigned tuple back onto the controls', async () => {
        const [el, container] = await mount(`value='["NEQ","true"]'`);
        assert.strictEqual(el.querySelector('[data-ref=operator]').getAttribute('value'), 'NEQ');
        assert.strictEqual(el.querySelector('[data-ref=value]').value, 'true');
        assert.strictEqual(el.querySelector('[data-ref=value]').innerText, 'Yes');
        assert.deepStrictEqual(el.value, ['NEQ', 'true']);
        container.remove();
    });
});

describe('Filters and selects together', () => {
    it('a multiple select in a form emits the bare array the in-list filters expect', async () => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                exact: async (...keys) => keys.map((k) => [k, `Label ${k}`]),
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
        document.body.appendChild(container);
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
        container.remove();
    });
});

describe('Filter readonly and disabled', () => {
    for (const tag of ['ful-filter-instant', 'ful-filter-local-date']) {
        it(`${tag} makes both operands readonly, not just the first`, async () => {
            const [el, container] = await mount(`<${tag}>f</${tag}>`);
            const [first, second] = el.querySelectorAll('input');

            el.setAttribute('readonly', '');
            assert.isTrue(first.readOnly, 'first operand');
            assert.isTrue(second.readOnly, 'second operand');
            assert.isTrue(el.readonly, 'and the element reads its own state back');

            el.removeAttribute('readonly');
            assert.isFalse(first.readOnly, 'first operand');
            assert.isFalse(second.readOnly, 'second operand');
            assert.isFalse(el.readonly);
            container.remove();
        });

        it(`${tag} disables both operands, not just the first`, async () => {
            const [el, container] = await mount(`<${tag}>f</${tag}>`);
            const [first, second] = el.querySelectorAll('input');
            const operator = el.querySelector('[data-ref=operator]');

            el.disabled = true;
            assert.isTrue(first.hasAttribute('disabled'), 'first operand');
            assert.isTrue(second.hasAttribute('disabled'), 'second operand');
            assert.isTrue(operator.disabled, 'the operator button carries the claim too');
            assert.isTrue(el.disabled, 'and the element reads its own state back');

            el.disabled = false;
            assert.isFalse(first.hasAttribute('disabled'), 'first operand');
            assert.isFalse(second.hasAttribute('disabled'), 'second operand');
            assert.isFalse(operator.disabled);
            assert.isFalse(el.disabled);
            container.remove();
        });
    }

    it('a disabled filter keeps its operator through its menu', async () => {
        const [el, container] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        el.disabled = true;

        el.querySelector('a[value=NEQ]').click();

        assert.strictEqual(
            el.querySelector('[data-ref=operator]').getAttribute('value'),
            'CONTAINS',
            'the menu picks nothing',
        );
        assert.strictEqual(el.value, undefined);
        container.remove();
    });

    it('a readonly filter does not change operator through its menu', async () => {
        const [el, container] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        const input = el.querySelector('[data-ref=value1]');
        input.value = 'ab';
        el.setAttribute('readonly', '');

        el.querySelector('a[value=NEQ]').click();

        assert.strictEqual(el.querySelector('[data-ref=operator]').getAttribute('value'), 'CONTAINS');
        assert.deepStrictEqual(el.value, ['CONTAINS', 'IGNORE_CASE', 'ab']);
        container.remove();
    });

    it('a readonly filter freezes the sensitivity menu too', async () => {
        const [el, container] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        const input = el.querySelector('[data-ref=value1]');
        input.value = 'ab';
        el.setAttribute('readonly', '');

        el.querySelector('[data-ref=sensitivity]').nextElementSibling.querySelector('a[value=CASE_SENSITIVE]').click();

        assert.deepStrictEqual(el.value, ['CONTAINS', 'IGNORE_CASE', 'ab'], 'the mode did not move');
        container.remove();
    });
});

describe('TextFilter case sensitivity', () => {
    it('reports back the sensitivity it was given', async () => {
        const [el, container] = await mount(`<ful-filter-text value='["EQ","CASE_SENSITIVE","x"]'>t</ful-filter-text>`);
        assert.deepEqual(el.value, ['EQ', 'CASE_SENSITIVE', 'x']);

        el.querySelector('a[value=STARTS_WITH]').click();

        assert.deepEqual(
            el.value,
            ['STARTS_WITH', 'CASE_SENSITIVE', 'x'],
            'picking an operator is not a licence to fold case',
        );
        container.remove();
    });

    it('is case insensitive until told otherwise', async () => {
        const [el, container] = await mount(`<ful-filter-text>t</ful-filter-text>`);

        el.querySelector('[data-ref=value1]').value = 'ab';

        assert.deepEqual(el.value, ['CONTAINS', 'IGNORE_CASE', 'ab']);
        container.remove();
    });
});

describe('Filter change notifications', () => {
    it('announces the whole tuple when the upper bound of a range changes', async () => {
        const [el, container] = await mount(
            `<ful-filter-local-date value='["BETWEEN","2024-01-01","2024-02-01"]'>d</ful-filter-local-date>`,
        );
        const seen = [];
        el.addEventListener('change', (evt) => seen.push(evt.detail));

        const second = el.querySelector('[data-ref=value2]');
        second.value = '2024-03-01';
        second.dispatchEvent(new Event('change', { bubbles: true }));

        assert.deepEqual(seen, [{ value: ['BETWEEN', '2024-01-01', '2024-03-01'] }]);
        container.remove();
    });

    it('announces the new tuple when an operator is picked', async () => {
        const [el, container] = await mount(
            `<ful-filter-local-date value='["EQ","2024-01-01"]'>d</ful-filter-local-date>`,
        );
        const seen = [];
        el.addEventListener('change', (evt) => seen.push(evt.detail));

        el.querySelector('a[value=GTE]').click();
        el.querySelector('a[value=GTE]').click();

        assert.deepEqual(
            seen,
            [{ value: ['GTE', '2024-01-01'] }],
            'picking the operator already in force changes nothing',
        );
        container.remove();
    });

    it('announces that a half filled range no longer filters anything', async () => {
        const [el, container] = await mount(
            `<ful-filter-local-date value='["EQ","2024-01-01"]'>d</ful-filter-local-date>`,
        );
        const seen = [];
        el.addEventListener('change', (evt) => seen.push(evt.detail));

        el.querySelector('a[value=BETWEEN]').click();

        assert.deepEqual(seen, [{ value: undefined }], 'a listening form must learn the filter stopped applying');
        container.remove();
    });
});

describe('Filter operator menu closing', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };

    it('gives the operator button the focus back when the menu is dismissed', async () => {
        const [el, container] = await mount(`<ful-filter-local-date name="f">d</ful-filter-local-date>`);
        const button = el.querySelector('[data-ref=operator]');
        const menu = button.nextElementSibling;
        button.click();
        await settle();
        assert.strictEqual(document.activeElement, el.querySelector('a[value=EQ]'), 'the menu borrowed the focus');

        menu.hidePopover();
        await settle();

        assert.strictEqual(document.activeElement, button, 'closing gives the focus back to the invoker');
        container.remove();
    });

    it('leaves the focus alone when a key lands on the menu itself, not on an item', async () => {
        const [el, container] = await mount(`<ful-filter-text name="f">t</ful-filter-text>`);
        const button = el.querySelector('[data-ref=operator]');
        const menu = button.nextElementSibling;
        button.click();
        await settle();
        const focused = document.activeElement;

        menu.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true }));

        assert.strictEqual(document.activeElement, focused, 'nothing moved');
        assert.strictEqual(button.getAttribute('value'), 'CONTAINS', 'nothing was picked either');
        container.remove();
    });
});

describe('Filter property access before rendering', () => {
    it('accepts an operators assignment on a filter that has not rendered yet', () => {
        const text = document.createElement('ful-filter-text');
        text.operators = ['GTE', 'EQ'];

        assert.deepStrictEqual(text.operators, ['GTE', 'EQ'], 'the whitelist is held until the menu exists');

        const bool = document.createElement('ful-filter-boolean');
        bool.operators = ['NEQ'];

        assert.deepStrictEqual(bool.operators, ['NEQ']);
    });
});

describe('BooleanFilter interactions', () => {
    const settle = async () => {
        for (let i = 0; i !== 10; ++i) {
            await tick();
        }
    };
    const mount = async (attrs = '') => {
        const container = document.createElement('div');
        container.innerHTML = `<ful-filter-boolean ${attrs} name="f">b</ful-filter-boolean>`;
        document.body.appendChild(container);
        const el = container.querySelector('ful-filter-boolean');
        await Rendering.waitFor(el);
        await settle();
        return [el, container];
    };

    it('keeps its tuple when a disabled filter is clicked', async () => {
        const [el, container] = await mount(`value='["EQ","true"]'`);
        const seen = [];
        el.addEventListener('change', (e) => seen.push(e.detail));
        el.disabled = true;
        assert.isTrue(el.disabled, 'the claim reads back');

        el.querySelector('a[value=NEQ]').click();
        el.querySelector('[data-ref=value]').nextElementSibling.querySelector('a[value=false]').click();

        assert.deepStrictEqual(el.value, ['EQ', 'true']);
        assert.deepStrictEqual(seen, []);
        container.remove();
    });

    it('ignores clicks that did not land on a dropdown item', async () => {
        const [el, container] = await mount(`value='["EQ","true"]'`);
        const seen = [];
        el.addEventListener('change', (e) => seen.push(e.detail));

        el.querySelector('label').click();
        el.querySelector('[data-ref=operator]').click();
        el.querySelector('[data-ref=value]').click();

        assert.deepStrictEqual(el.value, ['EQ', 'true']);
        assert.deepStrictEqual(seen, []);
        container.remove();
    });

    it('hands its focus to the value button', async () => {
        const [el, container] = await mount('');

        el.focus();

        assert.strictEqual(document.activeElement, el.querySelector('[data-ref=value]'));
        container.remove();
    });

    it('reports and clears a custom validity through the field error', async () => {
        const [el, container] = await mount('');

        el.setCustomValidity('pick one');

        assert.strictEqual(el.querySelector('ful-field-error').innerText, 'pick one');
        assert.strictEqual(el.internals.validationMessage, ' ');

        el.setCustomValidity('');

        assert.strictEqual(el.querySelector('ful-field-error').innerText, '');
        assert.strictEqual(el.internals.validationMessage, '');
        container.remove();
    });
});
