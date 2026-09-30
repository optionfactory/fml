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
            expect(loaded, 'data saved with a revision loads back with the same revision').to.deep.equal({
                theme: 'dark',
            });
        });

        it('returns undefined and evicts stale versioned data if revisions mismatch', () => {
            Versioned.save('app-config', 'v1', { theme: 'dark' });
            const loaded = Versioned.load('app-config', 'v2');
            expect(loaded, 'data saved with another revision is a miss').to.be.undefined;
            expect(backing().getItem('app-config'), 'the stale entry is removed from the backing storage').to.be.null;
        });

        it('does not touch the same-named key of the other storage on eviction', () => {
            OtherPlain.save('app-config', 'keep-me');
            Versioned.save('app-config', 'v1', { theme: 'dark' });
            const loaded = Versioned.load('app-config', 'v2');
            expect(loaded, 'data saved with another revision is a miss').to.be.undefined;
            expect(other().getItem('app-config'), 'eviction removes the key from its own storage only').to.not.be.null;
        });

        it('treats a foreign value under a versioned key as a miss, not a crash', () => {
            for (const foreign of ['null', '3', '"oops"', '[1,2]']) {
                backing().setItem('app-config', foreign);
                expect(
                    Versioned.load('app-config', 'v1'),
                    'a stored value that is not a revision and data pair is a miss, not a crash',
                ).to.be.undefined;
                expect(backing().getItem('app-config'), 'the foreign value is removed like a stale revision').to.be
                    .null;
            }
        });

        it('safely pops data, removing it from storage entirely', () => {
            Plain.save('temp-key', 'ephemeral-data');

            const popped = Plain.pop('temp-key');
            expect(popped, 'pop answers the stored value').to.equal('ephemeral-data');
            expect(backing().getItem('temp-key'), 'pop removes the entry it answered').to.be.null;
        });

        it('load treats unparseable content as absent and drops it', () => {
            backing().setItem('broken', '{not json');

            expect(Plain.load('broken'), 'stored text that is not json is a miss').to.be.undefined;
            expect(backing().getItem('broken'), 'the unparseable entry is removed').to.be.null;
        });

        it('a corrupt entry does not break the versioned reader for good', () => {
            backing().setItem('app-config', 'GET@/x was truncated');

            expect(Versioned.load('app-config', 'v1'), 'a corrupt entry is a miss').to.be.undefined;

            Versioned.save('app-config', 'v1', { theme: 'dark' });
            expect(
                Versioned.load('app-config', 'v1'),
                'after the corrupt entry is dropped a new save loads back normally',
            ).to.deep.equal({ theme: 'dark' });
        });

        it('load of a missing key is undefined', () => {
            expect(Plain.load('never.saved.key'), 'a key never saved loads as undefined').to.be.undefined;
        });

        it('versioned load of a missing key is undefined without side effects', () => {
            expect(Versioned.load('never.saved.key', 'r1'), 'a key never saved is a miss for the versioned reader').to
                .be.undefined;
            expect(backing().getItem('never.saved.key'), 'a miss on a missing key leaves the storage without that key')
                .to.be.null;
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
        expect(LocalStorage.load('k'), 'a read from an unreachable storage is a miss').to.be.undefined;
        expect(LocalStorage.pop('k'), 'a pop from an unreachable storage is a miss').to.be.undefined;
        expect(
            () => LocalStorage.remove('k'),
            'a remove from an unreachable storage does nothing instead of throwing',
        ).to.not.throw();
        expect(VersionedLocalStorage.load('k', 'v1'), 'a versioned read from an unreachable storage is a miss').to.be
            .undefined;
    });

    it('writes still report the failure to their caller', () => {
        deny();
        expect(
            () => LocalStorage.save('k', 'v'),
            'a save to an unreachable storage throws so the caller learns the data was not kept',
        ).to.throw();
    });
});
