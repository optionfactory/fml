import { assert } from 'chai';
import { registry, Rendering } from '../../../src/ftl/index.mjs';
import { Plugin } from '../../../src/ful/index.mjs';
import { appended } from '../../harness.mjs';

registry.plugin(new Plugin({ language: 'en' })).configure();

const mount = async (html) => {
    const container = appended(html);
    const el = container.firstElementChild;
    await Rendering.waitFor(el);
    return [el, container];
};

describe('InputFile', () => {
    it('mounts without accessing not yet initialized internals', async () => {
        const [el] = await mount(`<ful-input-file>files</ful-input-file>`);

        assert.isNotNull(el.querySelector('input[type=file]'), 'the field renders its native file input');
        assert.isNotNull(el.querySelector('ful-item-list'), 'the field renders its item list');
        assert.isNotNull(el.querySelector('ful-field-error'), 'the field renders its error slot');
        assert.deepStrictEqual(el.value, null, 'a single-file field with no selection has a null value');
    });

    it('applies inherited observed attributes', async () => {
        const [el] = await mount(`<ful-input-file required readonly>files</ful-input-file>`);

        const input = el.querySelector('input[type=file]');
        assert.strictEqual(
            input.getAttribute('aria-required'),
            'true',
            'the required claim is announced on the native input',
        );
        assert.isTrue(el.readonly, 'the readonly attribute is applied at render');
        assert.isFalse(el.querySelector('ful-control-group').inert, 'inert would hide the list from a reader');
        assert.strictEqual(
            input.getAttribute('aria-readonly'),
            'true',
            'the readonly claim is announced on the native input instead',
        );
    });

    it('applies its own observed attributes', async () => {
        const [el] = await mount(`<ful-input-file multiple accept=".pdf,.png" max-files="3">files</ful-input-file>`);

        const input = el.querySelector('input[type=file]');
        assert.strictEqual(input.multiple, true, 'the multiple attribute reaches the native input');
        assert.strictEqual(input.accept, '.pdf,.png', 'the accept list reaches the native input for its picker');
        assert.deepStrictEqual(el.accept, ['.pdf', '.png'], 'the accept attribute is parsed as a comma separated list');
        assert.strictEqual(el.maxFiles, 3, 'the max-files attribute is parsed as a number');
    });

    it('reports custom validity via the field error', async () => {
        const [el] = await mount(`<ful-input-file>files</ful-input-file>`);

        el.setCustomValidity('nope');
        assert.strictEqual(
            el.querySelector('ful-field-error').innerText,
            'nope',
            'a custom validity message is shown in the field error',
        );
        el.setCustomValidity();
        assert.strictEqual(
            el.querySelector('ful-field-error').innerText,
            '',
            'clearing the custom validity empties the field error',
        );
    });
});

