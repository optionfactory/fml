import { assert } from '@esm-bundle/chai';
import { registry } from '../../dist/ftl.mjs';
import { Plugin } from '../../dist/ful.mjs';

registry.plugin(new Plugin()).configure();

describe('Form Spinner Button States', () => {
    it('should preserve intentionally disabled button states after the form spinner unspins', async () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <ful-form>
                <button type="submit" id="btn-enabled">Submit</button>
                <button type="submit" id="btn-disabled" disabled>Locked Submitter</button>
            </ful-form>
        `;
        document.body.appendChild(container);
        
        // FIX: Allow custom element parsing and child transitions to settle
        await new Promise(resolve => setTimeout(resolve, 0));

        const fulForm = container.querySelector('ful-form');
        const btnEnabled = fulForm.querySelector('#btn-enabled');
        const btnDisabled = fulForm.querySelector('#btn-disabled');

        fulForm.spinner(true);
        assert.strictEqual(btnEnabled.disabled, true);
        assert.strictEqual(btnDisabled.disabled, true);

        fulForm.spinner(false);
        assert.strictEqual(btnEnabled.disabled, false);
        assert.strictEqual(btnDisabled.disabled, true);
        
        assert.strictEqual(btnEnabled.dataset.wasDisabled, undefined);
        assert.strictEqual(btnDisabled.dataset.wasDisabled, undefined);

        container.remove();
    });
});