import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';
import { appended, settle as drain } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const settle = () => drain();
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

        assert.lengthOf(details, 3, 'every details written as a child is rendered inside the group, none dropped');
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
        assert.isTrue(details[1].open, 'naming the group for exclusivity leaves the author-claimed open panel open');

        details[0].open = true;
        await settle();
        assert.isFalse(details[1].open, 'the platform closed the other named panel');
    });

    it('the exclusive claim stays live', async () => {
        const [accordion] = await mount(markup);
        const details = [...accordion.querySelectorAll('details')];

        accordion.exclusive = true;
        assert.strictEqual(
            details[0].getAttribute('name'),
            details[1].getAttribute('name'),
            'turning exclusive on at runtime gives every panel of the group one shared name',
        );
        assert.strictEqual(
            accordion.getAttribute('exclusive'),
            '',
            'the exclusive property is reflected to the exclusive attribute',
        );

        accordion.exclusive = false;
        assert.isNull(
            details[0].getAttribute('name'),
            'turning exclusive off removes the shared name so panels open independently again',
        );
    });
});
