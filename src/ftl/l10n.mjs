import { registry } from './registry.mjs';

/**
 * A flat translations map: dotted keys pointing to a message, or to a plural
 * leaf carrying a CLDR plural category for each of its forms ('other' is
 * required, the missing categories of a language fall back to it).
 *
 * @typedef {Record<string, string | Record<string, string>>} Messages
 */

/**
 * The receiver contract of the module functions: bound to a proxy over the
 * data stack when called from a template, or to a plain object by Localization.of().
 *
 * @typedef {{ l10n?: Messages, locale?: string }} Receiver
 */

const PLACEHOLDER = /\{(\w+)\}/g;
const POSITIONAL = /\{(\d+)\}/g;
/** @param {any} v @returns {v is Record<string, string>} */
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** every l10n problem is reported once per session: a missing key in a row template must not flood the console */
const warned = new Set();
const warnOnce = (problem) => {
    if (!warned.has(problem)) {
        warned.add(problem);
        console.warn(`l10n: ${problem}`);
    }
};

const MAX_FORMATTERS = 100;
const formatters = new Map();
/**
 * Intl construction is the expensive part of formatting (locale parsing, CLDR
 * lookups), while formatting on a built instance is near free: a list rendering
 * a size per row must not rebuild a NumberFormat per cell, so instances are
 * memoized by constructor, locale and options.
 *
 * @param {{ new (locale: string | undefined, options: any): any }} ctor
 * @param {string | undefined} locale
 * @param {any} [options]
 */
const formatter = (ctor, locale, options) => {
    const key = `${ctor.name}|${locale ?? ''}|${options === undefined ? '' : JSON.stringify(options)}`;
    let instance = formatters.get(key);
    if (instance === undefined) {
        if (formatters.size >= MAX_FORMATTERS) {
            formatters.delete(formatters.keys().next().value);
        }
        instance = new ctor(locale, options);
        formatters.set(key, instance);
    }
    return instance;
};

class Localization {
    /**
     * Resolves a message from the translations and interpolates its arguments.
     * A single plain object argument interpolates named placeholders
     * ({name}); anything else interpolates positional ones ({0}).
     * A plural leaf selects its form through Intl.PluralRules over the
     * numeric {count} named argument.
     *
     * @param {string} key
     * @param {...any} args
     * @this {Receiver}
     * @returns {string} the message, or the key itself when the translations do not carry it
     */
    static t(key, ...args) {
        const messages = this.l10n ?? {};
        let message = messages[key];
        if (message === undefined) {
            warnOnce(`missing message "${key}"`);
            return key;
        }
        if (isPlainObject(message)) {
            const named = args.length === 1 && isPlainObject(args[0]) ? args[0] : {};
            if (typeof named.count !== 'number') {
                warnOnce(`plural message "${key}" needs a numeric {count}`);
                message = message.other;
            } else {
                const locale = this.locale ?? navigator?.language ?? 'en';
                const category = formatter(Intl.PluralRules, locale).select(named.count);
                message = message[category] ?? message.other;
            }
        }
        if (message === undefined || typeof message === 'object') {
            warnOnce(`plural message "${key}" has no "other" form`);
            return key;
        }
        if (args.length === 1 && isPlainObject(args[0])) {
            const named = args[0];
            return message.replace(PLACEHOLDER, (literal, name) => {
                if (!(name in named)) {
                    warnOnce(`message "${key}" wants {${name}}`);
                    return literal;
                }
                return String(named[name]);
            });
        }
        if (args.length > 0) {
            return message.replace(POSITIONAL, (literal, index) => {
                const i = Number(index);
                if (i >= args.length) {
                    warnOnce(`message "${key}" wants {${index}}`);
                    return literal;
                }
                return String(args[i]);
            });
        }
        return message;
    }

    /**
     * Formats a date through Intl.DateTimeFormat in the receiver's locale.
     *
     * @param {Date | number} value
     * @param {Intl.DateTimeFormatOptions} [options]
     * @this {Receiver}
     */
    static date(value, options) {
        return formatter(Intl.DateTimeFormat, this.locale, options).format(value);
    }

    /**
     * Formats a number through Intl.NumberFormat in the receiver's locale.
     *
     * @param {number} value
     * @param {Intl.NumberFormatOptions} [options]
     * @this {Receiver}
     */
    static number(value, options) {
        return formatter(Intl.NumberFormat, this.locale, options).format(value);
    }

    /**
     * Formats a byte size with binary thresholds and literal unit suffixes:
     * the digits honor the locale, the units are the near-universal KiB/MiB.
     *
     * @param {number} value
     * @this {Receiver}
     */
    static bytes(value) {
        const format = formatter(Intl.NumberFormat, this.locale, { maximumFractionDigits: 2 }).format;
        if (value > 1024 * 1024) {
            return `${format(value / 1024 / 1024)}MiB`;
        }
        if (value > 1024) {
            return `${format(value / 1024)}KiB`;
        }
        return `${format(value)}B`;
    }

    /**
     * An imperative facade over the module functions, resolving the translations
     * and the locale from the registry overlays on every call.
     *
     * @param {{ locale?: string }} [overrides] an explicit locale, winning over the registry one
     */
    static of(overrides = {}) {
        const resolve = (prop) => {
            const { data } = registry.context();
            for (let i = data.length - 1; i >= 0; i--) {
                const overlay = data[i];
                if (overlay != null && typeof overlay === 'object' && prop in overlay) {
                    return overlay[prop];
                }
            }
            return undefined;
        };
        /** @param {any} fn */
        const bind =
            (fn) =>
            (...args) =>
                fn.apply({ l10n: resolve('l10n'), locale: overrides.locale ?? resolve('locale') }, args);
        return {
            t: bind(Localization.t),
            date: bind(Localization.date),
            number: bind(Localization.number),
            bytes: bind(Localization.bytes),
        };
    }
}

export { Localization };
