import { describe, test, expect } from 'vitest';
import { evaluate, bind, constant, refNames, refOf } from '@/utils/props';

describe('evaluate', () => {
    test('fixed values and references', () => {
        expect(evaluate(3)).toBe(3);
        expect(evaluate(null)).toBeNull();
        expect(evaluate('@a', { a: 'x' })).toBe('x');
        expect(evaluate({ prop: 'ref', ref: 'a' }, { a: 'x' })).toBe('x');
        expect(evaluate({ prop: 'fixed', value: '@a' }, { a: 'x' })).toBe('@a');
    });

    test('unknown names are undefined, also the ones of objects', () => {
        expect(evaluate('@b', { a: 'x' })).toBeUndefined();
        expect(evaluate('@constructor', {})).toBeUndefined();
    });

    test('relative', () => {
        expect(evaluate({ prop: 'relative', ref: 'innerWidth', ratio: 0.5 }, { innerWidth: 100 })).toBe(50);
        expect(evaluate({ prop: 'relative', ref: 'innerWidth', ratio: 0.5 }, {})).toBeUndefined();
        // an offset, e.g. of a position, the ratio is 1 by default
        expect(evaluate({ prop: 'relative', ref: 'x', offset: -14 }, { x: 100 })).toBe(86);
        expect(evaluate({ prop: 'relative', ref: 'x', ratio: 2, offset: 1 }, { x: 3 })).toBe(7);
    });

    test('match, the prop of the case of the value, the default otherwise', () => {
        const match = { prop: 'match', ref: 'level', cases: { header: 4.5, item: '@r' }, default: 0 };
        expect(evaluate(match, { level: 'header' })).toBe(4.5);
        expect(evaluate(match, { level: 'item', r: 2 })).toBe(2);
        expect(evaluate(match, { level: 'other' })).toBe(0);
        // numbers as texts, without a default undefined
        expect(evaluate({ prop: 'match', ref: 'year', cases: { 2024: 'red' } }, { year: 2024 })).toBe('red');
        expect(evaluate({ prop: 'match', ref: 'year', cases: { 2024: 'red' } }, { year: 2023 })).toBeNull();
    });

    test('the value of a prop instead of a reference', () => {
        const steps = { prop: 'steps', ref: 'totalWidth', steps: [{ cut: 0, value: 100 }, { cut: 500, value: 200 }] };
        expect(evaluate({ prop: 'relative', of: steps, ratio: 0.5 }, { totalWidth: 600 })).toBe(100);
        expect(evaluate({ prop: 'match', of: { prop: 'relative', ref: 'a', offset: 1 }, cases: { 2: 'two' } }, { a: 1 })).toBe('two');
    });

    test('steps, the value of the last step with a cut below the reference', () => {
        const steps = { prop: 'steps', ref: 'totalWidth', steps: [{ cut: 0, value: 1 }, { cut: 500, value: 2 }] };
        expect(evaluate(steps, { totalWidth: 400 })).toBe(1);
        expect(evaluate(steps, { totalWidth: 600 })).toBe(2);
        expect(evaluate(steps, { totalWidth: 0 })).toBeUndefined();
    });

    test('nested props and lists', () => {
        expect(evaluate({ d: { x: '@a', y: 2 }, fill: 'red' }, { a: 1 })).toEqual({ d: { x: 1, y: 2 }, fill: 'red' });
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
        const f = bind({ a: '@v', b: { prop: 'relative', ref: 'v', ratio: 2 }, c: '@g', d: { e: '@v' } }, resolve);
        expect(f({ v: 1 })).toEqual({ a: 1, b: 2, c: 10, d: { e: 1 } });
        expect(f({ v: 3 })).toEqual({ a: 3, b: 6, c: 10, d: { e: 3 } });
    });

    test('the entries which are the same for all rows are constants', () => {
        const f = bind({ a: '@v', c: '@g', fill: 'red', unknown: '@x', d: { e: '@g' } }, resolve);
        expect([...f.entries].filter(([, e]) => e.constant).map(([k, e]) => [k, e()]))
            .toEqual([['c', 10], ['fill', 'red'], ['unknown', undefined], ['d', { e: 10 }]]);
        expect(bind({ c: '@g' }, resolve).constant).toBe(true);
    });

    test('match and nested props of the row', () => {
        const f = bind({ r: { prop: 'match', ref: 'v', cases: { 1: '@g', 2: { prop: 'relative', ref: 'v', offset: 5 } }, default: -1 } }, resolve);
        expect([1, 2, 3].map(v => f({ v }).r)).toEqual([10, 7, -1]);
        expect(bind({ prop: 'match', ref: 'g', cases: { 10: 'ten' } }, resolve).constant).toBe(true);
        expect(bind({ prop: 'relative', of: '@v', ratio: 3 }, resolve)({ v: 2 })).toBe(6);
    });
});

describe('references', () => {
    test('the names of nested props', () => {
        expect(refNames({ x: '@x:scaled', d: { y: '@y:end:scaled' }, fill: 'red', w: { prop: 'relative', ref: 'innerWidth', ratio: 1 }, r: ['@a'] }))
            .toEqual(['x:scaled', 'y:end:scaled', 'innerWidth', 'a']);
        expect(refNames({ prop: 'match', ref: 'level', cases: { a: '@x' }, default: { prop: 'relative', of: '@y' } }))
            .toEqual(['level', 'x', 'y']);
    });

    test('the reference of a prop', () => {
        expect(refOf('@x:scaled')).toBe('x:scaled');
        expect(refOf('red')).toBeUndefined();
        expect(refOf(undefined)).toBeUndefined();
    });
});
