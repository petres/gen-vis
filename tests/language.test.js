import { describe, test, expect } from 'vitest';
import { translate, compileStrings, isDefinition4, isDefinition5, authoredPath } from '@/utils/language.js';

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
        expect(def.options).toEqual({ title: 'Bevölkerung', subtitle: 'nach Bundesland', footer: 'Q', height: 300 });
        expect(def.mapping.y).toEqual({ column: 'Einwohner', format: ',.0f', domain: [0, null], axis: { grid: true } });
        // listed categories are all of them, the hover has the dims of `by`
        expect(def.mapping.land).toEqual({ column: 'Bundesland', scheme: 'Tableau10', 'stroke-width': 2.5, hover: {},
            categories: { Wien: { color: '#123' }, Tirol: { name: 'T' } } });
        expect(def.plot).toEqual([
            { type: 'cartesian:line', by: ['land'], highlight: { opacity: 1 }, props: { opacity: 0.7, d: { x: '@x:scaled', y: '@y:scaled' } } },
            { type: 'svg:circle', by: ['land'], props: { r: 4, cx: '@x:scaled', cy: '@y:scaled' } },
        ]);
        expect(def.formElements).toBeUndefined();
    });

    test('stacked bars, facets and the hover columns', () => {
        const def = translate({
            dims: { x: { column: 'Jahr', type: 'categorical' }, y: 'Anzahl', type: { column: 'Type' }, geo: 'Geo' },
            facets: { by: 'geo', cols: 2, scales: 'own' },
            hover: { columns: ['type'], total: true },
            marks: { type: 'bar', by: 'type', stack: true, opacity: 0.7, highlight: { mode: 'row', opacity: 1 } },
        });
        expect(def.mapping.y).toEqual({ column: 'Anzahl', stacked: true });
        // the categories of dims without listed ones are the ones of the data, in their order
        // the dims of the facets have the categories of the data, in their order, the `by` of a mark groups rows of any type
        expect(def.mapping.type).toEqual({ column: 'Type', hover: {} });
        expect(def.mapping.geo).toEqual({ column: 'Geo', fromData: 'rows' });
        expect(def.facets).toEqual({ dim: 'geo', cols: 2, scales: [] });
        expect(def.options.hover).toEqual({ total: true });
        expect(def.plot[0].props).toEqual({ opacity: 0.7, x: '@x:scaled', y0: '@y:start:scaled', y1: '@y:end:scaled' });
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
        expect(def.formElements).toEqual([{ id: 'year', type: 'slider', ref: 'year', name: 'Jahr', values: { column: 'Jahr' }, inImage: false }]);
        expect(def.plot[0]).toEqual({ type: 'cartesian:bar', by: [], highlight: { fill: '#5BC5F2' }, props: { fill: '#1E4F77', y: '@y:scaled', x1: '@x:scaled' } });
        expect(def.plot[1].props).toEqual({ text: '@x:formatted', 'font-size': 11, x: '@x:scaled', y: '@y:scaled:center', dx: 4, 'text-anchor': 'start', 'dominant-baseline': 'middle', fill: null });
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
        expect(def.plot[0].props).toEqual({
            x: { '+': ['@x:scaled', { '*': ['@x:bandwidth', { '-': [{ '/': [{ '+': ['@c:index', 0.5] }, '@c:count'] }, 0.5] }] }] },
            width: { '/': ['@x:bandwidth', '@c:count'] },
            y1: '@y:scaled',
        });
        // at the center of the band of the categorical x
        expect(def.plot[1].props).toEqual({ stroke: '#333', x: '@x:scaled:center', y1: '@lo:scaled', y2: '@hi:scaled' });
        expect(def.plot[2].props).toEqual({ fill: '@v:scaled', x: '@x:scaled', width: '@x:bandwidth', y: '@y:scaled', height: '@y:bandwidth' });
        expect(def.plot[3].props).toEqual({ 'stroke-dasharray': '2 2', y: '@y:scaled:100' });
        // a fill of a dim without categories is its scaled value (of a scale of colors); the
        // cell made y a band scale, so the point is at the center of the band
        expect(def.plot[4]).toEqual({ type: 'svg:circle', by: [], props: { fill: '@c:scaled', cx: '@lo:scaled', cy: '@y:scaled:center' } });
        expect(def.mapping.y.scale.type).toBe('band');
        // the dims of the ranges of the rule are on the scale of y
        expect(def.mapping.lo.scale).toEqual({ of: 'y' });
        expect(def.mapping.hi.scale).toEqual({ of: 'y' });
        expect(def.mapping.c.fromData).toBeUndefined();
    });

    test('polar and geo marks', () => {
        const polar = translate({ coord: 'polar', dims: { x: 'angle', y: 'share', c: 'c' },
            marks: [{ type: 'arc', by: 'c', stack: true, innerRadius: 50 }, { type: 'line', by: 'c', curve: 'linearClosed' }] });
        expect(polar.plot[0].props).toEqual({ innerRadius: 50, startAngle: '@x:start:scaled', endAngle: '@x:end:scaled' });
        expect(polar.plot[1]).toEqual({ type: 'polar:line', by: ['c'], curve: 'linearClosed', props: { d: { angle: '@x:scaled', radius: '@y:scaled' } } });
        expect(polar.mapping.x.stacked).toBe(true);
        const geo = translate({ coord: 'geo', geo: { data: 'a.json', key: 'id', join: 'nuts' }, dims: { nuts: 'nuts2', lon: 'lon', lat: 'lat' },
            marks: [{ type: 'base', fill: '#eee' }, { type: 'region', by: 'nuts', fill: '#ccc' }, { type: 'point', lon: 'lon', lat: 'lat', r: 3 }] });
        expect(geo.plot.map(p => p.type)).toEqual(['geo:base', 'geo:region', 'geo:circle']);
        expect(geo.plot[2].props).toEqual({ r: 3, lon: '@lon', lat: '@lat' });
    });

    test('the string syntax of expressions, names stay texts', () => {
        expect(compileStrings({ column: '@x', r: '@a * 2', text: '@name', d: { x: '=round(@x, 1)' }, title: 'T', values: ['@b + 1'] }))
            .toEqual({ column: '@x', r: { '*': ['@a', 2] }, text: '@name', d: { x: { round: ['@x', 1] } }, title: 'T', values: [{ '+': ['@b', 1] }] });
        expect(() => compileStrings({ marks: [{ fill: '@a +' }] })).toThrow('marks[0].fill: expression');
    });

    test('the version of a definition and the paths', () => {
        expect(isDefinition4({ mapping: {}, plot: [] })).toBe(true);
        expect(isDefinition5({ dims: {}, marks: [] })).toBe(true);
        expect(isDefinition5({ data: 'x.csv' })).toBe(true);
        expect(authoredPath('mapping.y.scale.type')).toBe('dims.y.scale.type');
        expect(authoredPath('plot[1].props.fill')).toBe('marks[1].fill');
        expect(authoredPath('options.footer')).toBe('source');
        expect(authoredPath('formElements[0].ref')).toBe('controls[0].global');
    });
});
