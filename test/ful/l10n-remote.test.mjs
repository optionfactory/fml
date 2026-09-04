import { assert } from 'chai';
import { registry, Rendering } from '../../src/ftl/index.mjs';
import { Plugin } from '../../src/ful/index.mjs';

/**
 * The remote translations are the app's concern: fetch the active language's JSON
 * before configure, hand it over as the translations option. This file proves
 * the pattern end to end: the element sits in the DOM as plain markup while
 * the translations load, nothing upgrades, so nothing can render a message that
 * the awaited translations were meant to replace.
 */
describe('Remote translations, awaited before configure', () => {
    it('renders the awaited translations once configure runs', async () => {
        const container = document.createElement('div');
        container.innerHTML = `<ful-input-file multiple accept=".pdf">files</ful-input-file>`;
        document.body.appendChild(container);
        const el = /** @type {any} */ (container.firstElementChild);

        assert.isUndefined(customElements.get('ful-input-file'), 'the element stays inert until configure');

        //the startup fetch: resolved before configure, exactly like a remote /l10n/{lang}.json
        const payload = encodeURIComponent(JSON.stringify({ 'files.unacceptablefiletype': 'we only take {types} here' }));
        const translations = await (await fetch(`data:application/json,${payload}`)).json();
        assert.strictEqual(translations['files.unacceptablefiletype'], 'we only take {types} here');

        registry.plugin(new Plugin({ language: 'en', translations })).configure();

        await Rendering.waitFor(el);
        const dt = new DataTransfer();
        dt.items.add(new File(['xxxx'], 'a.txt', { type: 'application/octet-stream' }));
        const input = el.querySelector('input[type=file]');
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));

        assert.strictEqual(el.querySelector('ful-field-warning').innerText, 'we only take .pdf here');

        container.remove();
    });
});
