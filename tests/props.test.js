import { describe, test, expect } from 'vitest';
import { evaluate, bind, constant, refNames, refOf, formatter } from '@/utils/props';
import { migrateExpr } from '@/utils/migrate';

describe('evaluate', () => {
    test('fixed values and references', () => {
        expect(evaluate(3)).toBe(3);
        expect(evaluate(null)).toBeNull();
        expect(evaluate('@a', { a: 'x' })).toBe('x');
        expect(evaluate({ var: 'a' }, { a: 'x' })).toBe('x');
        expect(evaluate({ var: ['b', 0] }, { a: 'x' })).toBe(0);
        expect(evaluate({ literal: '@a' }, { a: 'x' })).toBe('@a');
        expect(evaluate({ literal: { '*': [1, 2] } })).toEqual({ '*': [1, 2] });
    });

    test('unknown names are undefined, also the ones of objects', () => {
        expect(evaluate('@b', { a: 'x' })).toBeUndefined();
        expect(evaluate('@constructor', {})).toBeUndefined();
    });

    test('arithmetic, e.g. a ratio plus an offset', () => {
        expect(evaluate({ '*': ['@innerWidth', 0.5] }, { innerWidth: 100 })).toBe(50);
        expect(evaluate({ '*': ['@innerWidth', 0.5] }, {})).toBeUndefined();
        expect(evaluate({ '+': ['@x', -14] }, { x: 100 })).toBe(86);
        expect(evaluate({ '+': [{ '*': ['@x', 2] }, 1] }, { x: 3 })).toBe(7);
        expect(evaluate({ '/': ['@x', 0] }, { x: 3 })).toBeUndefined();
        expect(evaluate({ '-': '@x' }, { x: 3 })).toBe(-3);
    });

    test('match, the prop of the case of the value, the default otherwise', () => {
        const match = { match: ['@level', { header: 4.5, item: '@r' }, 0] };
        expect(evaluate(match, { level: 'header' })).toBe(4.5);
        expect(evaluate(match, { level: 'item', r: 2 })).toBe(2);
        expect(evaluate(match, { level: 'other' })).toBe(0);
        // numbers as texts, without a default null
        expect(evaluate({ match: ['@year', { 2024: 'red' }] }, { year: 2024 })).toBe('red');
        expect(evaluate({ match: ['@year', { 2024: 'red' }] }, { year: 2023 })).toBeNull();
    });

    test('steps, the value of the last step with a cut below the value', () => {
        const steps = { steps: ['@totalWidth', { 0: 1, 500: 2 }] };
        expect(evaluate(steps, { totalWidth: 400 })).toBe(1);
        expect(evaluate(steps, { totalWidth: 600 })).toBe(2);
        expect(evaluate(steps, { totalWidth: 0 })).toBeUndefined();
        expect(evaluate({ '*': [{ steps: ['@totalWidth', { 0: 100, 500: 200 }] }, 0.5] }, { totalWidth: 600 })).toBe(100);
    });

    test('format, with the formatter of the scope', () => {
        const scope = { y: 0.5, [formatter]: (spec, name) => v => `${name}:${spec}:${v}` };
        expect(evaluate({ format: ['@y', '.0%'] }, scope)).toBe('y:.0%:0.5');
        expect(evaluate({ format: ['@z', '.0%'] }, scope)).toBe('');
        expect(evaluate({ format: ['@y', '.0%'] }, { y: 0.5 })).toBe('0.5');
    });

    test('nested props and lists, a single key which is no operator is a nested prop', () => {
        expect(evaluate({ d: { x: '@a', y: 2 }, fill: 'red' }, { a: 1 })).toEqual({ d: { x: 1, y: 2 }, fill: 'red' });
        expect(evaluate({ d: { x: '@a' } }, { a: 1 })).toEqual({ d: { x: 1 } });
        expect(evaluate([0, '@height'], { height: 300 })).toEqual([0, 300]);
    });

    test('a prop of an object is compiled once, the result is a new object', () => {
        const raw = { x: '@a' };
        const a = evaluate(raw, { a: 1 });
        expect(evaluate(raw, { a: 2 })).toEqual({ x: 2 });
        expect(a).toEqual({ x: 1 });
    });
});

