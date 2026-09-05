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
describe('corrupt entries', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('LocalStorage.load treats unparseable content as absent and drops it', () => {
        localStorage.setItem('broken', '{not json');

        expect(LocalStorage.load('broken')).to.be.undefined;
        expect(localStorage.getItem('broken')).to.be.null;
    });

    it('SessionStorage.load treats unparseable content as absent and drops it', () => {
        sessionStorage.setItem('broken', '{not json');

        expect(SessionStorage.load('broken')).to.be.undefined;
        expect(sessionStorage.getItem('broken')).to.be.null;
    });

    it('a corrupt entry does not break the versioned readers for good', () => {
        localStorage.setItem('app-config', 'GET@/x was truncated');

        expect(VersionedLocalStorage.load('app-config', 'v1')).to.be.undefined;

        //the next save is readable again
        VersionedLocalStorage.save('app-config', 'v1', { theme: 'dark' });
        expect(VersionedLocalStorage.load('app-config', 'v1')).to.deep.equal({ theme: 'dark' });
    });
});

describe('absent entries', () => {
    it('LocalStorage.load of a missing key is undefined', () => {
        expect(LocalStorage.load('never.saved.key')).to.be.undefined;
    });

    it('SessionStorage.load of a missing key is undefined', () => {
        expect(SessionStorage.load('never.saved.key')).to.be.undefined;
    });

    it('VersionedSessionStorage.load of a missing key is undefined without side effects', () => {
        expect(VersionedSessionStorage.load('never.saved.key', 'r1')).to.be.undefined;
        expect(sessionStorage.getItem('never.saved.key')).to.be.null;
    });
});
