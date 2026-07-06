class LocalizationModule {
    static t(k, ...args) {
        //@ts-ignore
        const format = this.l10n?.[this.language]?.[k] ?? this.l10n?.['en']?.[k] ?? k;
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
