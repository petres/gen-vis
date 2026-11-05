import { loadColors } from '@/utils/d3';
import { describe, test, expect, beforeAll, vi } from 'vitest';
import { createStore } from '@/store';
import { layout, plotGroups } from '@/layout';

// the colors of d3 are loaded by the store, see loadColors
beforeAll(loadColors);

const mapping = () => ({
    x: { column: 'year', type: 'numeric', scale: { orientation: 'horizontal' } },
    y: { column: 'value', type: 'numeric', scale: { orientation: 'vertical', domain: [0, null] } },
    c: { column: 'land', type: 'categorical', legend: {}, categories: { Wien: {}, Tirol: {}, Salzburg: { visible: false } } },
    color: { column: 'value', type: 'numeric', scale: { type: 'sequential', interpolator: 'Blues' } },
});
const data = 'year,value,land\n2020,1,Wien\n2021,2,Wien\n2020,10,Tirol\n2021,20,Tirol\n2020,5,Salzburg';
const plot = { type: 'cartesian:line', by: ['c'], props: { d: { x: '@x:scaled', y: '@y:scaled' } } };

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

    test('the columns of facets of a global ("cols": "@cols"), no grid, as in 4.0', async () => {
        const v = await view({ globals: { cols: 1 }, facets: { dim: 'c', cols: '@cols' } });
        expect(v.facets.map(f => [f.key, f.width])).toEqual([['Wien', 400], ['Tirol', 400]]);
        const { validateDef } = await import('@/utils/validate');
        expect(validateDef({ mapping: mapping(), plot, globals: { cols: 1 }, facets: { dim: 'c', cols: '@cols' } }).filter(w => w.startsWith('facets'))).toEqual([]);
    });

    test('the scales of colors are the ones of all rows, also of the legend', async () => {
        const v = await view({ facets: { dim: 'c', cols: 2 } });
        expect(v.colors.color.domain()).toEqual([1, 20]);
        expect(v.facets.every(f => f.scales.color === v.colors.color)).toBe(true);
    });

    describe('domainIgnores: the domain of the rows of the other conditions of the filter', () => {
        const months = 'month,zone,price,fuel\n7,AT,100,gas\n7,DE,160,gas\n10,AT,240,gas\n10,DE,120,gas\n7,AT,30,coal\n10,DE,50,coal';
        const def = (scale, extra = {}) => ({
            globals: { month: '7', fuel: 'gas' },
            filter: { month: '@month', fuel: '@fuel' },
            mapping: {
                month: { column: 'month', type: 'categorical' },
                fuel: { column: 'fuel', type: 'categorical', fromData: true },
                x: { column: 'zone', type: 'categorical', scale: { orientation: 'horizontal' } },
                y: { column: 'price', type: 'numeric', scale: { orientation: 'vertical', domain: [0, null], domainRel: [0, 0], ...scale } },
                color: { column: 'price', type: 'numeric', scale: { type: 'sequential', interpolator: 'Reds', ...scale } },
            },
            plot: { type: 'cartesian:bar', props: { x: '@x:scaled', y: '@y:scaled' } },
            ...extra,
        });
        const views = async (scale, extra) => {
            const store = createStore();
            await store.init({ def: { options: { height: 200 }, ...def(scale, extra) }, data: months });
            return ['7', '10'].map(month => {
                store.def.globals.month = month;
                return layout(store, 400);
            });
        };

        test('the same domain of all months, the rows of the month', async () => {
            const [july, october] = await views({ domainIgnores: ['month'] });
            expect(july.rows.map(r => r.y)).toEqual([100, 160]);
            expect(october.rows.map(r => r.y)).toEqual([240, 120]);
            [july, october].forEach(v => {
                expect(v.facets[0].scales.y.domain()).toEqual([0, 240]);
                // the scale of the legend
                expect(v.colors.color.domain()).toEqual([100, 240]);
            });
            // the nearest value with data is one of the month: at the top
            // (240 of October) the highest one of July
            expect(july.facets[0].scales.y.nearest(0)).toBe(160);
        });

        test('without domainIgnores the domain of the month, ignored conditions keep the others', async () => {
            const [july, october] = await views({});
            expect([july, october].map(v => v.facets[0].scales.y.domain())).toEqual([[0, 160], [0, 240]]);
            // the domain of gas only, also with the coal of the other months
            const [all] = await views({ domainIgnores: true });
            expect(all.facets[0].scales.y.domain()).toEqual([0, 240]);
            expect(all.colors.color.domain()).toEqual([30, 240]);
        });

        test('fixed entries of the domain and nice, categories of all months', async () => {
            const [july] = await views({ domainIgnores: ['month'], domain: [null, 300] });
            expect(july.facets[0].scales.y.domain()).toEqual([100, 300]);
            const store = createStore();
            const d = def({});
            d.mapping.x.scale.domainIgnores = ['month'];
            d.globals.fuel = 'coal';
            await store.init({ def: { options: { height: 200 }, ...d }, data: months });
            expect(layout(store, 400).facets[0].scales.x.domain()).toEqual(['AT', 'DE']);
        });

        test('the stacks of all months, per month', async () => {
            // gas and coal stacked by zone: 130 and 160 in July, 240 and 170
            // in October, not 370 of AT of all months together
            const stacked = async scale => {
                const store = createStore();
                const d = def(scale, { filter: { month: '@month' } });
                d.mapping.y.stacked = true;
                await store.init({ def: { options: { height: 200 }, ...d }, data: months });
                return ['7', '10'].map(month => {
                    store.def.globals.month = month;
                    return layout(store, 400).facets[0].scales.y.domain();
                });
            };
            expect(await stacked({})).toEqual([[0, 160], [0, 240]]);
            expect(await stacked({ domainIgnores: ['month'] })).toEqual([[0, 240], [0, 240]]);
        });

        test('facets with own scales: the rows of the facet of all months', async () => {
            const [july] = await views({ domainIgnores: ['month'] }, { filter: { month: '@month' }, facets: { dim: 'fuel', cols: 2 } });
            expect(july.facets.map(f => [f.key, f.scales.y.domain()])).toEqual([['coal', [0, 50]], ['gas', [0, 240]]]);
        });
    });

    test('without rows of a facet one of all rows', async () => {
        const store = createStore();
        await store.init({ def: { options: { height: 200 }, mapping: mapping(), plot, facets: { dim: 'c', cols: 2 } }, data });
        Object.values(store.def.mapping.c.categoryProps).forEach(p => p.visible = false);
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
        const def = { mapping: { ...mapping(), c: { column: 'land', categories: { Wien: { color: 'red', bold: 'bold' }, Tirol: { color: 'blue' } } } } };
        const { groups: [a, b] } = await groups({ type: 'svg:rect', by: ['c'], props: { fill: '@color', 'font-weight': '@bold' } }, def);
        expect(a.attrs).toEqual({ fill: 'red', 'font-weight': 'bold' });
        expect(b.attrs).toEqual({ fill: 'blue', 'font-weight': undefined });
    });

    test('the names of the rows, their scaled and stacked values', async () => {
        const def = { mapping: { ...mapping(), y: { ...mapping().y, stacked: true } } };
        const { groups: [wien, tirol], facet } = await groups({ type: 'svg:rect', by: ['c'], props: {
            v: '@y', x: '@x:scaled', zero: '@y:scaled:0', max: '@y:scaled:max', start: '@y:start', end: '@y:end', top: '@y:end:scaled', h: '@y:height:scaled',
            mid: '@y:mid', midY: '@y:mid:scaled',
        } }, def);
        const y = facet.scales.y;
        expect(tirol.at(tirol.rows[0])).toEqual({ v: 10, x: facet.scales.x(2020), zero: y(0), max: y(y.domain()[1]), start: 1, end: 11, top: y(11), h: y(1) - y(11), mid: 6, midY: y(6) });
        expect(wien.at(wien.rows[0])).toMatchObject({ start: 0, end: 1 });
        // the rows are not changed
        expect(Object.keys(tirol.rows[0])).toEqual(['x', 'y', 'c', 'color']);
    });

    test('the props of the categories, then the rows, then the globals and the facet', async () => {
        const def = { globals: { y: 'global', g: 'global' }, mapping: { ...mapping(), c: { column: 'land', categories: { Wien: { x: 'category' }, Tirol: {} } } } };
        const { groups: [wien, tirol] } = await groups({ type: 'svg:rect', by: ['c'], props: { a: '@x', b: '@y', c: '@g', d: '@innerWidth' } }, def);
        expect(wien.at(wien.rows[0])).toEqual({ a: 'category', b: 1, c: 'global', d: 400 });
        expect(tirol.at(tirol.rows[0])).toEqual({ a: 2020, b: 10, c: 'global', d: 400 });
    });
});

