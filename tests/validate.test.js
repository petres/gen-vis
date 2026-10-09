import { describe, test, expect } from 'vitest';
import { validateDef, curveNames } from '@/utils/validate';
import { prepareDef } from '@/utils/def';
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
    plot: { type: 'cartesian:line', categories: ['c'], props: { d: { x: '@x:scaled', y: '@y:scaled' } } },
});

test('the facets need a known mapping', () => {
    expect(validateDef({ ...base(), facets: { dim: 'c' } })).toEqual([]);
    expect(validateDef({ ...base(), facets: { dim: 'z' } })).toEqual([`facets.dim: unknown mapping 'z'`]);
    expect(validateDef({ ...base(), facets: { dim: ['c'] } })).toEqual([`facets.dim: expected the name of a mapping`]);
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
        expect(validateDef(def)).toEqual([`plot[0].curve: only used by 'cartesian:line', 'cartesian:area', 'polar:line', 'polar:area'`]);
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
        // the svg elements are of all coordinate systems
        def.plot = { type: 'svg:circle', props: {} };
        expect(validateDef(def)).toEqual([]);

        def.plot = { type: 'cartesian:bar', props: {} };
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
        def.formElements = [{ id: 'f', type: 'checkbox', values: [{ id: 'a' }] }, { id: 'g', ref: 'g', type: 'slider', values: { name: 'year' } }];
        def.plot = { type: 'geo:region', props: {} };
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
            "filter.year: unknown reference 'year', expected one of 'g', 'totalWidth'",
            "formElements[0].type: unknown type 'checkbox', expected one of 'switch', 'select', 'slider'",
            "formElements[0].ref: no global",
            "formElements[0].values: no value of 'a'",
            "formElements[1].values: expected a list of entries or the column of the values, e.g. { \"column\": \"year\" }",
        ]);
    });

    test('references to names which are known where they are used', () => {
        const def = base();
        def.globals = { g: 1 };
        def.mapping.c.props.manual.Wien = { color: 'red' };
        def.mapping.c.legend = { props: { title: '@color' }, symbol: { elements: [{ type: 'circle', props: { fill: '@color', r: '@g' } }] } };
        def.mapping.x.scale.range = [0, '@width'];
        def.mapping.y.axis.ticks = { prop: 'relative', ref: 'innerWidth', ratio: 0.01 };
        def.plot.props = { ...def.plot.props, stroke: '@color', title: '@name', 'data-g': '@g', 'data-w': '@totalWidth', 'data-i': '@innerWidth', 'data-0': '@y:scaled:0' };
        def.options = { height: { prop: 'steps', ref: 'totalWidth', steps: [{ cut: 0, value: 300 }] } };
        def.filter = { c: '@g' };
        def.annotations = [{ type: 'line', y: 1, props: { stroke: '@g', 'stroke-width': { prop: 'relative', ref: 'innerWidth', ratio: 0.01 } } }];
        expect(validateDef(def)).toEqual([]);

        def.mapping.c.legend.props.title = '@innerWidth';
        def.mapping.x.scale.range = [0, '@radius'];
        def.plot.props = { ...def.plot.props, fill: '@colour', y0: '@y:start:scaled' };
        def.options.height.ref = 'innerWidth';
        def.filter.c = '@h';
        def.annotations[0].props.stroke = '@color';
        expect(validateDef(def)).toEqual([
            "mapping.x.scale.range[1]: unknown reference 'radius', expected one of 'g', 'totalWidth', 'width', 'innerWidth', 'height', 'innerHeight'",
            "mapping.c.legend.props.title: unknown reference 'innerWidth', expected one of 'g', 'totalWidth', 'name', 'visible', 'color'",
            "plot[0].props.fill: unknown reference 'colour'",
            "plot[0].props.y0: unknown reference 'y:start:scaled'",
            "filter.c: unknown reference 'h', expected one of 'g', 'totalWidth'",
            "annotations[0].props.stroke: unknown reference 'color', expected one of 'g', 'totalWidth', 'width', 'innerWidth', 'height', 'innerHeight'",
            "options.height: unknown reference 'innerWidth', expected one of 'g', 'totalWidth'",
        ]);

        // stacked values and the radius of polar plots
        def.mapping.y.stacked = true;
        def.options.coord = 'polar';
        delete def.mapping.x.axis;
        delete def.mapping.y.axis;
        expect(validateDef(def).filter(w => w.includes("'y:start:scaled'") || w.includes("'radius'"))).toEqual([]);
    });

    test('annotations and the highlight of a plot', () => {
        const def = base();
        def.plot.highlight = 'element';
        def.annotations = [{ type: 'band', x: [0, 1], z: 2 }, { type: 'arrow' }, { type: 'text', c: 'Wien' }];
        expect(validateDef(def)).toEqual([
            "plot[0].highlight: unknown highlight 'element', expected one of 'group', 'row'",
            "annotations[0].z: unknown mapping 'z'",
            "annotations[1].type: unknown type 'arrow', expected one of 'band', 'line', 'text', 'circle'",
            "annotations[2].c: the mapping has no scale",
        ]);
        def.plot.highlight = 'row';
        def.options = { coord: 'geo' };
        def.geo = { data: 'regions.json' };
        def.plot = { type: 'geo:region', props: {} };
        delete def.mapping.x.axis;
        delete def.mapping.y.axis;
        delete def.mapping.y.scale.orientation;
        def.annotations = [{ type: 'band' }, { type: 'text', lon: 16.4, lat: 48.2 }];
        expect(validateDef(def).sort()).toEqual([
            "annotations[0].type: unknown type 'band', expected one of 'text', 'circle'",
            "annotations[0]: an annotation of a map needs 'lon' and 'lat'",
            "mapping.x.scale.orientation: the coordinate system 'geo' has no orientations, e.g. a scale of colors has none",
        ].sort());
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

    test('templates of the title and the subtitle need the globals', () => {
        const def = base();
        def.globals = { base: '2019' };
        def.options = { title: 'Index {base}', subtitle: '{base} = 100, {unit}' };
        expect(validateDef(def)).toEqual([
            "options.subtitle: unknown global 'unit' in the text",
        ]);
    });
});
