import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Failure } from '../../../src/httpc/index.mjs';
import { AsyncEvents, Plugin, Dialog } from '../../../src/ful/index.mjs';
import { appended, settle as drain } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

before(() => {
    const style = document.createElement('style');
    style.id = 'quick-drawer-slides';
    style.textContent = 'dialog.ful-drawer { animation-duration: 10ms !important; }';
    document.head.append(style);
});
after(() => document.getElementById('quick-drawer-slides')?.remove());

const settle = () => drain();
const mount = async (html) => {
    const container = appended(html);
    await Rendering.waitFor(container);
    await settle();
    return [container.firstElementChild, container];
};

describe('Dialog', () => {
    it('shows the header, the body and the localized acknowledge button', async () => {
        const [dialog] = await mount('<ful-dialog header="the header">the body</ful-dialog>');

        assert.isNotNull(
            dialog.querySelector('header h2')?.textContent.match(/the header/),
            "the header attribute is rendered as the title in the header's h2",
        );
        assert.include(
            dialog.querySelector("[data-ref='body']").textContent,
            'the body',
            'the default slot is rendered as the body',
        );
        assert.strictEqual(
            dialog.querySelector('[data-ref=acknowledge]').textContent,
            'Got it',
            'without a buttons slot the footer holds the localized acknowledge button',
        );
    });

    it('names the dialog through its heading', async () => {
        const [named] = await mount('<ful-dialog header="the header">the body</ful-dialog>');
        const native = named.querySelector('dialog');
        const heading = named.querySelector('h2');
        assert.ok(heading.id, 'the heading is named');
        assert.strictEqual(native.getAttribute('aria-labelledby'), heading.id, 'the dialog is named by its heading');

        const [plain] = await mount('<ful-dialog>the body</ful-dialog>');
        assert.isNull(
            plain.querySelector('dialog').getAttribute('aria-labelledby'),
            'without a header attribute there is no heading, so the dialog is left unnamed',
        );
    });

    it('ask() answers with the acknowledge result', async () => {
        const [dialog] = await mount('<ful-dialog>body</ful-dialog>');
        const asked = dialog.ask();

        assert.isTrue(dialog.querySelector('dialog').open, 'ask() shows the native dialog as a modal');
        dialog.querySelector('[data-ref=acknowledge]').click();
        assert.deepStrictEqual(
            await asked,
            { dismissed: false, result: 'acknowledged', response: null },
            'the acknowledge button answers acknowledged, which is neither a dismissal nor a form response',
        );
        assert.isFalse(dialog.querySelector('dialog').open, 'answering closes the native dialog');
    });

    it('ask() answers with the data-result of the slotted button that closed it', async () => {
        const [dialog] = await mount(`
            <ful-dialog>
                body
                <template slot="buttons">
                    <button type="button" data-result="confirmed">Confirm</button>
                    <button type="button" data-result="dismissed">Dismiss</button>
                </template>
            </ful-dialog>`);
        assert.isNull(dialog.querySelector('[data-ref=acknowledge]'), 'no default button beside the slotted ones');

        const asked = dialog.ask();
        dialog.querySelector('button[data-result=dismissed]').click();

        assert.deepStrictEqual(
            await asked,
            { dismissed: false, result: 'dismissed', response: null },
            'a slotted button answers with its own data-result, whatever the word, and that is not a dismissal',
        );
    });

    it('answers a dismissal when the dialog closes without a result, as Escape does', async () => {
        const [dialog] = await mount('<ful-dialog>body</ful-dialog>');
        const asked = dialog.ask();

        dialog.querySelector('dialog').close();

        assert.deepStrictEqual(
            await asked,
            { dismissed: true, result: null, response: null },
            'closing without a result is a dismissal carrying neither result nor response',
        );
    });

    it('an Escape after an earlier answer is a dismissal, not the earlier answer', async () => {
        const [dialog] = await mount('<ful-dialog>body</ful-dialog>');
        const first = dialog.ask();
        dialog.querySelector('[data-ref=acknowledge]').click();
        assert.strictEqual(
            (await first).result,
            'acknowledged',
            'the first opening is answered by the acknowledge button',
        );

        const results = [];
        dialog.addEventListener('close', (e) => results.push(e.detail.result));
        const second = dialog.ask();
        dialog.querySelector('dialog').close();

        assert.deepStrictEqual(
            await second,
            { dismissed: true, result: null, response: null },
            'the stale acknowledged is not the answer',
        );
        assert.deepStrictEqual(results, [null], 'the close event agrees');
    });

    it('a dialog leaving the document while open answers its waiters with a dismissal', async () => {
        const [dialog, container] = await mount('<ful-dialog>body</ful-dialog>');
        const asked = dialog.ask();
        container.remove();

        assert.isTrue((await asked).dismissed, 'the await does not hang on a destroyed element');
    });

    it('a dialog whose render threw answers a dismissal on removal, raising nothing over it', async () => {
        const container = appended('<ful-dialog header="broken"><ful-table src="/x"></ful-table></ful-dialog>');
        await Rendering.waitFor(container).then(
            () => undefined,
            () => undefined,
        );
        await settle();

        const dialog = container.firstElementChild;
        container.remove();
        await settle();

        assert.isFalse(
            dialog.isConnected,
            'the removal of a dialog whose render failed completes, raising nothing over the failure',
        );
    });

    it('answers with a close event carrying the answer', async () => {
        const [dialog] = await mount('<ful-dialog>body</ful-dialog>');
        const answers = [];
        dialog.addEventListener('close', (e) => answers.push(e.detail.result));

        const closed = new Promise((r) => dialog.addEventListener('close', r, { once: true }));
        dialog.ask();
        dialog.querySelector('[data-ref=acknowledge]').click();
        await closed;
        assert.deepStrictEqual(answers, ['acknowledged'], 'the close event carries the same result the waiters get');
    });

    it('renders a header for a slot alone, with no heading to show', async () => {
        const [dialog] = await mount(
            '<ful-dialog requires-answer><ful-badge slot="header">3</ful-badge>the body</ful-dialog>',
        );

        assert.isNotNull(
            dialog.querySelector('.ful-dialog-header ful-badge'),
            'the header slot is rendered in the header even with no header attribute and no close button',
        );
    });

    it('a dialog-target click on an open dialog leaves the answer to its opening', async () => {
        const [dialog, container] = await mount(`
            <ful-dialog id="target-dialog" header="h">body</ful-dialog>
            <a dialog-target="target-dialog">Vedi il dettaglio</a>`);

        const opened = dialog.open();
        container.querySelector('a').click();
        dialog.querySelector('[data-ref=acknowledge]').click();
        assert.strictEqual(
            (await opened).result,
            'acknowledged',
            'a dialog-target click on a dialog already open neither reopens it nor ends its opening, so the acknowledge still answers it',
        );
    });
});

