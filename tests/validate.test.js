import { describe, test, expect } from 'vitest';
import { validateDef, curveNames } from '@/utils/validate';
import { prepareDef } from '@/utils/json';
import { plotTypes, registerPlotType } from '@/plots';
import { coords, registerCoord } from '@/coords';
import { resolveParents } from '@/store';
import { definitions } from '@/dev/definitions.js';
import { readFileSync } from 'node:fs';

const examples = Object.fromEntries(definitions(import.meta.glob('../data/**/*.json', { eager: true, import: 'default' }))
    .map(d => [`../data/${d.path}`, d.def]));

const base = () => ({
    mapping: {
        x: { column: 'year', type: 'numeric', scale: { orientation: 'horizontal' }, axis: { position: 'bottom' } },
        y: { column: 'value', type: 'numeric', scale: { orientation: 'vertical' }, axis: { position: 'left' } },
        c: { column: 'land', type: 'categorical', props: { manual: { Wien: {} } } },
    },
    plot: { type: 'svg:path', categories: ['c'], props: { d: { x: '@x:scaled', y: '@y:scaled' } } },
});

test('the facets need one known mapping', () => {
    expect(validateDef({ ...base(), facets: { dim: 'c' } })).toEqual([]);
    expect(validateDef({ ...base(), facets: { dim: ['c'] } })).toEqual([]);
    expect(validateDef({ ...base(), facets: { dim: 'z' } })).toEqual([`facets.dim: unknown mapping 'z'`]);
    expect(validateDef({ ...base(), facets: { dim: ['c', 'x'] } })).toEqual([`facets.dim: expected the name of one mapping`]);
});

describe('the example definitions', () => {
    test('are found', () => {
        expect(Object.keys(examples).length).toBeGreaterThan(10);
    });

    // merged with their parents, as by a check before a deploy
    test.each(Object.entries(examples))('%s is valid', async (file, org) => {
        const url = new URL(file, import.meta.url).href;
        const def = await resolveParents(JSON.parse(JSON.stringify(org)), url, u => readFileSync(new URL(u), 'utf8'));
        expect(validateDef(def)).toEqual([]);
        expect(() => prepareDef(JSON.parse(JSON.stringify(def)))).not.toThrow();
    });
});

