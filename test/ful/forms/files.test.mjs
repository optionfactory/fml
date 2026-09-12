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

        assert.isNotNull(el.querySelector('input[type=file]'));
        assert.isNotNull(el.querySelector('ful-item-list'));
        assert.isNotNull(el.querySelector('ful-field-error'));
        assert.deepStrictEqual(el.value, null);

    });

    it('applies inherited observed attributes', async () => {
        const [el] = await mount(`<ful-input-file required readonly>files</ful-input-file>`);

        const input = el.querySelector('input[type=file]');
        assert.strictEqual(input.getAttribute('aria-required'), 'true');
        assert.isTrue(el.readonly);
        assert.isFalse(el.querySelector('ful-control-group').inert, 'inert would hide the list from a reader');
        assert.strictEqual(input.getAttribute('aria-readonly'), 'true', 'the claim is announced instead');

    });

    it('applies its own observed attributes', async () => {
        const [el] = await mount(
            `<ful-input-file multiple accept=".pdf,.png" maxfiles="3">files</ful-input-file>`,
        );

        const input = el.querySelector('input[type=file]');
        assert.strictEqual(input.multiple, true);
        assert.strictEqual(input.accept, '.pdf,.png');
        assert.deepStrictEqual(el.accept, ['.pdf', '.png']);
        assert.strictEqual(el.maxfiles, 3);

    });

    it('reports custom validity via the field error', async () => {
        const [el] = await mount(`<ful-input-file>files</ful-input-file>`);

        el.setCustomValidity('nope');
        assert.strictEqual(el.querySelector('ful-field-error').innerText, 'nope');
        el.setCustomValidity();
        assert.strictEqual(el.querySelector('ful-field-error').innerText, '');

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

        assert.deepStrictEqual(selected(el), ['a.txt', 'b.txt']);
        assert.deepStrictEqual(listed(el), ['a.txt', 'b.txt']);
        const sizes = Array.from(el.querySelectorAll('ful-item')).map((i) => i.querySelectorAll('span')[1].innerText);
        assert.deepStrictEqual(sizes, ['3B', '2KiB']);

    });

    it('removes only the file whose item was dismissed', async () => {
        const [el] = await mount(`<ful-input-file multiple>files</ful-input-file>`);
        pick(el, file('a.txt'), file('b.txt'), file('c.txt'));

        el.querySelector('ful-item[data-name="b.txt"] button').dispatchEvent(
            new MouseEvent('click', { bubbles: true }),
        );

        assert.deepStrictEqual(selected(el), ['a.txt', 'c.txt'], 'the other files must survive');
        assert.deepStrictEqual(listed(el), ['a.txt', 'c.txt']);

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

        assert.deepStrictEqual(el.value, ['a.txt', 'b.txt']);

    });

    it('reports a single name, not an array, when not multiple', async () => {
        const [el] = await mount(`<ful-input-file>files</ful-input-file>`);

        pick(el, file('a.txt'));

        assert.strictEqual(el.value, 'a.txt');

    });

    it('exposes the first file, or null, and the total size of the selection', async () => {
        const [el] = await mount(`<ful-input-file multiple>files</ful-input-file>`);

        assert.isNull(el.file);
        assert.strictEqual(el.totalsize, 0);
        pick(el, file('a.txt', 10), file('b.txt', 20));

        assert.strictEqual(el.file.name, 'a.txt');
        assert.strictEqual(el.totalsize, 30);

        el.file = file('c.txt', 5);
        assert.deepStrictEqual(selected(el), ['c.txt'], 'assigning a file replaces the selection');

    });

    it('clears the selection and the item list when the value is reset to null', async () => {
        const [el] = await mount(`<ful-input-file multiple>files</ful-input-file>`);
        pick(el, file('a.txt'));

        el.value = null;

        assert.deepStrictEqual(selected(el), []);
        assert.deepStrictEqual(listed(el), []);

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

        assert.deepStrictEqual(selected(el), ['a.pdf', 'c.png']);
        assert.deepStrictEqual(listed(el), ['a.pdf', 'c.png'], 'the rejected file must not be listed');

    });

    it('warns with the localized list of accepted extensions', async () => {
        const [el] = await mount(`<ful-input-file multiple accept=".pdf,.png">files</ful-input-file>`);

        pick(el, file('b.txt'));

        assert.strictEqual(warning(el), 'Only files of type .pdf, .png are supported');

    });

    it('matches accepted extensions ignoring case', async () => {
        const [el] = await mount(`<ful-input-file multiple accept=".PDF">files</ful-input-file>`);

        pick(el, file('a.pdf'));

        assert.deepStrictEqual(selected(el), ['a.pdf']);
        assert.isNull(warning(el));

    });

    it('accepts mime types, not only extensions', async () => {
        const [el] = await mount(`<ful-input-file multiple accept="image/png">files</ful-input-file>`);

        pick(el, file('a.png', 4, 'image/png'), file('b.txt', 4, 'text/plain'));

        assert.deepStrictEqual(selected(el), ['a.png']);
        assert.deepStrictEqual(listed(el), ['a.png']);

    });

    it('mixes extensions and mime types in one list, matching each its own way', async () => {
        const [el] = await mount(`<ful-input-file multiple accept=".pdf,image/png">files</ful-input-file>`);

        pick(el, file('a.pdf'), file('b.png', 4, 'image/png'), file('c.txt', 4, 'text/plain'));

        assert.deepStrictEqual(selected(el), ['a.pdf', 'b.png']);
        assert.strictEqual(warning(el), 'Only files of type .pdf, image/png are supported');

    });

    it('accepts a whole mime family through the wildcard', async () => {
        const [el] = await mount(`<ful-input-file multiple accept="image/*">files</ful-input-file>`);

        pick(el, file('a.png', 4, 'image/png'), file('b.jpg', 4, 'image/jpeg'), file('c.pdf'));

        assert.deepStrictEqual(selected(el), ['a.png', 'b.jpg']);
        assert.strictEqual(warning(el), 'Only files of type image/* are supported');

    });

    it('matches a mime type carrying parameters, ignoring them', async () => {
        const [el] = await mount(
            `<ful-input-file multiple accept="text/plain; charset=utf-8">files</ful-input-file>`,
        );

        pick(el, file('a.txt', 4, 'text/plain'));

        assert.deepStrictEqual(selected(el), ['a.txt']);
        assert.isNull(warning(el));

    });

    it('drops the files above maxfilesize and warns with the readable limit', async () => {
        const [el] = await mount(`<ful-input-file multiple maxfilesize="2048">files</ful-input-file>`);

        pick(el, file('small.txt', 2048), file('big.txt', 2049));

        assert.deepStrictEqual(selected(el), ['small.txt'], 'the limit is inclusive');
        assert.strictEqual(warning(el), 'Maximum supported file size is 2KiB');

    });

    it('clears the whole selection when the files together exceed maxtotalsize', async () => {
        const [el] = await mount(`<ful-input-file multiple maxtotalsize="100">files</ful-input-file>`);

        pick(el, file('a.txt', 50), file('b.txt', 50));
        assert.deepStrictEqual(selected(el), ['a.txt', 'b.txt'], 'the limit is inclusive');

        pick(el, file('a.txt', 50), file('b.txt', 51));

        assert.deepStrictEqual(selected(el), [], 'no file is kept: the caller must pick again');
        assert.deepStrictEqual(listed(el), []);
        assert.strictEqual(warning(el), 'Maximum supported total file size is 100B');

    });

    it('clears the whole selection when more files than maxfiles are picked', async () => {
        const [el] = await mount(`<ful-input-file multiple maxfiles="2">files</ful-input-file>`);

        pick(el, file('a.txt'), file('b.txt'));
        assert.deepStrictEqual(selected(el), ['a.txt', 'b.txt'], 'the limit is inclusive');

        pick(el, file('a.txt'), file('b.txt'), file('c.txt'));

        assert.deepStrictEqual(selected(el), []);
        assert.strictEqual(warning(el), 'Maximum of 2 files exceeded');

    });

    it('applies the constraints to dropped files too, not just to picked ones', async () => {
        const [el] = await mount(`<ful-input-file multiple accept=".pdf">files</ful-input-file>`);

        drop(el, file('a.pdf'), file('b.txt'));

        assert.deepStrictEqual(selected(el), ['a.pdf']);
        assert.strictEqual(warning(el), 'Only files of type .pdf are supported');

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
        assert.deepStrictEqual(listed(el), ['a.txt']);

    });
});

