import { tick } from '../../tick.mjs';
import { assert } from 'chai';
import { Failure } from '../../../src/httpc/index.mjs';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { AsyncEvents, FormLoader, Plugin } from '../../../src/ful/index.mjs';
import { appended, attached } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const heldOff = (el) => el.getAttribute('aria-disabled') === 'true';

describe('Form busy state', () => {
    const mountForm = async (html) => {
        const container = appended(html);
        await Rendering.waitFor(container);
        await tick();
        return container.querySelector('ful-form');
    };

    it('declares itself busy while a spin holds, like the table and the sections do', async () => {
        const form = await mountForm(`<ful-form><button type="submit">go</button></ful-form>`);

        assert.isFalse(form.hasAttribute('aria-busy'), 'an idle form carries no aria-busy');
        form.spinner(true);
        assert.strictEqual(form.getAttribute('aria-busy'), 'true', 'a spin marks the form busy with aria-busy');
        form.spinner(false);
        assert.isFalse(form.hasAttribute('aria-busy'), 'releasing the spin removes aria-busy');
    });

    it('gives a spinner with no text of its own something to announce', async () => {
        const form = await mountForm(`<ful-form><ful-spinner hidden></ful-spinner></ful-form>`);
        const spinner = form.querySelector('ful-spinner');

        form.spinner(true);

        assert.strictEqual(
            spinner.getAttribute('role'),
            'status',
            'the spinner is given the status role, so that its label is announced',
        );
        assert.strictEqual(
            spinner.textContent.trim(),
            'Loading…',
            'a spinner with no text of its own is given the localized loading label',
        );
        assert.isFalse(spinner.hidden, 'a spin reveals the spinner');

        form.spinner(false);
        assert.isTrue(spinner.hidden, 'the release hides the spinner again');
        assert.strictEqual(spinner.textContent.trim(), '', 'the label does not linger in a hidden region');
    });

    it('reveals a spinner before writing its label, so a screen reader announces it', async () => {
        const form = await mountForm(`<ful-form><ful-spinner hidden></ful-spinner></ful-form>`);
        const spinner = form.querySelector('ful-spinner');
        const observer = new MutationObserver(() => {});
        observer.observe(spinner, { attributes: true, childList: true, characterData: true, subtree: true });

        form.spinner(true);

        const records = observer.takeRecords();
        observer.disconnect();
        form.spinner(false);
        const revealed = records.findIndex((r) => r.type === 'attributes' && r.attributeName === 'hidden');
        const written = records.findIndex((r) => r.type === 'childList' || r.type === 'characterData');
        assert.notStrictEqual(revealed, -1, 'the spin reveals the hidden spinner');
        assert.notStrictEqual(written, -1, 'the spin writes a label into the spinner');
        assert.isBelow(
            revealed,
            written,
            'the spinner is revealed before its label is written, so the label is announced as it appears',
        );
    });

    it('leaves an authored spinner label and role alone', async () => {
        const form = await mountForm(
            `<ful-form><ful-spinner role="alert" hidden><span class="ful-sr-only">Saving the policy</span></ful-spinner></ful-form>`,
        );
        const spinner = form.querySelector('ful-spinner');

        form.spinner(true);

        assert.strictEqual(spinner.getAttribute('role'), 'alert', 'a spinner that already has a role keeps it');
        assert.strictEqual(
            spinner.textContent.trim(),
            'Saving the policy',
            'a spinner with text of its own is given no generated label',
        );
    });

    it('keeps the submitter focused while it is held off', async () => {
        const form = await mountForm(`<ful-form><button type="submit" id="go">go</button></ful-form>`);
        const go = form.querySelector('#go');
        go.focus();

        form.spinner(true);

        assert.strictEqual(document.activeElement, go, 'holding the submitter off with aria-disabled keeps its focus');
        assert.isFalse(go.disabled, 'the submitter is held off, not disabled, since disabling it would drop its focus');
        assert.strictEqual(
            go.getAttribute('aria-disabled'),
            'true',
            'the submitter is held off with aria-disabled while the form is busy',
        );
        form.spinner(false);
    });

    it('refuses a click on a button it is holding off', async () => {
        const form = await mountForm(`<ful-form><button type="submit" id="go">go</button></ful-form>`);
        const go = form.querySelector('#go');
        let clicks = 0;
        go.addEventListener('click', () => ++clicks);

        form.spinner(true);
        go.click();
        assert.strictEqual(clicks, 0, 'the capturing refusal beats the author own listener');

        form.spinner(false);
        go.click();
        assert.strictEqual(clicks, 1, 'releasing the spin lets a click reach the button again');
    });
});

