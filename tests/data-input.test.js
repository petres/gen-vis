// @vitest-environment jsdom
// the data as it comes (review of the release of 5.0): odd values, the order
// of the rows, missing rows and columns
import { describe, test, expect, vi } from 'vitest';
import { errors, useDom, mount } from './dom.js';

useDom();

const legendKeys = el => [...el.querySelectorAll('.vis-legend [data-key]')].map(e => e.getAttribute('data-key'));

describe('the categories of the data in the order of the rows', () => {
    test('also integers, of the legend and of the stacks', async () => {
        const def = { dims: { x: 'a', y: 'b', c: { column: 'c', legend: {} } }, marks: [{ type: 'line', by: 'c' }] };
        let el = await mount({ def, data: 'a,b,c\n1,1,2024\n1,2,2023\n1,3,Total\n1,4,2022\n2,1,2024\n2,2,2023\n2,3,Total\n2,4,2022' });
        expect(legendKeys(el)).toEqual(['2024', '2023', 'Total', '2022']);
        el = await mount({ def, data: 'a,b,c\n1,1,B\n1,2,01\n1,3,1\n2,1,B\n2,2,01\n2,3,1' });
        expect(legendKeys(el)).toEqual(['B', '01', '1']);
        // the stacks from the bottom in the order of the categories
        el = await mount({ def: { dims: { x: 'a', y: 'b', c: { column: 'c', legend: {} } }, marks: [{ type: 'bar', by: 'c', stack: true }] }, data: 'a,b,c\nX,1,Zeta\nX,2,10\nX,3,Alpha' });
        expect(legendKeys(el)).toEqual(['Zeta', '10', 'Alpha']);
        const bottom = rect => parseFloat(rect.getAttribute('y')) + parseFloat(rect.getAttribute('height'));
        const rects = [...el.querySelectorAll('g.vis-mark rect')].sort((a, b) => bottom(b) - bottom(a));
        expect(rects.map(r => r.closest('[data-group-c]')?.getAttribute('data-group-c') ?? r.getAttribute('data-group-c'))).toEqual(['Zeta', '10', 'Alpha']);
        expect(errors).toEqual([]);
    });

    test('a category __proto__ keeps its rows', async () => {
        const el = await mount({ def: { dims: { x: 'a', y: 'b', c: { column: 'c', legend: {} } }, marks: [{ type: 'line', by: 'c' }, { type: 'point', by: 'c' }] },
            data: 'a,b,c\n1,2,__proto__\n2,3,__proto__\n1,4,B\n2,5,B' });
        expect(legendKeys(el)).toEqual(['__proto__', 'B']);
        expect(el.querySelectorAll('g.vis-mark circle').length).toBe(4);
        expect(errors).toEqual([]);
    });
});

describe('texts among numbers', () => {
    const bars = y => ({ dims: { x: 'a', y }, marks: [{ type: 'bar' }] });
    const heights = el => [...el.querySelectorAll('g.vis-mark rect')].map(r => r.getAttribute('height'));

    test('the usual texts of missing values are missing values, without a warning', async () => {
        const el = await mount({ def: bars({ column: 'b', zero: true }), data: 'a,b\nA,10\nB,NA\nC,30\nD,:\nE,-' });
        const ticks = [...el.querySelectorAll('.vis-axis-left .tick text, .vis-axis.left .tick text')].map(t => t.textContent);
        expect(ticks.length).toBeGreaterThan(0);
        expect(ticks).not.toContain('NA');
        expect(heights(el).length).toBe(2);
        expect(heights(el).every(h => Number.isFinite(parseFloat(h)))).toBe(true);
        expect(errors).toEqual([]);
    });

    test('other texts with digits among more numbers are missing values with a warning', async () => {
        const el = await mount({ def: bars('b'), data: 'a,b\nA,10\nB,"1,234"\nC,30\nD,5' });
        expect(heights(el).length).toBe(3);
        expect(errors).toEqual(["gen-vis inline definition: dims.y: values of the column 'b' are no numbers, they are missing: '1,234' (1 row) (a number is written as 1234.5, without a separator of thousands)"]);
    });

    test('the parts of numbers make a dim numeric, e.g. a number format', async () => {
        const el = await mount({ def: bars({ column: 'b', format: ',.1f', zero: true }), data: 'a,b\nA,10\nB,unknown\nC,30' });
        expect(heights(el).length).toBe(2);
        expect(errors).toEqual(["gen-vis inline definition: dims.y: values of the column 'b' are no numbers, they are missing: 'unknown' (1 row)"]);
    });
});

