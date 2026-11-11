export { isExpressionText, parseExpression, formatExpression };

import { isOperator } from '@/utils/expr';

/**
 * The string syntax of the expressions of expr.js, e.g. "@a + 1" of
 * { "+": ["@a", 1] }, see spec/expressions.md (String syntax). A text of a
 * definition which starts with "=" or "@" is an expression
 * (isExpressionText), other texts are texts. A leading "=" is left out, so
 * "=@a + 1" and "@a + 1" are the same expression.
 *
 * The grammar, from the loosest to the tightest:
 * - `c ? a : b` is { "if": [c, a, b] }, the else branch may be another one
 * - `a or b`, `a and b`, a run of the same operator is one operator of all
 *   of its operands, e.g. `a or b or c` is { "or": [a, b, c] }
 * - `not a`
 * - `== != < <= > >=`, a chain of the same operator is one operator, e.g.
 *   `0 < @x < 10` is { "<": [0, "@x", 10] }, mixed ones nest from the left
 * - `+ -`, then `* /`, runs of the same operator are one operator, e.g.
 *   `a - b - c` is { "-": [a, b, c] }, mixed ones nest from the left, e.g.
 *   `a - b + c` is { "+": [{ "-": [a, b] }, c] }
 * - `-a` is { "-": [a] }, a number after it is a negative number
 * - the values: numbers (as in JSON), texts in single or double quotes
 *   with the escapes of JSON and \', `true`, `false`, `null`, references
 *   `@name`, `(a)`, lists `[a, b]`, objects `{ key: a, ... }` (keys are
 *   words, numbers or quoted texts) and calls `name(a, b)` of the
 *   operators which are words: min, max, round, cat, format, if, steps,
 *   match, var, literal, and, or, not (`not(a)`, without a space before the
 *   parenthesis, is the call, `not (a)` is `not` of `(a)`).
 *
 * An object is an object of the AST, e.g. the table of steps or match or a
 * nested prop, so an object of one key which is an operator is that
 * operator, as in JSON. A quoted text starting with "@" is { "literal":
 * "@..." }, so it is no reference; the argument of literal is data, in it
 * quoted texts are texts, and the first argument of var is the name.
 *
 * The name of a reference is letters (of any script), digits, "_", ":" and
 * ".", and a "-" if a letter follows it, so "@stroke-width" is one name,
 * "@a-1" is @a minus 1 and "@a-@b" is @a minus @b.
 *
 * formatExpression is the inverse, a text of an AST with as few parentheses
 * as needed, parseExpression of it is the AST again, with the arguments of
 * an operator as a list, e.g. { "not": ["@a"] } of { "not": "@a" }. The
 * name of a reference which is no name of the syntax is a `var`, e.g.
 * var('a b') of "@a b".
 */

// the operators which are called by their name, e.g. min(1, @a)
const callable = new Set(['min', 'max', 'round', 'cat', 'format', 'if', 'steps', 'match', 'var', 'literal', 'and', 'or', 'not']);
// the words of values
const constants = { true: true, false: false, null: null };
// the operators of two or more operands between them, by their level, the
// loosest first; `-` of one operand is the unary minus (level 7), the
// values and calls are level 8
const levels = { 'or': 1, 'and': 2, '==': 4, '!=': 4, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6 };

// the name of a reference after "@", also a "-" if a letter follows it
const namePattern = /(?:[\p{L}\d_:.]|-(?=\p{L}))+/uy;
const wholeName = /^(?:[\p{L}\d_:.]|-(?=\p{L}))+$/u;
// a word: a call, `and`, `or`, `not`, a constant or a key of an object
const wordPattern = /[\p{L}_][\p{L}\d_]*/uy;
const wholeWord = /^[\p{L}_][\p{L}\d_]*$/u;
// a number as in JSON, without the sign
const numberPattern = /\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
// the punctuation, the longer ones first
const puncts = ['==', '!=', '<=', '>=', '(', ')', '[', ']', '{', '}', ',', ':', '?', '+', '-', '*', '/', '<', '>'];
// the escapes of quoted texts, the ones of JSON and \'
const escapes = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '\\': '\\', '/': '/', "'": "'", '"': '"' };

