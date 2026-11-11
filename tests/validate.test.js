import { describe, test, expect, beforeAll } from 'vitest';
import { loadColors, registerScheme } from '@/utils/d3';
import { validateDef, curveNames } from '@/utils/validate';
import { prepareDef } from '@/utils/def';
import { normalize } from '@/utils/normalize';
import { rowFilter, parseData, dataFormat } from '@/utils/data';
import { loadTransforms } from '@/utils/transform';
import { markTypes, registerMarkType } from '@/marks';
import { coords, registerCoord } from '@/coords';
import { resolveParents } from '@/utils/load';
import { translate } from '@/utils/language';
import { resolve, namesOfGlobals } from '@/utils/resolve';
import { definitions } from '@/dev/definitions.js';
import { readFileSync, existsSync } from 'node:fs';

// the colors of d3 are loaded by the store, see loadColors
beforeAll(loadColors);

const examples = Object.fromEntries(definitions(import.meta.glob('../data/**/*.json', { eager: true, import: 'default' }))
    .map(d => [`../data/${d.path}`, d.def]));

const base = () => ({
    dims: {
        // the positions have a scale of the orientation of their name and an axis
        x: { column: 'year', type: 'numeric' },
        y: { column: 'value', type: 'numeric' },
        c: { column: 'land', type: 'categorical', categories: { Wien: {} } },
    },
    // a full name has no default attributes
    marks: { type: 'cartesian:line', by: ['c'], d: { x: '@x:scaled', y: '@y:scaled' } },
});

test('the facets need a known dim', () => {
    expect(validateDef({ ...base(), facets: { by: 'c' } })).toEqual([]);
    expect(validateDef({ ...base(), facets: { by: 'z' } })).toEqual([`facets.by: unknown dim 'z', expected one of 'x', 'y', 'c'`]);
    expect(validateDef({ ...base(), facets: { by: ['c'] } })).toEqual([`facets.by: expected the name of a dim`]);
});

test('the conditions of a filter: values, not, range and expressions, not other objects', () => {
    const def = { ...base(), globals: { lo: 2020 } };
    def.filter = { x: { var: 'lo' }, y: { max: ['@lo', 1] }, c: { not: { range: ['@lo', null] } } };
    expect(validateDef(def)).toEqual([]);
    // the renderer reads them, see rowFilter
    const tests = rowFilter(def.filter, translate(def).dims, def.globals);
    expect(tests.map(t => t.key(2020))).toEqual([true, true, false]);
    def.filter = { x: { prop: 'lo' }, y: { var: 'hi' }, c: { a: 1, b: 2 } };
    expect(validateDef(def)).toEqual([
        `filter.x: expected a value, a list of values, null, { "not": ... }, { "range": [from, to] } or an expression`,
        "filter.y.var: unknown reference 'hi', expected one of 'lo', 'totalWidth'",
        `filter.c: expected a value, a list of values, null, { "not": ... }, { "range": [from, to] } or an expression`,
    ]);
    // an expression of the rows and the globals
    expect(validateDef({ ...base(), globals: { lo: 2020 }, filter: '@x >= @globals.lo and @c != "Wien"' })).toEqual([]);
    // a plain name may be a column of the data, of the rows given the columns are known
    expect(validateDef({ ...base(), filter: '@x >= @lo' })).toEqual([]);
    expect(validateDef({ ...base(), filter: '@x >= @lo and @kind != 1' }, [{ year: 2020, value: 1, land: 'Wien', kind: 'a' }]))
        .toEqual([expect.stringMatching(/^filter\.and\[0\]\.>=\[1\]: unknown reference 'lo'/)]);
});

test('the symbols of legends, the order and the ranks of categories', () => {
    const def = base();
    def.dims.c.legend = { symbol: 'line', onlyData: true };
    def.dims.c.ranks = [{ dash: '2 2' }];
    def.dims.c.order = 'descending';
    def.marks.stroke = '@dash';
    expect(validateDef(def)).toEqual([]);
    def.dims.c.legend = { symbol: { type: 'star', props: { fill: '@nope' } }, onlyData: 'yes' };
    def.dims.c.order = 'down';
    def.dims.c.ranks = { color: 'red' };
    expect(validateDef(def)).toEqual([
        "dims.c.order: expected 'ascending', 'descending', 'rows' or a list of keys",
        "dims.c.ranks: expected a list of props, of the first category, the second one, ..., or the name of a list of the defaults (ranks)",
        "dims.c.legend.onlyData: only the entries of the categories of the rows, true or false, of a legend of categories",
        expect.stringMatching(/^dims.c.legend.symbol.props.fill: unknown reference 'nope'/),
        // the ranks are no list, so their props are unknown
        expect.stringMatching(/^marks\[0\].stroke: unknown reference 'dash'/),
        "dims.c.legend.symbol.type: unknown type 'star', expected one of 'line', 'rect', 'circle', 'auto'",
    ]);
});

test('the name of a list of ranks of the defaults: its props are not known, plain names are none of the warnings', () => {
    const def = base();
    def.dims.c.ranks = 'lines';
    def.marks.stroke = '@dash';
    def.marks['stroke-width'] = '@c:nope';
    expect(validateDef(def)).toEqual([expect.stringMatching(/^marks\[0\]\.stroke-width: unknown reference 'c:nope'/)]);
    def.dims.c.ranks = '';
    expect(validateDef(def)[0]).toMatch(/^dims.c.ranks: expected a list of props/);
});

test('the names of 1.x and 4.x are unknown', () => {
    const def = base();
    delete def.dims.c.categories;
    def.dims.c.manual = { Wien: {} };
    def.globals = { g: 'a' };
    def.controls = [{ id: 'g', name: 'G', global: 'g', type: 'switch', values: [{ id: 'a', name: 'A', value: 'a' }] }];
    expect(validateDef(def)).toEqual([
        // the warnings of the schema are in the order of the keys of the definition
        expect.stringMatching(/^dims\.c\.manual: unknown key/),
        "controls[0].type: unknown type 'switch', expected one of 'radio', 'select', 'slider', 'hidden'",
    ]);
    // a top-level key of 4.x: the definition is not read, see 'a definition of the keys of gen-vis 4' below
    expect(validateDef({ ...base(), options: { title: 'A' } })).toEqual([expect.stringMatching(/^the definition is a definition of gen-vis 4 \(its "options"\): /)]);
});

describe('the example definitions', () => {
    test('are found', () => {
        expect(Object.keys(examples).length).toBeGreaterThan(10);
    });

    // merged with their parents, as by a check before a deploy, resolved
    // with their globals, translated (the form the engine reads), normalized
    // and prepared, as by the load
    test.each(Object.entries(examples))('%s is valid', async (file, org) => {
        const url = new URL(file, import.meta.url).href;
        const source = await resolveParents(JSON.parse(JSON.stringify(org)), url, u => readFileSync(new URL(u), 'utf8'));
        expect(validateDef(source)).toEqual([]);
        // with the rows of its data, as gen-vis check does
        if (typeof source.data == 'string' && !source.data.includes('{')) {
            const data = new URL(source.data, url);
            const format = dataFormat(data.href, source.dataFormat);
            if (existsSync(data)) {
                await loadTransforms();
                const rows = await parseData(format == 'parquet' ? readFileSync(data) : readFileSync(data, 'utf8'), format);
                expect(validateDef(source, rows)).toEqual([]);
            }
        }
        const def = translate(resolve(source, namesOfGlobals(source.globals, source.controls)));
        expect(() => prepareDef(normalize(def, { markTypes }))).not.toThrow();
    });
});

