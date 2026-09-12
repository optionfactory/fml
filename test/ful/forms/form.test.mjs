import { tick } from '../../tick.mjs';
import { assert } from 'chai';
import { Failure } from '../../../src/httpc/index.mjs';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { AsyncEvents, FormLoader, Plugin } from '../../../src/ful/index.mjs';
import { appended } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

describe('Form Spinner Button States', () => {
    it('should preserve intentionally disabled button states after the form spinner unspins', async () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <ful-form>
                <button type="submit" id="btn-enabled">Submit</button>
                <button type="submit" id="btn-disabled" disabled>Locked Submitter</button>
            </ful-form>
        `;
        document.body.appendChild(container);

        // FIX: Allow custom element parsing and child transitions to settle
        await tick();

        const fulForm = container.querySelector('ful-form');
        const btnEnabled = fulForm.querySelector('#btn-enabled');
        const btnDisabled = fulForm.querySelector('#btn-disabled');

        fulForm.spinner(true);
        assert.strictEqual(btnEnabled.disabled, true);
        assert.strictEqual(btnDisabled.disabled, true);

        fulForm.spinner(false);
        assert.strictEqual(btnEnabled.disabled, false);
        assert.strictEqual(btnDisabled.disabled, true);

        assert.strictEqual(btnEnabled.dataset.wasDisabled, undefined);
        assert.strictEqual(btnDisabled.dataset.wasDisabled, undefined);

    });

    it('leaves a button that joined mid-spin on its authored state', async () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <ful-form>
                <button type="submit" id="btn-enabled">Submit</button>
            </ful-form>
        `;
        document.body.appendChild(container);
        await tick();

        const fulForm = container.querySelector('ful-form');
        fulForm.spinner(true);
        const latecomer = document.createElement('button');
        latecomer.type = 'submit';
        latecomer.disabled = true;
        latecomer.textContent = 'joined disabled';
        fulForm.querySelector('form').appendChild(latecomer);

        fulForm.spinner(false);

        assert.isFalse(fulForm.querySelector('#btn-enabled').disabled, 'the saved one restores');
        assert.isTrue(latecomer.disabled, 'the latecomer keeps its authored state');

    });
});
describe('Form Spinner Button States across overlapping submits', () => {
    it('drops a submit while one is in flight, re-arming once it settles', async () => {
        const releases = [];
        registry.defineComponent('loaders:form', {
            create: () => ({
                prepare: async (v) => v,
                submit: () => new Promise((resolve) => releases.push(resolve)),
                transform: async (r) => r,
            }),
        });
        const container = document.createElement('div');
        container.innerHTML = `
            <ful-form>
                <ful-spinner hidden></ful-spinner>
                <button type="submit" id="btn-enabled">Submit</button>
                <button type="submit" id="btn-disabled" disabled>Locked Submitter</button>
            </ful-form>
        `;
        document.body.appendChild(container);
        await tick();

        const fulForm = container.querySelector('ful-form');
        const spinner = fulForm.querySelector('ful-spinner');
        const btnEnabled = fulForm.querySelector('#btn-enabled');
        const btnDisabled = fulForm.querySelector('#btn-disabled');

        const first = fulForm.submit();
        const second = fulForm.submit();
        assert.strictEqual(spinner.hidden, false, 'the spinner is shown while submitting');
        assert.strictEqual(btnEnabled.disabled, true);
        assert.strictEqual(btnDisabled.disabled, true);

        //the first submit reaches the loader, the re-entrant one is dropped
        //before extraction: a write must not double behind a racing gesture
        for (let i = 0; i !== 20; ++i) {
            await tick();
        }
        assert.strictEqual(releases.length, 1, 'one exchange at a time');
        await second;
        assert.strictEqual(spinner.hidden, false, 'the dropped submit owns no chrome');

        releases[0]();
        await first;
        assert.strictEqual(spinner.hidden, true);
        assert.strictEqual(btnEnabled.disabled, false);
        assert.strictEqual(btnDisabled.disabled, true, 'an intentionally disabled button stays disabled');
        assert.isUndefined(btnEnabled.dataset.wd);
        assert.isUndefined(btnDisabled.dataset.wd);

        //the settled exchange re-arms the form: a later submit travels again
        fulForm.submit();
        for (let i = 0; i !== 20; ++i) {
            await tick();
        }
        assert.strictEqual(releases.length, 2, 'the form submits again once settled');
        releases[1]();
    });
});

const mount = async (html) => {
    const container = appended(html);
    await Rendering.waitFor(container);
    return [container.querySelector('ful-form'), container];
};

