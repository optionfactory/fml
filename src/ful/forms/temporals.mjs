import { ParsedElement, Localization } from '../../ftl/index.mjs';
import { Input } from './input.mjs';

/** Formats the yyyy-mm-dd date in its content in the page's locale, or the one its locale attribute names. */
class LocalDate extends ParsedElement {
    render() {
        const content = this.textContent.trim();
        const [y, m, d] = content.split('-').map(Number);
        const parsed = content === '' ? null : new Date(y, m - 1, d);
        //content that does not name a date renders like none: formatting an
        //invalid date would throw and fail the upgrade over a template hole
        if (parsed === null || Number.isNaN(parsed.getTime())) {
            this.replaceChildren(this.getAttribute('default') ?? '');
            return;
        }
        //the attribute wins, then the page's locale, then the platform default
        const { date } = Localization.of({ locale: this.getAttribute('locale') ?? undefined });
        this.replaceChildren(date(parsed, { year: 'numeric', month: 'numeric', day: 'numeric' }));
    }
}

/** Formats the ISO instant in its content in the page's locale and timezone. */
class Instant extends ParsedElement {
    render() {
        const content = this.textContent.trim();
        const parsed = content === '' ? null : new Date(Instant.isoToLocal(content));
        //content that does not name an instant renders like none, as ful-local-date
        if (parsed === null || Number.isNaN(parsed.getTime())) {
            this.replaceChildren(this.getAttribute('default') ?? '');
            return;
        }
        const { date } = Localization.of({ locale: this.getAttribute('locale') ?? undefined });
        this.replaceChildren(
            date(parsed, {
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric',
                hour12: false,
            }),
        );
    }
    //a date-only value names a calendar day, not a utc midnight: it is read in
    //the page's timezone, so the day it names is the day it lands on
    static #parse(v) {
        return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
    }
    static isoToLocal(iso) {
        const d = Instant.#parse(iso);
        const pad = (n, v) => String(v).padStart(n, '0');
        const date = `${d.getFullYear()}-${pad(2, d.getMonth() + 1)}-${pad(2, d.getDate())}`;
        const time = `${pad(2, d.getHours())}:${pad(2, d.getMinutes())}:${pad(2, d.getSeconds())}.${pad(3, d.getMilliseconds())}`;
        return `${date}T${time}`;
    }
    static localToIso(local) {
        const d = Instant.#parse(local);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
}

/** A date input whose bounds accept a date, now, or an offset such as +1d. */
class InputLocalDate extends Input {
    //declaration order is the application order: step first, since on a time
    //input min and max are snapped to its grid
    static observed = ['step', 'min', 'max'];
    _type() {
        return 'date';
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
        //the offset is subtracted before formatting so the iso date is the local
        //calendar day, which toISOString alone would shift to utc
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
            case 'm': {
                const originalDay = r.getDate();
                r.setMonth(r.getMonth() + offset * sign);
                if (r.getDate() !== originalDay) {
                    r.setDate(0);
                }
                break;
            }
            case 'y':
                r.setFullYear(r.getFullYear() + offset * sign);
                break;
        }
        return formatLocalDate(r);
    }
}

/** A time input whose bounds accept a time, now, or an hour or minute offset, snapped to the step grid. */
class InputLocalTime extends InputLocalDate {
    _type() {
        return 'time';
    }
    get min() {
        const v = this._input.min;
        return v === '' ? null : v;
    }
    set min(v) {
        this._input.min = this.#fromNowOrOffset(v);
    }
    get max() {
        const v = this._input.max;
        return v === '' ? null : v;
    }
    set max(v) {
        this._input.max = this.#fromNowOrOffset(v);
    }
    /**
     * Resolves `now` and hour or minute offsets against the current time, wrapping
     * around midnight. `m` is minutes here, unlike the date offsets of the parent where
     * it is months: months mean nothing on a time. Anything else is passed through.
     */
    #fromNowOrOffset(v) {
        if (!v) {
            return '';
        }
        const resolved = new Date();
        if (v !== 'now') {
            const re = /^([+-])(\d+)([hm])$/;
            const match = re.exec(v);
            if (!match) {
                return v;
            }
            const sign = match[1] === '-' ? -1 : 1;
            const offset = +match[2] * sign;
            if (match[3] === 'h') {
                resolved.setHours(resolved.getHours() + offset);
            } else {
                resolved.setMinutes(resolved.getMinutes() + offset);
            }
        }
        return InputLocalTime.#snapped(resolved, Number(this._input.step) || 60);
    }
    /**
     * Truncates a time to the step grid: min anchors that grid, so a bound that is not
     * on it makes every value on it invalid.
     */
    static #snapped(date, stepSeconds) {
        const pad = (n) => String(n).padStart(2, '0');
        const seconds = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
        const snapped = Math.floor(seconds / stepSeconds) * stepSeconds;
        const hh = pad(Math.floor(snapped / 3600));
        const mm = pad(Math.floor((snapped % 3600) / 60));
        return stepSeconds % 60 === 0 ? `${hh}:${mm}` : `${hh}:${mm}:${pad(snapped % 60)}`;
    }
}

/** A datetime input whose value is read and written as an ISO instant. */
class InputInstant extends Input {
    //declaration order is the application order: step first, since on a time
    //input min and max are snapped to its grid
    static observed = ['step', 'min', 'max'];
    _type() {
        return 'datetime-local';
    }
    get value() {
        return Instant.localToIso(this._input.value);
    }
    set value(v) {
        this._input.value = v ? Instant.isoToLocal(v) : '';
    }
    get min() {
        return Instant.localToIso(this._input.min);
    }
    set min(v) {
        this._input.min = v ? Instant.isoToLocal(v) : '';
    }
    get max() {
        return Instant.localToIso(this._input.max);
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
