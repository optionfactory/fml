/**
 * What an element declares about itself, read once for everyone who asks.
 *
 * The manifest generator runs in node over the built bundle and the parity test
 * runs in a browser over the sources, so the two cannot share an import of the
 * library: they hand their own `Plugin` and `Registry` to the factory instead.
 * They did each carry their own copy of this, and the copies drifted: the walk
 * over the attribute declarations stopped at a different class in each, and two
 * of the three read only the observed half, so the metadata documented none of
 * the configuration tier while every reader believed it agreed with the others.
 *
 * No dom is touched here, so the browser and the generator's stubbed globals
 * both carry it.
 * @param {{ Plugin: any, Registry: any }} library
 */
const introspect = ({ Plugin, Registry }) => ({
    /** The tags the plugin registers, captured without defining anything. */
    registered() {
        const found = [];
        const recorder = new Proxy(
            {},
            {
                get:
                    (_target, key) =>
                    (...args) => {
                        if (key === 'defineElement') {
                            found.push({ tag: args[0], klass: args[1] });
                        }
                        return recorder;
                    },
            },
        );
        new Plugin({ language: 'en' }).configure(recorder);
        return found;
    },
    /**
     * Every attribute declaration the class composes, verbatim (`value:csv`),
     * both tiers together: the live doors and the configuration read once.
     */
    attributesOf(klass) {
        const { observed, attributes } = Registry.declarationsOf(klass);
        const byName = new Map();
        for (const declared of [...attributes, ...observed]) {
            byName.set(declared.split(':')[0], declared);
        }
        return [...byName.values()];
    },
    /** The slot names the class's templates read. */
    slotsOf(klass) {
        const slots = new Set();
        for (const template of [klass.template, ...Object.values(klass.templates ?? {})]) {
            for (const found of String(template ?? '').matchAll(/slots\.([a-zA-Z]+)/g)) {
                slots.add(found[1]);
            }
        }
        return [...slots];
    },
});

export { introspect };