const stubLoader = (loader) => {
    registry.defineComponent('loaders:form', { create: () => loader });
};

const recording = (form, ...types) => {
    const seen = [];
    for (const t of types) {
        form.addEventListener(t, (e) => seen.push({ type: t, detail: e.detail }));
    }
    return seen;
};

describe('Form submit outcome events', () => {
    let warns;
    let originalWarn;
    beforeEach(() => {
        originalWarn = console.warn;
        warns = [];
        console.warn = (...args) => warns.push(args);
    });
    afterEach(() => {
        console.warn = originalWarn;
    });

    it('announces a successful submit with the submitted values and the transformed response', async () => {
        stubLoader({
            prepare: async (v) => v,
            submit: async () => ({ id: 7 }),
            transform: async (r) => ({ ...r, transformed: true }),
        });
        const [form] = await mount(`<ful-form><input name="name" value="ann"></ful-form>`);
        const events = recording(form, 'submit:success', 'submit:failure');

        await form.submit();

        assert.deepStrictEqual(
            events.map((e) => e.type),
            ['submit:success'],
        );
        assert.deepStrictEqual(events[0].detail.values, { name: 'ann' });
        assert.deepStrictEqual(events[0].detail.response, { id: 7, transformed: true });
    });

    it('reports a failed submit as an event instead of rejecting the caller', async () => {
        const boom = new Error('boom');
        stubLoader({
            prepare: async (v) => v,
            submit: async () => {
                throw boom;
            },
            transform: async (r) => r,
        });
        const [form] = await mount(`<ful-form><input name="name" value="ann"></ful-form>`);
        const events = recording(form, 'submit:success', 'submit:failure');

        await form.submit();

        assert.deepStrictEqual(
            events.map((e) => e.type),
            ['submit:failure'],
        );
        assert.strictEqual(events[0].detail.exception, boom);
        assert.deepStrictEqual(events[0].detail.values, { name: 'ann' });
        assert.isTrue(warns.some((args) => String(args[0]).includes('failed to submit form')));
    });

    it('shows a Failure problem on the field it names and the rest in ful-errors', async () => {
        stubLoader({
            prepare: async (v) => v,
            submit: async () => {
                throw new Failure('invalid', [
                    { type: 'FIELD_ERROR', context: 'name', reason: 'must not be blank' },
                    { type: 'GENERIC_ERROR', reason: 'the whole thing is wrong' },
                ]);
            },
            transform: async (r) => r,
        });
        const [form] = await mount(`
            <ful-form>
                <ful-errors hidden></ful-errors>
                <input name="name">
            </ful-form>`);

        await form.submit();

        const input = form.querySelector('input[name=name]');
        const errors = form.querySelector('ful-errors');
        assert.strictEqual(input.validationMessage, 'must not be blank');
        assert.strictEqual(errors.textContent, 'the whole thing is wrong');
        assert.isFalse(errors.hasAttribute('hidden'));
    });

    it('shows a field problem carrying no context in the banner instead of crashing', async () => {
        stubLoader({
            prepare: async (v) => v,
            submit: async () => {
                throw new Failure('invalid', [
                    { type: 'FIELD_ERROR', context: null, reason: 'an unnamed problem' },
                    { type: 'FIELD_ERROR', context: 'name', reason: 'must not be blank' },
                ]);
            },
            transform: async (r) => r,
        });
        const [form] = await mount(`
            <ful-form>
                <ful-errors hidden></ful-errors>
                <input name="name">
            </ful-form>`);

        await form.submit();

        assert.strictEqual(
            form.querySelector('input[name=name]').validationMessage,
            'must not be blank',
            'the named problem still reaches its field',
        );
        const errors = form.querySelector('ful-errors');
        assert.strictEqual(errors.textContent, 'an unnamed problem');
        assert.isFalse(errors.hasAttribute('hidden'));
    });

    it('shows a field problem with an empty context in the banner, as a null one', async () => {
        stubLoader({
            prepare: async (v) => v,
            submit: async () => {
                throw new Failure('invalid', [{ type: 'FIELD_ERROR', context: '', reason: 'an unnamed problem' }]);
            },
            transform: async (r) => r,
        });
        const [form] = await mount(`
            <ful-form>
                <ful-errors hidden></ful-errors>
                <input name="name">
            </ful-form>`);

        await form.submit();

        const errors = form.querySelector('ful-errors');
        assert.strictEqual(errors.textContent, 'an unnamed problem');
        assert.isFalse(errors.hasAttribute('hidden'));
    });

    it('clears the problems of the previous attempt when submitting again', async () => {
        let fail = true;
        stubLoader({
            prepare: async (v) => v,
            submit: async () => {
                if (fail) {
                    throw new Failure('invalid', [
                        { type: 'FIELD_ERROR', context: 'name', reason: 'must not be blank' },
                        { type: 'GENERIC_ERROR', reason: 'the whole thing is wrong' },
                    ]);
                }
                return {};
            },
            transform: async (r) => r,
        });
        const [form] = await mount(`
            <ful-form>
                <ful-errors hidden></ful-errors>
                <input name="name">
            </ful-form>`);
        await form.submit();
        assert.strictEqual(form.querySelector('input[name=name]').validationMessage, 'must not be blank');

        fail = false;
        await form.submit();

        assert.strictEqual(form.querySelector('input[name=name]').validationMessage, '');
        assert.strictEqual(form.querySelector('ful-errors').textContent, '');
        assert.isTrue(form.querySelector('ful-errors').hasAttribute('hidden'));
    });

    it('does not reach the loader nor announce an outcome when the submit event is cancelled', async () => {
        const submitted = [];
        stubLoader({
            prepare: async (v) => v,
            submit: async (request) => {
                submitted.push(request);
                return {};
            },
            transform: async (r) => r,
        });
        const [form] = await mount(`<ful-form><input name="name" value="ann"></ful-form>`);
        const events = recording(form, 'submit:success', 'submit:failure', 'submit:requested');
        form.addEventListener('submit', (e) => e.preventDefault());

        await form.submit();

        assert.deepStrictEqual(submitted, []);
        assert.deepStrictEqual(events, []);
    });
});