describe('rows without a value', () => {
    // three kinds of rows, each without some values: lines, caps and labels
    const data = 'x,y,kind,label\n1,2,step,\n2,3,step,\n1,,cap,\n2,,cap,\n,,n,n=5';
    const mapping = {
        x: { column: 'x', type: 'numeric', scale: { orientation: 'horizontal' } },
        y: { column: 'y', type: 'numeric', scale: { orientation: 'vertical' } },
        kind: { column: 'kind', type: 'categorical', fromData: true },
        label: { column: 'label', type: 'categorical', fromData: true },
    };
    const plots = [
        { id: 'steps', type: 'cartesian:line', filter: { kind: 'step' }, props: { d: { x: '@x:scaled', y: '@y:scaled' } } },
        { id: 'caps', type: 'svg:line', filter: { kind: 'cap' }, props: { x1: '@x:scaled', x2: '@x:scaled', y1: '@y:scaled:min', y2: '@y:scaled:max' } },
        { id: 'labels', type: 'svg:text', by: ['label'], filter: { kind: 'n' }, props: { x: '@x:scaled:0', y: '@y:scaled:max', text: '@label' } },
    ];
    const setup = async (plot = plots) => {
        const store = createStore();
        await store.init({ def: { options: { height: 200 }, mapping, plot }, data });
        const v = layout(store, 400);
        const f = v.facets[0];
        const groups = id => {
            const p = store.def.plot.find(e => e.id == id);
            return plotGroups(p, f.rows.filter(r => r.kind == p.filter.kind), { store, ...f });
        };
        return { store, v, groups };
    };

    test('are kept, a mapping of categories without a value leaves them in no category', async () => {
        const { v, store, groups } = await setup();
        expect(v.rows.map(r => r.kind)).toEqual(['step', 'step', 'cap', 'cap', 'n']);
        expect(groups('steps').flatMap(g => g.rows).length).toBe(2);
        // the label of the n row is its category
        expect(groups('labels').map(g => g.categories.label)).toEqual(['n=5']);
        // a plot by the categories of all rows has none of the rows without one
        const all = plotGroups(store.def.plot[2], v.rows, { store, ...v.facets[0] });
        expect(all.map(g => [g.categories.label, g.rows.length])).toEqual([['n=5', 1]]);
    });

    test('the ends of a scale need no value of the row, a hidden category leaves its rows out', async () => {
        const { v, store, groups } = await setup();
        const caps = groups('caps');
        expect(caps.flatMap(g => g.rows.filter(g.complete)).length).toBe(2);
        // no category of rows without a value on the scales of categories
        store.def.mapping.label.categoryProps['n=5'].visible = false;
        expect(layout(store, 400).rows.map(r => r.kind)).toEqual(['step', 'step', 'cap', 'cap']);
        expect(v.rows.length).toBe(5);
    });

    test('a plot whose rows all lack a value is named in a warning', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { groups } = await setup([{ ...plots[1], id: 'caps', props: { x1: '@x:scaled', y1: '@y:scaled' } }]);
        groups('caps');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining(`plot 'caps': none of its 2 rows is drawn, 2 without a value of mapping 'y'`));
        warn.mockRestore();
    });
});