const bytes = (n) => new Uint8Array(n);
const file = (name, size = 4, type = 'application/octet-stream') => new File([bytes(size)], name, { type });
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
        const [el] = await mount(`<ful-input-file multiple>files</ful-input-file>`);

        drop(el, file('a.txt', 3), file('b.txt', 2048));

        assert.deepStrictEqual(selected(el), ['a.txt', 'b.txt'], 'a drop selects every file it carries');
        assert.deepStrictEqual(listed(el), ['a.txt', 'b.txt'], 'the item list holds one item per selected file');
        const sizes = Array.from(el.querySelectorAll('ful-item')).map((i) => i.querySelectorAll('span')[1].innerText);
        assert.deepStrictEqual(sizes, ['3B', '2KiB'], 'each item shows its file size in localized bytes');
    });

    it('removes only the file whose item was dismissed', async () => {
        const [el] = await mount(`<ful-input-file multiple>files</ful-input-file>`);
        pick(el, file('a.txt'), file('b.txt'), file('c.txt'));

        el.querySelector('ful-item[data-name="b.txt"] button').dispatchEvent(
            new MouseEvent('click', { bubbles: true }),
        );

        assert.deepStrictEqual(selected(el), ['a.txt', 'c.txt'], 'the other files must survive');
        assert.deepStrictEqual(
            listed(el),
            ['a.txt', 'c.txt'],
            "the dismissed file's item leaves the list while the others stay",
        );
    });

    it('reports the drop and removal gestures through change, keeping the setters silent', async () => {
        const [el] = await mount(`<ful-input-file multiple>files</ful-input-file>`);
        const seen = [];
        el.addEventListener('change', (evt) => seen.push(evt.detail.value));

        drop(el, file('a.txt'), file('b.txt'));
        assert.deepStrictEqual(seen, [['a.txt', 'b.txt']], 'a drop is a selection, as a native input reports it');

        el.querySelector('ful-item[data-name="a.txt"] button').dispatchEvent(
            new MouseEvent('click', { bubbles: true }),
        );
        assert.deepStrictEqual(seen, [['a.txt', 'b.txt'], ['b.txt']], 'a removal is a gesture too');

        el.value = null;
        assert.strictEqual(seen.length, 2, 'a programmatic write stays silent, like a native input');
    });

    it('removes only the clicked item when two files share a name', async () => {
        const [el] = await mount(`<ful-input-file multiple>files</ful-input-file>`);
        pick(el, file('a.txt', 1), file('a.txt', 2));
        assert.strictEqual(el.files.length, 2, 'two files with the same name can be selected');

        el.querySelectorAll('ful-item button')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));

        assert.strictEqual(el.files.length, 1, 'only the clicked one is removed');
        assert.strictEqual(el.file.size, 2, 'the survivor is the one that was not clicked');
    });

    it('reports the selected names as an array when multiple', async () => {
        const [el] = await mount(`<ful-input-file multiple>files</ful-input-file>`);

        assert.deepStrictEqual(el.value, [], 'a multiple input has no scalar empty value');
        pick(el, file('a.txt'), file('b.txt'));

        assert.deepStrictEqual(
            el.value,
            ['a.txt', 'b.txt'],
            'a multiple field reports the selected names as an array, in order',
        );
    });

    it('reports a single name, not an array, when not multiple', async () => {
        const [el] = await mount(`<ful-input-file>files</ful-input-file>`);

        pick(el, file('a.txt'));

        assert.strictEqual(el.value, 'a.txt', 'a single-file field reports its one name as a string');
    });

    it('exposes the first file, or null, and the total size of the selection', async () => {
        const [el] = await mount(`<ful-input-file multiple>files</ful-input-file>`);

        assert.isNull(el.file, 'file is null while nothing is selected');
        assert.strictEqual(el.totalsize, 0, 'the total size of an empty selection is zero');
        pick(el, file('a.txt', 10), file('b.txt', 20));

        assert.strictEqual(el.file.name, 'a.txt', 'file answers the first selected file');
        assert.strictEqual(el.totalsize, 30, 'totalsize adds the sizes of every selected file');

        el.file = file('c.txt', 5);
        assert.deepStrictEqual(selected(el), ['c.txt'], 'assigning a file replaces the selection');
    });

    it('clears the selection and the item list when the value is reset to null', async () => {
        const [el] = await mount(`<ful-input-file multiple>files</ful-input-file>`);
        pick(el, file('a.txt'));

        el.value = null;

        assert.deepStrictEqual(selected(el), [], 'a null value empties the selection');
        assert.deepStrictEqual(listed(el), [], 'a null value empties the item list with the selection');
    });

    it('ignores a non empty value, as file names cannot select files', async () => {
        const [el] = await mount(`<ful-input-file multiple>files</ful-input-file>`);
        pick(el, file('a.txt'));

        el.value = ['b.txt'];

        assert.deepStrictEqual(selected(el), ['a.txt'], 'the picked file must not be dropped');
    });
});