describe('Dialog close-on-submit', () => {
    const form = (extra = '') => `
        <ful-dialog close-on-submit header="Edit">
            <ful-form data-ref="edit" ${extra}>
                <ful-input name="label" value="a">Label</ful-input>
                <button type="submit">Save</button>
            </ful-form>
        </ful-dialog>`;

    it('lets the body hold the side padding for a footer standing in it', async () => {
        const [dialog] = await mount(`
            <ful-dialog close-on-submit header="Edit">
                <ful-form>
                    <ful-input name="label" value="a">Label</ful-input>
                    <footer class="ful-dialog-footer"><button type="submit">Save</button></footer>
                </ful-form>
            </ful-dialog>`);
        dialog.ask();

        const footer = dialog.querySelector('.ful-dialog-footer');
        const header = dialog.querySelector('.ful-dialog-header');
        assert.strictEqual(getComputedStyle(footer).paddingLeft, '0px', 'the body already holds it');
        assert.notStrictEqual(getComputedStyle(header).paddingLeft, '0px', 'a header beside the body keeps its own');
        dialog.close();
    });

    it('leaves a footer button carrying a .ful-button variant to that variant', async () => {
        const [dialog] = await mount(`
            <ful-dialog header="Edit">
                <footer class="ful-dialog-footer">
                    <button class="ful-button ghost" data-ref="ghost">Cancel</button>
                    <button data-ref="plain">Save</button>
                </footer>
            </ful-dialog>`);
        dialog.ask();

        const ghost = getComputedStyle(dialog.querySelector('[data-ref=ghost]')).backgroundColor;
        const plain = getComputedStyle(dialog.querySelector('[data-ref=plain]')).backgroundColor;
        assert.strictEqual(ghost, 'rgba(0, 0, 0, 0)', 'the ghost variant keeps its transparent fill');
        assert.notStrictEqual(plain, 'rgba(0, 0, 0, 0)', 'a plain button is dressed by the footer');
        dialog.close();
    });

    it('renders no acknowledge button: the form it closes on is where its answer comes from', async () => {
        const [dialog] = await mount(form());

        assert.isNull(
            dialog.querySelector('[data-ref=acknowledge]'),
            'the acknowledge button is for the dialog that only announces something',
        );
        assert.isNotNull(dialog.querySelector('button[type=submit]'), "the form's own button stands");
    });

    it('keeps a slotted buttons set beside the form', async () => {
        const [dialog] = await mount(`
            <ful-dialog close-on-submit header="Edit">
                <ful-form><ful-input name="label" value="a">Label</ful-input><button type="submit">Save</button></ful-form>
                <template slot="buttons"><button type="button" data-result="later">Later</button></template>
            </ful-dialog>`);

        assert.isNull(
            dialog.querySelector('[data-ref=acknowledge]'),
            'close-on-submit withholds the acknowledge button even beside a slotted buttons set',
        );
        assert.isNotNull(dialog.querySelector('button[data-result=later]'), 'the slotted buttons are untouched');
    });

    it('still acknowledges where nothing said its answer comes from a form', async () => {
        const [dialog] = await mount('<ful-dialog header="Done">the body</ful-dialog>');

        assert.isNotNull(
            dialog.querySelector('[data-ref=acknowledge]'),
            'without close-on-submit or a buttons slot the dialog shows its acknowledge button',
        );
    });

    it('ask() answers with the response its own form submitted, no button carrying it', async () => {
        const [dialog] = await mount(form());
        const inner = dialog.querySelector('ful-form');
        AsyncEvents.asyncOn(inner, 'submit:requested', async () => ({ id: 7 }));

        const asked = dialog.ask();
        inner.querySelector('button[type=submit]').click();

        assert.deepStrictEqual(
            await asked,
            { dismissed: false, result: null, response: { id: 7 } },
            "under close-on-submit the answer is the form's response, with no result since no button carried one",
        );
    });
});