describe('validateDef', () => {
    test('a valid definition', () => {
        expect(validateDef(base())).toEqual([]);
    });

    test('a $schema of gen-vis 5, an object may have none; one of another version is the one message', () => {
        expect(validateDef({ ...base(), $schema: 'https://unpkg.com/@preschen/gen-vis@5/schema.json' })).toEqual([]);
        const hint = 'e.g. "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json", see the changelog of gen-vis 5.0.0 of the changes of the definitions';
        expect(validateDef({ ...base(), $schema: 'https://unpkg.com/@preschen/gen-vis@3/schema.json' }))
            .toEqual([`$schema: no definition of gen-vis 5, its $schema is the one of gen-vis 3, ${hint}`]);
        // not checked further, as it is not loaded
        expect(validateDef({ ...base(), marks: { type: 'nope' }, $schema: 'https://cdn.jsdelivr.net/npm/@preschen/gen-vis@4.2.1/schema.json' }))
            .toEqual([`$schema: no definition of gen-vis 5, its $schema is the one of gen-vis 4, ${hint}`]);
        expect(validateDef({ ...base(), $schema: 'http://json-schema.org/draft-07/schema#' }))
            .toEqual([`$schema: no definition of gen-vis 5, its $schema "http://json-schema.org/draft-07/schema#" is none of gen-vis, ${hint}`]);
    });

    test('a definition of the keys of gen-vis 4 is not read, as by the load: the one message, no warnings of its keys', () => {
        const reads = 'gen-vis 5 reads "dims", "marks", "controls" and the options at the top level, see "Upgrading from 4.x" of the changelog of gen-vis 5.0.0';
        const def = {
            mapping: { x: { column: 'year', type: 'numeric' }, y: { column: 'value', type: 'numeric', nice: 5 } },
            plot: { type: 'cartesian:line', by: ['z'], props: { d: { x: '@x:scaled', y: '@y:scaled' } } },
        };
        expect(validateDef(def)).toEqual([`the definition is a definition of gen-vis 4 (its "mapping", "plot"): ${reads}`]);
        // also with the $schema of 5 and beside the keys of 5
        expect(validateDef({ ...base(), $schema: 'https://unpkg.com/@preschen/gen-vis@5/schema.json', options: { title: 'T' }, formElements: [] }))
            .toEqual([`the definition is a definition of gen-vis 4 (its "formElements", "options"): ${reads}`]);
    });

    test('the keys of 3.x are unknown: categories of a mark, props of a dim, a text of the highlight', () => {
        const def = base();
        def.dims.c = { column: 'land', props: { categories: { Wien: {} } } };
        def.marks = { type: 'cartesian:line', categories: ['c'], highlight: 'row', d: { ...def.marks.d } };
        expect(validateDef(def)).toEqual([
            expect.stringMatching(/^dims\.c\.props: unknown key/),
            // a list is no attribute of a mark
            expect.stringMatching(/^marks\[0\]\.categories: expected /),
            'marks[0].highlight: expected an object',
        ]);
    });

    test('the attributes of the highlight and of the others are checked at their paths', () => {
        const def = base();
        def.marks = { ...def.marks, by: 'c', highlight: { mode: 'row', 'stroke-width': '@nope' }, others: { opacity: '@colour' } };
        expect(validateDef(def)).toEqual([
            expect.stringMatching(/^marks\[0\]\.highlight\.stroke-width: unknown reference 'nope'/),
            expect.stringMatching(/^marks\[0\]\.others\.opacity: unknown reference 'colour'/),
        ]);
    });

    test('curves of paths and areas', () => {
        const def = base();
        def.marks.curve = 'monotoneX';
        expect(validateDef(def)).toEqual([]);
        def.marks.curve = 'smooth';
        expect(validateDef(def)).toEqual([`marks[0].curve: unknown curve 'smooth', expected one of ${curveNames.map(c => `'${c}'`).join(', ')}`]);
        def.marks = { ...def.marks, type: 'svg:circle', curve: 'monotoneX' };
        expect(validateDef(def)).toEqual([`marks[0].curve: only used by 'cartesian:line', 'cartesian:area', 'polar:line', 'polar:area'`]);
    });

    test('all mark types are implemented', () => {
        expect(Object.keys(markTypes).filter(t => typeof markTypes[t].marks != 'function')).toEqual([]);
    });

    test('coordinate systems and the mark types of them', () => {
        const def = base();
        def.coord = 'spherical';
        expect(validateDef(def)).toEqual([
            `coord: unknown coordinate system 'spherical', expected one of 'cartesian', 'polar', 'geo'`,
            // an unknown coordinate system has no positions, so x and y have no scales
            "marks[0].d.x: unknown reference 'x:scaled'",
            "marks[0].d.y: unknown reference 'y:scaled'",
        ]);

        registerCoord('test:coord', { ...coords.cartesian, ranges: { angle: [0, 6.28] }, positions: ['outer'] });
        def.coord = 'test:coord';
        // the coordinate system has no positions of the names of the dims
        def.dims.x.scale = { orientation: 'angle' };
        def.dims.x.axis = { position: 'outer' };
        def.dims.y.scale = {};
        def.dims.y.axis = { position: 'outer' };
        // the svg elements are of all coordinate systems
        def.marks = { type: 'svg:circle' };
        expect(validateDef(def)).toEqual([]);

        def.marks = { type: 'cartesian:bar' };
        expect(validateDef(def)).toEqual([`marks[0].type: not available in the coordinate system 'test:coord'`]);
        delete coords['test:coord'];
    });

    test('registered schemes', () => {
        const def = base();
        def.dims.c.scheme = 'testHouse';
        def.dims.y.scale = { type: 'quantize', scheme: 'TestHouse' };
        expect(validateDef(def)).toEqual([
            "dims.y.scale.scheme: unknown scheme 'TestHouse', e.g. 'Blues'",
            "dims.c.scheme: unknown scheme 'testHouse', e.g. 'Tableau10'",
        ]);
        registerScheme('testHouse', ['#000', '#FFF']);
        expect(validateDef(def)).toEqual([]);
    });

    test('registered mark types', () => {
        const def = base();
        def.marks.type = 'test:type';
        expect(validateDef(def)).toEqual([expect.stringMatching(/^marks\[0\]\.type: unknown type 'test:type'/)]);
        registerMarkType('test:type', { marks() {} });
        expect(validateDef(def)).toEqual([]);
        delete markTypes['test:type'];
    });

    test('the ids of the marks are unique', () => {
        const def = base();
        def.marks = [{ ...def.marks, id: 'mark-1' }, { ...def.marks }, { ...def.marks, id: 'mark-1' }];
        expect(validateDef(def)).toEqual([
            "marks[1].id: the id 'mark-1' is the one of marks[0]",
            "marks[2].id: the id 'mark-1' is the one of marks[0]",
        ]);
    });

    test('unknown mark types and categories', () => {
        const def = base();
        def.marks = [{ ...def.marks, type: 'path', by: ['land'] }];
        expect(validateDef(def)).toEqual([
            expect.stringMatching(/^marks\[0\]\.type: unknown type 'path'/),
            "marks[0].by: unknown dim 'land', expected one of 'x', 'y', 'c'",
        ]);
    });

    test('operators which are not evaluated as they are meant', () => {
        const def = base();
        def.dims.x.axis = { ticks: { steps: ['@innerWidth'] } };
        def.marks.r = { format: ['@y'] };
        def.marks.fill = { fromat: ['@y', ',.1f'] };
        def.marks.opacity = { steps: ['@innerWidth', { small: 0.5, 500: 1 }] };
        def.marks.title = { if: ['@y'] };
        def.marks['data-v'] = { var: 1 };
        expect(validateDef(def)).toEqual([
            `dims.x.axis.ticks.steps: expected a value and its steps, e.g. ["@totalWidth", { "0": 220, "550": 250 }]`,
            `marks[0].r.format: expected a value and a d3 format, e.g. ["@y", ",.1f"]`,
            // an object of one key close to an operator is a nested prop
            "marks[0].fill.fromat: a nested prop, not an operator, did you mean 'format'?",
            "marks[0].opacity.steps[1].small: the cut of a step is a number",
            `marks[0].title.if: expected a condition, its value and the value otherwise, e.g. [{ ">": ["@y", 0] }, "green", "red"]`,
            `marks[0].data-v.var: expected a name or a name and its default, e.g. ["year", 2024]`,
        ]);
    });

    test('match props and props of props, also in the string syntax', () => {
        const def = base();
        def.marks.r = { match: ['@c', { Wien: '@nope' }, '@x:scaled'] };
        def.marks.cx = '=(@unknown * 2) + 2';
        def.marks.cy = { match: ['@c'] };
        def.margins = { left: { steps: ['@innerWidth', {}] } };
        expect(validateDef(def)).toEqual([
            "marks[0].r.match[1].Wien: unknown reference 'nope'",
            "marks[0].cx.+[0].*[0]: unknown reference 'unknown'",
            `marks[0].cy.match: expected a value, its cases and a default, e.g. ["@level", { "header": 4.5 }, 0]`,
            "margins.left.steps[0]: unknown reference 'innerWidth', expected one of 'totalWidth'",
        ]);
    });

    test('scales which do not fit the type', () => {
        const def = base();
        def.dims.c.scale = { type: 'linear' };
        def.dims.x.scale = { type: 'band' };
        def.dims.y.scale = { type: 'unknown' };
        expect(validateDef(def)).toEqual([
            "dims.x.scale.type: a band scale does not fit the type 'numeric'",
            "dims.y.scale.type: unknown scale 'unknown', e.g. 'linear', 'time' or 'band'",
            "dims.c.scale.type: a linear scale does not fit the type 'categorical'",
        ]);
    });

    test('dims', () => {
        const def = base();
        delete def.dims.x.column;
        def.dims.x.type = 'number';
        def.dims.y.axis = { position: 'middle' };
        expect(validateDef(def)).toEqual([
            "dims.x: no 'column'",
            "dims.x.scale.type: a linear scale does not fit the type 'number'",
            "dims.y.axis.position: unknown position 'middle', expected one of 'top', 'bottom', 'left', 'right'",
            // the warnings of the schema are the last ones
            "dims.x.type: unknown type 'number', expected one of 'numeric', 'date', 'categorical'",
        ]);
        // the categories of a dim without listed ones are the ones of the data
        def.dims.c = { column: 'land', type: 'categorical', common: { width: 1 } };
        expect(validateDef(def).filter(w => w.startsWith('dims.c'))).toEqual([]);
        def.dims.c.fromData = false;
        expect(validateDef(def).filter(w => w.startsWith('dims.c'))).toEqual([
            "dims.c: the categories need 'categories' or the ones of the data ('fromData'), 'common' are the props of all of them",
        ]);
    });

    test('parts which are none the engine reads are the one warning, others are warnings, not errors', () => {
        expect(validateDef({ ...base(), dims: { ...base().dims, n: 5 } })).toEqual([`dims.n: expected a dim, e.g. "value" or { "column": "value", "format": ".1f" }`]);
        expect(validateDef({ ...base(), marks: [null] })).toEqual([`marks[0]: expected a mark, e.g. { "type": "line", "by": "land" }`]);
        expect(validateDef({ ...base(), controls: [null] })).toEqual([`controls[0]: expected a control, e.g. { "type": "select", "global": "year", "values": [...] }`]);
        const def = base();
        // null removes a dim, e.g. of a parent
        def.dims.removed = null;
        def.dims.y.hover = true;
        def.dims.x.scale = { type: 'implicit' };
        def.marks = [{ ...def.marks, by: 'c' }, { ...def.marks, by: [1] }];
        def.annotations = [null];
        def.controls = [{ id: 'g', name: 'G', global: 'g', type: 'radio', values: [{ id: 'a', name: 'A' }] }, { id: 'h', name: 'H', global: 'h', type: 'radio' }];
        def.locale = 5;
        expect(validateDef(def)).toEqual([
            'dims.y.hover: expected an object, e.g. {}',
            `annotations[0]: expected an annotation, e.g. { "type": "line", "y": 0 }`,
            "dims.x.scale.type: unknown scale 'implicit', e.g. 'linear', 'time' or 'band'",
            'marks[1].by: expected a dim or a list of dims, e.g. ["land"]',
            "controls[0].values: no value of 'a'",
            `controls[1].values: expected a list of entries or the column of the values, e.g. { "column": "year" }`,
            "locale: expected 'de', 'en', a language of Intl, e.g. 'fr', or an object with a 'base' locale",
        ]);
    });

    test('unknown keys of controls and of their entries, other fields of entries are names of templates', () => {
        const def = base();
        def.controls = [{ type: 'radio', global: 'g', name: 'G', default: 'a', values: [
            { value: 'a', name: 'A', dims: { y: { column: 'share' } } },
            { value: 'b', name: 'B', label: 'B' },
        ] }];
        expect(validateDef(def)).toEqual([
            "controls[0].default: unknown key, expected one of 'type', 'global', 'name', 'id', 'inImage', 'values'",
            "controls[0].values[0].dims: expected a string or a number or true or false or null",
        ]);
    });

    test('definitions which can not be drawn', () => {
        const def = base();
        def.dims.d = { column: 'date', type: 'date', scale: { type: 'linear', orientation: 'horizontal' } };
        def.dims.b = { column: 'land', type: 'categorical', scale: { type: 'band', orientation: 'vertical' }, domain: ['Wien', null] };
        def.dims.y.legend = {};
        expect(validateDef(def)).toEqual([
            "dims.y.legend: a legend needs the props of the categories or a scale of colors, without an orientation",
            "dims.d.scale.type: the positions of dates need a 'time' or a 'utc' scale",
            "dims.b.domain: the categories of a band scale are all the ones of the data (null) or a list of them",
        ]);
    });

    test('the globals of controls of the values of a column are known in templates', () => {
        const def = base();
        def.title = 'Jahr {year}';
        def.dims.y.column = '{year}';
        def.controls = [{ global: 'year', name: 'Jahr', type: 'slider', values: { column: 'year' } }];
        expect(validateDef(def)).toEqual([]);
    });

    test('maps, filters, controls and scales of colors', () => {
        const def = base();
        def.coord = 'geo';
        def.geo = { join: 'region', projection: { type: 'flat' } };
        def.filter = { year: '@year' };
        def.controls = [{ id: 'f', type: 'checkbox', values: [{ id: 'a' }] }, { id: 'g', global: 'g', type: 'slider', values: { name: 'year' } }];
        // a map has no positions, so no scales and axes of x and y
        def.marks = { type: 'geo:region' };
        def.dims.y.scale = { type: 'threshold', scheme: 'Unknown' };
        def.dims.x.scale = { type: 'linear', interpolator: 'Blues' };
        expect(validateDef(def)).toEqual([
            "dims.x.scale.interpolator: a linear scale has no interpolator, e.g. a sequential one has",
            "dims.y.scale.scheme: unknown scheme 'Unknown', e.g. 'Blues'",
            "dims.y.scale.domain: a threshold scale needs the values between its classes",
            "geo.data: a map needs its geometry, GeoJSON or TopoJSON or their url",
            "geo.join: unknown dim 'region'",
            expect.stringMatching(/^geo.projection.type: unknown projection 'flat', expected one of 'albers', .*'mercator'/),
            "filter.year: unknown dim 'year'",
            "filter.year: unknown reference 'year', expected one of 'g', 'totalWidth'",
            "controls[0].global: no global",
            "controls[0].values: no value of 'a'",
            "controls[1].values: expected a list of entries or the column of the values, e.g. { \"column\": \"year\" }",
            "controls[0].type: unknown type 'checkbox', expected one of 'radio', 'select', 'slider', 'hidden'",
        ]);
    });

    test('references to names which are known where they are used', () => {
        const def = base();
        def.globals = { g: 1 };
        def.dims.c.categories.Wien = { color: 'red' };
        def.dims.c.legend = { props: { title: '@color' }, symbol: { elements: [{ type: 'circle', props: { fill: '@color', r: '@g' } }] } };
        def.dims.x.scale = { range: [0, '@width'] };
        def.dims.y.axis = { ticks: '=@innerWidth * 0.01' };
        def.marks = { ...def.marks, stroke: '@color', title: '@name', 'data-g': '@g', 'data-w': '@totalWidth', 'data-i': '@innerWidth', 'data-0': '@y:scaled:0' };
        def.height = '=steps(@totalWidth, {0: 300})';
        def.filter = { c: '@g' };
        def.annotations = [{ type: 'line', y: 1, props: { stroke: '@g', 'stroke-width': '=@innerWidth * 0.01' } }];
        expect(validateDef(def)).toEqual([]);

        def.dims.c.legend.props.title = '@innerWidth';
        def.dims.x.scale.range = [0, '@radius'];
        def.marks = { ...def.marks, fill: '@colour', 'data-y0': '@y:start:scaled' };
        def.height = '=steps(@innerWidth, {0: 300})';
        def.filter.c = '@h';
        def.annotations[0].props.stroke = '@color';
        expect(validateDef(def)).toEqual([
            "dims.x.scale.range[1]: unknown reference 'radius', expected one of 'g', 'totalWidth', 'width', 'innerWidth', 'height', 'innerHeight', 'plot:left', 'plot:top', 'plot:right', 'plot:bottom', 'plot:width', 'plot:height'",
            "dims.c.legend.props.title: unknown reference 'innerWidth', expected one of 'g', 'totalWidth', 'name', 'visible', 'color'",
            "marks[0].fill: unknown reference 'colour', did you mean 'color'?",
            "marks[0].data-y0: unknown reference 'y:start:scaled'",
            "filter.c: unknown reference 'h', expected one of 'g', 'totalWidth'",
            "annotations[0].props.stroke: unknown reference 'color'",
            "height.steps[0]: unknown reference 'innerWidth', expected one of 'g', 'totalWidth'",
        ]);

        // stacked values and the radius of polar charts
        def.dims.y.stacked = true;
        def.coord = 'polar';
        def.dims.x.axis = false;
        def.dims.y.axis = false;
        expect(validateDef(def).filter(w => w.includes("reference 'y:start:scaled'") || w.includes("reference 'radius'"))).toEqual([]);
        // the radius is a name of the facets of polar charts, e.g. of the hole of a donut
        def.marks.innerRadius = '=@radius * 0.5';
        expect(validateDef(def).filter(w => w.includes('innerRadius'))).toEqual([]);
    });

    test('curved labels of an angular axis', () => {
        const def = base();
        def.coord = 'polar';
        // the angular and the radial axis of x and y
        def.dims.x = { column: 'year', type: 'numeric', axis: { labels: { curved: 'between' } } };
        def.dims.y = { column: 'value', type: 'numeric', axis: { labels: { curved: true } } };
        def.marks = { type: 'line', by: 'c' };
        expect(validateDef(def)).toEqual(["dims.y.axis.labels.curved: the labels along the circle of an angular axis, true or 'between'"]);
        def.dims.y.axis.labels.curved = false;
        def.dims.x.axis.labels.curved = 'around';
        expect(validateDef(def)).toEqual(["dims.x.axis.labels.curved: the labels along the circle of an angular axis, true or 'between'"]);
    });

    test('the props of the labels of an axis by the categories of the dims of their rows', () => {
        const def = base();
        def.dims.y.axis = { labels: { by: ['c'], props: { 'font-weight': '@weight' } } };
        def.dims.c.common = { weight: 'bold' };
        expect(validateDef(def)).toEqual([]);
        def.dims.y.axis.labels.by = 'nope';
        expect(validateDef(def)).toEqual(["dims.y.axis.labels.by: unknown dim 'nope'", "dims.y.axis.labels.props.font-weight: unknown reference 'weight', did you mean 'height'?"]);
        def.dims.y.axis.labels = { categories: ['c'] };
        expect(validateDef(def)).toEqual([expect.stringMatching(/^dims\.y\.axis\.labels\.categories: unknown key/)]);
    });

    test('the data, the selection and the layer of a mark', () => {
        const def = base();
        def.globals = { target: 3 };
        def.marks = [def.marks, {
            type: 'svg:text', data: [{ y: '@target', label: 'A' }], select: 'last', layer: 'below', halo: true,
            x: '@x:scaled:max', y: '@y:scaled', text: '@label',
        }];
        expect(validateDef(def)).toEqual([]);
        def.marks[1] = { ...def.marks[1], data: [{ y: '@unknown' }], select: { top: 'y' }, layer: 'front', text: '@label' };
        def.marks[0].halo = 2;
        def.marks[0].dodge = 12;
        expect(validateDef(def)).toEqual([
            "marks[0].dodge: the distance of the texts of a mark of 'svg:text' or 'polar:text', a number",
            "marks[0].halo: a halo behind the texts of a text or label mark (also of polar charts and maps), true or its width",
            "marks[1].data[0].y: unknown reference 'unknown', expected one of 'target', 'totalWidth', 'width', 'innerWidth', 'height', 'innerHeight', 'plot:left', 'plot:top', 'plot:right', 'plot:bottom', 'plot:width', 'plot:height'",
            `marks[1].select: expected 'first', 'last' or the min or max of a dim, e.g. { "max": "x" }`,
            "marks[1].text: unknown reference 'label'",
            "marks[1].layer: unknown layer 'front', expected one of 'below', 'above'",
        ]);
        delete def.marks[0].halo;
        delete def.marks[0].dodge;
        // the names of the rows of a url are not known
        def.marks[1] = { type: 'svg:text', data: 'events.csv', select: { max: 'z' }, text: '@label' };
        expect(validateDef(def)).toEqual(["marks[1].select.max: unknown dim 'z'"]);
        def.marks[1] = { type: 'annotation:band', data: 3 };
        def.annotations = [{ type: 'line', y: '@target' }, { type: 'line', y: '@nope' }];
        expect(validateDef(def)).toEqual([
            "marks[1].data: expected a list of rows or the url of the data",
            "annotations[1].y: unknown reference 'nope', expected one of 'target', 'totalWidth', 'width', 'innerWidth', 'height', 'innerHeight', 'plot:left', 'plot:top', 'plot:right', 'plot:bottom', 'plot:width', 'plot:height'",
        ]);
    });

    test('a built-in locale or a language of Intl', () => {
        const def = base();
        for (const locale of ['de', 'fr', 'de-CH', { base: 'it' }])
            expect(validateDef({ ...def, locale })).toEqual([]);
        expect(validateDef({ ...def, locale: 'xx' })).toEqual([
            "locale: unknown locale 'xx', expected one of 'de', 'en' or a language of Intl, e.g. 'fr'",
        ]);
    });

    test('annotations and the highlight of a mark', () => {
        const def = base();
        def.marks.highlight = { mode: 'element' };
        def.annotations = [{ type: 'band', x: [0, 1], z: 2 }, { type: 'arrow' }, { type: 'text', c: 'Wien' }];
        expect(validateDef(def)).toEqual([
            "annotations[0].z: unknown dim 'z'",
            "annotations[1].type: unknown type 'arrow', expected one of 'band', 'line', 'text', 'circle'",
            "annotations[2].c: the dim has no scale",
            "marks[0].highlight.mode: unknown mode 'element', expected one of 'group', 'row'",
        ]);
        def.marks.highlight = { mode: 'row' };
        def.coord = 'geo';
        def.geo = { data: 'regions.json' };
        def.marks = { type: 'geo:region' };
        def.dims.x.scale = { orientation: 'horizontal' };
        def.annotations = [{ type: 'band' }, { type: 'text', lon: 16.4, lat: 48.2 }];
        expect(validateDef(def).sort()).toEqual([
            "annotations[0].type: a band is not available in the coordinate system 'geo', expected one of 'text', 'circle'",
            "annotations[0]: an annotation of a map needs 'lon' and 'lat'",
            "dims.x.scale.orientation: the coordinate system 'geo' has no orientations, e.g. a scale of colors has none",
        ].sort());
        // the object and the borders of geo:mesh
        def.annotations = [];
        def.marks = [
            { type: 'geo:mesh', object: 'states', borders: 'inner' },
            { type: 'geo:mesh', object: 1, borders: 'between' },
            { type: 'geo:region', object: 'states', borders: 'all' },
        ];
        expect(validateDef(def).filter(w => w.startsWith('marks'))).toEqual([
            "marks[1].object: the object of the TopoJSON of a mark of 'geo:mesh', a string",
            "marks[2].object: the object of the TopoJSON of a mark of 'geo:mesh', a string",
            "marks[2].borders: the borders of a mark of 'geo:mesh', one of 'all', 'inner', 'outer'",
            "marks[1].borders: unknown borders 'between', expected one of 'all', 'inner', 'outer'",
        ]);
    });

    test('column templates need the globals, also of the other values of the controls', () => {
        const def = base();
        def.globals = { values: 'value' };
        def.dims.y.column = "=match(@values, {unit: '{unit}'}, '{values}{share}')";
        def.controls = [{ global: 'values', type: 'radio', values: [{ value: 'value' }, { value: 'unit' }] }];
        expect(validateDef(def)).toEqual([
            "dims.y.column: unknown global 'share' in the column template",
            "controls[0].values[1] > dims.y.column: unknown global 'unit' in the column template",
        ]);
    });

    test('templates of the texts need the globals, domains can have references', () => {
        const def = base();
        def.globals = { a: 1 };
        def.source = '{a} {b}';
        def.dims.y.name = '{c}';
        def.dims.y.domain = [0, '@a'];
        def.dims.c.categories.Wien.name = '{a}{d}';
        def.annotations = [{ type: 'text', text: '{e}' }];
        expect(validateDef(def)).toEqual([
            "source: unknown global 'b' in the text",
            "dims.y.name: unknown global 'c' in the text",
            "dims.c.categories.Wien.name: unknown global 'd' in the text",
            "annotations[0].text: unknown global 'e' in the text",
        ]);
        def.dims.y.domain = [0, '@z'];
        expect(validateDef(def)).toContainEqual(expect.stringMatching(/^dims.y.domain\[1\]: unknown reference 'z'/));
        // the domain of the scale
        delete def.dims.y.domain;
        def.dims.y.scale = { domain: [0, '@z'] };
        expect(validateDef(def)).toContainEqual(expect.stringMatching(/^dims.y.scale.domain\[1\]: unknown reference 'z'/));
    });

    test('templates of the title and the subtitle need the globals', () => {
        const def = base();
        def.globals = { base: '2019' };
        def.title = 'Index {base}';
        def.subtitle = '{base} = 100, {unit}';
        expect(validateDef(def)).toEqual([
            "subtitle: unknown global 'unit' in the text",
        ]);
    });
});

