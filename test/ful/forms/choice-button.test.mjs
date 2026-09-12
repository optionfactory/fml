import { assert } from 'chai';
import { ChoiceButton } from '../../../src/ful/forms/choice-button.mjs';
import { appended } from '../../harness.mjs';

/**
 * The glyph-button-and-menu the filters are built from, exercised through its own
 * defaults rather than through a filter: every filter passes both a localized
 * label and a glyph, so the plain case, a vocabulary that is its own label and
 * its own glyph, never runs in the library and is the class's own contract.
 */
describe('ChoiceButton', () => {
    const build = (options) => {
        const container = appended('<button type="button"></button><ul></ul>');
        const button = container.querySelector('button');
        return { button, menu: container.querySelector('ul'), choice: new ChoiceButton(button, options) };
    };

    it('shows a bare choice as itself when it has neither a label nor a glyph', () => {
        const { menu, choice } = build({ vocabulary: ['asc', 'desc'] });
        //the menu is filled when the allowed set is declared, not at construction
        choice.allowed = ['asc', 'desc'];

        const items = [...menu.querySelectorAll('a')];
        assert.deepStrictEqual(
            items.map((a) => a.textContent),
            ['asc', 'desc'],
            'the choice is the whole item, not a glyph beside a word',
        );
        assert.isFalse(items.some((a) => a.querySelector('span')), 'no two-part layout with nothing to put in it');
        assert.deepStrictEqual(
            items.map((a) => a.getAttribute('value')),
            ['asc', 'desc'],
        );
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
        assert.include(item.textContent, '↑');
        assert.include(item.textContent, 'Ascending');
    });
});
