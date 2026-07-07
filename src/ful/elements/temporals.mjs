import { ParsedElement } from '../../ftl/index.mjs';
import { Input } from './input.mjs';

class LocalDate extends ParsedElement {
    render() {
        const content = this.innerHTML.trim();
        if (content === '') {
            this.innerHTML = this.getAttribute('default') ?? '';
            return;
        }
        const locale = this.getAttribute('locale') ?? Intl.DateTimeFormat().resolvedOptions().locale;
        const formatter = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'numeric', day: 'numeric' });
        const [y, m, d] = content.split('-').map(Number);
        this.innerHTML = formatter.format(new Date(y, m - 1, d));
    }
}

class Instant extends ParsedElement {
    render() {
        const content = this.innerHTML.trim();
        if (content === '') {
            this.innerHTML = this.getAttribute('default') ?? '';
            return;
        }
        const locale = this.getAttribute('locale') ?? Intl.DateTimeFormat().resolvedOptions().locale;
        const format = new Intl.DateTimeFormat(locale, {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: false,
        });
        this.innerHTML = format.format(new Date(Instant.isoToLocal(content)));
    }
    static isoToLocal(iso) {
        //this is so sad
        const d = new Date(iso);
        const pad = (n, v) => String(v).padStart(n, '0');
        const date = `${d.getFullYear()}-${pad(2, d.getMonth() + 1)}-${pad(2, d.getDate())}`;
        const time = `${pad(2, d.getHours())}:${pad(2, d.getMinutes())}:${pad(2, d.getSeconds())}.${pad(3, d.getMilliseconds())}`;
        return `${date}T${time}`;
    }
}

class InputLocalDate extends Input {
    static observed = ['value', 'readonly:presence', 'required:presence', 'min', 'max', 'step'];
    _type() {
        return 'date';
    }
    render(conf) {
        const { observed } = conf;
        super.render(conf);
        this.min = observed.min;
        this.max = observed.max;
        this.step = observed.step;
    }
    get min() {
        const v = this._input.min;
        return v === '' ? null : v;
    }
    set min(v) {
        this._input.min = InputLocalDate.#fromIsoOrOffset(v);
    }
    get max() {
        const v = this._input.max;
        return v === '' ? null : v;
    }
    set max(v) {
        this._input.max = InputLocalDate.#fromIsoOrOffset(v);
    }
    get step() {
        const v = this._input.step;
        return v === '' ? null : v;
    }
    set step(v) {
        this._input.step = v ?? '';
    }
    static #fromIsoOrOffset(v) {
        if (!v) {
            return '';
        }
        //this could be date.toLocaleDateString('en-CA')
        const formatLocalDate = (date) =>
            new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split('T')[0];
        if (v === 'now') {
            return formatLocalDate(new Date());
        }
        const re = /^([+-])(\d+)([dmy])$/;
        const match = re.exec(v);
        if (!match) {
            return v;
        }
        const sign = match[1] === '-' ? -1 : 1;
        const offset = +match[2];
        const r = new Date();
        r.setHours(0, 0, 0, 0);
        switch (match[3]) {
            case 'd':
                r.setDate(r.getDate() + offset * sign);
                break;
            case 'm':
                const originalDay = r.getDate();
                r.setMonth(r.getMonth() + offset * sign);
                if (r.getDate() !== originalDay) {
                    r.setDate(0);
                }
                break;
            case 'y':
                r.setFullYear(r.getFullYear() + offset * sign);
                break;
        }
        return formatLocalDate(r);
    }
}

class InputLocalTime extends InputLocalDate {
    _type() {
        return 'time';
    }
}

class InputInstant extends Input {
    static observed = ['value', 'readonly:presence', 'required:presence', 'min', 'max', 'step'];
    _type() {
        return 'datetime-local';
    }
    render(conf) {
        const { observed } = conf;
        super.render(conf);
        this.min = observed.min;
        this.max = observed.max;
        this.step = observed.step;
    }
    get value() {
        const v = this._input.value;
        return v === '' ? null : new Date(v).toISOString();
    }
    set value(v) {
        this._input.value = v ? Instant.isoToLocal(v) : '';
    }
    get min() {
        const v = this._input.min;
        return v === '' ? null : new Date(v).toISOString();
    }
    set min(v) {
        this._input.min = v ? Instant.isoToLocal(v) : '';
    }
    get max() {
        const v = this._input.max;
        return v === '' ? null : new Date(v).toISOString();
    }
    set max(v) {
        this._input.max = v ? Instant.isoToLocal(v) : '';
    }
    get step() {
        const v = this._input.step;
        return v === '' ? null : v;
    }
    set step(v) {
        this._input.step = v ?? '';
    }
}

export { Instant, LocalDate, InputLocalDate, InputLocalTime, InputInstant };
