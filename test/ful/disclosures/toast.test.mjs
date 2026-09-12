import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Failure } from '../../../src/httpc/index.mjs';
import { Plugin, Toasts } from '../../../src/ful/index.mjs';
import { appended } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const settle = async () => {
    for (let i = 0; i !== 20; ++i) {
        await new Promise((r) => setTimeout(r, 0));
    }
};
const mount = async (html) => {
    const container = appended(html);
    await Rendering.waitFor(container);
    await settle();
    const el = container.firstElementChild;
    return [el, container];
};
const retire = (item) => item.dispatchEvent(new AnimationEvent('animationend', { bubbles: true }));

describe('Toasts', () => {
    it('takes no space until its first toast, so nothing reflows on it', async () => {
        const [region] = await mount('<ful-toasts></ful-toasts>');

        assert.strictEqual(getComputedStyle(region).display, 'none');

        region.show('a toast');

        assert.strictEqual(getComputedStyle(region).display, 'flex');
        assert.strictEqual(getComputedStyle(region).position, 'fixed');
    });

    it('announces itself as the notifications region', async () => {
        const [toasts] = await mount('<ful-toasts></ful-toasts>');

        assert.strictEqual(toasts.getAttribute('role'), 'region');
        assert.strictEqual(toasts.getAttribute('aria-label'), 'Notifications');
        assert.strictEqual(getComputedStyle(toasts).position, 'static', 'an empty region draws nothing');
        toasts.show('saved');
        assert.strictEqual(getComputedStyle(toasts).position, 'fixed', 'the region chrome is the structure it renders');
    });

    it('shows a themed toast, announced by severity, dismissible by hand', async () => {
        const [toasts] = await mount('<ful-toasts></ful-toasts>');

        const item = toasts.show('saved', { severity: 'success' });

        assert.strictEqual(item.localName, 'ful-toast');
        assert.isTrue(item.classList.contains('success'));
        assert.strictEqual(item.getAttribute('role'), 'status');
        assert.strictEqual(item.querySelector('div').textContent, 'saved');
        assert.strictEqual(item.querySelector('button').getAttribute('aria-label'), 'Dismiss');

        item.querySelector('button').click();
        assert.isTrue(item.classList.contains('ful-toast-out'), 'the dismiss button retires the toast');
        retire(item);
        assert.isNull(toasts.querySelector('ful-toast'), 'the retired toast leaves the region');
    });

    it('retires without an out animation to wait for: a host disabling animations still loses the toast', async () => {
        const [toasts, container] = await mount('<ful-toasts></ful-toasts>');
        const style = document.createElement('style');
        style.textContent = 'ful-toast { animation: none !important; }';
        container.prepend(style);
        try {
            const dismissed = toasts.show('by hand');
            dismissed.querySelector('button').click();
            assert.isFalse(dismissed.isConnected, 'no animationend will ever come, the dismiss removes it');

            const timed = toasts.show('by timer', { timeout: 1 });
            await settle();
            assert.isFalse(timed.isConnected, 'the timer removes it the same way');
        } finally {
        }
    });

    it('shows a failure as its problems, announced as an alert', async () => {
        const [toasts] = await mount('<ful-toasts></ful-toasts>');

        const item = toasts.show(
            new Failure('invalid', [
                { type: 'FIELD_ERROR', context: null, reason: 'must not be blank' },
                { type: 'GENERIC_PROBLEM', context: null, reason: 'start is after end' },
            ]),
            { severity: 'error' },
        );

        assert.strictEqual(item.getAttribute('role'), 'alert');
        assert.include(item.textContent, 'must not be blank');
        assert.include(item.textContent, 'start is after end');
    });

    it('stacks concurrent toasts, each retiring on its own timer', async () => {
        const [toasts] = await mount('<ful-toasts></ful-toasts>');

        const first = toasts.show('first');
        const second = toasts.show('second');

        assert.strictEqual(toasts.querySelectorAll('ful-toast').length, 2, 'both are stacked');
        retire(first);
        assert.isNotNull(second.parentElement, 'one retiring does not retire the other');
    });

    it('defaults an unknown severity to info', async () => {
        const [toasts] = await mount('<ful-toasts></ful-toasts>');

        const item = toasts.show('x', { severity: 'loud' });

        assert.isTrue(item.classList.contains('info'));
    });

    it('answers the show-toast document event, wired by nobody', async () => {
        const [toasts] = await mount('<ful-toasts></ful-toasts>');

        document.dispatchEvent(
            new CustomEvent('show-toast', { detail: { message: 'from anywhere', severity: 'warning' } }),
        );

        const item = toasts.querySelector('ful-toast');
        assert.isTrue(item.classList.contains('warning'));
        assert.include(item.textContent, 'from anywhere');
    });

    it('the show-toast listener is wired once: a second region does not double the toast, a removed one stops answering', async () => {
        const [first, firstContainer] = await mount('<ful-toasts id="first-region"></ful-toasts>');
        const [second] = await mount('<ful-toasts id="second-region"></ful-toasts>');

        document.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'one each' } }));
        assert.strictEqual(first.querySelectorAll('ful-toast').length, 1, 'the first region shows it once');
        assert.strictEqual(second.querySelectorAll('ful-toast').length, 1, 'the second region shows it once');

        //the removal is the subject of the test, not its teardown
        firstContainer.remove();

        document.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'after the removal' } }));
        assert.strictEqual(first.querySelectorAll('ful-toast').length, 1, 'the removed region answers no more');
        assert.strictEqual(second.querySelectorAll('ful-toast').length, 2, 'the live one keeps answering');
    });

    it('a custom subclass keeps the chrome through the structure its toasts render', async () => {
        class MyToasts extends Toasts {}
        registry.defineElement('x-my-toasts', MyToasts);
        const [toasts] = await mount('<x-my-toasts></x-my-toasts>');

        const item = toasts.show('reused');
        assert.strictEqual(item.localName, 'ful-toast');
        assert.strictEqual(getComputedStyle(item).display, 'flex', 'the item chrome follows the tag');
        assert.strictEqual(getComputedStyle(toasts).position, 'fixed', 'the region chrome follows the hosted toasts');
    });
});
