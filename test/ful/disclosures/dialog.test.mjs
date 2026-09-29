import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { AsyncEvents, Plugin, Dialog } from '../../../src/ful/index.mjs';
import { appended, settle as drain } from '../../harness.mjs';


registry.plugin(new Plugin({ language: 'en' })).configure();

const settle = () => drain(20, 80);
const mount = async (html) => {
    const container = appended(html);
    await Rendering.waitFor(container);
    await settle();
    return [container.firstElementChild, container];
};


describe('Dialog', () => {
    it('shows the header, the body and the localized acknowledge button', async () => {
        const [dialog] = await mount('<ful-dialog header="the header">the body</ful-dialog>');

        assert.isNotNull(dialog.querySelector('header h2')?.textContent.match(/the header/));
        assert.include(dialog.querySelector("[data-ref='body']").textContent, 'the body');
        assert.strictEqual(dialog.querySelector('[data-ref=acknowledge]').textContent, 'Got it');
    });

    it('names the dialog through its heading', async () => {
        const [named] = await mount('<ful-dialog header="the header">the body</ful-dialog>');
        const native = named.querySelector('dialog');
        const heading = named.querySelector('h2');
        assert.ok(heading.id, 'the heading is named');
        assert.strictEqual(native.getAttribute('aria-labelledby'), heading.id, 'the dialog is named by its heading');

        //a headerless dialog has no heading to point at: the author names it
        //through aria-label of their own
        const [plain] = await mount('<ful-dialog>the body</ful-dialog>');
        assert.isNull(plain.querySelector('dialog').getAttribute('aria-labelledby'));
    });

    it('ask() answers with the acknowledge result', async () => {
        const [dialog] = await mount('<ful-dialog>body</ful-dialog>');
        const asked = dialog.ask();

        assert.isTrue(dialog.querySelector('dialog').open);
        dialog.querySelector('[data-ref=acknowledge]').click();
        assert.deepStrictEqual(await asked, { dismissed: false, result: 'acknowledged', response: null });
        assert.isFalse(dialog.querySelector('dialog').open);
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

        assert.deepStrictEqual(await asked, { dismissed: false, result: 'dismissed', response: null });
    });

    it('answers a dismissal when the dialog closes without a result, as Escape does', async () => {
        const [dialog] = await mount('<ful-dialog>body</ful-dialog>');
        const asked = dialog.ask();

        dialog.querySelector('dialog').close();

        assert.deepStrictEqual(await asked, { dismissed: true, result: null, response: null });
    });

    it('an Escape after an earlier answer is a dismissal, not the earlier answer', async () => {
        const [dialog] = await mount('<ful-dialog>body</ful-dialog>');
        const first = dialog.ask();
        dialog.querySelector('[data-ref=acknowledge]').click();
        assert.strictEqual((await first).result, 'acknowledged');

        const results = [];
        dialog.addEventListener('close', (e) => results.push(e.detail.result));
        const second = dialog.ask();
        dialog.querySelector('dialog').close();

        assert.isTrue((await second).dismissed, 'the stale acknowledged is not the answer');
        assert.deepStrictEqual(results, [null], 'the close event agrees');
    });

    it('a dialog leaving the document while open answers its waiters with null', async () => {
        const [dialog, container] = await mount('<ful-dialog>body</ful-dialog>');
        const asked = dialog.ask();
        //the removal is the subject of the test, not its teardown
        container.remove();

        assert.isTrue((await asked).dismissed, 'the await does not hang on a destroyed element');
    });

    it('a dialog whose render threw answers a dismissal on removal, raising nothing over it', async () => {
        //the table is the render failure: it declares no schema
        const container = appended('<ful-dialog header="broken"><ful-table src="/x"></ful-table></ful-dialog>');
        await Rendering.waitFor(container).then(
            () => undefined,
            () => undefined,
        );
        await settle();

        const dialog = container.firstElementChild;
        //the removal is the subject: it must not raise a second failure over the first
        container.remove();
        await settle();

        assert.isFalse(dialog.isConnected);
    });

    it('answers with a close event carrying the answer', async () => {
        const [dialog] = await mount('<ful-dialog>body</ful-dialog>');
        const answers = [];
        dialog.addEventListener('close', (e) => answers.push(e.detail.result));

        //the close event is what the test is waiting for: waiting a macrotask
        //instead leaves it one scheduling hiccup away from failing
        const closed = new Promise((r) => dialog.addEventListener('close', r, { once: true }));
        dialog.ask();
        dialog.querySelector('[data-ref=acknowledge]').click();
        await closed;
        assert.deepStrictEqual(answers, ['acknowledged']);
    });

    it('carries a header slot beside the heading, as the drawer does', async () => {
        const [dialog] = await mount(`
            <ful-dialog header="Seleziona Master">
                <i slot="header" class="bi bi-layers" aria-hidden="true"></i>
                the body
            </ful-dialog>`);

        const header = dialog.querySelector('.ful-dialog-header');
        assert.isNotNull(header.querySelector('i.bi-layers'), 'the slotted content stands in the header');
        assert.isNull(
            header.querySelector('h2 i.bi-layers'),
            'beside the heading rather than in it, the heading being text the header attribute sets',
        );
        assert.strictEqual(header.querySelector('h2').textContent.trim(), 'Seleziona Master');
    });

    it('renders a header for a slot alone, with no heading to show', async () => {
        const [dialog] = await mount(
            '<ful-dialog requires-answer><ful-badge slot="header">3</ful-badge>the body</ful-dialog>',
        );

        assert.isNotNull(dialog.querySelector('.ful-dialog-header ful-badge'));
    });

    it('any element carrying dialog-target opens the dialog it names, clones included', async () => {
        const [dialog, container] = await mount(`
            <ful-dialog id="target-dialog" header="h">body</ful-dialog>
            <a dialog-target="target-dialog">Vedi il dettaglio</a>`);
        const trigger = container.querySelector('a');
        const cloned = trigger.cloneNode(true);
        container.appendChild(cloned);

        const opened = dialog.open();
        trigger.click();
        dialog.querySelector('[data-ref=acknowledge]').click();
        assert.strictEqual((await opened).result, 'acknowledged', 'opening an open dialog is a no-op, not a crash');

        const again = dialog.ask();
        cloned.click();
        assert.isTrue(dialog.querySelector('dialog').open, 'the cloned trigger opens the dialog');
        dialog.querySelector('[data-ref=acknowledge]').click();
        assert.strictEqual((await again).result, 'acknowledged');
    });
});