describe('InputFile constraints', () => {
    it('drops the files whose extension is not accepted, keeping the acceptable ones', async () => {
        const [el] = await mount(`<ful-input-file multiple accept=".pdf,.png">files</ful-input-file>`);

        pick(el, file('a.pdf'), file('b.txt'), file('c.png'));

        assert.deepStrictEqual(
            selected(el),
            ['a.pdf', 'c.png'],
            'a file whose extension matches no accepted token is dropped, the others kept',
        );
        assert.deepStrictEqual(listed(el), ['a.pdf', 'c.png'], 'the rejected file must not be listed');
    });

    it('warns with the localized list of accepted extensions', async () => {
        const [el] = await mount(`<ful-input-file multiple accept=".pdf,.png">files</ful-input-file>`);

        pick(el, file('b.txt'));

        assert.strictEqual(
            warning(el),
            'Only files of type .pdf, .png are supported',
            'the warning names the accepted tokens, joined by a comma',
        );
    });

    it('matches accepted extensions ignoring case', async () => {
        const [el] = await mount(`<ful-input-file multiple accept=".PDF">files</ful-input-file>`);

        pick(el, file('a.pdf'));

        assert.deepStrictEqual(selected(el), ['a.pdf'], 'an extension token matches the file name ignoring case');
        assert.isNull(warning(el), 'a file that matches shows no warning');
    });

    it('accepts mime types, not only extensions', async () => {
        const [el] = await mount(`<ful-input-file multiple accept="image/png">files</ful-input-file>`);

        pick(el, file('a.png', 4, 'image/png'), file('b.txt', 4, 'text/plain'));

        assert.deepStrictEqual(selected(el), ['a.png'], 'a mime type token keeps a file of that type');
        assert.deepStrictEqual(listed(el), ['a.png'], 'a file of another type is dropped from the list too');
    });

    it('mixes extensions and mime types in one list, matching each its own way', async () => {
        const [el] = await mount(`<ful-input-file multiple accept=".pdf,image/png">files</ful-input-file>`);

        pick(el, file('a.pdf'), file('b.png', 4, 'image/png'), file('c.txt', 4, 'text/plain'));

        assert.deepStrictEqual(
            selected(el),
            ['a.pdf', 'b.png'],
            'each token matches its own way: the extension by name, the mime type by type',
        );
        assert.strictEqual(
            warning(el),
            'Only files of type .pdf, image/png are supported',
            'the warning lists every accepted token, extensions and mime types alike',
        );
    });

    it('accepts a whole mime family through the wildcard', async () => {
        const [el] = await mount(`<ful-input-file multiple accept="image/*">files</ful-input-file>`);

        pick(el, file('a.png', 4, 'image/png'), file('b.jpg', 4, 'image/jpeg'), file('c.pdf'));

        assert.deepStrictEqual(
            selected(el),
            ['a.png', 'b.jpg'],
            'a family token such as image/* keeps every file of that family',
        );
        assert.strictEqual(
            warning(el),
            'Only files of type image/* are supported',
            'the warning names the family token',
        );
    });

    it('matches a mime type carrying parameters, ignoring them', async () => {
        const [el] = await mount(`<ful-input-file multiple accept="text/plain; charset=utf-8">files</ful-input-file>`);

        pick(el, file('a.txt', 4, 'text/plain'));

        assert.deepStrictEqual(
            selected(el),
            ['a.txt'],
            'the parameters of a mime type token are ignored when matching',
        );
        assert.isNull(warning(el), 'a file matching a token with parameters shows no warning');
    });

    it('drops the files above max-file-size and warns with the readable limit', async () => {
        const [el] = await mount(`<ful-input-file multiple max-file-size="2048">files</ful-input-file>`);

        pick(el, file('small.txt', 2048), file('big.txt', 2049));

        assert.deepStrictEqual(selected(el), ['small.txt'], 'the limit is inclusive');
        assert.strictEqual(
            warning(el),
            'Maximum supported file size is 2KiB',
            'the warning states the size limit in localized bytes',
        );
    });

    it('clears the whole selection when the files together exceed max-total-size', async () => {
        const [el] = await mount(`<ful-input-file multiple max-total-size="100">files</ful-input-file>`);

        pick(el, file('a.txt', 50), file('b.txt', 50));
        assert.deepStrictEqual(selected(el), ['a.txt', 'b.txt'], 'the limit is inclusive');

        pick(el, file('a.txt', 50), file('b.txt', 51));

        assert.deepStrictEqual(selected(el), [], 'no file is kept: the caller must pick again');
        assert.deepStrictEqual(listed(el), [], 'a cleared selection leaves the item list empty too');
        assert.strictEqual(
            warning(el),
            'Maximum supported total file size is 100B',
            'the warning states the total size limit in localized bytes',
        );
    });

    it('clears the whole selection when more files than max-files are picked', async () => {
        const [el] = await mount(`<ful-input-file multiple max-files="2">files</ful-input-file>`);

        pick(el, file('a.txt'), file('b.txt'));
        assert.deepStrictEqual(selected(el), ['a.txt', 'b.txt'], 'the limit is inclusive');

        pick(el, file('a.txt'), file('b.txt'), file('c.txt'));

        assert.deepStrictEqual(selected(el), [], 'a selection holding more files than max-files is cleared entirely');
        assert.strictEqual(warning(el), 'Maximum of 2 files exceeded', 'the warning states the most files allowed');
    });

    it('applies the constraints to dropped files too, not just to picked ones', async () => {
        const [el] = await mount(`<ful-input-file multiple accept=".pdf">files</ful-input-file>`);

        drop(el, file('a.pdf'), file('b.txt'));

        assert.deepStrictEqual(selected(el), ['a.pdf'], 'a drop goes through the accept constraint like a pick');
        assert.strictEqual(
            warning(el),
            'Only files of type .pdf are supported',
            'a drop that breaks a constraint shows its warning like a pick',
        );
    });
});

