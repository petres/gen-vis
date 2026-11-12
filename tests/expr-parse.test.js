import { describe, test, expect } from 'vitest';
import { isExpressionText, parseExpression, formatExpression } from '@/utils/expr-parse';
import { bind, evaluate, formatter, isOperator } from '@/utils/expr';
import { format } from 'd3-format';

// the fixtures of spec/expressions by the name of their file, the ASTs of
// evaluate (`expr`, `scope`, `result`) and the texts of the syntax (`text`)
const files = import.meta.glob('../spec/expressions/*.json', { eager: true, import: 'default' });
const fixtures = Object.entries(files).map(([file, cases]) => [file.split('/').pop().replace(/\.json$/, ''), cases]);
const syntax = files['../spec/expressions/syntax.json'];
const format3 = spec => format(spec);
const scopeOf = c => ({ ...c.scope, [formatter]: format3 });

// no value is null in JSON, undefined in JS
const plain = v => v === undefined ? null : Array.isArray(v) ? v.map(plain)
    : v !== null && typeof v == 'object' ? Object.fromEntries(Object.entries(v).map(([k, e]) => [k, plain(e)])) : v;

// the AST as parseExpression returns it: the arguments of an operator as a
// list, e.g. { "not": ["@a"] } of { "not": "@a" }, the argument of literal
// as it is
const canonical = ast => {
    if (Array.isArray(ast))
        return ast.map(canonical);
    if (ast === null || typeof ast != 'object')
        return ast;
    if (isOperator(ast)) {
        const op = Object.keys(ast)[0];
        return op == 'literal' ? ast : { [op]: (Array.isArray(ast[op]) ? ast[op] : [ast[op]]).map(canonical) };
    }
    return Object.fromEntries(Object.entries(ast).map(([k, v]) => [k, canonical(v)]));
};

describe('the fixtures of the syntax', () => {
    test.each(syntax.filter(c => c.error === undefined).map(c => [c.name, c]))('%s', (name, c) => {
        const parsed = parseExpression(c.text);
        expect(parsed).toEqual(c.expr);
        if (c.result !== undefined) {
            expect(plain(evaluate(parsed, scopeOf(c)))).toEqual(c.result);
            expect(plain(evaluate(c.expr, scopeOf(c)))).toEqual(c.result);
        }
        // the text of the AST is the AST again
        const text = formatExpression(c.expr);
        expect(parseExpression(text)).toEqual(canonical(c.expr));
        if (c.result !== undefined)
            expect(plain(evaluate(parseExpression(text), scopeOf(c)))).toEqual(c.result);
    });

    test.each(syntax.filter(c => c.error !== undefined).map(c => [c.name, c]))('%s', (name, c) => {
        expect(() => parseExpression(c.text)).toThrow(c.error);
    });

    test('the fixtures cover the constructs', () => {
        expect(syntax.length).toBeGreaterThanOrEqual(40);
        expect(syntax.filter(c => c.error !== undefined).length).toBeGreaterThanOrEqual(5);
    });
});

describe('the texts of the other fixtures of expressions are their ASTs again', () => {
    describe.each(fixtures.filter(([file]) => file != 'syntax'))('%s', (file, cases) => {
        test.each(cases.map(c => [c.name, c]))('%s', (name, c) => {
            const text = formatExpression(c.expr);
            const parsed = parseExpression(text);
            expect(parsed).toEqual(canonical(c.expr));
            expect(plain(evaluate(parsed, scopeOf(c)))).toEqual(c.result);
        });
    });
});

describe('isExpressionText', () => {
    test('texts starting with = or @ are expressions, others are texts', () => {
        expect(isExpressionText('=1 + 1')).toBe(true);
        expect(isExpressionText('@a')).toBe(true);
        expect(isExpressionText('@a + 1')).toBe(true);
        expect(isExpressionText('none')).toBe(false);
        expect(isExpressionText('a = b')).toBe(false);
        expect(isExpressionText('')).toBe(false);
        expect(isExpressionText(3)).toBe(false);
        expect(isExpressionText(null)).toBe(false);
    });
});

