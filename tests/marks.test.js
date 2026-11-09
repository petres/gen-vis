// @vitest-environment jsdom
// the marks of 5.0 drawn of real rows: dodged bars, labels with an anchor,
// cells and rules of ranges, see utils/language.js
import { describe, test, expect } from 'vitest';
import { errors, useDom, mount } from './dom.js';
import { itemOf } from '@/utils/dom';
import { rowOf } from '@/utils/draw';

useDom();

const num = (el, attr) => Number(el.getAttribute(attr));
const rects = el => [...el.querySelectorAll('g.vis-mark rect')].filter(r => r[itemOf]);
const texts = el => [...el.querySelectorAll('g.vis-mark text')].filter(r => r[itemOf]);
const lines = el => [...el.querySelectorAll('g.vis-mark line')].filter(r => r[itemOf]);

const data = 'year,value,type\n2020,1,a\n2020,2,b\n2021,3,a\n2021,4,b';

describe('dodged bars', () => {
    test('the bars of the groups of `by` beside each other in the band of their position', async () => {
        const def = {
            dims: { x: { column: 'year', type: 'categorical' }, y: 'value', c: { column: 'type', categories: { a: '#111', b: '#222' } } },
            marks: { type: 'bar', by: 'c', dodge: true },
        };
        const el = await mount({ def, data });
        const bars = rects(el);
        expect(bars.length).toBe(4);
        const byRow = Object.fromEntries(bars.map(r => [`${r[itemOf][rowOf].x}-${r[itemOf][rowOf].c}`, r]));
        const a = byRow['2020-a'], b = byRow['2020-b'];
        // the same width, half a band each, a before b, adjacent
        expect(num(a, 'width')).toBeCloseTo(num(b, 'width'));
        expect(num(a, 'x') + num(a, 'width')).toBeCloseTo(num(b, 'x'));
        // the pair of 2020 is left of the pair of 2021
        expect(num(byRow['2020-b'], 'x')).toBeLessThan(num(byRow['2021-a'], 'x'));
        // the colors of the categories
        expect(a.getAttribute('fill')).toBe('#111');
        expect(b.getAttribute('fill')).toBe('#222');
        expect(errors).toEqual([]);
    });

    test('the bars of a dim without categories (the values of the rows) and of another dim than `by`', async () => {
        const def = {
            dims: { x: { column: 'year', type: 'categorical' }, y: 'value', c: 'type' },
            marks: { type: 'bar', by: 'c', dodge: 'c', fill: '#333' },
        };
        const el = await mount({ def, data });
        const bars = rects(el);
        expect(bars.length).toBe(4);
        const of2020 = bars.filter(r => r[itemOf][rowOf].x == '2020').sort((p, q) => num(p, 'x') - num(q, 'x'));
        expect(of2020.map(r => r[itemOf][rowOf].c)).toEqual(['a', 'b']);
        expect(num(of2020[0], 'x') + num(of2020[0], 'width')).toBeCloseTo(num(of2020[1], 'x'));
        expect(errors).toEqual([]);
    });

    test('a hidden category leaves its place to the others', async () => {
        const def = {
            dims: { x: { column: 'year', type: 'categorical' }, y: 'value', c: { column: 'type', categories: { a: {}, b: { visible: false } } } },
            marks: { type: 'bar', by: 'c', dodge: true },
        };
        const el = await mount({ def, data });
        const bars = rects(el);
        expect(bars.map(r => r[itemOf][rowOf].c)).toEqual(['a', 'a']);
        const full = await mount({ def: { ...def, dims: { ...def.dims, c: { column: 'type', categories: { a: {}, b: {} } } } }, data });
        // a bar of one category is as wide as the band, of two half of it
        expect(num(rects(el)[0], 'width')).toBeCloseTo(2*num(rects(full)[0], 'width'));
        expect(errors).toEqual([]);
    });
});