describe('InputFile dropzone', () => {
    it('accepts the drag, without which the browser would never fire a drop', async () => {
        const [el] = await mount(`<ful-input-file multiple>files</ful-input-file>`);

        const dragover = new DragEvent('dragover', { dataTransfer: transfer(file('a.txt')), cancelable: true });
        el.querySelector('[data-ref=dropzone]').dispatchEvent(dragover);

        assert.isTrue(dragover.defaultPrevented, 'a dragover left alone means "no drop here"');
    });

    it('keeps the current selection when the drop carries no file', async () => {
        const [el] = await mount(`<ful-input-file multiple>files</ful-input-file>`);
        pick(el, file('a.txt'));

        dropText(el, 'https://example.com/not-a-file');

        assert.deepStrictEqual(selected(el), ['a.txt'], 'dragging a link must not wipe the pick');
        assert.deepStrictEqual(listed(el), ['a.txt'], 'a drop with no file leaves the item list as it was');
    });
});

describe('InputFile warnings', () => {
    it('shows one warning per violated constraint, not just the last one', async () => {
        const [el] = await mount(`<ful-input-file multiple accept=".pdf" max-file-size="10">files</ful-input-file>`);

        pick(el, file('a.txt', 4), file('big.pdf', 20));

        assert.deepStrictEqual(
            warnings(el),
            ['Only files of type .pdf are supported', 'Maximum supported file size is 10B'],
            'each violated constraint shows its own warning, in the order the constraints run',
        );
    });

    it('stops complaining as soon as the next selection is clean', async () => {
        const [el] = await mount(`<ful-input-file multiple accept=".pdf">files</ful-input-file>`);
        pick(el, file('a.txt'));
        assert.strictEqual(
            warning(el),
            'Only files of type .pdf are supported',
            'the first selection breaks the accept constraint and shows its warning',
        );

        pick(el, file('b.pdf'));

        assert.deepStrictEqual(warnings(el), [], 'a fixed selection must not keep the stale complaint on screen');
    });
});

describe('InputFile programmatic selection', () => {
    it('enforces the constraints on a selection assigned programmatically', async () => {
        const [el] = await mount(`<ful-input-file multiple accept=".pdf">files</ful-input-file>`);

        el.files = transfer(file('a.pdf'), file('b.txt')).files;

        assert.deepStrictEqual(
            selected(el),
            ['a.pdf'],
            'a files assignment goes through the accept constraint like a pick',
        );
        assert.deepStrictEqual(listed(el), ['a.pdf'], 'the item list must not go stale');
        assert.strictEqual(
            warning(el),
            'Only files of type .pdf are supported',
            'a files assignment that breaks a constraint shows its warning',
        );
    });

    it('refreshes the item list when a single file is assigned programmatically', async () => {
        const [el] = await mount(`<ful-input-file>files</ful-input-file>`);

        el.file = file('a.txt');

        assert.deepStrictEqual(listed(el), ['a.txt'], 'assigning file refreshes the item list');
    });
});

