import { assert } from 'chai';
import { Failure } from '../../../src/httpc/index.mjs';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { AsyncEvents, FormLoader, Plugin } from '../../../src/ful/index.mjs';

registry.plugin(new Plugin()).configure();

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
        await new Promise(resolve => setTimeout(resolve, 0));

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

        container.remove();
    });
});
describe('Form Spinner Button States across overlapping submits', () => {
    it('saves and restores the button states only once', async () => {
        const releases = [];
        registry.defineComponent('loaders:form', {
            create: () => ({
                prepare: async (v) => v,
                submit: () => new Promise((resolve) => releases.push(resolve)),
                transform: async (r) => r,
            })
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
        await new Promise(resolve => setTimeout(resolve, 0));

        const fulForm = container.querySelector('ful-form');
        const spinner = fulForm.querySelector('ful-spinner');
        const btnEnabled = fulForm.querySelector('#btn-enabled');
        const btnDisabled = fulForm.querySelector('#btn-disabled');

        const first = fulForm.submit();
        const second = fulForm.submit();
        assert.strictEqual(spinner.hidden, false, 'the spinner is shown while submitting');
        assert.strictEqual(btnEnabled.disabled, true);
        assert.strictEqual(btnDisabled.disabled, true);

        //both submits have to reach the loader before they can be released
        for (let i = 0; i !== 20; ++i) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        assert.strictEqual(releases.length, 2, 'both submits are in flight');

        releases[0]();
        await first;
        assert.strictEqual(spinner.hidden, false, 'the spinner stays shown until the last submit ends');
        assert.strictEqual(btnEnabled.disabled, true, 'buttons stay disabled until the last submit ends');

        releases[1]();
        await second;
        assert.strictEqual(spinner.hidden, true);
        assert.strictEqual(btnEnabled.disabled, false);
        assert.strictEqual(btnDisabled.disabled, true, 'an intentionally disabled button stays disabled');
        assert.isUndefined(btnEnabled.dataset.wd);
        assert.isUndefined(btnDisabled.dataset.wd);
        container.remove();
    });
});


const mount = async (html) => {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
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
        const [form, container] = await mount(`<ful-form><input name="name" value="ann"></ful-form>`);
        const events = recording(form, 'submit:success', 'submit:failure');

        await form.submit();

        assert.deepStrictEqual(events.map((e) => e.type), ['submit:success']);
        assert.deepStrictEqual(events[0].detail.values, { name: 'ann' });
        assert.deepStrictEqual(events[0].detail.response, { id: 7, transformed: true });
        container.remove();
    });

    it('reports a failed submit as an event instead of rejecting the caller', async () => {
        const boom = new Error('boom');
        stubLoader({ prepare: async (v) => v, submit: async () => { throw boom; }, transform: async (r) => r });
        const [form, container] = await mount(`<ful-form><input name="name" value="ann"></ful-form>`);
        const events = recording(form, 'submit:success', 'submit:failure');

        await form.submit();

        assert.deepStrictEqual(events.map((e) => e.type), ['submit:failure']);
        assert.strictEqual(events[0].detail.exception, boom);
        assert.deepStrictEqual(events[0].detail.values, { name: 'ann' });
        assert.isTrue(warns.some((args) => String(args[0]).includes('failed to submit form')));
        container.remove();
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
        const [form, container] = await mount(`
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
        container.remove();
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
        const [form, container] = await mount(`
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
        container.remove();
    });

    it('does not reach the loader nor announce an outcome when the submit event is cancelled', async () => {
        const submitted = [];
        stubLoader({
            prepare: async (v) => v,
            submit: async (request) => { submitted.push(request); return {}; },
            transform: async (r) => r,
        });
        const [form, container] = await mount(`<ful-form><input name="name" value="ann"></ful-form>`);
        const events = recording(form, 'submit:success', 'submit:failure', 'submit:requested');
        form.addEventListener('submit', (e) => e.preventDefault());

        await form.submit();

        assert.deepStrictEqual(submitted, []);
        assert.deepStrictEqual(events, []);
        container.remove();
    });
});

