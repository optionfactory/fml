import { ParsedElement, Localization } from '../../ftl/index.mjs';
import { Input } from './input.mjs';

const blankAsNull = (v) => (v === '' ? null : v);

/**
 * Formats the yyyy-mm-dd date in its content as a numeric date, in the locale
 * its `locale` attribute names, else the page's, else the platform default.
 * Blank content, or content that does not name a date, renders the `default`
 * attribute, or nothing without one.
 */
class LocalDate extends ParsedElement {
    static attributes = ['locale', 'default'];
    render() {
        const content = this.textContent.trim();
        const [y, m, d] = content.split('-').map(Number);
        const parsed = content === '' ? null : new Date(y, m - 1, d);
        if (parsed === null || Number.isNaN(parsed.getTime())) {
            this.replaceChildren(this.declared('default') ?? '');
            return;
        }
        const { date } = Localization.of({ locale: this.declared('locale') ?? undefined });
        this.replaceChildren(date(parsed, { year: 'numeric', month: 'numeric', day: 'numeric' }));
    }
}

/**
 * Formats the ISO instant in its content as a numeric date and 24 hour time
 * with seconds, in the page's timezone and in the locale chosen as ful-local-date
 * chooses it. Blank content, or content that does not name an instant, renders
 * the `default` attribute, or nothing without one. A date-only value is read as
 * local midnight of that day.
 */
