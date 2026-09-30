import { assert, expect } from 'chai';
import { Fragments } from '../../../src/ftl/index.mjs';
import { Bindings } from '../../../src/ful/index.mjs';
import { attached } from '../../harness.mjs';

describe('Bindings', () => {
    describe('flatten', () => {
        it('can flatten an empty object', () => {
            const got = Bindings.flatten({}, '', new Set());
            assert.deepEqual(got, {}, 'an object with no keys flattens to an empty object');
        });
        it('can flatten a flat object', () => {
            const got = Bindings.flatten({ a: 1, b: 2 }, '', new Set());
            assert.deepEqual(got, { a: 1, b: 2 }, 'top level keys are kept as they are, with no prefix');
        });
        it('can flatten a nested object', () => {
            const got = Bindings.flatten({ a: 1, b: { c: 2 } }, '', new Set());
            assert.deepEqual(got, { a: 1, 'b.c': 2 }, 'a nested key is flattened into a dotted path');
        });
        it('can flatten an array', () => {
            const got = Bindings.flatten({ a: [1, 2] }, '', new Set());
            assert.deepEqual(got, { 'a.0': 1, 'a.1': 2 }, 'array indexes become numeric segments of the dotted path');
        });
        it('objects are not flattened over stops', () => {
            const got = Bindings.flatten({ a: { b: { c: 1 } } }, '', new Set(['a.b']));
            assert.deepEqual(
                got,
                { 'a.b': { c: 1 } },
                'flatten does not descend below a key named in stops, keeping that object whole',
            );
        });
    });

    describe('providePath', () => {
        it('assigns null if value is undefined and property does not exist', () => {
            const result = Bindings.providePath({}, 'a.b', undefined);
            expect(result.a.b, 'an undefined value declares a missing path by setting it to null').to.be.null;
        });

        it('retains existing value if value is undefined but property already exists', () => {
            const result = Bindings.providePath({ a: { b: 'keep-me' } }, 'a.b', undefined);
            expect(result.a.b, 'an undefined value keeps an entry already on the path').to.equal('keep-me');
        });

        it('rebuilds a scalar left by an overlapping shorter name', () => {
            const result = Bindings.providePath({ a: 'scalar' }, 'a.b', 'v');
            assert.deepEqual(
                result,
                { a: { b: 'v' } },
                'a scalar left by a shorter name is replaced by a container so the longer name wins',
            );
        });

        it('rebuilds a null left by an empty overlapping shorter name', () => {
            const result = Bindings.providePath({ a: null }, 'a.b', 'v');
            assert.deepEqual(
                result,
                { a: { b: 'v' } },
                'a null left by a shorter name is replaced by a container so the longer name wins',
            );
        });

        it('keeps an array container, the reverse order replaces the container with the scalar', () => {
            const array = Bindings.providePath({ a: ['x'] }, 'a.1', 'v');
            assert.deepEqual(
                array,
                { a: ['x', 'v'] },
                'a numeric segment writes into an existing array, keeping its entries',
            );
            const scalar = Bindings.providePath({ a: { b: 'x' } }, 'a', 'v');
            assert.deepEqual(
                scalar,
                { a: 'v' },
                'the last segment is written as given, replacing the container it held',
            );
        });
    });

    describe('extractFrom', () => {
        it('extracts overlapping names without crashing, the later more specific one winning', () => {
            const el = Fragments.fromHtml(`
            <form>
                <input type="text" name="a" value="">
                <input type="text" name="a.b" value="v">
            </form>
        `);
            const got = Bindings.extractFrom(el.querySelector('form'));
            assert.deepEqual(
                got,
                { a: { b: 'v' } },
                'controls are read in document order, so the later longer name replaces the earlier scalar',
            );
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
            assert.deepEqual(got, { a: '1' }, 'a single select answers the value of its selected option');
        });
        it('extracts every selected option of a multiple select', () => {
            const el = Fragments.fromHtml(`
            <form>
                <select name="tags" multiple>
                    <option value="a" selected>A</option>
                    <option value="b">B</option>
                    <option value="c" selected>C</option>
                </select>
            </form>
        `);
            const got = Bindings.extractFrom(el.querySelector('form'));
            assert.deepEqual(got, { tags: ['a', 'c'] }, 'a multiple select answers the array of its selected values');
        });
        it('can extract value from an unchecked checkbox', () => {
            const el = Fragments.fromHtml(`
            <form>
                <input type="checkbox" name="a">
            </form>
        `);
            const got = Bindings.extractFrom(el.querySelector('form'));
            assert.deepEqual(
                got,
                { a: false },
                'a checkbox answers its checked state, so an unchecked one gives false',
            );
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
            assert.deepEqual(
                got,
                { a: '2' },
                'only the checked radio contributes its value, the unchecked ones answer undefined',
            );
        });
        it('can extract deeply nested values', () => {
            const el = Fragments.fromHtml(`
            <form>
                <input type="checkbox" name="a.b.c" checked>
            </form>
        `);
            const got = Bindings.extractFrom(el.querySelector('form'));
            assert.deepEqual(got, { a: { b: { c: true } } }, 'a dotted name builds one nested object per segment');
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
            assert.deepEqual(
                got,
                { a: { a: true, b: true, c: 'lorem ipsum' } },
                'names sharing a prefix are gathered under one nested object',
            );
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
            assert.deepEqual(got, {}, 'a control inside a disabled fieldset matches :disabled and is skipped');
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

            expect(
                result,
                'a control without a name and a disabled control are skipped, the submitter counts even while disabled',
            ).to.deep.equal({
                submitAction: 'save',
                active: 'included',
            });
        });
    });

    describe('mutateIn', () => {
        const formOf = (html) => Fragments.fromHtml(`<form>${html}</form>`).querySelector('form');

        it('assigns the whole selection of a multiple select, array or not', () => {
            const form = formOf(`
                <select name="tags" multiple>
                    <option value="a">A</option>
                    <option value="b">B</option>
                    <option value="c">C</option>
                </select>
            `);
            const selected = () => Array.from(form.querySelector('select').selectedOptions).map((o) => o.value);

            Bindings.mutateIn(form, { tags: ['a', 'c'] });
            assert.deepEqual(selected(), ['a', 'c'], 'an array selects each option whose value it lists');
            Bindings.mutateIn(form, { tags: 'b' });
            assert.deepEqual(selected(), ['b'], 'a scalar selects its one option and deselects the rest');
            Bindings.mutateIn(form, { tags: null });
            assert.deepEqual(selected(), [], 'null deselects every option');
        });

        it('checks the radio whose value matches, and reads it back', () => {
            const form = formOf(`
                <input type="radio" name="a" value="1">
                <input type="radio" name="a" value="2">
            `);
            Bindings.mutateIn(form, { a: '2' });
            assert.deepEqual(
                Bindings.extractFrom(form),
                { a: '2' },
                'the radio whose value equals the written one is checked',
            );
        });

        it('round trips boolean radios', () => {
            const form = formOf(`
                <input type="radio" name="a" value="true" data-ful-bind-type="boolean">
                <input type="radio" name="a" value="false" data-ful-bind-type="boolean">
            `);
            Bindings.mutateIn(form, { a: true });
            assert.deepEqual(
                Bindings.extractFrom(form),
                { a: true },
                'true checks the radio valued true and reads back as a boolean',
            );

            Bindings.mutateIn(form, { a: false });
            assert.deepEqual(
                Bindings.extractFrom(form),
                { a: false },
                'false checks the radio valued false and reads back as a boolean',
            );
        });

        it('matches radios whose value is not a string', () => {
            const form = formOf(`
                <input type="radio" name="a" value="1">
                <input type="radio" name="a" value="2">
            `);
            Bindings.mutateIn(form, { a: 2 });
            assert.deepEqual(
                Bindings.extractFrom(form),
                { a: '2' },
                'a number matches the radio whose value is its text',
            );
        });

        it('leaves boolean radios unchecked for a null value', () => {
            const form = formOf(`
                <input type="radio" name="a" value="true" data-ful-bind-type="boolean" checked>
                <input type="radio" name="a" value="false" data-ful-bind-type="boolean">
            `);
            Bindings.mutateIn(form, { a: null });
            assert.deepEqual(
                Bindings.extractFrom(form),
                { a: null },
                'null unchecks every radio, so none contributes and the name reads as null',
            );
        });

        it('round trips checkboxes and text inputs', () => {
            const form = formOf(`
                <input type="checkbox" name="a">
                <input type="text" name="b">
            `);
            Bindings.mutateIn(form, { a: true, b: 'x' });
            assert.deepEqual(
                Bindings.extractFrom(form),
                { a: true, b: 'x' },
                'a checkbox takes the value as its checked state and a text input as its value',
            );
        });
    });

    describe('errors', () => {
        let form, inputName, inputAge, customEl, fulErrors, fieldError;

        beforeEach(() => {
            form = document.createElement('form');
            attached(form);

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

            expect(inputName.validationMessage, 'every named control has its custom validity cleared first').to.equal(
                '',
            );
            expect(fulErrors.hasAttribute('hidden'), 'with no banner problem the banner is hidden').to.be.true;
            expect(fulErrors.innerText, 'with no banner problem the banner is emptied').to.equal('');
        });

        it('maps field errors and bracket notations, sorts :invalid elements, and focuses the highest one', () => {
            const errs = [
                { type: 'FIELD_ERROR', context: 'users[0].name', reason: 'Invalid name' },
                { type: 'INVALID_FORMAT', context: 'users.1.age', reason: 'Must be a number' },
                { type: 'FIELD_ERROR', context: 'custom.field', reason: 'Custom fail' },
            ];

            Bindings.errors(form, errs, true);

            expect(
                inputName.validationMessage,
                'a bracket context is turned into dots and pinned on the control of that name',
            ).to.equal('Invalid name');
            expect(
                inputAge.validationMessage,
                'an INVALID_FORMAT problem is pinned on its control like a FIELD_ERROR',
            ).to.equal('Must be a number');

            expect(
                document.activeElement === inputAge,
                'with scrollOnError the topmost invalid control is focused',
            ).to.equal(true);
            expect(
                fieldError.getAttribute('aria-live'),
                'the focus announces the error, a live region would repeat it',
            ).to.equal('off');
        });

        it('maps global errors to ful-errors container and shows it', () => {
            const errs = [
                { type: 'BUSINESS_RULE_VIOLATION', context: '', reason: 'Something went terribly wrong' },
                { type: 'GLOBAL', context: '', reason: 'Server unavailable' },
            ];

            Bindings.errors(form, errs, false);

            expect(fulErrors.hasAttribute('hidden'), 'a problem that is not pinned to a field reveals the banner').to.be
                .false;
            expect(fulErrors.innerText, 'the banner shows the reason of a problem with an empty context').to.include(
                'Something went terribly wrong',
            );
            expect(fulErrors.innerText, 'the banner shows every global reason, not only the first').to.include(
                'Server unavailable',
            );
        });

        it('announces politely when nothing takes the focus, loudly for global errors', () => {
            const errs = [
                { type: 'FIELD_ERROR', context: 'users.0.name', reason: 'Invalid name' },
                { type: 'GLOBAL', context: '', reason: 'Server unavailable' },
            ];

            Bindings.errors(form, errs, false);

            expect(fieldError.getAttribute('aria-live'), 'field errors are announced without focus').to.equal('polite');
            expect(fulErrors.getAttribute('role'), 'the global banner announces on its own').to.equal('alert');
        });

        it('keeps the alert role while clearing', () => {
            fulErrors.setAttribute('role', 'alert');
            fulErrors.innerText = 'old';

            Bindings.errors(form, [], false);

            expect(
                fulErrors.getAttribute('role'),
                'the banner keeps role alert even when cleared, ready for the next problem',
            ).to.equal('alert');
            expect(
                fieldError.getAttribute('aria-live'),
                'without scrollOnError field errors stay politely announced while clearing',
            ).to.equal('polite');
        });

        it('pins a deep context on the most specific field alone', () => {
            const composite = document.createElement('input');
            composite.name = 'users.0';
            form.append(composite);

            Bindings.errors(form, [{ type: 'FIELD_ERROR', context: 'users.0.name', reason: 'Invalid name' }], false);

            expect(inputName.validationMessage, 'the longest name matching the context takes the problem').to.equal(
                'Invalid name',
            );
            expect(composite.validationMessage, 'the outer field must not double the exact one').to.equal('');
        });

        it('falls back onto the composite owning the subtree when no exact field exists', () => {
            const composite = document.createElement('input');
            composite.name = 'owner';
            form.append(composite);

            Bindings.errors(form, [{ type: 'FIELD_ERROR', context: 'owner.firstName', reason: 'Required' }], false);

            expect(
                composite.validationMessage,
                'with no exact field the composite named for a prefix of the context catches the problem',
            ).to.equal('Required');
            expect(fulErrors.hasAttribute('hidden'), 'a caught error stays off the banner').to.be.true;
        });

        it('hands the composite the inner path, and the exact match an empty one', () => {
            const calls = [];
            const composite = document.createElement('input');
            composite.setAttribute('name', 'owner');
            composite.setCustomValidity = (reason, context) => calls.push([reason, context]);
            form.append(composite);

            Bindings.errors(
                form,
                [
                    { type: 'FIELD_ERROR', context: 'owner.name.first', reason: 'Required' },
                    { type: 'FIELD_ERROR', context: 'users.0.name', reason: 'Invalid name' },
                ],
                false,
            );

            expect(
                calls,
                'the composite is cleared first, then gets the reason with the rest of the path below its name',
            ).to.deep.equal([
                ['', undefined],
                ['Required', 'name.first'],
            ]);
            expect(inputName.validationMessage, 'the exact match routes nowhere deeper').to.equal('Invalid name');
        });

        it('reveals the banner before filling it, so a screen reader announces the text', () => {
            fulErrors.setAttribute('hidden', '');
            const observer = new MutationObserver(() => {});
            observer.observe(fulErrors, { attributes: true, childList: true, characterData: true, subtree: true });

            Bindings.errors(form, [{ type: 'GLOBAL', context: '', reason: 'Server unavailable' }], false);

            const records = observer.takeRecords();
            observer.disconnect();
            const revealed = records.findIndex((r) => r.type === 'attributes' && r.attributeName === 'hidden');
            const filled = records.findIndex((r) => r.type === 'childList' || r.type === 'characterData');
            expect(revealed, 'the banner loses its hidden attribute').to.not.equal(-1);
            expect(filled, 'the banner receives the reason text').to.not.equal(-1);
            expect(
                revealed,
                'the banner is revealed before its text is written, so a screen reader announces the text',
            ).to.be.lessThan(filled);
        });

        it('shows a field error naming no field in the banner instead of dropping it', () => {
            Bindings.errors(form, [{ type: 'FIELD_ERROR', context: 'ghost.field', reason: 'Nowhere to pin' }], false);

            expect(fulErrors.hasAttribute('hidden'), 'a field problem naming no control reveals the banner').to.be
                .false;
            expect(
                fulErrors.innerText,
                'a field problem naming no control is shown in the banner rather than dropped',
            ).to.include('Nowhere to pin');
        });

        it('does not focus anything if scrollOnError is false', () => {
            const errs = [{ type: 'FIELD_ERROR', context: 'users.0.name', reason: 'Invalid name' }];

            document.activeElement?.blur();
            const activeBefore = document.activeElement;

            Bindings.errors(form, errs, false);

            expect(
                inputName.validationMessage,
                'the problem is still pinned on its field without scrollOnError',
            ).to.equal('Invalid name');
            expect(
                document.activeElement === activeBefore,
                'without scrollOnError the focus is left where it was',
            ).to.equal(true);
        });
    });
});
describe('Bindings.providePath prototype safety', () => {
    it('refuses a segment that would reach the prototype chain', () => {
        for (const path of [
            '__proto__.polluted',
            'a.__proto__.polluted',
            'constructor.prototype.polluted',
            'prototype.polluted',
        ]) {
            assert.throws(
                () => Bindings.providePath({}, path, 'yes'),
                /unsupported name segment/,
                `${path} is refused because one of its segments reaches the prototype chain`,
            );
        }
        assert.isUndefined(/** @type any */ ({}).polluted, 'nothing reached Object.prototype');
    });

    it('refuses before writing anything, leaving the result untouched', () => {
        const result = { kept: 'value' };
        assert.throws(
            () => Bindings.providePath(result, 'a.__proto__.x', 'boom'),
            /unsupported name segment/,
            'a forbidden segment deeper in the path is refused too',
        );
        assert.deepEqual(
            result,
            { kept: 'value' },
            'the segments are checked before anything is written, so the result is untouched',
        );
    });

    it('does not refuse a name that merely contains a forbidden word', () => {
        const result = Bindings.providePath({}, 'prototypes.my__proto__key', 'fine');
        assert.deepEqual(
            result,
            { prototypes: { my__proto__key: 'fine' } },
            'only a whole segment equal to a forbidden word is refused',
        );
    });

    it('refuses through the form extraction too', () => {
        const form = document.createElement('form');
        const input = document.createElement('input');
        input.setAttribute('name', '__proto__.polluted');
        input.value = 'yes';
        form.appendChild(input);
        assert.throws(
            () => Bindings.extractFrom(form),
            /unsupported name segment/,
            'extractFrom writes through providePath, so a control named with a forbidden segment is refused',
        );
        assert.isUndefined(/** @type any */ ({}).polluted, 'nothing reached Object.prototype');
    });
});

