/**
 * Builds a json-encoding wrapper over one of the page's storages. The backing
 * is deferred (an accessor, not the storage itself): where storage is denied
 * (blocked cookies, some embedded or private contexts) the accessor itself
 * throws, and must do so per call, never at module load. The methods are bound
 * to nothing: destructuring keeps them working.
 * @param {() => globalThis.Storage} backing
 */
const storage = (backing) => {
    const remove = (k) => {
        try {
            backing().removeItem(k);
        } catch {
            //nothing to remove where storage is unreachable
        }
    };
    const load = (k) => {
        let got;
        try {
            got = backing().getItem(k);
        } catch {
            //storage can be unreachable altogether (blocked cookies, embedded or
            //private contexts): a read that cannot reach it is a miss, not a failure
            return undefined;
        }
        if (got === null) {
            return undefined;
        }
        try {
            return JSON.parse(got);
        } catch {
            //not what save wrote: drop it, otherwise every later read fails the same way
            remove(k);
            return undefined;
        }
    };
    const save = (k, v) => {
        backing().setItem(k, JSON.stringify(v));
    };
    const pop = (k) => {
        const decoded = load(k);
        remove(k);
        return decoded;
    };
    return { save, load, remove, pop };
};

/**
 * Builds a revision-guarded view over a storage wrapper: a load under a
 * revision other than the stored one is a miss that also evicts the entry.
 * @param {ReturnType<typeof storage>} store
 */
const versioned = (store) => ({
    save(key, revision, data) {
        store.save(key, { revision, data });
    },
    load(key, revision) {
        const stored = store.load(key);
        if (stored == null || typeof stored !== 'object' || stored.revision !== revision) {
            store.remove(key);
            return undefined;
        }
        return stored.data;
    },
});

const LocalStorage = storage(() => localStorage);
const SessionStorage = storage(() => sessionStorage);
const VersionedLocalStorage = versioned(LocalStorage);
const VersionedSessionStorage = versioned(SessionStorage);

export { LocalStorage, VersionedLocalStorage, SessionStorage, VersionedSessionStorage };