describe('the slots of a dodge dim without categories', () => {
    test('the same slots in all facets: the values of all rows', async () => {
        const rows = 'year,value,type,f\n2020,1,a,F1\n2020,2,b,F1\n2020,3,c,F1\n2020,3,a,F2\n2020,4,c,F2';
        const def = {
            dims: { x: { column: 'year', type: 'categorical' }, y: 'value', c: 'type', f: 'f' },
            facets: { by: 'f', cols: 2 },
            marks: { type: 'bar', by: 'c', dodge: true, fill: '#333' },
        };
        const el = await mount({ def, data: rows });
        const bars = rects(el).map(r => ({ f: r[itemOf][rowOf].f, c: r[itemOf][rowOf].c, x: num(r, 'x'), w: num(r, 'width') }));
        const of = (f, c) => bars.find(b => b.f == f && b.c == c);
        expect(of('F1', 'a').w).toBeCloseTo(of('F2', 'a').w);
        // c is in the third slot of both facets, a gap of the slot of b in F2
        expect(of('F2', 'c').x - of('F2', 'a').x).toBeCloseTo(of('F1', 'c').x - of('F1', 'a').x);
        expect(errors).toEqual([]);
    });

    test('a label of a filtered mark at the slot of its bar', async () => {
        const rows = 'year,value,type\n2020,1,a\n2020,2,b\n2020,3,c';
        const def = {
            dims: { x: { column: 'year', type: 'categorical' }, y: 'value', c: 'type' },
            marks: [{ type: 'bar', by: 'c', dodge: true, fill: '#333' }, { type: 'label', by: 'c', dodge: true, filter: { c: 'c' }, text: '@y', anchor: 'top' }],
        };
        const el = await mount({ def, data: rows });
        const bar = rects(el).find(r => r[itemOf][rowOf].c == 'c');
        expect(num(texts(el)[0], 'x')).toBeCloseTo(num(bar, 'x') + num(bar, 'width')/2);
        expect(errors).toEqual([]);
    });

    test('a row without a value takes no slot', async () => {
        const rows = 'year,value,type\n2020,1,a\n2020,2,\n2020,3,b';
        const def = {
            dims: { x: { column: 'year', type: 'categorical' }, y: 'value', c: 'type' },
            marks: { type: 'bar', dodge: 'c', fill: '#333' },
        };
        const el = await mount({ def, data: rows });
        const bars = rects(el).filter(r => Number.isFinite(num(r, 'x')) && r.getAttribute('x') !== null);
        // two slots of a and b, adjacent, each half of the band
        const [a, b] = ['a', 'b'].map(c => bars.find(r => r[itemOf][rowOf].c == c));
        expect(num(a, 'x') + num(a, 'width')).toBeCloseTo(num(b, 'x'));
        expect(bars.filter(r => r[itemOf][rowOf].c === null).length).toBe(0);
    });

    test('dodged bars on dates of an interval: slots of 80% of the period', async () => {
        const rows = 'year,value,type\n2020-01-01,1,a\n2020-01-01,2,b\n2021-01-01,3,a\n2021-01-01,4,b';
        const def = {
            dims: { x: { column: 'year', type: 'date', interval: 'year' }, y: { column: 'value', zero: true }, c: { column: 'type', categories: { a: {}, b: {} } } },
            marks: [{ type: 'bar', by: 'c', dodge: true }, { type: 'label', by: 'c', dodge: true, text: '@y', anchor: 'top' }],
        };
        const el = await mount({ def, data: rows });
        const bars = rects(el);
        expect(bars.length).toBe(4);
        const [a, b] = ['a', 'b'].map(c => bars.find(r => r[itemOf][rowOf].c == c));
        expect(num(a, 'width')).toBeGreaterThan(10);
        expect(num(a, 'x') + num(a, 'width')).toBeCloseTo(num(b, 'x'));
        const next = bars.find(r => r[itemOf][rowOf].c == 'a' && r !== a);
        // the two slots are 80% of the period of a year
        expect(2*num(a, 'width')).toBeCloseTo(0.8*(num(next, 'x') - num(a, 'x')), 0);
        const label = texts(el).find(t => t[itemOf][rowOf].c == 'b');
        const bar = bars.find(r => r[itemOf][rowOf] === label[itemOf][rowOf]) ?? b;
        expect(num(label, 'x')).toBeCloseTo(num(bar, 'x') + num(bar, 'width')/2);
        expect(errors).toEqual([]);
    });
});

