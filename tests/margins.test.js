// the margins of the facets measured of the axes ("auto", the default),
// see utils/margins.js; without a canvas (jsdom) a character of a label is
// 0.55 em of 12 pixels, see utils/measure.js
import { describe, test, expect, beforeAll } from 'vitest';
import { loadColors } from '@/utils/d3';
import { createStore } from '@/store';
import { layout } from '@/layout';
import { textWidth } from '@/utils/measure';

beforeAll(loadColors);

const data = 'year,value,land\n2020,1,Wien\n2021,2,Wien\n2020,1000000,Tirol\n2021,2000000,Tirol';

const view = async (def, width = 400) => {
    const store = createStore();
    await store.init({ def: { height: 200, dims: { x: { column: 'year', type: 'numeric' }, y: { column: 'value', type: 'numeric', zero: true, format: ',.0f' } }, marks: { type: 'line' }, ...def }, data });
    return layout(store, width);
};
const margins = async (def, width) => (await view(def, width)).facets[0].margins;

// the extents of the parts of an axis: the tick marks, the padding of the
// labels and the height of a label
const marks = 9, padding = 3, label = 12;
const widest = texts => Math.max(...texts.map(t => textWidth(t, '12px sans-serif')));

describe('auto margins', () => {
    test('the widest label of the left axis, the height of the labels of the bottom axis, a floor beside them', async () => {
        const m = await margins({});
        // the ticks of y up to 2.000.000, the widest label "2.000.000"
        expect(m.left).toBe(Math.ceil(marks + padding + widest(['2.000.000']) + 2));
        expect(m.bottom).toBe(Math.ceil(marks + padding + label + 2));
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
        expect(rotated.bottom).toBe(Math.ceil(marks + padding + widest(['2020', '2021']) + 2));
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

    test('the plot area is the facet without the measured margins, also of a facet of a step height', async () => {
        const v = await view({});
        const f = v.facets[0];
        expect(f.innerWidth).toBe(f.width - f.margins.left - f.margins.right);
        expect(f.innerHeight).toBe(f.height - f.margins.top - f.margins.bottom);
    });
});