describe('Form submitted values', () => {
    it('includes the clicked submitter and no other button, despite the spinner disabling them', async () => {
        const submitted = [];
        stubLoader({
            prepare: async (v) => v,
            submit: async (request) => {
                submitted.push(request);
                return {};
            },
            transform: async (r) => r,
        });
        const [form] = await mount(`
            <ful-form>
                <input name="name" value="ann">
                <button type="submit" name="action" value="save" id="save">save</button>
                <button type="submit" name="action" value="delete" id="delete">delete</button>
            </ful-form>`);

        const done = new Promise((resolve) => form.addEventListener('submit:success', resolve, { once: true }));
        form.querySelector('#save').click();
        await done;

        assert.deepStrictEqual(submitted, [{ name: 'ann', action: 'save' }]);
    });

    it('round-trips nested values through the values property, empty fields reading back as null', async () => {
        const [form] = await mount(`
            <ful-form>
                <input name="user.name">
                <input name="user.age">
                <input name="note">
            </ful-form>`);

        form.values = { user: { name: 'ann', age: '7' } };

        assert.deepStrictEqual(form.values, { user: { name: 'ann', age: '7' }, note: null });
    });
});

describe('Form loader selection', () => {
    let http;
    let originalHttp;
    beforeEach(() => {
        registry.defineComponent('loaders:form', FormLoader);
        registry.defineComponent('mappers:request', (values) => ({ wrapped: values }));
        registry.defineComponent('mappers:response', (response) => ({ mapped: response }));
        originalHttp = registry.component('http-client');
        http = [];
        registry.defineComponent('http-client', {
            request: (method, url) => ({
                json: (body) => ({
                    fetch: async () => {
                        http.push({ method, url, body });
                        return { id: 7 };
                    },
                }),
            }),
        });
    });
    afterEach(() => {
        registry.defineComponent('http-client', originalHttp);
    });

    it('answers a form without an action with whatever the submit:requested listener resolves', async () => {
        const [form] = await mount(`
            <ful-form request-mapper="mappers:request" response-mapper="mappers:response">
                <input name="name" value="ann">
            </ful-form>`);
        AsyncEvents.asyncOn(form, 'submit:requested', async (e) => ({ echoed: e.detail.request }));
        const events = recording(form, 'submit:success', 'submit:failure');

        await form.submit();

        assert.deepStrictEqual(http, [], 'a form without an action never goes over http');
        assert.deepStrictEqual(
            events.map((e) => e.type),
            ['submit:success'],
        );
        assert.deepStrictEqual(events[0].detail.response, { mapped: { echoed: { wrapped: { name: 'ann' } } } });
    });

    it('posts the mapped request to the action and maps the response back', async () => {
        const [form] = await mount(`
            <ful-form action="/api/save" request-mapper="mappers:request" response-mapper="mappers:response">
                <input name="name" value="ann">
            </ful-form>`);
        const events = recording(form, 'submit:success', 'submit:failure');

        await form.submit();

        assert.deepStrictEqual(http, [{ method: 'POST', url: '/api/save', body: { wrapped: { name: 'ann' } } }]);
        assert.deepStrictEqual(
            events.map((e) => e.type),
            ['submit:success'],
        );
        assert.deepStrictEqual(events[0].detail.response, { mapped: { id: 7 } });
    });

    it('honours the method attribute of a remote form', async () => {
        const [form] = await mount(`<ful-form action="/api/save" method="PUT"></ful-form>`);

        await form.submit();

        assert.deepStrictEqual(http, [{ method: 'PUT', url: '/api/save', body: {} }]);
    });
});

