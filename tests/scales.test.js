import { describe, test, expect } from 'vitest';
import { makeScale, bandCenter } from '@/utils/scales';
import coord from '@/coords/cartesian';

const options = { dims: { width: 100, height: 50 }, coord };

describe('makeScale', () => {
    test('continuous values, the nearest one with data', () => {
        const mapping = { type: 'numeric', scale: { type: 'linear', orientation: 'horizontal', domain: [null, null], domainRel: [0, 0] } };
        const s = makeScale('x', mapping, [{ x: 3 }, { x: null }, { x: 1 }, { x: 2 }, { x: 1 }], options);
        expect(s.domain()).toEqual([1, 3]);
        expect(s.range()).toEqual([0, 100]);
        expect(s.nearest(40)).toBe(2);
        expect(s.nearest(99)).toBe(3);
    });

    test('a domain of the data is extended by 2%, not a fixed end', () => {
        const mapping = { type: 'numeric', scale: { type: 'linear', orientation: 'vertical', domain: [0, null] } };
        expect(makeScale('y', mapping, [{ y: 10 }, { y: 5 }], options).domain()).toEqual([0, 10.2]);
    });

    test('the extent of stacked values is the one of the stacks', () => {
        const rows = [{ y: 2 }, { y: 3 }];
        const stacks = new Map([[rows[0], [0, 2]], [rows[1], [2, 5]]]);
        const mapping = { type: 'numeric', stacked: true, scale: { type: 'linear', orientation: 'vertical', domain: [null, null], domainRel: [0, 0] } };
        expect(makeScale('y', mapping, rows, { ...options, stackOf: r => stacks.get(r) }).domain()).toEqual([0, 5]);
    });

    test('categories keep their order, the nearest is the band under a position', () => {
        const mapping = { type: 'categorical', scale: { type: 'band', orientation: 'horizontal', domain: [null, null] } };
        const s = makeScale('c', mapping, [{ c: 'b' }, { c: 'a' }, { c: 'b' }], options);
        expect(s.domain()).toEqual(['b', 'a']);
        expect(s.nearest(s('a') + bandCenter(s))).toBe('a');
    });

    test('the references of a range', () => {
        const mapping = { type: 'numeric', scale: { type: 'sqrt', range: [0, { prop: 'relative', ref: 'width', ratio: 0.1 }], domain: [0, null] } };
        expect(makeScale('r', mapping, [{ r: 4 }], options).range()).toEqual([0, 10]);
    });

    test('unknown names are errors', () => {
        expect(() => makeScale('x', { type: 'numeric', scale: { type: 'unknown', domain: [null, null] } }, [], options)).toThrow("Unknown scale 'unknown'");
        expect(() => makeScale('x', { type: 'numeric', scale: { type: 'sequential', interpolator: 'Nope', domain: [null, null] } }, [], options)).toThrow("Unknown interpolator 'Nope'");
    });
});
