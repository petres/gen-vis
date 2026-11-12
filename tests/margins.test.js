// @vitest-environment jsdom
// the margins of the facets measured of the axes ("auto", the default),
// see utils/margins.js; without a canvas (jsdom) a character of a label is
// 0.55 em of 12 pixels, see utils/measure.js
import { describe, test, expect, beforeAll } from 'vitest';
import { loadColors } from '@/utils/d3';
import { createStore } from '@/store';
import { layout } from '@/layout';
import { textWidth } from '@/utils/measure';
import { autoMargins } from '@/utils/margins';
import { createGenVis } from '@/index.js';
import { useDom, rendered, nextTick, mount } from './dom.js';

beforeAll(loadColors);
useDom();

const data = 'year,value,land\n2020,1,Wien\n2021,2,Wien\n2020,1000000,Tirol\n2021,2000000,Tirol';

const view = async (def, width = 400) => {
    const store = createStore();
    await store.init({ def: { height: 200, dims: { x: { column: 'year', type: 'numeric' }, y: { column: 'value', type: 'numeric', zero: true, format: ',.0f' } }, marks: { type: 'line' }, ...def }, data });
    return layout(store, width);
};
const margins = async (def, width) => (await view(def, width)).facets[0].margins;

// the extents of the parts of an axis: the tick marks outside of the plot
// area (their size of 9 less the inset of 5 of a left axis and 4 of a
// bottom one), the padding of the labels and the height of a label
const marksLeft = 9 - 5, marksBottom = 9 - 4, padding = 3, label = 12;
const widest = texts => Math.max(...texts.map(t => textWidth(t, '12px sans-serif')));

