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

describe('the stacks of a mark of a filter', () => {
    const rows = 'x,v,t\n1,1,solar\n2,2,solar\n3,1,solar\n1,2,wind\n2,1,wind\n3,3,wind\n1,4,load\n2,2,load\n3,5,load';
    const top = async marks => {
        const el = await mount({ def: { dims: { x: 'x', y: 'v', t: 't' }, marks }, data: rows });
        expect(errors).toEqual([]);
        return Math.max(...[...el.querySelectorAll('[data-dim="y"] .tick text')].map(t => Number(t.textContent)));
    };
    // the stacks of solar and wind are 4 high at most, the load 5: the rows
    // the filter leaves out were stacked too (9)
    test.each([
        ['an expression', "@t != 'load'", true],
        ['an object', { t: { not: 'load' } }, true],
        ['an object and a condition of the stack', { t: { not: 'load' } }, "@t != 'solar' or @x > 0"],
        ['an expression and a condition of the stack of the object form', "@t != 'load'", { t: ['solar', 'wind'] }],
    ])('only the rows the filter keeps are stacked: %s', async (_, filter, stack) => {
        expect(await top([{ type: 'area', by: 't', stack, filter }, { type: 'line', filter: { t: 'load' } }])).toBe(5);
    });
    test('the stacks of marks of other filters are the ones of the rows of all of them', async () => {
        expect(await top([{ type: 'bar', width: 5, by: 't', stack: true, filter: { t: 'solar' } }, { type: 'bar', width: 5, by: 't', stack: true, filter: { t: 'wind' } }])).toBe(5);
        expect(await top([{ type: 'bar', width: 5, by: 't', stack: true, filter: { t: { not: 'solar' } } }, { type: 'text', text: '@y', y: '@y:end:scaled', stack: true, filter: { t: { not: 'solar' } } }])).toBe(8);
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

    test('the labels of bars of negative values are beyond their ends, not on the bars, of a distance of the mark as given', async () => {
        const at = t => [t.getAttribute('dx'), t.getAttribute('dy'), t.getAttribute('text-anchor'), t.getAttribute('dominant-baseline')];
        const hbars = texts(await mount({ def: { dims: { y: { column: 'k', type: 'categorical' }, x: 'v' }, marks: [{ type: 'bar' }, { type: 'label', anchor: 'end', text: '@x' }] }, data: 'k,v\na,5\nb,-3' }));
        expect(hbars.map(at)).toEqual([['4', null, 'start', 'middle'], ['-4', null, 'end', 'middle']]);
        // vertical bars of a column of names (no type), dodged ones
        const vbars = texts(await mount({ def: { dims: { x: 'k', y: 'v' }, marks: [{ type: 'bar' }, { type: 'label', anchor: 'top', text: '@y' }] }, data: 'k,v\na,5\nb,-3' }));
        expect(vbars.map(at)).toEqual([[null, '-4', 'middle', 'auto'], [null, '4', 'middle', 'hanging']]);
        const dodged = texts(await mount({ def: { dims: { x: { column: 'k', type: 'categorical' }, y: 'v', t: 't' }, marks: [{ type: 'bar', by: 't', dodge: true }, { type: 'label', by: 't', dodge: true, anchor: 'top', text: '@y' }] }, data: 'k,v,t\na,1,p\na,-2,q' }));
        expect(dodged.map(at)).toEqual([[null, '-4', 'middle', 'auto'], [null, '4', 'middle', 'hanging']]);
        // labels of points stay above them, a dy of the mark is the one given
        const points = texts(await mount({ def: { dims: { x: 'x', y: 'v' }, marks: [{ type: 'point' }, { type: 'label', anchor: 'top', text: '@y' }] }, data: 'x,v\n1,5\n2,-3' }));
        expect(points.map(at)).toEqual([[null, '-4', 'middle', 'auto'], [null, '-4', 'middle', 'auto']]);
        const given = texts(await mount({ def: { dims: { x: 'k', y: 'v' }, marks: [{ type: 'bar' }, { type: 'label', anchor: 'top', dy: -2, text: '@y' }] }, data: 'k,v\na,5\nb,-3' }));
        expect(given.map(at)).toEqual([[null, '-2', 'middle', 'auto'], [null, '-2', 'middle', 'auto']]);
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

describe('ticks', () => {
    test('a short rule at the value across the band of the bar, a share of it (size), of dodged bars across the slot', async () => {
        const def = {
            dims: { x: { column: 'year', type: 'categorical' }, y: { column: 'value', domain: [0, 10] }, c: { column: 'type', categories: { a: {}, b: {} } } },
            marks: [
                { type: 'bar', fill: '#ccc', filter: "@c == 'a'" },
                { type: 'tick', stroke: '#111', filter: "@c == 'a'" },
                { type: 'tick', stroke: '#222', size: 0.5, filter: "@c == 'a'" },
                { type: 'tick', stroke: '#333', by: 'c', dodge: true },
            ],
        };
        const el = await mount({ def, data });
        const bars = rects(el);
        const ticks = stroke => lines(el).filter(l => l.getAttribute('stroke') == stroke);
        expect(ticks('#111').length).toBe(2);
        bars.forEach(b => {
            const row = b[itemOf][rowOf];
            const [full] = ticks('#111').filter(l => l[itemOf][rowOf] === row);
            const [half] = ticks('#222').filter(l => l[itemOf][rowOf] === row);
            // horizontal, at the top of the bar, as wide as the bar
            expect(num(full, 'y1')).toBeCloseTo(num(full, 'y2'));
            expect(Math.abs(num(full, 'y1') - num(b, 'y'))).toBeLessThanOrEqual(0.5);
            expect(num(full, 'x1')).toBeCloseTo(num(b, 'x'));
            expect(num(full, 'x2')).toBeCloseTo(num(b, 'x') + num(b, 'width'));
            // half of it around the middle
            expect(num(half, 'x2') - num(half, 'x1')).toBeCloseTo(num(b, 'width')/2);
            expect((num(half, 'x1') + num(half, 'x2'))/2).toBeCloseTo(num(b, 'x') + num(b, 'width')/2);
        });
        // dodged: half a band each, a before b
        const dodged = ticks('#333');
        expect(dodged.length).toBe(4);
        const [a, b] = ['a', 'b'].map(c => dodged.find(l => l[itemOf][rowOf].c == c && l[itemOf][rowOf].x == '2020'));
        expect(num(a, 'x2')).toBeCloseTo(num(b, 'x1'));
        expect(num(a, 'x2') - num(a, 'x1')).toBeCloseTo(num(bars[0], 'width')/2);
        expect(errors).toEqual([]);
    });

    test('a vertical tick across the band of a categorical y, e.g. a target of horizontal bars; of a point scale 80% of the step', async () => {
        const rows = 'land,value,target\nW,2,3\nT,5,4';
        const def = {
            dims: { y: { column: 'land', type: 'categorical' }, x: { column: 'value', domain: [0, 10] }, t: 'target' },
            marks: [{ type: 'bar' }, { type: 'tick', x: 't', stroke: '#111' }],
        };
        const el = await mount({ def, data: rows });
        const bars = rects(el);
        bars.forEach(b => {
            const tick = lines(el).find(l => l[itemOf][rowOf] === b[itemOf][rowOf]);
            expect(num(tick, 'x1')).toBeCloseTo(num(tick, 'x2'));
            expect(num(tick, 'y1')).toBeCloseTo(num(b, 'y'));
            expect(num(tick, 'y2')).toBeCloseTo(num(b, 'y') + num(b, 'height'));
        });
        // a point scale: a strip plot of ticks without bars
        const strip = await mount({ def: { dims: { x: { column: 'type', type: 'categorical' }, y: 'value' }, marks: { type: 'tick' } }, data });
        const [t] = lines(strip);
        const step = Math.abs(num(lines(strip).find(l => l[itemOf][rowOf].x == 'b'), 'x1') - num(t, 'x1'));
        expect(num(t, 'x2') - num(t, 'x1')).toBeCloseTo(0.8*step);
        expect(errors).toEqual([]);
    });
});

describe('arrows', () => {
    test('marker-end and marker-start "arrow": a marker of an arrowhead per color in the defs of the svg, also of annotations and lines', async () => {
        const rows = 'year,value,lo,hi\n2020,2,1,3\n2021,6,4,8';
        const def = {
            dims: { x: { column: 'year', type: 'categorical' }, y: { column: 'value', domain: [0, 10] }, lo: 'lo', hi: 'hi' },
            annotations: { type: 'line', y: 5, props: { 'marker-end': 'arrow' } },
            marks: [
                { type: 'rule', y1: 'lo', y2: 'hi', stroke: '#C3423F', 'marker-end': 'arrow', 'marker-start': 'arrow' },
                { type: 'line', stroke: '#1E4F77', 'marker-end': 'arrow' },
                { type: 'rule', y: 9, 'marker-end': 'url(#own)' },
            ],
        };
        const el = await mount({ def, data: rows });
        const svg = el.querySelector('.vis-facet svg');
        const markers = [...svg.querySelectorAll(':scope > defs.vis-defs > marker.vis-arrow')];
        // one per color: the rules, the line and the annotation of the color of the styles
        expect(markers.map(m => m.getAttribute('data-color'))).toEqual(['var(--gen-vis-line-color, #9AA0A8)', '#C3423F', '#1E4F77']);
        expect(markers[1].querySelector('path').style.fill).toBe('rgb(195, 66, 63)');
        const url = color => `url(#${markers.find(m => m.getAttribute('data-color') == color).id})`;
        const rules = lines(el).filter(l => l.getAttribute('stroke') == '#C3423F');
        expect(rules.length).toBe(2);
        rules.forEach(r => {
            expect(r.getAttribute('marker-end')).toBe(url('#C3423F'));
            expect(r.getAttribute('marker-start')).toBe(url('#C3423F'));
        });
        expect(el.querySelector('g.vis-mark path').getAttribute('marker-end')).toBe(url('#1E4F77'));
        expect(el.querySelector('line.vis-annotation').getAttribute('marker-end')).toBe(url('var(--gen-vis-line-color, #9AA0A8)'));
        // other values as they are
        expect(lines(el).find(l => l.getAttribute('marker-end') == 'url(#own)')).toBeDefined();
        // the ids are the ones of the facet, unique on the page
        expect(markers[0].id).toMatch(/^gen-vis-facet-\d+-arrow-0$/);
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
        const { markTypes } = await import('@/marks');
        const def = prepareDef(normalize(translate({ margins: 'auto', dims: { x: 'a', y: 'b' }, marks: { type: 'line' } }), { markTypes }));
        expect(def.margins).toEqual({});
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

    test('an area from y0 to y1, e.g. a band of a range: the edges are the ones of the two dims, not of y', async () => {
        const def = { height: 200, margins: { top: 0, right: 0, bottom: 0, left: 0 },
            dims: { x: { column: 'a', type: 'numeric' }, y: { column: 'v', domain: [0, 10] }, lo: 'lo', hi: 'hi' },
            marks: { type: 'area', y0: 'lo', y1: 'hi' } };
        const el = await mount({ def, data: 'a,v,lo,hi\n1,5,2,8\n2,5,4,6' });
        // the upper edge along x, then the lower one back: 8 and 6, then 4 and 2 of a domain of 0 to 10 on 200 pixels
        const points = [...el.querySelector('g.vis-mark path').getAttribute('d').matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m => Number(m[2]));
        expect(points).toEqual([40, 80, 120, 160]);
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

describe('the radius of points of a dim (docs/definition.md, attributes)', () => {
    test('is from 0 by default, the areas are the ones of the values; "zero": false keeps the domain of the data', async () => {
        const radii = async size => {
            const el = await mount({ def: { width: 600, dims: { x: 'x', y: 'v', size }, marks: [{ type: 'point', r: 'size' }] }, data: 'x,v,s\n1,1,10\n2,2,50\n3,3,100' });
            return [...el.querySelectorAll('g.vis-mark circle')].map(c => +c.getAttribute('r'));
        };
        const r = await radii({ column: 's', scale: { type: 'sqrt', range: [0, 20] } });
        expect(r[0]).toBeCloseTo(20*Math.sqrt(0.1));
        expect(r[1]).toBeCloseTo(20*Math.sqrt(0.5));
        expect(r[2]).toBeCloseTo(20);
        expect((await radii({ column: 's', zero: false, scale: { type: 'sqrt', range: [0, 20] } }))[0]).toBe(0);
        expect(errors).toEqual([]);
    });
});

describe('a fill of a dim of an ordinal scale of colors', () => {
    test('is the color of its range, no warning', async () => {
        const el = await mount({ def: { width: 600, dims: { x: { column: 'k', type: 'categorical' }, y: 'v', c: { column: 't', scale: { type: 'ordinal', range: ['red', 'blue'] } } }, marks: [{ type: 'bar', fill: 'c' }] }, data: 'k,v,t\na,1,p\nb,2,q' });
        expect([...el.querySelectorAll('g.vis-mark rect')].map(r => r.getAttribute('fill'))).toEqual(['red', 'blue']);
        expect(errors).toEqual([]);
    });
});

describe('bars and ticks of periods and of the scale of another dim (final review of 5.0)', () => {
    const lines = el => [...el.querySelectorAll('g.vis-mark line')].filter(l => l[itemOf]);
    const months = 'd,b\n2020-01-01,3\n2020-02-01,4\n2020-03-01,5';

    test('bars of an interval of months are vertical without a numeric part of y, the ticks are the starts of the months', async () => {
        const el = await mount({ def: { width: 500, height: 250, dims: { x: { column: 'd', interval: 'month' }, y: 'b' }, marks: { type: 'bar' } }, data: months });
        const bars = rects(el);
        expect(bars.length).toBe(3);
        // vertical: of the same base, heights of the values
        expect(new Set(bars.map(r => Math.round(num(r, 'y') + num(r, 'height')))).size).toBe(1);
        expect(num(bars[2], 'height')).toBeGreaterThan(num(bars[0], 'height'));
        const ticks = [...el.querySelectorAll('.vis-axis-x .tick text, [data-dim="x"] .tick text')].map(t => t.textContent);
        expect(ticks.length).toBeGreaterThanOrEqual(3);
        expect(ticks.length).toBeLessThanOrEqual(4);
        expect(ticks.join(' ')).not.toMatch(/\d\d\. /);
        expect(errors).toEqual([]);
    });

    test('the ticks of periods are the starts of the periods from the first date of the data: weeks from Mondays, quarters with a pad or an earlier start of the domain', async () => {
        const ticks = async (x, data) => {
            const el = await mount({ def: { width: 600, height: 250, dims: { x, y: 'v' }, marks: { type: 'bar' } }, data });
            return [...el.querySelectorAll('[data-dim="x"] .tick text')].map(t => t.textContent);
        };
        // Mondays, in the format of weeks (not d3's Sundays, at the ends of the bars)
        expect(await ticks({ column: 'd', interval: 'week' }, 'd,v\n2024-01-01,1\n2024-01-08,2\n2024-01-15,3\n2024-01-22,2\n2024-01-29,4\n2024-02-05,2'))
            .toEqual(['2024', '08. Jan', '15. Jan', '22. Jan', '29. Jan', '05. Feb', '12. Feb']);
        const quarters = 'd,v\n2023-01-01,1\n2023-04-01,2\n2023-07-01,3\n2023-10-01,2\n2024-01-01,4\n2024-04-01,2\n2024-07-01,5';
        for (const x of [{ column: 'd', interval: 'quarter', pad: 0.05 }, { column: 'd', interval: 'quarter', domain: ['2022-11-15', null] }]) {
            const t = await ticks(x, quarters);
            expect(t).toContain('April');
            expect(t).not.toContain('Februar');
        }
        expect(errors).toEqual([]);
    });

    test('bars of an interval of years of a column of years (2019, ...): a date dim, the bars are drawn', async () => {
        const el = await mount({ def: { width: 500, height: 250, dims: { x: { column: 'd', interval: 'year' }, y: 'v' }, marks: { type: 'bar' } }, data: 'd,v\n2019,1\n2020,2\n2021,3' });
        expect(rects(el).length).toBe(3);
        expect([...el.querySelectorAll('[data-dim="x"] .tick text')].map(t => t.textContent)).toEqual(['2019', '2020', '2021', '2022']);
        expect(errors).toEqual([]);
    });

    test('a tick of a column beside horizontal bars runs across their bands, a tick of no length warns', async () => {
        const el = await mount({ def: { width: 400, height: 200, dims: { x: { column: 'b', zero: true }, y: 'a' },
            marks: [{ type: 'bar' }, { type: 'tick', x: 't', stroke: 'red' }] }, data: 'a,b,t\nA,3,4\nB,4,2\nC,5,6' });
        const [tick] = lines(el);
        expect(num(tick, 'x1')).toBeCloseTo(num(tick, 'x2'));
        expect(num(tick, 'y2') - num(tick, 'y1')).toBeGreaterThan(10);
        expect(errors).toEqual([]);
        await mount({ def: { width: 400, height: 200, dims: { x: { column: 'g', type: 'numeric' }, y: 'v' }, marks: { type: 'tick' } }, data: 'g,v\n1,2\n2,3' });
        expect(errors).toEqual(['gen-vis inline definition: marks[0]: the rules have no length, e.g. ticks across a continuous y: a tick runs across the band of a categorical dim or the period of an "interval" of dates']);
        errors.length = 0;
    });
});

describe('arrows of rows of a mark of their own (final review of 5.0)', () => {
    const lines = el => [...el.querySelectorAll('g.vis-mark line')].filter(l => l[itemOf]);
    const data = 'date,price\n2021-01-01,50\n2021-07-01,120\n2022-01-01,300\n2022-07-01,450\n2023-01-01,150\n2023-07-01,90';

    test('a rule of the ends of x of its rows is horizontal, the ends are dates as the ones of x, no warning of their columns', async () => {
        const def = { width: 600, height: 300, dims: { x: { column: 'date', type: 'date', axis: { format: '%Y' } }, y: { column: 'price', zero: true } },
            marks: [{ type: 'line' },
                { type: 'rule', data: [{ y: 30, start: '2021-07-01', end: '2023-01-01' }], x1: 'start', x2: 'end', 'marker-start': 'arrow', 'marker-end': 'arrow' },
                { type: 'rule', data: [{ x: '2022-07-01', from: 520, to: 470 }], y1: 'from', y2: 'to', 'marker-end': 'arrow' }] };
        const el = await mount({ def, data });
        const [span, down] = lines(el);
        expect(num(span, 'y1')).toBeCloseTo(num(span, 'y2'));
        expect(num(span, 'x1')).toBeGreaterThan(0);
        expect(num(span, 'x2')).toBeGreaterThan(num(span, 'x1') + 100);
        expect(num(down, 'x1')).toBeCloseTo(num(down, 'x2'));
        expect(num(down, 'y2')).toBeGreaterThan(num(down, 'y1'));
        expect(span.getAttribute('marker-start')).toMatch(/^url\(#.*arrow/);
        expect(errors).toEqual([]);
        const { validateDef } = await import('@/check.js');
        const { parseData } = await import('@/check.js');
        expect(validateDef({ $schema: 'https://unpkg.com/@preschen/gen-vis@5/schema.json', ...def }, await parseData(data, 'csv'))).toEqual([]);
    });

    test('the labels of an axis of dates in a format of a larger unit are at its first tick only, the tick marks stay', async () => {
        const el = await mount({ def: { width: 600, height: 300, dims: { x: { column: 'date', type: 'date', axis: { format: '%Y' } }, y: 'price' }, marks: { type: 'line' } }, data });
        const ticks = [...el.querySelectorAll('[data-dim="x"] .tick, .vis-axis-x .tick')];
        const texts = ticks.map(t => t.querySelector('text')?.textContent ?? '');
        expect(texts.filter(Boolean)).toEqual(['2021', '2022', '2023']);
        expect(ticks.length).toBeGreaterThan(3);
        expect(errors).toEqual([]);
    });
});

describe('lines and areas of a band scale', () => {
    const data = 'k,v\na,1\nb,2\nc,3';
    const xs = d => [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
    const paths = el => [...el.querySelectorAll('g.vis-mark path')].map(p => xs(p.getAttribute('d')));
    const centers = el => rects(el).map(r => [num(r, 'x') + num(r, 'width')/2, num(r, 'y') + num(r, 'height')/2]);

    test('a line and an area with bars run through the centers of the bands, as the points', async () => {
        const def = { dims: { x: { column: 'k', type: 'categorical' }, y: 'v' }, marks: [{ type: 'bar' }, { type: 'line' }, { type: 'area' }, { type: 'point' }] };
        const el = await mount({ def, data });
        const [line, area] = paths(el);
        const mid = centers(el).map(c => c[0]);
        const points = [...el.querySelectorAll('g.vis-mark circle')].map(c => num(c, 'cx'));
        line.forEach((p, i) => expect(p[0]).toBeCloseTo(mid[i], 2));
        area.slice(0, 3).forEach((p, i) => expect(p[0]).toBeCloseTo(mid[i], 2));
        points.forEach((p, i) => expect(p).toBeCloseTo(mid[i], 2));
        expect(errors).toEqual([]);
    });

    test('the points and the labels of a dim of no type are at the centers of the bars too, its type is the one of the rows', async () => {
        const def = { dims: { x: 'k', y: 'v' }, marks: [{ type: 'bar' }, { type: 'line' }, { type: 'point' }, { type: 'label', text: '@y' }] };
        const el = await mount({ def, data });
        const mid = centers(el).map(c => c[0]);
        const points = [...el.querySelectorAll('g.vis-mark circle')].map(c => num(c, 'cx'));
        const labels = [...el.querySelectorAll('g.vis-mark text')].map(t => num(t, 'x'));
        expect(points).toHaveLength(3);
        expect(labels).toHaveLength(3);
        paths(el)[0].forEach((p, i) => expect(p[0]).toBeCloseTo(mid[i], 2));
        points.forEach((p, i) => expect(p).toBeCloseTo(mid[i], 2));
        labels.forEach((p, i) => expect(p).toBeCloseTo(mid[i], 2));
        expect(errors).toEqual([]);
    });

    test('a line with horizontal bars runs through the centers of the bands of y', async () => {
        const def = { dims: { y: { column: 'k', type: 'categorical' }, x: 'v' }, marks: [{ type: 'bar' }, { type: 'line' }] };
        const el = await mount({ def, data });
        const mid = centers(el).map(c => c[1]);
        paths(el)[0].forEach((p, i) => expect(p[1]).toBeCloseTo(mid[i], 2));
        expect(errors).toEqual([]);
    });

    test('a line alone (a point scale) is at the positions of its points', async () => {
        const def = { dims: { x: { column: 'k', type: 'categorical' }, y: 'v' }, marks: [{ type: 'line' }, { type: 'point' }] };
        const el = await mount({ def, data });
        const points = [...el.querySelectorAll('g.vis-mark circle')].map(c => num(c, 'cx'));
        paths(el)[0].forEach((p, i) => expect(p[0]).toBeCloseTo(points[i], 2));
        expect(errors).toEqual([]);
    });
});

describe('marks without a position are not drawn', () => {
    const noNaN = el => expect(el.querySelector('.vis-svg').outerHTML).not.toMatch(/NaN|Infinity|undefined/);

    test('0 of a log scale: no bar, no point and no label, a gap of the line', async () => {
        const def = { dims: { x: { column: 'k', type: 'categorical' }, y: { column: 'v', scale: { type: 'log' } } },
            marks: [{ type: 'bar' }, { type: 'point' }, { type: 'label', text: '@y' }, { type: 'line' }] };
        const el = await mount({ def, data: 'k,v\na,0\nb,10\nc,100' });
        expect(rects(el).map(r => r[itemOf][rowOf].x)).toEqual(['b', 'c']);
        expect(el.querySelectorAll('g.vis-mark circle').length).toBe(2);
        expect(texts(el).length).toBe(2);
        expect(el.querySelector('g.vis-mark path').getAttribute('d')).toMatch(/^M[\d.,]+L[\d.,]+$/);
        noNaN(el);
        expect(errors.length).toBe(1);
        expect(errors[0]).toContain('1 of 3 values of dim \'y\' are not drawn (0)');
        errors.length = 0;
    });

    test('a log scale of a fixed domain from 0 draws its marks from the values of the data, with a warning', async () => {
        const def = { dims: { x: { column: 'k', type: 'categorical' }, y: { column: 'v', domain: [0, 1000], scale: { type: 'log' } } }, marks: [{ type: 'bar' }, { type: 'line' }] };
        const el = await mount({ def, data: 'k,v\na,1\nb,10\nc,100' });
        expect(rects(el).length).toBe(3);
        rects(el).forEach(r => expect(num(r, 'height')).toBeGreaterThanOrEqual(0));
        expect(el.querySelector('g.vis-mark path').getAttribute('d')).toMatch(/^M[\d.,]+L[\d.,]+L[\d.,]+$/);
        noNaN(el);
        expect(errors).toEqual(['gen-vis inline definition: dims.y.scale: a log scale has no position of 0 of its `domain`, that end is the one of the data, e.g. "domain": [1, 1000]']);
        errors.length = 0;
    });

    test('a category which is not in a fixed domain of a band scale', async () => {
        const def = { dims: { x: { column: 'k', type: 'categorical', scale: { domain: ['a', 'b'] } }, y: 'v' },
            marks: [{ type: 'bar' }, { type: 'point' }, { type: 'label', text: '@y' }, { type: 'rule' }] };
        const el = await mount({ def, data: 'k,v\na,1\nb,2\nc,3' });
        expect(rects(el).map(r => r[itemOf][rowOf].x)).toEqual(['a', 'b']);
        expect(el.querySelectorAll('g.vis-mark circle').length).toBe(2);
        expect(texts(el).length).toBe(2);
        expect(lines(el).length).toBe(2);
        noNaN(el);
        expect(errors).toEqual([]);
    });
});

describe('rows of the data of a mark without a dim of its position', () => {
    const data = 'k,v\na,1\nb,2\nc,3';
    const dims = { x: { column: 'k', type: 'categorical' }, y: 'v' };
    const second = el => el.querySelectorAll('g.vis-mark')[1];

    test('a point and a label without one of their positions are not drawn, a warning names the dim', async () => {
        const point = await mount({ def: { dims, marks: [{ type: 'bar' }, { type: 'point', data: [{ y: 2 }] }] }, data });
        expect(second(point).querySelectorAll('circle').length).toBe(0);
        expect(errors).toEqual([`gen-vis inline definition: marks[1]: none of its 1 rows is drawn, 1 without a value of dim 'x'`]);
        errors.length = 0;
        const label = await mount({ def: { dims, marks: [{ type: 'bar' }, { type: 'label', data: [{ x: 'b' }, { x: 'b', y: 2 }], text: 'hi' }] }, data });
        expect(second(label).querySelectorAll('text').length).toBe(1);
        expect(label.querySelector('.vis-svg').outerHTML).not.toMatch(/NaN/);
        expect(errors).toEqual([]);
    });

    test('a rule of rows of only a y is horizontal, across the plot area, of only an x vertical', async () => {
        const h = await mount({ def: { dims, marks: [{ type: 'bar' }, { type: 'rule', data: [{ y: 2 }] }] }, data });
        const line = second(h).querySelector('line');
        expect([num(line, 'x1'), num(line, 'x2')]).toEqual([0, 776]);
        expect(num(line, 'y1')).toBeCloseTo(128.67, 2);
        expect(line.getAttribute('y2')).toBe(line.getAttribute('y1'));
        const v = await mount({ def: { dims, marks: [{ type: 'bar' }, { type: 'rule', data: [{ x: 'b' }] }] }, data });
        const up = second(v).querySelector('line');
        expect([num(up, 'x1'), num(up, 'x2'), num(up, 'y1'), num(up, 'y2')]).toEqual([388.5, 388.5, 0, 370]);
        expect(errors).toEqual([]);
    });
});

describe('stacked areas of groups without a row at a position', () => {
    // the points of the upper line and of the lower line of an area, the lower one in the order of the upper one
    const edges = d => {
        const p = [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
        return [p.slice(0, p.length/2), p.slice(p.length/2).reverse()];
    };

    test('a point of no height at the place of the group in the stack, the areas do not overlap', async () => {
        const def = { dims: { x: 'x', y: 'v', c: 'c' }, marks: [{ type: 'area', by: 'c', stack: true }] };
        const el = await mount({ def, data: 'c,x,v\np,1,1\np,3,1\nq,1,2\nq,2,2\nq,3,2\nr,2,1' });
        const [p, q, r] = [...el.querySelectorAll('g.vis-mark path')].map(e => edges(e.getAttribute('d')));
        // p has no row at the second position: no height there, at the base
        expect(p[0].length).toBe(3);
        expect(p[0][1]).toEqual(p[1][1]);
        // the lower line of q is the upper line of p, the one of r the upper line of q
        expect(q[1]).toEqual(p[0]);
        expect(r[1]).toEqual(q[0]);
        // r has a height only at its row
        expect(r[0].map((e, i) => r[1][i][1] - e[1] > 0)).toEqual([false, true, false]);
        expect(errors).toEqual([]);
    });

    test('areas which are not stacked and `"order": "rows"` keep their points', async () => {
        const data = 'c,x,v\np,1,1\np,3,1\nq,1,2\nq,2,2\nq,3,2';
        const plain = await mount({ def: { dims: { x: 'x', y: 'v', c: 'c' }, marks: [{ type: 'area', by: 'c' }] }, data });
        expect(edges(plain.querySelector('g.vis-mark path').getAttribute('d'))[0].length).toBe(2);
        const rows = await mount({ def: { dims: { x: 'x', y: 'v', c: 'c' }, marks: [{ type: 'area', by: 'c', stack: true, order: 'rows' }] }, data });
        expect(edges(rows.querySelector('g.vis-mark path').getAttribute('d'))[0].length).toBe(2);
        expect(errors).toEqual([]);
    });
});

describe('clip', () => {
    const data = 'k,v\na,1\nb,3\nc,5';
    const def = (marks, more = {}) => ({ dims: { x: { column: 'k', type: 'categorical' }, y: { column: 'v', domain: [2, 4] } }, marks, ...more });

    test('a mark with `clip` is clipped to the plot area of its facet, the others are not', async () => {
        const el = await mount({ def: def([{ type: 'bar', clip: true }, { type: 'line' }]), data });
        const [bars, line] = el.querySelectorAll('g.vis-mark');
        const clip = el.querySelector('svg.vis-svg > defs.vis-defs > clipPath.vis-clip');
        expect(clip.id).toMatch(/^gen-vis-facet-\d+-clip$/);
        expect(bars.getAttribute('clip-path')).toBe(`url(#${clip.id})`);
        expect(line.hasAttribute('clip-path')).toBe(false);
        // the plot area of 776 x 370, the bar of 1 hangs below it without the clip
        expect(['x', 'y', 'width', 'height'].map(a => num(clip.firstChild, a))).toEqual([0, 0, 776, 370]);
        expect(Math.max(...rects(el).map(r => num(r, 'y') + num(r, 'height')))).toBeGreaterThan(370);
        expect(errors).toEqual([]);
    });

    test('a clip per facet, around the center of a polar chart, none without a mark with `clip`', async () => {
        const facets = await mount({ def: { dims: { x: 'x', y: { column: 'v', domain: [2, 4] }, f: 'k' }, facets: { by: 'f', cols: 3 }, marks: [{ type: 'line', clip: true }] },
            data: 'k,x,v\na,1,1\na,2,5\nb,1,3\nb,2,3\nc,1,5\nc,2,1' });
        const ids = [...facets.querySelectorAll('clipPath.vis-clip')].map(c => c.id);
        expect(new Set(ids).size).toBe(3);
        expect([...facets.querySelectorAll('g.vis-mark')].map(g => g.getAttribute('clip-path'))).toEqual(ids.map(id => `url(#${id})`));
        const polar = await mount({ def: { coord: 'polar', width: 400, height: 400, margins: { top: 0, right: 0, bottom: 0, left: 0 }, dims: { x: { column: 'k', type: 'categorical' }, y: 'v' }, marks: [{ type: 'line', clip: true }] }, data });
        expect(['x', 'y', 'width', 'height'].map(a => num(polar.querySelector('clipPath.vis-clip rect'), a))).toEqual([-200, -200, 400, 400]);
        const none = await mount({ def: def([{ type: 'bar' }]), data });
        expect(none.querySelector('clipPath')).toBe(null);
        expect(errors).toEqual([]);
    });

    test('`clip` is a boolean of the schema', async () => {
        const { validateDef } = await import('@/utils/validate');
        expect(validateDef(def([{ type: 'bar', clip: true }]))).toEqual([]);
        expect(validateDef(def([{ type: 'bar', clip: 'yes' }])).join(' ')).toContain('marks[0].clip');
    });
});
