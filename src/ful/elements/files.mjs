import { Attributes } from '../../ftl/index.mjs';
import { Input } from './input.mjs';

class InputFile extends Input {
    static l10n = {
        en: {
            dropzonelabel: 'Click or drop your files here',
            unaccepptablefiletype: 'Only files of type {0} are supported',
            maxfilesizeexceeded: 'Maximum supported file size is {0}',
            maxtotalsizeexceeded: 'Maximum supported total file size is {0}',
            maxfilesexceeded: 'Maximum files count exceeded',
        },
        it: {
            dropzonelabel: 'Clicca o trascina i file qui',
            unaccepptablefiletype: 'Solo i file di tipo {0} sono supportati',
            maxfilesizeexceeded: 'La dimensione massima di un file è di {0}',
            maxtotalsizeexceeded: 'La dimensione massima complessiva dei file è di {0}',
            maxfilesexceeded: 'Numero massimo di file superato',
        },
        es: {
            dropzonelabel: 'Haz clic o arrastra tus archivos aquí',
            unaccepptablefiletype: 'Solo se admiten archivos de tipo {0}',
            maxfilesizeexceeded: 'El tamaño máximo de archivo admitido es {0}',
            maxtotalsizeexceeded: 'El tamaño total máximo admitido es {0}',
            maxfilesexceeded: 'Se ha superado el número máximo de archivos',
        },
        fr: {
            dropzonelabel: 'Cliquez ou déposez vos fichiers ici',
            unaccepptablefiletype: 'Seuls les fichiers de type {0} sont pris en charge',
            maxfilesizeexceeded: 'La taille maximale de fichier prise en charge est {0}',
            maxtotalsizeexceeded: 'La taille totale maximale prise en charge est {0}',
            maxfilesexceeded: 'Nombre maximal de fichiers dépassé',
        },
    };
    static observed = [
        'value',
        'readonly:presence',
        'required:presence',
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
    _type() {
        return 'file';
    }
    static template = `
        <div class="form-label">
            <label>{{{{ slots.default }}}}</label>
            {{{{ slots.info }}}}
        </div>
        <div class="input-group">
            <span data-tpl-if="slots.ibefore" class="input-group-text">{{{{ slots.ibefore }}}}</span>
            {{{{ slots.before }}}}
            <input class="form-control" data-tpl-type="type" placeholder=" " form="">
            {{{{ slots.after }}}}
            <span data-tpl-if="slots.iafter" class="input-group-text">{{{{ slots.iafter }}}}</span>
        </div>
        <div data-ref="dropzone" class="dropzone" data-tpl-if="slots.dropzone">
            {{{{ slots.dropzone }}}}
        </div>
        <div data-ref="dropzone" class="default-dropzone" data-tpl-if="!slots.dropzone">
            {{ #l10n:t('dropzonelabel') }}
        </div>
        <ful-item-list></ful-item-list>
        <ful-field-warnings></ful-field-warnings>
        <ful-field-error></ful-field-error>
    `;
    static templates = {
        items: `
            <ful-item data-tpl-each="files" data-tpl-var="file" data-tpl-data-name="file.name">
                <div>{{ file.name }}</div>
                <div>{{ #bytes:format(file.size) }}</div>
                <button type="button" class="btn btn-sm btn-outline-danger bi bi-x-lg" alt="Rimuovi"></button>
            </ful-item>
        `,
        warning: `<ful-field-warning>{{ #l10n:t(key, args) }}</ful-field-warning>`,
    };
    render(conf) {
        const { observed } = conf;
        super.render(conf);
        this.#items = this.querySelector('ful-item-list');
        this.#dropzone = this.querySelector('[data-ref=dropzone]');
        this.#warnings = this.querySelector('ful-field-warnings');
        this.accept = observed.accept;
        this.multiple = observed.multiple;
        this.itemlist = observed.itemlist;
        this.dropzone = observed.dropzone;
        this.maxfiles = observed.maxfiles;
        this.maxfilesize = observed.maxfilesize;
        this.maxtotalsize = observed.maxtotalsize;
        this.#warnings.addEventListener('animationend', (e) => {
            e.target.remove();
        });
        this.#items.addEventListener('click', (e) => {
            if (!e.target.closest('button')) {
                return;
            }
            const fileName = e.target.closest('ful-item').dataset.name;
            const dt = new DataTransfer();
            [...this.files].filter((f) => f.name !== fileName).forEach((f) => dt.items.add(f));
            this.files = dt.files;
            this.#update();
        });
        this.#dropzone.addEventListener('click', (e) => {
            this.querySelector('input')?.click();
        });

        this.#dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        this.#dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            const dt = new DataTransfer();
            [...e.dataTransfer.items].filter((i) => i.kind === 'file').forEach((i) => dt.items.add(i.getAsFile()));
            this.files = dt.files;
            this.#update();
        });
        this._input.addEventListener('change', (e) => {
            this.#update();
        });
    }
    #formatByteSize(v) {
        return v > 1024 * 1024
            ? `${Math.round((v / 1024 / 1024) * 100) / 100}MiB`
            : v > 1024
              ? `${Math.round((v / 1024) * 100) / 100}KiB`
              : `${v}B`;
    }
    #update() {
        this.setCustomValidity();
        this.#ensureAcceptable();
        this.#ensureFileSizes();
        this.#ensureTotalSize();
        this.#ensureFilesCount();
        this.template('items')
            .withOverlay({ files: this.files })
            .withModule('bytes', { format: this.#formatByteSize })
            .renderTo(this.#items);
    }
    warning(key, args) {
        this.template('warning').withOverlay({ key, args }).renderTo(this.#warnings);
    }
    #ensureAcceptable() {
        if (!this.#accept.length) {
            return;
        }
        const unacceptable = [...this.files].filter(
            (file) => !this.#accept.some((type) => file.name.toLowerCase().endsWith(type.toLowerCase())),
        );

        if (unacceptable.length === 0) {
            return;
        }
        this.warning('unaccepptablefiletype', this.#accept.join(', '));
        const dt = new DataTransfer();
        [...this.files].filter((f) => !unacceptable.includes(f)).forEach((f) => dt.items.add(f));
        this.files = dt.files;
    }
    #ensureFilesCount() {
        if (this.#maxfiles === null) {
            return;
        }
        if (this.files.length <= this.#maxfiles) {
            return;
        }
        this.warning('maxfilesexceeded');
        const dt = new DataTransfer();
        this.files = dt.files;
    }

    #ensureFileSizes() {
        if (this.#maxfilesize === null) {
            return;
        }
        const oversized = [...this.files].filter((file) => file.size > this.#maxfilesize);
        if (oversized.length === 0) {
            return;
        }
        this.warning('maxfilesizeexceeded', this.#formatByteSize(this.#maxfilesize));
        const dt = new DataTransfer();
        [...this.files].filter((f) => !oversized.includes(f)).forEach((f) => dt.items.add(f));
        this.files = dt.files;
    }
    #ensureTotalSize() {
        if (this.#maxtotalsize === null) {
            return;
        }
        const totalSize = [...this.files].reduce((acc, file) => acc + file.size, 0);
        if (totalSize <= this.#maxtotalsize) {
            return;
        }
        this.warning('maxtotalsizeexceeded', this.#formatByteSize(this.#maxtotalsize));
        this.files = new DataTransfer().files;
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
            Attributes.toggle(this, 'multiple', v);
        });
    }
    get files() {
        return this._input.files;
    }
    set files(vs) {
        this._input.files = vs;
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
        this.#update();
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
            Attributes.toggle(this, 'itemlist', v);
        });
    }
    #useDropzone;
    get dropzone() {
        return this.#useDropzone;
    }
    set dropzone(v) {
        this.#useDropzone = v;
        this.reflect(() => {
            Attributes.toggle(this, 'dropzone', v);
        });
    }
}

export { InputFile };