describe('Dialog subclass reuse', () => {
    it('a custom dialog keeps the card chrome through the class on the native dialog', async () => {
        class ConfirmDialog extends Dialog {
            static template = `
                <dialog data-ref="dialog" class="ful-dialog"><slot></slot></dialog>
            `;
        }
        registry.defineElement('x-confirm-dialog', ConfirmDialog);
        const [dialog] = await mount('<x-confirm-dialog>body</x-confirm-dialog>');

        assert.isTrue(
            dialog.querySelector('dialog').classList.contains('ful-dialog'),
            "the class written on the subclass's native dialog is kept, and the card chrome is styled by that class",
        );
        const asked = dialog.ask();
        assert.isTrue(dialog.querySelector('dialog').open, 'a subclass template keeps ask() showing the native dialog');
        dialog.close('done');
        assert.deepStrictEqual(
            await asked,
            { dismissed: false, result: 'done', response: null },
            'close(result) on a subclass answers the waiters with that result',
        );
    });
});

describe('Dialog dismissal', () => {
    it('closes on the header button and answers its waiters with a dismissal', async () => {
        const [dialog] = await mount('<ful-dialog header="Publish?">the body</ful-dialog>');
        const close = dialog.querySelector('header button[data-ref=close]');
        assert.strictEqual(
            close.getAttribute('aria-label'),
            'Close',
            "the header's close button is named for assistive technology with the localized Close",
        );

        const asked = dialog.ask();
        assert.isTrue(dialog.querySelector('dialog').open, 'ask() shows the native dialog');
        close.click();

        assert.deepStrictEqual(
            await asked,
            { dismissed: true, result: null, response: null },
            'a dismissal is not an answer',
        );
        assert.isFalse(dialog.querySelector('dialog').open, 'the close button closes the native dialog');
    });
    it('carries a header for the button even with no heading to show', async () => {
        const [dialog] = await mount('<ful-dialog>the body</ful-dialog>');

        assert.strictEqual(
            dialog.querySelectorAll('header button[data-ref=close]').length,
            1,
            'the header is rendered for its close button even without a header attribute',
        );
        assert.strictEqual(
            dialog.querySelectorAll('header h2').length,
            0,
            'without a header attribute there is no heading in that header',
        );
    });
    it('withholds the close button and refuses Escape under requires-answer', async () => {
        const [dialog] = await mount('<ful-dialog requires-answer header="Pick one">the body</ful-dialog>');
        const native = dialog.querySelector('dialog');

        assert.strictEqual(
            dialog.querySelectorAll('[data-ref=close]').length,
            0,
            'requires-answer withholds the close button',
        );

        dialog.ask();
        assert.isTrue(native.open, 'ask() shows the dialog under requires-answer as well');
        native.dispatchEvent(new Event('cancel', { cancelable: true }));
        assert.isTrue(native.open, 'Escape leaves it open, the button being gone');

        native.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        native.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        assert.isTrue(native.open, 'and a click outside it is refused for the same reason');

        dialog.close('answered');
        assert.isFalse(native.open, 'a result still closes it');
    });
    it('renders no header at all under requires-answer with nothing to head it', async () => {
        const [dialog] = await mount('<ful-dialog requires-answer>the body</ful-dialog>');

        assert.strictEqual(
            dialog.querySelectorAll('header').length,
            0,
            'with neither close button nor title nor header slot, no empty header is rendered',
        );
    });
    it('styles the chrome through the class wherever it stands, not only as a direct child', async () => {
        const [dialog] = await mount(
            '<ful-dialog header="h"><div><footer class="ful-dialog-footer" data-ref="nested"><button>a</button></footer></div></ful-dialog>',
        );
        const nested = dialog.querySelector('[data-ref=nested]');

        assert.strictEqual(
            getComputedStyle(nested).display,
            'flex',
            'a footer carrying the ful-dialog-footer class is laid out as a row even when not a direct child',
        );
        assert.strictEqual(
            getComputedStyle(nested).justifyContent,
            'flex-end',
            'the nested footer aligns its buttons to the end, as a direct child one does',
        );
    });
});

