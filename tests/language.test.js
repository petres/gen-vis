import { describe, test, expect } from 'vitest';
import { translate, compileStrings, implicitDims, authoredPath, optionKeys } from '@/utils/language.js';
import { resolve } from '@/utils/resolve.js';

describe('the language of 5.0', () => {
    test('the options, the dims and the marks of a line chart', () => {
        const def = translate({
            data: 'data.csv',
            title: 'Bevölkerung', subtitle: 'nach Bundesland', source: 'Q', height: 300,
            dims: {
                x: { column: 'Jahr', format: 'c' },
                y: { column: 'Einwohner', zero: true, format: ',.0f', grid: true },
                land: { column: 'Bundesland', scheme: 'Tableau10', 'stroke-width': 2.5, categories: { Wien: '#123', Tirol: { name: 'T' } } },
            },
            marks: [
                { type: 'line', by: 'land', opacity: 0.7, highlight: { opacity: 1 } },
                { type: 'point', by: 'land', r: 4 },
            ],
        });
        // the options stay at the top level
        expect(optionKeys.filter(k => def[k] !== undefined).map(k => [k, def[k]])).toEqual([['title', 'Bevölkerung'], ['subtitle', 'nach Bundesland'], ['source', 'Q'], ['height', 300]]);
        expect(def.options).toBeUndefined();
        // the dims the marks use are in the hover
        expect(def.dims.y).toEqual({ column: 'Einwohner', format: ',.0f', scale: { zero: true }, axis: { grid: true }, hover: {} });
        // listed categories are all of them, the hover has the dims of `by`
        expect(def.dims.land).toEqual({ column: 'Bundesland', scheme: 'Tableau10', 'stroke-width': 2.5, hover: {},
            categories: { Wien: { color: '#123' }, Tirol: { name: 'T' } } });
        expect(def.marks).toEqual([
            { type: 'cartesian:line', by: ['land'], highlight: { opacity: 1 }, props: { opacity: 0.7, d: { x: '@x:scaled', y: '@y:scaled' } } },
            // x of no type beside a continuous y is no band (e.g. years), only a vertical dim beside a continuous x is one
            { type: 'svg:circle', by: ['land'], props: { r: 4, cx: '@x:scaled:center', cy: '@y:scaled' } },
        ]);
        expect(def.controls).toBeUndefined();
    });

    test('stacked bars, facets and the hover columns', () => {
        const def = translate({
            dims: { x: { column: 'Jahr', type: 'categorical' }, y: 'Anzahl', type: { column: 'Type' }, geo: 'Geo' },
            facets: { by: 'geo', cols: 2, scales: 'own' },
            hover: { columns: ['type'], total: true },
            marks: { type: 'bar', by: 'type', stack: true, opacity: 0.7, highlight: { mode: 'row', opacity: 1 } },
        });
        // the stacks start at 0, the domain includes it
        expect(def.dims.y).toEqual({ column: 'Anzahl', stacked: true, scale: { zero: true } });
        // the categories of dims without listed ones are the ones of the data, in their order
        // the dims of the facets have the categories of the data, in their order, the `by` of a mark groups rows of any type
        // a dim of the groups of a mark in the colors of its categories (the bars) has the categories of the data
        expect(def.dims.type).toEqual({ column: 'Type', hover: {}, fromData: 'rows' });
        expect(def.dims.geo).toEqual({ column: 'Geo', fromData: 'rows' });
        expect(def.facets).toEqual({ by: 'geo', cols: 2, scales: [] });
        expect(def.hover).toEqual({ total: true });
        expect(def.marks[0].props).toEqual({ opacity: 0.7, x: '@x:scaled', y0: '@y:start:scaled', y1: '@y:end:scaled' });
    });

    test('the value dims of bars and areas from their base 0 include 0, of a log scale they start at the domain', () => {
        const scale = (marks, y = 'v', x = 'a', coord) => {
            const def = translate({ ...(coord ? { coord } : {}), dims: { x, y }, marks });
            return { y: def.dims.y.scale, x: def.dims.x.scale, props: def.marks[0].props };
        };
        expect(scale({ type: 'bar' }).y).toEqual({ zero: true });
        expect(scale({ type: 'bar', dodge: 'c', by: 'c' }).y).toEqual({ zero: true });
        expect(scale({ type: 'area' }).y).toEqual({ zero: true });
        expect(scale({ type: 'area' }).props.d.y0).toBe('@y:scaled:0');
        // horizontal bars: x
        const h = scale({ type: 'bar' }, { column: 'name', type: 'categorical' }, 'v');
        expect([h.x, h.y]).toEqual([{ zero: true }, undefined]);
        // a start of their own, a line: none
        expect(scale({ type: 'bar', y0: 'lo' }).y).toBeUndefined();
        expect(scale({ type: 'line' }).y).toBeUndefined();
        // `"zero": false` keeps the domain of the data, a fixed domain stays as it is
        expect(scale({ type: 'bar' }, { column: 'v', zero: false }).y).toEqual({ zero: false });
        expect(scale({ type: 'bar' }, { column: 'v', domain: [5, 10] })).toMatchObject({ y: { zero: true } });
        // a log scale has no 0: from the start of its domain
        const log = scale({ type: 'bar' }, { column: 'v', scale: { type: 'log' } });
        expect(log.y).toEqual({ type: 'log' });
        expect(log.props.y0).toBeUndefined();
        expect(scale({ type: 'area' }, { column: 'v', scale: { type: 'log' } }).props.d.y0).toBe('@y:scaled:min');
        // polar areas: the radius
        const polar = scale({ type: 'area' }, 'v', 'a', 'polar');
        expect([polar.y, polar.props.d.innerRadius]).toEqual([{ zero: true }, '@y:scaled:0']);
    });

    test('horizontal bars, labels, controls and an expression filter', () => {
        const def = translate({
            globals: { year: '2022' },
            controls: [{ type: 'slider', global: 'year', name: 'Jahr', values: { column: 'Jahr' }, inImage: false }],
            filter: '@Jahr == @year',
            dims: { x: { column: 'Einwohner', zero: true }, y: { column: 'Bundesland', order: { by: 'x', descending: true } } },
            marks: [
                { type: 'bar', fill: '#1E4F77', highlight: { fill: '#5BC5F2' } },
                { type: 'label', text: '@x:formatted', anchor: 'end', 'font-size': 11 },
            ],
        });
        expect(def.filter).toEqual({ '==': ['@Jahr', '@year'] });
        expect(def.controls).toEqual([{ id: 'year', type: 'slider', global: 'year', name: 'Jahr', values: { column: 'Jahr' }, inImage: false }]);
        expect(def.marks[0]).toEqual({ type: 'cartesian:bar', by: [], highlight: { fill: '#5BC5F2' }, props: { fill: '#1E4F77', y: '@y:scaled', x1: '@x:scaled' } });
        expect(def.marks[1].props).toEqual({ text: '@x:formatted', 'font-size': 11, x: '@x:scaled', y: '@y:scaled:center', dx: 4, 'text-anchor': 'start', 'dominant-baseline': 'middle', fill: null });
    });

    test('dodged bars, cells, rules of ranges, numbers as values of the scale', () => {
        const def = translate({
            dims: { x: { column: 'year', type: 'categorical' }, y: 'value', lo: 'lo', hi: 'hi', c: { column: 'c' }, v: { column: 'v', scale: { type: 'sequential', interpolator: 'Blues' } } },
            marks: [
                { type: 'bar', by: 'c', dodge: true },
                { type: 'rule', y1: 'lo', y2: 'hi', stroke: '#333' },
                { type: 'cell', fill: 'v' },
                { type: 'rule', y: 100, 'stroke-dasharray': '2 2' },
                { type: 'point', x: 'lo', fill: 'c' },
            ],
        });
        // the band, of a scale without bands 80% of the step or the period
        const band = { if: ['@x:bandwidth', '@x:bandwidth', { '*': [0.8, '@x:step'] }] };
        expect(def.marks[0].props).toEqual({
            x: { '+': ['@x:scaled', { '*': [band, { '-': [{ '/': [{ '+': ['@c:index', 0.5] }, '@c:count'] }, 0.5] }] }] },
            width: { '/': [band, '@c:count'] },
            y1: '@y:scaled',
        });
        // at the center of the band of the categorical x
        expect(def.marks[1].props).toEqual({ stroke: '#333', x: '@x:scaled:center', y1: '@lo:scaled', y2: '@hi:scaled' });
        expect(def.marks[2].props).toEqual({ fill: '@v:scaled', x: '@x:scaled', width: '@x:bandwidth', y: '@y:scaled', height: '@y:bandwidth' });
        expect(def.marks[3].props).toEqual({ 'stroke-dasharray': '2 2', y: '@y:scaled:100' });
        // a fill of a dim of only a column is the color of its categories (the ones of the
        // data); the cell made y a band scale, so the point is at the center of the band
        expect(def.marks[4]).toEqual({ type: 'svg:circle', by: ['c'], props: { fill: '@color', cx: '@lo:scaled:center', cy: '@y:scaled:center' } });
        expect(def.dims.y.scale.type).toBe('band');
        // the dims of the ranges of the rule are on the scale of y
        expect(def.dims.lo.scale).toEqual({ of: 'y' });
        expect(def.dims.hi.scale).toEqual({ of: 'y' });
        expect(def.dims.c.fromData).toBe('rows');
    });

    test('polar and geo marks', () => {
        const polar = translate({ coord: 'polar', dims: { x: 'angle', y: 'share', c: 'c' },
            marks: [{ type: 'arc', by: 'c', stack: true, innerRadius: 50 }, { type: 'line', by: 'c', curve: 'linearClosed' }] });
        expect(polar.marks[0].props).toEqual({ innerRadius: 50, startAngle: '@x:start:scaled', endAngle: '@x:end:scaled' });
        expect(polar.marks[1]).toEqual({ type: 'polar:line', by: ['c'], curve: 'linearClosed', props: { d: { angle: '@x:scaled', radius: '@y:scaled' } } });
        expect(polar.dims.x.stacked).toBe(true);
        const geo = translate({ coord: 'geo', geo: { data: 'a.json', key: 'id', join: 'nuts' }, dims: { nuts: 'nuts2', lon: 'lon', lat: 'lat' },
            marks: [{ type: 'base', fill: '#eee' }, { type: 'region', by: 'nuts', fill: '#ccc' }, { type: 'point', lon: 'lon', lat: 'lat', r: 3 }] });
        expect(geo.marks.map(p => p.type)).toEqual(['geo:base', 'geo:region', 'geo:circle']);
        expect(geo.marks[2].props).toEqual({ r: 3, lon: '@lon', lat: '@lat' });
    });

    test('the string syntax of expressions, names stay texts', () => {
        expect(compileStrings({ column: '@x', r: '@a * 2', text: '@name', d: { x: '=round(@x, 1)' }, title: 'T', values: ['@b + 1'] }))
            .toEqual({ column: '@x', r: { '*': ['@a', 2] }, text: '@name', d: { x: { round: ['@x', 1] } }, title: 'T', values: [{ '+': ['@b', 1] }] });
        expect(() => compileStrings({ marks: [{ fill: '@a +' }] })).toThrow('marks[0].fill: expression');
    });

    test('the paths of the definition of the ones of the engine\'s form', () => {
        expect(authoredPath('marks[1].props.fill')).toBe('marks[1].fill');
        expect(authoredPath('facets.by.rows')).toBe('facets.by.rows');
    });

    test('expressions of the globals at the options of a mark (type, curve, by, ...) are resolved, its attributes are drawn', () => {
        const def = {
            dims: { x: 'year', y: 'value', land: 'land', kind: 'kind' },
            marks: [{ type: "=match(@s, {p: 'point'}, 'line')", by: "=match(@s, {p: 'kind'}, 'land')", curve: "=match(@s, {p: 'step'})",
                stroke: "=match(@s, {p: 'red'}, 'blue')", 'stroke-width': '=@w * 2' }],
        };
        const p = translate(resolve(def, { s: 'p', w: 1 })).marks[0];
        expect(p.type).toBe('svg:circle');
        expect(p.by).toEqual(['kind']);
        expect(p.curve).toBe('step');
        const l = translate(resolve(def, { s: 'l', w: 1 })).marks[0];
        expect(l.type).toBe('cartesian:line');
        expect(l.by).toEqual(['land']);
        // a match without a case of the value and without a default: no curve
        expect(l.curve).toBeUndefined();
        // the attributes stay expressions, evaluated when they are drawn (with the globals)
        expect(l.props['stroke-width']).toEqual({ '*': ['@w', 2] });
        expect(() => translate({ marks: [{ type: { match: ['@s', {}] } }] })).toThrow(/marks\[0\]\.type: expected a mark type/);
    });
});