describe('Dialog delivery', () => {
    it('update() opens the dialog, shows the ring while it waits and paints what it delivers', async () => {
        const [dialog] = await mount('<ful-dialog header="Detail"></ful-dialog>');
        const loading = dialog.querySelector('[data-ref=loading]');
        const body = dialog.querySelector('[data-ref=body]');
        const { promise, resolve } = Promise.withResolvers();

        const updated = dialog.update(() => promise);
        assert.isTrue(dialog.querySelector('dialog').open, 'the delivery opens it');
        assert.isFalse(loading.hasAttribute('hidden'), 'the ring covers the wait');
        assert.isTrue(body.hasAttribute('hidden'), 'an empty body is not shown while it waits');

        const delivered = document.createElement('p');
        delivered.textContent = 'the detail';
        resolve(delivered);
        await updated;

        assert.isTrue(loading.hasAttribute('hidden'));
        assert.isFalse(body.hasAttribute('hidden'));
        assert.include(body.textContent, 'the detail');
    });

    it('update() paints the problems of a rejection and still rejects its caller', async () => {
        const [dialog] = await mount('<ful-dialog header="Detail"></ful-dialog>');
        const error = dialog.querySelector('[data-ref=error]');

        const failed = dialog.update(() => Promise.reject(new Error('no such thing')));
        await failed.then(
            () => assert.fail('the rejection travels to the caller'),
            () => undefined,
        );

        assert.isFalse(error.hasAttribute('hidden'), 'the problems are shown');
        assert.include(error.textContent, 'no such thing');
        assert.isTrue(dialog.querySelector('[data-ref=loading]').hasAttribute('hidden'));
    });

    it('a delivery superseded by a newer one paints nothing', async () => {
        const [dialog] = await mount('<ful-dialog header="Detail"></ful-dialog>');
        const body = dialog.querySelector('[data-ref=body]');
        const first = Promise.withResolvers();

        const stale = dialog.update(() => first.promise);
        const fresh = document.createElement('p');
        fresh.textContent = 'the second';
        await dialog.update(() => Promise.resolve(fresh));

        const abandoned = document.createElement('p');
        abandoned.textContent = 'the first';
        first.resolve(abandoned);
        await stale;

        assert.include(body.textContent, 'the second');
        assert.notInclude(body.textContent, 'the first', 'the abandoned opening owns no dialog');
    });

    it('reveals the error region before filling it, so the live region announces the problems', async () => {
        const [dialog] = await mount('<ful-dialog header="Detail"></ful-dialog>');
        const error = dialog.querySelector('[data-ref=error]');
        const kinds = [];
        const observer = new MutationObserver((records) => {
            kinds.push(...records.map((r) => (r.type === 'attributes' ? 'revealed' : 'filled')));
        });
        observer.observe(error, { attributes: true, attributeFilter: ['hidden'], childList: true });

        await dialog.update(() => Promise.reject(new Error('no such thing'))).catch(() => undefined);
        observer.disconnect();

        assert.strictEqual(kinds.slice(-2).join(','), 'revealed,filled');
        dialog.close();
    });

    it('a reopening owes nothing to the answer before it', async () => {
        const [dialog] = await mount('<ful-dialog>body</ful-dialog>');
        const asked = dialog.ask();
        dialog.querySelector('[data-ref=acknowledge]').click();
        assert.strictEqual((await asked).result, 'acknowledged');

        const again = dialog.ask();
        dialog.querySelector('dialog').close();
        assert.deepStrictEqual(await again, { dismissed: true, result: null, response: null });
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

    it("lets the body hold the side padding for a footer standing in it", async () => {
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

        assert.isNull(dialog.querySelector('[data-ref=acknowledge]'));
        assert.isNotNull(dialog.querySelector('button[data-result=later]'), 'the slotted buttons are untouched');
    });

    it('still acknowledges where nothing said its answer comes from a form', async () => {
        const [dialog] = await mount('<ful-dialog header="Done">the body</ful-dialog>');

        assert.isNotNull(dialog.querySelector('[data-ref=acknowledge]'));
    });

    it('answers with the response its own form submitted, closing the dialog', async () => {
        const [dialog] = await mount(form());
        const inner = dialog.querySelector('ful-form');
        AsyncEvents.asyncOn(inner, 'submit:requested', async () => ({ id: 7 }));

        const asked = dialog.ask();
        inner.querySelector('button[type=submit]').click();
        const answer = await asked;

        assert.isFalse(answer.dismissed);
        assert.isNull(answer.result, 'no button carried the answer');
        assert.deepStrictEqual(answer.response, { id: 7 });
        assert.isFalse(dialog.querySelector('dialog').open);
    });

    it('a submit answering with no body at all is still an answer, not a dismissal', async () => {
        const [dialog] = await mount(form());
        const inner = dialog.querySelector('ful-form');
        AsyncEvents.asyncOn(inner, 'submit:requested', async () => null);

        const asked = dialog.ask();
        inner.querySelector('button[type=submit]').click();
        const answer = await asked;

        assert.isFalse(answer.dismissed, 'a 204 answers, and dismissed is what says so');
        assert.isNull(answer.response);
    });

    it('stays open on a failed submit, the form keeping the problems', async () => {
        const [dialog] = await mount(form());
        const inner = dialog.querySelector('ful-form');
        AsyncEvents.asyncOn(inner, 'submit:requested', async () => {
            throw new Error('rejected upstream');
        });

        dialog.ask();
        inner.querySelector('button[type=submit]').click();
        await settle();

        assert.isTrue(dialog.querySelector('dialog').open, 'the problems are of no use behind a closed dialog');
    });

    it('is not answered by a form of its own content: a table searching is not the dialog closing', async () => {
        const [dialog] = await mount(`
            <ful-dialog close-on-submit header="Pick">
                <ful-table page-size="5">
                    <div slot="filters">
                        <ful-filter-text name="byName">Name</ful-filter-text>
                        <button type="submit">Search</button>
                    </div>
                    <template slot="schema"><schema><column title="Name">{{ name }}</column></schema></template>
                </ful-table>
            </ful-dialog>`);

        dialog.ask();
        dialog.querySelector('ful-table button[type=submit]').click();
        await settle();

        assert.isTrue(dialog.querySelector('dialog').open, "the table's own filter form is not the dialog's");
    });

    it('closes on a form update() delivered, the listener outliving every delivery', async () => {
        const [dialog] = await mount('<ful-dialog close-on-submit header="Edit"></ful-dialog>');
        const delivered = document.createElement('ful-form');
        delivered.innerHTML = '<ful-input name="label" value="a">Label</ful-input><button type="submit">Save</button>';

        const body = await dialog.update(async () => delivered);
        await settle();
        const inner = body.querySelector('ful-form');
        AsyncEvents.asyncOn(inner, 'submit:requested', async () => ({ id: 9 }));
        const closed = new Promise((r) => dialog.addEventListener('close', (e) => r(e.detail), { once: true }));
        inner.querySelector('button[type=submit]').click();
        const outcome = await closed;

        assert.isFalse(outcome.dismissed);
        assert.strictEqual(outcome.response?.id, 9);
    });

    it('leaves a dialog that did not ask for it alone', async () => {
        const [dialog] = await mount(`
            <ful-dialog header="Edit">
                <ful-form><ful-input name="label" value="a">Label</ful-input><button type="submit">Save</button></ful-form>
            </ful-dialog>`);
        const inner = dialog.querySelector('ful-form');
        AsyncEvents.asyncOn(inner, 'submit:requested', async () => ({ id: 7 }));

        dialog.ask();
        inner.querySelector('button[type=submit]').click();
        await settle();

        assert.isTrue(dialog.querySelector('dialog').open, 'closing on submit is opt in');
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

        assert.isTrue(dialog.querySelector('dialog').classList.contains('ful-dialog'));
        const asked = dialog.ask();
        assert.isTrue(dialog.querySelector('dialog').open);
        dialog.close('done');
        assert.deepStrictEqual(await asked, { dismissed: false, result: 'done', response: null });
    });
});

describe('Dialog dismissal', () => {
    it('closes on the header button and answers its waiters with a dismissal', async () => {
        const [dialog] = await mount('<ful-dialog header="Publish?">the body</ful-dialog>');
        const close = dialog.querySelector('header button[data-ref=close]');
        assert.strictEqual(close.getAttribute('aria-label'), 'Close');

        const asked = dialog.ask();
        assert.isTrue(dialog.querySelector('dialog').open);
        close.click();

        assert.deepStrictEqual(
            await asked,
            { dismissed: true, result: null, response: null },
            'a dismissal is not an answer',
        );
        assert.isFalse(dialog.querySelector('dialog').open);
    });
    it('carries a header for the button even with no heading to show', async () => {
        const [dialog] = await mount('<ful-dialog>the body</ful-dialog>');

        assert.strictEqual(dialog.querySelectorAll('header button[data-ref=close]').length, 1);
        assert.strictEqual(dialog.querySelectorAll('header h2').length, 0);
    });
    it('withholds the close button and refuses Escape under requires-answer', async () => {
        const [dialog] = await mount('<ful-dialog requires-answer header="Pick one">the body</ful-dialog>');
        const native = dialog.querySelector('dialog');

        assert.strictEqual(dialog.querySelectorAll('[data-ref=close]').length, 0);

        dialog.ask();
        assert.isTrue(native.open);
        //the platform's own dismissal, which the cancel event is the hook for
        native.dispatchEvent(new Event('cancel', { cancelable: true }));
        assert.isTrue(native.open, 'Escape leaves it open, the button being gone');

        native.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        native.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        assert.isTrue(native.open, 'and a click outside it is refused for the same reason');

        dialog.close('answered');
        assert.isFalse(native.open, 'a result still closes it');
    });
    it('dismisses on a click outside the dialog, as the close button does', async () => {
        const [dialog] = await mount('<ful-dialog header="Pick one">the body</ful-dialog>');
        const native = dialog.querySelector('dialog');
        const answered = dialog.ask();

        native.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        native.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        assert.isFalse(native.open);
        assert.deepStrictEqual(await answered, { dismissed: true, result: null, response: null });
    });

    it('stays open when a click inside the dialog merely ends over the backdrop', async () => {
        const [dialog] = await mount('<ful-dialog header="Pick one"><p data-ref="body">the body</p></ful-dialog>');
        const native = dialog.querySelector('dialog');
        dialog.ask();

        dialog.querySelector('[data-ref=body]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        native.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        assert.isTrue(native.open);
        dialog.close('answered');
    });

    it('renders no header at all under requires-answer with nothing to head it', async () => {
        const [dialog] = await mount('<ful-dialog requires-answer>the body</ful-dialog>');

        assert.strictEqual(dialog.querySelectorAll('header').length, 0);
    });
    it('styles the chrome through the class wherever it stands, not only as a direct child', async () => {
        const [dialog] = await mount(
            '<ful-dialog header="h"><div><footer class="ful-dialog-footer" data-ref="nested"><button>a</button></footer></div></ful-dialog>',
        );
        const nested = dialog.querySelector('[data-ref=nested]');

        assert.strictEqual(getComputedStyle(nested).display, 'flex');
        assert.strictEqual(getComputedStyle(nested).justifyContent, 'flex-end');
    });
});

describe('Dialog, the section:requested contract', () => {
    it('fires on the body on open, first only the first time', async () => {
        const [dialog] = await mount('<ful-dialog header="h">the body</ful-dialog>');
        const seen = [];
        AsyncEvents.asyncOn(dialog, 'section:requested', (e) => {
            seen.push(e.detail.first);
            e.detail.section.append('delivered');
        });

        dialog.ask();
        await settle();
        assert.deepStrictEqual(seen, [true], 'ask() opens, the request fires');
        assert.include(dialog.querySelector('[data-ref=body]').textContent, 'delivered');

        dialog.close();
        await settle();
        dialog.ask();
        await settle();
        assert.deepStrictEqual(seen, [true, false]);
        dialog.close();
    });

    it('fires nothing when update() owns the cycle', async () => {
        const [dialog] = await mount('<ful-dialog header="h"></ful-dialog>');
        let fired = 0;
        AsyncEvents.asyncOn(dialog, 'section:requested', () => {
            ++fired;
        });

        await dialog.update(async () => document.createElement('p'));
        await settle();

        assert.strictEqual(fired, 0);
        dialog.close();
    });
});

describe('Dialog, refresh', () => {
    it('re-fires the body request, its failures painted and swallowed', async () => {
        const [dialog] = await mount('<ful-dialog header="h">the body</ful-dialog>');
        let fail = true;
        AsyncEvents.asyncOn(dialog, 'section:requested', () => {
            if (fail) {
                throw new Error('boom');
            }
        });

        await dialog.refresh();
        assert.isNotNull(dialog.querySelector('[data-ref=body] > .ful-section-error'));

        fail = false;
        await dialog.refresh();
        assert.strictEqual(dialog.querySelector('[data-ref=body] > .ful-section-error'), null);
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
        assert.include(dialog.querySelector('[data-ref=body]').textContent, 'It goes live now.');
        assert.strictEqual(
            dialog.querySelector('dialog').getAttribute('aria-labelledby'),
            dialog.querySelector('h2').id,
            'the transient dialog is named through its heading',
        );
        const [later, publish] = dialog.querySelectorAll('footer button[data-result]');
        assert.strictEqual(later.textContent, 'Later');
        assert.strictEqual(later.className, '');
        assert.strictEqual(publish.textContent, 'Publish');
        assert.strictEqual(publish.className, 'ful-button');
        assert.isTrue(dialog.querySelector('dialog').open);

        publish.click();
        assert.deepStrictEqual(await asked, { dismissed: false, result: 'publish', response: null });
        assert.isNull(shown(), 'the transient dialog is removed once answered');
    });

    it('ask never reads a string body as markup', async () => {
        const asked = Dialog.ask('Watch out', '<img src=x onerror=window.__leaked=1>');
        await settle();
        assert.isNull(shown().querySelector('[data-ref=body] img'), 'the string is text');

        shown().querySelector('[data-result=acknowledged]').click();
        assert.deepStrictEqual(await asked, { dismissed: false, result: 'acknowledged', response: null });
    });

    it('ask takes a node for a body of markup', async () => {
        const paragraph = document.createElement('p');
        paragraph.textContent = 'from a node';
        const asked = Dialog.ask('Q', paragraph);
        await settle();
        assert.include(shown().querySelector('[data-ref=body]').textContent, 'from a node');

        shown().querySelector('[data-result=acknowledged]').click();
        await asked;
    });

    it('dresses the dialog with the class it is given, as a declared one is', async () => {
        const asked = Dialog.ask('Wide question', 'body', [['ok', 'OK']], { className: 'widest' });
        await settle();
        assert.isTrue(shown().closest('ful-dialog').classList.contains('widest'));

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
            'the caller\'s nodes keep their place among the tuples',
        );
        assert.strictEqual(
            footer.querySelector('[data-result=mine]').getAttribute('aria-label'),
            'the long name a tuple cannot carry',
        );

        footer.querySelector('[data-result=mine]').click();
        assert.deepEqual(await asked, { dismissed: false, result: 'mine', response: null });
    });

    it('confirm answers true on confirm, false on cancel and on dismissal', async () => {
        const confirmed = Dialog.confirm('Delete this page?', 'It is removed from client sites.', { confirm: 'Delete' });
        await settle();
        const [cancel, confirm] = shown().querySelectorAll('footer button[data-result]');
        assert.strictEqual(cancel.textContent, 'Cancel', 'the localized default');
        assert.strictEqual(confirm.textContent, 'Delete');

        confirm.click();
        assert.isTrue(await confirmed);

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
