/**
 * One problem of a failure: its `type` (a code such as `FIELD_ERROR` or
 * `GENERIC_PROBLEM`), the `context` naming the field it belongs to or null, the
 * human `reason`, and optional `details`.
 * @typedef {{ type: string; context: string?; reason: string; details: any?; }} Problem
 */
/**
 * An error carrying a list of problems rather than one message. A problem's
 * `context` names the field it belongs to, which is what lets a form show each
 * one beside its own input instead of in a banner.
 */
class Failure extends Error {
    /**
     * @param {string} message
     * @param {Problem[]} problems
     * @param {*} [cause]
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
     * Copies of the problems, each context losing the prefix where it starts with it.
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
}

export { Failure };
