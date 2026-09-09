import { Attributes, Localization } from '../../ftl/index.mjs';
import { Input } from './input.mjs';

/** A file input with an optional dropzone and item list, enforcing the size and count limits it declares. */
class InputFile extends Input {
    static observed = [
        'placeholder',
        'accept:csv',
        'multiple:presence',
        'itemlist:presence',
        'dropzone:presence',
        'maxfiles:number',
        'maxfilesize:number',
        'maxtotalsize:number',
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
        <ful-field-warnings></ful-field-warnings>
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
    render(conf) {
        const { observed } = conf;
        super.render({ ...conf, skipObservedSetup: true });
        this.#items = this.querySelector('ful-item-list');
        this.#dropzone = this.querySelector('[data-ref=dropzone]');
        this.#warnings = this.querySelector('ful-field-warnings');
        this.#group = this.querySelector('ful-control-group');
        this.accept = observed.accept;
        this.multiple = observed.multiple;
        this.itemlist = observed.itemlist;
        this.dropzone = observed.dropzone;
        this.maxfiles = observed.maxfiles;
        this.maxfilesize = observed.maxfilesize;
        this.maxtotalsize = observed.maxtotalsize;

        this.disabled = conf.observed.disabled;
        this.readonly = observed.readonly;
        this.required = observed.required;
        this.placeholder = observed.placeholder;
        this.value = observed.value;
        this.#warnings.addEventListener('animationend', (e) => {
            e.target.remove();
        });
        this.#items.addEventListener('click', (e) => {
            if (!e.target.closest('button')) {
                return;
            }
            //items and other chrome are not form controls, the guard must ask the
            //effective state
            if (this.matches(':disabled') || this.readonly) {
                return;
            }
            const idx = [...this.#items.children].indexOf(e.target.closest('ful-item'));
            if (idx === -1) {
                return;
            }
            const dt = new DataTransfer();
            [...this.files]
                .filter((f, i) => i !== idx)
                .forEach((f) => {
                    dt.items.add(f);
                });
            this.files = dt.files;
            //the removal is the user's own gesture: it reports through change as the
            //picker's selection does, while the files setter stays silent like a native one
            this.#changed();
        });
        this.#dropzone.addEventListener('click', (e) => {
            //the dropzone is not a form control, the guard must ask the effective state
            if (this.matches(':disabled') || this.readonly) {
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
            //the drop's default stays suppressed even when inert: a disabled field
            //must not turn into a navigation target
            if (this.matches(':disabled') || this.readonly) {
                return;
            }
            const dropped = [...e.dataTransfer.items].filter((i) => i.kind === 'file');
            const files = dropped.map((i) => i.getAsFile()).filter((f) => f !== null);
            if (files.length === 0 || (files.length > 1 && !this.multiple)) {
                return;
            }
            const dt = new DataTransfer();
            files.forEach((f) => {
                dt.items.add(f);
            });
            this.files = dt.files;
            //a drop is the user's own gesture too: a native file input receiving
            //one fires change on its own
            this.#changed();
        });
        this._input.addEventListener('change', (e) => {
            this.#update();
        });
    }
    #changed() {
        this.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                cancelable: false,
                detail: {
                    value: this.value,
                },
            }),
        );
    }
    /**
     * A file input has no native freeze: readOnly does nothing to it, so the
     * control group goes inert, the only way to keep the picker shut. The
     * dropzone and the item removals are guarded on their own handlers.
     */
    get readonly() {
        return this.#group.inert;
    }
    set readonly(v) {
        this.#group.inert = v;
        this.reflect(() => {
            this.toggleAttribute('readonly', v);
        });
    }
    #update() {
        this.setCustomValidity();
        this.#warnings.replaceChildren();
        this.#ensureAcceptable();
        this.#ensureFileSizes();
        this.#ensureTotalSize();
        this.#ensureFilesCount();
        this.template('items').withOverlay({ files: this.files }).renderTo(this.#items);
    }
    warning(key, args) {
        this.template('warning').withOverlay({ key, args }).appendTo(this.#warnings);
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
        const dt = new DataTransfer();
        [...this.files]
            .filter((f) => !unacceptable.includes(f))
            .forEach((f) => {
                dt.items.add(f);
            });
        this._input.files = dt.files;
    }
    #ensureFilesCount() {
        if (this.#maxfiles === null) {
            return;
        }
        if (this.files.length <= this.#maxfiles) {
            return;
        }
        this.warning('files.maxfilesexceeded', { count: this.#maxfiles });
        this._input.files = new DataTransfer().files;
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
        const dt = new DataTransfer();
        [...this.files]
            .filter((f) => !oversized.includes(f))
            .forEach((f) => {
                dt.items.add(f);
            });
        this._input.files = dt.files;
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
        this._input.files = new DataTransfer().files;
    }

    get accept() {
        return this.#accept;
    }
    set accept(vs) {
        this._input.accept = vs.join(',');
        this.#accept = vs;
        this.reflect(() => {
            this.setAttribute('accept', this._input.accept);
        });
    }
    get multiple() {
        return this._input.multiple;
    }
    set multiple(v) {
        this._input.multiple = v;
        this.reflect(() => {
            this.toggleAttribute('multiple', v);
        });
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
        const dt = new DataTransfer();
        if (v) {
            dt.items.add(v);
        }
        this.files = dt.files;
    }
    get value() {
        const names = Array.from(this._input.files).map((f) => f.name);
        return this.multiple ? names : (names[0] ?? null);
    }
    set value(v) {
        if (v) {
            return;
        }
        this.files = new DataTransfer().files;
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
        this.reflect(() => {
            Attributes.set(this, 'maxfiles', v);
        });
    }
    #maxfilesize;
    get maxfilesize() {
        return this.#maxfilesize;
    }
    set maxfilesize(v) {
        this.#maxfilesize = v;
        this.reflect(() => {
            Attributes.set(this, 'maxfilesize', v);
        });
    }
    #maxtotalsize;
    get maxtotalsize() {
        return this.#maxtotalsize;
    }
    set maxtotalsize(v) {
        this.#maxtotalsize = v;
        this.reflect(() => {
            Attributes.set(this, 'maxtotalsize', v);
        });
    }
    #useItemlist;
    get itemlist() {
        return this.#useItemlist;
    }
    set itemlist(v) {
        this.#useItemlist = v;
        this.reflect(() => {
            this.toggleAttribute('itemlist', v);
        });
    }
    #useDropzone;
    get dropzone() {
        return this.#useDropzone;
    }
    set dropzone(v) {
        this.#useDropzone = v;
        this.reflect(() => {
            this.toggleAttribute('dropzone', v);
        });
    }
}

export { InputFile };