describe('InputFile items template', () => {
    it('renders a slotted items template instead of the stock one, over the same files', async () => {
        const [el] = await mount(`
            <ful-input-file multiple>files
                <template slot="items">
                    <ful-item data-tpl-each="files" data-tpl-var="file" data-tpl-data-name="file.name">
                        <span data-ref="kind">{{ file.type }}</span>
                        <button type="button" data-tpl-aria-label="#l10n:t('files.remove')">x</button>
                    </ful-item>
                </template>
            </ful-input-file>`);

        el.files = transfer(file('a.txt', 4, 'text/plain'), file('b.png', 4, 'image/png')).files;

        assert.deepStrictEqual(listed(el), ['a.txt', 'b.png'], 'the custom template still keys its items');
        assert.deepStrictEqual(
            Array.from(el.querySelectorAll('ful-item [data-ref=kind]')).map((s) => s.textContent),
            ['text/plain', 'image/png'],
            'the slotted template reads the File objects through the same files overlay as the stock item',
        );
        assert.strictEqual(
            el.querySelector('ful-item button').getAttribute('aria-label'),
            'Remove',
            'the localized modules resolve inside a slotted template',
        );
    });

    it('keeps the remove button wired inside an authored item', async () => {
        const [el] = await mount(`
            <ful-input-file multiple>files
                <template slot="items">
                    <ful-item data-tpl-each="files" data-tpl-var="file" data-tpl-data-name="file.name">
                        <button type="button">drop</button>
                    </ful-item>
                </template>
            </ful-input-file>`);
        el.files = transfer(file('a.txt'), file('b.txt')).files;

        el.querySelector('ful-item button').click();

        assert.deepStrictEqual(selected(el), ['b.txt'], 'the click removed the first file');
        assert.deepStrictEqual(listed(el), ['b.txt'], "the removed file's authored item leaves the list");
    });

    it('falls back to the stock item when the slot is blank', async () => {
        const [el] = await mount(
            `<ful-input-file multiple>files<template slot="items">   </template></ful-input-file>`,
        );

        el.files = transfer(file('a.txt')).files;

        assert.deepStrictEqual(
            listed(el),
            ['a.txt'],
            'a blank items slot falls back to the stock item, which still lists the file',
        );
        assert.isNotNull(el.querySelector('ful-item ful-icon'), 'the stock item carries the remove glyph');
    });
});

