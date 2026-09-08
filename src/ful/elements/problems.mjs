/**
 * The library's one reading of a failure: its problems' reasons, one per line,
 * or the caller's fallback when the value carries none.
 */
const problemsText = (failure, fallback = '') =>
    failure?.problems ? failure.problems.map((p) => `${p.reason}`).join('\n') : fallback;

export { problemsText };