describe('lines and areas along x, not in the order of the rows', () => {
    const def = (marks, dims = { x: 'a', y: 'b' }) => ({ width: 600, margins: { left: 40, right: 60, top: 10, bottom: 30 }, dims, marks });
    // the x of the points of a path
    const xs = d => [...d.matchAll(/[ML]([-\d.]+),/g)].map(m => parseFloat(m[1]));
    const ascending = v => v.every((x, i) => i == 0 || v[i - 1] <= x);
    const paths = el => [...el.querySelectorAll('g[data-mark] path')].map(p => p.getAttribute('d'));

    test('unsorted numbers and dates, the label of select last at the end', async () => {
        let el = await mount({ def: def([{ type: 'line' }, { type: 'label', select: 'last', text: 'last' }]), data: 'a,b\n3,2\n1,3\n2,4' });
        expect(ascending(xs(paths(el)[0]))).toBe(true);
        const label = el.querySelector('g[data-mark] text');
        expect(parseFloat(label.getAttribute('x'))).toBeCloseTo(Math.max(...xs(paths(el)[0])));
        el = await mount({ def: def([{ type: 'line' }, { type: 'label', select: 'first', text: 'first' }]), data: 'a,b\n2024-03-01,1\n2024-01-01,3\n2024-02-01,2' });
        expect(ascending(xs(paths(el)[0]))).toBe(true);
        expect(parseFloat(el.querySelector('g[data-mark] text').getAttribute('x'))).toBeCloseTo(Math.min(...xs(paths(el)[0])));
        // an area: the upper edge along x
        el = await mount({ def: def([{ type: 'area' }]), data: 'a,b\n3,2\n1,3\n2,4' });
        const upper = xs(paths(el)[0]).slice(0, 3);
        expect(ascending(upper)).toBe(true);
        expect(errors).toEqual([]);
    });

    test('"order": "rows" keeps the order of the rows, e.g. a connected scatter plot', async () => {
        const el = await mount({ def: def([{ type: 'line', order: 'rows' }, { type: 'label', order: 'rows', select: 'last', text: 'last' }]), data: 'a,b\n3,2\n1,3\n2,4' });
        const x = xs(paths(el)[0]);
        expect(x[0]).toBeGreaterThan(x[1]);
        expect(parseFloat(el.querySelector('g[data-mark] text').getAttribute('x'))).toBeCloseTo(x[2]);
        expect(errors).toEqual([]);
    });

    test('along a categorical y if x is continuous, in the order of its categories', async () => {
        const el = await mount({ def: def([{ type: 'line' }], { x: 'b', y: { column: 'a', categories: { A: {}, B: {}, C: {} } } }), data: 'a,b\nC,3\nA,1\nB,2' });
        const ys = [...paths(el)[0].matchAll(/[ML][-\d.]+,([-\d.]+)/g)].map(m => parseFloat(m[1]));
        // A at the top (vertical bands top-down), then B and C
        expect(ascending(ys)).toBe(true);
        expect(errors).toEqual([]);
    });
});

describe('data without rows and data which is no data', () => {
    const def = { dims: { x: 'a', y: 'b' }, marks: [{ type: 'line' }] };

    test('no rows: a warning, unless the definition has a text of empty; the columns of the header are checked', async () => {
        await mount({ def, data: 'a,b\n' });
        expect(errors).toEqual(["gen-vis inline definition: the data of the attribute: no rows (only the header 'a', 'b'), the chart is empty; 'empty' is a text instead of the marks"]);
        errors.length = 0;
        const el = await mount({ def: { ...def, empty: 'No data' }, data: 'a,b\n' });
        expect(el.textContent).toContain('No data');
        expect(errors).toEqual([]);
        // a column of no dim which is not in the header
        await mount({ def: { ...def, empty: 'No data', marks: [{ type: 'line', y: 'c' }] }, data: 'a,b\n' });
        expect(errors).toEqual(["gen-vis inline definition: marks[0].y: no dim and no column 'c' in the data, the dims are 'x', 'y', the columns 'a', 'b'"]);
        errors.length = 0;
        await mount({ def, data: '[]' });
        expect(errors).toEqual(["gen-vis inline definition: the data of the attribute: no rows, the chart is empty; 'empty' is a text instead of the marks"]);
        // not of rows of the page, e.g. none while they are loaded
        errors.length = 0;
        await mount({ def, data: [] });
        expect(errors).toEqual([]);
    });

    test('a page of HTML of the url of the data is an error', async () => {
        vi.stubGlobal('fetch', async () => new Response('<!doctype html><html><body>App</body></html>', { status: 200 }));
        const el = await mount({ def: { $schema: 'https://unpkg.com/@preschen/gen-vis@5/schema.json', data: 'missing.csv', ...def } });
        expect(el.textContent).toContain('it is a page of HTML, not CSV, e.g. the page a server answers for a wrong url');
    });

    test('a null row is left out with a warning', async () => {
        const el = await mount({ def, data: [null, { a: 1, b: 2 }, { a: 2, b: 3 }] });
        expect(el.querySelectorAll('g[data-mark] path').length).toBe(1);
        expect(errors).toEqual(['gen-vis inline definition: the data of the attribute: the row 0 (counted from 0) is null, not an object of values, it is left out']);
    });
});
