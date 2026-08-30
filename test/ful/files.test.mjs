import { assert } from '@esm-bundle/chai';
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

describe('InputFile', () => {
    it('mounts without accessing not yet initialized internals', async () => {
        const [el, container] = await mount(`<ful-input-file>files</ful-input-file>`);

        assert.isNotNull(el.querySelector('input[type=file]'));
        assert.isNotNull(el.querySelector('ful-item-list'));
        assert.isNotNull(el.querySelector('ful-field-error'));
        assert.deepStrictEqual(el.value, null);

        container.remove();
    });

    it('applies inherited observed attributes', async () => {
        const [el, container] = await mount(`<ful-input-file required readonly>files</ful-input-file>`);

        const input = el.querySelector('input[type=file]');
        assert.strictEqual(input.getAttribute('aria-required'), 'true');
        assert.strictEqual(input.readOnly, true);

        container.remove();
    });

    it('applies its own observed attributes', async () => {
        const [el, container] = await mount(
            `<ful-input-file multiple accept=".pdf,.png" maxfiles="3">files</ful-input-file>`,
        );

        const input = el.querySelector('input[type=file]');
        assert.strictEqual(input.multiple, true);
        assert.strictEqual(input.accept, '.pdf,.png');
        assert.deepStrictEqual(el.accept, ['.pdf', '.png']);
        assert.strictEqual(el.maxfiles, 3);

        container.remove();
    });

    it('reports custom validity via the field error', async () => {
        const [el, container] = await mount(`<ful-input-file>files</ful-input-file>`);

        el.setCustomValidity('nope');
        assert.strictEqual(el.querySelector('ful-field-error').innerText, 'nope');
        el.setCustomValidity();
        assert.strictEqual(el.querySelector('ful-field-error').innerText, '');

        container.remove();
    });
});
