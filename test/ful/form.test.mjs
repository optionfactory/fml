import { assert } from 'chai';
import { registry } from '../../src/ftl/index.mjs';
import { Plugin } from '../../src/ful/index.mjs';

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
describe('Form Spinner Button States across overlapping submits', () => {
    it('saves and restores the button states only once', async () => {
        const releases = [];
        registry.defineComponent('loaders:form', {
            create: () => ({
                prepare: async (v) => v,
                submit: () => new Promise((resolve) => releases.push(resolve)),
                transform: async (r) => r,
            })
        });
        const container = document.createElement('div');
        container.innerHTML = `
            <ful-form>
                <ful-spinner hidden></ful-spinner>
                <button type="submit" id="btn-enabled">Submit</button>
                <button type="submit" id="btn-disabled" disabled>Locked Submitter</button>
            </ful-form>
        `;
        document.body.appendChild(container);
        await new Promise(resolve => setTimeout(resolve, 0));

        const fulForm = container.querySelector('ful-form');
        const spinner = fulForm.querySelector('ful-spinner');
        const btnEnabled = fulForm.querySelector('#btn-enabled');
        const btnDisabled = fulForm.querySelector('#btn-disabled');

        const first = fulForm.submit();
        const second = fulForm.submit();
        assert.strictEqual(spinner.hidden, false, 'the spinner is shown while submitting');
        assert.strictEqual(btnEnabled.disabled, true);
        assert.strictEqual(btnDisabled.disabled, true);

        //both submits have to reach the loader before they can be released
        for (let i = 0; i !== 20; ++i) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        assert.strictEqual(releases.length, 2, 'both submits are in flight');

        releases[0]();
        await first;
        assert.strictEqual(spinner.hidden, false, 'the spinner stays shown until the last submit ends');
        assert.strictEqual(btnEnabled.disabled, true, 'buttons stay disabled until the last submit ends');

        releases[1]();
        await second;
        assert.strictEqual(spinner.hidden, true);
        assert.strictEqual(btnEnabled.disabled, false);
        assert.strictEqual(btnDisabled.disabled, true, 'an intentionally disabled button stays disabled');
        assert.isUndefined(btnEnabled.dataset.wd);
        assert.isUndefined(btnDisabled.dataset.wd);
        container.remove();
    });
});
