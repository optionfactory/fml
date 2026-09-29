var complained_missing_uri = false;
/**
 * Posts a json report of an `error` or `unhandledrejection` event (page url,
 * location, message with its cause chain, stack) to the uri the script tag's
 * `data-report-client-errors-uri` names, same-origin and `keepalive`. The csrf
 * header is sent only when both `_csrf_header` and `_csrf` metas are present. A
 * missing uri is complained about once. The reporter never reports itself: a
 * failed or throwing report is dropped.
 * @param {any} evt an ErrorEvent or a PromiseRejectionEvent
 */
function ful_report_error(evt) {
    /**
     * @param {string} name
     * @returns {string|undefined}
     */
    function meta_content(name) {
        var cleanName = name.replace(/["\\]/g, '\\$&');
        /** @type {HTMLMetaElement | null} */
        var metaEl = document.querySelector(`meta[name="${cleanName}"]`);
        return metaEl ? metaEl.content : undefined;
    }

    /** @returns {string|null} */
    function configured_report_uri() {
        /** @type {HTMLScriptElement | null} */
        var scriptEl = document.querySelector('script[data-report-client-errors-uri]');
        if (!scriptEl) {
            if (!complained_missing_uri) {
                complained_missing_uri = true;
                console?.error?.('missing attribute data-report-client-errors-uri');
            }
            return null;
        }
        return scriptEl.getAttribute('data-report-client-errors-uri');
    }

    /** @returns {string[]|undefined} */
    function split_stack() {
        if (evt.error?.stack?.split) {
            return evt.error.stack.split('\n');
        }
        if (evt.reason?.stack?.split) {
            return evt.reason.stack.split('\n');
        }
        return undefined;
    }

    /**
     * The message followed by up to five `Caused by:` lines, stopping at a cause
     * with no message or one already seen.
     * @returns {string|undefined}
     */
    function message() {
        const thrown = evt.reason ?? evt.error;
        const head = evt.message ?? thrown?.message;
        if (!head) {
            return undefined;
        }
        const parts = [head];
        const seen = [];
        for (let e = thrown?.cause; e && parts.length < 6 && seen.indexOf(e) === -1; e = e.cause) {
            seen.push(e);
            if (!e.message) {
                break;
            }
            parts.push(`Caused by: ${e.message}`);
        }
        if (thrown?.truncated) {
            parts.push('Caused by: … outer frames omitted');
        }
        return parts.join('\n');
    }

    var uri = configured_report_uri();
    if (!uri) {
        return;
    }

    /** @type {Record<string, any>} */
    var headers = {
        'Content-Type': 'application/json',
    };

    var csrfHeader = meta_content('_csrf_header');
    var csrfToken = meta_content('_csrf');
    if (csrfHeader && csrfToken) {
        headers[csrfHeader] = csrfToken;
    }

    try {
        fetch(uri, {
            method: 'POST',
            mode: 'same-origin',
            cache: 'no-cache',
            credentials: 'same-origin',
            keepalive: true,
            headers: headers,
            redirect: 'error',
            referrerPolicy: 'no-referrer-when-downgrade',
            body: JSON.stringify({
                page: window.location?.href ? window.location.href : 'unknown',
                filename: evt.filename,
                line: evt.lineno,
                col: evt.colno,
                message: message(),
                stack: split_stack(),
            }),
        }).catch(() => {});
    } catch {}
}

window.addEventListener('error', ful_report_error);
window.addEventListener('unhandledrejection', ful_report_error);
