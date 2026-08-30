import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';

registry.plugin(new Plugin()).configure();

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

        assert.strictEqual(el.querySelector('[data-ref=value]').value, 'ab');
        assert.deepEqual(el.value, ['STARTS_WITH', 'IGNORE_CASE', 'ab']);
        container.remove();
    });

    it('picks up a value attribute set after rendering', async () => {
        const [el, container] = await mount(`<ful-filter-text>t</ful-filter-text>`);

        el.setAttribute('value', JSON.stringify(['EQ', 'IGNORE_CASE', 'zz']));

        assert.strictEqual(el.querySelector('[data-ref=value]').value, 'zz');
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

        const input = el.querySelector('[data-ref=value]');
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

    it('relabels the operator button with the chosen item', async () => {
        const [el, container] = await mount(
            `<ful-filter-local-date value='["EQ","2024-01-01"]'>d</ful-filter-local-date>`,
        );
        const button = el.querySelector('[data-ref=operator]');
        const item = el.querySelector('a[value=GTE]');

        item.click();

        assert.strictEqual(button.getAttribute('value'), 'GTE');
        assert.strictEqual(button.innerHTML, item.innerHTML, 'the button shows the chosen glyph');
        assert.deepEqual(el.value, ['GTE', '2024-01-01'], 'and the tuple carries the chosen operator');
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
                button.innerHTML,
                el.querySelector(`a[value=${operator}]`).innerHTML,
                'the button shows the glyph of the operator in force, not the template default',
            );
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

            el.disabled = true;
            assert.isTrue(first.hasAttribute('disabled'), 'first operand');
            assert.isTrue(second.hasAttribute('disabled'), 'second operand');
            assert.isTrue(el.disabled, 'and the element reads its own state back');

            el.disabled = false;
            assert.isFalse(first.hasAttribute('disabled'), 'first operand');
            assert.isFalse(second.hasAttribute('disabled'), 'second operand');
            assert.isFalse(el.disabled);
            container.remove();
        });
    }
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

        el.querySelector('[data-ref=value]').value = 'ab';

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