describe('dodged stacked bars', () => {
    test('a stack per slot of the dodge dim, not over all rows of the x, also of the domain', async () => {
        const rows = 'year,value,type,sub\n2020,15,a,p\n2020,20,a,q\n2020,10,b,p\n2020,20,b,q';
        const def = {
            dims: { x: { column: 'year', type: 'categorical' }, y: { column: 'value', zero: true }, c: { column: 'type', categories: { a: {}, b: {} } },
                s: { column: 'sub', categories: { p: {}, q: {} } } },
            marks: { type: 'bar', by: ['c', 's'], dodge: 'c', stack: true },
        };
        const el = await mount({ def, data: rows });
        const bars = Object.fromEntries(rects(el).map(r => [`${r[itemOf][rowOf].c}${r[itemOf][rowOf].s}`, r]));
        const bottom = r => num(r, 'y') + num(r, 'height');
        // both stacks start at 0, q on top of p in its own slot
        expect(bottom(bars.ap)).toBeCloseTo(bottom(bars.bp));
        expect(bottom(bars.aq)).toBeCloseTo(num(bars.ap, 'y'));
        expect(bottom(bars.bq)).toBeCloseTo(num(bars.bp, 'y'));
        // the domain is the one of the highest stack (35), not of all (65)
        const ticks = [...el.querySelectorAll('[data-dim="y"] .tick text')].map(t => Number(t.textContent));
        expect(Math.max(...ticks)).toBe(35);
        expect(num(bars.ap, 'x') + num(bars.ap, 'width')).toBeCloseTo(num(bars.bp, 'x'));
        expect(errors).toEqual([]);
    });
});

describe('labels with an anchor', () => {
    test('the text of a value beside its bar', async () => {
        const def = {
            dims: { x: { column: 'year', type: 'categorical' }, y: 'value', c: 'type' },
            filter: { c: 'a' },
            marks: [
                { type: 'bar' },
                { type: 'label', text: '@y:formatted', anchor: 'top' },
            ],
        };
        const el = await mount({ def, data });
        const labels = texts(el);
        expect(labels.map(t => t.textContent)).toEqual(['1', '3']);
        // above the position, centered on the band, no fill of its own
        labels.forEach(t => {
            expect(t.getAttribute('dy')).toBe('-4');
            expect(t.getAttribute('text-anchor')).toBe('middle');
            expect(t.getAttribute('fill')).toBeNull();
        });
        const bar = rects(el)[0];
        expect(num(labels[0], 'x')).toBeCloseTo(num(bar, 'x') + num(bar, 'width')/2);
        expect(num(labels[0], 'y')).toBeCloseTo(num(bar, 'y'));
        expect(errors).toEqual([]);
    });

    test('a label at the end of a horizontal bar', async () => {
        const def = {
            dims: { x: 'value', y: { column: 'type', type: 'categorical' }, year: 'year' },
            filter: { year: '2020' },
            marks: [{ type: 'bar' }, { type: 'label', text: '@x:formatted', anchor: 'end' }],
        };
        const el = await mount({ def, data });
        const labels = texts(el);
        expect(labels.map(t => t.textContent)).toEqual(['1', '2']);
        labels.forEach(t => {
            expect(t.getAttribute('dx')).toBe('4');
            expect(t.getAttribute('text-anchor')).toBe('start');
            expect(t.getAttribute('dominant-baseline')).toBe('middle');
        });
        const bar = rects(el)[0];
        expect(num(labels[0], 'x')).toBeCloseTo(num(bar, 'x') + num(bar, 'width'));
        expect(num(labels[0], 'y')).toBeCloseTo(num(bar, 'y') + num(bar, 'height')/2);
        expect(errors).toEqual([]);
    });
});

