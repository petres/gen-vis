import { describe, test, expect, beforeAll } from 'vitest';
import { loadColors } from '@/utils/d3';
import { validateDef, curveNames } from '@/utils/validate';
import { prepareDef } from '@/utils/def';
import { plotTypes, registerPlotType } from '@/plots';
import { coords, registerCoord } from '@/coords';
import { resolveParents } from '@/store';
import { definitions } from '@/dev/definitions.js';
import { readFileSync } from 'node:fs';

// the colors of d3 are loaded by the store, see loadColors
beforeAll(loadColors);

const examples = Object.fromEntries(definitions(import.meta.glob('../data/**/*.json', { eager: true, import: 'default' }))
    .map(d => [`../data/${d.path}`, d.def]));

const base = () => ({
    mapping: {
        x: { column: 'year', type: 'numeric', scale: { orientation: 'horizontal' }, axis: { position: 'bottom' } },
        y: { column: 'value', type: 'numeric', scale: { orientation: 'vertical' }, axis: { position: 'left' } },
        c: { column: 'land', type: 'categorical', props: { categories: { Wien: {} } } },
    },
    plot: { type: 'cartesian:line', categories: ['c'], props: { d: { x: '@x:scaled', y: '@y:scaled' } } },
});

test('the facets need a known mapping', () => {
    expect(validateDef({ ...base(), facets: { dim: 'c' } })).toEqual([]);
    expect(validateDef({ ...base(), facets: { dim: 'z' } })).toEqual([`facets.dim: unknown mapping 'z'`]);
    expect(validateDef({ ...base(), facets: { dim: ['c'] } })).toEqual([`facets.dim: expected the name of a mapping`]);
});

test('the symbols of legends, the order and the ranks of categories', () => {
    const def = base();
    def.mapping.c.legend = { symbol: 'line', onlyData: true };
    def.mapping.c.props.ranks = [{ dash: '2 2' }];
    def.mapping.c.props.order = 'descending';
    def.plot.props.stroke = '@dash';
    expect(validateDef(def)).toEqual([]);
    def.mapping.c.legend = { symbol: { type: 'star', props: { fill: '@nope' } }, onlyData: 'yes' };
    def.mapping.c.props.order = 'down';
    def.mapping.c.props.ranks = { color: 'red' };
    expect(validateDef(def)).toEqual([
        "mapping.c.props.order: expected 'ascending', 'descending' or a list of keys",
        "mapping.c.props.ranks: expected a list of props, of the first category, the second one, ...",
        "mapping.c.legend.onlyData: only the entries of the categories of the rows, true or false, of a legend of props",
        expect.stringMatching(/^mapping.c.legend.symbol.props.fill: unknown reference 'nope'/),
        // the ranks are no list, so their props are unknown
        expect.stringMatching(/^plot\[0\].props.stroke: unknown reference 'dash'/),
        "mapping.c.legend.symbol.type: unknown type 'star', expected one of 'line', 'rect', 'circle'",
    ]);
});

