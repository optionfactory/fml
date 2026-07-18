import { assert, expect } from '@esm-bundle/chai';
import { Fragments } from '../../src/ftl/index.mjs';
import { Bindings } from '../../src/ful/index.mjs';

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
    
    describe('errors', () => {
        let form, inputName, inputAge, customEl, fulErrors;

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

            form.append(inputName, inputAge, customEl, fulErrors);

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