describe('parseExpression', () => {
    test('a leading = is left out, also of a reference', () => {
        expect(parseExpression('=@a')).toBe('@a');
        expect(parseExpression('@a')).toBe('@a');
        expect(parseExpression('= 1')).toBe(1);
    });

    test('a - is part of a name only before a letter', () => {
        expect(parseExpression('@a-b')).toBe('@a-b');
        expect(parseExpression('@a-1')).toEqual({ '-': ['@a', 1] });
        expect(parseExpression('@a-@b')).toEqual({ '-': ['@a', '@b'] });
        expect(parseExpression('@a - @b')).toEqual({ '-': ['@a', '@b'] });
        expect(parseExpression('@a--@b')).toEqual({ '-': ['@a', { '-': ['@b'] }] });
        expect(() => parseExpression('@a--b')).toThrow('unknown word "b"');
        expect(parseExpression('@a-ß')).toBe('@a-ß');
    });

    test('a negative number is a number, the unary minus of a number in parentheses is an operator', () => {
        expect(parseExpression('=-5')).toBe(-5);
        expect(parseExpression('=- 5')).toBe(-5);
        expect(parseExpression('=-(5)')).toEqual({ '-': [5] });
        expect(parseExpression('=1 - -5')).toEqual({ '-': [1, -5] });
        expect(parseExpression('=-0')).toBe(0);
    });

    test('a run of the same operator is one operator, parentheses keep the nesting', () => {
        expect(parseExpression('=1 + 2 + 3 + 4')).toEqual({ '+': [1, 2, 3, 4] });
        expect(parseExpression('=1 + (2 + 3)')).toEqual({ '+': [1, { '+': [2, 3] }] });
        expect(parseExpression('=1 < 2 < 3 < 4')).toEqual({ '<': [1, 2, 3, 4] });
        expect(parseExpression('=(1 == 2) < 3')).toEqual({ '<': [{ '==': [1, 2] }, 3] });
        expect(parseExpression('=1 <= 2 < 3 < 4 >= 0')).toEqual({ and: [{ '<=': [1, 2] }, { '<': [2, 3, 4] }, { '>=': [4, 0] }] });
        expect(() => parseExpression('=1 == 2 < 3')).toThrow('expression "=1 == 2 < 3": "<" after "==" is no chain, write "and" or parentheses at 8');
        expect(parseExpression('@a and @b and @c')).toEqual({ and: ['@a', '@b', '@c'] });
    });

    test('the ternary nests to the right, a condition which is a ternary needs parentheses', () => {
        expect(parseExpression('@a ? 1 : @b ? 2 : 3')).toEqual({ if: ['@a', 1, { if: ['@b', 2, 3] }] });
        expect(parseExpression('(@a ? 1 : @b) ? 2 : 3')).toEqual({ if: [{ if: ['@a', 1, '@b'] }, 2, 3] });
        expect(parseExpression('@a ? @b ? 1 : 2 : 3')).toEqual({ if: ['@a', { if: ['@b', 1, 2] }, 3] });
    });

    test('the keys of objects: words, numbers (as texts), quoted texts', () => {
        expect(parseExpression('={a: 1, 2: 2, 1.0: 3, "x y": 4, \'*\': 5, true: 6}')).toEqual({ a: 1, 2: 2, 1: 3, 'x y': 4, '*': 5, true: 6 });
        expect(Object.getPrototypeOf(parseExpression('={__proto__: 1}'))).toBe(Object.prototype);
    });

    test('texts in literal and the name of var are data', () => {
        expect(parseExpression("literal('@a')")).toEqual({ literal: '@a' });
        expect(parseExpression("literal(literal('@a'))")).toEqual({ literal: { literal: '@a' } });
        expect(parseExpression("literal({x: '@a'})")).toEqual({ literal: { x: '@a' } });
        expect(parseExpression("var('@a', '@b')")).toEqual({ var: ['@a', { literal: '@b' }] });
        expect(parseExpression("cat('@a', 1)")).toEqual({ cat: [{ literal: '@a' }, 1] });
    });

    test('the calls of the operators', () => {
        expect(parseExpression('min()')).toEqual({ min: [] });
        expect(parseExpression('if(@a, 1)')).toEqual({ if: ['@a', 1] });
        expect(parseExpression('not(@a, @b)')).toEqual({ not: ['@a', '@b'] });
        expect(parseExpression('not (@a) == 1')).toEqual({ not: [{ '==': ['@a', 1] }] });
        expect(parseExpression('not(@a) == 1')).toEqual({ '==': [{ not: ['@a'] }, 1] });
        expect(parseExpression('min (1, 2)')).toEqual({ min: [1, 2] });
    });

    test('errors name the text and the position', () => {
        expect(() => parseExpression('@a +')).toThrow('expression "@a +": unexpected end at 4');
        expect(() => parseExpression('')).toThrow('expression "": unexpected end at 0');
        expect(() => parseExpression('=1 +* 2')).toThrow('expression "=1 +* 2": unexpected "*" at 4');
        expect(() => parseExpression('=[1, 2')).toThrow('unexpected end at 6');
        expect(() => parseExpression('={a 1}')).toThrow('expected ":", not "1" at 4');
        expect(() => parseExpression('={[1]: 1}')).toThrow('expected a key, not "[" at 2');
        expect(() => parseExpression('=min')).toThrow('expected "(" after "min" at 4');
        expect(() => parseExpression('=and')).toThrow('unexpected "and" at 1');
        expect(() => parseExpression("='\\u12'")).toThrow('expected four hex digits after "\\u" at 4');
        expect(() => parseExpression(3)).toThrow('expression 3: no text');
    });

    test('a depth of 100 levels, deeper ones are an error, not a stack overflow', () => {
        const deep = n => `=${'('.repeat(n)}1${')'.repeat(n)}`;
        expect(parseExpression(deep(99))).toBe(1);
        expect(() => parseExpression(deep(100000))).toThrow(/nested deeper than 100 levels at 101$/);
        expect(() => parseExpression(`=${'['.repeat(5000)}`)).toThrow('nested deeper than 100 levels');
        expect(() => parseExpression(`=${'not '.repeat(5000)}true`)).toThrow('nested deeper than 100 levels');
        expect(() => parseExpression(`=${'- '.repeat(5000)}@a`)).toThrow('nested deeper than 100 levels');
        expect(() => parseExpression(`=${'min('.repeat(5000)}`)).toThrow('nested deeper than 100 levels');
    });
});