describe('filters of no mapping', () => {
    test('are named in a warning, e.g. a column instead of its mapping', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const store = createStore();
        await store.init({ def: { options: { height: 200 }, mapping: mapping(), plot: { ...plot, filter: { year: 2020 } } }, data });
        const v = layout(store, 400);
        const p = store.def.plot[0];
        expect(plotGroups(p, (await import('@/layout')).plotRows(store, p, v.facets[0]), { store, ...v.facets[0] })).toEqual([]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining(`plot plot-0: filter.year: unknown mapping 'year', the keys of a filter are the names of mappings, not columns`));
        warn.mockRestore();
    });
});

describe('the plot area', () => {
    test('its edges and size in the coordinates of the plots, height of the facet with the margins', async () => {
        const store = createStore();
        await store.init({ def: { options: { height: 200, margins: { top: 10, right: 10, bottom: 30, left: 20 } }, mapping: mapping(), plot }, data });
        const scope = layout(store, 400).facets[0].scope;
        expect(scope).toMatchObject({ 'plot:left': 0, 'plot:top': 0, 'plot:right': 370, 'plot:bottom': 160, 'plot:width': 370, 'plot:height': 160, height: 200 });
    });

    test('around the center of polar plots', async () => {
        const store = createStore();
        await store.init({ def: { options: { height: 200, coord: 'polar', margins: { top: 0, right: 0, bottom: 0, left: 0 } },
            mapping: { x: { column: 'land', type: 'categorical' }, y: { column: 'value', type: 'numeric' } }, plot: { type: 'polar:arc' } }, data });
        expect(layout(store, 300).facets[0].scope).toMatchObject({ 'plot:left': -150, 'plot:top': -100, 'plot:right': 150, 'plot:bottom': 100 });
    });
});

