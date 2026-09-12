/**
 * @typedef {{ type: string; context: string?; reason: string; details: any?; }} Problem
 */
/**
 * An error carrying a list of problems rather than one message. A problem's
 * `context` names the field it belongs to, which is what lets a form show each
 * one beside its own input instead of in a banner.
 */
class Failure extends Error {
    /**
     *
     * @param {string} message
     * @param {Problem[]} problems
     * @param {*} cause
     */
    constructor(message, problems, cause) {
        super(message, { cause });
        this.name = 'Failure';
        this.problems = problems;
    }
    /**
     * Returns a copy whose problems' contexts have the prefix removed, so a
     * caller can rethrow namespaced problems as its own.
     * @param {string} prefix
     * @returns {Failure}
     */
    dropping(prefix) {
        return new Failure(this.message, Failure.dropProblemsContext(this.problems, prefix), this);
    }
    /**
     * @param {Problem[]} problems
     * @param {string} prefix
     * @returns {Problem[]}
     */
    static dropProblemsContext(problems, prefix) {
        return problems.map(({ type, context, reason, details }) => {
            const nctx = context?.startsWith(prefix) ? context.substring(prefix.length) : context;
            return { type, context: nctx, reason, details };
        });
    }
    /**
     * The one reading of a failure: its problems' reasons, one per line, or
     * the fallback when the value carries none. An empty problems array
     * carries nothing: the failure's own message reads instead.
     *
     * @param {any} cause
     * @param {string|null} [fallback]
     * @returns {string}
     */
    static problemsText(cause, fallback = null) {
        if (cause?.problems?.length) {
            return cause.problems.map((p) => `${p.reason}`).join('\n');
        }
        return fallback ?? `${cause?.message ?? cause}`;
    }
}

export { Failure };