test('the names of 1.x are unknown', () => {
    const def = base();
    def.mapping.c.props = { manual: { Wien: {} } };
    def.globals = { g: 'a' };
    def.formElements = [{ id: 'g', name: 'G', ref: 'g', type: 'switch', values: [{ id: 'a', name: 'A', value: 'a' }] }];
    expect(validateDef(def)).toEqual([
        "mapping.c.props: expected 'categories' or the ones of the data ('fromData'), and optional 'common' props",
        "formElements[0].type: unknown type 'switch', expected one of 'radio', 'select', 'slider', 'hidden'",
    ]);
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
        expect(Object.keys(plotTypes).filter(t => typeof plotTypes[t].marks != 'function')).toEqual([]);
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
        registerPlotType('test:type', { marks() {} });
        expect(validateDef(def)).toEqual([]);
        delete plotTypes['test:type'];
    });

    test('the ids of the plots are unique', () => {
        const def = base();
        def.plot = [{ ...def.plot, id: 'plot-1' }, { ...def.plot }, { ...def.plot, id: 'plot-1' }];
        expect(validateDef(def)).toEqual([
            "plot[1].id: the id 'plot-1' is the one of plot[0]",
            "plot[2].id: the id 'plot-1' is the one of plot[0]",
        ]);
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
            "mapping.x.axis.ticks: has 'ratio' but no 'prop', so it is not evaluated",
            "plot[0].props.r: a 'relative' prop needs a 'ref' or a prop 'of'",
            // the keys of a prop and its kinds are the ones of the schema
            "mapping.x.axis.ticks.mode: unknown key, expected one of 'prop', 'format', 'ref', 'of', 'ratio', 'offset', 'steps', 'cases', 'default', 'value'",
            "mapping.x.axis.ticks.base: unknown key, expected one of 'prop', 'format', 'ref', 'of', 'ratio', 'offset', 'steps', 'cases', 'default', 'value'",
            "plot[0].props.fill.prop: unknown prop 'color', expected one of 'fixed', 'ref', 'relative', 'steps', 'format', 'match'",
        ]);
    });

    test('match props and props of props', () => {
        const def = base();
        def.plot.props.r = { prop: 'match', ref: 'c', cases: { Wien: '@nope' }, default: '@x:scaled' };
        def.plot.props.cx = { prop: 'relative', of: '@unknown', offset: 2 };
        def.plot.props.cy = { prop: 'match', ref: 'c' };
        def.options = { margins: { left: { prop: 'steps', ref: 'innerWidth', steps: [] } } };
        expect(validateDef(def)).toEqual([
            "plot[0].props.r.cases.Wien: unknown reference 'nope'",
            "plot[0].props.cx.of: unknown reference 'unknown'",
            "plot[0].props.cy: a 'match' prop needs the props of the values, its 'cases', e.g. { \"header\": 4 }",
            "options.margins.left: unknown reference 'innerWidth', expected one of 'totalWidth'",
        ]);
    });

    test('scales which do not fit the type', () => {
        const def = base();
        def.mapping.c.scale = { type: 'linear' };
        def.mapping.x.scale.type = 'band';
        def.mapping.y.scale.type = 'unknown';
        expect(validateDef(def)).toEqual([
            "mapping.x.scale.type: a band scale does not fit the type 'numeric'",
            "mapping.y.scale.type: unknown scale 'unknown', e.g. 'linear', 'time' or 'band'",
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
            "mapping.x.scale.type: a linear scale does not fit the type 'number'",
            "mapping.y.axis.position: unknown position 'middle', expected one of 'top', 'bottom', 'left', 'right'",
            "mapping.c.props: expected 'categories' or the ones of the data ('fromData'), and optional 'common' props",
            // the warnings of the schema are the last ones
            "mapping.x.type: unknown type 'number', expected one of 'numeric', 'date', 'categorical'",
        ]);
    });

    test('entries which are no objects are warnings, not errors', () => {
        const def = base();
        def.mapping.n = 5;
        // null removes a mapping, e.g. of a parent
        def.mapping.removed = null;
        def.mapping.y.hover = true;
        def.mapping.x.scale.type = 'implicit';
        def.plot = [null, { ...def.plot, categories: 'c' }, { ...def.plot, categories: [1] }];
        def.annotations = [null];
        def.formElements = [null, { id: 'g', name: 'G', ref: 'g', type: 'radio', values: [null] }, { id: 'h', name: 'H', ref: 'h', type: 'radio' }];
        def.options = { locale: 5 };
        expect(validateDef(def)).toEqual([
            `mapping.n: expected a mapping, e.g. { "column": "value", "type": "numeric" }`,
            'mapping.y.hover: expected an object, e.g. {}',
            'formElements[0]: expected a form element',
            `plot[0]: expected a plot, e.g. { "type": "svg:circle", "props": {} }`,
            `annotations[0]: expected an annotation, e.g. { "type": "line", "y": 0 }`,
            "mapping.x.scale.type: unknown scale 'implicit', e.g. 'linear', 'time' or 'band'",
            'plot[2].categories: expected a mapping or a list of mappings, e.g. ["land"]',
            `formElements[1].values[0]: expected an entry, e.g. { "id": "a", "name": "A", "value": "a" }`,
            `formElements[2].values: expected a list of entries or the column of the values, e.g. { "column": "year" }`,
            "options.locale: expected 'de', 'en', a language of Intl, e.g. 'fr', or an object with a 'base' locale",
        ]);
    });

    test('unknown keys of form elements and of their entries, other fields of entries are names of templates', () => {
        const def = base();
        def.formElements = [{ id: 'g', name: 'G', ref: 'g', type: 'radio', default: 'a', values: [
            { id: 'a', name: 'A', value: 'a', mapping: { y: { column: 'share' } } },
            { id: 'b', name: 'B', value: 'b', label: 'B' },
        ] }];
        expect(validateDef(def)).toEqual([
            `formElements[0].values[0].mapping: unknown key, a part of the definition is part of the patch, e.g. { "patch": { "mapping": ... } }`,
            "formElements[0].default: unknown key, expected one of 'id', 'name', 'ref', 'type', 'inImage', 'values'",
        ]);
    });

    test('definitions which can not be drawn', () => {
        const def = base();
        def.mapping.d = { column: 'date', type: 'date', scale: { type: 'linear', orientation: 'horizontal' } };
        def.mapping.b = { column: 'land', type: 'categorical', scale: { type: 'band', orientation: 'vertical', domain: ['Wien', null] } };
        def.mapping.y.legend = {};
        def.facets = { dim: 'x' };
        expect(validateDef(def)).toEqual([
            "mapping.y.legend: a legend needs the props of the categories or a scale of colors, without an orientation",
            "mapping.d.scale.type: the positions of dates need a 'time' or a 'utc' scale",
            "mapping.b.scale.domain: the categories of a band scale are all the ones of the data (null) or a list of them",
            `facets.dim: the mapping 'x' needs the props of its categories, e.g. { "fromData": true }`,
        ]);
    });

    test('the globals of form elements of the values of a column are known in templates', () => {
        const def = base();
        def.options = { title: 'Jahr {year}' };
        def.mapping.y.column = '{year}';
        def.formElements = [{ id: 'year', name: 'Jahr', ref: 'year', type: 'slider', values: { column: 'year' } }];
        expect(validateDef(def)).toEqual([]);
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
            "mapping.y.scale.scheme: unknown scheme 'Unknown', e.g. 'Blues'",
            "mapping.y.scale.domain: a threshold scale needs the values between its classes",
            "geo.data: a map needs its geometry, GeoJSON or TopoJSON or their url",
            "geo.join: unknown mapping 'region'",
            expect.stringMatching(/^geo.projection.type: unknown projection 'flat', expected one of 'albers', .*'mercator'/),
            "filter.year: unknown mapping 'year'",
            "filter.year: unknown reference 'year', expected one of 'g', 'totalWidth'",
            "formElements[0].ref: no global",
            "formElements[0].values: no value of 'a'",
            "formElements[1].values: expected a list of entries or the column of the values, e.g. { \"column\": \"year\" }",
            "formElements[0].type: unknown type 'checkbox', expected one of 'radio', 'select', 'slider', 'hidden'",
        ]);
    });

    test('references to names which are known where they are used', () => {
        const def = base();
        def.globals = { g: 1 };
        def.mapping.c.props.categories.Wien = { color: 'red' };
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
            "plot[0].props.fill: unknown reference 'colour', did you mean 'color'?",
            "plot[0].props.y0: unknown reference 'y:start:scaled'",
            "filter.c: unknown reference 'h', expected one of 'g', 'totalWidth'",
            "annotations[0].props.stroke: unknown reference 'color', expected one of 'g', 'totalWidth', 'width', 'innerWidth', 'height', 'innerHeight', 'y'",
            "options.height: unknown reference 'innerWidth', expected one of 'g', 'totalWidth'",
        ]);

        // stacked values and the radius of polar plots
        def.mapping.y.stacked = true;
        def.options.coord = 'polar';
        delete def.mapping.x.axis;
        delete def.mapping.y.axis;
        expect(validateDef(def).filter(w => w.includes("reference 'y:start:scaled'") || w.includes("reference 'radius'"))).toEqual([]);
        // the radius is a name of the facets of polar plots, e.g. of the hole of a donut
        def.plot.props.innerRadius = { prop: 'relative', ref: 'radius', ratio: 0.5 };
        expect(validateDef(def).filter(w => w.includes('innerRadius'))).toEqual([]);
    });

    test('curved labels of an angular axis', () => {
        const def = base();
        def.options = { coord: 'polar' };
        def.mapping.x = { column: 'year', type: 'numeric', scale: { orientation: 'angular' }, axis: { position: 'angular', labels: { curved: 'between' } } };
        def.mapping.y = { column: 'value', type: 'numeric', scale: { orientation: 'radial' }, axis: { position: 'radial', labels: { curved: true } } };
        def.plot = { type: 'polar:line', categories: ['c'], props: { d: { angle: '@x:scaled', radius: '@y:scaled' } } };
        expect(validateDef(def)).toEqual(["mapping.y.axis.labels.curved: the labels along the circle of an angular axis, true or 'between'"]);
        def.mapping.y.axis.labels.curved = false;
        def.mapping.x.axis.labels.curved = 'around';
        expect(validateDef(def)).toEqual(["mapping.x.axis.labels.curved: the labels along the circle of an angular axis, true or 'between'"]);
    });

    test('the data, the selection and the layer of a plot', () => {
        const def = base();
        def.globals = { target: 3 };
        def.plot = [def.plot, {
            type: 'svg:text', data: [{ y: '@target', label: 'A' }], select: 'last', layer: 'below', halo: true,
            props: { x: '@x:scaled:max', y: '@y:scaled', text: '@label' },
        }];
        expect(validateDef(def)).toEqual([]);
        def.plot[1] = { ...def.plot[1], data: [{ y: '@unknown' }], select: { top: 'y' }, layer: 'front', props: { text: '@label' } };
        def.plot[0].halo = 2;
        def.plot[0].dodge = 12;
        expect(validateDef(def)).toEqual([
            "plot[0].dodge: the distance of the texts of a plot of 'svg:text' or 'polar:text', a number",
            "plot[0].halo: a halo behind the texts of a plot of 'svg:text' or 'polar:text', true or its width",
            "plot[1].data[0].y: unknown reference 'unknown', expected one of 'target', 'totalWidth', 'width', 'innerWidth', 'height', 'innerHeight'",
            `plot[1].select: expected 'first', 'last' or the min or max of a mapping, e.g. { "max": "x" }`,
            "plot[1].props.text: unknown reference 'label'",
            "plot[1].layer: unknown layer 'front', expected one of 'below', 'above'",
        ]);
        delete def.plot[0].halo;
        delete def.plot[0].dodge;
        // the names of the rows of a url are not known
        def.plot[1] = { type: 'svg:text', data: 'events.csv', select: { max: 'z' }, props: { text: '@label' } };
        expect(validateDef(def)).toEqual(["plot[1].select.max: unknown mapping 'z'"]);
        def.plot[1] = { type: 'annotation:band', data: 3 };
        def.annotations = [{ type: 'line', y: '@target' }, { type: 'line', y: '@nope' }];
        expect(validateDef(def)).toEqual([
            "plot[1].data: expected a list of rows or the url of the data",
            "annotations[1].y: unknown reference 'nope', expected one of 'target', 'totalWidth', 'width', 'innerWidth', 'height', 'innerHeight'",
        ]);
    });

    test('a built-in locale or a language of Intl', () => {
        const def = base();
        for (const locale of ['de', 'fr', 'de-CH', { base: 'it' }])
            expect(validateDef({ ...def, options: { locale } })).toEqual([]);
        expect(validateDef({ ...def, options: { locale: 'xx' } })).toEqual([
            "options.locale: unknown locale 'xx', expected one of 'de', 'en' or a language of Intl, e.g. 'fr'",
        ]);
    });

    test('annotations and the highlight of a plot', () => {
        const def = base();
        def.plot.highlight = 'element';
        def.annotations = [{ type: 'band', x: [0, 1], z: 2 }, { type: 'arrow' }, { type: 'text', c: 'Wien' }];
        expect(validateDef(def)).toEqual([
            "annotations[0].z: unknown mapping 'z'",
            "annotations[1].type: unknown type 'arrow', expected one of 'band', 'line', 'text', 'circle'",
            "annotations[2].c: the mapping has no scale",
            "plot[0].highlight: unknown highlight 'element', expected one of 'group', 'row'",
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
            "annotations[0].type: a band is not available in the coordinate system 'geo', expected one of 'text', 'circle'",
            "annotations[0]: an annotation of a map needs 'lon' and 'lat'",
            "mapping.x.scale.orientation: the coordinate system 'geo' has no orientations, e.g. a scale of colors has none",
        ].sort());
           // the object and the borders of geo:mesh
        def.annotations = [];
        def.plot = [
            { type: 'geo:mesh', object: 'states', borders: 'inner', props: {} },
            { type: 'geo:mesh', object: 1, borders: 'between', props: {} },
            { type: 'geo:region', object: 'states', borders: 'all', props: {} },
        ];
        expect(validateDef(def).filter(w => w.startsWith('plot'))).toEqual([
            "plot[1].object: the object of the TopoJSON of a plot of 'geo:mesh', a string",
            "plot[2].object: the object of the TopoJSON of a plot of 'geo:mesh', a string",
            "plot[2].borders: the borders of a plot of 'geo:mesh', one of 'all', 'inner', 'outer'",
            "plot[1].borders: unknown borders 'between', expected one of 'all', 'inner', 'outer'",
        ]);
    });

    test('column templates need the globals', () => {
        const def = base();
        def.globals = { values: 'value' };
        def.mapping.y.column = '{values}{share}';
        def.formElements = [{ id: 'f', ref: 'values', type: 'radio', values: [
            { id: 'a', value: 'value', patch: { mapping: { y: { column: '{unit}' } } } },
        ] }];
        expect(validateDef(def)).toEqual([
            "mapping.y.column: unknown global 'share' in the column template",
            "formElements[0].values[0] > mapping.y.column: unknown global 'unit' in the column template",
        ]);
    });

    test('templates of the texts need the globals, domains can have references', () => {
        const def = base();
        def.globals = { a: 1 };
        def.options = { footer: '{a} {b}' };
        def.mapping.y.name = '{c}';
        def.mapping.y.scale.domain = [0, '@a'];
        def.mapping.c.props.categories.Wien.name = '{a}{d}';
        def.annotations = [{ type: 'text', text: '{e}' }];
        expect(validateDef(def)).toEqual([
            "options.footer: unknown global 'b' in the text",
            "mapping.y.name: unknown global 'c' in the text",
            "mapping.c.props.categories.Wien.name: unknown global 'd' in the text",
            "annotations[0].text: unknown global 'e' in the text",
        ]);
        def.mapping.y.scale.domain = [0, '@z'];
        expect(validateDef(def)).toContainEqual(expect.stringMatching(/^mapping.y.scale.domain\[1\]: unknown reference 'z'/));
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

describe('validateDef and the schema', () => {
    test('unknown keys everywhere the schema has none, typos with the key they probably are', () => {
        const def = base();
        def.mapping.x.axis.positon = 'bottom';
        def.mapping.y.scale.domian = [0, null];
        def.options = { hover: { sid: 'left' }, titel: 'A' };
        def.plot.curv = 'linear';
        def.colour = 'red';
        // in the order of the keys of the definition
        expect(validateDef(def)).toEqual([
            "mapping.x.axis.positon: unknown key, did you mean 'position'?",
            "mapping.y.scale.domian: unknown key, did you mean 'domain'?",
            "plot[0].curv: unknown key, did you mean 'curve'?",
            "options.hover.sid: unknown key, did you mean 'side'?",
            "options.titel: unknown key, did you mean 'title'?",
            "colour: unknown key, expected one of '$schema', 'parent', 'data', 'dataFormat', 'geo', 'annotations', 'transform', 'filter', 'options', 'globals', 'mapping', 'plot', 'facets', 'formElements'",
        ]);
    });

    test('values of the enums of the schema, typos with the value they probably are', () => {
        const def = base();
        def.plot.curve = 'monotonX';
        def.options = { hover: { side: 'top', box: 'no', offset: [0] }, transition: -1 };
        def.transform = { type: 'calc', columns: ['a', 'b'], op: 'plus', as: 'c' };
        expect(validateDef(def)).toEqual([
            "plot[0].curve: unknown curve 'monotonX', did you mean 'monotoneX'?",
            "options.hover.side: unknown side 'top', expected one of 'left', 'right', 'above', 'below', 'center'",
            "options.hover.box: expected true or false",
            "options.hover.offset: expected 2 values",
            "options.transition: expected at least 0",
            "transform[0].op: unknown op 'plus', expected one of 'add', 'subtract', 'multiply', 'divide', 'min', 'max'",
        ]);
    });

    test('the offset of the hover can leave out a direction (null)', () => {
        expect(validateDef({ ...base(), options: { hover: { offset: [null, -10] } } })).toEqual([]);
    });

    test('false or null removes a part of a mapping, null the geometry, the filter or the options of a patch', () => {
        const def = base();
        def.mapping.c.hover = false;
        def.mapping.c.legend = null;
        def.filter = null;
        def.geo = null;
        def.globals = { g: 'a' };
        def.formElements = [{ id: 'g', ref: 'g', type: 'radio', values: [
            { id: 'a', value: 'a', patch: { options: null, filter: null } },
            { id: 'b', value: 'b', patch: { mapping: { c: { props: false } }, geo: null } },
        ] }];
        expect(validateDef(def)).toEqual([]);
    });

    test('other scalar fields of entries are names of templates, e.g. {g:short}', () => {
        const def = base();
        def.globals = { g: 'a' };
        def.options = { subtitle: 'Values of {g:short}' };
        def.formElements = [{ id: 'g', ref: 'g', type: 'radio', values: [
            { id: 'a', value: 'a', short: 'A', rank: 1, main: true, none: null },
            { id: 'b', value: 'b', short: { de: 'B' } },
        ] }];
        expect(validateDef(def)).toEqual([
            "formElements[0].values[1].short: expected a string or a number or true or false or null",
        ]);
    });

    test('the definitions of the patches of the entries, the warnings of their own after the entry', () => {
        const def = base();
        def.globals = { g: 'a' };
        def.mapping.y.scale.type = 'Linear';
        def.formElements = [{ id: 'g', ref: 'g', type: 'radio', values: [
            { id: 'a', value: 'a', patch: { mapping: { y: { type: 'date' } } } },
            { id: 'b', value: 'b', patch: { options: { coord: 'geo' }, plot: { type: 'geo:region', props: {} } } },
            { id: 'c', value: 'c', patch: { plot: { type: 'cartesian:bar', categories: ['z'] } } },
        ] }];
        expect(validateDef(def)).toEqual([
            "mapping.y.scale.type: use 'linear'",
            "formElements[0].values[0] > mapping.y.scale.type: the positions of dates need a 'time' or a 'utc' scale",
            "formElements[0].values[1] > mapping.x.scale.orientation: the coordinate system 'geo' has no orientations, e.g. a scale of colors has none",
            "formElements[0].values[1] > mapping.x.axis: the coordinate system 'geo' has no axes",
            "formElements[0].values[1] > mapping.y.scale.orientation: the coordinate system 'geo' has no orientations, e.g. a scale of colors has none",
            "formElements[0].values[1] > mapping.y.axis: the coordinate system 'geo' has no axes",
            "formElements[0].values[1] > geo.data: a map needs its geometry, GeoJSON or TopoJSON or their url",
            "formElements[0].values[2] > plot[0].categories: unknown mapping 'z'",
        ]);
        // a patch is checked by the schema as a part of the definition
        def.formElements[0].values[0].patch.mapping.y.scael = {};
        expect(validateDef(def)).toContain("formElements[0].values[0].patch.mapping.y.scael: unknown key, did you mean 'scale'?");
    });

    test('registered plot types and coordinate systems are valid in the schema, unknown ones are warnings', () => {
        const def = base();
        def.plot.type = 'my:plot';
        def.options = { coord: 'mine' };
        expect(validateDef(def)).toEqual([
            "options.coord: unknown coordinate system 'mine', expected one of 'cartesian', 'polar', 'geo'",
            expect.stringMatching(/^plot\[0\]\.type: unknown type 'my:plot', expected one of 'svg:circle', /),
        ]);
        def.plot.type = 'cartesian:lin';
        def.options.coord = 'polr';
        expect(validateDef(def)).toEqual([
            "options.coord: unknown coordinate system 'polr', did you mean 'polar'?",
            "plot[0].type: unknown type 'cartesian:lin', did you mean 'cartesian:line'?",
        ]);
    });

    test('the names of d3 in the case of the schema', () => {
        const def = base();
        def.mapping.x.scale.type = 'Linear';
        def.options = { coord: 'geo' };
        def.geo = { data: 'map.json', projection: { type: 'Mercator' } };
        def.plot = { type: 'geo:region', props: {} };
        def.mapping.x = { column: 'year', type: 'numeric', scale: { type: 'Linear', interpolator: 'Blues' } };
        delete def.mapping.y.scale.orientation;
        delete def.mapping.y.axis;
        expect(validateDef(def)).toEqual([
            "mapping.x.scale.type: use 'linear'",
            "mapping.x.scale.interpolator: a linear scale has no interpolator, e.g. a sequential one has",
            "geo.projection.type: use 'mercator'",
        ]);
    });

    test('nice rounds the domains of numeric mappings, the messages of mappings without a type', () => {
        const def = base();
        def.mapping.d = { column: 'date', type: 'date', scale: { type: 'time', nice: true } };
        def.mapping.c.scale = { type: 'linear', nice: 5 };
        expect(validateDef(def)).toEqual([
            "mapping.c.scale.type: a linear scale does not fit the type 'categorical'",
            "mapping.c.scale.nice: only the domains of numeric mappings are rounded, not the ones of the type 'categorical'",
            "mapping.d.scale.nice: only the domains of numeric mappings are rounded, not the ones of the type 'date'",
        ]);
        delete def.mapping.d;
        delete def.mapping.c.type;
        expect(validateDef(def)).toEqual([
            "mapping.c.scale.type: a linear scale does not fit a mapping without a type (categorical)",
            "mapping.c.scale.nice: only the domains of numeric mappings are rounded, not the ones of a mapping without a type (categorical)",
        ]);
    });

    test('years of a date mapping are milliseconds, if the rows are given', () => {
        const def = base();
        def.mapping.x = { column: 'year', type: 'date', scale: { type: 'time', orientation: 'horizontal' }, axis: { position: 'bottom' } };
        expect(validateDef(def)).toEqual([]);
        expect(validateDef(def, [{ year: '2020' }, { year: Date.UTC(2021, 0, 1) }])).toEqual([]);
        expect(validateDef(def, [{ year: 2020 }])).toEqual([
            `mapping.x.type: the values of 'year' are numbers, e.g. 2020, which are milliseconds since 1970 as dates, years are numeric or strings, e.g. "2020"`,
        ]);
    });

    test('a map has no axes', () => {
        const def = base();
        def.options = { coord: 'geo' };
        def.geo = { data: 'map.json' };
        def.plot = { type: 'geo:region', props: {} };
        delete def.mapping.x.scale.orientation;
        delete def.mapping.y.scale.orientation;
        expect(validateDef(def)).toEqual([
            "mapping.x.axis: the coordinate system 'geo' has no axes",
            "mapping.y.axis: the coordinate system 'geo' has no axes",
        ]);
    });
});