describe('controls of plain values', () => {
    test('are variants and have the fields of their entries', async () => {
        const { variants, namesOfGlobals } = await import('@/utils/resolve.js');
        const def = { globals: { kind: 'lines' }, controls: [{ type: 'radio', global: 'kind', values: ['lines', 'polar'] }],
            coord: "=match(@kind, {polar: 'polar'}, 'cartesian')", title: '{kind:name}' };
        expect(variants(def).map(v => v.coord)).toEqual(['cartesian', 'polar']);
        expect(namesOfGlobals({ kind: 'polar' }, def.controls)['kind:name']).toBe('polar');
    });
});

describe('the shorthands of a removed part', () => {
    test('"axis": false with grid or ticks stays without an axis, "scale": false with pad without a scale', () => {
        const m = translate({ dims: { x: 'year', y: { column: 'v', axis: false, grid: true, ticks: 5 }, z: { column: 'w', scale: false, pad: 0.1 } }, marks: { type: 'line' } }).dims;
        expect(m.y.axis).toBe(false);
        expect(m.y.grid).toBeUndefined();
        expect(m.z.scale).toBe(false);
        expect(m.z.pad).toBeUndefined();
    });
});

test('dodge: true without by is a named error', () => {
    expect(() => translate({ dims: { x: { column: 'g', type: 'categorical' }, y: 'v' }, marks: { type: 'bar', dodge: true } }))
        .toThrow(/marks\[0\]\.dodge: true puts the groups/);
});