describe('formatExpression', () => {
    test('values and references', () => {
        expect(formatExpression('@a')).toBe('@a');
        expect(formatExpression('@x:scaled')).toBe('@x:scaled');
        expect(formatExpression('@stroke-width')).toBe('@stroke-width');
        expect(formatExpression('none')).toBe("'none'");
        expect(formatExpression(3)).toBe('3');
        expect(formatExpression(-14)).toBe('-14');
        expect(formatExpression(null)).toBe('null');
        expect(formatExpression(true)).toBe('true');
        expect(formatExpression([0, '@height'])).toBe('[0, @height]');
        expect(formatExpression({ d: { x: '@a', y: 2 }, fill: 'red' })).toBe("{d: {x: @a, y: 2}, fill: 'red'}");
        expect(formatExpression({})).toBe('{}');
    });

    test('texts are single-quoted with escapes, the ones starting with @ of a literal too', () => {
        expect(formatExpression("it's")).toBe("'it\\'s'");
        expect(formatExpression('a\\b\n\t"')).toBe("'a\\\\b\\n\\t\"'");
        expect(formatExpression('\u0001')).toBe("'\\u0001'");
        expect(formatExpression({ literal: '@x' })).toBe("'@x'");
        expect(formatExpression({ cat: [{ literal: '@x' }, 1] })).toBe("cat('@x', 1)");
    });

    test('names which are no names of the syntax are a var', () => {
        expect(formatExpression('@a b')).toBe("var('a b')");
        expect(formatExpression('@a-1')).toBe("var('a-1')");
        expect(formatExpression('@a-')).toBe("var('a-')");
        expect(formatExpression('@')).toBe("var('')");
        expect(formatExpression({ var: ['@a', 0] })).toBe("var('@a', 0)");
        expect(formatExpression({ var: 'a' })).toBe("var('a')");
    });

    test('operators between their operands, as few parentheses as needed', () => {
        expect(formatExpression({ '+': ['@a', 1] })).toBe('@a + 1');
        expect(formatExpression({ '+': [{ '*': ['@x', 2] }, 1] })).toBe('@x * 2 + 1');
        expect(formatExpression({ '*': [{ '+': ['@x', 1] }, 2] })).toBe('(@x + 1) * 2');
        expect(formatExpression({ '+': [1, 2, 3] })).toBe('1 + 2 + 3');
        expect(formatExpression({ '+': [{ '+': [1, 2] }, 3] })).toBe('(1 + 2) + 3');
        expect(formatExpression({ '+': [1, { '+': [2, 3] }] })).toBe('1 + (2 + 3)');
        expect(formatExpression({ '+': [{ '-': [1, 2] }, 3] })).toBe('1 - 2 + 3');
        expect(formatExpression({ '-': [1, { '+': [2, 3] }] })).toBe('1 - (2 + 3)');
        expect(formatExpression({ '<': [0, '@x', 10] })).toBe('0 < @x < 10');
        // the operands of a comparison which are comparisons are in parentheses, a
        // chain would be the and of the comparisons
        expect(formatExpression({ '<=': [{ '<': [0, '@x'] }, 10] })).toBe('(0 < @x) <= 10');
        expect(formatExpression({ and: [{ '<=': [0, '@x'] }, { '<': ['@x', 10] }] })).toBe('0 <= @x and @x < 10');
        expect(formatExpression({ '<': [{ '<': [0, '@x'] }, 10] })).toBe('(0 < @x) < 10');
        expect(formatExpression({ or: [{ and: ['@a', '@b'] }, '@c'] })).toBe('@a and @b or @c');
        expect(formatExpression({ and: [{ or: ['@a', '@b'] }, '@c'] })).toBe('(@a or @b) and @c');
        expect(formatExpression({ or: ['@color', 'black'] })).toBe("@color or 'black'");
    });

    test('the unary minus and negative numbers', () => {
        expect(formatExpression({ '-': ['@x'] })).toBe('-@x');
        expect(formatExpression({ '-': [5] })).toBe('-(5)');
        expect(formatExpression({ '-': [-5] })).toBe('-(-5)');
        expect(formatExpression({ '-': [{ '*': ['@x', 2] }] })).toBe('-(@x * 2)');
        expect(formatExpression({ '-': [{ '-': ['@x'] }] })).toBe('-(-@x)');
        expect(formatExpression({ '*': [{ '-': ['@x'] }, 2] })).toBe('-@x * 2');
        expect(formatExpression({ '+': ['@x', -14] })).toBe('@x + -14');
        expect(formatExpression({ '-': [1, -5] })).toBe('1 - -5');
    });

    test('not, the ternary and the calls', () => {
        expect(formatExpression({ not: '@a' })).toBe('not @a');
        expect(formatExpression({ not: [{ '==': ['@a', 1] }] })).toBe('not @a == 1');
        expect(formatExpression({ not: [{ and: ['@a', '@b'] }] })).toBe('not (@a and @b)');
        expect(formatExpression({ not: [{ not: ['@a'] }] })).toBe('not not @a');
        expect(formatExpression({ not: ['@a', '@b'] })).toBe('not(@a, @b)');
        expect(formatExpression({ if: [{ '>': ['@v', 2] }, 'big', 'small'] })).toBe("@v > 2 ? 'big' : 'small'");
        expect(formatExpression({ if: ['@a', 1, { if: ['@b', 2, 3] }] })).toBe('@a ? 1 : @b ? 2 : 3');
        expect(formatExpression({ if: ['@a', { if: ['@b', 1, 2] }, 3] })).toBe('@a ? (@b ? 1 : 2) : 3');
        expect(formatExpression({ if: [{ if: ['@a', 1, 0] }, 2, 3] })).toBe('(@a ? 1 : 0) ? 2 : 3');
        expect(formatExpression({ '+': [{ if: ['@a', 1, 2] }, 3] })).toBe('(@a ? 1 : 2) + 3');
        expect(formatExpression({ if: ['@a', 1] })).toBe('if(@a, 1)');
        expect(formatExpression({ if: ['@a', 1, '@b', 2, 3] })).toBe('if(@a, 1, @b, 2, 3)');
        expect(formatExpression({ min: ['@a', 1] })).toBe('min(@a, 1)');
        expect(formatExpression({ round: 2.5 })).toBe('round(2.5)');
        expect(formatExpression({ and: ['@a'] })).toBe('and(@a)');
        expect(formatExpression({ format: [{ '*': ['@y', 1.5] }, '.2f'] })).toBe("format(@y * 1.5, '.2f')");
        expect(formatExpression({ steps: ['@totalWidth', { 0: 220, 550: 250 }] })).toBe('steps(@totalWidth, {0: 220, 550: 250})');
        expect(formatExpression({ steps: ['@v', { '-1': 'a', '0.5': 'b', '1.0': 'c' }] })).toBe("steps(@v, {-1: 'a', 0.5: 'b', '1.0': 'c'})");
        expect(formatExpression({ match: ['@lang', { de: 'Quelle', 'en-GB': 'Source' }, '@x'] })).toBe("match(@lang, {de: 'Quelle', 'en-GB': 'Source'}, @x)");
        expect(formatExpression({ literal: { '*': [1, 2] } })).toBe("literal({'*': [1, 2]})");
        expect(formatExpression({ literal: ['@a', { literal: '@b' }] })).toBe("literal(['@a', {literal: '@b'}])");
    });

    test('expressions without a text are errors', () => {
        expect(() => formatExpression({ '+': [1] })).toThrow('no text of "+" of 1 argument');
        expect(() => formatExpression({ '*': [] })).toThrow('no text of "*" of 0 arguments');
        expect(() => formatExpression({ '==': ['@a'] })).toThrow('no text of "=="');
        expect(() => formatExpression(Infinity)).toThrow('no text');
        expect(() => formatExpression(undefined)).toThrow('no text');
    });
});