describe('cells', () => {
    test('a rect of the bands of x and y, filled by the scale of a dim', async () => {
        const def = {
            dims: {
                x: { column: 'year', type: 'categorical' }, y: { column: 'type', type: 'categorical' },
                v: { column: 'value', domain: [0, 4], scale: { type: 'sequential', interpolator: 'Blues' } },
            },
            marks: { type: 'cell', fill: 'v' },
        };
        const el = await mount({ def, data });
        const cells = rects(el);
        expect(cells.length).toBe(4);
        const widths = new Set(cells.map(r => num(r, 'width').toFixed(3)));
        const heights = new Set(cells.map(r => num(r, 'height').toFixed(3)));
        expect(widths.size).toBe(1);
        expect(heights.size).toBe(1);
        expect(num(cells[0], 'width')).toBeGreaterThan(0);
        // the colors of the values, darker of a larger one
        const fills = cells.map(r => r.getAttribute('fill'));
        expect(new Set(fills).size).toBe(4);
        // next to each other, the bands have no padding
        const xs = [...new Set(cells.map(r => num(r, 'x')))].sort((a, b) => a - b);
        expect(xs[0] + num(cells[0], 'width')).toBeCloseTo(xs[1]);
        expect(errors).toEqual([]);
    });

    test('the padding of a scale of the dim stays', async () => {
        const def = {
            dims: { x: { column: 'year', type: 'categorical', scale: { padding: 0.5 } }, y: { column: 'type', type: 'categorical' }, v: 'value' },
            marks: { type: 'cell', fill: 'v' },
        };
        const cells = rects(await mount({ def, data }));
        const xs = [...new Set(cells.map(r => num(r, 'x')))].sort((a, b) => a - b);
        expect(xs[1] - xs[0]).toBeCloseTo(2*num(cells[0], 'width'));
    });
});

describe('rules', () => {
    test('a rule from a dim to another one, e.g. an error bar, and one at a value across the plot', async () => {
        const def = {
            dims: { x: { column: 'year', type: 'categorical' }, y: { column: 'value', domain: [0, 10] }, lo: 'lo', hi: 'hi' },
            marks: [
                { type: 'rule', y1: 'lo', y2: 'hi', stroke: '#333' },
                { type: 'rule', y: 5, 'stroke-dasharray': '2 2' },
            ],
        };
        const rows = 'year,value,lo,hi\n2020,2,1,3\n2021,6,4,8';
        const el = await mount({ def, data: rows });
        const all = lines(el);
        const bars = all.filter(l => l.getAttribute('stroke') == '#333');
        expect(bars.length).toBe(2);
        // the ends of the range, at the band of the category
        const [first] = bars;
        expect(num(first, 'y1')).toBeGreaterThan(num(first, 'y2'));
        expect(num(first, 'x1')).toBeCloseTo(num(first, 'x2'));
        // the second rule at the value 5, horizontal across the plot area
        const at = all.filter(l => l.getAttribute('stroke-dasharray') == '2 2');
        expect(at.length).toBeGreaterThan(0);
        expect(num(at[0], 'y1')).toBeCloseTo(num(at[0], 'y2'));
        expect(num(at[0], 'x2')).toBeGreaterThan(num(at[0], 'x1'));
        expect(errors).toEqual([]);
    });
});

describe('dodged rules and points', () => {
    test('error bars and points on dodged bars: in the slot of their bar', async () => {
        const rows = 'year,value,type,lo,hi\n2020,2,a,1,3\n2020,5,b,4,6\n2021,6,a,5,7\n2021,3,b,2,4';
        const def = {
            dims: { x: { column: 'year', type: 'categorical' }, y: { column: 'value', domain: [0, 10] }, c: { column: 'type', categories: { a: {}, b: {} } }, lo: 'lo', hi: 'hi' },
            marks: [
                { type: 'bar', by: 'c', dodge: true },
                { type: 'rule', by: 'c', dodge: true, y1: 'lo', y2: 'hi', stroke: '#333' },
                { type: 'point', by: 'c', dodge: true, r: 2 },
            ],
        };
        const el = await mount({ def, data: rows });
        const bars = rects(el);
        const rules = lines(el);
        const points = [...el.querySelectorAll('g.vis-mark circle')].filter(r => r[itemOf]);
        expect(rules.length).toBe(4);
        expect(points.length).toBe(4);
        bars.forEach(b => {
            const row = b[itemOf][rowOf];
            const center = num(b, 'x') + num(b, 'width')/2;
            const rule = rules.find(l => l[itemOf][rowOf] === row);
            // at the half pixel of the ticks
            expect(Math.abs(num(rule, 'x1') - center)).toBeLessThanOrEqual(0.5);
            const point = points.find(c => c[itemOf][rowOf] === row);
            expect(num(point, 'cx')).toBeCloseTo(center);
        });
        expect(errors).toEqual([]);
    });

    test('a horizontal rule on dodged horizontal bars', async () => {
        const rows = 'land,value,type,lo,hi\nW,2,a,1,3\nW,5,b,4,6';
        const def = {
            dims: { y: { column: 'land', type: 'categorical' }, x: { column: 'value', domain: [0, 10] }, c: { column: 'type', categories: { a: {}, b: {} } }, lo: 'lo', hi: 'hi' },
            marks: [{ type: 'bar', by: 'c', dodge: true }, { type: 'rule', by: 'c', dodge: true, y: 'y', x1: 'lo', x2: 'hi' }],
        };
        const el = await mount({ def, data: rows });
        rects(el).forEach(b => {
            const rule = lines(el).find(l => l[itemOf][rowOf] === b[itemOf][rowOf]);
            expect(Math.abs(num(rule, 'y1') - (num(b, 'y') + num(b, 'height')/2))).toBeLessThanOrEqual(0.5);
        });
        expect(errors).toEqual([]);
    });
});