describe('the categories of the dims of the groups', () => {
    test('a dim of only a column of marks in the colors of their categories has the ones of the data, fromData false keeps it without', () => {
        const t = (land, marks) => translate({ dims: { x: 'year', y: 'value', land }, marks }).dims.land;
        expect(t('land', { type: 'line', by: 'land' }).fromData).toBe('rows');
        // a mark of a color of its own, a label (the color of the text) and a dim of a type or a scale have none
        expect(t('land', { type: 'line', by: 'land', stroke: '#333' }).fromData).toBeUndefined();
        expect(t('land', { type: 'label', by: 'land', text: '@name' }).fromData).toBeUndefined();
        expect(t({ column: 'land', type: 'numeric' }, { type: 'line', by: 'land' }).fromData).toBeUndefined();
        expect(t({ column: 'land', fromData: false }, { type: 'line', by: 'land' }).fromData).toBeUndefined();
        // a color of an attribute of the color of the category
        expect(t('land', { type: 'line', by: 'land', stroke: '#333', highlight: { stroke: '@color' } }).fromData).toBe('rows');
    });
});

describe('the dims of the channels (review of 5.0)', () => {
    test('shared scales of the facets have the dims the channels add', () => {
        const t = translate({ dims: { g: 'group', x: 'year' }, facets: { by: 'g', scales: 'shared' }, marks: { type: 'point', y: 'value', x1: 'from' } });
        expect(t.facets.scales).toEqual(['g', 'x', 'y', 'from']);
    });
    test('a channel of an axis without the dim of the axis is the dim of the axis, of no other dim\'s scale', () => {
        const t = translate({ marks: { type: 'point', x: 'year', y: 'value' } });
        expect(t.dims).toEqual({ x: { column: 'year', hover: {} }, y: { column: 'value', hover: {} } });
        expect(t.marks[0].props).toMatchObject({ cx: '@x:scaled:center', cy: '@y:scaled:center' });
        // another column on the axis of x without a dim x: its own scale
        const r = translate({ dims: { y: 'v' }, marks: { type: 'rule', y: 'v', x1: 'lo', x2: 'hi' } });
        expect(r.dims.lo.scale).toBeUndefined();
        expect(r.dims.hi.scale).toBeUndefined();
        expect(translate({ dims: { x: 'year', y: 'v' }, marks: { type: 'rule', y: 'v', x1: 'lo' } }).dims.lo.scale).toEqual({ of: 'x' });
    });
    test('the implicit dims of the channels, their paths and columns', () => {
        expect(implicitDims({ dims: { x: 'year', y: 'value' }, marks: [{ type: 'line' }, { type: 'point', x: 'yaer', y: 'y' }] }))
            .toEqual([{ path: 'marks[1].x', column: 'yaer' }]);
        expect(implicitDims({ marks: { type: 'point', x: 'year', y: 'value' } }))
            .toEqual([{ path: 'marks[0].x', column: 'year' }, { path: 'marks[0].y', column: 'value' }]);
    });
    test('a channel of the column of the dim of its axis is that dim, not a dim of its own', () => {
        const t = translate({ dims: { x: { column: 'year', type: 'categorical' }, y: 'value' }, marks: [{ type: 'line', x: 'year' }, { type: 'point', y: 'value', x: 'year' }] });
        expect(Object.keys(t.dims)).toEqual(['x', 'y']);
        expect(t.marks[0].props.d.x).toBe('@x:scaled');
        expect(implicitDims({ dims: { x: 'year', y: 'value' }, marks: { type: 'point', x: 'year', y: 'value' } })).toEqual([]);
        // the column of another axis stays a dim of its own on the scale of the axis, e.g. y2 of the column of y
        expect(translate({ dims: { x: 'year', y: 'v' }, marks: { type: 'rule', y1: 'v', y2: 'hi' } }).dims.hi.scale).toEqual({ of: 'y' });
    });
    test('a fill of a categorical dim is in the default hover, as a by', () => {
        const t = translate({ dims: { x: 'a', y: 'b', land: { column: 'land', categories: { W: 'red', T: 'blue' } } }, marks: { type: 'point', fill: 'land' } });
        expect(t.marks[0].by).toEqual(['land']);
        expect(t.dims.land.hover).toEqual({});
    });
    test('lon and lat of expressions and references are the ones of the props', () => {
        const t = translate({ coord: 'geo', geo: { data: 'x.json' }, dims: { lng: 'lng', lt: 'lat' }, marks: { type: 'point', lon: '=@lng + 1', lat: 'lt' } });
        expect(t.marks[0].props).toMatchObject({ lon: { '+': ['@lng', 1] }, lat: '@lt' });
        expect(translate({ coord: 'geo', marks: { type: 'point', lon: '@lng', lat: '@lat' } }).marks[0].props).toMatchObject({ lon: '@lng', lat: '@lat' });
    });
});

