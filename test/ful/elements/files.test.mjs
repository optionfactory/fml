import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const mount = async (html) => {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const el = container.firstElementChild;
    await Rendering.waitFor(el);
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

const bytes = (n) => new Uint8Array(n);
const file = (name, size = 4) => new File([bytes(size)], name, { type: 'application/octet-stream' });
const transfer = (...files) => {
    const dt = new DataTransfer();
    for (const f of files) {
        dt.items.add(f);
    }
    return dt;
};
/** picking files in the native dialog: the browser fills input.files, then fires change */
const pick = (el, ...files) => {
    const input = el.querySelector('input[type=file]');
    input.files = transfer(...files).files;
    input.dispatchEvent(new Event('change'));
};
const drop = (el, ...files) => {
    el.querySelector('[data-ref=dropzone]').dispatchEvent(
        new DragEvent('drop', { dataTransfer: transfer(...files), cancelable: true }),
    );
};
/** dragging a link or a text selection onto the dropzone: a drop with no file in it */
const dropText = (el, text) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    el.querySelector('[data-ref=dropzone]').dispatchEvent(
        new DragEvent('drop', { dataTransfer: dt, cancelable: true }),
    );
};
const selected = (el) => Array.from(el.files).map((f) => f.name);
const listed = (el) => Array.from(el.querySelectorAll('ful-item')).map((i) => i.dataset.name);
const warning = (el) => el.querySelector('ful-field-warning')?.innerText ?? null;
const warnings = (el) => Array.from(el.querySelectorAll('ful-field-warning')).map((w) => w.innerText);

describe('InputFile selection', () => {
    it('selects the dropped files and lists one item per file, with its formatted size', async () => {
        const [el, container] = await mount(`<ful-input-file multiple>files</ful-input-file>`);

        drop(el, file('a.txt', 3), file('b.txt', 2048));

        assert.deepStrictEqual(selected(el), ['a.txt', 'b.txt']);
        assert.deepStrictEqual(listed(el), ['a.txt', 'b.txt']);
        const sizes = Array.from(el.querySelectorAll('ful-item')).map((i) => i.children[1].innerText);
        assert.deepStrictEqual(sizes, ['3B', '2KiB']);

        container.remove();
    });

    it('removes only the file whose item was dismissed', async () => {
        const [el, container] = await mount(`<ful-input-file multiple>files</ful-input-file>`);
        pick(el, file('a.txt'), file('b.txt'), file('c.txt'));

        el.querySelector('ful-item[data-name="b.txt"] button').dispatchEvent(
            new MouseEvent('click', { bubbles: true }),
        );

        assert.deepStrictEqual(selected(el), ['a.txt', 'c.txt'], 'the other files must survive');
        assert.deepStrictEqual(listed(el), ['a.txt', 'c.txt']);

        container.remove();
    });

    it('removes only the clicked item when two files share a name', async () => {
        const [el, container] = await mount(`<ful-input-file multiple>files</ful-input-file>`);
        pick(el, file('a.txt', 1), file('a.txt', 2));
        assert.strictEqual(el.files.length, 2, 'two files with the same name can be selected');

        el.querySelectorAll('ful-item button')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));

        assert.strictEqual(el.files.length, 1, 'only the clicked one is removed');
        assert.strictEqual(el.file.size, 2, 'the survivor is the one that was not clicked');

        container.remove();
    });

    it('reports the selected names as an array when multiple', async () => {
        const [el, container] = await mount(`<ful-input-file multiple>files</ful-input-file>`);

        assert.deepStrictEqual(el.value, [], 'a multiple input has no scalar empty value');
        pick(el, file('a.txt'), file('b.txt'));

        assert.deepStrictEqual(el.value, ['a.txt', 'b.txt']);

        container.remove();
    });

    it('reports a single name, not an array, when not multiple', async () => {
        const [el, container] = await mount(`<ful-input-file>files</ful-input-file>`);

        pick(el, file('a.txt'));

        assert.strictEqual(el.value, 'a.txt');

        container.remove();
    });

    it('exposes the first file, or null, and the total size of the selection', async () => {
        const [el, container] = await mount(`<ful-input-file multiple>files</ful-input-file>`);

        assert.isNull(el.file);
        assert.strictEqual(el.totalsize, 0);
        pick(el, file('a.txt', 10), file('b.txt', 20));

        assert.strictEqual(el.file.name, 'a.txt');
        assert.strictEqual(el.totalsize, 30);

        el.file = file('c.txt', 5);
        assert.deepStrictEqual(selected(el), ['c.txt'], 'assigning a file replaces the selection');

        container.remove();
    });

    it('clears the selection and the item list when the value is reset to null', async () => {
        const [el, container] = await mount(`<ful-input-file multiple>files</ful-input-file>`);
        pick(el, file('a.txt'));

        el.value = null;

        assert.deepStrictEqual(selected(el), []);
        assert.deepStrictEqual(listed(el), []);

        container.remove();
    });

    it('ignores a non empty value, as file names cannot select files', async () => {
        const [el, container] = await mount(`<ful-input-file multiple>files</ful-input-file>`);
        pick(el, file('a.txt'));

        el.value = ['b.txt'];

        assert.deepStrictEqual(selected(el), ['a.txt'], 'the picked file must not be dropped');

        container.remove();
    });
});

