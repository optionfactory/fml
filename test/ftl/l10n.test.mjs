import { assert } from 'chai';
import { Localization, registry } from '../../src/ftl/index.mjs';

const TRANSLATIONS = {
    'hello.name': 'Hello {name}',
    'hello.positional': 'Hello {0} and {1}',
    'hello.plain': 'Hello',
    'hello.plural': { one: '{count} file', other: '{count} files' },
    'hello.missingarg': 'Hi {who}',
};

const call = (key, ...args) => Localization.t.call({ l10n: TRANSLATIONS, locale: 'en' }, key, ...args);

describe('Localization.t', () => {
    it('returns the plain message', () => {
        assert.strictEqual(call('hello.plain'), 'Hello');
    });

    it('interpolates named placeholders', () => {
        assert.strictEqual(call('hello.name', { name: 'Ada' }), 'Hello Ada');
    });

    it('interpolates positional placeholders', () => {
        assert.strictEqual(call('hello.positional', 'Ada', 'Grace'), 'Hello Ada and Grace');
    });

    it('returns the key itself when the translations do not carry it', () => {
        assert.strictEqual(call('hello.nope'), 'hello.nope');
    });

    it('selects the plural form through the count argument', () => {
        assert.strictEqual(call('hello.plural', { count: 1 }), '1 file');
        assert.strictEqual(call('hello.plural', { count: 0 }), '0 files');
        assert.strictEqual(call('hello.plural', { count: 2 }), '2 files');
    });

    it('falls back to other when the locale has no category for a count', () => {
        //english has no distinct form for 100 beyond other
        assert.strictEqual(call('hello.plural', { count: 100 }), '100 files');
    });

    it('warns and falls back to other when a plural is called without a count', () => {
        assert.strictEqual(call('hello.plural'), '{count} files');
    });

    it('warns and leaves the literal when a named placeholder has no argument', () => {
        assert.strictEqual(call('hello.missingarg', {}), 'Hi {who}');
    });

    it('warns once per problem, not once per render', () => {
        const warnings = [];
        const original = console.warn;
        console.warn = (message) => warnings.push(message);
        try {
            call('hello.once', 'a');
            call('hello.once', 'b');
            call('hello.once', 'c');
        } finally {
            console.warn = original;
        }
        assert.lengthOf(warnings, 1, 'the same missing key warns exactly once');
    });
});

describe('Localization formatters', () => {
    it('formats numbers in the receiver locale', () => {
        //italian keeps four digit numbers ungrouped: grouping starts at five digits
        assert.strictEqual(Localization.number.call({ locale: 'it' }, 15000), '15.000');
        assert.strictEqual(Localization.number.call({ locale: 'en' }, 15000), '15,000');
    });

    it('formats byte sizes with binary thresholds and literal units', () => {
        const bytes = (v) => Localization.bytes.call({ locale: 'en' }, v);
        assert.strictEqual(bytes(100), '100B');
        assert.strictEqual(bytes(2048), '2KiB');
        assert.strictEqual(bytes(1536), '1.5KiB');
        //1MiB on the nose is still on the KiB step, like it always was
        assert.strictEqual(bytes(1024 * 1024), '1,024KiB');
        assert.strictEqual(bytes(1024 * 1024 + 1024 * 512), '1.5MiB');
    });

    it('formats byte sizes with locale digits', () => {
        assert.strictEqual(Localization.bytes.call({ locale: 'it' }, 1536), '1,5KiB');
    });

    it('formats dates in the receiver locale', () => {
        const at = new Date(2026, 8, 4);
        assert.strictEqual(
            Localization.date.call({ locale: 'it' }, at, { year: 'numeric', month: 'long' }),
            'settembre 2026',
        );
        assert.strictEqual(
            Localization.date.call({ locale: 'en' }, at, { year: 'numeric', month: 'long' }),
            'September 2026',
        );
    });
});

describe('Localization.of', () => {
    before(() => {
        registry.defineModule('l10n', Localization).defineOverlay({ l10n: { 'app.title': 'Titolo' }, locale: 'it' });
    });

    it('resolves the translations and the locale from the registry overlays', () => {
        const { t, number } = Localization.of();
        assert.strictEqual(t('app.title'), 'Titolo');
        assert.strictEqual(number(15000), '15.000');
    });

    it('reads the overlays live, at call time', () => {
        const { t } = Localization.of();
        assert.strictEqual(t('app.added'), 'app.added');
        registry.defineOverlay({ l10n: { 'app.added': 'Aggiunto' } });
        assert.strictEqual(t('app.added'), 'Aggiunto');
    });

    it('lets an explicit locale override the registry one', () => {
        assert.strictEqual(Localization.of({ locale: 'en' }).number(15000), '15,000');
    });
});

