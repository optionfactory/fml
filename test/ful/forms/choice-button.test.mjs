import { assert } from 'chai';
import { ChoiceButton } from '../../../src/ful/forms/choice-button.mjs';
import { appended } from '../../harness.mjs';

describe('ChoiceButton', () => {
    const build = (options) => {
        const container = appended('<button type="button"></button><ul></ul>');
        const button = container.querySelector('button');
        return { button, menu: container.querySelector('ul'), choice: new ChoiceButton(button, options) };
    };

    it('shows a bare choice as itself when it has neither a label nor a glyph', () => {
        const { menu, choice } = build({ vocabulary: ['asc', 'desc'] });
        choice.allowed = ['asc', 'desc'];

        const items = [...menu.querySelectorAll('a')];
        assert.deepStrictEqual(
            items.map((a) => a.textContent),
            ['asc', 'desc'],
            'the choice is the whole item, not a glyph beside a word',
        );
        assert.isFalse(
            items.some((a) => a.querySelector('span')),
            'no two-part layout with nothing to put in it',
        );
        assert.deepStrictEqual(
            items.map((a) => a.getAttribute('value')),
            ['asc', 'desc'],
            'each item carries its choice as its value attribute, where the menu protocol finds the current item',
        );
    });

    it('walks its items with the arrows, on the menu protocol it shares with ful-menu', () => {
        const { menu, choice } = build({ vocabulary: ['asc', 'desc'] });
        choice.allowed = ['asc', 'desc'];
        const [first, second] = [...menu.querySelectorAll('a')];

        first.focus();
        first.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true, cancelable: true }));
        assert.strictEqual(document.activeElement, second, 'arrow down moves focus to the next item');

        second.dispatchEvent(new KeyboardEvent('keydown', { code: 'End', bubbles: true, cancelable: true }));
        assert.strictEqual(document.activeElement, second, 'end moves focus to the last item');
        second.dispatchEvent(new KeyboardEvent('keydown', { code: 'Home', bubbles: true, cancelable: true }));
        assert.strictEqual(document.activeElement, first, 'home moves focus to the first item');
    });

    it('splits the item into glyph and word once either is given', () => {
        const { menu, choice } = build({
            vocabulary: ['asc'],
            glyphs: { asc: '↑' },
            labelFor: () => 'Ascending',
        });
        choice.allowed = ['asc'];

        const item = menu.querySelector('a');
        assert.lengthOf(item.querySelectorAll('span'), 2, 'the glyph and the word are told apart');
        assert.include(item.textContent, '↑', 'the item shows the glyph given for the choice');
        assert.include(item.textContent, 'Ascending', 'the item shows the word labelFor gives for the choice');
    });

    it('links the button to its menu again when a pin is lifted', () => {
        const { button, menu, choice } = build({ vocabulary: ['asc', 'desc'] });
        choice.allowed = ['asc', 'desc'];
        choice.allowed = ['asc'];
        assert.isNull(button.getAttribute('popovertarget'), 'a pinned button opens nothing');

        choice.allowed = ['asc', 'desc'];

        assert.strictEqual(
            button.getAttribute('popovertarget'),
            menu.id,
            'once more than one choice is allowed the button opens its menu again',
        );
    });
});
