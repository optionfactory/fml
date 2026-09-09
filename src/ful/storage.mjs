/**
 * Json values in localStorage: unreachable storage is a miss, never a failure,
 * and a value another writer corrupted is dropped on read.
 */
class LocalStorage extends Storage {
    /** @param {string} k @param {*} v */
    static save(k, v) {
        localStorage.setItem(k, JSON.stringify(v));
    }
    /** @param {string} k @returns {*|undefined} */
    static load(k) {
        let got;
        try {
            got = localStorage.getItem(k);
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
            LocalStorage.remove(k);
            return undefined;
        }
    }
    /** @param {string} k */
    static remove(k) {
        try {
            localStorage.removeItem(k);
        } catch {
            //nothing to remove where storage is unreachable
        }
    }
    /** @param {string} k @returns {*|undefined} */
    static pop(k) {
        const decoded = LocalStorage.load(k);
        LocalStorage.remove(k);
        return decoded;
    }
}

/**
 * Json values in sessionStorage, with the same tolerances as LocalStorage.
 */
class SessionStorage extends Storage {
    /** @param {string} k @param {*} v */
    static save(k, v) {
        sessionStorage.setItem(k, JSON.stringify(v));
    }
    /** @param {string} k @returns {*|undefined} */
    static load(k) {
        let got;
        try {
            got = sessionStorage.getItem(k);
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
            SessionStorage.remove(k);
            return undefined;
        }
    }
    /** @param {string} k */
    static remove(k) {
        try {
            sessionStorage.removeItem(k);
        } catch {
            //nothing to remove where storage is unreachable
        }
    }
    /** @param {string} k @returns {*|undefined} */
    static pop(k) {
        const decoded = SessionStorage.load(k);
        SessionStorage.remove(k);
        return decoded;
    }
}

/**
 * A revisioned cache over localStorage: the key holds the data together with
 * the revision it was written under, and a load under any other revision is a
 * miss that also clears the stale entry.
 */
class VersionedLocalStorage {
    /** @param {string} key @param {string|number} revision @param {*} data */
    static save(key, revision, data) {
        LocalStorage.save(key, { revision, data });
    }
    /** @param {string} key @param {string|number} revision @returns {*|undefined} */
    static load(key, revision) {
        const stored = LocalStorage.load(key);
        if (stored == null || typeof stored !== 'object' || stored.revision !== revision) {
            LocalStorage.remove(key);
            return undefined;
        }
        return stored.data;
    }
}

/**
 * A revisioned cache over sessionStorage: the key holds the data together with
 * the revision it was written under, and a load under any other revision is a
 * miss that also clears the stale entry.
 */
class VersionedSessionStorage {
    /** @param {string} key @param {string|number} revision @param {*} data */
    static save(key, revision, data) {
        SessionStorage.save(key, { revision, data });
    }
    /** @param {string} key @param {string|number} revision @returns {*|undefined} */
    static load(key, revision) {
        const stored = SessionStorage.load(key);
        if (stored == null || typeof stored !== 'object' || stored.revision !== revision) {
            SessionStorage.remove(key);
            return undefined;
        }
        return stored.data;
    }
}

export { LocalStorage, VersionedLocalStorage, SessionStorage, VersionedSessionStorage };