// a text of a definition which is an expression, not a text: "=..." or a
// reference "@name" (also an expression starting with one)
// the levels of nesting of an expression (parentheses, lists, objects,
// calls, runs of not and of -), deeper ones are an error instead of a stack
// overflow of the parser and of the evaluation
const maxDepth = 100;

const isExpressionText = s => typeof s == 'string' && (s.startsWith('=') || s.startsWith('@'));

// the tokens of the text from `start`: { type, value, pos, end }, the last
// one the end; a quoted text is read with its escapes, a number as a number
const tokenize = (text, start, fail) => {
    const tokens = [];
    let i = start;
    while (i < text.length) {
        const c = text[i];
        if (/\s/.test(c)) {
            i++;
            continue;
        }
        if (c == '@') {
            namePattern.lastIndex = i + 1;
            const m = namePattern.exec(text);
            if (!m)
                fail('expected a name after "@"', i + 1);
            tokens.push({ type: 'ref', value: m[0], pos: i, end: namePattern.lastIndex });
            i = namePattern.lastIndex;
            continue;
        }
        if (c == '"' || c == "'") {
            let s = '';
            let j = i + 1;
            for (;; j++) {
                if (j >= text.length)
                    fail('unterminated text', i);
                const d = text[j];
                if (d == c)
                    break;
                if (d != '\\') {
                    s += d;
                    continue;
                }
                const e = text[++j];
                if (e == 'u') {
                    const hex = text.substring(j + 1, j + 5);
                    if (!/^[0-9a-fA-F]{4}$/.test(hex))
                        fail('expected four hex digits after "\\u"', j + 1);
                    s += String.fromCharCode(parseInt(hex, 16));
                    j += 4;
                } else if (Object.hasOwn(escapes, e ?? ''))
                    s += escapes[e];
                else
                    fail(`unknown escape "\\${e ?? ''}"`, j - 1);
            }
            tokens.push({ type: 'string', value: s, pos: i, end: j + 1 });
            i = j + 1;
            continue;
        }
        numberPattern.lastIndex = i;
        let m = numberPattern.exec(text);
        if (m) {
            tokens.push({ type: 'number', value: Number(m[0]), pos: i, end: numberPattern.lastIndex });
            i = numberPattern.lastIndex;
            continue;
        }
        wordPattern.lastIndex = i;
        m = wordPattern.exec(text);
        if (m) {
            tokens.push({ type: 'word', value: m[0], pos: i, end: wordPattern.lastIndex });
            i = wordPattern.lastIndex;
            continue;
        }
        const p = puncts.find(p => text.startsWith(p, i));
        if (!p)
            fail(`unexpected character "${c}"`, i);
        tokens.push({ type: 'punct', value: p, pos: i, end: i + p.length });
        i += p.length;
    }
    tokens.push({ type: 'end', pos: text.length, end: text.length });
    return tokens;
};

/**
 * The expression (the JSON form of expr.js) of its text, e.g. { "+": ["@a",
 * 1] } of "@a + 1" or "=@a + 1", "@a" of "@a". An error names the text and
 * the position (from 0) of the problem, e.g. `expression "@a +": unexpected
 * end at 4`.
 */
