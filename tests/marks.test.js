// @vitest-environment jsdom
// the marks of 5.0 drawn of real rows: dodged bars, labels with an anchor,
// cells and rules of ranges, see utils/language.js
import { describe, test, expect } from 'vitest';
import { errors, useDom, mount } from './dom.js';
import { itemOf } from '@/utils/dom';
import { rowOf } from '@/utils/draw';

useDom();

const num = (el, attr) => Number(el.getAttribute(attr));
const rects = el => [...el.querySelectorAll('g.vis-plot rect')].filter(r => r[itemOf]);
const texts = el => [...el.querySelectorAll('g.vis-plot text')].filter(r => r[itemOf]);
const lines = el => [...el.querySelectorAll('g.vis-plot line')].filter(r => r[itemOf]);

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
        const ticks = [...el.querySelectorAll('[data-mapping="y"] .tick text')].map(t => Number(t.textContent));
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
        expect(errors).toEqual([]);
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

describe('the reverse of a scale', () => {
    test('the largest value at the bottom', async () => {
        const def = {
            dims: { x: { column: 'year', type: 'categorical' }, y: { column: 'value', zero: true }, c: 'type' },
            marks: { type: 'point', filter: '@c == "a"' },
        };
        const el = await mount({ def, data });
        const up = [...el.querySelectorAll('g.vis-plot circle')].map(c => num(c, 'cy'));
        const down = [...(await mount({ def: { ...def, dims: { ...def.dims, y: { ...def.dims.y, reverse: true } } }, data })).querySelectorAll('g.vis-plot circle')].map(c => num(c, 'cy'));
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

    test('"auto" of all margins of a definition is measured, also over the defaults of the page', async () => {
        const { prepareDef } = await import('@/utils/def');
        const { translate } = await import('@/utils/language');
        const { normalize } = await import('@/utils/normalize');
        const { plotTypes } = await import('@/plots');
        const def = prepareDef(normalize(translate({ margins: 'auto', dims: { x: 'a', y: 'b' }, marks: { type: 'line' } }), { plotTypes }));
        expect(def.options.margins).toEqual({ top: 'auto', right: 'auto', bottom: 'auto', left: 'auto' });
    });
});
