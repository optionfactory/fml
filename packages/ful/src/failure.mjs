

/**
 * @typedef {{ type: string; context: string?; reason: string; details: any?; }} Problem
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
    dropping(prefix){
        return new Failure(this.message, Failure.dropProblemsContext(this.problems, prefix), this);
    }
    static dropProblemsContext(problems, prefix){
        return problems.map(({type, context, reason, details}) => {
            const nctx = context?.startsWith(prefix) ? context.substring(prefix.length) : context;
            return {type, context: nctx, reason, details};
        })
    }

}

export { Failure };