describe('bind', () => {
    // the values of the row and a global
    const resolve = name => name == 'v' ? (row => row.v) : name == 'g' ? constant(10) : undefined;

    test('a function of the row', () => {
        const f = bind({ a: '@v', b: { '*': ['@v', 2] }, c: '@g', d: { e: '@v' } }, resolve);
        expect(f({ v: 1 })).toEqual({ a: 1, b: 2, c: 10, d: { e: 1 } });
        expect(f({ v: 3 })).toEqual({ a: 3, b: 6, c: 10, d: { e: 3 } });
    });

    test('the entries which are the same for all rows are constants', () => {
        const f = bind({ a: '@v', c: '@g', fill: 'red', unknown: '@x', d: { e: '@g' }, w: { '*': ['@g', 2] } }, resolve);
        expect([...f.entries].filter(([, e]) => e.constant).map(([k, e]) => [k, e()]))
            .toEqual([['c', 10], ['fill', 'red'], ['unknown', undefined], ['d', { e: 10 }], ['w', 20]]);
        expect(bind({ c: '@g' }, resolve).constant).toBe(true);
    });

    test('match, if and nested props of the row', () => {
        const f = bind({ r: { match: ['@v', { 1: '@g', 2: { '+': ['@v', 5] } }, -1] } }, resolve);
        expect([1, 2, 3].map(v => f({ v }).r)).toEqual([10, 7, -1]);
        expect(bind({ match: ['@g', { 10: 'ten' }] }, resolve).constant).toBe(true);
        const g = bind({ if: [{ '>': ['@v', 1] }, 'big', { '==': ['@g', 10] }, 'ten', 'other'] }, resolve);
        expect([1, 2].map(v => g({ v }))).toEqual(['ten', 'big']);
        expect(bind({ if: [{ '==': ['@g', 10] }, 'ten', '@v'] }, resolve).constant).toBe(true);
    });

    test('the evaluation and the binding are the same', () => {
        const exprs = [
            { cat: ['@v', ' / ', '@g'] }, { or: ['@x', '@v', 3] }, { and: ['@v', '@g'] }, { not: '@v' },
            { round: [{ '/': ['@v', 3] }, 2] }, { min: ['@v', '@g'] }, { '<': [0, '@v', '@g'] }, { steps: ['@v', { 0: 'a', 1.5: '@g' }] },
        ];
        for (const e of exprs)
            for (const v of [0, 1, 2, null])
                expect(bind(e, resolve)({ v })).toEqual(evaluate(e, { v, g: 10 }));
    });
});

describe('references', () => {
    test('the names of nested props', () => {
        expect(refNames({ x: '@x:scaled', d: { y: '@y:end:scaled' }, fill: 'red', w: { '*': ['@innerWidth', 1] }, r: ['@a'] }))
            .toEqual(['x:scaled', 'y:end:scaled', 'innerWidth', 'a']);
        expect(refNames({ match: ['@level', { a: '@x' }, { '+': ['@y', 1] }] }))
            .toEqual(['level', 'x', 'y']);
    });

    test('the reference of a prop', () => {
        expect(refOf('@x:scaled')).toBe('x:scaled');
        expect(refOf({ var: 'x:scaled' })).toBe('x:scaled');
        expect(refOf('red')).toBeUndefined();
        expect(refOf(undefined)).toBeUndefined();
    });
});

describe('the props of 3.x', () => {
    test('are migrated to expressions of the same values', () => {
        const scope = { innerWidth: 100, x: 3, level: 'item', r: 2, totalWidth: 600 };
        const props = [
            { prop: 'ref', ref: 'x' },
            { prop: 'fixed', value: '@a' },
            { prop: 'relative', ref: 'innerWidth', ratio: 0.5 },
            { prop: 'relative', ref: 'x', ratio: 2, offset: 1 },
            { prop: 'relative', ref: 'nope', offset: 1 },
            { prop: 'match', ref: 'level', cases: { header: 4.5, item: '@r' }, default: 0 },
            { prop: 'match', ref: 'level', cases: { header: 4.5 } },
            { prop: 'relative', of: { prop: 'steps', ref: 'totalWidth', steps: [{ cut: 0, value: 100 }, { cut: 500, value: 200 }] }, ratio: 0.5 },
            { prop: 'steps', ref: 'totalWidth', steps: [{ cut: 0, value: '@x' }, { cut: 700, value: 2 }] },
        ];
        expect(props.map(p => evaluate(migrateExpr(p), scope))).toEqual([3, '@a', 50, 7, undefined, 2, null, 100, '@x']);
        expect(migrateExpr({ prop: 'relative', ref: 'x', ratio: 2, offset: 1 })).toEqual({ '+': [{ '*': ['@x', 2] }, 1] });
        expect(migrateExpr({ d: { x: { prop: 'relative', ref: 'x:scaled', offset: -5 } } })).toEqual({ d: { x: { '+': ['@x:scaled', -5] } } });
    });
});
