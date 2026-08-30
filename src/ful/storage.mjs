class LocalStorage extends Storage {
    static save(k, v) {
        localStorage.setItem(k, JSON.stringify(v));
    }
    static load(k) {
        const got = localStorage.getItem(k);
        if (got === null) {
            return undefined;
        }
        try {
            return JSON.parse(got);
        } catch {
            //not what save wrote: drop it, otherwise every later read fails the same way
            localStorage.removeItem(k);
            return undefined;
        }
    }
    static remove(k) {
        localStorage.removeItem(k);
    }
    static pop(k) {
        const decoded = LocalStorage.load(k);
        LocalStorage.remove(k);
        return decoded;
    }
}

class SessionStorage extends Storage {
    static save(k, v) {
        sessionStorage.setItem(k, JSON.stringify(v));
    }
    static load(k) {
        const got = sessionStorage.getItem(k);
        if (got === null) {
            return undefined;
        }
        try {
            return JSON.parse(got);
        } catch {
            //not what save wrote: drop it, otherwise every later read fails the same way
            sessionStorage.removeItem(k);
            return undefined;
        }
    }
    static remove(k) {
        sessionStorage.removeItem(k);
    }
    static pop(k) {
        const decoded = SessionStorage.load(k);
        SessionStorage.remove(k);
        return decoded;
    }
}

class VersionedLocalStorage {
    static save(key, revision, data) {
        LocalStorage.save(key, { revision, data });
    }
    static load(key, revision) {
        const stored = LocalStorage.load(key);
        if (stored === undefined) {
            return undefined;
        }
        if (stored.revision !== revision) {
            LocalStorage.remove(key);
            return undefined;
        }
        return stored.data;
    }
}

class VersionedSessionStorage {
    static save(key, revision, data) {
        SessionStorage.save(key, { revision, data });
    }
    static load(key, revision) {
        const stored = SessionStorage.load(key);
        if (stored === undefined) {
            return undefined;
        }
        if (stored.revision !== revision) {
            SessionStorage.remove(key);
            return undefined;
        }
        return stored.data;
    }
}

export { LocalStorage, VersionedLocalStorage, SessionStorage, VersionedSessionStorage };