test('a control of 5.0 sets its global, `ref` is no key of it (review of 5.0)', () => {
    expect(translate({ controls: [{ type: 'radio', global: 'a', values: ['x'] }] }).controls[0]).toMatchObject({ global: 'a', id: 'a' });
    expect(translate({ controls: [{ type: 'radio', ref: 'a', values: ['x'] }] }).controls[0].global).toBeUndefined();
});

test('stack of arcs: of categories around the circle the radius (a rose), else the angle (a pie)', () => {
    const rose = translate({ coord: 'polar', dims: { x: { column: 'year', type: 'categorical' }, y: 'n', t: { column: 't', legend: {} } }, marks: { type: 'arc', by: 't', stack: true } });
    expect(rose.marks[0].props).toMatchObject({ angle: '@x:scaled', innerRadius: '@y:start:scaled', outerRadius: '@y:end:scaled' });
    expect(rose.dims.y.stacked).toBe(true);
    const pie = translate({ coord: 'polar', dims: { x: 'share', t: { column: 't', legend: {} } }, marks: { type: 'arc', by: 't', stack: true } });
    expect(pie.marks[0].props).toMatchObject({ startAngle: '@x:start:scaled', endAngle: '@x:end:scaled' });
});

test('numbers at x and y of points and texts of cartesian charts are values on the scale, literals pixels', () => {
    const p = translate({ dims: { x: 'v', y: 'w' }, marks: [{ type: 'label', x: 250, text: 'a' }, { type: 'point', y: 3 }, { type: 'text', x: '=literal(34)', text: 'b' }] }).marks;
    expect(p[0].props.x).toBe('@x:scaled:250');
    expect(p[1].props.cy).toBe('@y:scaled:3');
    expect(p[2].props.x).toBe(34);
});

test('the corners as anchors of labels', () => {
    const p = translate({ dims: { x: 'v', y: 'w' }, marks: [{ type: 'label', anchor: 'top-end', text: 'a' }, { type: 'label', anchor: 'bottom-start', dx: 2, text: 'b' }] }).marks;
    expect(p[0].props).toMatchObject({ dx: 4, dy: -4, 'text-anchor': 'start', 'dominant-baseline': 'auto' });
    expect(p[1].props).toMatchObject({ dx: 2, dy: 4, 'text-anchor': 'end', 'dominant-baseline': 'hanging' });
});

test('"stack": "diverging" stacks all rows, the negative values in the reverse order', () => {
    const def = translate({ dims: { x: 'part', y: { column: 'statement', type: 'categorical' }, answer: { column: 'answer', legend: {} } }, marks: { type: 'bar', by: 'answer', stack: 'diverging' } });
    expect(def.dims.x).toMatchObject({ stacked: true, stackDiverging: true });
    expect(translate({ dims: { x: 'year', y: 'n', t: 't' }, marks: { type: 'bar', by: 't', stack: true } }).dims.y.stackDiverging).toBeUndefined();
});
