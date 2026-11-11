// @vitest-environment jsdom
// the messages of the load and the draw in the words and paths of the
// definition of 5.0: marks[0], dims, channels, "facets.by"
import { describe, test, expect, vi } from 'vitest';
import { errors, useDom, mount } from './dom.js';

useDom();

const data = 'year,value,land\n2020,1,Wien\n2021,2,Wien\n2020,3,Tirol\n2021,4,Tirol';
const def = (more = {}) => ({
    height: 200, margins: { top: 10, right: 10, bottom: 30, left: 30 },
    dims: { x: { column: 'year', type: 'numeric' }, y: { column: 'value', type: 'numeric' }, land: 'land' },
    marks: { type: 'line', by: 'land' },
    ...more,
});
const errorOf = async d => (await mount({ def: d, data })).querySelector('.vis-error')?.textContent;

describe('the messages of the draw', () => {
    test('an unknown mark type, of a typo the name it probably is', async () => {
        expect(await errorOf(def({ marks: { type: 'lines', by: 'land' } }))).toBe("marks[0].type: unknown mark type 'lines', did you mean 'line'?");
        expect(await errorOf(def({ marks: [{ type: 'line' }, { type: 'pont' }] }))).toBe("marks[1].type: unknown mark type 'pont', did you mean 'point'?");
        expect(await errorOf(def({ marks: { type: 'wiggle' } }))).toBe("marks[0].type: unknown mark type 'wiggle', e.g. 'line', 'bar' or 'point'");
    });

    test('an error of a mark type names the mark, also by its id', async () => {
        const bars = { type: 'bar', id: 'bars', by: 'land' };
        expect(await errorOf(def({ marks: [{ type: 'line' }, bars] })))
            .toBe(`marks[1] ('bars'): the bars of a continuous scale need a 'width' in pixels, e.g. "width": 8, a categorical dim of their position or an "interval" of dates (horizontal bars: "orient": "horizontal" or "type": "categorical" of the dim y, the orientation follows from the dims as the definition declares them, not from the data)`);
    });

    test('the errors of the load and of the scales name the parts of the definition, not the engine', async () => {
        const d = def();
        d.dims.y.scale = 'linear';
        expect(await errorOf(d)).toBe('dims.y.scale: expected an object, e.g. {}');
        expect(await errorOf(def({ marks: { type: 'line', by: 5 } }))).toBe('marks[0].by: expected a dim or a list of dims, e.g. "land", not 5');
        const domain = def();
        domain.dims.y.domain = 'auto';
        expect(await errorOf(domain)).toMatch(/^dims\.y\.scale: /);
    });

    test('a format of numbers which d3 has not names its dim', async () => {
        const d = def();
        d.dims.y.format = '%,.0f';
        expect(await errorOf(d)).toMatch(/^dims\.y\.format: '%,\.0f' is no d3 format of numbers \(invalid format: %,\.0f\), e\.g\. ",\.0f"$/);
    });

    test('the facets of an unknown dim and of one without categories', async () => {
        expect(await errorOf(def({ facets: { by: 'nope' } }))).toBe("facets.by: unknown dim 'nope', the dims are 'x', 'y', 'land'");
        expect(await errorOf(def({ facets: { by: { rows: 'nope' } } }))).toBe("facets.by.rows: unknown dim 'nope', the dims are 'x', 'y', 'land'");
        // facets without their dim, e.g. of only the number of columns
        expect(await errorOf(def({ facets: { cols: 2 } }))).toBe('facets.by: the facets need the dim of their categories, e.g. "by": "country"');
        // the values of a numeric dim are its categories
        expect(await errorOf(def({ facets: { by: 'y' } }))).toBeUndefined();
    });

    test('a mark none of whose rows is drawn: the mark, the dim and a column which is not in the data', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const d = def();
            d.dims.x.column = 'yaer';
            await mount({ def: d, data });
            expect(warn).toHaveBeenCalledWith(expect.stringContaining(
                `marks[0]: none of its 4 rows is drawn, 4 without a value of dim 'x' (column 'yaer' is not in the data)`));
            // a column of the data whose values are missing has no note
            warn.mockClear();
            await mount({ def: def(), data: 'year,value,land\n2020,,Wien\n2021,,Wien' });
            expect(warn).toHaveBeenCalledWith(expect.stringMatching(/marks\[0\]: none of its 2 rows is drawn, 2 without a value of dim 'y'$/));
        } finally {
            warn.mockRestore();
            errors.length = 0;
        }
    });

    test('a log scale: the values it has no position of, zero and stacks, once per dim', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const y = { column: 'value', type: 'numeric', scale: { type: 'log' } };
            await mount({ def: def({ dims: { ...def().dims, y }, marks: { type: 'point' } }), data: 'year,value,land\n2020,0,Wien\n2021,-2,Wien\n2022,10,Wien\n2023,0,Wien' });
            expect(warn.mock.calls.map(c => c[0]).filter(m => m.includes('dims.y'))).toEqual([expect.stringContaining(
                `dims.y.scale: a log scale has no position of 0 and of values of the other sign, 3 of 4 values of dim 'y' are not drawn (0, -2), e.g. "type": "symlog" has them`)]);
            warn.mockClear();
            await mount({ def: def({ dims: { ...def().dims, y: { ...y, zero: true } }, marks: { type: 'point' } }), data });
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('dims.y.scale: a log scale has no 0, `zero` is ignored'));
        } finally {
            warn.mockRestore();
            errors.length = 0;
        }
    });

    test('an unknown dim of a filter object, the expressions read columns', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            await mount({ def: def({ marks: { type: 'line', by: 'land', filter: { year: 2020 } } }), data });
            expect(warn).toHaveBeenCalledWith(expect.stringContaining(
                `marks[0].filter.year: unknown dim 'year', the keys of a filter object are the names of dims, not columns (an expression reads columns, e.g. "@year == 1"), no row is drawn`));
        } finally {
            warn.mockRestore();
            errors.length = 0;
        }
    });
});
