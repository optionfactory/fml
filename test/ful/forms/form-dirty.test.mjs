import { assert } from 'chai';
import { registry } from '../../../src/ftl/index.mjs';
import { AsyncEvents, Plugin } from '../../../src/ful/index.mjs';
import { mount } from '../../harness.mjs';
import { tick } from '../../tick.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

/** A form-associated element that is not a ful field: no `form` property, its owner in `internals.form`. */
class Composite extends HTMLElement {
    static formAssociated = true;
    constructor() {
        super();
        this.internals = this.attachInternals();
    }
    get value() {
        return this.querySelector('input').value;
    }
}
customElements.define('test-composite', Composite);

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** Types into a control as the user does: the value, then the bubbling input event. */
const type = (input, value) => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
};

const mountForm = async (html) => {
    const container = await mount(html);
    await tick();
    return container.querySelector('ful-form');
};

const marked = (button) => button.hasAttribute('data-ful-dirty');

describe('Form unsaved edits', () => {
    it('is dirty while an edit holds another value, and clean again once it is undone', async () => {
        const form = await mountForm(`
            <ful-form track-changes>
                <input name="code" value="A1">
                <ful-input name="label" value="first"></ful-input>
                <button type="submit">save</button>
            </ful-form>`);
        const changes = [];
        form.addEventListener('dirty:change', (e) => changes.push(e.detail.dirty));
        const button = form.querySelector('button');
        const label = form.querySelector('ful-input input');

        assert.isFalse(form.dirty, 'a form just rendered holds nothing unsaved');
        type(label, 'second');
        await frame();
        assert.isTrue(form.dirty, 'an edit in a field makes the form dirty');
        assert.isTrue(form.matches(':state(dirty)'), 'the host matches :state(dirty)');
        assert.isTrue(marked(button), 'the submit button carries the mark');
        assert.strictEqual(getComputedStyle(button).position, 'static', 'the mark leaves the button positioning alone');

        type(label, 'first');
        await frame();
        assert.isFalse(form.dirty, 'an edit undone is no longer unsaved');
        assert.isFalse(marked(button), 'the mark goes with it');
        assert.deepEqual(changes, [true, false], 'dirty:change reports each flip once');
    });

    it('ignores what the user did not edit: written values, late controls, other forms', async () => {
        const form = await mountForm(`
            <ful-form track-changes>
                <input name="code" value="A1">
                <div data-ref="section"></div>
                <ful-form><input name="search"><button type="submit">search</button></ful-form>
            </ful-form>`);
        form.querySelector('[name=code]').value = 'B2';
        form.querySelector('[data-ref=section]').innerHTML = '<input name="delivered" value="x">';
        const search = form.querySelector('[name=search]');
        type(search, 'needle');
        await frame();

        assert.isFalse(
            form.dirty,
            'a written value, a delivered control and a nested form edit are not edits of this form',
        );
        assert.isFalse(marked(form.querySelector('ful-form ful-form button')), "a nested form's button is not marked");

        const delivered = form.querySelector('[name=delivered]');
        delivered.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        type(delivered, 'y');
        assert.isTrue(form.dirty, 'a late control compares with its value when first focused');
        type(delivered, 'x');
        assert.isFalse(form.dirty, 'and is clean again when brought back to it');
        type(delivered, 'z');
        delivered.remove();
        assert.isFalse(form.dirty, 'a late control edited and gone again leaves nothing unsaved');
    });

    it('commits what a successful submit sent, keeping the edits made while it was in flight', async () => {
        const form = await mountForm(`
            <ful-form track-changes>
                <input name="code" value="A1">
                <input name="note" value="">
            </ful-form>`);
        let release;
        AsyncEvents.asyncOn(form, 'submit:requested', () => new Promise((resolve) => (release = resolve)));
        let dirtyOnSuccess;
        form.addEventListener('submit:success', () => (dirtyOnSuccess = form.dirty));
        type(form.querySelector('[name=code]'), 'B2');

        const submitted = form.submit();
        await tick();
        type(form.querySelector('[name=note]'), 'typed meanwhile');
        release({});
        await submitted;

        assert.isTrue(dirtyOnSuccess, 'the edit made in flight is still unsaved when submit:success is dispatched');
        type(form.querySelector('[name=note]'), '');
        assert.isFalse(form.dirty, 'what was submitted is the new saved state');
    });

    it('counts an edit inside a composite control under the composite name', async () => {
        const form = await mountForm(`
            <ful-form track-changes>
                <test-composite name="rows"><input form="" value="1"></test-composite>
            </ful-form>`);

        type(form.querySelector('test-composite input'), '2');
        assert.isTrue(form.dirty, 'the inner control is not a control of the form, the composite owning it is');
    });

    it('takes the page at its word: edited() and commit()', async () => {
        const form = await mountForm(`<ful-form track-changes><input name="code" value="A1"></ful-form>`);
        const code = form.querySelector('[name=code]');

        code.value = 'B2';
        form.edited(code);
        assert.isTrue(form.dirty, 'a value written on the user behalf counts once the page says so');
        form.commit();
        assert.isFalse(form.dirty, 'a commit records it as saved');

        form.form.insertAdjacentHTML('beforeend', '<input name="late" value="x">');
        const late = form.querySelector('[name=late]');
        late.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        form.commit();
        type(late, 'x');
        assert.isFalse(form.dirty, 'once committed, a late control compares with the commit');
    });

    it('counts a reset as an edit, dirty only when the defaults differ from what was saved', async () => {
        const form = await mountForm(`<ful-form track-changes><input name="code" value="A1"></ful-form>`);
        const code = form.querySelector('[name=code]');

        form.reset();
        assert.isFalse(form.dirty, 'resetting to what was saved changes nothing');
        type(code, 'B2');
        form.commit();
        form.reset();
        assert.isTrue(form.dirty, 'resetting away from what was saved is unsaved');
    });

    it('tracks nothing without the attribute', async () => {
        const form = await mountForm(
            `<ful-form><input name="code" value="A1"><button type="submit">save</button></ful-form>`,
        );
        type(form.querySelector('[name=code]'), 'B2');
        form.edited(form.querySelector('[name=code]'));
        await frame();

        assert.isFalse(form.dirty, 'dirty is always false, whatever the page reports');
        assert.isFalse(marked(form.querySelector('button')), 'no button is marked');
    });

    it('asks before the page is left while dirty, under guard-leave, until it leaves the document', async () => {
        const form = await mountForm(`<ful-form guard-leave><input name="code" value="A1"></ful-form>`);
        const leaving = () => {
            const evt = new Event('beforeunload', { cancelable: true });
            window.dispatchEvent(evt);
            return evt.defaultPrevented;
        };

        assert.isFalse(leaving(), 'a clean form lets the page go');
        type(form.querySelector('[name=code]'), 'B2');
        assert.isTrue(leaving(), 'a dirty form asks first');
        const container = form.parentElement;
        form.remove();
        assert.isFalse(leaving(), 'a form removed from the document no longer asks');
        container.append(form);
        assert.isTrue(leaving(), 'and asks again once put back');
    });
});