describe('Form reset and validity', () => {
    it('restores the fields to the values they were rendered with', async () => {
        const [form] = await mount(`<ful-form><input name="name" value="ann"></ful-form>`);
        form.values = { name: 'bob' };
        assert.deepStrictEqual(form.values, { name: 'bob' });

        form.reset();

        assert.deepStrictEqual(form.values, { name: 'ann' });
    });

    describe('restores every field kind through its own value semantics', () => {
        beforeEach(() => {
            registry.defineComponent('loaders:select', {
                create: () => ({
                    prefetch: async () => {},
                    load: async () => [],
                    exact: async (...k) => k.map((v) => ({ key: v, label: v })),
                }),
            });
        });
        const mountFields = async (inner) => {
            const [form, container] = await mount(`<ful-form>${inner}</ful-form>`);
            for (let i = 0; i !== 20; ++i) {
                await tick();
            }
            return [form, container];
        };
        const cases = [
            ['ful-input', `<ful-input name="a" value="x">l</ful-input>`, 'y', 'x'],
            [
                'ful-input-local-date',
                `<ful-input-local-date name="a" value="2024-05-06">l</ful-input-local-date>`,
                '2030-01-02',
                '2024-05-06',
            ],
            ['ful-checkbox', `<ful-checkbox name="a" value="true">l</ful-checkbox>`, false, true],
            ['ful-checkbox without a declared value', `<ful-checkbox name="a">l</ful-checkbox>`, true, false],
            [
                'ful-radio-group',
                `
                <ful-radio-group name="a" value="x">l
                    <ful-radio value="x">x</ful-radio>
                    <ful-radio value="y">y</ful-radio>
                </ful-radio-group>`,
                'y',
                'x',
            ],
            ['ful-select', `<ful-select name="a" value="x">l</ful-select>`, 'y', 'x'],
            ['ful-select multiple', `<ful-select name="a" multiple value="a,b">l</ful-select>`, ['c'], ['a', 'b']],
            [
                'ful-filter-text',
                `<ful-filter-text name="a" value='["CONTAINS","IGNORE_CASE","foo"]'>l</ful-filter-text>`,
                ['EQ', 'CASE_SENSITIVE', 'bar'],
                ['CONTAINS', 'IGNORE_CASE', 'foo'],
            ],
            [
                'ful-filter-number',
                `<ful-filter-number name="a" value='["GTE",5]'>l</ful-filter-number>`,
                ['EQ', '7'],
                ['GTE', '5'],
            ],
        ];
        for (const [name, markup, changed, initial] of cases) {
            it(`restores a ${name}`, async () => {
                const [form] = await mountFields(markup);
                const field = form.querySelector('[name=a]');
                field.value = changed;
                assert.deepStrictEqual(field.value, changed, 'the change took');

                form.reset();

                assert.deepStrictEqual(field.value, initial);
            });
        }
        it('restores a ful-filter-text without a declared value to empty operands and the default operator', async () => {
            const [form] = await mountFields(`<ful-filter-text name="a">l</ful-filter-text>`);
            const field = form.querySelector('[name=a]');
            field.value = ['GTE', 'CASE_SENSITIVE', '5'];
            assert.deepStrictEqual(field.value, ['GTE', 'CASE_SENSITIVE', '5']);

            form.reset();

            assert.isNull(field.value, 'the operands are empty again');
            assert.strictEqual(
                field.querySelector('[data-ref=operator]').getAttribute('value'),
                'CONTAINS',
                'the operator is the rendered default',
            );
            assert.strictEqual(
                field.querySelector('[data-ref=sensitivity]').getAttribute('value'),
                'IGNORE_CASE',
                'the sensitivity is the rendered default',
            );
        });
        it('clears a ful-input-file selection', async () => {
            const [form] = await mountFields(`<ful-input-file name="a">l</ful-input-file>`);
            const field = form.querySelector('[name=a]');
            const dt = new DataTransfer();
            dt.items.add(new File(['x'], 'picked.txt'));
            field.files = dt.files;
            assert.strictEqual(field.value, 'picked.txt');

            form.reset();

            assert.strictEqual(field.value, null);
        });
    });

    it('clears a field custom validity when it changes, with clear-invalid-on-change', async () => {
        const [form] = await mount(`
            <ful-form clear-invalid-on-change><input name="name"></ful-form>`);
        const input = form.querySelector('input[name=name]');
        input.setCustomValidity('must not be blank');

        input.dispatchEvent(new Event('change', { bubbles: true }));

        assert.strictEqual(input.validationMessage, '');
    });

    it('keeps a field custom validity on change when clear-invalid-on-change is absent', async () => {
        const [form] = await mount(`<ful-form><input name="name"></ful-form>`);
        const input = form.querySelector('input[name=name]');
        input.setCustomValidity('must not be blank');

        input.dispatchEvent(new Event('change', { bubbles: true }));

        assert.strictEqual(input.validationMessage, 'must not be blank');
    });
});