describe('stacks at the positions of another mapping (stackBy)', () => {
    test('the classes of a bin stacked at their start, the rows of the values not', async () => {
        const store = createStore();
        await store.init({ def: {
            options: { height: 200 },
            transform: { type: 'bin', column: 'v', edges: [0, 5, 10], by: 'g', start: 'lo', end: 'hi' },
            mapping: {
                x: { column: 'v', type: 'numeric', scale: { orientation: 'horizontal' } },
                lo: { column: 'lo', type: 'numeric', scale: { of: 'x' } },
                y: { column: 'count', type: 'numeric', stacked: true, stackBy: 'lo', scale: { orientation: 'vertical', domain: [0, null], domainRel: [0, 0] } },
                g: { column: 'g', type: 'categorical', categories: { a: {}, b: {} } },
            },
            plot: { type: 'bar', by: 'g', props: { x0: '@lo:scaled', x1: '@lo:scaled', y0: '@y:start:scaled', y1: '@y:end:scaled' } },
        }, data: 'v,g\n1,a\n2,b\n3,b\n7,a' });
        const v = layout(store, 400);
        const classes = v.rows.filter(r => r.lo !== null);
        expect(classes.map(r => [r.g, r.lo, ...v.stackOf(r)])).toEqual([['a', 0, 0, 1], ['a', 5, 0, 1], ['b', 0, 1, 3], ['b', 5, 1, 1]]);
        expect(v.facets[0].scales.y.domain()).toEqual([0, 3]);
    });
});

describe('grids of facets', () => {
    const data = 'year,value,group,band\n2020,1,Bau,low\n2021,2,Bau,low\n2020,10,DL,low\n2021,20,DL,low\n2020,100,Bau,high\n2021,200,Bau,high';
    const def = facets => ({
        options: { height: 200 },
        mapping: {
            x: { column: 'year', type: 'numeric', scale: { orientation: 'horizontal' } },
            y: { column: 'value', type: 'numeric', scale: { orientation: 'vertical', domain: [0, null], domainRel: [0, 0] } },
            group: { column: 'group', categories: { Bau: { name: 'Bauaufträge' }, DL: {} } },
            band: { column: 'band', categories: { low: { name: '50–100k' }, high: {} } },
        },
        plot: { type: 'line', props: {} },
        facets,
    });
    const view = async (facets, width = 400) => {
        const store = createStore();
        await store.init({ def: def(facets), data });
        store.rowHeaderWidth = 40;
        return layout(store, width);
    };

    test('a cell per row and column in the order of their categories, empty ones, the width without the headers of the rows', async () => {
        const v = await view({ rows: 'band', cols: 'group' });
        expect(v.facets.map(f => [f.cell.row, f.cell.col, f.rows.length, Boolean(f.empty), f.width])).toEqual([
            ['low', 'Bau', 2, false, 180], ['low', 'DL', 2, false, 180], ['high', 'Bau', 2, false, 180], ['high', 'DL', 0, true, 180]]);
        expect(v.facets.map(f => f.outer)).toEqual([
            { top: true, bottom: false, left: true, right: false }, { top: true, bottom: false, left: false, right: true },
            { top: false, bottom: true, left: true, right: false }, { top: false, bottom: true, left: false, right: true }]);
        expect(v.facets[0].scope).toMatchObject({ 'facet:row': 'low', 'facet:col': 'Bau', 'facet:row:name': '50–100k', 'facet:col:name': 'Bauaufträge' });
    });

    test('scales of all facets, of each row, of each facet', async () => {
        const own = await view({ rows: 'band', cols: 'group' });
        expect(own.facets.slice(0, 3).map(f => f.scales.y.domain()[1])).toEqual([2, 20, 200]);
        const row = await view({ rows: 'band', cols: 'group', scales: { y: 'row' } });
        expect(row.facets.map(f => f.scales.y.domain()[1])).toEqual([20, 20, 200, 200]);
        expect(row.facets[0].scales.y).toBe(row.facets[1].scales.y);
        const all = await view({ rows: 'band', cols: 'group', scales: ['y'] });
        expect(new Set(all.facets.map(f => f.scales.y.domain()[1]))).toEqual(new Set([200]));
    });

    test('rows alone are one column, the facets of dim and cols as before', async () => {
        const rows = await view({ rows: 'band' });
        expect(rows.facets.map(f => [f.cell.row, f.cell.col, f.width])).toEqual([['low', undefined, 360], ['high', undefined, 360]]);
        const old = await view({ dim: 'group', cols: 2 });
        expect(old.facets.map(f => [f.key, f.cell, f.width])).toEqual([['Bau', undefined, 200], ['DL', undefined, 200]]);
    });
});