describe('InputFile warnings', () => {
    it('shows one warning per violated constraint, not just the last one', async () => {
        const [el] = await mount(
            `<ful-input-file multiple accept=".pdf" maxfilesize="10">files</ful-input-file>`,
        );

        pick(el, file('a.txt', 4), file('big.pdf', 20));

        assert.deepStrictEqual(warnings(el), [
            'Only files of type .pdf are supported',
            'Maximum supported file size is 10B',
        ]);

    });

    it('stops complaining as soon as the next selection is clean', async () => {
        const [el] = await mount(`<ful-input-file multiple accept=".pdf">files</ful-input-file>`);
        pick(el, file('a.txt'));
        assert.strictEqual(warning(el), 'Only files of type .pdf are supported');

        pick(el, file('b.pdf'));

        assert.deepStrictEqual(warnings(el), [], 'a fixed selection must not keep the stale complaint on screen');

    });
});

describe('InputFile programmatic selection', () => {
    it('enforces the constraints on a selection assigned programmatically', async () => {
        const [el] = await mount(`<ful-input-file multiple accept=".pdf">files</ful-input-file>`);

        el.files = transfer(file('a.pdf'), file('b.txt')).files;

        assert.deepStrictEqual(selected(el), ['a.pdf']);
        assert.deepStrictEqual(listed(el), ['a.pdf'], 'the item list must not go stale');
        assert.strictEqual(warning(el), 'Only files of type .pdf are supported');

    });

    it('refreshes the item list when a single file is assigned programmatically', async () => {
        const [el] = await mount(`<ful-input-file>files</ful-input-file>`);

        el.file = file('a.txt');

        assert.deepStrictEqual(listed(el), ['a.txt']);

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
        //the overlay is the real FileList, so a custom item reads whatever a File carries
        assert.deepStrictEqual(
            Array.from(el.querySelectorAll('ful-item [data-ref=kind]')).map((s) => s.textContent),
            ['text/plain', 'image/png'],
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
        assert.deepStrictEqual(listed(el), ['b.txt']);
    });

    it('falls back to the stock item when the slot is blank', async () => {
        const [el] = await mount(`<ful-input-file multiple>files<template slot="items">   </template></ful-input-file>`);

        el.files = transfer(file('a.txt')).files;

        assert.deepStrictEqual(listed(el), ['a.txt']);
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

    it('carries the dragover state while a drag hovers the dropzone', async () => {
        const [el] = await mount(`<ful-input-file>files</ful-input-file>`);
        const dropzone = el.querySelector('[data-ref=dropzone]');

        dropzone.dispatchEvent(new DragEvent('dragover', { cancelable: true }));
        assert.isTrue(el.hasAttribute('dragover'), 'the hover state is on');

        dropzone.dispatchEvent(new DragEvent('dragleave'));
        assert.isFalse(el.hasAttribute('dragover'), 'and it leaves with the drag');
    });
});

describe('InputFile warning dismissal', () => {
    it('removes a warning once its animation ends, without touching the selection', async () => {
        const [el] = await mount(`<ful-input-file multiple accept=".pdf">files</ful-input-file>`);
        pick(el, file('b.txt'));

        const warningEl = el.querySelector('ful-field-warning');
        assert.isNotNull(warningEl);

        warningEl.dispatchEvent(new AnimationEvent('animationend', { bubbles: true }));

        assert.isNull(el.querySelector('ful-field-warning'), 'the expired warning leaves the DOM');
        assert.deepStrictEqual(selected(el), [], 'the rejected pick is not resurrected by the dismissal');
    });
});

describe('InputFile stray clicks', () => {
    it('removes nothing when the click lands on the item, away from its button', async () => {
        const [el] = await mount(`<ful-input-file multiple>files</ful-input-file>`);
        pick(el, file('a.txt'), file('b.txt'));

        el.querySelector('ful-item div').dispatchEvent(new MouseEvent('click', { bubbles: true }));

        assert.deepStrictEqual(selected(el), ['a.txt', 'b.txt']);
    });

    it('removes nothing when a button outside any item is clicked', async () => {
        const [el] = await mount(`<ful-input-file multiple>files</ful-input-file>`);
        pick(el, file('a.txt'));
        const stray = document.createElement('button');
        stray.type = 'button';
        stray.innerText = 'clear all';
        el.querySelector('ful-item-list').appendChild(stray);

        stray.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        assert.deepStrictEqual(selected(el), ['a.txt']);
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
        it(`mirrors the ${claim} from markup`, async () => {
            const [el] = await mount(`<ful-input-file ${attribute}>files</ful-input-file>`);
            const input = el.querySelector('input[type=file]');
            if (claim === 'disabled') {
                assert.isTrue(input.matches(':disabled'), 'the inner control carries the claim');
            } else {
                assert.strictEqual(input.getAttribute('aria-readonly'), 'true', 'the chrome is frozen');
            }
        });
    }
    it('mirrors the disabled claim, live', async () => {
        const [el] = await mount(`<ful-input-file>files</ful-input-file>`);
        const input = el.querySelector('input[type=file]');

        el.setAttribute('disabled', '');
        assert.isTrue(el.matches(':disabled'));
        assert.isTrue(input.matches(':disabled'));
        el.removeAttribute('disabled');
        assert.isFalse(input.matches(':disabled'));
    });

    it('rejects a multi-file drop on a single-file field, as the native input does', async () => {
        const [single, singleContainer] = await mount(`<ful-input-file dropzone>files</ful-input-file>`);

        drop(single, file('a.pdf'), file('b.pdf'));
        assert.deepStrictEqual(selected(single), [], 'the whole drop is rejected');

        drop(single, file('one.pdf'));
        assert.deepStrictEqual(selected(single), ['one.pdf'], 'a single-file drop is accepted');
        singleContainer.remove();
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

        assert.deepStrictEqual(selected(el), ['real.pdf']);
    });
});
