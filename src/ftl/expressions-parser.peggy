{{
    import { nodes } from "./ast.mjs";
    //keyword classification lives here, not in the grammar's ordered choice: the
    //identifier rule consumes the whole word and the action decides, so no keyword
    //can grab a longer identifier's prefix. A Map, not a plain object: `in` on the
    //latter would classify inherited names such as `constructor` as keywords
    const keywords = new Map([
        ['true', true],
        ['false', false],
        ['null', null],
        ['undefined', undefined],
    ]);
}}

TemplatedRoot = TemplatedExpression*

TemplatedExpression = value:(BeginNode @ExpressionRoot EndNode) { return {type:nodes.templated.ten, value}}
	/ value:(BeginHtml @ExpressionRoot EndHtml) { return {type:nodes.templated.teh, value}}
	/ value:(BeginText @ExpressionRoot EndText) { return {type:nodes.templated.tet, value}} 
	/ value:TemplatedText { return {type:nodes.templated.tel, value}}

BeginNode = '{{{{'
EndNode = '}}}}'	
BeginHtml = '{{{'
EndHtml = '}}}'
BeginText = '{{'
EndText = '}}'

TemplatedText
    = parts:(
        $( [^\\{]+ )       // normal text
        / '\\' c:. { return c; } //escaped
        / $('{' !'{')       // single brace that isn't a delimiter
    )+ { return parts.join(''); }

ExpressionRoot
    = _ r:Expression _ { return r; }

Expression = TernaryExpression

TernaryExpression 
    = cond:ElvisExpression _ "?" _ ifTrue:TernaryExpression _ ":" _ ifFalse:TernaryExpression { return {type:nodes.ter, cond, ifTrue, ifFalse}; }
    / ElvisExpression

ElvisExpression
    = cond:NullCoalescingExpression _ "?:" _ ifFalse:ElvisExpression {return {type:nodes.elv, cond, ifFalse}; }
    / NullCoalescingExpression

NullCoalescingExpression
    = lhs:OrExpression _ "??" _ rhs:NullCoalescingExpression { return {type:nodes.nullc, lhs, rhs}; } 
    / OrExpression

OrExpression 
    = head:AndExpression tail:(_ "||" _ @rhs:AndExpression)* {
        let result = head;
        for (const rhs of tail) {
            result = {type: nodes.or, lhs: result, rhs};
        }
        return result;
    }

AndExpression
    = head:EqExpression tail:(_ "&&" _ @rhs:EqExpression)* { 
        let result = head;
        for (const rhs of tail) {
            result = {type: nodes.and, lhs: result, rhs};
        }
        return result;
    }

EqExpression
    = head:RelExpression tail:(_ op:EqualityOp _ rhs:RelExpression {return {op, rhs};})* { 
        let result = head;
        for (const element of tail) {
            result = {type: nodes.eq, op: element.op, lhs: result, rhs: element.rhs};
        }
        return result;
    }

RelExpression
    = head:NotExpression tail:(_ op:RelationalOp _ rhs:NotExpression {return {op, rhs};})* {
        let result = head;
        for (const element of tail) {
            result = {type: nodes.cmp, op: element.op, lhs: result, rhs: element.rhs};
        }
        return result;
    }


NotExpression
    = "!" _ expr:NotExpression { return {type:nodes.not, expr} }
    / Access


Access    
    = lhs:GroupingExpression _ rhs:(@AccessExpression _)+ { return {type: nodes.access, lhs, rhs} }   
    / GroupingExpression


AccessExpression 
    = AccessMember
    / AccessSubscript 
    / AccessMethodCall
    
AccessMember "member"
    = op:("?."/".") _ rhs:Word {
        return {type: nodes.member, ns: op === '?.', rhs: rhs};
    }

AccessSubscript "subscript" 
    = op:"?."? "[" _ rhs:Expression _ "]"  { 
        return {type: nodes.subscript, ns: op !== null, rhs}; 
    } 

AccessMethodCall "method-call" 
    = op:"?."? "(" _ h:(@Expression _)? t:("," _ @Expression _)* ")" { 
        return {type: nodes.method, ns: op !== null, args: h === null ? [] : [h, ...t]}; 
    }

GroupingExpression
    = "(" _ e:Expression _ ")" { return e }
    / ModuleFunctionCall
    / AnyLiteral
    / Identifier


ModuleFunctionCall "module-function-call" 
    = fn:ModuleFunction "(" _ h:(@Expression _)? t:("," _ @Expression _)* ")" {
        const args = h === null ? [] : [h, ...t];
        return {type: nodes.call, value: fn, args};
    }

AnyLiteral
    = NumberLiteral
    / StringLiteral
    / ArrayLiteral
    / DictLiteral

NumberLiteral "number-literal" 
    = value:$( '-'? ([0-9]+ ('.' [0-9]*)? / '.' [0-9]+ ) ) {
        return { type: nodes.literal, value: parseFloat(value) };
    }

StringLiteral "string-literal"
    = "'" value:$[^']* "'"  { return {type: nodes.literal, value}; }
    / '"' value:$[^"]* '"'  { return {type: nodes.literal, value}; }
    / "`" parts:(TemplateStringExpression / TemplateStringLiteral)* "`" { 
        return {type: nodes.tstring, parts}; 
    }

TemplateStringExpression "tstring-expression"
    = "{" _ expr:Expression _ "}" { 
        return expr; 
    }

TemplateStringLiteral "tstring-literal"
    = parts:(
        $([^\\`{]+)
        / "\\" c:. { return c; }
    )+ {
        return { type: nodes.literal, value: parts.join('') };
    }
    / char:$("{") { 
        return { type: nodes.literal, value: char }; 
    }

ArrayLiteral "array-literal" 
    = "[" _ h:(Expression)? _ t:("," _ @Expression _)* "]" { 
        const value = h === null ? [] : [h, ...t];
        return {type: nodes.array, value};
    }

DictLiteral "dict-literal" 
    = "{" _ h:(@StringLiteral _ ":" _ @Expression)? _ t:("," _ @StringLiteral _ ":" _ @Expression _)* "}" {
        var value = []
        if (h !== null){
            value.push(h);
        }
        value.push.apply(value, t);
        return {type: nodes.dict, value};   
    }

ModuleFunction "module-function"
    = '#' module:(@Word ':')? v:Word {
        return {type: nodes.function, module, value: v}
    }

Word
    = $([a-zA-Z$_][a-zA-Z$_0-9]*)

Identifier "identifier-or-keyword"
    = s:Word {
        return keywords.has(s)
            ? {type: nodes.literal, value: keywords.get(s)}
            : {type: nodes.symbol, value: s};
    }

EqualityOp
    = "=="
    / "!="

RelationalOp
    = ">="
    / ">"
    / "<="
    / "<"

_ "whitespaces"
    = [ \t\n\r]*

