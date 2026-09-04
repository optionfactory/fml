import { assert } from 'chai';
import { registry, Rendering } from '../../src/ftl/index.mjs';
import { Plugin } from '../../src/ful/index.mjs';
import en from '../../src/ful/elements/l10n/en.mjs';
import itTranslations from '../../src/ful/elements/l10n/it.mjs';
import es from '../../src/ful/elements/l10n/es.mjs';
import fr from '../../src/ful/elements/l10n/fr.mjs';

registry
    .plugin(
        new Plugin({
            language: 'en',
            translations: { 'files.unacceptablefiletype': 'we only take {types} around here' },
        }),
    )
    .configure();

const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const PLACEHOLDER = /\{(\w+)\}/g;
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Guards the built-in translations: every language carries the same keys and
 * the same placeholders, and every plural leaf has an 'other' form made of
 * CLDR categories only. English is the reference, being the fallback.
 *
 * @param {Record<string, Record<string, any>>} translations the translations, by language
 * @returns {string[]} every problem found
 */
const parityProblems = (translations) => {
    const reference = 'en' in translations ? 'en' : Object.keys(translations)[0];
    const placeholdersOf = (message) => {
        const texts = isPlainObject(message) ? Object.values(message) : [message];
        return new Set(texts.flatMap((text) => [...String(text).matchAll(PLACEHOLDER)].map((m) => m[1])));
    };
    const problems = [];
    for (const [lang, messages] of Object.entries(translations)) {
        if (lang !== reference) {
            for (const key of Object.keys(translations[reference])) {
                if (!(key in messages)) {
                    problems.push(`${lang}: missing "${key}"`);
                }
            }
            for (const key of Object.keys(messages)) {
                if (!(key in translations[reference])) {
                    problems.push(`${lang}: unexpected "${key}"`);
                }
            }
        }
        for (const [key, message] of Object.entries(messages)) {
            if (isPlainObject(message)) {
                if (!('other' in message)) {
                    problems.push(`${lang}: plural "${key}" has no "other"`);
                }
                for (const category of Object.keys(message)) {
                    if (!PLURAL_CATEGORIES.includes(category)) {
                        problems.push(`${lang}: plural "${key}" has unknown category "${category}"`);
                    }
                }
            }
            for (const name of placeholdersOf(translations[reference][key] ?? '')) {
                if (!placeholdersOf(message).has(name)) {
                    problems.push(`${lang}: "${key}" misses {${name}}`);
                }
            }
            for (const name of placeholdersOf(message)) {
                if (!placeholdersOf(translations[reference][key] ?? '').has(name)) {
                    problems.push(`${lang}: "${key}" has unexpected {${name}}`);
                }
            }
        }
    }
    return problems;
};

describe('built-in translations', () => {
    it('keeps every language at parity', () => {
        assert.deepStrictEqual(parityProblems({ en, it: itTranslations, es, fr }), [], 'the built-in translations are not at parity');
    });

    it('notices a broken language, so the parity guard cannot pass vacuously', () => {
        const problems = parityProblems({ en, it: { 'pagination.showing': 'Pagina', 'pagination.extra': 'Extra' } });
        assert.include(problems, 'it: missing "pagination.navigation"', 'a missing key is reported');
        assert.include(problems, 'it: unexpected "pagination.extra"', 'an unexpected key is reported');
        assert.include(problems, 'it: "pagination.showing" misses {current}', 'a missing placeholder is reported');
    });

    it('uses every key its templates reference', async () => {
        const { Table, Pagination, Select, Dropdown, InputFile } = await import('../../src/ful/index.mjs');
        const classes = [Table, Pagination, Select, Dropdown, InputFile];
        const used = new Set();
        for (const klass of classes) {
            for (const template of [klass.template, ...Object.values(klass.templates ?? {})]) {
                for (const found of String(template ?? '').matchAll(/#l10n:t\('([^']+)'/g)) {
                    used.add(found[1]);
                }
            }
        }
        assert.isAbove(used.size, 0, 'the template scan found something');
        for (const key of used) {
            assert.isString(en[key], `the templates use "${key}" but the translations do not carry it`);
        }
    });
});

describe('Plugin translations', () => {
    const mount = async (html) => {
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
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
    const file = (name, size = 10) => new File(['x'.repeat(size)], name, { lastModified: 1 });

    it('overrides a built-in message at configure time', async () => {
        const [el, container] = await mount(`<ful-input-file multiple accept=".pdf">files</ful-input-file>`);

        pick(el, file('a.txt'));

        assert.strictEqual(
            el.querySelector('ful-field-warnings ful-field-warning').innerText,
            'we only take .pdf around here',
        );

        container.remove();
    });

    it('leaves the messages it does not override intact', async () => {
        const [el, container] = await mount(`<ful-input-file multiple maxfiles="2">files</ful-input-file>`);

        pick(el, file('a.txt'), file('b.txt'), file('c.txt'));

        assert.strictEqual(
            el.querySelector('ful-field-warnings ful-field-warning').innerText,
            'Maximum of 2 files exceeded',
        );

        container.remove();
    });
});