describe('auto margins', () => {
    test('the widest label of the left axis, the height of the labels of the bottom axis, a floor beside them', async () => {
        const m = await margins({});
        // the ticks of y up to 2.000.000, the widest label "2.000.000"
        expect(m.left).toBe(Math.ceil(marksLeft + padding + widest(['2.000.000']) + 2));
        expect(m.bottom).toBe(Math.ceil(marksBottom + padding + label + 2));
        // the labels of the ends of the left axis reach above and below the plot area
        expect(m.top).toBe(Math.ceil(label/2 + 2));
        expect(m.right).toBeGreaterThanOrEqual(8);
    });

    test('a title of an axis adds its line, a side given stays, the others are measured', async () => {
        const plain = await margins({});
        const titled = await margins({ dims: { x: { column: 'year', type: 'numeric' }, y: { column: 'value', type: 'numeric', zero: true, format: ',.0f', axis: { title: { name: 'Einwohner' } } } } });
        expect(titled.left).toBe(plain.left - 2 + 12 + 8);
        const given = await margins({ margins: { left: 40, top: 0 } });
        expect(given.left).toBe(40);
        expect(given.top).toBe(0);
        expect(given.bottom).toBe(plain.bottom);
        expect(await margins({ margins: 'auto' })).toEqual(plain);
    });

    test('the labels of the ends of the bottom axis reach beyond the plot area, rotated labels their projection', async () => {
        const wide = await margins({ dims: { x: { column: 'year', type: 'categorical', axis: { tickMarks: false } }, y: { column: 'value', zero: true } } });
        // a band of a category per year, the first label "2020" is centered on its band, inside the plot area
        expect(wide.left).toBeGreaterThanOrEqual(8);
        const rotated = await margins({ dims: { x: { column: 'year', type: 'numeric', format: 'd', axis: { rotate: 90, values: [2020, 2021] } }, y: { column: 'value', zero: true } } });
        // the labels of the years are vertical, their width below the axis
        expect(rotated.bottom).toBe(Math.ceil(marksBottom + padding + widest(['2020', '2021']) + 2));
    });

    test('the defaults of the page (registerDefaults) and of the chart give the sides without one, e.g. of a house style', async () => {
        const { registerDefaults } = await import('@/utils/defaults');
        const plain = await margins({});
        registerDefaults({ margins: { left: 50, top: 'auto' } });
        try {
            const m = await margins({});
            expect(m.left).toBe(50);
            expect(m.top).toBe(plain.top);
            // the definition wins
            expect((await margins({ margins: { left: 40 } })).left).toBe(40);
            // the defaults of the chart (its prop) before the ones of the page
            const store = createStore();
            await store.init({ def: { dims: { x: 'year', y: 'value' }, marks: { type: 'line' } }, data, defaults: { margins: { left: 33 } } });
            expect(layout(store, 400).facets[0].margins.left).toBe(33);
        } finally {
            registerDefaults(null);
        }
    });

    test('the margins of the width of the visualisation and of expressions, as before', async () => {
        const m = await margins({ margins: { left: '=steps(@totalWidth, {0: 20, 500: 100})' } }, 600);
        expect(m.left).toBe(100);
    });

    test('a map has no axes and no margins, the floor beside axes', async () => {
        const store = createStore();
        await store.init({ def: { coord: 'geo', geo: { data: { type: 'FeatureCollection', features: [] } }, dims: { r: 'land' }, marks: { type: 'region', by: 'r' } }, data });
        expect(layout(store, 400).facets[0].margins).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    });

    test('a grid of shared scales: the facets without labels (inner ones) have margins too', async () => {
        const store = createStore();
        await store.init({ def: { height: 120, dims: { x: { column: 'year', type: 'numeric', axis: { values: [2020, 2021] } }, y: { column: 'value', type: 'numeric' },
            a: { column: 'land' }, b: { column: 'land' } },
        facets: { by: { rows: 'a', cols: 'b' }, scales: { x: 'all', y: 'all' } }, marks: { type: 'line' } }, data });
        const facets = layout(store, 600).facets;
        expect(facets.length).toBe(4);
        facets.forEach(f => {
            Object.values(f.margins).forEach(v => expect(Number.isFinite(v)).toBe(true));
            expect(f.innerWidth).toBeGreaterThan(100);
        });
    });

    test('labels of their own texts (labels.props.text) are measured as drawn, at most their max-width', async () => {
        // the long names are props of the categories
        const dims = text => ({ x: { column: 'value', zero: true },
            y: { column: 'land', categories: { Wien: { long: 'Bundeshauptstadt Wien' }, Tirol: { long: 'Tirol' } }, axis: { labels: { props: text } } } });
        const named = await margins({ dims: dims({ text: '@long' }), marks: { type: 'bar' } });
        expect(named.left).toBe(Math.ceil(marksLeft + padding + widest(['Bundeshauptstadt Wien']) + 2));
        const capped = await margins({ dims: dims({ text: '@long', 'max-width': 40 }), marks: { type: 'bar' } });
        expect(capped.left).toBe(Math.ceil(marksLeft + padding + 40 + 2));
    });

    test('the title of a vertical axis at the top is above the plot area, not beside the labels', async () => {
        const plain = await margins({});
        const top = await margins({ dims: { x: { column: 'year', type: 'numeric' }, y: { column: 'value', type: 'numeric', zero: true, format: ',.0f', axis: { title: { name: '€', position: 'top' } } } } });
        expect(top.left).toBe(plain.left);
        expect(top.top).toBe(8 + 12 + 2);
    });

    test('the texts of marks beyond the plot area, e.g. labels at the ends of lines, are in the margins', async () => {
        const plain = await margins({});
        // a label after the last point of each line, of 10 characters
        // (a domain of the years, so the last point is at the end of the plot area)
        const dims = { x: { column: 'year', type: 'numeric', domain: [2020, 2021] }, y: { column: 'value', type: 'numeric', zero: true, format: ',.0f' } };
        const ends = await margins({ dims, marks: [{ type: 'line' }, { type: 'text', select: 'last', text: 'abcdefghij', dx: 6, 'font-size': 12 }] });
        expect(ends.right).toBe(Math.ceil(6 + widest(['abcdefghij']) + 2));
        expect(ends.left).toBe(plain.left);
        // centered above a point at the top of the plot area: the top margin
        const above = await margins({ dims, marks: [{ type: 'line' }, { type: 'text', select: 'last', text: 'x', dy: -20, 'text-anchor': 'middle', 'font-size': 12 }] });
        // (the domain of y reaches a bit above the largest value)
        expect(above.top).toBeGreaterThan(20 + 0.8*12 + 2 - 8);
        expect(above.top).toBeLessThanOrEqual(Math.ceil(20 + 0.8*12 + 2));
        // texts inside the plot area change nothing
        expect(await margins({ dims, marks: [{ type: 'line' }, { type: 'text', select: 'first', text: 'a', dx: 4, 'font-size': 12 }] })).toEqual(await margins({ dims }));
    });

    test('the labels of annotations beyond the plot area are in the margins, of cartesian charts', async () => {
        const dims = { x: { column: 'year', type: 'numeric', domain: [2020, 2021] }, y: { column: 'value', type: 'numeric', zero: true, format: ',.0f' } };
        const plain = await margins({ dims });
        // a band at the end of x, its label starts at its start (the end of the plot area)
        const band = await margins({ dims, annotations: [{ type: 'band', x: [2021, 2021], label: 'abcdefghijklmnop' }] });
        expect(band.right).toBeGreaterThan(plain.right);
        // the label of 11 pixels (the size of its style) from about the end of the plot area
        expect(band.right).toBeGreaterThanOrEqual(Math.floor(textWidth('abcdefghijklmnop', '11px sans-serif')) - 8);
        expect(band.right).toBeLessThanOrEqual(Math.ceil(textWidth('abcdefghijklmnop', '11px sans-serif')) + 8);
    });

    test('the plot area is the facet without the measured margins, also of a facet of a step height', async () => {
        const v = await view({});
        const f = v.facets[0];
        expect(f.innerWidth).toBe(f.width - f.margins.left - f.margins.right);
        expect(f.innerHeight).toBe(f.height - f.margins.top - f.margins.bottom);
    });
});

