import { expect } from 'chai';
import { VersionedLocalStorage, VersionedSessionStorage, LocalStorage, SessionStorage } from '../../src/ful/storage.mjs';

describe('VersionedLocalStorage', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('saves and successfully loads data with matching revisions', () => {
        VersionedLocalStorage.save('app-config', 'v1', { theme: 'dark' });        
        const loaded = VersionedLocalStorage.load('app-config', 'v1');
        expect(loaded).to.deep.equal({ theme: 'dark' });
    });

    it('returns undefined and evicts stale data if revisions mismatch', () => {
        VersionedLocalStorage.save('app-config', 'v1', { theme: 'dark' });
        const loaded = VersionedLocalStorage.load('app-config', 'v2');
        expect(loaded).to.be.undefined;
        expect(localStorage.getItem('app-config')).to.be.null; 
    });

    it('safely pops data, removing it from storage entirely', () => {
        LocalStorage.save('temp-key', 'ephemeral-data');
        
        const popped = LocalStorage.pop('temp-key');
        expect(popped).to.equal('ephemeral-data');
        expect(localStorage.getItem('temp-key')).to.be.null; 
    });
});

describe('VersionedSessionStorage', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('saves and successfully loads data with matching revisions', () => {
        VersionedSessionStorage.save('app-config', 'v1', { theme: 'dark' });
        const loaded = VersionedSessionStorage.load('app-config', 'v1');
        expect(loaded).to.deep.equal({ theme: 'dark' });
    });

    it('returns undefined and evicts stale data from sessionStorage if revisions mismatch', () => {
        VersionedSessionStorage.save('app-config', 'v1', { theme: 'dark' });
        const loaded = VersionedSessionStorage.load('app-config', 'v2');
        expect(loaded).to.be.undefined;
        expect(sessionStorage.getItem('app-config')).to.be.null;
    });

    it('does not touch same-named localStorage keys on eviction', () => {
        LocalStorage.save('app-config', 'keep-me');
        VersionedSessionStorage.save('app-config', 'v1', { theme: 'dark' });
        const loaded = VersionedSessionStorage.load('app-config', 'v2');
        expect(loaded).to.be.undefined;
        expect(localStorage.getItem('app-config')).to.not.be.null;
    });

    it('safely pops data, removing it from storage entirely', () => {
        SessionStorage.save('temp-key', 'ephemeral-data');

        const popped = SessionStorage.pop('temp-key');
        expect(popped).to.equal('ephemeral-data');
        expect(sessionStorage.getItem('temp-key')).to.be.null;
    });
});