describe('Dialog.ask and Dialog.confirm', () => {
    const shown = () => document.body.querySelector(':scope > ful-dialog');
    afterEach(() => {
        document.querySelectorAll('body > ful-dialog').forEach((el) => {
            el.remove();
        });
    });

    it('ask builds, shows, answers and removes a transient dialog', async () => {
        const asked = Dialog.ask('Publish?', 'It goes live now.', [
            ['later', 'Later'],
            ['publish', 'Publish', 'ful-button'],
        ]);
        await settle();
        const dialog = shown();
        assert.ok(dialog, 'the dialog is in the page');
        assert.include(
            dialog.querySelector('[data-ref=body]').textContent,
            'It goes live now.',
            "a string body is rendered as the transient dialog's body",
        );
        assert.strictEqual(
            dialog.querySelector('dialog').getAttribute('aria-labelledby'),
            dialog.querySelector('h2').id,
            'the transient dialog is named through its heading',
        );
        const [later, publish] = dialog.querySelectorAll('footer button[data-result]');
        assert.strictEqual(later.textContent, 'Later', "a tuple's label is the button's text");
        assert.strictEqual(later.className, '', 'a tuple without a class name renders a button with no class');
        assert.strictEqual(publish.textContent, 'Publish', "the second tuple's label is its button's text");
        assert.strictEqual(publish.className, 'ful-button', "a tuple's third element is set as the button's class");
        assert.isTrue(dialog.querySelector('dialog').open, 'Dialog.ask shows the transient dialog it built');

        publish.click();
        assert.deepStrictEqual(
            await asked,
            { dismissed: false, result: 'publish', response: null },
            'the clicked tuple button answers with its result',
        );
        assert.isNull(shown(), 'the transient dialog is removed once answered');
    });

    it('ask never reads a string body as markup', async () => {
        const asked = Dialog.ask('Watch out', '<img src=x onerror=window.__leaked=1>');
        await settle();
        assert.isNull(shown().querySelector('[data-ref=body] img'), 'the string is text');

        shown().querySelector('[data-result=acknowledged]').click();
        assert.deepStrictEqual(
            await asked,
            { dismissed: false, result: 'acknowledged', response: null },
            'with no buttons given the localized acknowledge button answers',
        );
    });

    it('ask takes a node for a body of markup', async () => {
        const paragraph = document.createElement('p');
        paragraph.textContent = 'from a node';
        const asked = Dialog.ask('Q', paragraph);
        await settle();
        assert.include(
            shown().querySelector('[data-ref=body]').textContent,
            'from a node',
            'a node body is appended into the body as it is',
        );

        shown().querySelector('[data-result=acknowledged]').click();
        await asked;
    });

    it('dresses the dialog with the class it is given, as a declared one is', async () => {
        const asked = Dialog.ask('Wide question', 'body', [['ok', 'OK']], { className: 'widest' });
        await settle();
        assert.isTrue(
            shown().closest('ful-dialog').classList.contains('widest'),
            'the className option is set as the class of the ful-dialog element',
        );

        shown().querySelector('[data-result=ok]').click();
        await asked;
    });

    it('takes a button the caller built, beside the tuples', async () => {
        const spacer = document.createElement('span');
        spacer.className = 'spacer';
        const mine = document.createElement('button');
        mine.type = 'button';
        mine.dataset.result = 'mine';
        mine.setAttribute('aria-label', 'the long name a tuple cannot carry');
        mine.textContent = 'Mine';
        const asked = Dialog.ask('Q', 'body', [['cancel', 'Cancel'], spacer, mine]);
        await settle();
        const footer = shown().querySelector('footer');
        assert.deepEqual(
            [...footer.children].map((el) => el.localName),
            ['button', 'span', 'button'],
            "the caller's nodes keep their place among the tuples",
        );
        assert.strictEqual(
            footer.querySelector('[data-result=mine]').getAttribute('aria-label'),
            'the long name a tuple cannot carry',
            'a caller-built button keeps the attributes it was given',
        );

        footer.querySelector('[data-result=mine]').click();
        assert.deepEqual(
            await asked,
            { dismissed: false, result: 'mine', response: null },
            'a caller-built button carrying data-result answers with it like a tuple would',
        );
    });

    it('confirm answers true on confirm, false on cancel and on dismissal', async () => {
        const confirmed = Dialog.confirm('Delete this page?', 'It is removed from client sites.', {
            confirm: 'Delete',
        });
        await settle();
        const [cancel, confirm] = shown().querySelectorAll('footer button[data-result]');
        assert.strictEqual(
            cancel.textContent,
            'Cancel',
            'with no cancel label given the cancel button carries the localized default',
        );
        assert.strictEqual(confirm.textContent, 'Delete', "the confirm label given is the confirm button's text");

        confirm.click();
        assert.isTrue(await confirmed, 'the confirm button answers true');

        const cancelled = Dialog.confirm('Delete this page?', 'x');
        await settle();
        shown().querySelector('[data-result=cancel]').click();
        assert.isFalse(await cancelled, 'the cancel button is a no');

        const dismissed = Dialog.confirm('Delete this page?', 'x');
        await settle();
        shown().querySelector('header button[data-ref=close]').click();
        assert.isFalse(await dismissed, 'a dismissal is a no');
    });
});