describe('objects of expressions (review of 5.0)', () => {
    test('a key __proto__ is an entry, not the prototype', () => {
        const expr = parseExpression('={"__proto__": @v, "a": 1}');
        // of the rows (bind) and once (evaluate)
        const ofRow = bind(expr, name => name == 'v' ? row => row.v : undefined)({ v: 2 });
        for (const o of [ofRow, evaluate(expr, { v: 2 })]) {
            expect(Object.keys(o)).toEqual(['__proto__', 'a']);
            expect(Object.getPrototypeOf(o)).toBe(Object.prototype);
            expect(o.__proto__).toBe(2);
        }
    });

    test('the text of a key which is no finite number is quoted, the expression of the text is the same', () => {
        const expr = { steps: ['@v', { '-Infinity': 'a', 0: 'b' }] };
        const text = formatExpression(expr);
        expect(text).toBe("steps(@v, {0: 'b', '-Infinity': 'a'})");
        expect(parseExpression(text)).toEqual(expr);
        expect(evaluate(parseExpression(text), { v: -5 })).toBe('a');
        // the texts of numbers which are keys of the syntax are not quoted
        const keys = { '-1': 1, '0.5': 2, '1e-7': 3, Infinity: 4, NaN: 5, '-0': 6, '1e21': 7, '1e+21': 8 };
        expect(formatExpression({ literal: keys })).toBe("literal({-1: 1, 0.5: 2, 1e-7: 3, Infinity: 4, NaN: 5, '-0': 6, '1e21': 7, 1e+21: 8})");
        expect(parseExpression(formatExpression({ literal: keys }))).toEqual({ literal: keys });
    });
});
