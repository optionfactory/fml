class LocalizationModule {
    static t(k, ...args) {
        //@ts-expect-error l10n and language come from the element class and the data stack
        const format = this.l10n?.[this.language]?.[k] ?? this.l10n?.en?.[k] ?? k;
        if (args.length === 0) {
            return format;
        }
        return format.replace(/{(\d+)}/g, (m, is) => {
            return args[Number(is)];
        });
    }
    static tl(k, args = []) {
        return LocalizationModule.t.apply(this, [k, ...args]);
    }
}

export { LocalizationModule };