const elements = [
    { tag: 'ful-dialog', content: 'body', open: (el) => void el.ask(), update: (el, cb) => el.update(cb) },
    { tag: 'ful-drawer', content: 'content', open: (el) => el.open(), update: (el, cb) => el.update('title', cb) },
];
const closed = async (el) => {
    const done = new Promise((resolve) => el.addEventListener('close', resolve, { once: true }));
    el.close();
    await done;
};

for (const { tag, content, open, update } of elements) {
    const editing = `
        <${tag} close-on-submit header="Edit">
            <ful-form><ful-input name="label" value="a">Label</ful-input><button type="submit">Save</button></ful-form>
        </${tag}>`;
    const submitted = async (el, answer) => {
        const form = el.querySelector('ful-form');
        AsyncEvents.asyncOn(form, 'submit:requested', answer);
        const done = new Promise((r) => el.addEventListener('close', (e) => r(e.detail), { once: true }));
        form.querySelector('button[type=submit]').click();
        return await done;
    };

    describe(`${tag}, the shared sections`, () => {
        it('update() opens it, shows the loading section while it waits, and paints the delivery', async () => {
            const [el] = await mount(`<${tag} header="t">old</${tag}>`);
            const loading = el.querySelector('[data-ref=loading]');
            const section = el.querySelector(`[data-ref=${content}]`);
            const { promise, resolve } = Promise.withResolvers();

            const updated = update(el, () => promise);
            assert.isTrue(el.querySelector('dialog').open, 'the delivery opens it');
            assert.isFalse(loading.hasAttribute('hidden'), 'the loading section covers the wait');
            assert.isTrue(section.hasAttribute('hidden'), 'an empty content is not shown while it waits');

            const delivered = document.createElement('p');
            delivered.textContent = 'the detail';
            resolve(delivered);
            const resolved = await updated;

            assert.isTrue(resolved === section, 'update resolves with the content section');
            assert.isTrue(
                delivered.parentElement === section,
                'the delivered node is appended into the content section',
            );
            assert.notInclude(
                section.textContent,
                'old',
                'the previous content is emptied before the delivery is painted',
            );
            assert.isTrue(
                loading.hasAttribute('hidden'),
                'the loading section is hidden again once the delivery is painted',
            );
            assert.isFalse(section.hasAttribute('hidden'), 'the content section is shown once the delivery is painted');
        });

        it('update() paints a problem without a reason as the localized no-reason message', async () => {
            const [el] = await mount(`<${tag} header="t">body</${tag}>`);
            const failure = new Failure('500 Internal Server Error', [
                { type: 'UNEXPECTED_PROBLEM', context: null, reason: null, details: null },
            ]);

            await update(el, async () => {
                throw failure;
            }).catch(() => undefined);

            assert.strictEqual(
                el.querySelector('[data-ref=error]').textContent,
                'Something went wrong',
                'a problem with no reason is shown with the localized no-reason message',
            );
        });

        it('update() paints the reasons of a rejection and still rejects its caller', async () => {
            const [el] = await mount(`<${tag} header="t">body</${tag}>`);
            const failure = new Failure('invalid', [
                { type: 'FIELD_ERROR', context: null, reason: 'must not be blank' },
                { type: 'GENERIC_PROBLEM', context: null, reason: 'start is after end' },
            ]);

            await update(el, async () => {
                throw failure;
            }).then(
                () => assert.fail('the rejection travels to the caller'),
                (e) => assert.isTrue(e === failure, "the caller's rejection is the very error the callback threw"),
            );

            const error = el.querySelector('[data-ref=error]');
            assert.isFalse(error.hasAttribute('hidden'), 'the problems are shown');
            assert.include(
                error.textContent,
                'must not be blank',
                'the reason of the field problem is shown in the error section',
            );
            assert.include(
                error.textContent,
                'start is after end',
                'the reason of the generic problem is shown in the error section',
            );
            assert.isTrue(
                el.querySelector('[data-ref=loading]').hasAttribute('hidden'),
                'the loading section is hidden once the failure is shown',
            );
            assert.isTrue(
                el.querySelector(`[data-ref=${content}]`).hasAttribute('hidden'),
                'the content section is hidden while the error section shows the failure',
            );
        });

        it('reveals the error region before filling it, so the live region announces the problems', async () => {
            const [el] = await mount(`<${tag} header="t">body</${tag}>`);
            const error = el.querySelector('[data-ref=error]');
            const kinds = [];
            const observer = new MutationObserver((records) => {
                kinds.push(...records.map((r) => (r.type === 'attributes' ? 'revealed' : 'filled')));
            });
            observer.observe(error, { attributes: true, attributeFilter: ['hidden'], childList: true });

            await update(el, () => Promise.reject(new Error('no such thing'))).catch(() => undefined);
            observer.disconnect();

            assert.strictEqual(
                kinds.slice(-2).join(','),
                'revealed,filled',
                'the error region is revealed before it is filled, so a live region announces the problems as they arrive',
            );
            assert.include(error.textContent, 'no such thing', 'a failure with no problems shows its message');
            await closed(el);
        });

        it('a superseded update() paints nothing, resolving with the section the newer one filled', async () => {
            const [el] = await mount(`<${tag} header="t">body</${tag}>`);
            const first = Promise.withResolvers();
            const stale = update(el, () => first.promise);
            const fresh = document.createElement('p');
            fresh.textContent = 'the second';
            const freshSection = await update(el, async () => fresh);

            const abandoned = document.createElement('p');
            abandoned.textContent = 'the first';
            first.resolve(abandoned);
            const staleSection = await stale;

            assert.isTrue(staleSection === freshSection, 'there is one content section, shared by the openings');
            assert.isFalse(abandoned.isConnected, 'the superseded delivery was never painted');
            assert.include(
                freshSection.textContent,
                'the second',
                'the newer delivery is the one painted in the section',
            );
            assert.isTrue(
                el.querySelector('[data-ref=loading]').hasAttribute('hidden'),
                'the loading section is hidden once the newer delivery is painted',
            );
        });

        it('fires section:requested for the content when opened, first only the first time', async () => {
            const [el] = await mount(`<${tag} header="t"></${tag}>`);
            const seen = [];
            AsyncEvents.asyncOn(el, 'section:requested', (e) => {
                seen.push(`${e.detail.first}|${e.detail.name}|${e.detail.index}`);
                e.detail.section.append('delivered');
            });

            open(el);
            await settle();
            assert.deepStrictEqual(
                seen,
                ['true|null|null'],
                'the first opening requests the content once, with first true and no name or index',
            );
            assert.include(
                el.querySelector(`[data-ref=${content}]`).textContent,
                'delivered',
                'what the listener appends into the requested section is shown as the content',
            );

            await closed(el);
            await settle();
            open(el);
            await settle();
            assert.deepStrictEqual(
                seen,
                ['true|null|null', 'false|null|null'],
                'a later opening requests the content again with first false',
            );
            await closed(el);
        });

        it('fires nothing when update() owns the cycle, nor on an open while it stands', async () => {
            const [el] = await mount(`<${tag} header="t"></${tag}>`);
            let fired = 0;
            AsyncEvents.asyncOn(el, 'section:requested', () => {
                ++fired;
            });

            await update(el, async () => document.createElement('p'));
            open(el);
            await settle();
            assert.strictEqual(
                fired,
                0,
                'neither update() nor an open while its delivery stands dispatches section:requested',
            );

            await closed(el);
            await settle();
            open(el);
            await settle();
            assert.strictEqual(fired, 1, 'a later declarative open asks again');
            await closed(el);
        });

        it('refresh re-fires the content request, its failures painted and swallowed', async () => {
            const [el] = await mount(`<${tag} header="t">body</${tag}>`);
            let fail = true;
            AsyncEvents.asyncOn(el, 'section:requested', () => {
                if (fail) {
                    throw new Error('boom');
                }
            });

            assert.isUndefined(await el.refresh(), 'refresh swallows a failed request and resolves with undefined');
            assert.isNotNull(
                el.querySelector(`[data-ref=${content}] > .ful-section-error`),
                'the failed request is painted into the content section',
            );

            fail = false;
            await el.refresh();
            assert.isNull(
                el.querySelector(`[data-ref=${content}] > .ful-section-error`),
                'a successful refresh replaces the painted failure',
            );
        });

        it('renders the header slot in the header, before the heading and outside it', async () => {
            const [el] = await mount(`<${tag} header="Nave"><i slot="header" class="bi bi-water"></i>body</${tag}>`);
            const header = el.querySelector('header');

            assert.strictEqual(
                header.querySelector('i')?.className,
                'bi bi-water',
                'the header slot is rendered inside the header',
            );
            assert.strictEqual(header.firstElementChild.localName, 'i', 'before the heading');
            assert.isNull(header.querySelector('h2 i'), 'outside the heading, which is text');
            assert.strictEqual(
                header.querySelector('h2').textContent.trim(),
                'Nave',
                'the heading still shows the header attribute as its text',
            );
        });

        it('opens from any element carrying dialog-target, clones included', async () => {
            const [el, container] = await mount(`
                <${tag} id="target-${tag}" header="t">body</${tag}>
                <button type="button" dialog-target="target-${tag}">details</button>`);
            const native = el.querySelector('dialog');
            const trigger = container.querySelector('[dialog-target]');
            const cloned = trigger.cloneNode(true);
            container.appendChild(cloned);

            trigger.click();
            assert.isTrue(native.open, 'a click on a dialog-target element opens the element it names');
            trigger.click();
            assert.isTrue(native.open, 'a click on an open one is a no-op, not a crash');
            await closed(el);
            assert.isFalse(native.open, 'closing works after the repeated click on the open one');

            cloned.click();
            assert.isTrue(native.open, 'the cloned trigger opens it');
            await closed(el);
        });

        it('dismisses on a press and release both on the backdrop', async () => {
            const [el] = await mount(`<${tag} header="t">body</${tag}>`);
            const native = el.querySelector('dialog');
            const done = new Promise((r) => el.addEventListener('close', (e) => r(e.detail), { once: true }));
            open(el);

            native.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            native.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            const detail = await done;

            assert.isFalse(native.open, 'a press and release on the backdrop close the native dialog');
            assert.isTrue(detail.dismissed, 'a backdrop click is a dismissal like any other');
            assert.isNull(detail.response, 'a dismissal carries no form response');
        });

        it('stays open when a click inside it merely ends over the backdrop', async () => {
            const [el] = await mount(`<${tag} header="t"><p data-ref="inside">body</p></${tag}>`);
            const native = el.querySelector('dialog');
            open(el);

            el.querySelector('[data-ref=inside]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            native.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            assert.isTrue(
                native.open,
                'a press that started inside the panel does not dismiss when it is released over the backdrop, so a dragged selection does not close it',
            );
            await closed(el);
        });

        it('closes on its own form succeeding, the close event carrying the response', async () => {
            const [el] = await mount(editing);
            open(el);

            const detail = await submitted(el, async () => ({ id: 7 }));

            assert.isFalse(
                el.querySelector('dialog').open,
                'a successful submit of the form in the content closes the native dialog',
            );
            assert.isFalse(detail.dismissed, 'a submit that succeeds is an answer, not a dismissal');
            assert.strictEqual(detail.response?.id, 7, 'the close event carries the response the form answered with');
        });

        it('a submit answering with no body at all is still an answer, not a dismissal', async () => {
            const [el] = await mount(editing);
            open(el);

            const detail = await submitted(el, async () => null);

            assert.isFalse(detail.dismissed, 'a 204 answers, and dismissed is what says so');
            assert.isNull(detail.response, 'a submit answering with no body carries a null response');
        });

        it('a reopening owes nothing to the submit before it: a later close is a dismissal', async () => {
            const [el] = await mount(editing);
            const dismissals = [];
            el.addEventListener('close', (e) => dismissals.push(e.detail.dismissed));
            open(el);
            await submitted(el, async () => ({ id: 7 }));

            open(el);
            await closed(el);

            assert.strictEqual(
                dismissals.join(','),
                'false,true',
                'the reopening starts with a fresh outcome, so its plain close is a dismissal where the submit before it answered',
            );
        });

        it('stays open on a failed submit, the form keeping the problems', async () => {
            const [el] = await mount(editing);
            const form = el.querySelector('ful-form');
            AsyncEvents.asyncOn(form, 'submit:requested', async () => {
                throw new Error('rejected upstream');
            });

            open(el);
            form.querySelector('button[type=submit]').click();
            await settle();

            assert.isTrue(el.querySelector('dialog').open, 'the problems are of no use behind a closed one');
            await closed(el);
        });

        it('closes on a form update() delivered, the listener outliving every delivery', async () => {
            const [el] = await mount(`<${tag} close-on-submit header="Edit"></${tag}>`);
            const delivered = document.createElement('ful-form');
            delivered.innerHTML =
                '<ful-input name="label" value="a">Label</ful-input><button type="submit">Save</button>';

            await update(el, async () => delivered);
            await settle();
            const detail = await submitted(el, async () => ({ id: 9 }));

            assert.isFalse(
                detail.dismissed,
                'a form delivered by update() answers the dialog on success, as the body listener covers it',
            );
            assert.strictEqual(detail.response?.id, 9, 'the close event carries the response of the delivered form');
        });

        it('is not answered by a form of its own content: a table searching is not it closing', async () => {
            const [el] = await mount(`
                <${tag} close-on-submit header="Pick">
                    <ful-table page-size="5">
                        <div slot="filters">
                            <ful-filter-text name="byName">Name</ful-filter-text>
                            <button type="submit">Search</button>
                        </div>
                        <template slot="schema"><schema><column title="Name">{{ name }}</column></schema></template>
                    </ful-table>
                </${tag}>`);

            open(el);
            el.querySelector('ful-table button[type=submit]').click();
            await settle();

            assert.isTrue(el.querySelector('dialog').open, "the table's own filter form is not its own");
            await closed(el);
        });

        it('leaves one that did not ask for close-on-submit alone', async () => {
            const [el] = await mount(`
                <${tag} header="Edit">
                    <ful-form><ful-input name="label" value="a">Label</ful-input><button type="submit">Save</button></ful-form>
                </${tag}>`);
            const form = el.querySelector('ful-form');
            AsyncEvents.asyncOn(form, 'submit:requested', async () => ({ id: 7 }));

            open(el);
            form.querySelector('button[type=submit]').click();
            await settle();

            assert.isTrue(el.querySelector('dialog').open, 'closing on submit is opt in');
            await closed(el);
        });
    });
}