describe('validateDef and the schema', () => {
    test('unknown keys everywhere the schema has none, typos with the key they probably are', () => {
        const def = base();
        def.dims.x.axis = { positon: 'bottom' };
        def.dims.y.scale = { domian: [0, null] };
        def.dims.y.nicee = true;
        def.hover = { sid: 'left' };
        def.titel = 'A';
        def.colour = 'red';
        // in the order of the keys of the definition
        expect(validateDef(def)).toEqual([
            "dims.x.axis.positon: unknown key, did you mean 'position'?",
            "dims.y.scale.domian: unknown key, did you mean 'domain'?",
            "dims.y.nicee: unknown key, did you mean 'nice'?",
            "hover.sid: unknown key, did you mean 'side'?",
            "titel: unknown key, did you mean 'title'?",
            expect.stringMatching(/^colour: unknown key/),
        ]);
    });

    test('values of the enums of the schema, typos with the value they probably are', () => {
        const def = base();
        def.marks.curve = 'monotonX';
        def.hover = { side: 'top', box: 'no', offset: [0] };
        def.transition = -1;
        def.transform = { type: 'lookup', column: 'land', data: 'names.csv', key: 'id', value: 'name', dataFormat: 'xlsx' };
        expect(validateDef(def)).toEqual([
            "marks[0].curve: unknown curve 'monotonX', did you mean 'monotoneX'?",
            "hover.side: unknown side 'top', expected one of 'left', 'right', 'above', 'below', 'center'",
            "hover.box: expected true or false",
            "hover.offset: expected 2 values",
            "transition: expected at least 0",
            "transform[0].dataFormat: unknown dataFormat 'xlsx', expected one of 'csv', 'tsv', 'json', 'parquet'",
        ]);
    });

    test('the offset of the hover can leave out a direction (null)', () => {
        expect(validateDef({ ...base(), hover: { offset: [null, -10] } })).toEqual([]);
    });

    test('false or null removes a part of a dim, null the geometry or the filter', () => {
        const def = base();
        def.dims.c.hover = false;
        def.dims.c.legend = null;
        def.dims.c.scale = false;
        def.filter = null;
        def.geo = null;
        def.globals = { g: 'a' };
        def.controls = [{ global: 'g', type: 'radio', values: [{ value: 'a' }, { value: 'b' }] }];
        expect(validateDef(def)).toEqual([]);
    });

    test('other scalar fields of entries are names of templates, e.g. {g:short}', () => {
        const def = base();
        def.globals = { g: 'a' };
        def.subtitle = 'Values of {g:short}';
        def.controls = [{ global: 'g', type: 'radio', values: [
            { value: 'a', short: 'A', rank: 1, main: true, none: null },
            { value: 'b', short: { de: 'B' } },
        ] }];
        expect(validateDef(def)).toEqual([
            "controls[0].values[1].short: expected a string or a number or true or false or null",
        ]);
    });

    test('the definitions of the other values of the controls, the warnings of their own after the entry', () => {
        const def = base();
        def.globals = { g: 'a' };
        def.dims.y.scale = { type: 'Linear' };
        def.dims.y.type = "=match(@g, {b: 'date'}, 'numeric')";
        def.coord = "=match(@g, {c: 'geo'}, 'cartesian')";
        def.marks = { match: ['@g', { c: { literal: [{ type: 'geo:region', by: ['z'] }] } }, { literal: [def.marks] }] };
        def.controls = [{ global: 'g', type: 'radio', values: ['a', 'b', 'c'] }];
        expect(validateDef(def)).toEqual([
            "dims.y.scale.type: use 'linear'",
            "controls[0].values[1] > dims.y.scale.type: the positions of dates need a 'time' or a 'utc' scale",
            "controls[0].values[2] > marks[0].by: unknown dim 'z', expected one of 'x', 'y', 'c'",
            "controls[0].values[2] > geo.data: a map needs its geometry, GeoJSON or TopoJSON or their url",
        ]);
        // the values of the expressions of the globals are checked by the schema
        def.dims.y.type = "=match(@g, {b: 'date'}, 'number')";
        expect(validateDef(def)).toContain("dims.y.type: unknown type 'number', expected one of 'numeric', 'date', 'categorical'");
    });

    test('registered mark types and coordinate systems are valid in the schema, unknown ones are warnings', () => {
        const def = base();
        def.marks.type = 'my:mark';
        def.coord = 'mine';
        // an unknown coordinate system has no positions, so x and y have no scales
        const unscaled = ["marks[0].d.x: unknown reference 'x:scaled'", "marks[0].d.y: unknown reference 'y:scaled'"];
        expect(validateDef(def)).toEqual([
            "coord: unknown coordinate system 'mine', expected one of 'cartesian', 'polar', 'geo'",
            expect.stringMatching(/^marks\[0\]\.type: unknown type 'my:mark', expected one of 'svg:circle', /),
            ...unscaled,
        ]);
        def.marks.type = 'cartesian:lin';
        def.coord = 'polr';
        expect(validateDef(def)).toEqual([
            "coord: unknown coordinate system 'polr', did you mean 'polar'?",
            "marks[0].type: unknown type 'cartesian:lin', did you mean 'cartesian:line'?",
            ...unscaled,
        ]);
        // a type without the prefix of the coordinate system
        def.coord = 'polar';
        def.marks = { type: 'lin', by: 'c' };
        expect(validateDef(def)).toEqual(["marks[0].type: unknown type 'lin' of the coordinate system 'polar', did you mean 'line'?"]);
    });

    test('the names of d3 in the case of the schema', () => {
        const def = base();
        def.coord = 'geo';
        def.geo = { data: 'map.json', projection: { type: 'Mercator' } };
        def.marks = { type: 'geo:region' };
        def.dims.x = { column: 'year', type: 'numeric', scale: { type: 'Linear', interpolator: 'Blues' } };
        expect(validateDef(def)).toEqual([
            "dims.x.scale.type: use 'linear'",
            "dims.x.scale.interpolator: a linear scale has no interpolator, e.g. a sequential one has",
            "geo.projection.type: use 'mercator'",
        ]);
    });

    test('nice rounds the domains of numeric dims, the messages of dims without a type', () => {
        const def = base();
        def.dims.d = { column: 'date', type: 'date', scale: { type: 'time' }, nice: true };
        def.dims.c.scale = { type: 'linear' };
        def.dims.c.nice = 5;
        expect(validateDef(def)).toEqual([
            "dims.c.scale.type: a linear scale does not fit the type 'categorical'",
            "dims.c.nice: only the domains of numeric dims are rounded, not the ones of the type 'categorical'",
            "dims.d.nice: only the domains of numeric dims are rounded, not the ones of the type 'date'",
        ]);
        delete def.dims.d;
        // a dim without a type of its categories is categorical
        delete def.dims.c.type;
        expect(validateDef(def)).toEqual([
            "dims.c.scale.type: a linear scale does not fit the type 'categorical'",
            "dims.c.nice: only the domains of numeric dims are rounded, not the ones of the type 'categorical'",
        ]);
        // without a type of its parts and without the rows the type is not known
        delete def.dims.c.categories;
        delete def.dims.c.scale;
        def.marks.by = [];
        expect(validateDef(def)).toEqual([]);
    });

    test('years of a date dim are milliseconds, if the rows are given', () => {
        const def = base();
        def.dims.x = { column: 'year', type: 'date' };
        expect(validateDef(def)).toEqual([]);
        expect(validateDef(def, [{ year: '2020', value: 1, land: 'Wien' }, { year: Date.UTC(2021, 0, 1), value: 2, land: 'Wien' }])).toEqual([]);
        expect(validateDef(def, [{ year: 2020, value: 1, land: 'Wien' }])).toEqual([
            `dims.x.type: the values of 'year' are numbers, e.g. 2020, which are milliseconds since 1970 as dates, years are numeric or strings, e.g. "2020"`,
        ]);
    });

    test('a map has no axes', () => {
        const def = base();
        def.coord = 'geo';
        def.geo = { data: 'map.json' };
        def.marks = { type: 'geo:region' };
        // a map has no positions of x and y, the scales and axes are written
        def.dims.x.scale = {};
        def.dims.x.axis = {};
        def.dims.y.scale = {};
        def.dims.y.axis = { position: 'left' };
        expect(validateDef(def)).toEqual([
            "dims.x.axis: the coordinate system 'geo' has no axes",
            "dims.y.axis: the coordinate system 'geo' has no axes",
        ]);
    });
});

