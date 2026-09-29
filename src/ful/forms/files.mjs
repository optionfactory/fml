import { Fragments, Localization, Templates } from '../../ftl/index.mjs';
import { Input } from './input.mjs';

/**
 * A file input with an optional dropzone and item list, enforcing the type,
 * size and count limits it declares.
 *
 * The `dropzone` and `item-list` attributes show the dropzone and the list of
 * chosen files. A `dropzone` slot replaces the default dropzone's content, and
 * an `items` slot holding a template replaces the stock item, rendered with the
 * same `files` overlay so that it reads the File objects it lists. Clicking the
 * dropzone opens the picker, and the host carries a `dragover` attribute while
 * a drag hovers it. A drop selects the files it carries, ignoring entries that
 * are not files; a drop with no file, or with several on a field that is not
 * `multiple`, changes nothing.
 *
 * Every selection, picked, dropped or assigned, goes through the constraints
 * in order: `accept` and `max-file-size` drop the files they refuse,
 * `max-total-size` and `max-files` clear the whole selection. Each violation
 * shows a warning. The change event fires for a pick, a drop and a removal
 * through an item's button; the `files`, `file` and `value` setters are silent,
 * like a native input's.
 *
 * While disabled or readonly, the picker, the dropzone and the item removals
 * do nothing, and a drop still does not reach the browser's default handling.
 */