describe('Bindings.providePath array segments', () => {
    it('builds arrays out of numeric segments', () => {
        const result = Bindings.providePath({}, 'rows.0.name', 'first');
        assert.deepEqual(result, { rows: [{ name: 'first' }] }, 'a numeric segment makes its container an array');
    });

    it('builds an array at the root of a null result', () => {
        const result = Bindings.providePath(null, '0.name', 'root');
        assert.deepEqual(
            result,
            [{ name: 'root' }],
            'a numeric first segment on a null result answers a new root array',
        );
    });

    it('appends to an array path without touching earlier entries', () => {
        const result = Bindings.providePath({}, 'rows.0.name', 'first');
        Bindings.providePath(result, 'rows.1.name', 'second');
        assert.deepEqual(
            result.rows,
            [{ name: 'first' }, { name: 'second' }],
            'a later index is added to the existing array, the earlier entry kept',
        );
    });
});

describe('Bindings.extract boolean type', () => {
    it('decodes a boolean bind type on a plain input', () => {
        const fragment = Fragments.fromHtml(
            `<form><input type="text" value="true" data-ful-bind-type="boolean"></form>`,
        );
        const el = fragment.querySelector('input');
        assert.strictEqual(Bindings.extract(el), true, 'the boolean bind type decodes the text true as true');

        el.value = 'false';
        assert.strictEqual(
            Bindings.extract(el),
            false,
            'the boolean bind type decodes any other non blank text as false',
        );

        el.value = '';
        assert.isNull(Bindings.extract(el), 'an empty value carries no boolean');
    });
});