describe('validateDef of the types of the rows', () => {
    test('a dim of a sequential scale without a type is numeric, also of the regions of a map by another dim', () => {
        const def = {
            coord: 'geo',
            geo: { data: 'regions.json' },
            dims: { country: { column: 'country', categories: { AT: {} } }, value: { column: 'share', domain: [0, 1], scale: { type: 'sequential', interpolator: 'Reds' } } },
            marks: { type: 'region', by: 'country', fill: '@value:scaled' },
        };
        expect(validateDef(def, [{ country: 'AT', share: 0.5 }])).toEqual([]);
        expect(normalize(translate(def), { markTypes }).dims.value.type).toBe('numeric');
    });

    test('bars on a continuous scale without a width: the dims of the orientation as declared', () => {
        const rows = [{ land: 'Wien', wert: 2.1 }, { land: 'Tirol', wert: 1.2 }];
        // y a column of names, x of numbers: vertical bars (nothing declares y categorical) on the continuous x
        const def = { dims: { x: 'wert', y: 'land' }, marks: { type: 'bar' } };
        expect(validateDef(def, rows)).toEqual([
            `marks[0]: the bars are vertical on the continuous scale of the dim 'x', they need a 'width' in pixels; horizontal bars along 'x' need "orient": "horizontal" or "type": "categorical" of the dim 'y' (the orientation follows from the dims as the definition declares them, not from the types of the data)`,
        ]);
        // declared: horizontal bars, no warning
        expect(validateDef({ ...def, dims: { x: 'wert', y: { column: 'land', type: 'categorical' } } }, rows)).toEqual([]);
        expect(validateDef({ ...def, dims: { x: { column: 'wert', zero: true }, y: 'land' } }, rows)).toEqual([]);
        expect(validateDef({ ...def, marks: { type: 'bar', orient: 'horizontal' } }, rows)).toEqual([]);
        // a width, the classes of a bin, bars of categories: no warning
        expect(validateDef({ ...def, marks: { type: 'bar', width: 8 } }, rows)).toEqual([]);
        expect(validateDef({ dims: { x: 'land', y: 'wert' }, marks: { type: 'bar' } }, rows)).toEqual([]);
        // two numeric dims: vertical bars on x, the general hint
        expect(validateDef({ dims: { x: 'a', y: 'b' }, marks: { type: 'bar' } }, [{ a: 1, b: 2 }])).toEqual([
            `marks[0]: the bars are vertical on the continuous scale of the dim 'x', they need a 'width' in pixels, a categorical dim of their position or an "interval" of dates`,
        ]);
    });

    test('the scale of a dim of the type of its values', () => {
        const def = { dims: { n: { column: 'land', nice: 5 } }, marks: { type: 'cartesian:line' } };
        expect(validateDef(def, [{ land: 'Wien' }]).filter(w => w.startsWith('dims.n'))).toEqual([
            "dims.n.nice: only the domains of numeric dims are rounded, not the ones of the type 'categorical'",
        ]);
    });

    test('the types of the columns of transforms and of column templates, as the ones of the load', async () => {
        await loadTransforms();
        const def = {
            globals: { col: 'land' },
            transform: { type: 'align', column: 'date', as: 'day' },
            dims: { t: { column: 'day', nice: 5 }, n: { column: '{col}', nice: 5 }, u: { column: 'unknown', nice: 5 } },
            marks: { type: 'cartesian:line' },
        };
        expect(validateDef(def, [{ date: '2024-06-01', land: 'Wien' }]).filter(w => w.startsWith('dims.'))).toEqual([
            "dims.t.nice: only the domains of numeric dims are rounded, not the ones of the type 'date'",
            "dims.n.nice: only the domains of numeric dims are rounded, not the ones of the type 'categorical'",
            "dims.u.column: 'unknown' is not a column of the data, expected one of 'date', 'land', 'day'",
        ]);
    });
});