describe('validateDef', () => {
    test('a valid definition', () => {
        expect(validateDef(base())).toEqual([]);
    });

    test('curves of paths and areas', () => {
        const def = base();
        def.plot.curve = 'monotoneX';
        expect(validateDef(def)).toEqual([]);
        def.plot.curve = 'smooth';
        expect(validateDef(def)).toEqual([`plot[0].curve: unknown curve 'smooth', expected one of ${curveNames.map(c => `'${c}'`).join(', ')}`]);
        def.plot = { ...def.plot, type: 'svg:circle', curve: 'monotoneX' };
        expect(validateDef(def)).toEqual([`plot[0].curve: only used by 'svg:path', 'base:area', 'radial:path', 'radial:area'`]);
    });

    test('all plot types are implemented', () => {
        expect(Object.keys(plotTypes).filter(t => typeof plotTypes[t].render != 'function')).toEqual([]);
    });

    test('coordinate systems and the plot types of them', () => {
        const def = base();
        def.options = { coord: 'spherical' };
        expect(validateDef(def)).toEqual([`options.coord: unknown coordinate system 'spherical', expected one of 'cartesian', 'polar', 'geo'`]);

        registerCoord('test:coord', { ...coords.cartesian, ranges: { angle: [0, 6.28] }, positions: ['outer'] });
        def.options.coord = 'test:coord';
        def.mapping.x.scale.orientation = 'angle';
        def.mapping.x.axis.position = 'outer';
        def.mapping.y.axis.position = 'outer';
        delete def.mapping.y.scale.orientation;
        expect(validateDef(def)).toEqual([]);

        def.plot = { type: 'bar', props: {} };
        expect(validateDef(def)).toEqual([`plot[0].type: not available in the coordinate system 'test:coord'`]);
        delete coords['test:coord'];
    });

    test('registered plot types', () => {
        const def = base();
        def.plot.type = 'test:type';
        expect(validateDef(def)).toEqual([expect.stringMatching(/^plot\[0\]\.type: unknown type 'test:type'/)]);
        registerPlotType('test:type', { render() {} });
        expect(validateDef(def)).toEqual([]);
        delete plotTypes['test:type'];
    });

    test('unknown plot types and categories', () => {
        const def = base();
        def.plot = [{ ...def.plot, type: 'path', categories: ['land'] }];
        expect(validateDef(def)).toEqual([
            expect.stringMatching(/^plot\[0\]\.type: unknown type 'path'/),
            "plot[0].categories: unknown mapping 'land'",
        ]);
    });

    test('props which are not evaluated', () => {
        const def = base();
        def.mapping.x.axis.ticks = { mode: 'relative', base: 'innerWidth', ratio: 0.01 };
        def.plot.props.r = { prop: 'relative', ratio: 0.01 };
        def.plot.props.fill = { prop: 'color' };
        expect(validateDef(def)).toEqual([
            "mapping.x.axis.ticks: has 'ratio', 'mode' but no 'prop', so it is not evaluated",
            "plot[0].props.r: a 'relative' prop needs a 'ref'",
            "plot[0].props.fill: unknown prop 'color', expected one of 'fixed', 'ref', 'relative', 'steps'",
        ]);
    });

    test('scales which do not fit the type', () => {
        const def = base();
        def.mapping.c.scale = { type: 'linear' };
        def.mapping.x.scale.type = 'band';
        def.mapping.y.scale.type = 'unknown';
        expect(validateDef(def)).toEqual([
            "mapping.x.scale.type: a band scale does not fit the type 'numeric'",
            "mapping.y.scale.type: unknown d3 scale 'unknown'",
            "mapping.c.scale.type: a linear scale does not fit the type 'categorical'",
        ]);
    });

    test('mappings', () => {
        const def = base();
        delete def.mapping.x.column;
        def.mapping.x.type = 'number';
        def.mapping.y.axis.position = 'middle';
        def.mapping.c.props = { Wien: {} };
        expect(validateDef(def)).toEqual([
            "mapping.x: no 'column'",
            "mapping.x.type: unknown type 'number', expected one of 'numeric', 'date', 'categorical'",
            "mapping.x.scale.type: a linear scale does not fit the type 'number'",
            "mapping.y.axis.position: unknown position 'middle', expected one of 'top', 'bottom', 'left', 'right'",
            "mapping.c.props: expected 'manual' (and optional 'common') entries",
        ]);
    });

    test('maps, filters, form elements and scales of colors', () => {
        const def = base();
        def.options = { coord: 'geo' };
        def.geo = { join: 'region', projection: { type: 'flat' } };
        def.filter = { year: '@year' };
        def.formElements = [{ id: 'f', type: 'slider', values: [{ id: 'a' }] }];
        def.plot = { type: 'geo:path', props: {} };
        delete def.mapping.x.axis;
        delete def.mapping.y.axis;
        def.mapping.y.scale = { type: 'threshold', scheme: 'Unknown' };
        def.mapping.x.scale = { type: 'linear', interpolator: 'Blues' };
        expect(validateDef(def)).toEqual([
            "mapping.x.scale.interpolator: a linear scale has no interpolator, e.g. a sequential one has",
            "mapping.y.scale.scheme: unknown d3 scheme 'Unknown', e.g. 'Blues'",
            "mapping.y.scale.domain: a threshold scale needs the values between its classes",
            "geo.data: a map needs its geometry, GeoJSON or TopoJSON or their url",
            "geo.join: unknown mapping 'region'",
            "geo.projection.type: unknown d3 projection 'flat', e.g. 'mercator' or 'conicConformal'",
            "filter.year: unknown mapping 'year'",
            "formElements[0].type: unknown type 'slider', expected one of 'switch', 'select'",
            "formElements[0].ref: no global",
            "formElements[0].values: no value of 'a'",
        ]);
    });

    test('column templates need the globals', () => {
        const def = base();
        def.globals = { values: 'value' };
        def.mapping.y.column = '{values}{share}';
        def.formElements = [{ id: 'f', ref: 'values', type: 'switch', values: [
            { id: 'a', value: 'value', mapping: { y: { column: '{unit}' } } },
        ] }];
        expect(validateDef(def)).toEqual([
            "mapping.y.column: unknown global 'share' in the column template",
            "formElements[0].values[0].mapping.y.column: unknown global 'unit' in the column template",
        ]);
    });
});
