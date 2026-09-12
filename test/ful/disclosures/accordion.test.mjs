import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';
import { appended, settle as drain } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

//the clamped loop this replaces billed about 4ms a turn once nested, so
//the floor keeps the wall time these tests were written against: the turn
//count alone would drain in a tenth of it
const settle = () => drain(20, 80);
const mount = async (html) => {
    const container = appended(html);
    await Rendering.waitFor(container);
    await settle();
    return [container.firstElementChild, container];
};

describe('Accordion', () => {
    const markup = `
        <ful-accordion>
            <details><summary>First</summary>one</details>
            <details open><summary>Second</summary>two</details>
            <details><summary>Third</summary>three</details>
        </ful-accordion>`;

    it('renders the disclosures inside the group, untouched', async () => {
        const [accordion] = await mount(markup);
        const details = accordion.querySelectorAll('ful-accordion-group > details');

        assert.lengthOf(details, 3);
        assert.isNull(details[0].getAttribute('name'), 'a free accordion assigns no name');
        assert.isTrue(details[1].open, 'the author-claimed open panel stays open');
    });

    it('the exclusive claim names the group: opening one closes the others', async () => {
        const [accordion] = await mount(markup.replace('<ful-accordion>', '<ful-accordion exclusive>'));
        const details = [...accordion.querySelectorAll('ful-accordion-group > details')];

        assert.strictEqual(
            details[0].getAttribute('name'),
            details[2].getAttribute('name'),
            'one shared name for the whole group',
        );
        assert.isTrue(details[1].open);

        details[0].open = true;
        await settle();
        assert.isFalse(details[1].open, 'the platform closed the other named panel');
    });

    it('the exclusive claim stays live', async () => {
        const [accordion] = await mount(markup);
        const details = [...accordion.querySelectorAll('details')];

        accordion.exclusive = true;
        assert.strictEqual(details[0].getAttribute('name'), details[1].getAttribute('name'));
        assert.strictEqual(accordion.getAttribute('exclusive'), '');

        accordion.exclusive = false;
        assert.isNull(details[0].getAttribute('name'));
    });
});