test('domainIgnores: the dims of conditions of the filter or true', () => {
    const def = (ignores) => {
        const d = base();
        d.dims.y.scale = { domainIgnores: ignores };
        return { ...d, globals: { year: 2020 }, filter: { x: '@globals.year' } };
    };
    expect(validateDef(def(['x']))).toEqual([]);
    expect(validateDef(def(true))).toEqual([]);
    expect(validateDef(def(['z']))).toEqual([`dims.y.scale.domainIgnores: unknown dim 'z'`]);
    expect(validateDef(def('x')).some(w => w.startsWith('dims.y.scale.domainIgnores'))).toBe(true);
});

describe('the names and the keys of 4.1', () => {
    const grid = () => {
        const d = base();
        d.dims.g = { column: 'group', categories: { Bau: { color: 'red' } } };
        return { ...d, facets: { by: { rows: 'c', cols: 'g' }, title: { props: { color: '@color' } } } };
    };

    test('the names of the facets of a grid, the props of the category of a column or a row of its titles', () => {
        const d = grid();
        d.marks = [d.marks, { type: 'svg:text', once: true, text: '=cat(@facet:row:name, @facet:col:name, @facet:row, @facet:col)', x: 0, y: '@plot:top' }];
        expect(validateDef(d)).toEqual([]);
        // not of other facets
        expect(validateDef({ ...d, facets: { by: 'c' } }).filter(w => w.includes('facet:row')).length).toBeGreaterThan(0);
    });

    test('the total of the hover: {total} of its title, a stacked dim', () => {
        const d = base();
        d.hover = { total: true, title: '{title}: {total}' };
        expect(validateDef(d)).toEqual([`hover.total: the sum of the stacked values, there is no stacked dim`]);
        d.dims.y.stacked = true;
        expect(validateDef(d)).toEqual([]);
        // its name in several languages
        d.hover.total = { de: 'Gesamt', en: 'Total' };
        expect(validateDef(d)).toEqual([]);
    });

    test('the facet of a mark or an annotation of a grid: its rows and columns', () => {
        const d = grid();
        d.marks = { ...d.marks, facet: { g: 'Bau' } };
        d.annotations = [{ type: 'line', y: 0, facet: { land: 'Wien' } }];
        expect(validateDef(d)).toEqual([`annotations[0].facet.land: expected the dim of the rows or the columns of the grid, 'c', 'g'`]);
        expect(validateDef({ ...d, annotations: [], facets: { by: 'c' } })).toEqual(
            [`marks[0].facet: an object of the rows and columns of a grid of facets ("rows", "cols"), of other facets their keys, e.g. "Wien"`]);
    });

    test('the keys of a bin: ranges of edges, positive steps, per, not on other transforms', () => {
        const checks = t => validateDef({ ...base(), transform: [t] }).filter(w => w.startsWith('transform'));
        expect(checks({ type: 'bin', column: 'value', edges: [{ from: 0, to: 10 }] })).toEqual([`transform[0].edges: a range of edges is { "from": 50, "to": 250, "step": 5 }, a positive step`]);
        expect(checks({ type: 'bin', column: 'value', step: -1 })).toEqual([`transform[0].step: the width of the classes, a positive number, e.g. 5`]);
        expect(checks({ type: 'bin', column: 'value', step: '{step}' })).toEqual([`transform[0]: unknown global 'step' in the template`]);
        expect(checks({ type: 'bin', column: 'value', step: 1, per: 0 })).toEqual([`transform[0].per: a positive number of units, e.g. 5`]);
        expect(checks({ type: 'bin', column: 'value', step: 1, per: 5, normalize: 'share' })).toEqual(
            [`transform[0].per: a share is one of the group, without a unit, 'per' is of counts and densities`]);
        expect(checks({ type: 'share', column: 'value', step: 5, seed: 1 })).toEqual(
            [`transform[0].step: only of a transform of the type 'bin'`, `transform[0].seed: only of a transform of the type 'random'`]);
    });
});

