import { assert } from 'chai';
import { registry, Rendering } from '../../src/ftl/index.mjs';
import { Plugin } from '../../src/ful/index.mjs';

registry.plugin(new Plugin()).configure();

const mount = async (html) => {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const el = container.firstElementChild;
    await Rendering.waitForChildren(el);
    return [el, container];
};

describe('Input placeholder', () => {
    for (const tag of ['ful-input', 'ful-input-local-date', 'ful-input-instant', 'ful-input-file', 'ful-filter-text']) {
        it(`${tag} applies the initial placeholder attribute`, async () => {
            const [el, container] = await mount(`<${tag} placeholder="PH">l</${tag}>`);
            assert.strictEqual(el.querySelector('input').getAttribute('placeholder'), 'PH', `${tag} inner input`);
            assert.strictEqual(el.placeholder, 'PH', `${tag} getter`);
            container.remove();
        });
        it(`${tag} applies a later placeholder change`, async () => {
            const [el, container] = await mount(`<${tag}>l</${tag}>`);
            el.setAttribute('placeholder', 'LATER');
            assert.strictEqual(el.querySelector('input').getAttribute('placeholder'), 'LATER', `${tag} inner input`);
            container.remove();
        });
    }
});