// the styles of the page: the css variables --gen-vis-margin-<side> on the
// visualisation or an element above it, a length or auto
describe('the margins of the styles of the page', () => {
    test('a side of a css variable, the others measured, the definition wins', async () => {
        const wrapper = document.body.appendChild(document.createElement('div'));
        wrapper.style.setProperty('--gen-vis-margin-left', '70px');
        wrapper.style.setProperty('--gen-vis-margin-top', 'auto');
        const el = wrapper.appendChild(document.createElement('div'));
        const def = { height: 200, dims: { x: { column: 'year', type: 'numeric' }, y: { column: 'value', type: 'numeric', zero: true } }, marks: { type: 'line' } };
        const vis = createGenVis(el, { def, data });
        await rendered(el);
        await nextTick();
        const inner = el.querySelector('svg.vis-svg > g');
        const [left, top] = /translate\(([\d.]+) ([\d.]+)\)/.exec(inner.getAttribute('transform')).slice(1).map(Number);
        expect(left).toBe(70);
        expect(top).toBe(Math.ceil(label/2 + 2));
        wrapper.remove();
    });

    test('lengths of rem, em and pt in pixels, "margins": "auto" of the definition is no margins', async () => {
        const left = async (value, def = {}) => {
            const wrapper = document.body.appendChild(document.createElement('div'));
            wrapper.style.setProperty('--gen-vis-margin-left', value);
            const el = wrapper.appendChild(document.createElement('div'));
            createGenVis(el, { def: { height: 200, dims: { x: { column: 'year', type: 'numeric' }, y: { column: 'value', type: 'numeric', zero: true } }, marks: { type: 'line' }, ...def }, data });
            await rendered(el);
            await nextTick();
            const inner = el.querySelector('svg.vis-svg > g');
            wrapper.remove();
            return Number(/translate\(([\d.]+) /.exec(inner.getAttribute('transform'))[1]);
        };
        document.documentElement.style.fontSize = '16px';
        expect(await left('4rem')).toBe(64);
        expect(await left('30pt')).toBe(40);
        expect(await left('55')).toBe(55);
        expect(await left('70px', { margins: 'auto' })).toBe(70);
        document.documentElement.style.fontSize = '';
    });
});

describe('the ends of a horizontal axis of the final width', () => {
    const long = 'Niederösterreich und Burgenland';
    const bars = axis => ({ dims: { x: { column: 'name', type: 'categorical', ...(axis ? { axis } : {}) }, y: { column: 'value', zero: true } }, marks: { type: 'bar' } });
    const of = async (def, width, rows) => {
        const store = createStore();
        await store.init({ def: { height: 200, ...def }, data: rows });
        return { store, v: layout(store, width) };
    };

    test('rotated labels reach beyond the start of the plot area by their projection', async () => {
        const rows = `name,value\n${long},1\nWien,2\nTirol,3`;
        const { v } = await of(bars({ rotate: 45 }), 400, rows);
        const f = v.facets[0];
        const s = f.scales.x;
        // text-anchor end at the tick, rotated counterclockwise: its width to the left
        const reach = textWidth(long, '12px sans-serif')*Math.cos(Math.PI/4) - (s(long) + s.bandwidth()/2);
        expect(f.margins.left).toBeGreaterThanOrEqual(reach);
        // of a negative angle the last label to the right
        const { v: w } = await of(bars({ rotate: -45 }), 400, `name,value\nWien,2\nTirol,3\n${long},1`);
        const g = w.facets[0];
        const t = g.scales.x;
        expect(g.margins.right).toBeGreaterThanOrEqual(textWidth(long, '12px sans-serif')*Math.cos(Math.PI/4) - (g.innerWidth - t(long) - t.bandwidth()/2));
    });

    test('the margins of narrow charts are the ones of their final width: measured again, the same', async () => {
        const rows = `name,value\nA,1\nB,2\n${long},3`;
        for (const width of [200, 250, 300]) {
            const { store, v } = await of(bars(), width, rows);
            const f = v.facets[0];
            const again = autoMargins(store, v.facets, { top: 'auto', right: 'auto', bottom: 'auto', left: 'auto' });
            expect(again).toEqual(f.margins);
            const s = f.scales.x;
            // the last label ends in the chart, at its right edge at most
            // (of 200 pixels it is wider than the half of the chart, the
            // plot area keeps that)
            if (width > 200)
                expect(textWidth(long, '12px sans-serif')/2 - (f.innerWidth - s(long) - s.bandwidth()/2)).toBeLessThanOrEqual(f.margins.right);
        }
    });

    test('a text at the end of a line, also of a narrow chart', async () => {
        const rows = 'year,value\n2020,1\n2021,2';
        const def = { dims: { x: { column: 'year', type: 'numeric', format: 'd' }, y: { column: 'value', zero: true } },
            marks: [{ type: 'line' }, { type: 'text', select: 'last', text: 'Ein langer Name', dx: 4 }] };
        for (const width of [220, 300, 600]) {
            const { v } = await of(def, width, rows);
            const f = v.facets[0];
            const end = f.scales.x(2021) + 4 + textWidth('Ein langer Name', '12px sans-serif');
            // the plot area keeps half of the width, of 220 pixels the text
            // does not fit then
            expect(f.innerWidth).toBeGreaterThanOrEqual(width/2);
            if (width == 220)
                continue;
            expect(end).toBeLessThanOrEqual(f.innerWidth + f.margins.right);
            expect(end).toBeGreaterThan(f.innerWidth + f.margins.right - 4);
        }
    });
});

describe('"auto" and expressions of the margins', () => {
    test('"margins": "auto" is the same as no margins, also with the defaults of the page', async () => {
        const { registerDefaults } = await import('@/utils/defaults');
        registerDefaults({ margins: { left: 50 } });
        try {
            expect(await margins({ margins: 'auto' })).toEqual(await margins({}));
            expect((await margins({ margins: 'auto' })).left).toBe(50);
            // a side of "auto" is measured
            expect((await margins({ margins: { left: 'auto' } })).left).not.toBe(50);
        } finally {
            registerDefaults(null);
        }
    });

    test('an expression of a side may be "auto", one without a value is no side', async () => {
        const measured = await margins({}, 300);
        expect(await margins({ margins: { left: "=if(@totalWidth > 500, 80, 'auto')" } }, 300)).toEqual(measured);
        expect((await margins({ margins: { left: "=if(@totalWidth > 500, 80, 'auto')" } }, 600)).left).toBe(80);
        expect(await margins({ margins: { left: '=if(@totalWidth > 500, 80)' } }, 300)).toEqual(measured);
    });
});

describe('the plot area keeps half of the size', () => {
    const months = 'd,v\n2024-01-01,1\n2024-02-01,2\n2024-03-01,3';
    const of = async (def, data, width = 640) => {
        const store = createStore();
        await store.init({ def, data });
        return layout(store, width).facets[0];
    };

    test('an annotation outside of the domain is not drawn and makes no margin, also not its label', async () => {
        for (const a of [{ type: 'line', y: 10, label: 'Ziel' }, { type: 'line', y: -20, label: 'Min' }, { type: 'line', x: '2030-01-01', label: 'out' },
            { type: 'text', x: '2024-06-01', y: 2, text: 'Event' }, { type: 'band', x: ['2024-06-01', '2024-07-01'], label: 'Sommer' }]) {
            const def = { width: 640, height: 400, dims: { x: 'd', y: 'v' }, marks: [{ type: 'line' }], annotations: [a] };
            const f = await of(def, months);
            expect(f.innerHeight).toBeGreaterThan(300);
            expect(f.innerWidth).toBeGreaterThan(560);
            const el = await mount({ def, data: months });
            expect(el.querySelector('.vis-annotation, .vis-annotation-label')).toBeNull();
        }
        // a band partly in the domain is drawn up to its edge
        const el = await mount({ def: { width: 640, dims: { x: 'd', y: 'v' }, marks: [{ type: 'line' }], annotations: [{ type: 'band', x: ['2024-02-01', '2024-07-01'], label: 'Sommer' }] }, data: months });
        expect(el.querySelector('rect.vis-annotation')).not.toBeNull();
        // `include` takes it into the domain, its label above the line
        const f = await of({ dims: { x: 'd', y: { column: 'v', include: 10 } }, marks: [{ type: 'line' }], annotations: [{ type: 'line', y: 10, label: 'Ziel' }] }, months);
        expect(f.scales.y.domain()[1]).toBeGreaterThanOrEqual(10);
        expect(f.innerHeight).toBeGreaterThan(300);
    });

    test('labels of values outside of a fixed domain make no margin, texts at a place of the facet do', async () => {
        const y = await of({ dims: { x: 'd', y: { column: 'v', domain: [0, 1.5] } }, marks: [{ type: 'line', clip: true }, { type: 'label', text: '@y', anchor: 'top' }] }, months);
        expect(y.innerHeight).toBeGreaterThan(300);
        const x = await of({ dims: { x: { column: 'd', domain: ['2024-01-01', '2024-01-20'] }, y: 'v' }, marks: [{ type: 'line', clip: true }, { type: 'text', text: 'a long label', dx: 4 }] }, months);
        expect(x.innerWidth).toBeGreaterThan(500);
        // the texts of a mark with `clip` end at the edges of the plot area
        const clipped = await of({ dims: { x: 'd', y: 'v' }, marks: [{ type: 'line' }, { type: 'text', select: 'last', text: 'a long label', dx: 4, clip: true }] }, months);
        expect(clipped.margins.right).toBe(8);
        // a unit above the plot area
        const unit = await of({ dims: { x: 'd', y: 'v' }, marks: [{ type: 'line' }, { type: 'text', once: true, x: '@plot:left', y: '=@plot:top - 30', text: 'in €' }] }, months);
        expect(unit.margins.top).toBeGreaterThan(30);
    });

    test('a long label of a left axis leaves half of the width to the plot area, the side without labels keeps its floor', async () => {
        const f = await of({ dims: { y: { column: 'k', type: 'categorical' }, x: 'v' }, marks: [{ type: 'bar' }] }, `k,v\n${'A very long category label '.repeat(4)},5\nb,3`);
        expect(f.innerWidth).toBeGreaterThanOrEqual(320);
        expect(f.margins.right).toBe(8);
        // a given side counts: the measured one takes the rest of the half
        const given = await of({ margins: { right: 100 }, dims: { y: { column: 'k', type: 'categorical' }, x: 'v' }, marks: [{ type: 'bar' }] }, `k,v\n${'A very long category label '.repeat(4)},5\nb,3`);
        expect(given.margins).toMatchObject({ left: 220, right: 100 });
    });
});