describe('validateDef in the words of 5.0, the keys of marks and the data', () => {
    const rows = [{ year: 2020, value: 1, land: 'Wien', kind: 'a' }, { year: 2021, value: 2, land: 'Tirol', kind: 'b' }];

    test('the names of 5.0 of the mark types, the default attributes of a type', () => {
        expect(validateDef({ ...base(), marks: { type: 'piont' } })).toEqual([
            "marks[0].type: unknown type 'piont' of the coordinate system 'cartesian', did you mean 'point'?"]);
        expect(validateDef({ ...base(), marks: { type: 'lable' } })).toEqual([
            "marks[0].type: unknown type 'lable' of the coordinate system 'cartesian', did you mean 'label'?"]);
        expect(validateDef({ dims: { x: 'year' }, marks: { type: 'point' } })).toEqual([
            `marks[0]: a mark of the type 'point' reads '@y:scaled': it needs a dim 'y' with a scale (the channel y), e.g. "dims": { "y": "value" }, or the attributes which replace its defaults`]);
    });

    test('a text or label mark without a text', () => {
        expect(validateDef({ ...base(), marks: { type: 'label' } })).toEqual([
            `marks[0].text: missing: the texts of a label mark are empty without it, e.g. "text": "@y" or "=format(@y, ',.0f')"`]);
        expect(validateDef({ ...base(), marks: [{ type: 'line' }, { type: 'text', x: 'x', y: 'y' }] })).toEqual([
            `marks[1].text: missing: the texts of a text mark are empty without it, e.g. "text": "@y" or "=format(@y, ',.0f')"`]);
        expect(validateDef({ ...base(), marks: { type: 'label', text: '@y' } })).toEqual([]);
    });

    test('typos of the keys of a mark and of attributes of svg, other keys are attributes', () => {
        const marks = { type: 'line', by: 'c', bye: 'c', filtr: { c: 'Wien' }, stak: true, curv: 'step', highligt: { opacity: 1 }, 'strok-width': 2,
            'stroke-width': 2, 'data-kind': 'a', label: 'x', mode: 'm' };
        expect(validateDef({ ...base(), marks })).toEqual([
            "marks[0].bye: unknown key, did you mean 'by'? (other keys are attributes of the elements)",
            "marks[0].filtr: unknown key, did you mean 'filter'? (other keys are attributes of the elements)",
            "marks[0].stak: unknown key, did you mean 'stack'? (other keys are attributes of the elements)",
            "marks[0].curv: unknown key, did you mean 'curve'? (other keys are attributes of the elements)",
            "marks[0].highligt: unknown key, did you mean 'highlight'? (other keys are attributes of the elements)",
            "marks[0].strok-width: no attribute of svg, did you mean 'stroke-width'?",
            "marks[0].label: unknown key, did you mean 'layer'? (other keys are attributes of the elements)",
        ]);
    });

    test('the dims of a grid of facets are facets.by.rows and facets.by.cols, the dims of shared scales', () => {
        expect(validateDef({ ...base(), facets: { by: { rows: 'z', cols: 'q' } } })).toEqual([
            "facets.by.rows: unknown dim 'z', expected one of 'x', 'y', 'c'",
            "facets.by.cols: unknown dim 'q', expected one of 'x', 'y', 'c'",
        ]);
        expect(validateDef({ ...base(), facets: { by: { rows: 3 } } })).toEqual(['facets.by.rows: expected the dim of the rows of a grid']);
        expect(validateDef({ ...base(), facets: { by: 'c', scales: ['y', 'yy'] } })).toEqual(["facets.scales: unknown dim 'yy', expected one of 'x', 'y', 'c'"]);
        expect(validateDef({ ...base(), facets: { by: 'c', scales: 'shared' } })).toEqual([]);
        // `cols` of facets of a dim is the number of columns, facets.cols in both forms
        expect(validateDef({ ...base(), facets: { by: 'c', cols: '@nope' } })).toEqual([expect.stringMatching(/^facets\.cols: /)]);
    });

    test('the templates of transforms are the values of the globals', () => {
        const def = { ...base(), globals: { op: 'diff', k: '1' }, transform: { type: 'window', column: 'value', by: 'land', order: 'year', op: '{op}', offset: '{k}', as: 'd' } };
        expect(validateDef(def)).toEqual([]);
        expect(validateDef({ ...def, globals: {} })).toEqual(["transform[0]: unknown global 'op' in the template", "transform[0]: unknown global 'k' in the template"]);
    });

    test('the names of filters: plain names are columns, of the rows given the columns of the data and the transforms', async () => {
        await loadTransforms();
        const def = { ...base(), filter: '@kind != "x"', marks: { ...base().marks, filter: '@share > 0.1' } };
        expect(validateDef(def)).toEqual([]);
        expect(validateDef(def, rows)).toEqual([expect.stringMatching(/^marks\[0\]\.filter\.>\[0\]: unknown reference 'share'/)]);
        expect(validateDef({ ...def, transform: { type: 'share', column: 'value', by: 'year', as: 'share' } }, rows)).toEqual([]);
        // a part of a dim is no column
        expect(validateDef({ ...base(), filter: '@x:nope > 1' })).toEqual([expect.stringMatching(/^filter\.>\[0\]: unknown reference 'x:nope'/)]);
    });

    test('the data: the column of a dim, a channel of no dim and no column, texts of a numeric dim, a by of a column', () => {
        const def = base();
        expect(validateDef(def, rows)).toEqual([]);
        def.dims.x.column = 'yaer';
        expect(validateDef(def, rows)).toEqual(["dims.x.column: 'yaer' is not a column of the data, did you mean 'year'?"]);
        // a channel of a column which is no dim is an implicit dim of it
        expect(validateDef({ ...base(), marks: { type: 'point', x: 'year', y: 'vlaue' } }, rows))
            .toEqual(["marks[0].y: 'vlaue' is neither a dim nor a column of the data, did you mean 'value'?"]);
        expect(validateDef({ ...base(), marks: { type: 'point', x: 'year', y: 'kind' } }, rows)).toEqual([]);
        // the texts of a numeric dim are no values
        const texts = [...rows, { year: 2022, value: 'n/a', land: 'Wien' }];
        expect(validateDef(base(), texts)).toEqual([
            `dims.y.type: numeric, but 1 of the values of 'value' are texts, e.g. "n/a", they are no values (left out); "type": "categorical" keeps them`]);
        // a by of a column of the data which is no dim
        expect(validateDef({ ...base(), marks: { ...base().marks, by: ['kind'] } }, rows)).toEqual([
            `marks[0].by: unknown dim 'kind', a column of the data: a dim of it is needed, e.g. "dims": { "kind": "kind" }`]);
    });
});

