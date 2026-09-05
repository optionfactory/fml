import { assert, expect } from 'chai';
import { Fragments } from '../../../src/ftl/index.mjs';
import { Bindings } from '../../../src/ful/index.mjs';

describe('Bindings', () => {
    describe('flatten', () => {
        it('can flatten an empty object', () => {
            const got = Bindings.flatten({}, '', new Set());
            assert.deepEqual(got, {});
        });
        it('can flatten a flat object', () => {
            const got = Bindings.flatten({ a: 1, b: 2 }, '', new Set());
            assert.deepEqual(got, { a: 1, b: 2 });
        });
        it('can flatten a nested object', () => {
            const got = Bindings.flatten({ a: 1, b: { c: 2 } }, '', new Set());
            assert.deepEqual(got, { a: 1, 'b.c': 2 });
        });
        it('can flatten an array', () => {
            const got = Bindings.flatten({ a: [1, 2] }, '', new Set());
            assert.deepEqual(got, { 'a.0': 1, 'a.1': 2 });
        });
        it('objects are not flattened over stops', () => {
            const got = Bindings.flatten({ a: { b: { c: 1 } } }, '', new Set(['a.b']));
            assert.deepEqual(got, { 'a.b': { c: 1 } });
        });
    });

    describe('providePath', () => {
        it('assigns null if value is undefined and property does not exist', () => {
            const result = Bindings.providePath({}, 'a.b', undefined);
            expect(result.a.b).to.be.null;
        });

        it('retains existing value if value is undefined but property already exists', () => {
            const result = Bindings.providePath({ a: { b: 'keep-me' } }, 'a.b', undefined);
            expect(result.a.b).to.equal('keep-me');
        });
    });

    describe('extractFrom', () => {
        it('can extract value from an input text', () => {
            const el = Fragments.fromHtml(`
            <form>
                <input type="text" name="a" value="1">
            </form>
        `);
            const got = Bindings.extractFrom(el.querySelector('form'));
            assert.deepEqual(got, { a: '1' });
        });
        it('can extract value from a select', () => {
            const el = Fragments.fromHtml(`
            <form>
                <select name="a">
                    <option value="nope">NO</option>
                    <option value="1" selected>YES</option>
                </select>
            </form>
        `);
            const got = Bindings.extractFrom(el.querySelector('form'));
            assert.deepEqual(got, { a: '1' });
        });
        it('can extract value from an unchecked checkbox', () => {
            const el = Fragments.fromHtml(`
            <form>
                <input type="checkbox" name="a">
            </form>
        `);
            const got = Bindings.extractFrom(el.querySelector('form'));
            assert.deepEqual(got, { a: false });
        });
        it('can extract value from an checked checkbox', () => {
            const el = Fragments.fromHtml(`
            <form>
                <input type="checkbox" name="a" checked>
            </form>
        `);
            const got = Bindings.extractFrom(el.querySelector('form'));
            assert.deepEqual(got, { a: true });
        });
        it('can extract value from an checked radio button', () => {
            const el = Fragments.fromHtml(`
            <form>
                <input type="radio" name="a" value="1">
                <input type="radio" name="a" value="2" checked="checked">
                <input type="radio" name="a" value="3">
            </form>
        `);
            const got = Bindings.extractFrom(el.querySelector('form'));
            assert.deepEqual(got, { a: '2' });
        });
        it('can extract deeply nested values', () => {
            const el = Fragments.fromHtml(`
            <form>
                <input type="checkbox" name="a.b.c" checked>
            </form>
        `);
            const got = Bindings.extractFrom(el.querySelector('form'));
            assert.deepEqual(got, { a: { b: { c: true } } });
        });
        it('can extract all values from a container', () => {
            const el = Fragments.fromHtml(`
            <form>
                <input type="checkbox" name="a.a" checked>
                <input type="checkbox" name="a.b" checked>
                <input type="text" name="a.c" value="lorem ipsum">
            </form>
        `);
            const got = Bindings.extractFrom(el.querySelector('form'));
            assert.deepEqual(got, { a: { a: true, b: true, c: 'lorem ipsum' } });
        });
        it('tags with disabled are ignored', () => {
            const el = Fragments.fromHtml(`
            <form>
                <input type="checkbox" name="a.a" checked disabled>
            </form>
        `);
            const got = Bindings.extractFrom(el.querySelector('form'));
            assert.deepEqual(got, {});
        });
        it('tags children of a disabled fieldset are ignored', () => {
            const el = Fragments.fromHtml(`
            <form>
                <fieldset disabled>
                    <input type="checkbox" name="a.a" checked>
                </fieldset>
            </form>
        `);
            const got = Bindings.extractFrom(el.querySelector('form'));
            assert.deepEqual(got, {});
        });
        it('skips elements without names and disabled elements unless it is the submitter', () => {
            const form = document.createElement('form');

            const noName = document.createElement('input');
            noName.value = 'ignored';
            form.appendChild(noName);

            const disabledInput = document.createElement('input');
            disabledInput.name = 'skipped';
            disabledInput.value = 'ignored';
            disabledInput.disabled = true;
            form.appendChild(disabledInput);

            const submitter = document.createElement('button');
            submitter.name = 'submitAction';
            submitter.value = 'save';
            submitter.disabled = true;
            form.appendChild(submitter);

            const valid = document.createElement('input');
            valid.name = 'active';
            valid.value = 'included';
            form.appendChild(valid);

            const result = Bindings.extractFrom(form, submitter);

            expect(result).to.deep.equal({
                submitAction: 'save',
                active: 'included'
            });
        });

    });
    
    describe('mutateIn', () => {
        const formOf = (html) => Fragments.fromHtml(`<form>${html}</form>`).querySelector('form');

        it('checks the radio matching the value', () => {
            const form = formOf(`
                <input type="radio" name="a" value="1">
                <input type="radio" name="a" value="2">
            `);
            Bindings.mutateIn(form, { a: '2' });
            assert.deepEqual(Bindings.extractFrom(form), { a: '2' });
        });

        it('round trips boolean radios', () => {
            const form = formOf(`
                <input type="radio" name="a" value="true" data-ful-bind-type="boolean">
                <input type="radio" name="a" value="false" data-ful-bind-type="boolean">
            `);
            Bindings.mutateIn(form, { a: true });
            assert.deepEqual(Bindings.extractFrom(form), { a: true });

            Bindings.mutateIn(form, { a: false });
            assert.deepEqual(Bindings.extractFrom(form), { a: false });
        });

        it('matches radios whose value is not a string', () => {
            const form = formOf(`
                <input type="radio" name="a" value="1">
                <input type="radio" name="a" value="2">
            `);
            Bindings.mutateIn(form, { a: 2 });
            assert.deepEqual(Bindings.extractFrom(form), { a: '2' });
        });

        it('leaves boolean radios unchecked for a null value', () => {
            const form = formOf(`
                <input type="radio" name="a" value="true" data-ful-bind-type="boolean" checked>
                <input type="radio" name="a" value="false" data-ful-bind-type="boolean">
            `);
            Bindings.mutateIn(form, { a: null });
            assert.deepEqual(Bindings.extractFrom(form), { a: null });
        });

        it('round trips checkboxes and text inputs', () => {
            const form = formOf(`
                <input type="checkbox" name="a">
                <input type="text" name="b">
            `);
            Bindings.mutateIn(form, { a: true, b: 'x' });
            assert.deepEqual(Bindings.extractFrom(form), { a: true, b: 'x' });
        });
    });

    describe('errors', () => {
        let form, inputName, inputAge, customEl, fulErrors, fieldError;

        beforeEach(() => {
            form = document.createElement('form');
            document.body.appendChild(form);

            inputName = document.createElement('input');
            inputName.name = 'users.0.name';

            inputAge = document.createElement('input');
            inputAge.name = 'users.1.age';

            customEl = document.createElement('div');
            customEl.setAttribute('name', 'custom.field');

            fulErrors = document.createElement('ful-errors');

            fieldError = document.createElement('ful-field-error');

            form.append(inputName, inputAge, customEl, fulErrors, fieldError);

            inputName.getBoundingClientRect = () => ({ y: 50 });
            inputAge.getBoundingClientRect = () => ({ y: 20 });
        });

        afterEach(() => {
            form.remove();
        });

        it('clears all errors when empty array is passed', () => {
            inputName.setCustomValidity('Bad');
            fulErrors.innerText = 'Global error';
            fulErrors.removeAttribute('hidden');

            Bindings.errors(form, [], true);

            expect(inputName.validationMessage).to.equal('');
            expect(fulErrors.hasAttribute('hidden')).to.be.true;
            expect(fulErrors.innerText).to.equal('');
        });

        it('maps field errors and bracket notations, sorts :invalid elements, and focuses the highest one', () => {
            const errs = [
                { type: 'FIELD_ERROR', context: 'users[0].name', reason: 'Invalid name' },
                { type: 'INVALID_FORMAT', context: 'users.1.age', reason: 'Must be a number' },
                { type: 'FIELD_ERROR', context: 'custom.field', reason: 'Custom fail' }
            ];

            Bindings.errors(form, errs, true);

            expect(inputName.validationMessage).to.equal('Invalid name');
            expect(inputAge.validationMessage).to.equal('Must be a number');

            expect(document.activeElement).to.equal(inputAge);
            expect(fieldError.getAttribute('aria-live')).to.equal('off', 'the focus announces the error, a live region would repeat it');
        });

        it('maps global errors to ful-errors container and shows it', () => {
            const errs = [
                { type: 'BUSINESS_RULE_VIOLATION', context: '', reason: 'Something went terribly wrong' },
                { type: 'GLOBAL', context: '', reason: 'Server unavailable' }
            ];

            Bindings.errors(form, errs, false);

            expect(fulErrors.hasAttribute('hidden')).to.be.false;
            expect(fulErrors.innerText).to.include('Something went terribly wrong');
            expect(fulErrors.innerText).to.include('Server unavailable');
        });

        it('announces politely when nothing takes the focus, loudly for global errors', () => {
            const errs = [
                { type: 'FIELD_ERROR', context: 'users.0.name', reason: 'Invalid name' },
                { type: 'GLOBAL', context: '', reason: 'Server unavailable' },
            ];

            Bindings.errors(form, errs, false);

            expect(fieldError.getAttribute('aria-live')).to.equal('polite', 'field errors are announced without focus');
            expect(fulErrors.getAttribute('role')).to.equal('alert', 'the global banner announces on its own');
        });

        it('keeps the alert role while clearing', () => {
            fulErrors.setAttribute('role', 'alert');
            fulErrors.innerText = 'old';

            Bindings.errors(form, [], false);

            expect(fulErrors.getAttribute('role')).to.equal('alert');
            expect(fieldError.getAttribute('aria-live')).to.equal('polite');
        });

        it('does not focus anything if scrollOnError is false', () => {
            const errs = [{ type: 'FIELD_ERROR', context: 'users.0.name', reason: 'Invalid name' }];

            document.activeElement?.blur();
            const activeBefore = document.activeElement;

            Bindings.errors(form, errs, false);

            expect(inputName.validationMessage).to.equal('Invalid name');
            expect(document.activeElement).to.equal(activeBefore);
        });
    });
});
describe('Bindings.providePath array segments', () => {
    it('builds arrays out of numeric segments', () => {
        const result = Bindings.providePath({}, 'rows.0.name', 'first');
        assert.deepEqual(result, { rows: [{ name: 'first' }] });
    });

    it('builds an array at the root of a null result', () => {
        const result = Bindings.providePath(null, '0.name', 'root');
        assert.deepEqual(result, [{ name: 'root' }]);
    });

    it('appends to an array path without touching earlier entries', () => {
        const result = Bindings.providePath({}, 'rows.0.name', 'first');
        Bindings.providePath(result, 'rows.1.name', 'second');
        assert.deepEqual(result.rows, [{ name: 'first' }, { name: 'second' }]);
    });
});

describe('Bindings.extract boolean type', () => {
    it('decodes a boolean bind type on a plain input', () => {
        const fragment = Fragments.fromHtml(`<form><input type="text" value="true" data-ful-bind-type="boolean"></form>`);
        const el = fragment.querySelector('input');
        assert.strictEqual(Bindings.extract(el), true);

        el.value = 'false';
        assert.strictEqual(Bindings.extract(el), false);

        el.value = '';
        assert.isNull(Bindings.extract(el), 'an empty value carries no boolean');
    });
});