describe('Form spinner button states', () => {
    it('leaves an already-disabled button disabled after the spinner releases', async () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <ful-form>
                <button type="submit" id="btn-enabled">Submit</button>
                <button type="submit" id="btn-disabled" disabled>Locked Submitter</button>
            </ful-form>
        `;
        attached(container);

        await tick();

        const fulForm = container.querySelector('ful-form');
        const btnEnabled = fulForm.querySelector('#btn-enabled');
        const btnDisabled = fulForm.querySelector('#btn-disabled');

        fulForm.spinner(true);
        assert.isTrue(heldOff(btnEnabled), 'a spin holds off an enabled submit button');
        assert.isTrue(heldOff(btnDisabled), 'a spin holds off a submit button that is already disabled too');
        assert.strictEqual(btnDisabled.disabled, true, 'the authored disabled property is never touched');

        fulForm.spinner(false);
        assert.isFalse(heldOff(btnEnabled), 'the release lets go of the enabled submit button');
        assert.isFalse(heldOff(btnDisabled), 'the hold is released whatever the authored state was');
        assert.strictEqual(btnDisabled.disabled, true, 'the authored disabled property still holds after the release');
    });

    it('only the outermost spin saves and restores the buttons', async () => {
        const container = appended(`
            <ful-form>
                <button id="btn-enabled">go</button>
                <button id="btn-disabled" disabled>nope</button>
            </ful-form>`);
        await Rendering.waitFor(container);
        await tick();

        const fulForm = container.querySelector('ful-form');
        const enabled = fulForm.querySelector('#btn-enabled');

        fulForm.spinner(true);
        fulForm.spinner(true);
        assert.isTrue(heldOff(enabled), 'nested spins hold off the buttons');

        fulForm.spinner(false);
        assert.isTrue(heldOff(enabled), 'the inner release leaves the outer spin alone');

        fulForm.spinner(false);
        assert.isFalse(heldOff(enabled), 'the outer release restores them');

        fulForm.spinner(false);
        assert.isFalse(heldOff(enabled), 'a release with no spin left leaves the buttons as they were');
    });

    it('leaves a button that joined mid-spin on its authored state', async () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <ful-form>
                <button type="submit" id="btn-enabled">Submit</button>
            </ful-form>
        `;
        attached(container);
        await tick();

        const fulForm = container.querySelector('ful-form');
        fulForm.spinner(true);
        const latecomer = document.createElement('button');
        latecomer.type = 'submit';
        latecomer.disabled = true;
        latecomer.textContent = 'joined disabled';
        fulForm.querySelector('form').appendChild(latecomer);

        fulForm.spinner(false);

        assert.isFalse(
            heldOff(fulForm.querySelector('#btn-enabled')),
            'the button held off at the spin gets its state back on release',
        );
        assert.isTrue(latecomer.disabled, 'the latecomer keeps its authored state');
    });
});
describe('Form spinner button states across overlapping submits', () => {
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
        attached(container);
        await tick();

        const fulForm = container.querySelector('ful-form');
        const spinner = fulForm.querySelector('ful-spinner');
        const btnEnabled = fulForm.querySelector('#btn-enabled');
        const btnDisabled = fulForm.querySelector('#btn-disabled');

        const first = fulForm.submit();
        const second = fulForm.submit();
        assert.strictEqual(spinner.hidden, false, 'the spinner is shown while submitting');
        assert.isTrue(heldOff(btnEnabled), 'an in-flight submit holds off the enabled submit button');
        assert.isTrue(heldOff(btnDisabled), 'an in-flight submit holds off the disabled submit button too');

        for (let i = 0; i !== 20; ++i) {
            await tick();
        }
        assert.strictEqual(releases.length, 1, 'a submit called while one is in flight sends nothing');
        await second;
        assert.strictEqual(spinner.hidden, false, 'the dropped submit does not hide the spinner of the one in flight');

        releases[0]();
        await first;
        assert.strictEqual(spinner.hidden, true, 'the spinner is hidden once the submit settles');
        assert.isFalse(heldOff(btnEnabled), 'the enabled submit button is released once the submit settles');
        assert.strictEqual(btnDisabled.disabled, true, 'an intentionally disabled button stays disabled');
        assert.isUndefined(
            btnEnabled.dataset.wd,
            "the release removes the record of the enabled button's authored aria-disabled",
        );
        assert.isUndefined(
            btnDisabled.dataset.wd,
            "the release removes the record of the disabled button's authored aria-disabled",
        );

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
            'a successful submit fires submit:success and no submit:failure',
        );
        assert.deepStrictEqual(
            events[0].detail.values,
            { name: 'ann' },
            'submit:success carries the values extracted from the fields',
        );
        assert.deepStrictEqual(
            events[0].detail.response,
            { id: 7, transformed: true },
            'submit:success carries the response the loader transformed',
        );
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
            'a rejecting loader fires submit:failure and no submit:success',
        );
        assert.strictEqual(events[0].detail.exception, boom, 'submit:failure carries what the loader threw');
        assert.deepStrictEqual(
            events[0].detail.values,
            { name: 'ann' },
            'submit:failure carries the values extracted from the fields',
        );
        assert.isTrue(
            warns.some((args) => String(args[0]).includes('failed to submit form')),
            'an exception that is not a Failure is logged with console.warn',
        );
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
        assert.strictEqual(
            input.validationMessage,
            'must not be blank',
            "a problem naming a field is set as that field's custom validity",
        );
        assert.strictEqual(
            errors.textContent,
            'the whole thing is wrong',
            'a problem naming no field is shown in the ful-errors banner',
        );
        assert.isFalse(errors.hasAttribute('hidden'), 'a banner with a problem to show is revealed');
        assert.isFalse(
            warns.some((args) => String(args[0]).includes('failed to submit form')),
            'a Failure is the reported outcome, not a warning on top of it',
        );
    });

    it('leaves the fields of another form alone, both their validity and their values', async () => {
        const [outer, container] = await mount(`
            <ful-form id="outer-form">
                <ful-input name="status">outer</ful-input>
                <ful-form id="inner-form">
                    <ful-input name="status">inner</ful-input>
                </ful-form>
            </ful-form>`);
        const inner = container.querySelector('#inner-form');
        const [outerStatus, innerStatus] = container.querySelectorAll('ful-input');

        inner.errors = [{ type: 'FIELD_ERROR', context: 'status', reason: 'the inner one is wrong' }];
        assert.strictEqual(
            innerStatus.querySelector('ful-field-error').innerText,
            'the inner one is wrong',
            'the inner form pins its problem on its own field',
        );

        outer.errors = [{ type: 'FIELD_ERROR', context: 'status', reason: 'the outer one is wrong' }];

        assert.strictEqual(
            outerStatus.querySelector('ful-field-error').innerText,
            'the outer one is wrong',
            'the outer form pins its problem on its own field',
        );
        assert.strictEqual(
            innerStatus.querySelector('ful-field-error').innerText,
            'the inner one is wrong',
            'the outer form neither resets nor overwrites a field the inner form owns',
        );

        outer.values = { status: 'settled' };
        assert.strictEqual(String(outerStatus.value), 'settled', 'the outer form writes values into its own field');
        assert.strictEqual(
            innerStatus.value,
            null,
            'the outer form does not write values into a field the inner form owns',
        );
    });

    it('leaves another form its banner, its pinned problems and its buttons', async () => {
        const [outer, container] = await mount(`
            <ful-form id="outer-form" clear-invalid-on-change>
                <ful-errors hidden></ful-errors>
                <ful-spinner hidden></ful-spinner>
                <ful-input name="status">outer</ful-input>
                <ful-form id="inner-form">
                    <ful-errors hidden></ful-errors>
                    <ful-spinner hidden></ful-spinner>
                    <ful-input name="status">inner</ful-input>
                    <button type="submit">inner go</button>
                </ful-form>
                <button type="submit">outer go</button>
            </ful-form>`);
        const inner = container.querySelector('#inner-form');
        const [outerStatus, innerStatus] = container.querySelectorAll('ful-input');
        const [outerBanner, innerBanner] = outer.querySelectorAll('ful-errors');
        const [innerGo, outerGo] = outer.querySelectorAll('button');

        inner.errors = [{ type: 'GENERIC_ERROR', reason: 'the inner one is wrong' }];
        outer.errors = [{ type: 'GENERIC_ERROR', reason: 'the outer one is wrong' }];

        assert.strictEqual(
            outerBanner.innerText,
            'the outer one is wrong',
            'the outer form shows its problem in its own banner',
        );
        assert.strictEqual(
            innerBanner.innerText,
            'the inner one is wrong',
            'the outer form does not fill or wipe the inner banner',
        );

        inner.errors = [{ type: 'FIELD_ERROR', context: 'status', reason: 'inner problem' }];
        outer.errors = [{ type: 'FIELD_ERROR', context: 'status', reason: 'outer problem' }];
        innerStatus.dispatchEvent(new Event('change', { bubbles: true }));
        assert.strictEqual(
            innerStatus.querySelector('ful-field-error').innerText,
            'inner problem',
            'a change in the inner form is not the outer form clearing anything',
        );
        outerStatus.dispatchEvent(new Event('change', { bubbles: true }));
        assert.strictEqual(
            outerStatus.querySelector('ful-field-error').innerText,
            '',
            'the outer form still clears its own',
        );

        outer.spinner(true);
        assert.strictEqual(outerGo.getAttribute('aria-disabled'), 'true', 'its own button is held off');
        assert.isNull(innerGo.getAttribute('aria-disabled'), "the inner form's button is not");
        const [outerSpinner, innerSpinner] = outer.querySelectorAll('ful-spinner');
        assert.isFalse(outerSpinner.hidden, 'its own spinner is up');
        assert.isTrue(innerSpinner.hidden, "the inner form's spinner is left alone");
        outer.spinner(false);
        assert.isNull(
            outerGo.getAttribute('aria-disabled'),
            'the release restores the aria-disabled of its own button',
        );
        assert.isTrue(outerSpinner.hidden, 'the release hides its own spinner again');
    });

    it('answers a field owning form, as a native control does', async () => {
        const [outer, container] = await mount(`
            <ful-form id="outer-form">
                <ful-input name="status">outer</ful-input>
            </ful-form>
            <ful-input name="lonely">lonely</ful-input>`);
        const inForm = container.querySelector('#outer-form ful-input');
        const lonely = container.querySelector('ful-input[name=lonely]');

        assert.strictEqual(inForm.form, outer.form, 'the associated form, the native one the field sits in');
        assert.strictEqual(lonely.form, null, 'a field outside any form answers a null form');
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
        assert.strictEqual(
            errors.textContent,
            'an unnamed problem',
            'a field problem with a null context is shown in the banner',
        );
        assert.isFalse(errors.hasAttribute('hidden'), 'the banner is revealed to show the problem with no context');
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
        assert.strictEqual(
            errors.textContent,
            'an unnamed problem',
            'a field problem with an empty context is shown in the banner, as a null one is',
        );
        assert.isFalse(
            errors.hasAttribute('hidden'),
            'the banner is revealed to show the problem with an empty context',
        );
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
        assert.strictEqual(
            form.querySelector('input[name=name]').validationMessage,
            'must not be blank',
            'the failed attempt pins its problem on the field',
        );

        fail = false;
        await form.submit();

        assert.strictEqual(
            form.querySelector('input[name=name]').validationMessage,
            '',
            'a new submit clears the field problem of the previous attempt',
        );
        assert.strictEqual(
            form.querySelector('ful-errors').textContent,
            '',
            'a new submit clears the banner of the previous attempt',
        );
        assert.isTrue(
            form.querySelector('ful-errors').hasAttribute('hidden'),
            'a banner left with no problem is hidden again',
        );
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

        assert.deepStrictEqual(
            submitted,
            [],
            'a cancelled submit event ends the submit before the loader sends anything',
        );
        assert.deepStrictEqual(
            events,
            [],
            'a cancelled submit event fires neither submit:requested nor an outcome event',
        );
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

        assert.deepStrictEqual(
            submitted,
            [{ name: 'ann', action: 'save' }],
            'only the clicked submitter contributes its name and value, the other buttons none',
        );
    });

    it('submits from a button while a field is still marked invalid', async () => {
        stubLoader({
            prepare: async (v) => v,
            submit: async () => ({}),
            transform: async (r) => r,
        });
        const [form] = await mount(`
            <ful-form>
                <input name="name" value="ann">
                <button type="submit" id="go">go</button>
            </ful-form>`);
        form.querySelector('input').setCustomValidity('already taken');

        const done = new Promise((resolve) => form.addEventListener('submit:success', resolve, { once: true }));
        form.querySelector('#go').click();

        assert.strictEqual(form.getAttribute('aria-busy'), 'true', 'the browser did not block the submit');
        await done;
    });

    it('round-trips nested values through the values property, empty fields reading back as null', async () => {
        const [form] = await mount(`
            <ful-form>
                <input name="user.name">
                <input name="user.age">
                <input name="note">
            </ful-form>`);

        form.values = { user: { name: 'ann', age: '7' } };

        assert.deepStrictEqual(
            form.values,
            { user: { name: 'ann', age: '7' }, note: null },
            'values reads back the nested object it wrote, a field it did not name reading as null',
        );
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
            'a local form fires submit:success and no submit:failure',
        );
        assert.deepStrictEqual(
            events[0].detail.response,
            { mapped: { echoed: { wrapped: { name: 'ann' } } } },
            "the response is the listener's answer to the mapped request, passed through the response mapper",
        );
    });

    it('posts the mapped request to the action and maps the response back', async () => {
        const [form] = await mount(`
            <ful-form action="/api/save" request-mapper="mappers:request" response-mapper="mappers:response">
                <input name="name" value="ann">
            </ful-form>`);
        const events = recording(form, 'submit:success', 'submit:failure');

        await form.submit();

        assert.deepStrictEqual(
            http,
            [{ method: 'POST', url: '/api/save', body: { wrapped: { name: 'ann' } } }],
            'a remote form posts the mapped request as json to its action, with POST by default',
        );
        assert.deepStrictEqual(
            events.map((e) => e.type),
            ['submit:success'],
            'a remote form fires submit:success and no submit:failure',
        );
        assert.deepStrictEqual(
            events[0].detail.response,
            { mapped: { id: 7 } },
            'the http response is passed through the response mapper',
        );
    });

    it('honours the method attribute of a remote form', async () => {
        const [form] = await mount(`<ful-form action="/api/save" method="PUT"></ful-form>`);

        await form.submit();

        assert.deepStrictEqual(
            http,
            [{ method: 'PUT', url: '/api/save', body: {} }],
            'a remote form sends with the method attribute instead of POST',
        );
    });
});

