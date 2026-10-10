import { loadColors } from '@/utils/d3';
import { describe, test, expect, beforeAll } from 'vitest';
import { makeScale, bandCenter } from '@/utils/scales';
import coord from '@/coords/cartesian';

// the colors of d3 are loaded by the store, see loadColors
beforeAll(loadColors);

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

    test('the inset of a range in pixels, of both ends or of each', () => {
        const scale = (orientation, inset) => makeScale('y', { type: 'numeric', scale: { type: 'linear', orientation, domain: [0, 10], inset } }, [], options);
        expect(scale('horizontal', 10).range()).toEqual([10, 90]);
        expect(scale('vertical', [5, 10]).range()).toEqual([45, 10]);
        expect(scale('horizontal', { prop: 'relative', ref: 'width', ratio: 0.1 }).range()).toEqual([10, 90]);
        // the dates of a time scale, the categories of a band scale
        const time = makeScale('x', { type: 'date', scale: { type: 'time', orientation: 'horizontal', domain: [null, null], domainRel: [0, 0], inset: 20 } },
            [{ x: Date.UTC(2020, 0, 1) }, { x: Date.UTC(2021, 0, 1) }], options);
        expect(time(Date.UTC(2020, 0, 1))).toBe(20);
        const band = makeScale('c', { type: 'categorical', scale: { type: 'band', orientation: 'horizontal', padding: 0, inset: 10 } }, [{ c: 'a' }, { c: 'b' }], options);
        expect([band('a'), band('b'), band.bandwidth()]).toEqual([10, 50, 40]);
    });

    test('unknown names are errors', () => {
        expect(() => makeScale('x', { type: 'numeric', scale: { type: 'unknown', domain: [null, null] } }, [], options)).toThrow("Unknown scale 'unknown'");
        expect(() => makeScale('x', { type: 'numeric', scale: { type: 'sequential', interpolator: 'Nope', domain: [null, null] } }, [], options)).toThrow("Unknown interpolator 'Nope'");
    });
});
