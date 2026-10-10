import { loadColors } from '@/utils/d3';
import { describe, test, expect, beforeAll } from 'vitest';
import { createStore } from '@/store';
import { layout, plotGroups } from '@/layout';

// the colors of d3 are loaded by the store, see loadColors
beforeAll(loadColors);

const mapping = () => ({
    x: { column: 'year', type: 'numeric', scale: { orientation: 'horizontal' } },
    y: { column: 'value', type: 'numeric', scale: { orientation: 'vertical', domain: [0, null] } },
    c: { column: 'land', type: 'categorical', legend: {}, props: { categories: { Wien: {}, Tirol: {}, Salzburg: { visible: false } } } },
    color: { column: 'value', type: 'numeric', scale: { type: 'sequential', interpolator: 'Blues' } },
});
const data = 'year,value,land\n2020,1,Wien\n2021,2,Wien\n2020,10,Tirol\n2021,20,Tirol\n2020,5,Salzburg';
const plot = { type: 'cartesian:line', categories: ['c'], props: { d: { x: '@x:scaled', y: '@y:scaled' } } };

const view = async (def, width = 400) => {
    const store = createStore();
    await store.init({ def: { options: { height: 200, margins: { top: 10, right: 10, bottom: 10, left: 10 } }, mapping: mapping(), plot, ...def }, data });
    return layout(store, width);
};

describe('layout', () => {
    test('one facet of the visible rows in the width of the visualisation', async () => {
        const v = await view({});
        expect(v.faceted).toBe(false);
        expect(v.facets).toHaveLength(1);
        expect(v.rows.map(r => r.c)).toEqual(['Wien', 'Wien', 'Tirol', 'Tirol']);
        expect(v.facets[0]).toMatchObject({ width: 400, height: 200, innerWidth: 380, innerHeight: 180 });
        expect(v.facets[0].scope).toMatchObject({ totalWidth: 400, innerWidth: 380 });
        expect(v.facets[0].scales.y.domain()).toEqual([0, 20.4]);
        expect(v.axis).toEqual({ h: 'x', v: 'y' });
    });

    test('the rows of the filter, also of a global', async () => {
        const v = await view({ globals: { year: '2021' }, filter: { x: '@year' } });
        expect(v.rows.map(r => [r.x, r.c])).toEqual([[2021, 'Wien'], [2021, 'Tirol']]);
    });

    test('facets in the order of their categories, own and shared scales', async () => {
        const facets = { dim: 'c', cols: 2 };
        const own = await view({ facets });
        expect(own.faceted).toBe(true);
        expect(own.facets.map(f => [f.key, f.name, f.width, f.rows.length])).toEqual([['Wien', 'Wien', 200, 2], ['Tirol', 'Tirol', 200, 2]]);
        expect(own.facets.map(f => f.scales.y.domain()[1])).toEqual([2.04, 20.4]);

        const shared = await view({ facets: { ...facets, scales: ['y'] } });
        expect(shared.facets.map(f => f.scales.y.domain()[1])).toEqual([20.4, 20.4]);
        expect(shared.facets[0].scales.y).toBe(shared.facets[1].scales.y);
    });

    test('the scales of colors are the ones of all rows, also of the legend', async () => {
        const v = await view({ facets: { dim: 'c', cols: 2 } });
        expect(v.colors.color.domain()).toEqual([1, 20]);
        expect(v.facets.every(f => f.scales.color === v.colors.color)).toBe(true);
    });

    test('without rows of a facet one of all rows', async () => {
        const store = createStore();
        await store.init({ def: { options: { height: 200 }, mapping: mapping(), plot, facets: { dim: 'c', cols: 2 } }, data });
        Object.values(store.def.mapping.c.props).forEach(p => p.visible = false);
        const v = layout(store, 400);
        expect(v.faceted).toBe(false);
        expect(v.facets).toHaveLength(1);
        expect(v.facets[0]).toMatchObject({ width: 400, rows: [] });
    });
});

describe('plotGroups', () => {
    const groups = async (plot, def = {}) => {
        const store = createStore();
        await store.init({ def: { options: { height: 200 }, mapping: mapping(), plot, ...def }, data });
        const v = layout(store, 400);
        const f = v.facets[0];
        return { groups: plotGroups(store.def.plot[0], f.rows, { store, ...f }), facet: f };
    };

    test('the props of one group do not leak into others', async () => {
        const def = { mapping: { ...mapping(), c: { column: 'land', props: { categories: { Wien: { color: 'red', bold: 'bold' }, Tirol: { color: 'blue' } } } } } };
        const { groups: [a, b] } = await groups({ type: 'svg:circle', categories: ['c'], props: { fill: '@color', 'font-weight': '@bold' } }, def);
        expect(a.attrs).toEqual({ fill: 'red', 'font-weight': 'bold' });
        expect(b.attrs).toEqual({ fill: 'blue', 'font-weight': undefined });
    });

    test('the names of the rows, their scaled and stacked values', async () => {
        const def = { mapping: { ...mapping(), y: { ...mapping().y, stacked: true } } };
        const { groups: [wien, tirol], facet } = await groups({ type: 'svg:rect', categories: ['c'], props: {
            v: '@y', x: '@x:scaled', zero: '@y:scaled:0', max: '@y:scaled:max', start: '@y:start', end: '@y:end', top: '@y:end:scaled', h: '@y:height:scaled',
        } }, def);
        const y = facet.scales.y;
        expect(tirol.at(tirol.rows[0])).toEqual({ v: 10, x: facet.scales.x(2020), zero: y(0), max: y(y.domain()[1]), start: 1, end: 11, top: y(11), h: y(1) - y(11) });
        expect(wien.at(wien.rows[0])).toMatchObject({ start: 0, end: 1 });
        // the rows are not changed
        expect(Object.keys(tirol.rows[0])).toEqual(['x', 'y', 'c', 'color']);
    });

    test('the props of the categories, then the rows, then the globals and the facet', async () => {
        const def = { globals: { y: 'global', g: 'global' }, mapping: { ...mapping(), c: { column: 'land', props: { categories: { Wien: { x: 'category' }, Tirol: {} } } } } };
        const { groups: [wien, tirol] } = await groups({ type: 'svg:circle', categories: ['c'], props: { a: '@x', b: '@y', c: '@g', d: '@innerWidth' } }, def);
        expect(wien.at(wien.rows[0])).toEqual({ a: 'category', b: 1, c: 'global', d: 400 });
        expect(tirol.at(tirol.rows[0])).toEqual({ a: 2020, b: 10, c: 'global', d: 400 });
    });
});
