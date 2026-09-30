import { assert } from 'chai';
import { AsyncEvents } from '../../../src/ful/index.mjs';
import { SectionRequests } from '../../../src/ful/events/sections.mjs';
import { appended } from '../../harness.mjs';

const frames = async () => {
    for (let i = 0; i !== 3; ++i) {
        await new Promise((r) => requestAnimationFrame(() => r()));
    }
};
const rejection = (promise) =>
    promise.then(
        () => assert.fail('the request rejects'),
        (e) => e,
    );

describe('SectionRequests', () => {
    let container;
    let host;
    let section;
    let requests;

    beforeEach(() => {
        container = appended('<div><section>the content</section></div>');
        host = container.firstElementChild;
        section = host.firstElementChild;
        requests = new SectionRequests();
    });

    it('fires the generic, #index and :name events from the host, in that order, sharing one detail', async () => {
        const seen = [];
        for (const type of ['section:requested', 'section:requested:#1', 'section:requested:two']) {
            AsyncEvents.asyncOn(host, type, (e) => {
                const { name, index, first } = e.detail;
                seen.push(`${e.type}|${name}|${index}|${first}|${e.detail.section === section}|${e.target === host}`);
            });
        }

        await requests.request(host, section, 'two', 1);

        assert.deepStrictEqual(
            seen,
            [
                'section:requested|two|1|true|true|true',
                'section:requested:#1|two|1|true|true|true',
                'section:requested:two|two|1|true|true|true',
            ],
            'the generic, index and name events fire in that order from the host, each with the same detail',
        );
    });

    it('bubbles, a listener above the host answering it', async () => {
        AsyncEvents.asyncOn(container, 'section:requested', () => 'from above');

        const answers = await requests.request(host, section, null, null);

        assert.strictEqual(
            answers.join(','),
            'from above',
            'the events bubble, so a listener on an ancestor of the host answers',
        );
    });

    it('fires the index event for index 0 and skips the families it has no key for', async () => {
        const types = [];
        const record = (e) => types.push(e.type);
        AsyncEvents.asyncOn(host, 'section:requested', record);
        AsyncEvents.asyncOn(host, 'section:requested:#0', record);

        await requests.request(host, section, null, 0);
        await requests.request(host, section, null, null);

        assert.strictEqual(
            types.join(','),
            'section:requested,section:requested:#0,section:requested',
            'index 0 fires its index event, and a null index or name fires no event of that family',
        );
    });

    it('answers undefined when nobody listened, painting nothing', async () => {
        const answered = await requests.request(host, section, 'two', 1);

        assert.isUndefined(answered, 'a request nobody listened to resolves undefined');
        assert.isFalse(section.hasAttribute('loading'), 'with no answer to wait for the section is not marked loading');
        assert.isNull(section.querySelector('.ful-section-error'), 'with no answer there is no failure to paint');
        assert.strictEqual(section.textContent, 'the content', 'the section content is left untouched');
    });

    it('keeps first true until a request is answered, per section', async () => {
        await requests.request(host, section, null, null);
        const firsts = [];
        AsyncEvents.asyncOn(host, 'section:requested', (e) => firsts.push(`${e.detail.first}`));

        await requests.request(host, section, null, null);
        await requests.request(host, section, null, null);
        const other = document.createElement('section');
        host.append(other);
        await requests.request(host, other, null, null);

        assert.strictEqual(firsts.join(','), 'true,false,true', 'the unanswered request did not spend it');
    });

    it('resolves with the answers in the order they were attached, across the families', async () => {
        const later = (value, ms) => () => new Promise((r) => setTimeout(() => r(value), ms));
        AsyncEvents.asyncOn(host, 'section:requested', later('generic', 30));
        AsyncEvents.asyncOn(host, 'section:requested', later('generic again', 20));
        AsyncEvents.asyncOn(host, 'section:requested:#1', later('index', 10));
        AsyncEvents.asyncOn(host, 'section:requested:two', later('named', 0));

        const answers = await requests.request(host, section, 'two', 1);

        assert.strictEqual(
            answers.join(','),
            'generic,generic again,index,named',
            'answers come in the order they were attached, not the order they settle in',
        );
    });

    it('marks the section loading and busy from the next frame while an answer pends', async () => {
        const { promise, resolve } = Promise.withResolvers();
        AsyncEvents.asyncOn(host, 'section:requested', () => promise);

        const requested = requests.request(host, section, null, null);
        await frames();
        assert.isTrue(
            section.hasAttribute('loading'),
            'from the next frame a pending answer marks the section loading',
        );
        assert.strictEqual(
            section.getAttribute('aria-busy'),
            'true',
            'a pending answer marks the section busy for assistive technology',
        );

        resolve();
        await requested;
        assert.isFalse(section.hasAttribute('loading'), 'the loading attribute is removed once the answer settles');
        assert.isFalse(section.hasAttribute('aria-busy'), 'aria-busy is removed once the answer settles');
    });

    it('shows no loading state for an answer settling before the frame', async () => {
        let marked = 0;
        const observer = new MutationObserver(() => ++marked);
        observer.observe(section, { attributes: true, attributeFilter: ['loading', 'aria-busy'] });
        AsyncEvents.asyncOn(host, 'section:requested', () => undefined);

        await requests.request(host, section, null, null);
        await frames();
        observer.disconnect();

        assert.strictEqual(marked, 0, 'an answer settling before the next frame never writes loading or aria-busy');
    });

    it('paints a failure as an alert holding its reasons one per line, and rethrows it', async () => {
        const failure = { problems: [{ reason: 'must not be blank' }, { reason: 'start is after end' }] };
        AsyncEvents.asyncOn(host, 'section:requested', () => {
            throw failure;
        });

        const thrown = await rejection(requests.request(host, section, null, null));

        assert.isTrue(thrown === failure, 'the failure travels to the caller');
        const error = section.firstElementChild;
        assert.isTrue(error.classList.contains('ful-section-error'), 'the error leads the section');
        assert.strictEqual(error.getAttribute('role'), 'alert', 'the error has the alert role so it is announced');
        assert.strictEqual(
            error.textContent,
            'must not be blank\nstart is after end',
            'the error holds the reasons of the failure problems, one per line',
        );
        assert.include(section.textContent, 'the content', 'the content stays beside the error');
    });

    it('paints the message of a failure that carries no problems, replacing the previous error', async () => {
        AsyncEvents.asyncOn(host, 'section:requested', () => {
            throw new Error('boom');
        });

        await rejection(requests.request(host, section, null, null));
        await rejection(requests.request(host, section, null, null));

        const errors = section.querySelectorAll('.ful-section-error');
        assert.strictEqual(errors.length, 1, 'a new failure removes the previous error before painting its own');
        assert.strictEqual(errors[0].textContent, 'boom', 'a failure with no problems is painted with its message');
    });

    it('removes the previous error when an answered request starts, and not otherwise', async () => {
        const failing = AsyncEvents.asyncOn(host, 'section:requested', () => {
            throw new Error('boom');
        });
        await rejection(requests.request(host, section, null, null));
        AsyncEvents.asyncOff(host, 'section:requested', failing);

        await requests.request(host, section, null, null);
        assert.isNotNull(section.querySelector('.ful-section-error'), 'a request nobody answered leaves it');

        const pending = Promise.withResolvers();
        AsyncEvents.asyncOn(host, 'section:requested', () => pending.promise);
        const retrying = requests.request(host, section, null, null);
        assert.isNull(section.querySelector('.ful-section-error'), 'the stale error leaves before the wait');
        pending.resolve();
        await retrying;
    });

    it('leaves the chrome to a newer request once superseded', async () => {
        const answers = [Promise.withResolvers(), Promise.withResolvers()];
        let calls = 0;
        AsyncEvents.asyncOn(host, 'section:requested', () => answers[calls++].promise);

        const stale = rejection(requests.request(host, section, null, null));
        const fresh = requests.request(host, section, null, null);
        await frames();
        answers[0].reject(new Error('stale'));
        await stale;

        assert.isNull(section.querySelector('.ful-section-error'), 'the superseded failure is not painted');
        assert.isTrue(section.hasAttribute('loading'), 'the newer request still owns the loading state');

        answers[1].resolve();
        await fresh;
        assert.isFalse(
            section.hasAttribute('loading'),
            'the newer request clears the loading state when its answer settles',
        );
    });
});