describe('Form reset and validity', () => {
    it('restores the fields to the values they were rendered with', async () => {
        const [form] = await mount(`<ful-form><input name="name" value="ann"></ful-form>`);
        form.values = { name: 'bob' };
        assert.deepStrictEqual(form.values, { name: 'bob' }, 'writing values changes the field');

        form.reset();

        assert.deepStrictEqual(
            form.values,
            { name: 'ann' },
            'reset returns the field to the value it was rendered with',
        );
    });

    describe('Restores every field kind through its own value semantics', () => {
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
                assert.deepStrictEqual(field.value, changed, 'the field takes the changed value before the reset');

                form.reset();

                assert.deepStrictEqual(
                    field.value,
                    initial,
                    'reset returns the field to the value it was rendered with, through its own value semantics',
                );
            });
        }
        it('restores a ful-filter-text without a declared value to empty operands and the default operator', async () => {
            const [form] = await mountFields(`<ful-filter-text name="a">l</ful-filter-text>`);
            const field = form.querySelector('[name=a]');
            field.value = ['GTE', 'CASE_SENSITIVE', '5'];
            assert.deepStrictEqual(
                field.value,
                ['GTE', 'CASE_SENSITIVE', '5'],
                'the operands and the operator were changed before the reset',
            );

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
            assert.strictEqual(field.value, 'picked.txt', 'the picked file is selected before the reset');

            form.reset();

            assert.strictEqual(
                field.value,
                null,
                "reset empties a file selection, as a native file input's reset does",
            );
        });
    });

    it('clears a field custom validity when it changes, with clear-invalid-on-change', async () => {
        const [form] = await mount(`
            <ful-form clear-invalid-on-change><input name="name"></ful-form>`);
        const input = form.querySelector('input[name=name]');
        input.setCustomValidity('must not be blank');

        input.dispatchEvent(new Event('change', { bubbles: true }));

        assert.strictEqual(
            input.validationMessage,
            '',
            'with clear-invalid-on-change a change clears the custom validity of the field it bubbles from',
        );
    });

    it('clears on change a form-associated element that has no form property of its own', async () => {
        if (!customElements.get('test-bare-associated')) {
            customElements.define(
                'test-bare-associated',
                class extends HTMLElement {
                    static formAssociated = true;
                    validity = 'invalid';
                    constructor() {
                        super();
                        this.internals = this.attachInternals();
                    }
                    setCustomValidity(message) {
                        this.validity = message;
                    }
                },
            );
        }
        const [form] = await mount(`
            <ful-form clear-invalid-on-change><test-bare-associated name="bare"></test-bare-associated></ful-form>`);
        const bare = form.querySelector('test-bare-associated');

        bare.dispatchEvent(new Event('change', { bubbles: true }));

        assert.strictEqual(
            bare.validity,
            '',
            'a form-associated element with no form property of its own is matched to the form through internals.form',
        );
    });

    it('keeps a field custom validity on change when clear-invalid-on-change is absent', async () => {
        const [form] = await mount(`<ful-form><input name="name"></ful-form>`);
        const input = form.querySelector('input[name=name]');
        input.setCustomValidity('must not be blank');

        input.dispatchEvent(new Event('change', { bubbles: true }));

        assert.strictEqual(
            input.validationMessage,
            'must not be blank',
            'without clear-invalid-on-change a change leaves the custom validity in place',
        );
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

        assert.strictEqual(failures.length, 1, 'a throwing request mapper fires one submit:failure');
        assert.strictEqual(
            failures[0].message,
            'values are not acceptable',
            'the failure carries the exception the request mapper threw',
        );
        assert.isTrue(
            warns.some((args) => String(args[0]).includes('failed to submit form')),
            'an exception that is not a Failure is logged with console.warn',
        );
    });

    it('reports a missing loader component the same way', async () => {
        const [form] = await mount(`
            <ful-form loader="loaders:nowhere">
                <input name="a" value="1">
            </ful-form>`);
        const failures = [];
        form.addEventListener('submit:failure', (e) => failures.push(e.detail.exception));

        await form.submit();

        assert.strictEqual(
            failures.length,
            1,
            'a loader component that is not registered is reported as one submit:failure, not as a rejection',
        );
    });
});