describe('Form submitted values', () => {
    it('includes the clicked submitter and no other button, despite the spinner disabling them', async () => {
        const submitted = [];
        stubLoader({
            prepare: async (v) => v,
            submit: async (request) => { submitted.push(request); return {}; },
            transform: async (r) => r,
        });
        const [form, container] = await mount(`
            <ful-form>
                <input name="name" value="ann">
                <button type="submit" name="action" value="save" id="save">save</button>
                <button type="submit" name="action" value="delete" id="delete">delete</button>
            </ful-form>`);

        const done = new Promise((resolve) => form.addEventListener('submit:success', resolve, { once: true }));
        form.querySelector('#save').click();
        await done;

        assert.deepStrictEqual(submitted, [{ name: 'ann', action: 'save' }]);
        container.remove();
    });

    it('round-trips nested values through the values property, empty fields reading back as null', async () => {
        const [form, container] = await mount(`
            <ful-form>
                <input name="user.name">
                <input name="user.age">
                <input name="note">
            </ful-form>`);

        form.values = { user: { name: 'ann', age: '7' } };

        assert.deepStrictEqual(form.values, { user: { name: 'ann', age: '7' }, note: null });
        container.remove();
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
        const [form, container] = await mount(`
            <ful-form request-mapper="mappers:request" response-mapper="mappers:response">
                <input name="name" value="ann">
            </ful-form>`);
        AsyncEvents.asyncOn(form, 'submit:requested', async (e) => ({ echoed: e.detail.request }));
        const events = recording(form, 'submit:success', 'submit:failure');

        await form.submit();

        assert.deepStrictEqual(http, [], 'a form without an action never goes over http');
        assert.deepStrictEqual(events.map((e) => e.type), ['submit:success']);
        assert.deepStrictEqual(events[0].detail.response, { mapped: { echoed: { wrapped: { name: 'ann' } } } });
        container.remove();
    });

    it('posts the mapped request to the action and maps the response back', async () => {
        const [form, container] = await mount(`
            <ful-form action="/api/save" request-mapper="mappers:request" response-mapper="mappers:response">
                <input name="name" value="ann">
            </ful-form>`);
        const events = recording(form, 'submit:success', 'submit:failure');

        await form.submit();

        assert.deepStrictEqual(http, [{ method: 'POST', url: '/api/save', body: { wrapped: { name: 'ann' } } }]);
        assert.deepStrictEqual(events.map((e) => e.type), ['submit:success']);
        assert.deepStrictEqual(events[0].detail.response, { mapped: { id: 7 } });
        container.remove();
    });

    it('honours the method attribute of a remote form', async () => {
        const [form, container] = await mount(`<ful-form action="/api/save" method="PUT"></ful-form>`);

        await form.submit();

        assert.deepStrictEqual(http, [{ method: 'PUT', url: '/api/save', body: {} }]);
        container.remove();
    });
});

describe('Form reset and validity', () => {
    it('restores the fields to the values they were rendered with', async () => {
        const [form, container] = await mount(`<ful-form><input name="name" value="ann"></ful-form>`);
        form.values = { name: 'bob' };
        assert.deepStrictEqual(form.values, { name: 'bob' });

        form.reset();

        assert.deepStrictEqual(form.values, { name: 'ann' });
        container.remove();
    });

    it('clears a field custom validity when it changes, with clear-invalid-on-change', async () => {
        const [form, container] = await mount(`
            <ful-form clear-invalid-on-change><input name="name"></ful-form>`);
        const input = form.querySelector('input[name=name]');
        input.setCustomValidity('must not be blank');

        input.dispatchEvent(new Event('change', { bubbles: true }));

        assert.strictEqual(input.validationMessage, '');
        container.remove();
    });

    it('keeps a field custom validity on change when clear-invalid-on-change is absent', async () => {
        const [form, container] = await mount(`<ful-form><input name="name"></ful-form>`);
        const input = form.querySelector('input[name=name]');
        input.setCustomValidity('must not be blank');

        input.dispatchEvent(new Event('change', { bubbles: true }));

        assert.strictEqual(input.validationMessage, 'must not be blank');
        container.remove();
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
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
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
        const [form, container] = await mount(`
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
        container.remove();
    });

    it('reports a missing loader component the same way', async () => {
        const [form, container] = await mount(`
            <ful-form loader="loaders:nowhere">
                <input name="a" value="1">
            </ful-form>`);
        const failures = [];
        form.addEventListener('submit:failure', (e) => failures.push(e.detail.exception));

        await form.submit();

        assert.strictEqual(failures.length, 1);
        container.remove();
    });
});

describe('Disabled fields and submitted values', () => {
    //a ful-* field only matches :disabled through its own attribute, which is what
    //Bindings.extractFrom checks: without it a disabled field still reaches the server
    const mount = async (inner) => {
        registry.defineComponent('loaders:select', {
            create: () => ({ prefetch: async () => { }, load: async () => [], exact: async (...k) => k.map((v) => [v, v]) })
        });
        const container = document.createElement('div');
        container.innerHTML = `<ful-form>${inner}<input name="keep" value="kept"></ful-form>`;
        document.body.appendChild(container);
        const form = container.querySelector('ful-form');
        await Rendering.waitFor(form);
        for (let i = 0; i !== 20; ++i) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        return [form, container];
    };

    const cases = [
        ['ful-input', `<ful-input name="a" value="x">l</ful-input>`],
        ['ful-checkbox', `<ful-checkbox name="a" value="true">l</ful-checkbox>`],
        ['ful-select', `<ful-select name="a" value="x">l</ful-select>`],
        ['ful-radio-group', `<ful-radio-group name="a" value="x">l<ful-radio value="x">x</ful-radio></ful-radio-group>`],
    ];

    for (const [tag, markup] of cases) {
        it(`leaves a disabled ${tag} out of the submitted values`, async () => {
            const [form, container] = await mount(markup);
            const field = form.querySelector(tag);
            assert.property(form.values, 'a', 'the field contributes while enabled');

            field.disabled = true;

            assert.isTrue(field.matches(':disabled'), 'the host itself is disabled');
            assert.notProperty(form.values, 'a');
            assert.strictEqual(form.values.keep, 'kept', 'the other fields still contribute');
            container.remove();
        });

        it(`puts a re-enabled ${tag} back into the submitted values`, async () => {
            const [form, container] = await mount(markup);
            const field = form.querySelector(tag);

            field.disabled = true;
            field.disabled = false;

            assert.isFalse(field.matches(':disabled'));
            assert.property(form.values, 'a');
            container.remove();
        });
    }
});
