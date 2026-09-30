import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Failure } from '../../../src/httpc/index.mjs';
import { Plugin, Toasts } from '../../../src/ful/index.mjs';
import { emulateMedia } from '@web/test-runner-commands';
import { appended, settle as drain } from '../../harness.mjs';
import { useClock } from '../../clock.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const settle = () => drain();
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

        assert.strictEqual(
            getComputedStyle(region).display,
            'none',
            'an empty region is not displayed, so it takes no space before its first toast',
        );

        region.show('a toast');

        assert.strictEqual(
            getComputedStyle(region).display,
            'flex',
            'a region holding a toast lays its toasts out as a stack',
        );
        assert.strictEqual(
            getComputedStyle(region).position,
            'fixed',
            'a region holding a toast is fixed, so showing it does not reflow the page',
        );
    });

    it('appears without sliding in where motion is not wanted', async function () {
        this.timeout(10000);
        const [region] = await mount('<ful-toasts></ful-toasts>');
        await emulateMedia({ reducedMotion: 'reduce' });
        try {
            const item = region.show('a toast');

            assert.strictEqual(
                item.getAnimations().length,
                0,
                'where the user prefers reduced motion the toast runs no slide in animation',
            );
        } finally {
            await emulateMedia({ reducedMotion: 'no-preference' });
        }
    });

    it('announces itself as the notifications region', async () => {
        const [toasts] = await mount('<ful-toasts></ful-toasts>');

        assert.strictEqual(toasts.getAttribute('role'), 'region', 'the region carries the region role');
        assert.strictEqual(
            toasts.getAttribute('aria-label'),
            'Notifications',
            'the region is named with the localized Notifications label',
        );
        assert.strictEqual(getComputedStyle(toasts).display, 'none', 'an empty region draws nothing');
        toasts.show('saved');
        assert.strictEqual(getComputedStyle(toasts).position, 'fixed', 'the region chrome is the structure it renders');
    });

    it('shows a themed toast, announced by severity, dismissible by hand', async () => {
        const [toasts] = await mount('<ful-toasts></ful-toasts>');

        const item = toasts.show('saved', { severity: 'success' });

        assert.strictEqual(item.localName, 'ful-toast', 'show() appends a ful-toast element');
        assert.isTrue(item.classList.contains('success'), "the severity is carried as the toast's theme class");
        assert.strictEqual(
            item.getAttribute('role'),
            'status',
            'a success toast is announced politely with the status role',
        );
        assert.strictEqual(item.querySelector('div').textContent, 'saved', "the message is shown as the toast's text");
        assert.strictEqual(
            item.querySelector('button').getAttribute('aria-label'),
            'Dismiss',
            'the dismiss button is named with the localized Dismiss',
        );

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

        assert.strictEqual(
            item.getAttribute('role'),
            'alert',
            'an error toast is announced assertively with the alert role',
        );
        assert.include(
            item.textContent,
            'must not be blank',
            "a failure is shown as its problems' reasons, the field problem included",
        );
        assert.include(
            item.textContent,
            'start is after end',
            "a failure is shown as its problems' reasons, the generic problem included",
        );
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

        assert.isTrue(item.classList.contains('info'), 'an unknown severity falls back to the info theme class');
    });

    it('answers the show-toast document event, wired by nobody', async () => {
        const [toasts] = await mount('<ful-toasts></ful-toasts>');

        document.dispatchEvent(
            new CustomEvent('show-toast', { detail: { message: 'from anywhere', severity: 'warning' } }),
        );

        const item = toasts.querySelector('ful-toast');
        assert.isTrue(
            item.classList.contains('warning'),
            "the show-toast event's severity is carried as the toast's theme class",
        );
        assert.include(item.textContent, 'from anywhere', "the show-toast event's message is shown in the toast");
    });

    it('answers a show-toast event carrying no detail with silence, not a throw', async () => {
        const [toasts] = await mount('<ful-toasts></ful-toasts>');

        document.dispatchEvent(new CustomEvent('show-toast'));

        assert.strictEqual(
            toasts.querySelectorAll('ful-toast').length,
            0,
            'a show-toast event with no detail is ignored rather than shown or thrown on',
        );
    });

    it('carries an action, whose click answers and retires the toast', async () => {
        const [toasts] = await mount('<ful-toasts></ful-toasts>');
        const answered = [];
        const clicks = [];

        const byCall = toasts.show('Block deleted', { action: { label: 'Undo', onClick: () => answered.push(1) } });
        document.dispatchEvent(
            new CustomEvent('show-toast', {
                detail: { message: 'Also deleted', action: { label: 'Undo', onClick: () => clicks.push(1) } },
            }),
        );
        const byEvent = [...toasts.querySelectorAll('ful-toast')].find((el) => el !== byCall);

        for (const [item, log] of [
            [byCall, answered],
            [byEvent, clicks],
        ]) {
            const action = item.querySelector('button.ful-toast-action');
            assert.strictEqual(action.textContent, 'Undo', "the action button is labelled with the action's label");
            action.click();
            assert.lengthOf(log, 1, 'the action answered');
            assert.isTrue(item.classList.contains('ful-toast-out'), 'and the toast retired');
        }
    });

    it('the show-toast listener is wired once: a second region does not double the toast, a removed one stops answering', async () => {
        const [first, firstContainer] = await mount('<ful-toasts id="first-region"></ful-toasts>');
        const [second] = await mount('<ful-toasts id="second-region"></ful-toasts>');

        document.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'one each' } }));
        assert.strictEqual(first.querySelectorAll('ful-toast').length, 1, 'the first region shows it once');
        assert.strictEqual(second.querySelectorAll('ful-toast').length, 1, 'the second region shows it once');

        firstContainer.remove();

        document.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'after the removal' } }));
        assert.strictEqual(first.querySelectorAll('ful-toast').length, 1, 'the removed region answers no more');
        assert.strictEqual(second.querySelectorAll('ful-toast').length, 2, 'the live one keeps answering');
    });

    it('answers again after being re-attached, without a second render', async () => {
        const [toasts, container] = await mount('<ful-toasts></ful-toasts>');
        const parent = container;

        toasts.remove();
        document.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'while away' } }));
        assert.lengthOf(toasts.querySelectorAll('ful-toast'), 0, 'a detached region answers nothing');

        parent.appendChild(toasts);
        await settle();
        document.dispatchEvent(new CustomEvent('show-toast', { detail: { message: 'back again' } }));

        assert.lengthOf(toasts.querySelectorAll('ful-toast'), 1, 'the re-attached region answers');
        assert.include(
            toasts.textContent,
            'back again',
            "the toast shown after the re-attach carries the event's message",
        );
    });

    it('hands its focus back to the region, and retires at once where motion is not wanted', async () => {
        const [toasts] = await mount('<ful-toasts></ful-toasts>');
        const item = toasts.show('holding the focus');
        const dismiss = item.querySelector('button');
        dismiss.focus();
        assert.strictEqual(document.activeElement, dismiss, 'the dismiss button holds the focus');

        const real = window.matchMedia;
        /** @type any */ (window).matchMedia = (q) =>
            String(q).includes('prefers-reduced-motion') ? { matches: true } : real.call(window, q);
        try {
            dismiss.click();
        } finally {
            /** @type any */ (window).matchMedia = real;
        }

        assert.isFalse(toasts.contains(item), 'the toast is gone the moment it retires');
        assert.strictEqual(document.activeElement, toasts, 'the region caught the focus on the way out');
    });

    it('a custom subclass keeps the chrome through the structure its toasts render', async () => {
        class MyToasts extends Toasts {}
        registry.defineElement('x-my-toasts', MyToasts);
        const [toasts] = await mount('<x-my-toasts></x-my-toasts>');

        const item = toasts.show('reused');
        assert.strictEqual(item.localName, 'ful-toast', 'a subclass region still appends ful-toast elements');
        assert.strictEqual(getComputedStyle(item).display, 'flex', 'the item chrome follows the tag');
        assert.strictEqual(getComputedStyle(toasts).position, 'fixed', 'the region chrome follows the hosted toasts');
    });

    it('rises above what opened in the top layer since its last toast', async () => {
        const [toasts, container] = await mount('<ful-toasts></ful-toasts>');
        toasts.show('first');
        const cover = document.createElement('div');
        cover.setAttribute('popover', 'manual');
        cover.style.cssText = 'inset: 0; width: 100vw; height: 100vh; margin: 0';
        container.append(cover);
        cover.showPopover();

        const item = toasts.show('second', { timeout: 60000 });
        const box = item.getBoundingClientRect();

        assert.isTrue(
            item.contains(document.elementFromPoint(box.left + box.width / 2, box.bottom - 4)),
            'a toast shown after a top layer popover opened is drawn above it, since each show shows the region again',
        );
        cover.hidePopover();
    });

    it('keeps the focus inside the region where it was when another toast arrives', async () => {
        const [toasts] = await mount('<ful-toasts></ful-toasts>');
        const dismiss = toasts.show('first').querySelector('button');
        dismiss.focus();

        toasts.show('second');

        assert.strictEqual(
            document.activeElement,
            dismiss,
            'a new toast arriving leaves the focus where it was inside the region',
        );
    });

    it('stays open when an auto popover opens, whatever popover the page declared', async () => {
        const [toasts, container] = await mount('<ful-toasts popover="auto"></ful-toasts>');
        toasts.show('saved');
        const menu = document.createElement('div');
        menu.setAttribute('popover', '');
        container.append(menu);

        menu.showPopover();

        assert.isTrue(
            toasts.matches(':popover-open'),
            'the region is a manual popover whatever the page declared, so an auto popover opening does not light dismiss it',
        );
        menu.hidePopover();
    });

    it('shows a toast in a region out of the document without raising it', async () => {
        const [toasts] = await mount('<ful-toasts></ful-toasts>');
        toasts.remove();

        const item = toasts.show('away');

        assert.isTrue(toasts.contains(item), 'a region out of the document still appends the toast');
        assert.isFalse(toasts.matches(':popover-open'), 'a region out of the document is not shown as a popover');
    });
});