const parseExpression = text => {
    if (typeof text != 'string')
        throw new Error(`expression ${JSON.stringify(text)}: no text`);
    const fail = (message, pos) => {
        throw new Error(`expression ${JSON.stringify(text)}: ${message} at ${pos}`);
    };
    const tokens = tokenize(text, text.startsWith('=') ? 1 : 0, fail);
    let i = 0;
    let depth = 0;
    // a level deeper, at the position of the token
    const nested = fn => {
        if (++depth > maxDepth)
            fail(`nested deeper than ${maxDepth} levels`, tokens[i].pos);
        try {
            return fn();
        } finally {
            depth--;
        }
    };
    const peek = () => tokens[i];
    const next = () => tokens[i++];
    const is = (type, value) => tokens[i].type == type && (value === undefined || tokens[i].value === value);
    const isPunct = value => is('punct', value);
    const describe = t => t.type == 'end' ? 'end' : `"${text.substring(t.pos, t.end)}"`;
    const expect = value => {
        if (is('end'))
            fail('unexpected end', peek().pos);
        if (!isPunct(value))
            fail(`expected "${value}", not ${describe(peek())}`, peek().pos);
        return next();
    };

    // the items up to the closing punctuation, separated by commas, e.g. the
    // arguments of a call, `item(index)` reads one
    const items = (close, item) => {
        const list = [];
        if (!isPunct(close)) {
            list.push(item(0));
            while (isPunct(',')) {
                next();
                list.push(item(list.length));
            }
        }
        expect(close);
        return list;
    };

    // `raw`: the text is data (the argument of literal), quoted texts are
    // texts, also starting with "@"

    // the operators of a level between their operands, a run of the same
    // operator is one operator of all of its operands, other ones nest from
    // the left
    const binary = (type, ops, below, raw) => {
        let left = below(raw);
        let op;
        while (tokens[i].type == type && ops.includes(tokens[i].value)) {
            const t = next();
            const right = below(raw);
            if (t.value === op)
                left[op].push(right);
            else {
                op = t.value;
                left = { [op]: [left, right] };
            }
        }
        return left;
    };
    const ternary = raw => nested(() => {
        const c = or(raw);
        if (!isPunct('?'))
            return c;
        next();
        const a = ternary(raw);
        expect(':');
        const b = ternary(raw);
        return { if: [c, a, b] };
    });
    const or = raw => binary('word', ['or'], and, raw);
    const and = raw => binary('word', ['and'], not, raw);
    // `not(` without a space is a call
    const not = raw => {
        const t = tokens[i + 1];
        if (is('word', 'not') && !(t.type == 'punct' && t.value == '(' && t.pos == peek().end)) {
            next();
            return nested(() => ({ not: [not(raw)] }));
        }
        return comparison(raw);
    };
    const comparison = raw => binary('punct', ['==', '!=', '<', '<=', '>', '>='], additive, raw);
    const additive = raw => binary('punct', ['+', '-'], multiplicative, raw);
    const multiplicative = raw => binary('punct', ['*', '/'], unary, raw);
    const unary = raw => {
        if (!isPunct('-'))
            return primary(raw);
        next();
        if (is('number')) {
            const v = next().value;
            return v === 0 ? 0 : -v;
        }
        return nested(() => ({ '-': [unary(raw)] }));
    };
    const call = (t, raw) => {
        const name = t.value;
        if (!callable.has(name))
            fail(`unknown function "${name}"`, t.pos);
        next();
        // the argument of literal is data, the first one of var a name
        const args = items(')', index => ternary(raw || name == 'literal' || (name == 'var' && index == 0)));
        if (name != 'literal')
            return { [name]: args };
        if (args.length != 1)
            fail('expected one argument of literal', t.pos);
        return { literal: args[0] };
    };
    // the key of an object: a word, a number (as its text, e.g. "1" of 1.0)
    // or a quoted text
    const key = () => {
        const t = next();
        if (t.type == 'word' || t.type == 'string')
            return t.value;
        if (t.type == 'number')
            return String(t.value);
        if (t.type == 'punct' && t.value == '-' && is('number'))
            return String(-next().value);
        if (t.type == 'end')
            fail('unexpected end', t.pos);
        fail(`expected a key, not ${describe(t)}`, t.pos);
    };
    const object = raw => Object.fromEntries(items('}', () => {
        const k = key();
        expect(':');
        return [k, ternary(raw)];
    }));
    const primary = raw => {
        const t = next();
        switch (t.type) {
            case 'number':
                return t.value;
            case 'string':
                return !raw && t.value.startsWith('@') ? { literal: t.value } : t.value;
            case 'ref':
                return `@${t.value}`;
            case 'word':
                if (isPunct('('))
                    return call(t, raw);
                if (Object.hasOwn(constants, t.value))
                    return constants[t.value];
                if (t.value == 'and' || t.value == 'or' || t.value == 'not')
                    fail(`unexpected "${t.value}"`, t.pos);
                if (callable.has(t.value))
                    fail(`expected "(" after "${t.value}"`, t.end);
                fail(`unknown word "${t.value}", a reference is "@${t.value}"`, t.pos);
                break;
            case 'punct':
                if (t.value == '(') {
                    const e = ternary(raw);
                    expect(')');
                    return e;
                }
                if (t.value == '[')
                    return items(']', () => ternary(raw));
                if (t.value == '{')
                    return object(raw);
                fail(`unexpected "${t.value}"`, t.pos);
                break;
            case 'end':
                fail('unexpected end', t.pos);
        }
    };

    const e = ternary(false);
    if (!is('end'))
        fail(`unexpected ${describe(peek())}`, peek().pos);
    return e;
};

