// @vitest-environment jsdom
// the problems of the definitions of maps: joins without a feature, errors of
// the geometry and the projection, annotations a map has not
import { describe, test, expect } from 'vitest';
import { errors, useDom, mount } from './dom.js';

useDom();

// squares next to each other, the ids as of a file, e.g. "01" and 3
const square = (id, x) => ({ type: 'Feature', id, properties: { name: `Region ${id}` },
    geometry: { type: 'Polygon', coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] } });
const regions = { type: 'FeatureCollection', features: [square('01', 0), square('02', 1), square(3, 2)] };
const mapDef = (geo = {}) => ({
    options: { coord: 'geo', width: 300, height: 100, margins: { top: 0, right: 0, bottom: 0, left: 0 } },
    geo: { data: regions, join: 'region', ...geo },
    mapping: {
        region: { column: 'region', type: 'categorical' },
        value: { column: 'value', type: 'numeric', hover: {} },
    },
    plot: [
        { type: 'geo:base', props: { fill: '#EEE' } },
        { type: 'geo:region', by: ['region'], props: { fill: 'red' } },
        { type: 'geo:circle', by: ['region'], props: { r: 3 } },
    ],
});
const regionsDrawn = el => [...el.querySelectorAll('g.vis-plot.plot-1 path')]
    .map(p => [p.getAttribute('data-geo-key'), p.getAttribute('d') !== null]);
const errorOf = el => el.querySelector('.vis-error')?.textContent;
const warnings = () => errors.filter(e => e.startsWith('gen-vis'));

describe('the join of rows to the features', () => {
    test('keys with leading zeros match integers, e.g. 1 of a CSV the id "01"', async () => {
        const el = await mount({ def: mapDef(), data: 'region,value\n1,1\n2,2\n3,3' });
        expect(regionsDrawn(el)).toEqual([['1', true], ['2', true], ['3', true]]);
        expect(el.querySelectorAll('g.vis-plot.plot-2 circle')).toHaveLength(3);
        expect(errors).toEqual([]);
    });

    test('ambiguous integer keys are not matched', async () => {
        const def = mapDef();
        def.geo.data = { type: 'FeatureCollection', features: [square('01', 0), square('001', 1)] };
        const el = await mount({ def, data: 'region,value\n1,1\n01,2' });
        expect(regionsDrawn(el)).toEqual([['01', true]]);
        expect(warnings()).toEqual([]);
    });

    test('rows without a feature are not drawn', async () => {
        const el = await mount({ def: mapDef(), data: 'region,value\n01,1\nX,2' });
        expect(regionsDrawn(el)).toEqual([['01', true]]);
        expect(el.querySelectorAll('g.vis-plot.plot-2 circle')).toHaveLength(1);
        // a region the geometry has not, the join works
        expect(warnings()).toEqual([]);
    });

    test('a join of no row warns once, with the first keys and the key of the features', async () => {
        const el = await mount({ def: mapDef({ key: 'properties.name' }), data: 'region,value\nX,1\nY,2\nZ,3\nW,4' });
        expect(regionsDrawn(el)).toEqual([]);
        expect(el.querySelectorAll('g.vis-plot.plot-2 circle')).toHaveLength(0);
        // one warning of both plots
        expect(warnings()).toEqual([expect.stringMatching(/no value of the join 'region' \('X', 'Y', 'Z', \.\.\.\) matches a feature by its key 'properties\.name'/)]);
    });

    test('features without ids match no row', async () => {
        const def = mapDef();
        def.geo.data = { type: 'FeatureCollection', features: [square(undefined, 0), square(undefined, 1)] };
        const el = await mount({ def, data: 'region,value\n01,1' });
        expect(el.querySelectorAll('g.vis-plot.plot-0 path')).toHaveLength(2);
        expect(regionsDrawn(el)).toEqual([]);
        expect(warnings()[0]).toMatch(/key 'id'.*geo\.key/);
    });
});

