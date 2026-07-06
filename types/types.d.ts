declare module '*.peggy' {
    /**
     * Parses an FTL expression string into an Abstract Syntax Tree (AST).
     */
    export function parse(expression: string, options?: { startRule?: string }): any;
}

declare module '*.css' {
    const content: any;
    export default content;
}