describe('the reverse of a scale', () => {
    test('the largest value at the bottom', async () => {
        const def = {
            dims: { x: { column: 'year', type: 'categorical' }, y: { column: 'value', zero: true }, c: 'type' },
            marks: { type: 'point', filter: '@c == "a"' },
        };
        const el = await mount({ def, data });
        const up = [...el.querySelectorAll('g.vis-mark circle')].map(c => num(c, 'cy'));
        const down = [...(await mount({ def: { ...def, dims: { ...def.dims, y: { ...def.dims.y, reverse: true } } }, data })).querySelectorAll('g.vis-mark circle')].map(c => num(c, 'cy'));
        // the value 3 is above the value 1, reversed below it
        expect(up[1]).toBeLessThan(up[0]);
        expect(down[1]).toBeGreaterThan(down[0]);
        expect(errors).toEqual([]);
    });
});

describe('fixes of the review of the docs', () => {
    test('a rule at a categorical position is at the center of its band, as the bars', async () => {
        const def = {
            dims: { x: { column: 'year', type: 'categorical' }, y: { column: 'value', domain: [0, 10] }, lo: 'lo', hi: 'hi' },
            marks: [{ type: 'bar' }, { type: 'rule', y1: 'lo', y2: 'hi', stroke: '#333' }],
        };
        const el = await mount({ def, data: 'year,value,lo,hi\n2020,2,1,3\n2021,6,4,8' });
        const bar = rects(el)[0];
        const rule = lines(el).find(l => l.getAttribute('stroke') == '#333');
        // the rule at the half pixel of the center, see utils/axis.js
        expect(Math.abs(num(rule, 'x1') - (num(bar, 'x') + num(bar, 'width')/2))).toBeLessThanOrEqual(1);
        expect(errors).toEqual([]);
    });

    test('a dim of a text of a parent merged with an object of a child keeps the column', async () => {
        const { mergeAll } = await import('@/utils/def');
        expect(mergeAll([{ dims: { facet: 'group' } }, { dims: { facet: { categories: { a: {} } } } }]).dims.facet).toEqual({ column: 'group', categories: { a: {} } });
    });

    test('"auto" of all margins of a definition is the same as no margins (the styles, the defaults, else measured)', async () => {
        const { prepareDef } = await import('@/utils/def');
        const { translate } = await import('@/utils/language');
        const { normalize } = await import('@/utils/normalize');
        const { plotTypes } = await import('@/plots');
        const def = prepareDef(normalize(translate({ margins: 'auto', dims: { x: 'a', y: 'b' }, marks: { type: 'line' } }), { plotTypes }));
        expect(def.options.margins).toEqual({});
    });
});

describe('the orientation of bars of a dim without a type', () => {
    const rows = 'land,value\nWien,1\nTirol,3';
    test('horizontal bars of a column of names beside a continuous x, also with the shorthands of its scale', async () => {
        for (const y of ['land', { column: 'land', reverse: true }, { column: 'land', range: [0, 100] }, { column: 'land', scale: { order: 'ascending' } },
            { column: 'land', scale: { padding: 0.1 } }]) {
            const def = { dims: { y, x: { column: 'value', zero: true } }, marks: [{ type: 'bar' }, { type: 'label', text: '@x', anchor: 'end' }] };
            const el = await mount({ def, data: rows });
            expect(el.querySelector('.vis-error')).toBeNull();
            const bars = rects(el);
            expect(bars).toHaveLength(2);
            // the length of the bar is its value, its label at the middle of its band
            const [wien, tirol] = ['Wien', 'Tirol'].map(l => bars.find(b => b[itemOf][rowOf].y == l));
            expect(num(tirol, 'width')).toBeCloseTo(3*num(wien, 'width'));
            const label = texts(el).find(t => t[itemOf][rowOf].y == 'Wien');
            expect(num(label, 'y')).toBeCloseTo(num(wien, 'y') + num(wien, 'height')/2);
        }
        expect(errors).toEqual([]);
    });
});

