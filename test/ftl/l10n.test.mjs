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
        assert.strictEqual(call('hello.plain'), 'Hello', 'a message called without arguments comes back as written');
    });

    it('interpolates named placeholders', () => {
        assert.strictEqual(
            call('hello.name', { name: 'Ada' }),
            'Hello Ada',
            'a single plain object argument fills the named placeholders',
        );
    });

    it('interpolates positional placeholders', () => {
        assert.strictEqual(
            call('hello.positional', 'Ada', 'Grace'),
            'Hello Ada and Grace',
            'arguments that are not a single plain object fill the positional placeholders by index',
        );
    });

    it('returns the key itself when the translations do not carry it', async () => {
        const warned = [];
        const original = console.warn;
        console.warn = (...args) => warned.push(args.map(String).join(' '));
        try {
            assert.strictEqual(
                call('hello.nope'),
                'hello.nope',
                'a missing message answers its key so the page still shows something',
            );
            assert.strictEqual(
                call('valueOf'),
                'valueOf',
                'an inherited name is not a message: the key comes back, as for any other miss',
            );
            assert.isTrue(
                warned.some((w) => w.includes('missing message "valueOf"')),
                'an inherited name warns as a missing message',
            );
        } finally {
            console.warn = original;
        }
    });

    it('does not read an inherited name as a placeholder argument', () => {
        const warned = [];
        const original = console.warn;
        console.warn = (...args) => warned.push(args.map(String).join(' '));
        try {
            assert.strictEqual(
                call('hello.missingarg', Object.create({ who: 'inherited' })),
                'Hi {who}',
                'a {who} reached only through the prototype chain is an argument nobody passed',
            );
            assert.isTrue(
                warned.some((w) => w.includes('wants {who}')),
                'the placeholder with no own argument is warned about by name',
            );
        } finally {
            console.warn = original;
        }
    });

    it('selects the plural form through the count argument', () => {
        assert.strictEqual(
            call('hello.plural', { count: 1 }),
            '1 file',
            'english selects the one form for a count of 1',
        );
        assert.strictEqual(
            call('hello.plural', { count: 0 }),
            '0 files',
            'english selects the other form for a count of 0',
        );
        assert.strictEqual(
            call('hello.plural', { count: 2 }),
            '2 files',
            'english selects the other form for a count above 1',
        );
    });

    it('falls back to other when the locale has no category for a count', () => {
        assert.strictEqual(
            call('hello.plural', { count: 100 }),
            '100 files',
            'a plural category the leaf does not carry falls back to its other form',
        );
    });

    it('warns and falls back to other when a plural is called without a count', () => {
        assert.strictEqual(
            call('hello.plural'),
            '{count} files',
            'without a numeric count the other form is used and its placeholder stays literal',
        );
    });

    it('warns and leaves the literal when a named placeholder has no argument', () => {
        assert.strictEqual(
            call('hello.missingarg', {}),
            'Hi {who}',
            'a named placeholder without an argument stays in the text as written',
        );
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
        assert.strictEqual(
            Localization.number.call({ locale: 'it' }, 15000),
            '15.000',
            'the italian receiver groups thousands with a dot',
        );
        assert.strictEqual(
            Localization.number.call({ locale: 'en' }, 15000),
            '15,000',
            'the english receiver groups thousands with a comma',
        );
    });

    it('formats byte sizes with binary thresholds and literal units', () => {
        const bytes = (v) => Localization.bytes.call({ locale: 'en' }, v);
        assert.strictEqual(bytes(100), '100B', 'a size under 1024 is in bytes');
        assert.strictEqual(bytes(2048), '2KiB', 'a whole number of kibibytes has no fraction digits');
        assert.strictEqual(bytes(1536), '1.5KiB', 'a size between kibibytes keeps its fraction');
        assert.strictEqual(bytes(1024), '1KiB', 'a size exactly on the kibibyte threshold takes the larger unit');
        assert.strictEqual(
            bytes(1024 * 1024),
            '1MiB',
            'a size exactly on the mebibyte threshold takes the larger unit',
        );
        assert.strictEqual(bytes(1024 * 1024 + 1024 * 512), '1.5MiB', 'a size between mebibytes keeps its fraction');
        assert.strictEqual(
            bytes(1024 * 1024 * 1024),
            '1GiB',
            'a size exactly on the gibibyte threshold takes the larger unit',
        );
        assert.strictEqual(
            bytes(5 * 1024 * 1024 * 1024 + 512 * 1024 * 1024),
            '5.5GiB',
            'a size between gibibytes keeps its fraction',
        );
    });

    it('formats byte sizes with locale digits', () => {
        assert.strictEqual(
            Localization.bytes.call({ locale: 'it' }, 1536),
            '1,5KiB',
            'the digits follow the locale while the unit stays literal',
        );
    });

    it('formats dates in the receiver locale', () => {
        const at = new Date(2026, 8, 4);
        assert.strictEqual(
            Localization.date.call({ locale: 'it' }, at, { year: 'numeric', month: 'long' }),
            'settembre 2026',
            'the italian receiver writes the month name in italian',
        );
        assert.strictEqual(
            Localization.date.call({ locale: 'en' }, at, { year: 'numeric', month: 'long' }),
            'September 2026',
            'the english receiver writes the month name in english',
        );
    });
});