describe('InputFile list and dropzone interactions', () => {
    const mount = async (html) => {
        const container = appended(html);
        const el = container.firstElementChild;
        await Rendering.waitFor(el);
        return [el, container];
    };
    const pick = (el, ...files) => {
        const dt = new DataTransfer();
        for (const f of files) {
            dt.items.add(f);
        }
        const input = el.querySelector('input[type=file]');
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const file = (name, size = 10) => new File(['x'.repeat(size)], name, { type: 'application/octet-stream' });

    it('removes the file whose list item button was clicked', async () => {
        const [el] = await mount(`<ful-input-file multiple>files</ful-input-file>`);
        pick(el, file('keep.txt'), file('drop.txt'));

        const remove = el.querySelectorAll('ful-item button')[1];
        remove.dispatchEvent(new Event('click', { bubbles: true }));

        assert.deepStrictEqual(
            Array.from(el.files).map((f) => f.name),
            ['keep.txt'],
            'the clicked entry is gone, the survivor stays',
        );
    });

    it('opens the picker when the default dropzone is clicked', async () => {
        const [el] = await mount(`<ful-input-file>files</ful-input-file>`);
        const input = el.querySelector('input[type=file]');
        let opened = false;
        input.addEventListener('click', (e) => {
            e.preventDefault();
            opened = true;
        });

        el.querySelector('[data-ref=dropzone]').dispatchEvent(new Event('click', { bubbles: true }));

        assert.isTrue(opened, 'the click reached the native picker');
    });

    it("opens the field's own picker when the page slots an input of its own before it", async () => {
        const [el] = await mount(`<ful-input-file><span slot="before"><input id="own"></span>files</ful-input-file>`);
        const clicked = [];
        for (const input of el.querySelectorAll('input')) {
            input.addEventListener('click', (e) => {
                e.preventDefault();
                clicked.push(input.id === 'own' ? 'own' : 'field');
            });
        }

        el.querySelector('[data-ref=dropzone]').dispatchEvent(new Event('click', { bubbles: true }));

        assert.deepStrictEqual(
            clicked,
            ['field'],
            "a dropzone click opens the field's own file input, not an input the page slotted before it",
        );
    });

    it('carries the dragover state while a drag hovers the dropzone', async () => {
        const [el] = await mount(`<ful-input-file>files</ful-input-file>`);
        const dropzone = el.querySelector('[data-ref=dropzone]');

        dropzone.dispatchEvent(new DragEvent('dragover', { cancelable: true }));
        assert.isTrue(
            el.hasAttribute('dragover'),
            'a dragover on the dropzone sets the dragover attribute on the host',
        );

        dropzone.dispatchEvent(new DragEvent('dragleave'));
        assert.isFalse(el.hasAttribute('dragover'), 'a dragleave removes the dragover attribute');
    });
});

describe('InputFile warning dismissal', () => {
    it('removes a warning once its animation ends, without touching the selection', async () => {
        const [el] = await mount(`<ful-input-file multiple accept=".pdf">files</ful-input-file>`);
        pick(el, file('b.txt'));

        const warningEl = el.querySelector('ful-field-warning');
        assert.isNotNull(warningEl, 'a pick that breaks the accept constraint shows a warning');

        warningEl.dispatchEvent(new AnimationEvent('animationend', { bubbles: true }));

        assert.isNull(el.querySelector('ful-field-warning'), 'the expired warning leaves the DOM');
        assert.deepStrictEqual(selected(el), [], 'the rejected pick is not resurrected by the dismissal');
    });

    it('removes a warning after WARNING_TIMEOUT even when its animation never ends', async () => {
        const InputFile = customElements.get('ful-input-file');
        const timeout = InputFile.WARNING_TIMEOUT;
        InputFile.WARNING_TIMEOUT = 20;
        try {
            const [el] = await mount(`<ful-input-file multiple accept=".pdf">files</ful-input-file>`);
            pick(el, file('b.txt'));
            assert.lengthOf(warnings(el), 1, 'a pick that breaks the accept constraint shows one warning');

            await new Promise((resolve) => setTimeout(resolve, 100));

            assert.deepStrictEqual(
                warnings(el),
                [],
                'the warning is removed once WARNING_TIMEOUT has elapsed, with no animationend',
            );
        } finally {
            InputFile.WARNING_TIMEOUT = timeout;
        }
    });
});

describe('InputFile stray clicks', () => {
    it('removes nothing when the click lands on the item, away from its button', async () => {
        const [el] = await mount(`<ful-input-file multiple>files</ful-input-file>`);
        pick(el, file('a.txt'), file('b.txt'));

        el.querySelector('ful-item div').dispatchEvent(new MouseEvent('click', { bubbles: true }));

        assert.deepStrictEqual(
            selected(el),
            ['a.txt', 'b.txt'],
            'a click on an item away from its button removes no file',
        );
    });

    it('removes nothing when a button outside any item is clicked', async () => {
        const [el] = await mount(`<ful-input-file multiple>files</ful-input-file>`);
        pick(el, file('a.txt'));
        const stray = document.createElement('button');
        stray.type = 'button';
        stray.innerText = 'clear all';
        el.querySelector('ful-item-list').appendChild(stray);

        stray.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        assert.deepStrictEqual(selected(el), ['a.txt'], 'a button that is not inside an item removes no file');
    });
});

describe('InputFile disabled and readonly claims', () => {
    const interactions = {
        'a drop replaces nothing': (el) => drop(el, file('z.txt')),
        'a removal click dismisses nothing': (el) =>
            el
                .querySelector('ful-item[data-name="a.txt"] button')
                .dispatchEvent(new MouseEvent('click', { bubbles: true })),
        'the dropzone opens no picker': (el) => {
            const input = el.querySelector('input[type=file]');
            let opened = false;
            input.click = () => {
                opened = true;
            };
            el.querySelector('[data-ref=dropzone]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
            assert.isFalse(opened, 'the picker must not open');
        },
    };
    for (const [claim, attribute] of [
        ['disabled', 'disabled'],
        ['readonly', 'readonly'],
    ]) {
        for (const [does, act] of Object.entries(interactions)) {
            it(`${does} while ${claim}`, async () => {
                const [el] = await mount(`<ful-input-file multiple>files</ful-input-file>`);
                pick(el, file('a.txt'), file('b.txt'));
                el.setAttribute(attribute, '');

                act(el);

                assert.deepStrictEqual(selected(el), ['a.txt', 'b.txt'], `the selection is frozen by the ${claim}`);
            });
        }
        it(`shows no dropzone while ${claim}, the chosen files staying in the item list`, async () => {
            const [el] = await mount(`<ful-input-file multiple dropzone item-list>files</ful-input-file>`);
            pick(el, file('a.txt'));
            const dropzone = el.querySelector('[data-ref=dropzone]');
            assert.notStrictEqual(
                getComputedStyle(dropzone).display,
                'none',
                'the dropzone is shown before the claim is set',
            );

            el.setAttribute(attribute, '');

            assert.strictEqual(
                getComputedStyle(dropzone).display,
                'none',
                'the dropzone is hidden while the field is disabled or readonly, since it does nothing then',
            );
            assert.notStrictEqual(
                getComputedStyle(el.querySelector('ful-item-list')).display,
                'none',
                'the files already chosen stay visible',
            );
            assert.deepStrictEqual(selected(el), ['a.txt'], 'hiding the dropzone leaves the selection as it was');

            el.removeAttribute(attribute);
            assert.notStrictEqual(
                getComputedStyle(dropzone).display,
                'none',
                'the dropzone is shown again once the claim is removed',
            );
        });

        it(`keeps the input while ${claim} without an item list, it being the only place the name shows`, async () => {
            const [el] = await mount(`<ful-input-file>files</ful-input-file>`);
            pick(el, file('a.txt'));

            el.setAttribute(attribute, '');

            assert.notStrictEqual(
                getComputedStyle(el.querySelector('ful-control-group')).display,
                'none',
                'without an item list the input stays shown while disabled or readonly, since it is the only place the file name shows',
            );
        });

        it(`hides the remove button on each chosen file while ${claim}`, async () => {
            const [el] = await mount(`<ful-input-file multiple item-list>files</ful-input-file>`);
            pick(el, file('a.txt'));
            const remove = el.querySelector('ful-item[data-name="a.txt"] button');
            assert.notStrictEqual(
                getComputedStyle(remove).display,
                'none',
                'the remove button is shown before the claim is set',
            );

            el.setAttribute(attribute, '');

            assert.strictEqual(
                getComputedStyle(remove).display,
                'none',
                'the remove button is hidden while the field is disabled or readonly, since a removal does nothing then',
            );
            assert.include(
                el.querySelector('ful-item[data-name="a.txt"]').textContent,
                'a.txt',
                'the item keeps showing the file name while its remove button is hidden',
            );
        });

        it(`keeps a drop from reaching the browser's default handling while ${claim}`, async () => {
            const [el] = await mount(`<ful-input-file ${attribute}>files</ful-input-file>`);
            const dropped = new DragEvent('drop', { dataTransfer: transfer(file('z.txt')), cancelable: true });

            el.querySelector('[data-ref=dropzone]').dispatchEvent(dropped);

            assert.isTrue(
                dropped.defaultPrevented,
                "a drop on a disabled or readonly field is still kept from the browser's default handling, which would open the file",
            );
        });
    }
    it('mirrors the readonly from markup', async () => {
        const [el] = await mount(`<ful-input-file readonly>files</ful-input-file>`);

        assert.strictEqual(
            el.querySelector('input[type=file]').getAttribute('aria-readonly'),
            'true',
            'a readonly attribute in the markup is announced on the native input',
        );
    });

    it('drops the picker button while readonly, the input taking back its padding', async () => {
        const [el] = await mount(`<ful-input-file>files</ful-input-file>`);
        const input = el.querySelector('input[type=file]');
        const button = () => getComputedStyle(input, '::file-selector-button');

        el.setAttribute('readonly', '');

        assert.strictEqual(
            button().display,
            'none',
            'a readonly field hides the picker button, since the picker does nothing then',
        );
        assert.notStrictEqual(
            getComputedStyle(input).paddingLeft,
            '0px',
            'without the picker button the readonly input takes back its left padding',
        );
        assert.notStrictEqual(getComputedStyle(input).display, 'none', 'the input keeps showing the file name');
    });

    it('keeps the picker button while disabled, dimmed as the platform dims its own', async () => {
        const [el] = await mount(`<ful-input-file>files</ful-input-file>`);
        const input = el.querySelector('input[type=file]');
        const button = () => getComputedStyle(input, '::file-selector-button');

        el.setAttribute('disabled', '');

        assert.notStrictEqual(button().display, 'none', 'a disabled field keeps its picker button');
        assert.strictEqual(button().opacity, '0.5', 'a disabled field dims its picker button');
        assert.strictEqual(getComputedStyle(input).paddingLeft, '0px', 'the button still sits flush');
    });

    it('is its item list while readonly, the way ful-select is', async () => {
        const [el] = await mount(`<ful-input-file multiple item-list>files</ful-input-file>`);
        pick(el, file('a.txt'));
        const group = el.querySelector('ful-control-group');

        el.setAttribute('readonly', '');

        assert.strictEqual(
            getComputedStyle(group).display,
            'none',
            'a readonly field with an item list hides its input, the list showing the files instead',
        );
        assert.notStrictEqual(
            getComputedStyle(el.querySelector('ful-item-list')).display,
            'none',
            'a readonly field keeps its item list shown',
        );
    });

    it('lines a readonly item list up with an ordinary input beside it', async () => {
        const container = appended(`
            <div>
                <ful-input name="plain" value="a value">A normal input</ful-input>
                <ful-input-file name="files" item-list readonly>Readonly file</ful-input-file>
            </div>`);
        const plain = container.querySelector('ful-input');
        const claimed = container.querySelector('ful-input-file');
        await Rendering.waitFor(plain);
        await Rendering.waitFor(claimed);
        const transfer = new DataTransfer();
        transfer.items.add(new File(['x'], 'report.pdf'));
        claimed.files = transfer.files;

        const control = plain.querySelector('ful-control-group').getBoundingClientRect().height;
        const list = claimed.querySelector('ful-item-list').getBoundingClientRect().height;
        assert.closeTo(list, control, 1, 'the list stands where the control would');
        assert.closeTo(
            claimed.getBoundingClientRect().height,
            plain.getBoundingClientRect().height,
            1,
            'a readonly file field with an item list is as tall as an ordinary input beside it',
        );
    });

    it('keeps the control while disabled, which says unavailable rather than absent', async () => {
        const [el] = await mount(`<ful-input-file multiple item-list>files</ful-input-file>`);
        pick(el, file('a.txt'));
        const group = el.querySelector('ful-control-group');

        el.setAttribute('disabled', '');

        assert.notStrictEqual(
            getComputedStyle(group).display,
            'none',
            'a disabled field keeps its input shown, marking the control unavailable rather than absent',
        );
        assert.notStrictEqual(
            getComputedStyle(el.querySelector('ful-item-list')).display,
            'none',
            'a disabled field keeps its item list shown',
        );
    });

    it('rejects a multi-file drop on a single-file field, as the native input does', async () => {
        const [single] = await mount(`<ful-input-file dropzone>files</ful-input-file>`);

        drop(single, file('a.pdf'), file('b.pdf'));
        assert.deepStrictEqual(selected(single), [], 'the whole drop is rejected');

        drop(single, file('one.pdf'));
        assert.deepStrictEqual(selected(single), ['one.pdf'], 'a single-file drop is accepted');
    });

    it('ignores dropped directories, keeping the real files of the same drop', async () => {
        const [el] = await mount(`<ful-input-file multiple dropzone>files</ful-input-file>`);
        const dt = {
            items: [
                { kind: 'file', getAsFile: () => null },
                { kind: 'string', getAsFile: () => null },
                { kind: 'file', getAsFile: () => file('real.pdf') },
            ],
        };
        const ev = new DragEvent('drop', { dataTransfer: new DataTransfer(), cancelable: true });
        Object.defineProperty(ev, 'dataTransfer', { value: dt });

        el.querySelector('[data-ref=dropzone]').dispatchEvent(ev);

        assert.deepStrictEqual(
            selected(el),
            ['real.pdf'],
            'a drop keeps only the entries that are files and turn into a File, ignoring directories and strings',
        );
    });
});