test('the formats of numbers are formats of d3, of the rows given also of the dims without a type', () => {
    const def = base();
    def.dims.y.format = '%,.0f';
    expect(validateDef(def)).toEqual([`dims.y.format: '%,.0f' is no d3 format of numbers (invalid format: %,.0f), a time format is one of a date dim, "type": "date", e.g. ",.0f"`]);
    def.dims.y = { column: 'value', format: '%,.0f', axis: { format: ',.1f' }, hover: { format: 'x.y' } };
    // without a type a time format is the one of a date dim
    expect(validateDef(def)).toEqual([`dims.y.hover.format: 'x.y' is no d3 format of numbers (invalid format: x.y), e.g. ",.0f"`]);
    expect(validateDef(def, [{ year: 2020, value: 1, land: 'Wien' }])).toEqual([
        `dims.y.format: '%,.0f' is no d3 format of numbers (invalid format: %,.0f), a time format is one of a date dim, "type": "date", e.g. ",.0f"`,
        `dims.y.hover.format: 'x.y' is no d3 format of numbers (invalid format: x.y), e.g. ",.0f"`]);
    def.dims.x = { column: 'year', type: 'date', format: '%Y' };
    expect(validateDef({ ...def, dims: { ...def.dims, y: { column: 'value', format: ',.2~f' } } })).toEqual([]);
});