describe('Toast timer holds', () => {
    const clock = useClock();

    it('holds the timer while the toast is hovered, and lets it run again on leaving', async () => {
        const [toasts] = await mount('<ful-toasts></ful-toasts>');

        const item = toasts.show('waiting', { timeout: 60 });
        item.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        await clock.advance(200);
        assert.isFalse(item.classList.contains('ful-toast-out'), 'a hovered toast outlives its timer');

        item.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
        await clock.advance(200);
        assert.isTrue(item.classList.contains('ful-toast-out'), 'and retires once left');
    });

    it('holds the timer while the toast holds the focus', async () => {
        const [toasts] = await mount('<ful-toasts></ful-toasts>');

        const item = toasts.show('waiting', { timeout: 60 });
        item.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        await clock.advance(200);
        assert.isFalse(item.classList.contains('ful-toast-out'), 'a focused toast outlives its timer');

        item.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        await clock.advance(200);
        assert.isTrue(
            item.classList.contains('ful-toast-out'),
            'the timer runs again once the focus leaves, and the toast retires',
        );
    });

    it('holds through overlapping pointer and focus, the last one leaving to re-arm', async () => {
        const [toasts] = await mount('<ful-toasts></ful-toasts>');

        const item = toasts.show('waiting', { timeout: 60 });
        item.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        item.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        item.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
        await clock.advance(200);
        assert.isFalse(item.classList.contains('ful-toast-out'), 'the pointer leaving does not release a held focus');

        item.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        await clock.advance(200);
        assert.isTrue(item.classList.contains('ful-toast-out'), 'the last hold leaving re-arms the timer');
    });
});