const escaped = { '\\': '\\\\', "'": "\\'", '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' };
// a text in single quotes
const quote = s => `'${s.replace(/[\\'\u0000-\u001f]/g, c => escaped[c] ?? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}'`;
// the key of an object, quoted unless it is a word or the text of a finite
// number, e.g. '-Infinity', which is no key of the syntax
const keyText = k => wholeWord.test(k) || (String(Number(k)) === k && Number.isFinite(Number(k))) ? k : quote(k);

// an operator of the name, e.g. the left operand of a run of the operator
const sameOp = (ast, op) => isOperator(ast) && Object.keys(ast)[0] == op;

// the text of an expression and the level of its outermost operator, in
// parentheses if its level is below `level`, raw of data (in literal)
const formatted = (ast, level, raw = false) => {
    const [text, own] = node(ast, raw);
    return own < level ? `(${text})` : text;
};

const node = (ast, raw) => {
    if (typeof ast == 'string') {
        if (!raw && ast.startsWith('@')) {
            const name = ast.substring(1);
            return [wholeName.test(name) ? `@${name}` : `var(${quote(name)})`, 8];
        }
        return [quote(ast), 8];
    }
    if (typeof ast == 'number') {
        if (!Number.isFinite(ast))
            throw new Error(`expression ${ast}: no text of it`);
        return [String(ast), 8];
    }
    if (ast === null || typeof ast == 'boolean')
        return [String(ast), 8];
    if (typeof ast != 'object')
        throw new Error(`expression of ${typeof ast}: no text of it`);
    if (Array.isArray(ast))
        return [`[${ast.map(e => formatted(e, 0, raw)).join(', ')}]`, 8];
    if (raw || !isOperator(ast))
        return [`{${Object.entries(ast).map(([k, v]) => `${keyText(k)}: ${formatted(v, 0, raw)}`).join(', ')}}`, 8];
    const op = Object.keys(ast)[0];
    if (op == 'literal') {
        const v = ast[op];
        return typeof v == 'string' && v.startsWith('@') ? [quote(v), 8] : [`literal(${formatted(v, 0, true)})`, 8];
    }
    const args = Array.isArray(ast[op]) ? ast[op] : [ast[op]];
    if (op == 'if' && args.length == 3)
        return [`${formatted(args[0], 1)} ? ${formatted(args[1], 1)} : ${formatted(args[2], 0)}`, 0];
    if (op == 'not' && args.length == 1)
        return [`not ${formatted(args[0], 3)}`, 3];
    if (op == '-' && args.length == 1)
        return [typeof args[0] == 'number' ? `-(${args[0]})` : `-${formatted(args[0], 8)}`, 7];
    const level = levels[op];
    if (level !== undefined && args.length >= 2)
        return [args.map((a, i) => formatted(a, i == 0 && !sameOp(a, op) ? level : level + 1)).join(` ${op} `), level];
    if (!callable.has(op))
        throw new Error(`expression ${JSON.stringify(ast)}: no text of "${op}" of ${args.length} argument${args.length == 1 ? '' : 's'}`);
    return [`${op}(${args.map((a, i) => formatted(a, 0, op == 'var' && i == 0)).join(', ')})`, 8];
};

/**
 * The text of an expression (the JSON form of expr.js), e.g. "@a + 1" of
 * { "+": ["@a", 1] }, "@a" of "@a", "'@a'" of { "literal": "@a" }, the
 * operators between their operands, `c ? a : b` of an if of three
 * arguments, calls of the others, e.g. "min(@a, 1)", texts in single
 * quotes; without a leading "=". An expression which has no text, e.g. a
 * "+" of one argument, is an error.
 */
const formatExpression = ast => node(ast, false)[0];