test('validateDef: zero and stacks of a log scale, which has no 0; bars on it are fine', () => {
    const def = y => ({ dims: { x: { column: 'a', type: 'categorical' }, y: { column: 'v', type: 'numeric', ...y } }, marks: { type: 'bar' } });
    expect(validateDef(def({ scale: { type: 'log' } }))).toEqual([]);
    expect(validateDef(def({ zero: true, scale: { type: 'log' } }))).toEqual([
        `dims.y.zero: a log scale has no 0, the domain cannot include it; bars and areas start at the end of the domain nearest to 0, e.g. "type": "symlog" has a 0`]);
    expect(validateDef({ ...def({ scale: { type: 'log' } }), marks: { type: 'bar', by: 'c', stack: true } }).filter(w => w.startsWith('dims.y'))).toEqual([
        `dims.y.scale.type: stacks start at 0, which a log scale has no position of, the stacked marks are not drawn, e.g. "type": "symlog" has a 0`]);
    expect(validateDef(def({ zero: true }))).toEqual([]);
});

test('a format as an expression of the value (the name of the dim): its references are checked, no d3 format', () => {
    const def = base();
    def.dims.y.format = "=format(@y / 1000, ',.0f')";
    def.dims.y.hover = { format: "=cat(format(@y / 1e6, ',.1f'), ' Mio.')" };
    expect(validateDef(def)).toEqual([]);
    def.dims.y.axis = { format: '=@nope' };
    expect(validateDef(def)).toEqual([expect.stringMatching(/^dims\.y\.axis\.format: unknown reference 'nope'/)]);
});
