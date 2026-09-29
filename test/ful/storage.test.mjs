import { expect } from 'chai';
import {
    VersionedLocalStorage,
    VersionedSessionStorage,
    LocalStorage,
    SessionStorage,
} from '../../src/ful/storage.mjs';

const kinds = [
    {
        name: 'LocalStorage',
        Plain: LocalStorage,
        Versioned: VersionedLocalStorage,
        backing: () => localStorage,
        other: () => sessionStorage,
        OtherPlain: SessionStorage,
    },
    {
        name: 'SessionStorage',
        Plain: SessionStorage,
        Versioned: VersionedSessionStorage,
        backing: () => sessionStorage,
        other: () => localStorage,
        OtherPlain: LocalStorage,
    },
];

for (const { name, Plain, Versioned, backing, other, OtherPlain } of kinds) {
    describe(name, () => {
        beforeEach(() => {
            localStorage.clear();
            sessionStorage.clear();
        });

        it('saves and successfully loads versioned data with matching revisions', () => {
            Versioned.save('app-config', 'v1', { theme: 'dark' });
            const loaded = Versioned.load('app-config', 'v1');
            expect(loaded).to.deep.equal({ theme: 'dark' });
        });

        it('returns undefined and evicts stale versioned data if revisions mismatch', () => {
            Versioned.save('app-config', 'v1', { theme: 'dark' });
            const loaded = Versioned.load('app-config', 'v2');
            expect(loaded).to.be.undefined;
            expect(backing().getItem('app-config')).to.be.null;
        });

        it('does not touch the same-named key of the other storage on eviction', () => {
            OtherPlain.save('app-config', 'keep-me');
            Versioned.save('app-config', 'v1', { theme: 'dark' });
            const loaded = Versioned.load('app-config', 'v2');
            expect(loaded).to.be.undefined;
            expect(other().getItem('app-config')).to.not.be.null;
        });

        it('treats a foreign value under a versioned key as a miss, not a crash', () => {
            for (const foreign of ['null', '3', '"oops"', '[1,2]']) {
                backing().setItem('app-config', foreign);
                expect(Versioned.load('app-config', 'v1')).to.be.undefined;
                expect(backing().getItem('app-config')).to.be.null;
            }
        });

        it('safely pops data, removing it from storage entirely', () => {
            Plain.save('temp-key', 'ephemeral-data');

            const popped = Plain.pop('temp-key');
            expect(popped).to.equal('ephemeral-data');
            expect(backing().getItem('temp-key')).to.be.null;
        });

        it('load treats unparseable content as absent and drops it', () => {
            backing().setItem('broken', '{not json');

            expect(Plain.load('broken')).to.be.undefined;
            expect(backing().getItem('broken')).to.be.null;
        });

        it('a corrupt entry does not break the versioned reader for good', () => {
            backing().setItem('app-config', 'GET@/x was truncated');

            expect(Versioned.load('app-config', 'v1')).to.be.undefined;

            Versioned.save('app-config', 'v1', { theme: 'dark' });
            expect(Versioned.load('app-config', 'v1')).to.deep.equal({ theme: 'dark' });
        });

        it('load of a missing key is undefined', () => {
            expect(Plain.load('never.saved.key')).to.be.undefined;
        });

        it('versioned load of a missing key is undefined without side effects', () => {
            expect(Versioned.load('never.saved.key', 'r1')).to.be.undefined;
            expect(backing().getItem('never.saved.key')).to.be.null;
        });
    });
}

describe('Unreachable storage', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    const deny = () => {
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() {
                throw new DOMException('denied', 'SecurityError');
            },
        });
    };
    afterEach(() => {
        Object.defineProperty(window, 'localStorage', original);
    });

    it('reads are misses and removes are no-ops, never failures', () => {
        deny();
        expect(LocalStorage.load('k')).to.be.undefined;
        expect(LocalStorage.pop('k')).to.be.undefined;
        expect(() => LocalStorage.remove('k')).to.not.throw();
        expect(VersionedLocalStorage.load('k', 'v1')).to.be.undefined;
    });

    it('writes still report the failure to their caller', () => {
        deny();
        expect(() => LocalStorage.save('k', 'v')).to.throw();
    });
});
