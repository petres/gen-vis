import * as d3 from 'd3-scale-chromatic';
import { loadColors } from '@/utils/d3';
import { describe, test, expect, beforeAll } from 'vitest';
import { makeScale, bandCenter, logProblems } from '@/utils/scales';
import coord from '@/coords/cartesian';
import { tickValues } from '@/coords/ticks';

// the colors of d3 are loaded by the store, see loadColors
beforeAll(loadColors);

const options = { dims: { width: 100, height: 50 }, coord };

describe('makeScale', () => {
    test('continuous values, the nearest one with data', () => {
        const mapping = { type: 'numeric', scale: { type: 'linear', orientation: 'horizontal', domain: [null, null], pad: 0 } };
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
        const mapping = { type: 'numeric', stacked: true, scale: { type: 'linear', orientation: 'vertical', domain: [null, null], pad: 0 } };
        expect(makeScale('y', mapping, rows, { ...options, stackOf: r => stacks.get(r) }).domain()).toEqual([0, 5]);
    });

    test('the nearest value is one of the rows, not of the rows of the domain (domainIgnores), also of periods', () => {
        const rows = [{ x: 2 }, { x: 3 }];
        const domainRows = [{ x: 0 }, { x: 2 }, { x: 3 }, { x: 10 }];
        const mapping = { type: 'numeric', scale: { type: 'linear', orientation: 'horizontal', domain: [null, null], pad: 0 } };
        const s = makeScale('x', mapping, rows, { ...options, domainRows });
        expect(s.domain()).toEqual([0, 10]);
        expect([s.nearest(0), s.nearest(100)]).toEqual([2, 3]);
        const months = [0, 1, 2, 3].map(m => ({ d: +new Date(2024, m, 1) }));
        const dated = { type: 'date', interval: 'month', scale: { type: 'time', orientation: 'horizontal', domain: [null, null] } };
        const p = makeScale('d', dated, months.slice(1, 3), { ...options, domainRows: months });
        expect(p.domain().map(d => d.getMonth())).toEqual([0, 4]);
        // the period under the position, of the rows
        expect(p.nearest(p(new Date(2024, 1, 20)))).toBe(months[1].d);
        expect(p.nearest(p(new Date(2024, 0, 10)))).toBe(months[1].d);
        expect(p.nearest(p(new Date(2024, 3, 10)))).toBe(months[2].d);
    });

    test('categories keep their order, the nearest is the band under a position', () => {
        const mapping = { type: 'categorical', scale: { type: 'band', orientation: 'horizontal', domain: [null, null] } };
        const s = makeScale('c', mapping, [{ c: 'b' }, { c: 'a' }, { c: 'b' }], options);
        expect(s.domain()).toEqual(['b', 'a']);
        expect(s.nearest(s('a') + bandCenter(s))).toBe('a');
    });

    test('the references of a range', () => {
        const mapping = { type: 'numeric', scale: { type: 'sqrt', range: [0, { '*': ['@width', 0.1] }], domain: [0, null] } };
        expect(makeScale('r', mapping, [{ r: 4 }], options).range()).toEqual([0, 10]);
    });

    test('the inset of a range in pixels, of both ends or of each', () => {
        const scale = (orientation, inset) => makeScale('y', { type: 'numeric', scale: { type: 'linear', orientation, domain: [0, 10], inset } }, [], options);
        expect(scale('horizontal', 10).range()).toEqual([10, 90]);
        expect(scale('vertical', [5, 10]).range()).toEqual([45, 10]);
        expect(scale('horizontal', { '*': ['@width', 0.1] }).range()).toEqual([10, 90]);
        // the dates of a time scale, the categories of a band scale
        const time = makeScale('x', { type: 'date', scale: { type: 'time', orientation: 'horizontal', domain: [null, null], pad: 0, inset: 20 } },
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

describe('the domains of scales', () => {
    const scale = (scaleDef, rows, type = 'numeric', scope = {}) =>
        makeScale('y', { type, scale: { type: 'linear', orientation: 'vertical', domain: [null, null], ...scaleDef } }, rows, { ...options, scope });

    test('the values of a fixed domain are the ones of the data, e.g. of a global of a string', () => {
        expect(scale({ domain: [0, '@max'] }, [{ y: 5 }], 'numeric', { max: '100' }).domain()).toEqual([0, 100]);
        expect(scale({ domain: ['@min', 10] }, [{ y: 5 }], 'numeric', { min: '-50' }).domain()).toEqual([-50, 10]);
    });

    test('a log scale is extended by its positions, also of negative values, nice are powers of 10', () => {
        const rows = [{ y: 1.3 }, { y: 870 }];
        const log = scale({ type: 'log' }, rows);
        expect(log.domain()[0]).toBeGreaterThan(0);
        expect(log(1.3) - log(870)).toBeCloseTo(50/1.04, 5);
        expect(scale({ type: 'log', nice: true }, rows).domain()).toEqual([1, 1000]);
        const negative = scale({ type: 'log' }, rows.map(r => ({ y: -r.y })));
        expect(negative.domain().every(v => v < 0)).toBe(true);
        expect(Math.abs(negative(-1.3) - negative(-870))).toBeCloseTo(50/1.04, 5);
    });

    test('fixed ends are exact, also of sqrt, log and sequential scales', () => {
        expect(scale({ type: 'sqrt', domain: [0, 3] }, [{ y: 1 }]).domain()).toEqual([0, 3]);
        expect(scale({ type: 'log', domain: [1, 1000] }, [{ y: 5 }]).domain()).toEqual([1, 1000]);
        const colors = makeScale('v', { type: 'numeric', scale: { type: 'sequentialLog', interpolator: 'Blues', domain: [null, null] } }, [{ v: 1 }, { v: 1000 }], options);
        expect(colors.domain()).toEqual([1, 1000]);
    });

    test('an ordinal scale of numbers, the values in their order', () => {
        const s = makeScale('v', { type: 'numeric', scale: { type: 'ordinal', range: ['red', 'green', 'blue'], domain: [null, null] } }, [{ v: 3 }, { v: 1 }, { v: 2 }], options);
        expect([s(1), s(2), s(3)]).toEqual(['red', 'green', 'blue']);
    });

    test('a sqrt scale is extended by its positions, 0 is 2% above the bottom', () => {
        const s = scale({ type: 'sqrt' }, [{ y: 0 }, { y: 870 }]);
        expect((50 - s(0))/50).toBeCloseTo(0.02/1.04, 5);
    });

    test('a fixed domain of categories is their order, as the values of the data', () => {
        const s = makeScale('c', { type: 'categorical', scale: { type: 'band', orientation: 'horizontal', domain: ['2021', 2019, 'later'] } },
            [{ c: 2019 }, { c: 2020 }, { c: 2021 }], options);
        expect(s.domain()).toEqual([2021, 2019, 'later']);
        expect(s.nearest(s(2019) + bandCenter(s))).toBe(2019);
    });

    test('ordinal scales of colors and quantiles of the values', () => {
        const ordinal = makeScale('c', { type: 'categorical', scale: { type: 'ordinal', range: ['red', 'blue'], domain: [null, null] } },
            [{ c: 'a' }, { c: 'b' }], options);
        expect([ordinal('a'), ordinal('b')]).toEqual(['red', 'blue']);
        const quantile = makeScale('v', { type: 'numeric', scale: { type: 'sequentialQuantile', interpolator: 'Blues', domain: [null, null] } },
            [{ v: 1 }, { v: 2 }, { v: 10 }], options);
        expect(quantile.domain()).toEqual([1, 2, 10]);
        expect(quantile(2)).toBe(quantile.interpolator()(0.5));
    });
});

describe('the domain of a diverging scale', () => {
    const diverging = (scale, rows) => makeScale('v', { type: 'numeric', scale: { type: 'diverging', interpolator: 'RdBu', domain: [null, null], ...scale } }, rows, options);
    const rows = [{ v: -2 }, { v: 0 }, { v: 3 }];

    test('the middle is the one of the ends of the data, `center` or the given one, every value has a color', () => {
        expect(diverging({}, rows).domain()).toEqual([-2, 0.5, 3]);
        expect(diverging({ center: 0 }, rows).domain()).toEqual([-3, 0, 3]);
        expect(diverging({ domain: [null, 0, null] }, rows).domain()).toEqual([-2, 0, 3]);
        expect(diverging({ domain: [-10, null, 10] }, rows).domain()).toEqual([-10, 0, 10]);
        const s = diverging({ center: 0 }, rows);
        expect(rows.map(r => s(r.v)).every(c => typeof c == 'string' && !c.includes('NaN'))).toBe(true);
        expect(s(0)).toBe(d3.interpolateRdBu(0.5));
    });

    test('the colors of a scheme of 5: all of them along the scale, of sequential ones too (d3 takes the first 3 or 2)', () => {
        const colors = d3.schemeRdBu[5];
        const s = makeScale('v', { type: 'numeric', scale: { type: 'diverging', scheme: 'RdBu', domain: [null, null] } }, [{ v: -4 }, { v: 4 }], options);
        expect([-4, -2, 0, 2, 4].map(v => s(v))).toEqual(colors.map(c => {
            const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
            return `rgb(${r}, ${g}, ${b})`;
        }));
        const q = makeScale('v', { type: 'numeric', scale: { type: 'sequential', scheme: 'RdBu', domain: [null, null] } }, [{ v: 0 }, { v: 4 }], options);
        expect(q(4)).toBe(s(4));
    });

    test('the ends reach the middle, e.g. of positive values around 0, a domain in order', () => {
        const s = diverging({ domain: [null, 0, null] }, [{ v: 2 }, { v: 5 }]);
        expect(s.domain()).toEqual([0, 0, 5]);
        expect(s(5)).toBe(d3.interpolateRdBu(1));
        expect(s(2)).toBe(d3.interpolateRdBu(0.7));
        expect(diverging({ domain: [null, 10, null] }, [{ v: 2 }, { v: 5 }]).domain()).toEqual([2, 10, 10]);
        // one value
        expect(diverging({ center: 0 }, [{ v: 0 }]).domain()).toEqual([0, 0, 0]);
    });

    test('the middle of a divergingLog scale is the one of its positions', () => {
        const s = makeScale('v', { type: 'numeric', scale: { type: 'divergingLog', interpolator: 'RdBu', domain: [null, null] } }, [{ v: 1 }, { v: 100 }], options);
        expect(s.domain()[1]).toBeCloseTo(10, 9);
    });
});

describe('makeScale, log scales and rows without values', () => {
    const log = { type: 'numeric', scale: { type: 'log', orientation: 'vertical', domain: [null, null], pad: 0 } };

    test('values of a log scale without a position are left out of the domain, e.g. 0', () => {
        const s = makeScale('y', log, [{ y: 0 }, { y: 10 }, { y: 100 }], options);
        expect(s.domain()).toEqual([10, 100]);
        expect(s(10)).toBe(50);
        expect(s(0)).toBeNaN();
        // mixed signs, the positive ones, all negative ones stay
        expect(makeScale('y', log, [{ y: -5 }, { y: 10 }, { y: 1000 }], options).domain()).toEqual([10, 1000]);
        expect(makeScale('y', log, [{ y: -5 }, { y: -500 }, { y: 0 }], options).domain()).toEqual([-500, -5]);
        // without them 1 to 10, also of an include of 0
        expect(makeScale('y', log, [{ y: 0 }, { y: null }], options).domain()).toEqual([1, 10]);
        const included = { ...log, scale: { ...log.scale, include: [0, 1] } };
        expect(makeScale('y', included, [{ y: 10 }, { y: 100 }], options).domain()).toEqual([1, 100]);
        // the stacks from 0, e.g. of bars
        const stacked = { ...log, stacked: true };
        expect(makeScale('y', stacked, [{ y: 10 }, { y: 100 }], { ...options, stackOf: r => [0, r.y] }).domain()).toEqual([10, 100]);
    });

    test('a fixed end of the domain without a position (0, the other sign) is the one of the data, with a warning', () => {
        const fixed = domain => ({ ...log, scale: { ...log.scale, domain } });
        const rows = [{ y: 10 }, { y: 100 }];
        expect(makeScale('y', fixed([0, 1000]), rows, options).domain()).toEqual([10, 1000]);
        expect(makeScale('y', fixed([-5, null]), rows, options).domain()).toEqual([10, 100]);
        expect(makeScale('y', fixed([1, 1000]), rows, options).domain()).toEqual([1, 1000]);
        expect(makeScale('y', fixed([-1000, 0]), [{ y: -10 }, { y: -100 }], options).domain()).toEqual([-1000, -10]);
        expect(logProblems('y', fixed([0, 1000]), rows)).toEqual(
            ['a log scale has no position of 0 of its `domain`, that end is the one of the data, e.g. "domain": [1, 1000]']);
        expect(logProblems('y', fixed(['@lo', 1000]), rows, { lo: -5 })[0]).toContain('no position of -5 of its `domain` (its values are positive)');
        expect(logProblems('y', fixed([1, 1000]), rows)).toEqual([]);
    });

    test('without rows the domain is 0 to 1 or the one of the values of include or center', () => {
        const linear = { type: 'numeric', scale: { type: 'linear', orientation: 'vertical', domain: [null, null], pad: 0, nice: true } };
        expect(makeScale('y', linear, [], options).domain()).toEqual([0, 1]);
        expect(makeScale('y', linear, [{ y: null }], options).domain()).toEqual([0, 1]);
        expect(makeScale('y', { ...linear, scale: { ...linear.scale, include: [0, 50] } }, [], options).domain()).toEqual([0, 50]);
        expect(makeScale('y', { ...linear, scale: { ...linear.scale, include: 50 } }, [], options).domain()).toEqual([0, 50]);
        expect(makeScale('y', { ...linear, scale: { ...linear.scale, center: 0 } }, [], options).domain()).toEqual([-1, 1]);
        expect(makeScale('y', log, [], options).domain()).toEqual([1, 10]);
        const fixed = { ...linear, scale: { ...linear.scale, domain: [0, 100] } };
        expect(makeScale('y', fixed, [], options).domain()).toEqual([0, 100]);
        // dates and colors
        const time = { type: 'date', scale: { type: 'time', orientation: 'horizontal', domain: [null, null] } };
        expect(makeScale('x', time, [], options).domain().map(Number).every(Number.isFinite)).toBe(true);
        const color = { type: 'numeric', scale: { type: 'sequential', interpolator: 'Blues', domain: [null, null] } };
        expect(makeScale('c', color, [], options).domain()).toEqual([0, 1]);
    });
});

describe('values of the definition of a mapping with the scale of another one', () => {
    test('dates of fixed ticks of a utc scale of another mapping', () => {
        const mappings = {
            x: { type: 'date', scale: { type: 'utc', orientation: 'horizontal' } },
            x2: { type: 'date', scale: { of: 'x' } },
        };
        const s = makeScale('x', mappings.x, [{ x: Date.UTC(2020, 0, 1) }, { x: Date.UTC(2021, 0, 1) }], options);
        expect(tickValues({ values: ['2020-07-01'] }, s, 5, mappings.x2, {}, mappings)).toEqual([Date.UTC(2020, 6, 1)]);
        const include = { ...mappings.x, scale: { ...mappings.x.scale, include: '2019-01-01', domain: [null, null], pad: 0 } };
        expect(makeScale('x', include, [{ x: Date.UTC(2020, 0, 1) }], { ...options, mappings }).domain().map(Number))
            .toEqual([Date.UTC(2019, 0, 1), Date.UTC(2020, 0, 1)]);
    });
});

describe('the ticks of whole numbers', () => {
    const linear = domain => ({ type: 'numeric', scale: { type: 'linear', orientation: 'vertical', domain, pad: 0 } });
    const whole = [{ y: 0, w: 0.5 }, { y: 1, w: 0.7 }];

    test('are whole numbers, e.g. years', () => {
        const s = makeScale('y', linear([null, null]), [{ y: 2001 }, { y: 2003 }], options);
        expect(s.ticks(10)).toEqual([2001, 2002, 2003]);
        expect(s.integers).toBe(true);
    });

    test('not of a fixed end of the domain which is none, e.g. [0, 0.5]', () => {
        const s = makeScale('y', linear([0, 0.5]), whole, options);
        expect(s.ticks(5)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
        expect(s.integers).toBeUndefined();
        // whole ends stay whole ticks
        expect(makeScale('y', linear([0, 2]), whole, options).ticks(10)).toEqual([0, 1, 2]);
    });

    test('not with the values of a dim of the same scale (`of`) which are none', () => {
        const s = makeScale('y', linear([null, null]), whole, { ...options, also: ['w'] });
        expect(s.ticks(5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
        expect(makeScale('y', linear([null, null]), [{ y: 0, w: 2 }, { y: 1, w: 3 }], { ...options, also: ['w'] }).ticks(5)).toEqual([0, 1, 2, 3]);
    });

    test('not if fewer than two ticks are whole, e.g. of a domain of an expression within two whole numbers', () => {
        const mapping = { type: 'numeric', scale: { type: 'linear', orientation: 'vertical', domain: [null, null], domainAbs: [0.2, -0.3] } };
        const s = makeScale('y', mapping, whole, options);
        expect(s.domain()).toEqual([0.2, 0.7]);
        expect(s.ticks(5)).toEqual([0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
    });
});

describe('the fixed values of the ticks of an axis', () => {
    test('a value without a position is no tick, e.g. 0 of a log scale, nor one outside of the domain', () => {
        const mapping = { type: 'numeric', scale: { type: 'log', orientation: 'vertical', domain: [1, 100] } };
        const s = makeScale('y', mapping, [{ y: 1 }, { y: 100 }], options);
        expect(tickValues({ values: [0, -1, 1, 10, 100, 1000] }, s, 5, mapping)).toEqual([1, 10, 100]);
    });
});

describe('zero: the domain of the data includes 0, an end at 0 is exact', () => {
    const scale = (s, rows, type = 'linear') => makeScale('y', { type: 'numeric', scale: { type, orientation: 'vertical', domain: [null, null], ...s } }, rows, options);

    test('of positive and of negative values, the other end is extended', () => {
        expect(scale({ zero: true }, [{ y: 5 }, { y: 10 }]).domain()).toEqual([0, 10.2]);
        expect(scale({ zero: true }, [{ y: -5 }, { y: -10 }]).domain()).toEqual([-10.2, 0]);
        // both signs: both ends of the data are extended, 0 is inside
        expect(scale({ zero: true, pad: 0.1 }, [{ y: -5 }, { y: 5 }]).domain()).toEqual([-6, 6]);
        // nice keeps 0, a fixed end stays
        expect(scale({ zero: true, nice: true }, [{ y: 5 }, { y: 9.3 }]).domain()).toEqual([0, 10]);
        expect(scale({ zero: true, domain: [null, 100] }, [{ y: 5 }]).domain()).toEqual([0, 100]);
        // without: the extent of the data, extended at both ends
        expect(scale({}, [{ y: 5 }, { y: 10 }]).domain()).toEqual([4.9, 10.1]);
    });

    test('not of a log scale, which has no 0', () => {
        expect(scale({ zero: true, pad: 0 }, [{ y: 5 }, { y: 50 }], 'log').domain()).toEqual([5, 50]);
    });
});

describe('pad', () => {
    test('extends both ends, positive values', async () => {
        const { makeScale } = await import('@/utils/scales');
        const rows = [{ v: 0 }, { v: 10 }];
        const scale = s => makeScale('v', { type: 'numeric', scale: { type: 'linear', orientation: 'vertical', domain: [null, null], ...s } }, rows, { coord: { ranges: { vertical: [100, 0] } } });
        expect(scale({ pad: 0.1 }).domain()).toEqual([-1, 11]);
        expect(scale({ pad: [0, 0.2] }).domain()).toEqual([0, 12]);
        // only the ends taken from the data, as the 2% it replaces, e.g. not 0 of bars
        expect(scale({ pad: 0.1, domain: [0, null] }).domain()).toEqual([0, 11]);
        expect(scale({ pad: 0.1, domain: [-5, 20] }).domain()).toEqual([-5, 20]);
    });

    test('validateDef warns of a positive start of domainAbs, domainRel is pad', async () => {
        const { validateDef } = await import('@/utils/validate');
        const def = { dims: { x: { column: 'x', type: 'numeric' }, y: { column: 'y', type: 'numeric', scale: { domainAbs: [1, 1] } } }, marks: { type: 'line' } };
        expect(validateDef(def)).toEqual([`dims.y.scale.domainAbs: a positive start shrinks the domain at its start and cuts off data (the value is added), it extends with a negative one, e.g. [-1, 1]; "pad": 0.1 extends both ends`]);
        def.dims.y.scale = { domainRel: [0.1, 0.1] };
        expect(validateDef(def)).toEqual([expect.stringMatching(/^dims\.y\.scale\.domainRel: unknown key/)]);
    });
});