describe('Form submit failures before the request is sent', () => {
    let warns = [];
    let originalWarn;
    beforeEach(() => {
        warns = [];
        originalWarn = console.warn;
        console.warn = (...args) => warns.push(args);
    });
    afterEach(() => {
        console.warn = originalWarn;
    });
    const mount = async (html) => {
        const container = appended(html);
        const form = container.querySelector('ful-form');
        await Rendering.waitFor(form);
        return [form, container];
    };

    it('reports a request mapper that throws as a failed submit, not as a rejection', async () => {
        //a mapper throwing is how a caller signals a problem with the values, so it has
        //to travel the same path as a loader failure
        registry.defineComponent('rejecting-mapper', () => {
            throw new Error('values are not acceptable');
        });
        const [form] = await mount(`
            <ful-form request-mapper="rejecting-mapper">
                <input name="a" value="1">
                <button type="submit">go</button>
            </ful-form>`);
        const failures = [];
        form.addEventListener('submit:failure', (e) => failures.push(e.detail.exception));

        await form.submit();

        assert.strictEqual(failures.length, 1, 'the failure is announced');
        assert.strictEqual(failures[0].message, 'values are not acceptable');
        assert.isTrue(warns.some((args) => String(args[0]).includes('failed to submit form')));
    });

    it('reports a missing loader component the same way', async () => {
        const [form] = await mount(`
            <ful-form loader="loaders:nowhere">
                <input name="a" value="1">
            </ful-form>`);
        const failures = [];
        form.addEventListener('submit:failure', (e) => failures.push(e.detail.exception));

        await form.submit();

        assert.strictEqual(failures.length, 1);
    });
});

describe('Disabled fields and submitted values', () => {
    //a ful-* field only matches :disabled through its own attribute, which is what
    //Bindings.extractFrom checks: without it a disabled field still reaches the server
    const mount = async (inner) => {
        registry.defineComponent('loaders:select', {
            create: () => ({
                prefetch: async () => {},
                load: async () => [],
                exact: async (...k) => k.map((v) => ({ key: v, label: v })),
            }),
        });
        const container = appended(`<ful-form>${inner}<input name="keep" value="kept"></ful-form>`);
        const form = container.querySelector('ful-form');
        await Rendering.waitFor(form);
        for (let i = 0; i !== 20; ++i) {
            await tick();
        }
        return [form, container];
    };

    const cases = [
        ['ful-input', `<ful-input name="a" value="x">l</ful-input>`],
        ['ful-checkbox', `<ful-checkbox name="a" value="true">l</ful-checkbox>`],
        ['ful-select', `<ful-select name="a" value="x">l</ful-select>`],
        [
            'ful-radio-group',
            `<ful-radio-group name="a" value="x">l<ful-radio value="x">x</ful-radio></ful-radio-group>`,
        ],
    ];

    for (const [tag, markup] of cases) {
        it(`leaves a disabled ${tag} out of the submitted values`, async () => {
            const [form] = await mount(markup);
            const field = form.querySelector(tag);
            assert.property(form.values, 'a', 'the field contributes while enabled');

            field.disabled = true;

            assert.isTrue(field.matches(':disabled'), 'the host itself is disabled');
            assert.notProperty(form.values, 'a');
            assert.strictEqual(form.values.keep, 'kept', 'the other fields still contribute');
        });

        it(`puts a re-enabled ${tag} back into the submitted values`, async () => {
            const [form] = await mount(markup);
            const field = form.querySelector(tag);

            field.disabled = true;
            field.disabled = false;

            assert.isFalse(field.matches(':disabled'));
            assert.property(form.values, 'a');
        });
    }
});
