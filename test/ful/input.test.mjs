import { assert } from 'chai';
import { registry, Rendering } from '../../src/ftl/index.mjs';
import { Plugin } from '../../src/ful/index.mjs';

registry.plugin(new Plugin()).configure();

const mount = async (html) => {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const el = container.firstElementChild;
    await Rendering.waitFor(el);
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

describe('Input placeholder and :placeholder-shown', () => {
    const mount = async (html) => {
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const el = container.firstElementChild;
        await Rendering.waitFor(el);
        return [el, container];
    };

    //:placeholder-shown only matches on input types that take a placeholder at all,
    //so date, time and file inputs carry the blank one without ever matching
    for (const tag of ['ful-input', 'ful-filter-text']) {
        it(`${tag} keeps a blank placeholder, so the label can float`, async () => {
            const [el, container] = await mount(`<${tag}>l</${tag}>`);
            const input = el.querySelector('input');

            assert.strictEqual(input.getAttribute('placeholder'), ' ');
            assert.isTrue(input.matches(':placeholder-shown'));
            assert.isNull(el.placeholder, 'the blank one does not read back as a value');
            container.remove();
        });
    }

    for (const tag of ['ful-input-file', 'ful-input-local-date', 'ful-input-instant']) {
        it(`${tag} keeps a blank placeholder without reporting it as a value`, async () => {
            const [el, container] = await mount(`<${tag}>l</${tag}>`);

            assert.strictEqual(el.querySelector('input').getAttribute('placeholder'), ' ');
            assert.isNull(el.placeholder);
            container.remove();
        });
    }

    it('restores the blank placeholder when the attribute is removed', async () => {
        const [el, container] = await mount(`<ful-input placeholder="p">l</ful-input>`);
        const input = el.querySelector('input');
        assert.strictEqual(input.getAttribute('placeholder'), 'p');

        el.removeAttribute('placeholder');

        assert.strictEqual(input.getAttribute('placeholder'), ' ');
        assert.isNull(el.placeholder);
        container.remove();
    });

    it('does not reflect the blank placeholder onto the host', async () => {
        const [el, container] = await mount(`<ful-input>l</ful-input>`);

        assert.isFalse(el.hasAttribute('placeholder'));
        container.remove();
    });
});