class Instant extends ParsedElement {
    static attributes = ['locale', 'default'];
    render() {
        const content = this.textContent.trim();
        const parsed = content === '' ? null : new Date(Instant.isoToLocal(content));
        if (parsed === null || Number.isNaN(parsed.getTime())) {
            this.replaceChildren(this.declared('default') ?? '');
            return;
        }
        const { date } = Localization.of({ locale: this.declared('locale') ?? undefined });
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
    static #parse(v) {
        return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
    }
    /**
     * Converts an ISO instant to the `yyyy-mm-ddThh:mm:ss.sss` wall clock time
     * a datetime-local input takes, in the page's timezone. A date-only value is
     * read as local midnight of the day it names, not as UTC midnight.
     * @param {string} iso
     * @returns {string} with NaN fields for a value that does not parse
     */
    static isoToLocal(iso) {
        const d = Instant.#parse(iso);
        const pad = (n, v) => String(v).padStart(n, '0');
        const date = `${d.getFullYear()}-${pad(2, d.getMonth() + 1)}-${pad(2, d.getDate())}`;
        const time = `${pad(2, d.getHours())}:${pad(2, d.getMinutes())}:${pad(2, d.getSeconds())}.${pad(3, d.getMilliseconds())}`;
        return `${date}T${time}`;
    }
    /**
     * Converts a datetime-local wall clock time in the page's timezone to a UTC
     * ISO instant. A date-only value is read as local midnight of that day.
     * @param {string} local
     * @returns {string|null} null for a value that does not parse
     */
    static localToIso(local) {
        const d = Instant.#parse(local);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
}

/**
 * A date input whose `min` and `max` accept a yyyy-mm-dd date, `now` for
 * today, or an offset from today such as `+1d`, `-2m` or `+1y` (days, months,
 * years). A month offset landing past the end of the target month takes its
 * last day. Anything else is passed to the input unchanged. The `step`
 * attribute is applied before `min` and `max`.
 */
class InputLocalDate extends Input {
    static observed = ['step', 'min', 'max'];
    _type() {
        return 'date';
    }
    /**
     * The resolved lower bound, a yyyy-mm-dd date or whatever the input was given.
     * @returns {string|null} null when unset
     */
    get min() {
        return blankAsNull(this._input.min);
    }
    /** @param {string|null} v a date, `now` or an offset; null or blank removes the bound */
    set min(v) {
        this._input.min = InputLocalDate.#fromIsoOrOffset(v);
    }
    /**
     * The resolved upper bound, a yyyy-mm-dd date or whatever the input was given.
     * @returns {string|null} null when unset
     */
    get max() {
        return blankAsNull(this._input.max);
    }
    /** @param {string|null} v a date, `now` or an offset; null or blank removes the bound */
    set max(v) {
        this._input.max = InputLocalDate.#fromIsoOrOffset(v);
    }
    /**
     * The input's native step, in days on a date input and in seconds on a time input.
     * @returns {string|null} null when unset
     */
    get step() {
        return blankAsNull(this._input.step);
    }
    /** @param {string|null} v */
    set step(v) {
        this._input.step = v ?? '';
    }
    static #fromIsoOrOffset(v) {
        if (!v) {
            return '';
        }
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

/**
 * A time input whose `min` and `max` accept a hh:mm time, `now`, or an offset
 * from now such as `+2h` or `-30m` (hours, minutes: `m` is minutes here, not
 * months), wrapping around midnight. A bound resolved from `now` or an offset
 * is floored to the `step` grid (60 seconds when unset), so that the values
 * on the grid stay valid, and carries seconds only when the step is not whole
 * minutes. A literal bound, and anything else, is passed to the input unchanged.
 */
class InputLocalTime extends InputLocalDate {
    _type() {
        return 'time';
    }
    /**
     * The resolved lower bound, a time or whatever the input was given.
     * @returns {string|null} null when unset
     */
    get min() {
        return blankAsNull(this._input.min);
    }
    /** @param {string|null} v a time, `now` or an offset; null or blank removes the bound */
    set min(v) {
        this._input.min = this.#fromNowOrOffset(v);
    }
    /**
     * The resolved upper bound, a time or whatever the input was given.
     * @returns {string|null} null when unset
     */
    get max() {
        return blankAsNull(this._input.max);
    }
    /** @param {string|null} v a time, `now` or an offset; null or blank removes the bound */
    set max(v) {
        this._input.max = this.#fromNowOrOffset(v);
    }
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
    static #snapped(date, stepSeconds) {
        const pad = (n) => String(n).padStart(2, '0');
        const seconds = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
        const snapped = Math.floor(seconds / stepSeconds) * stepSeconds;
        const hh = pad(Math.floor(snapped / 3600));
        const mm = pad(Math.floor((snapped % 3600) / 60));
        return stepSeconds % 60 === 0 ? `${hh}:${mm}` : `${hh}:${mm}:${pad(snapped % 60)}`;
    }
}

/**
 * A datetime-local input whose value and bounds are read and written as UTC
 * ISO instants, shown as wall clock time in the page's timezone. A date-only
 * value is read as local midnight of that day.
 */
class InputInstant extends Input {
    static observed = ['step', 'min', 'max'];
    _type() {
        return 'datetime-local';
    }
    /**
     * The entered time as a UTC ISO instant.
     * @returns {string|null} null when empty or when the input holds text that does not parse
     */
    get value() {
        return Instant.localToIso(this._input.value);
    }
    /** @param {string|null|undefined} v an ISO instant; a falsy value empties the input */
    set value(v) {
        super.value = v ? Instant.isoToLocal(v) : '';
    }
    /**
     * The lower bound as a UTC ISO instant.
     * @returns {string|null} null when unset
     */
    get min() {
        return Instant.localToIso(this._input.min);
    }
    /** @param {string|null} v an ISO instant; a falsy value removes the bound */
    set min(v) {
        this._input.min = v ? Instant.isoToLocal(v) : '';
    }
    /**
     * The upper bound as a UTC ISO instant.
     * @returns {string|null} null when unset
     */
    get max() {
        return Instant.localToIso(this._input.max);
    }
    /** @param {string|null} v an ISO instant; a falsy value removes the bound */
    set max(v) {
        this._input.max = v ? Instant.isoToLocal(v) : '';
    }
    /**
     * The input's native step, in seconds.
     * @returns {string|null} null when unset
     */
    get step() {
        return blankAsNull(this._input.step);
    }
    /** @param {string|null} v */
    set step(v) {
        this._input.step = v ?? '';
    }
}

export { Instant, LocalDate, InputLocalDate, InputLocalTime, InputInstant };