describe('InputFile constraints', () => {
    it('drops the files whose extension is not accepted, keeping the acceptable ones', async () => {
        const [el, container] = await mount(`<ful-input-file multiple accept=".pdf,.png">files</ful-input-file>`);

        pick(el, file('a.pdf'), file('b.txt'), file('c.png'));

        assert.deepStrictEqual(selected(el), ['a.pdf', 'c.png']);
        assert.deepStrictEqual(listed(el), ['a.pdf', 'c.png'], 'the rejected file must not be listed');

        container.remove();
    });

    it('warns with the localized list of accepted extensions', async () => {
        const [el, container] = await mount(`<ful-input-file multiple accept=".pdf,.png">files</ful-input-file>`);

        pick(el, file('b.txt'));

        assert.strictEqual(warning(el), 'Only files of type .pdf, .png are supported');

        container.remove();
    });

    it('matches accepted extensions ignoring case', async () => {
        const [el, container] = await mount(`<ful-input-file multiple accept=".PDF">files</ful-input-file>`);

        pick(el, file('a.pdf'));

        assert.deepStrictEqual(selected(el), ['a.pdf']);
        assert.isNull(warning(el));

        container.remove();
    });

    it('drops the files above maxfilesize and warns with the readable limit', async () => {
        const [el, container] = await mount(`<ful-input-file multiple maxfilesize="2048">files</ful-input-file>`);

        pick(el, file('small.txt', 2048), file('big.txt', 2049));

        assert.deepStrictEqual(selected(el), ['small.txt'], 'the limit is inclusive');
        assert.strictEqual(warning(el), 'Maximum supported file size is 2KiB');

        container.remove();
    });

    it('clears the whole selection when the files together exceed maxtotalsize', async () => {
        const [el, container] = await mount(`<ful-input-file multiple maxtotalsize="100">files</ful-input-file>`);

        pick(el, file('a.txt', 50), file('b.txt', 50));
        assert.deepStrictEqual(selected(el), ['a.txt', 'b.txt'], 'the limit is inclusive');

        pick(el, file('a.txt', 50), file('b.txt', 51));

        assert.deepStrictEqual(selected(el), [], 'no file is kept: the caller must pick again');
        assert.deepStrictEqual(listed(el), []);
        assert.strictEqual(warning(el), 'Maximum supported total file size is 100B');

        container.remove();
    });

    it('clears the whole selection when more files than maxfiles are picked', async () => {
        const [el, container] = await mount(`<ful-input-file multiple maxfiles="2">files</ful-input-file>`);

        pick(el, file('a.txt'), file('b.txt'));
        assert.deepStrictEqual(selected(el), ['a.txt', 'b.txt'], 'the limit is inclusive');

        pick(el, file('a.txt'), file('b.txt'), file('c.txt'));

        assert.deepStrictEqual(selected(el), []);
        assert.strictEqual(warning(el), 'Maximum of 2 files exceeded');

        container.remove();
    });

    it('applies the constraints to dropped files too, not just to picked ones', async () => {
        const [el, container] = await mount(`<ful-input-file multiple accept=".pdf">files</ful-input-file>`);

        drop(el, file('a.pdf'), file('b.txt'));

        assert.deepStrictEqual(selected(el), ['a.pdf']);
        assert.strictEqual(warning(el), 'Only files of type .pdf are supported');

        container.remove();
    });
});

describe('InputFile dropzone', () => {
    it('accepts the drag, without which the browser would never fire a drop', async () => {
        const [el, container] = await mount(`<ful-input-file multiple>files</ful-input-file>`);

        const dragover = new DragEvent('dragover', { dataTransfer: transfer(file('a.txt')), cancelable: true });
        el.querySelector('[data-ref=dropzone]').dispatchEvent(dragover);

        assert.isTrue(dragover.defaultPrevented, 'a dragover left alone means "no drop here"');

        container.remove();
    });

    it('keeps the current selection when the drop carries no file', async () => {
        const [el, container] = await mount(`<ful-input-file multiple>files</ful-input-file>`);
        pick(el, file('a.txt'));

        dropText(el, 'https://example.com/not-a-file');

        assert.deepStrictEqual(selected(el), ['a.txt'], 'dragging a link must not wipe the pick');
        assert.deepStrictEqual(listed(el), ['a.txt']);

        container.remove();
    });
});

describe('InputFile warnings', () => {
    it('shows one warning per violated constraint, not just the last one', async () => {
        const [el, container] = await mount(
            `<ful-input-file multiple accept=".pdf" maxfilesize="10">files</ful-input-file>`,
        );

        pick(el, file('a.txt', 4), file('big.pdf', 20));

        assert.deepStrictEqual(warnings(el), [
            'Only files of type .pdf are supported',
            'Maximum supported file size is 10B',
        ]);

        container.remove();
    });

    it('stops complaining as soon as the next selection is clean', async () => {
        const [el, container] = await mount(`<ful-input-file multiple accept=".pdf">files</ful-input-file>`);
        pick(el, file('a.txt'));
        assert.strictEqual(warning(el), 'Only files of type .pdf are supported');

        pick(el, file('b.pdf'));

        assert.deepStrictEqual(warnings(el), [], 'a fixed selection must not keep the stale complaint on screen');

        container.remove();
    });
});

describe('InputFile programmatic selection', () => {
    it('enforces the constraints on a selection assigned programmatically', async () => {
        const [el, container] = await mount(`<ful-input-file multiple accept=".pdf">files</ful-input-file>`);

        el.files = transfer(file('a.pdf'), file('b.txt')).files;

        assert.deepStrictEqual(selected(el), ['a.pdf']);
        assert.deepStrictEqual(listed(el), ['a.pdf'], 'the item list must not go stale');
        assert.strictEqual(warning(el), 'Only files of type .pdf are supported');

        container.remove();
    });

    it('refreshes the item list when a single file is assigned programmatically', async () => {
        const [el, container] = await mount(`<ful-input-file>files</ful-input-file>`);

        el.file = file('a.txt');

        assert.deepStrictEqual(listed(el), ['a.txt']);

        container.remove();
    });
});
