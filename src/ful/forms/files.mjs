import { Fragments, Localization, Templates } from '../../ftl/index.mjs';
import { Input } from './input.mjs';

/** A file input with an optional dropzone and item list, enforcing the size and count limits it declares. */
class InputFile extends Input {
    /** how long a warning stands before the field retires it, matching the css fade */
    static WARNING_TIMEOUT = 5000;
    /**
     * A FileList holding exactly these files. The platform gives no way to
     * build one but through a DataTransfer, and every place that narrows a
     * selection rebuilt it by hand: five loops and three empty ones.
     * @param {Iterable<File>} [files]
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
        'itemlist:presence',
        'dropzone:presence',
        'maxfiles:number',
        'maxfilesize:number',
        'maxtotalsize:number',
        //re-declared so it lands after the constraints: assigning a value
        //validates the selection against them
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
            {{ #l10n:t('files.dropzonelabel') }}
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
        //a slotted template replaces the stock item, the way a select's does: the
        //overlay is the same, so a custom item still reads the File it renders
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
            //the removal is the user's own gesture: it reports through change as the
            //picker's selection does, while the files setter stays silent like a native one
            this._notifyChange();
        });
        this.#dropzone.addEventListener('click', (e) => {
            if (!this._interactive()) {
                return;
            }
            this.querySelector('input')?.click();
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
            //the drop's default stays suppressed whatever the claims say: a
            //disabled field must not turn into a navigation target
            if (!this._interactive()) {
                return;
            }
            const dropped = [...e.dataTransfer.items].filter((i) => i.kind === 'file');
            const files = dropped.map((i) => i.getAsFile()).filter((f) => f !== null);
            if (files.length === 0 || (files.length > 1 && !this.multiple)) {
                return;
            }
            this.files = InputFile.list(files);
            //a drop is the user's own gesture too: a native file input receiving
            //one fires change on its own
            this._notifyChange();
        });
        this._input.addEventListener('change', (e) => {
            this.#update();
        });
        //a file input has no native freeze: readOnly does nothing to it, so the
        //control group is the frozen piece and the base's refusal of the click is
        //what keeps the picker shut. The dropzone and the item removals are
        //guarded on their own handlers
        return { ...pieces, freeze: this.#group };
    }
    /**
     * Re-reads the selection: the constraints run in order over what is there,
     * each dropping what it refuses, and the warnings and the item list are
     * rendered from what survives. Every path that changes the files ends here.
     */
    #update() {
        this.setCustomValidity();
        this.#warnings.replaceChildren();
        this.#ensureAcceptable();
        this.#ensureFileSizes();
        this.#ensureTotalSize();
        this.#ensureFilesCount();
        (this.#itemstemplate ?? this.template('items')).withOverlay({ files: this.files }).renderTo(this.#items);
    }
    warning(key, args) {
        this.template('warning').withOverlay({ key, args }).appendTo(this.#warnings);
        //the field retires its own warnings: the css fade is decoration, and a
        //theme that drops the keyframe, or a host stylesheet disabling animations,
        //used to leave them on screen until the next selection
        const warning = /** @type HTMLElement */ (this.#warnings.lastElementChild);
        setTimeout(() => warning.remove(), InputFile.WARNING_TIMEOUT);
    }
    /**
     * The native accept vocabulary: a dot-prefixed extension matches the file
     * name's suffix, a mime type (parameters stripped) matches the file's type,
     * and image/*, audio/*, video/* match their whole family. Anything else
     * matches nothing, as the native attribute ignores it.
     */
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
        this.warning('files.unacceptablefiletype', { types: this.#accept.join(', ') });
        this._input.files = InputFile.list([...this.files].filter((f) => !unacceptable.includes(f)));
    }
    #ensureFilesCount() {
        if (this.#maxfiles === null) {
            return;
        }
        if (this.files.length <= this.#maxfiles) {
            return;
        }
        this.warning('files.maxfilesexceeded', { count: this.#maxfiles });
        this._input.files = InputFile.list();
    }

    #ensureFileSizes() {
        if (this.#maxfilesize === null) {
            return;
        }
        const oversized = [...this.files].filter((file) => file.size > this.#maxfilesize);
        if (oversized.length === 0) {
            return;
        }
        this.warning('files.maxfilesizeexceeded', { size: Localization.of().bytes(this.#maxfilesize) });
        this._input.files = InputFile.list([...this.files].filter((f) => !oversized.includes(f)));
    }
    #ensureTotalSize() {
        if (this.#maxtotalsize === null) {
            return;
        }
        const totalSize = [...this.files].reduce((acc, file) => acc + file.size, 0);
        if (totalSize <= this.#maxtotalsize) {
            return;
        }
        this.warning('files.maxtotalsizeexceeded', { size: Localization.of().bytes(this.#maxtotalsize) });
        this._input.files = InputFile.list();
    }

    get accept() {
        return this.#accept;
    }
    set accept(vs) {
        this._input.accept = vs.join(',');
        this.#accept = vs;
        this.reflectTo('accept', vs);
    }
    get multiple() {
        return this._input.multiple;
    }
    set multiple(v) {
        this._input.multiple = v;
        this.reflectTo('multiple', v);
    }
    get files() {
        return this._input.files;
    }
    set files(vs) {
        this._input.files = vs;
        this.#update();
    }
    get file() {
        return this.files[0] ?? null;
    }
    set file(v) {
        this.files = InputFile.list(v ? [v] : []);
    }
    get value() {
        const names = Array.from(this._input.files).map((f) => f.name);
        return this.multiple ? names : (names[0] ?? null);
    }
    set value(v) {
        if (v) {
            return;
        }
        this.files = InputFile.list();
    }
    formResetCallback() {
        //a file selection's default is empty, as the platform's own reset: a
        //declared filename cannot be restored programmatically
        this.value = null;
    }
    get totalsize() {
        return Array.from(this.files).reduce((a, f) => a + f.size, 0);
    }
    #maxfiles;
    get maxfiles() {
        return this.#maxfiles;
    }
    set maxfiles(v) {
        this.#maxfiles = v;
        this.reflectTo('maxfiles', v);
    }
    #maxfilesize;
    get maxfilesize() {
        return this.#maxfilesize;
    }
    set maxfilesize(v) {
        this.#maxfilesize = v;
        this.reflectTo('maxfilesize', v);
    }
    #maxtotalsize;
    get maxtotalsize() {
        return this.#maxtotalsize;
    }
    set maxtotalsize(v) {
        this.#maxtotalsize = v;
        this.reflectTo('maxtotalsize', v);
    }
    #useItemlist;
    get itemlist() {
        return this.#useItemlist;
    }
    set itemlist(v) {
        this.#useItemlist = v;
        this.reflectTo('itemlist', v);
    }
    #useDropzone;
    get dropzone() {
        return this.#useDropzone;
    }
    set dropzone(v) {
        this.#useDropzone = v;
        this.reflectTo('dropzone', v);
    }
}

export { InputFile };