class InputFile extends Input {
    /**
     * Milliseconds a warning stays before the field removes it, whether or not
     * its css animation ran; read each time a warning is shown.
     * @type {number}
     */
    static WARNING_TIMEOUT = 5000;
    /**
     * Builds a FileList holding exactly these files, the form `files` takes.
     * @param {Iterable<File>} [files]
     * @returns {FileList}
     */
    static list(files = []) {
        const dt = new DataTransfer();
        for (const file of files) {
            dt.items.add(file);
        }
        return dt.files;
    }
    static observed = [
        'placeholder',
        'accept:csv',
        'multiple:presence',
        'item-list:presence',
        'dropzone:presence',
        'max-files:number',
        'max-file-size:number',
        'max-total-size:number',
        'value',
    ];
    #accept;
    #items;
    #dropzone;
    #warnings;
    #group;
    _type() {
        return 'file';
    }
    static template = `
        <label>{{{{ slots.default }}}}</label>
        {{{{ slots.info }}}}
        <ful-control-group>
            <ful-affix data-tpl-if="slots.before">{{{{ slots.before }}}}</ful-affix>
            <input data-tpl-type="type" placeholder=" " form="">
            <ful-affix data-tpl-if="slots.after">{{{{ slots.after }}}}</ful-affix>
        </ful-control-group>
        <div data-ref="dropzone" class="dropzone" data-tpl-if="slots.dropzone">
            {{{{ slots.dropzone }}}}
        </div>
        <div data-ref="dropzone" class="default-dropzone" data-tpl-if="!slots.dropzone">
            {{ #l10n:t('files.dropzone-label') }}
        </div>
        <ful-item-list></ful-item-list>
        <ful-field-warnings role="status" aria-live="polite"></ful-field-warnings>
        <ful-field-error></ful-field-error>
    `;
    static templates = {
        items: `
            <ful-item data-tpl-each="files" data-tpl-var="file" data-tpl-data-name="file.name">
                <div><span>{{ file.name }}</span><span>{{ #l10n:bytes(file.size) }}</span><button type="button" data-tpl-aria-label="#l10n:t('files.remove')"><ful-icon name="x-lg" aria-hidden="true"></ful-icon></button></div>
            </ful-item>
        `,
        warning: `<ful-field-warning>{{ #l10n:t(key, args) }}</ful-field-warning>`,
    };
    #itemstemplate;
    _build(conf) {
        const pieces = super._build(conf);
        const fragment = pieces.fragment;
        this.#items = fragment.querySelector('ful-item-list');
        this.#itemstemplate =
            conf.slots?.items && !Fragments.isBlank(conf.slots.items) ? Templates.fromFragment(conf.slots.items) : null;
        this.#dropzone = fragment.querySelector('[data-ref=dropzone]');
        this.#warnings = fragment.querySelector('ful-field-warnings');
        this.#group = fragment.querySelector('ful-control-group');
        this.#warnings.addEventListener('animationend', (e) => {
            e.target.remove();
        });
        this.#items.addEventListener('click', (e) => {
            if (!e.target.closest('button')) {
                return;
            }
            if (!this._interactive()) {
                return;
            }
            const idx = [...this.#items.children].indexOf(e.target.closest('ful-item'));
            if (idx === -1) {
                return;
            }
            this.files = InputFile.list([...this.files].filter((f, i) => i !== idx));
            this._notifyChange();
        });
        this.#dropzone.addEventListener('click', (e) => {
            if (!this._interactive()) {
                return;
            }
            this._input.click();
        });

        this.#dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.toggleAttribute('dragover', true);
        });
        this.#dropzone.addEventListener('dragleave', () => {
            this.toggleAttribute('dragover', false);
        });
        this.#dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.toggleAttribute('dragover', false);
            if (!this._interactive()) {
                return;
            }
            const dropped = [...e.dataTransfer.items].filter((i) => i.kind === 'file');
            const files = dropped.map((i) => i.getAsFile()).filter((f) => f !== null);
            if (files.length === 0 || (files.length > 1 && !this.multiple)) {
                return;
            }
            this.files = InputFile.list(files);
            this._notifyChange();
        });
        this._input.addEventListener('change', (e) => {
            this.#update();
        });
        return { ...pieces, freeze: this.#group };
    }
    #update() {
        this.setCustomValidity();
        this.#warnings.replaceChildren();
        this.#ensureAcceptable();
        this.#ensureFileSizes();
        this.#ensureTotalSize();
        this.#ensureFilesCount();
        (this.#itemstemplate ?? this.template('items')).withOverlay({ files: this.files }).renderTo(this.#items);
    }
    /**
     * Shows a warning in the field's polite live region: the localized message
     * for an l10n key and its arguments. It is removed when its animation ends,
     * or after `WARNING_TIMEOUT` milliseconds at the latest. The warnings are
     * cleared whenever the selection changes.
     * @param {string} key
     * @param {Record<string, any>} [args]
     */
    warning(key, args) {
        this.template('warning').withOverlay({ key, args }).appendTo(this.#warnings);
        const warning = /** @type HTMLElement */ (this.#warnings.lastElementChild);
        setTimeout(() => warning.remove(), InputFile.WARNING_TIMEOUT);
    }
    #acceptable(file) {
        const name = file.name.toLowerCase();
        return this.#accept.some((token) => {
            const t = token.toLowerCase().split(';')[0].trim();
            if (t.startsWith('.')) {
                return name.endsWith(t);
            }
            if (t.endsWith('/*')) {
                return file.type.startsWith(`${t.slice(0, -1)}`);
            }
            return t.includes('/') && file.type === t;
        });
    }
    #ensureAcceptable() {
        if (!this.#accept.length) {
            return;
        }
        const unacceptable = [...this.files].filter((file) => !this.#acceptable(file));

        if (unacceptable.length === 0) {
            return;
        }
        this.warning('files.unacceptable-file-type', { types: this.#accept.join(', ') });
        this._input.files = InputFile.list([...this.files].filter((f) => !unacceptable.includes(f)));
    }
    #ensureFilesCount() {
        if (this.#maxFiles === null) {
            return;
        }
        if (this.files.length <= this.#maxFiles) {
            return;
        }
        this.warning('files.max-files-exceeded', { count: this.#maxFiles });
        this._input.files = InputFile.list();
    }

    #ensureFileSizes() {
        if (this.#maxFileSize === null) {
            return;
        }
        const oversized = [...this.files].filter((file) => file.size > this.#maxFileSize);
        if (oversized.length === 0) {
            return;
        }
        this.warning('files.max-file-size-exceeded', { size: Localization.of().bytes(this.#maxFileSize) });
        this._input.files = InputFile.list([...this.files].filter((f) => !oversized.includes(f)));
    }
    #ensureTotalSize() {
        if (this.#maxTotalSize === null) {
            return;
        }
        const totalSize = [...this.files].reduce((acc, file) => acc + file.size, 0);
        if (totalSize <= this.#maxTotalSize) {
            return;
        }
        this.warning('files.max-total-size-exceeded', { size: Localization.of().bytes(this.#maxTotalSize) });
        this._input.files = InputFile.list();
    }

    /**
     * The accepted types, also set on the native input for its picker. A token
     * is a dot-prefixed extension matched against the end of the file name, a
     * mime type matched against the file's type with any parameters ignored, or
     * a family such as `image/*`; case is ignored, and any other token matches
     * nothing. A file matching no token is dropped with a warning; an empty list
     * accepts every file. Enforced from the next selection on.
     * @returns {string[]}
     */
    get accept() {
        return this.#accept;
    }
    /** @param {string[]} vs */
    set accept(vs) {
        this._input.accept = vs.join(',');
        this.#accept = vs;
        this.reflectTo('accept', vs);
    }
    /**
     * Whether the field takes several files; a single-file field ignores a drop of several.
     * @returns {boolean}
     */
    get multiple() {
        return this._input.multiple;
    }
    /** @param {boolean} v */
    set multiple(v) {
        this._input.multiple = v;
        this.reflectTo('multiple', v);
    }
    /**
     * The selected files, after the constraints.
     * @returns {FileList}
     */
    get files() {
        return this._input.files;
    }
    /**
     * Replaces the selection and runs the constraints over it, refreshing the
     * warnings and the item list, without firing change.
     * @param {FileList} vs
     */
    set files(vs) {
        this._input.files = vs;
        this.#update();
    }
    /**
     * The first selected file.
     * @returns {File|null}
     */
    get file() {
        return this.files[0] ?? null;
    }
    /**
     * Replaces the selection with this one file, or empties it, as `files` does.
     * @param {File|null|undefined} v
     */
    set file(v) {
        this.files = InputFile.list(v ? [v] : []);
    }
    /**
     * The names of the selected files: an array when `multiple`, otherwise the
     * one name or null.
     * @returns {string[]|string|null}
     */
    get value() {
        const names = Array.from(this._input.files).map((f) => f.name);
        return this.multiple ? names : (names[0] ?? null);
    }
    /**
     * Empties the selection for a falsy value and ignores any other, since a
     * file name cannot select a file.
     * @param {any} v
     */
    set value(v) {
        if (v) {
            return;
        }
        this.files = InputFile.list();
    }
    /** Empties the selection, as a native file input's reset does, whatever the `value` attribute says. */
    formResetCallback() {
        this.value = null;
    }
    /**
     * The size of the selected files together, in bytes.
     * @returns {number}
     */
    get totalsize() {
        return Array.from(this.files).reduce((a, f) => a + f.size, 0);
    }
    #maxFiles;
    /**
     * The most files a selection may hold; a larger selection is cleared
     * entirely with a warning. Enforced from the next selection on.
     * @returns {number|null} null for no limit
     */
    get maxFiles() {
        return this.#maxFiles;
    }
    /** @param {number|null} v */
    set maxFiles(v) {
        this.#maxFiles = v;
        this.reflectTo('max-files', v);
    }
    #maxFileSize;
    /**
     * The largest size one file may have, in bytes; a larger file is dropped
     * from the selection with a warning. Enforced from the next selection on.
     * @returns {number|null} null for no limit
     */
    get maxFileSize() {
        return this.#maxFileSize;
    }
    /** @param {number|null} v */
    set maxFileSize(v) {
        this.#maxFileSize = v;
        this.reflectTo('max-file-size', v);
    }
    #maxTotalSize;
    /**
     * The largest size the selected files may have together, in bytes; a
     * larger selection is cleared entirely with a warning. Enforced from the
     * next selection on.
     * @returns {number|null} null for no limit
     */
    get maxTotalSize() {
        return this.#maxTotalSize;
    }
    /** @param {number|null} v */
    set maxTotalSize(v) {
        this.#maxTotalSize = v;
        this.reflectTo('max-total-size', v);
    }
    #useItemList;
    /**
     * Whether the chosen files are listed, each with a button removing it; the
     * stylesheet shows the list from the reflected `item-list` attribute.
     * @returns {boolean}
     */
    get itemList() {
        return this.#useItemList;
    }
    /** @param {boolean} v */
    set itemList(v) {
        this.#useItemList = v;
        this.reflectTo('item-list', v);
    }
    #useDropzone;
    /**
     * Whether the dropzone is shown; the stylesheet shows it from the reflected
     * `dropzone` attribute.
     * @returns {boolean}
     */
    get dropzone() {
        return this.#useDropzone;
    }
    /** @param {boolean} v */
    set dropzone(v) {

        this.#useDropzone = v;
        this.reflectTo('dropzone', v);
    }
}

export { InputFile };