describe('the errors of the geometry and the projection', () => {
    test('a parameter the projection has not', async () => {
        const el = await mount({ def: mapDef({ projection: { type: 'albersUsa', rotate: [10, 0] } }), data: 'region,value\n01,1' });
        expect(errorOf(el)).toMatch(/projection 'albersUsa' has no parameter 'rotate'/);
    });

    test('TopoJSON without objects or with an unknown object', async () => {
        const el = await mount({ def: mapDef({ data: { type: 'Topology', arcs: [] } }), data: 'region,value\n01,1' });
        expect(errorOf(el)).toMatch(/TopoJSON has no objects/);
        const topo = { type: 'Topology', objects: { a: { type: 'GeometryCollection', geometries: [] } }, arcs: [] };
        const el2 = await mount({ def: mapDef({ data: topo, object: 'b' }), data: 'region,value\n01,1' });
        expect(errorOf(el2)).toMatch(/Unknown object 'b' of the TopoJSON, expected one of 'a'/);
    });

    test('an empty geometry or an include of no feature', async () => {
        const el = await mount({ def: mapDef({ data: { type: 'FeatureCollection', features: [] } }), data: 'region,value\n01,1' });
        expect(errorOf(el)).toMatch(/^geo.data: the map has no features, the geometry is empty/);
        const el2 = await mount({ def: mapDef({ include: ['nope'] }), data: 'region,value\n01,1' });
        expect(errorOf(el2)).toMatch(/no features.*geo\.include.*key 'id'/);
    });

    test('a fit to the data without rows keeps the annotations finite', async () => {
        const def = mapDef({ fit: 'data' });
        def.annotations = [{ type: 'circle', lon: 0.5, lat: 0.5 }];
        const el = await mount({ def, data: 'region,value' });
        const c = el.querySelector('.vis-annotation.vis-circle');
        expect(Number.isFinite(parseFloat(c.getAttribute('cx')))).toBe(true);
        expect(Number.isFinite(parseFloat(c.getAttribute('cy')))).toBe(true);
    });
});

test('an annotation a map has not warns once', async () => {
    const def = mapDef();
    def.annotations = [{ type: 'band', x: [0, 1] }, { type: 'band', x: [1, 2] }, { type: 'circle', lon: 0.5, lat: 0.5 }];
    const el = await mount({ def, data: 'region,value\n01,1' });
    expect(el.querySelectorAll('.vis-annotation.vis-circle')).toHaveLength(1);
    const w = warnings().filter(e => e.includes("'band'"));
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/coordinate system 'geo' has no annotations of the type 'band', only 'text', 'circle'/);
});

describe('the place of the labels of a map', () => {
    test('the pole of inaccessibility of a polygon, inside of it, not its centroid', async () => {
        const { pole } = await import('@/coords/geo-map');
        // an L of arms 20 wide: its centroid (about 32, 32) is outside of it
        const l = [[[0, 0], [100, 0], [100, 20], [20, 20], [20, 100], [0, 100], [0, 0]]];
        const p = pole(l, 0.5);
        expect(p.d).toBeGreaterThan(9.4);
        expect(p.x < 20 || p.y < 20).toBe(true);
    });
});

describe('the labels of maps', () => {
    const labelDef = mark => ({
        coord: 'geo', width: 300, height: 100, margins: { top: 0, right: 0, bottom: 0, left: 0 },
        geo: { data: regions, join: 'region' },
        dims: { region: { column: 'region', type: 'categorical' } },
        marks: [{ type: 'base', fill: '#EEE' }, { type: 'text', by: 'region', text: '@region', ...mark }],
    });
    const labels = el => [...el.querySelectorAll('g.vis-plot.plot-1 text')];

    test('centered on their place by default, an anchor of the mark wins, a halo', async () => {
        const el = await mount({ def: labelDef({ halo: true }), data: 'region,value\n01,1\n02,2' });
        const [t] = labels(el);
        expect(t.getAttribute('text-anchor')).toBe('middle');
        expect(t.getAttribute('dominant-baseline')).toBe('middle');
        expect(t.getAttribute('paint-order')).toBe('stroke');
        expect(t.getAttribute('stroke-width')).toBe('3');
        const start = labels(await mount({ def: labelDef({ 'text-anchor': 'start' }), data: 'region,value\n01,1' }))[0];
        expect(start.getAttribute('text-anchor')).toBe('start');
        expect(start.getAttribute('stroke')).toBeNull();
        expect(errors).toEqual([]);
    });

    test('fit leaves out the labels which do not fit their area, also at the centroid', async () => {
        const data = 'region,value\n01,1\n02,2';
        const short = { text: '=if(@region == "01", "A", "A very long name of a region")' };
        for (const place of [{}, { place: 'centroid' }]) {
            expect(labels(await mount({ def: labelDef({ ...short, ...place }), data }))).toHaveLength(2);
            const fitted = labels(await mount({ def: labelDef({ ...short, ...place, fit: true }), data }));
            expect(fitted.map(t => t.textContent)).toEqual(['A']);
        }
        expect(errors).toEqual([]);
    });
});
