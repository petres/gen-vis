// @vitest-environment jsdom
// the margins of the facets measured of the axes ("auto", the default),
// see utils/margins.js; without a canvas (jsdom) a character of a label is
// 0.55 em of 12 pixels, see utils/measure.js
import { describe, test, expect, beforeAll } from 'vitest';
import { loadColors } from '@/utils/d3';
import { createStore } from '@/store';
import { layout } from '@/layout';
import { textWidth } from '@/utils/measure';
import { createGenVis } from '@/index.js';
import { useDom, rendered, nextTick } from './dom.js';

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
});