describe('the base of bars and areas', () => {
    const margins = { top: 0, right: 0, bottom: 0, left: 0 };
    const bars = async (y, data, marks = { type: 'bar' }, extra = {}) => {
        const el = await mount({ def: { height: 100, width: 200, margins, dims: { x: { column: 'a', type: 'categorical' }, y }, marks, ...extra }, data });
        return el;
    };
    const ends = el => rects(el).map(r => [Math.round(num(r, 'y')), Math.round(num(r, 'y') + num(r, 'height'))]);

    test('bars without zero start at the axis: the domain of the data includes 0', async () => {
        // 5 is half of 10, not a sliver above the 2% below 5
        const el = await bars('b', 'a,b\nA,5\nB,10');
        const [a, b] = ends(el);
        expect(a[1]).toBe(100);
        expect(b[1]).toBe(100);
        expect((a[1] - a[0])/(b[1] - b[0])).toBeCloseTo(0.5, 5);
        // of negative values from the top, of both signs from 0 inside
        expect(ends(await bars('b', 'a,b\nA,-5\nB,-10')).map(e => e[0])).toEqual([0, 0]);
        const both = ends(await bars('b', 'a,b\nA,-5\nB,10'));
        expect(both[0][0]).toBe(both[1][1]);
        expect(both[0][0]).toBeGreaterThan(0);
        expect(errors).toEqual([]);
    });

    test('zero: true includes 0, negative values hang below it within the plot', async () => {
        const [a, b] = ends(await bars({ column: 'b', zero: true }, 'a,b\nA,-5\nB,10'));
        expect(a[1]).toBeLessThanOrEqual(100);
        expect(a[0]).toBe(b[1]);
        expect(errors).toEqual([]);
    });

    test('a fixed domain without 0: the bars start at the edge of the plot area', async () => {
        const el = await bars({ column: 'b', domain: [4, 10] }, 'a,b\nA,5\nB,10');
        expect(ends(el)).toEqual([[83, 100], [0, 100]]);
        expect(errors).toEqual([]);
    });

    test('a log scale: the bars start at the end of the domain nearest to 0, areas at its start', async () => {
        const y = { column: 'b', scale: { type: 'log' }, pad: 0 };
        const el = await bars(y, 'a,b\nA,1\nB,100');
        expect(ends(el)).toEqual([[100, 100], [0, 100]]);
        const area = await mount({ def: { height: 100, width: 200, margins, dims: { x: 'a', y }, marks: { type: 'area' } }, data: 'a,b\n1,1\n2,100' });
        expect(area.querySelector('g.vis-mark path').getAttribute('d')).not.toMatch(/NaN/);
        expect(errors).toEqual([]);
    });
});

describe('the default fill of bars, areas and arcs without categories', () => {
    test('the first of the default colors of categories, not the color of the text', async () => {
        const fills = async (marks, coord) => {
            const el = await mount({ def: { ...(coord ? { coord } : {}), dims: { x: { column: 'year', type: 'categorical' }, y: 'value' }, marks }, data });
            return [...el.querySelectorAll('g.vis-mark rect, g.vis-mark path')].map(e => e.getAttribute('fill'));
        };
        expect(new Set(await fills({ type: 'bar' }))).toEqual(new Set(['#4269D0']));
        expect(await fills({ type: 'area' })).toEqual(['#4269D0']);
        expect(new Set(await fills({ type: 'arc', y: 'value' }, 'polar'))).toEqual(new Set(['#4269D0']));
        // a fill of its own, the color of the text, lines and points as before
        expect(new Set(await fills({ type: 'bar', fill: 'currentColor' }))).toEqual(new Set(['currentColor']));
        expect(await fills({ type: 'line' })).toEqual(['none']);
        expect(errors).toEqual([]);
    });
});
