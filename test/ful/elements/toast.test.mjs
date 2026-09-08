import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Failure } from '../../../src/httpc/index.mjs';
import { Plugin, Toasts } from '../../../src/ful/index.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const settle = async () => {
    for (let i = 0; i !== 20; ++i) {
        await new Promise((r) => setTimeout(r, 0));
    }
};
const mount = async (html) => {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    await Rendering.waitFor(container);
    await settle();
    const el = container.firstElementChild;
    return [el, container];
};
const retire = (item) => item.dispatchEvent(new AnimationEvent('animationend', { bubbles: true }));

describe('Toasts', () => {
    it('announces itself as the notifications region', async () => {
        const [toasts, container] = await mount('<ful-toasts></ful-toasts>');

        assert.strictEqual(toasts.getAttribute('role'), 'region');
        assert.strictEqual(toasts.getAttribute('aria-label'), 'Notifications');
        assert.isTrue(toasts.classList.contains('ful-toasts'), 'the region chrome anchors on the class');
        container.remove();
    });

    it('shows a themed toast, announced by severity, dismissible by hand', async () => {
        const [toasts, container] = await mount('<ful-toasts></ful-toasts>');

        const item = toasts.show('saved', { severity: 'success' });

        assert.isTrue(item.classList.contains('success'));
        assert.strictEqual(item.getAttribute('role'), 'status');
        assert.strictEqual(item.querySelector('div').textContent, 'saved');
        assert.strictEqual(item.querySelector('button').getAttribute('aria-label'), 'Dismiss');

        item.querySelector('button').click();
        assert.isTrue(item.classList.contains('ful-toast-out'), 'the dismiss button retires the toast');
        retire(item);
        assert.isNull(toasts.querySelector('.ful-toast'), 'the retired toast leaves the region');
        container.remove();
    });

    it('shows a failure as its problems, announced as an alert', async () => {
        const [toasts, container] = await mount('<ful-toasts></ful-toasts>');

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
        container.remove();
    });

    it('stacks concurrent toasts, each retiring on its own timer', async () => {
        const [toasts, container] = await mount('<ful-toasts></ful-toasts>');

        const first = toasts.show('first');
        const second = toasts.show('second');

        assert.strictEqual(toasts.querySelectorAll('.ful-toast').length, 2, 'both are stacked');
        retire(first);
        assert.isNotNull(second.parentElement, 'one retiring does not retire the other');
        container.remove();
    });

    it('defaults an unknown severity to info', async () => {
        const [toasts, container] = await mount('<ful-toasts></ful-toasts>');

        const item = toasts.show('x', { severity: 'loud' });

        assert.isTrue(item.classList.contains('info'));
        container.remove();
    });

    it('answers the show-toast document event, the zero-wiring door', async () => {
        const [toasts, container] = await mount('<ful-toasts></ful-toasts>');

        document.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'from anywhere', severity: 'warning' } }));

        const item = toasts.querySelector('.ful-toast');
        assert.isTrue(item.classList.contains('warning'));
        assert.include(item.textContent, 'from anywhere');
        container.remove();
    });

    it('a custom subclass keeps the chrome through the class the render carries', async () => {
        class MyToasts extends Toasts {}
        registry.defineElement('x-my-toasts', MyToasts);
        const [toasts, container] = await mount('<x-my-toasts></x-my-toasts>');

        assert.isTrue(toasts.classList.contains('ful-toasts'));
        const item = toasts.show('reused');
        assert.isTrue(item.classList.contains('ful-toast'));
        container.remove();
    });
});
