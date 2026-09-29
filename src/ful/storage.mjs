/**
 * One of the page's storages, holding values encoded as json. The functions
 * do not use `this`, so they keep working when destructured. Reads never
 * throw: where the storage cannot be reached at all (blocked cookies, some
 * embedded or private contexts) a read is a miss and a removal does nothing.
 * @typedef {Object} JsonStorage
 * @property {(k: string, v: any) => void} save stores `JSON.stringify(v)`
 * under `k`, throwing what the encoding or the storage throws: an unreachable
 * storage, a full quota, a value json cannot encode
 * @property {(k: string) => any} load the value stored under `k`, decoded;
 * undefined when there is none, when the storage cannot be reached, or when the
 * stored text is not json, in which case the entry is also removed
 * @property {(k: string) => void} remove removes the entry under `k`
 * @property {(k: string) => any} pop what `load` answers for `k`, removing the
 * entry
 */
/**
 * One of the page's storages holding values beside a revision.
 * @typedef {Object} VersionedJsonStorage
 * @property {(key: string, revision: string, data: any) => void} save stores
 * `data` with `revision` under `key`, throwing what `JsonStorage.save` throws
 * @property {(key: string, revision: string) => any} load the data stored under
 * `key` when it was saved with this exact revision; otherwise undefined, and the
 * entry is removed, whether it holds another revision, holds no revision at
 * all, or is missing
 */
/**
 * @param {() => globalThis.Storage} backing called on every operation, so an
 * unreachable storage fails that operation rather than the module's load
 * @returns {JsonStorage}
 */
const storage = (backing) => {
    const remove = (k) => {
        try {
            backing().removeItem(k);
        } catch {}
    };
    const load = (k) => {
        let got;
        try {
            got = backing().getItem(k);
        } catch {
            return undefined;
        }
        if (got === null) {
            return undefined;
        }
        try {
            return JSON.parse(got);
        } catch {
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
 * @param {JsonStorage} store
 * @returns {VersionedJsonStorage}
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

/** `localStorage`, holding json. */
const LocalStorage = storage(() => localStorage);
/** `sessionStorage`, holding json. */
const SessionStorage = storage(() => sessionStorage);
/** `localStorage`, holding json beside a revision. */
const VersionedLocalStorage = versioned(LocalStorage);
/** `sessionStorage`, holding json beside a revision. */
const VersionedSessionStorage = versioned(SessionStorage);

export { LocalStorage, VersionedLocalStorage, SessionStorage, VersionedSessionStorage };
