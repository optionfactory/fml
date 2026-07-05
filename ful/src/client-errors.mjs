/**
 * Global error and unhandled promise rejection report handler.
 * @param {any} evt - The triggered event instance (ErrorEvent or PromiseRejectionEvent).
 */
function ful_report_error(evt) {
    /**
     * Extracts the content value of a specified meta tag.
     * @param {string} name - The name attribute of the meta tag.
     * @returns {string|undefined} The content of the meta tag, or undefined if not found.
     */
    function meta_content(name) {
        var cleanName = name.replace(/["\\]/g, '\\$&');        
        /** @type {HTMLMetaElement | null} */
        var metaEl = document.querySelector('meta[name="' + cleanName + '"]');
        return metaEl ? metaEl.content : undefined;
    }

    /**
     * Resolves the configured reporting URI from the DOM script element attribute.
     * @returns {string|null} The reporting URI string, or null if missing.
     */
    function configured_report_uri() {
        /** @type {HTMLScriptElement | null} */
        var scriptEl = document.querySelector('script[data-report-client-errors-uri]');
        if (!scriptEl) {
            console && console.error && console.error("missing attribute data-report-client-errors-uri");
            return null;
        }
        return scriptEl.getAttribute('data-report-client-errors-uri');
    }

    /**
     * Extracts and splits the error stack trace into an array of lines.
     * @returns {string[]|undefined} An array of stack trace lines, or undefined if unavailable.
     */
    function split_stack() {
        if (evt.error && evt.error.stack && evt.error.stack.split) {
            return evt.error.stack.split("\n");
        }
        if (evt.reason && evt.reason.stack && evt.reason.stack.split) {
            return evt.reason.stack.split("\n");
        }
        return undefined;
    }

    /**
     * Extracts the error message from the event properties.
     * @returns {string|undefined} The extracted error message string, or undefined.
     */
    function message() {
        if (evt.message) {
            return evt.message;
        }
        if (evt.reason && evt.reason.message) {
            return evt.reason.message;
        }
        if (evt.error && evt.error.message) {
            return evt.error.message;
        }
        return undefined;
    }

    var uri = configured_report_uri();
    if (!uri) {
        return;
    }

    /** @type {Record<string, any>} */
    var headers = {
        'Content-Type': 'application/json'
    };
    
    var csrfHeader = meta_content("_csrf_header");
    if (csrfHeader) {
        headers[csrfHeader] = meta_content("_csrf");
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
                page: window.location && window.location.href ? window.location.href : "unknown",
                filename: evt.filename,
                line: evt.lineno,
                col: evt.colno,
                message: message(),
                stack: split_stack()
            })
        });
    } catch (e) {
        // nothing to do here
    }
}

window.addEventListener('error', ful_report_error);
window.addEventListener('unhandledrejection', ful_report_error);