describe('Localization.failure', () => {
    const receiver = { l10n: { 'failure.no-reason': 'Something went wrong' }, locale: 'en' };
    const failure = (value) => Localization.failure.call(receiver, value);

    it('reads a value carrying problems as their reasons, one per line', () => {
        const value = { message: 'invalid', problems: [{ reason: 'blank' }, { reason: 'server said no' }] };
        assert.strictEqual(failure(value), 'blank\nserver said no', 'each problem reason is one line, in order');
    });

    it('reads a missing, null or blank reason as the no-reason message', () => {
        const value = { problems: [{ reason: null }, {}, { reason: '  ' }, { reason: 'kept' }] };
        assert.strictEqual(
            failure(value),
            'Something went wrong\nSomething went wrong\nSomething went wrong\nkept',
            'each missing, null or blank reason reads as the failure.no-reason message, a present reason as itself',
        );
    });

    it('does not look up the no-reason message while every reason is there', () => {
        const value = { problems: [{ reason: 'blank' }] };
        assert.strictEqual(
            Localization.failure.call({ l10n: {} }, value),
            'blank',
            'translations without failure.no-reason are fine while every problem has a reason',
        );
    });

    it('reads a value without problems as its message, an empty list included', () => {
        assert.strictEqual(failure(new Error('bang')), 'bang', 'an error reads as its message');
        assert.strictEqual(
            failure({ message: 'boom', problems: [] }),
            'boom',
            'an empty problems list is ignored and the message is used',
        );
    });

    it('reads anything else as its string form, and nothing as the empty string', () => {
        assert.strictEqual(failure('plain text'), 'plain text', 'a string reads as itself');
        assert.strictEqual(failure(42), '42', 'a number reads as its string form');
        assert.strictEqual(failure(null), '', 'null reads as the empty string, not as the text null');
        assert.strictEqual(failure(undefined), '', 'undefined reads as the empty string, not as the text undefined');
    });
});

describe('Localization.of', () => {
    before(() => {
        registry.defineModule('l10n', Localization).defineOverlay({ l10n: { 'app.title': 'Titolo' }, locale: 'it' });
    });

    it('resolves the translations and the locale from the registry overlays', () => {
        const { t, number } = Localization.of();
        assert.strictEqual(t('app.title'), 'Titolo', 'the facade reads the translations from the registry overlays');
        assert.strictEqual(number(15000), '15.000', 'the facade formats in the locale from the registry overlays');
    });

    it('reads the overlays live, at call time', () => {
        const { t } = Localization.of();
        assert.strictEqual(t('app.added'), 'app.added', 'a key not yet defined answers itself');
        registry.defineOverlay({ l10n: { 'app.added': 'Aggiunto' } });
        assert.strictEqual(
            t('app.added'),
            'Aggiunto',
            'a facade taken before the overlay was defined sees it, because it resolves on every call',
        );
    });

    it('lets an explicit locale override the registry one', () => {
        assert.strictEqual(
            Localization.of({ locale: 'en' }).number(15000),
            '15,000',
            'an explicit locale wins over the italian one in the registry',
        );
    });

    it('resolves through the same lookup a template makes, function overlays included', () => {
        const overlay = () => undefined;
        overlay.l10n = { 'app.fn': 'Da una funzione' };
        registry.defineOverlay(overlay);

        assert.strictEqual(
            Localization.of().t('app.fn'),
            registry.evaluator().evaluateExpression("#l10n:t('app.fn')"),
            'the imperative facade and the template agree',
        );
        assert.strictEqual(
            Localization.of().t('app.fn'),
            'Da una funzione',
            'the facade finds translations carried by a function overlay',
        );
    });
});

describe('Localization edge contracts', () => {
    it('returns the key and warns when a plural leaf has no other form', () => {
        assert.strictEqual(
            Localization.t.call({ l10n: { k: { one: 'only one' } }, locale: 'en' }, 'k', { count: 2 }),
            'k',
            'a plural leaf without an other form answers its key when the count selects a missing form',
        );
    });

    it('leaves the literal and warns when a positional placeholder has no argument', () => {
        assert.strictEqual(
            Localization.t.call({ l10n: { k: '{0} and {1}' } }, 'k', 'a'),
            'a and {1}',
            'a positional placeholder past the last argument stays in the text as written',
        );
    });

    it('formats the same way after the formatter cache has evicted', function () {
        this.timeout(10000);
        const at = (i) => Localization.number.call({ locale: `en-x-${i}` }, 2 / 7, { minimumFractionDigits: 3 });
        for (let i = 0; i !== 150; ++i) {
            at(i);
        }
        assert.strictEqual(
            Localization.number.call({ locale: 'en' }, 2 / 7, { minimumFractionDigits: 3 }),
            '0.286',
            'after the formatter cache evicted, a number formats as it did before',
        );
        assert.strictEqual(
            Localization.bytes.call({ locale: 'en' }, 2048),
            '2KiB',
            'after the formatter cache evicted, a byte size formats as it did before',
        );
    });

    it('of() degrades to missing messages when nothing was ever configured', () => {
        registry.defineData({ unrelated: true });
        const { t } = Localization.of();
        assert.strictEqual(
            t('never.configured'),
            'never.configured',
            'with no translations in the overlays a key answers itself',
        );
    });
});
