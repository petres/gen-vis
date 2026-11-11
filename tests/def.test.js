import { loadColors } from '@/utils/d3';
import { migrate } from '@/utils/migrate';
import { markTypes } from '@/plots';
import { describe, test, expect, beforeAll } from 'vitest';
import { engineNames } from './v4.js';
import { resolve, namesOfGlobals } from '@/utils/resolve';
import { evaluate } from '@/utils/expr';
import { sameValue, applyResolved, variantsOf, fillTemplate, formatOf, mergeAll, prepareDef, selectedEntry, templateNames, templateRefs, variants } from '@/utils/def';

// the colors of d3 are loaded by the store, see loadColors
beforeAll(loadColors);

describe('prepareDef', () => {
    test('defaults', () => {
        const def = prepareDef({
            dims: {
                x: { column: 'a', scale: { orientation: 'horizontal' }, axis: { format: 'c' }, hover: {} },
                c: { column: 'b', common: { r: 3 }, categories: { a: {}, b: { visible: false, name: 'B' } } },
            },
            marks: { type: 'svg:circle', props: { r: '@r' }, highlight: { mode: 'row', r: 5 }, others: { opacity: 0.3 } },
        });
        expect(def.dims.x.scale).toMatchObject({ type: 'linear', domain: [null, null] });
        // without colors of the categories the default colors, see withColor of layout.js
        expect(def.dims.c.categoryProps).toEqual({ a: { r: 3, name: 'a', visible: true, defaultColor: '#4269D0' }, b: { r: 3, name: 'B', visible: false, defaultColor: '#EFB118' } });
        expect(def.marks).toHaveLength(1);
        // the names of the props of the highlight and of the others, of the stylesheet of the highlight, see utils/highlight.js
        expect(def.marks[0]).toMatchObject({ id: 'mark-0', by: [], highlightProps: ['r'], othersProps: ['opacity'], props: { r: '@r' } });
        expect(def.marks[0].props).not.toHaveProperty('highlight-r');
        expect(def.options.margins).toEqual({});
    });
});

describe('the props of categories', () => {
    const prepared = parts => prepareDef({ dims: { c: { column: 'c', ...parts } }, marks: [] }).dims.c;

    test('"order": "rows": all categories in the order of the rows, also the listed ones', () => {
        const dataKeys = () => ['b', 'all', 'a', 'c'];
        const c = prepareDef({ dims: { c: { column: 'c', order: 'rows', fromData: 'rows', scheme: 'Tableau10', categories: { all: { color: '#111' } } } }, marks: [] }, { dataKeys }).dims.c;
        expect(c.keys).toEqual(['b', 'all', 'a', 'c']);
        expect(c.categoryProps.all.color).toBe('#111');
    });

    test('the categories of the data in the order of the rows, also integers and keys of objects (review of 5.0)', () => {
        // an object would put the integers first and ascending, and make
        // __proto__ its prototype
        const dataKeys = () => ['2024', '2023', 'Total', '2022', '01', '1', '__proto__', 'constructor'];
        const c = prepareDef({ dims: { c: { column: 'c', fromData: 'rows', legend: {} } }, marks: [] }, { dataKeys }).dims.c;
        expect(c.keys).toEqual(['2024', '2023', 'Total', '2022', '01', '1', '__proto__', 'constructor']);
        expect(Object.hasOwn(c.categoryProps, '__proto__')).toBe(true);
        expect(c.categoryProps.__proto__.name).toBe('__proto__');
        expect(c.categoryProps.constructor.name).toBe('constructor');
        // the colors of the default palette in the order of the rows
        expect(c.categoryProps['2024'].defaultColor).toBe('#4269D0');
        // the listed ones first, then the ones of the data in their order
        const listed = prepareDef({ dims: { c: { column: 'c', fromData: 'rows', categories: { Total: { color: '#000' } } } }, marks: [] }, { dataKeys }).dims.c;
        expect(listed.keys.slice(0, 4)).toEqual(['Total', '2024', '2023', '2022']);
    });

    test('the order of the categories, of integers ascending as JavaScript orders them', () => {
        const categories = { 2024: {}, 2026: {}, 2025: {} };
        expect(prepared({ categories }).keys).toEqual(['2024', '2025', '2026']);
        expect(prepared({ categories, order: 'descending' }).keys).toEqual(['2026', '2025', '2024']);
        expect(prepared({ categories: { b: {}, c: {}, a: {} }, order: 'ascending' }).keys).toEqual(['a', 'b', 'c']);
        expect(prepared({ categories: { 9: {}, 10: {}, 100: {} }, order: 'descending' }).keys).toEqual(['100', '10', '9']);
        // the listed keys first, unknown ones are left out
        expect(prepared({ categories: { a: {}, b: {}, c: {} }, order: ['c', 'x', 'a'] }).keys).toEqual(['c', 'a', 'b']);
    });

    test('the shortcuts of the symbols of legends, with the props the categories have', () => {
        const symbol = (symbol, props = {}) => prepareDef({ dims: { c: { column: 'c', legend: { symbol }, categories: { a: props } } }, marks: [] }).dims.c.legend.symbol;
        expect(symbol('line')).toEqual({ width: 16, height: 16, elements: [{ type: 'line', props: { x1: 0, x2: 16, y1: 8, y2: 8, stroke: '@color', 'stroke-width': 2 } }] });
        expect(symbol('line', { 'stroke-width': 3, 'stroke-dasharray': '2 2', opacity: 0.5 }).elements[0].props).toEqual({
            x1: 0, x2: 16, y1: 8, y2: 8, stroke: '@color', 'stroke-width': '@stroke-width', 'stroke-dasharray': '@stroke-dasharray', opacity: '@opacity',
        });
        expect(symbol('rect')).toEqual({ width: 16, height: 16, elements: [{ type: 'rect', props: { x: 0, y: 0.5, width: 16, height: 15, rx: 2, fill: '@color' } }] });
        expect(symbol({ type: 'circle', size: 12, props: { stroke: 'white' } })).toEqual({ width: 12, height: 12, elements: [{ type: 'circle', props: { cx: 6, cy: 6, r: 4, fill: '@color', stroke: 'white' } }] });
        // a box of its own width and height, e.g. a longer line of a dash
        expect(symbol({ type: 'line', width: 24, height: 10 }).elements[0].props).toMatchObject({ x1: 0, x2: 24, y1: 5, y2: 5 });
        expect(symbol({ type: 'circle', width: 24, height: 10 })).toMatchObject({ width: 24, height: 10, elements: [{ props: { cx: 12, cy: 5, r: 3 } }] });
        // the svg elements are kept
        const elements = { size: 10, elements: [{ type: 'rect', props: { width: 10 } }] };
        expect(symbol(elements)).toEqual(elements);
    });

    test('a symbol of the marks of the categories: a light area under a line, the style which is the same for a category', () => {
        const def = prepareDef({ dims: { c: { column: 'c', legend: { symbol: 'auto' }, categories: { a: { dash: '4 2' } } } }, marks: [
            { type: 'cartesian:bar', by: 'c', props: { x: '@x:scaled', y1: '@y:scaled', fill: '@color', 'fill-opacity': 0.08, opacity: '@y' } },
            { type: 'cartesian:line', by: 'c', props: { 'stroke-width': 1.4, 'stroke-dasharray': '@dash', d: { x: '@x:scaled', y: '@y:scaled' } } },
            { type: 'cartesian:line', props: { stroke: 'black' } },
            // a rule of the categories before the line, the symbol is the one of the line
        ].toSpliced(0, 0, { type: 'cartesian:rule', by: 'c', props: { 'stroke-dasharray': '1 1' } }) }, { symbols: { line: { width: 18, height: 9 } } });
        expect(def.dims.c.legend.symbol).toEqual({ width: 18, height: 9, elements: [
            { type: 'rect', props: { x: 0, y: 0.5, width: 18, height: 8, fill: '@color', 'fill-opacity': 0.08 } },
            { type: 'line', props: { x1: 0, x2: 18, y1: 4.5, y2: 4.5, stroke: '@color', 'stroke-width': 1.4, 'stroke-dasharray': '@dash' } },
        ] });
        // without marks of the categories a box
        const none = prepareDef({ dims: { c: { column: 'c', legend: { symbol: 'auto' }, categories: { a: {} } } }, marks: [] });
        expect(none.dims.c.legend.symbol.elements[0].type).toBe('rect');
    });

    test('"auto" of marks of some categories: the symbol of each category of the marks which draw it', () => {
        const def = prepareDef({ globals: { year: '2024' }, dims: { c: { column: 'c', legend: { symbol: 'auto' }, categories: { a: {}, b: {}, c: { symbol: 'circle' }, d: {} } } }, marks: [
            { type: 'cartesian:line', by: 'c', filter: { c: 'a' }, props: { d: { x: '@x:scaled', y: '@y:scaled' } } },
            { type: 'cartesian:bar', by: 'c', filter: { c: { not: ['a', 'd'] } }, props: { x: '@x:scaled', y1: '@y:scaled' } },
            // a condition of a global is of all categories
            { type: 'svg:circle', by: 'c', filter: { c: '@year' }, props: {} },
        ] });
        const kinds = k => def.dims.c.categoryProps[k].symbol.elements.map(e => e.type);
        // (a dot beside a box without a line: the box)
        expect([kinds('a'), kinds('b'), kinds('c'), kinds('d')]).toEqual([['line', 'circle'], ['rect'], ['circle'], ['circle']]);
        // the one of the legend of all marks
        expect(def.dims.c.legend.symbol.elements.map(e => e.type)).toEqual(['rect', 'line', 'circle']);
    });

    test('a symbol of a category instead of the one of the legend', () => {
        const c = prepareDef({ dims: { c: { column: 'c', legend: { symbol: 'line' }, categories: { a: { symbol: 'rect' }, b: {} } } }, marks: [] }).dims.c;
        expect(c.categoryProps.a.symbol.elements[0].type).toBe('rect');
        expect(c.categoryProps.b.symbol).toBeUndefined();
        expect(c.legend.symbol.elements[0].type).toBe('line');
    });

    test('the props of the ranks of the categories, the last one of all others', () => {
        const c = prepared({
            categories: { 2023: {}, 2024: {}, 2025: { opacity: 0.9 }, 2026: {} },
            order: 'descending',
            common: { opacity: 0.5, width: 2 },
            ranks: [{ color: 'red', opacity: 1 }, { color: 'orange' }, { color: 'grey', opacity: 0.2 }],
        });
        expect(c.keys).toEqual(['2026', '2025', '2024', '2023']);
        expect(c.keys.map(k => [c.categoryProps[k].color, c.categoryProps[k].opacity, c.categoryProps[k].width])).toEqual([
            ['red', 1, 2], ['orange', 0.9, 2], ['grey', 0.2, 2], ['grey', 0.2, 2],
        ]);
    });

    test('the colors of a scheme in the order of the categories, the given ones are kept', () => {
        const def = prepareDef({ dims: { c: { column: 'c', scheme: 'Blues', common: { r: 2 }, categories: { a: {}, b: { color: 'red' }, c: {} } } }, marks: [] });
        expect(def.dims.c.categoryProps).toEqual({
            a: { color: '#deebf7', r: 2, name: 'a', visible: true },
            b: { color: 'red', r: 2, name: 'b', visible: true },
            c: { color: '#3182bd', r: 2, name: 'c', visible: true },
        });
        expect(() => prepareDef({ dims: { c: { scheme: 'Nope', categories: {} } }, marks: [] })).toThrow("Unknown scheme 'Nope'");
    });
});

describe('formatOf', () => {
    test('of the axis, the hover and the legend', () => {
        const m = { scale: { type: 'linear' }, axis: { format: '.1f' } };
        expect(formatOf(m, 'axis')).toBe('.1f');
        expect(formatOf(m, 'hover')).toBe('.1f');
        expect(formatOf({ ...m, hover: { format: '.2f' } }, 'hover')).toBe('.2f');
        expect(formatOf({ ...m, hover: { format: '.2f' } }, 'legend')).toBe('.2f');
        expect(formatOf({ ...m, legend: { format: '.0%' } }, 'legend')).toBe('.0%');
    });

    test('the defaults', () => {
        expect(formatOf({ scale: { type: 'linear' } }, 'axis')).toBeUndefined();
        expect(formatOf({ scale: { type: 'linear' } }, 'legend')).toBeUndefined();
        // the default of the hover is the one of the locale, see valueFormat
        expect(formatOf({ scale: { type: 'linear' } }, 'hover')).toBeUndefined();
        expect(formatOf({ scale: { type: 'utc' } }, 'hover')).toBeUndefined();
    });
});

describe('applyResolved (the parts of the definition of its globals)', () => {
    // the source of 5.0 of a definition of 4.x with patches, see utils/migrate.js
    const sourceOf = def4 => migrate(def4);
    const options = source => ({ source, markTypes });
    const defOrg = {
        globals: { value: 'a' },
        formElements: [{ ref: 'value', type: 'radio', values: [
            { value: 'a', patch: { mapping: { y: { column: 'A' } } } },
            { value: 'b', patch: { mapping: { y: { column: 'B' } } } },
        ] }],
        mapping: { y: { column: 'A', type: 'numeric', scale: { orientation: 'vertical' } } },
        plot: { type: 'cartesian:line', props: {} },
    };

    test('the selected entries change the dims', () => {
        const source = sourceOf(defOrg);
        expect(source.dims.y.column).toBe("=match(@value, {a: 'A', b: 'B'}, 'A')");
        const def = prepareDef(engineNames(defOrg), options(source));
        expect(def.dims.y.column).toBe('A');
        def.globals.value = 'b';
        expect(applyResolved(def, engineNames(defOrg), options(source))).toEqual(['y']);
        expect(def.dims.y).toMatchObject({ column: 'B', type: 'numeric', scale: { type: 'linear' } });
        expect(defOrg.mapping.y.column).toBe('A');
    });

    test('nothing to do without a source', () => {
        const def = prepareDef({ dims: {} });
        expect(applyResolved(def, { dims: {} })).toEqual([]);
    });

    test('the other parts of the definition, unchanged ones are kept', () => {
        const org = {
            globals: { view: 'world' },
            formElements: [{ ref: 'view', type: 'radio', values: [
                { value: 'world' },
                { value: 'europe', patch: {
                    options: { height: 300, title: 'Europe' },
                    geo: { fit: 'data' },
                    filter: { region: 'EU' },
                    plot: [{ id: 'dots', props: { r: 2 } }],
                    mapping: { x: null },
                } },
            ] }],
            options: { title: 'World' },
            geo: { data: 'world.json' },
            mapping: { x: { column: 'x', type: 'numeric' }, region: { column: 'r', fromData: true } },
            plot: [{ id: 'dots', type: 'svg:circle', props: { r: 4, fill: 'red' } }],
        };
        const source = sourceOf(org);
        const def = prepareDef(engineNames(org), options(source));
        const region = def.dims.region;
        expect(def.options).toMatchObject({ title: 'World', height: 400 });
        // the filter of the rows is the expression of the global, all rows of the other values
        expect(def.filter).toEqual({ match: ['@globals.view', { europe: { '==': ['@region', 'EU'] } }, true] });

        def.globals.view = 'europe';
        applyResolved(def, engineNames(org), options(source));
        expect(def.options).toMatchObject({ title: 'Europe', height: 300, margins: {} });
        expect(def.geo).toEqual({ data: 'world.json', fit: 'data' });
        expect(def.filter).toEqual({ match: ['@globals.view', { europe: { '==': ['@region', 'EU'] } }, true] });
        expect(def.marks[0].props).toMatchObject({ r: 2, fill: 'red' });
        // null removes a part, the dims which are the same are kept
        expect(Object.keys(def.dims)).toEqual(['region']);
        expect(def.dims.region).toBe(region);

        def.globals.view = 'world';
        applyResolved(def, engineNames(org), options(source));
        expect(def.geo).toEqual({ data: 'world.json' });
        // the filter of the rows is the expression of the global, all rows of the other values
        expect(def.filter).toEqual({ match: ['@globals.view', { europe: { '==': ['@region', 'EU'] } }, true] });
        expect(Object.keys(def.dims)).toEqual(['x', 'region']);
    });

    test('an entry sets globals', () => {
        const org = {
            globals: { group: 'inno', label: 'Innovation Leaders' },
            formElements: [{ ref: 'group', type: 'radio', values: [
                { value: 'inno', globals: { label: 'Innovation Leaders' } },
                { value: 'eu', globals: { label: 'EU-27' } },
            ] }],
            dims: {},
        };
        const def = prepareDef(JSON.parse(JSON.stringify(org)));
        def.globals.group = 'eu';
        applyResolved(def, org);
        expect(def.globals).toEqual({ group: 'eu', label: 'EU-27' });
    });

    test('columns are filled from the globals of several form elements', () => {
        const org = {
            globals: { values: 'twh', share: '' },
            formElements: [
                { ref: 'values', type: 'radio', values: [{ value: 'twh' }, { value: 'co2' }] },
                { ref: 'share', type: 'radio', values: [
                    { value: '' },
                    { value: '.share', patch: { mapping: { y: { axis: { format: '.0%' } } } } },
                ] },
            ],
            mapping: { y: { column: '{values}{share}', type: 'numeric', axis: { format: ',.1f' } } },
            plot: { type: 'cartesian:line', props: {} },
        };
        const source = sourceOf(org);
        const def = prepareDef(engineNames(org), options(source));
        expect(def.dims.y).toMatchObject({ column: 'twh', axis: { format: ',.1f' } });
        // the same column, e.g. a form element of other globals
        expect(applyResolved(def, engineNames(org), options(source))).toEqual([]);

        Object.assign(def.globals, { values: 'co2', share: '.share' });
        expect(applyResolved(def, engineNames(org), options(source))).toEqual(['y']);
        expect(def.dims.y).toMatchObject({ column: 'co2.share', axis: { format: '.0%' } });
        expect(org.mapping.y.column).toBe('{values}{share}');
    });
});

describe('column templates', () => {
    test('the referenced globals', () => {
        expect(templateRefs('{values}{share}')).toEqual(['values', 'share']);
        expect(templateRefs('value')).toEqual([]);
        expect(templateRefs(undefined)).toEqual([]);
    });

    test('unknown globals are kept', () => {
        expect(fillTemplate('{a}.{b}', { a: 'x' })).toBe('x.{b}');
        expect(fillTemplate('{a}', { a: 1 })).toBe('1');
        // only the own globals, not the keys of the prototype of objects
        expect(fillTemplate('{constructor} {toString}', {})).toBe('{constructor} {toString}');
        // names of letters of any language
        expect(fillTemplate('{größe} {año}', { größe: 'groß', año: 2024 })).toBe('groß 2024');
        expect(templateRefs('{größe}{x_1}')).toEqual(['größe', 'x_1']);
    });

    test('the fields of the selected entries of the form elements', () => {
        const def = prepareDef({
            globals: { group: 'eu' },
            formElements: [{ ref: 'group', type: 'radio', values: [
                { id: 'inno', name: 'Innovation Leaders', value: 'inno' },
                { id: 'eu', name: 'EU-27', value: 'eu', short: 'EU', patch: { dims: {} } },
            ] }],
            dims: {},
        });
        const names = templateNames(def);
        expect(names).toMatchObject({ group: 'eu', 'group:name': 'EU-27', 'group:id': 'eu', 'group:short': 'EU' });
        expect(names).not.toHaveProperty('group:patch');
        expect(fillTemplate('relative to {group:name} ({group})', names)).toBe('relative to EU-27 (eu)');
        expect(templateRefs('{group:name}')).toEqual(['group']);
    });
});

describe('variants and selectedEntry', () => {
    test('the definitions of the engine of all values of the controls of the load, the definition itself without them', () => {
        const def = { dims: { y: { column: 'value' } } };
        expect(variants(def)).toEqual([def]);
        const own = { dims: { y: { column: 'value' } } };
        own[variantsOf] = [own, { dims: { y: { column: 'share' } } }];
        expect(variants(own)).toEqual([own, { dims: { y: { column: 'share' } } }]);
    });
});

describe('mergeAll', () => {
    test('arrays are replaced, arrays of entries with an id are merged by it', () => {
        const merged = mergeAll([
            { plot: [{ type: 'a' }], formElements: [
                { id: 'values', name: 'Werte', values: [{ id: 'abs', name: 'Absolut' }, { id: 'share', name: 'Anteil' }] },
                { id: 'scale', name: 'Skala' },
            ] },
            { plot: [{ type: 'b' }], formElements: [
                { id: 'values', values: [{ id: 'abs', name: 'Anzahl' }] },
                { id: 'unit', name: 'Einheit' },
            ] },
        ]);
        expect(merged.plot).toEqual([{ type: 'b' }]);
        expect(merged.formElements).toEqual([
            { id: 'values', name: 'Werte', values: [{ id: 'abs', name: 'Anzahl' }, { id: 'share', name: 'Anteil' }] },
            { id: 'scale', name: 'Skala' },
            { id: 'unit', name: 'Einheit' },
        ]);
        // values without ids, e.g. the ones of a switch, are replaced
        expect(mergeAll([{ v: [{ id: 'a' }, 'x'] }, { v: [{ id: 'a', n: 1 }] }]).v).toEqual([{ id: 'a', n: 1 }]);
    });
});

describe('mergeAll of a key __proto__ (review of 5.0)', () => {
    test('an entry, e.g. a category of the data, not the prototype', () => {
        const merged = mergeAll([{ categories: JSON.parse('{"__proto__": {"color": "red"}, "a": {}}') }, { categories: JSON.parse('{"__proto__": {"name": "P"}}') }]);
        expect(Object.keys(merged.categories)).toEqual(['__proto__', 'a']);
        expect(Object.getPrototypeOf(merged.categories)).toBe(Object.prototype);
        expect(merged.categories.__proto__).toEqual({ color: 'red', name: 'P' });
    });
});

describe('sameValue', () => {
    test('scalars as strings, e.g. years of the data and of a definition', () => {
        expect(sameValue(2024, '2024')).toBe(true);
        expect(sameValue('a', 'a')).toBe(true);
        expect(sameValue(true, 'true')).toBe(true);
        expect(sameValue(1, 2)).toBe(false);
    });

    test('the values of globals and entries are texts, not numbers as of the == of expressions, e.g. the categories "01" and "1"', () => {
        expect(sameValue('01', '1')).toBe(false);
        expect(sameValue('1.0', 1)).toBe(false);
    });

    test('0 and missing values are different, missing ones are the same, also empty texts', () => {
        expect(sameValue(0, '')).toBe(false);
        expect(sameValue(0, null)).toBe(false);
        expect(sameValue('', undefined)).toBe(true);
        expect(sameValue(' ', null)).toBe(true);
        expect(sameValue(null, undefined)).toBe(true);
        expect(sameValue('a', '')).toBe(false);
    });

    test('lists and objects by their content', () => {
        expect(sameValue(['y'], ['y'])).toBe(true);
        expect(sameValue([], ['y'])).toBe(false);
        expect(sameValue({ a: 1 }, { a: 1 })).toBe(true);
        expect(sameValue(['y'], 'y')).toBe(false);
    });
});

describe('applyResolved of globals and of the categories of the data', () => {
    test('the globals of an entry select the entry of a later form element at once', () => {
        const org = {
            globals: { a: '2', b: 'x' },
            formElements: [
                { ref: 'a', values: [{ value: '1', globals: { b: 'y' } }, { value: '2' }] },
                { ref: 'b', values: [{ value: 'x', patch: { mapping: { y: { column: 'cx' } } } }, { value: 'y', patch: { mapping: { y: { column: 'cy' } } } }] },
            ],
            mapping: { y: { column: 'c0', type: 'numeric' } },
        };
        const source = migrate(org);
        const def = prepareDef(engineNames(org), { source, markTypes });
        expect(def.dims.y.column).toBe('cx');
        def.globals.a = '1';
        expect(applyResolved(def, engineNames(org), { source, markTypes })).toEqual(['y']);
        expect(def.globals.b).toBe('y');
        expect(def.dims.y.column).toBe('cy');
        // a second one changes nothing
        expect(applyResolved(def, engineNames(org), { source, markTypes })).toEqual([]);
        expect(def.dims.y.column).toBe('cy');
    });

    test('entries which set each other\'s globals end', () => {
        const org = {
            globals: { a: '1', b: '1' },
            formElements: [
                { ref: 'a', values: [{ value: '1', globals: { b: '2' } }, { value: '2', globals: { b: '1' } }] },
                { ref: 'b', values: [{ value: '1', globals: { a: '1' } }, { value: '2', globals: { a: '2' } }] },
            ],
        };
        expect(() => prepareDef(JSON.parse(JSON.stringify(org)))).not.toThrow();
    });

    test('a dim of the categories of the data is prepared again with other values of its column', () => {
        const org = { globals: { lang: 'de' }, formElements: [{ ref: 'lang', values: [{ value: 'de' }, { value: 'en' }] }],
            dims: { c: { column: 'name', fromData: true, legend: {} } } };
        let keys = ['Österreich', 'Deutschland'];
        const def = prepareDef(JSON.parse(JSON.stringify(org)), { dataKeys: () => keys });
        expect(def.dims.c.keys).toEqual(['Österreich', 'Deutschland']);
        def.globals.lang = 'en';
        keys = ['Austria', 'Germany'];
        applyResolved(def, org, { dataKeys: () => keys });
        expect(def.dims.c.keys).toEqual(['Austria', 'Germany']);
        expect(Object.keys(def.dims.c.categoryProps)).toEqual(['Austria', 'Germany']);
        // the same values keep the dim, e.g. its entries hidden
        def.dims.c.categoryProps.Austria.visible = false;
        const dim = def.dims.c;
        applyResolved(def, org, { dataKeys: () => [...keys] });
        expect(def.dims.c).toBe(dim);
    });
});

describe('languageOf (review of 4.1)', () => {
    test('a global without a value: the language of the locale', async () => {
        const { languageOf } = await import('@/utils/def');
        expect(languageOf({ language: '@lang', locale: 'en' }, {})).toBe('en');
        expect(languageOf({ language: '@lang', locale: 'en' }, { lang: 'de' })).toBe('de');
        expect(languageOf({ language: '@lang' }, {})).toBeUndefined();
        expect(languageOf({ language: 'fr', locale: 'en' }, {})).toBe('fr');
    });
});

describe('the merge of switches and their resolution (review of 5.0)', () => {
    const names = (def, globals) => namesOfGlobals({ ...def.globals, ...globals }, def.controls);
    const switched = [
        { globals: { s: 'lin' }, controls: [{ type: 'radio', global: 's', values: ['lin', 'log'] }], dims: { y: { column: 'v', scale: { type: 'linear' } } } },
        { dims: { y: { scale: "=match(@s, {log: literal({type: 'log'})})" } } },
        { dims: { y: { scale: { nice: true, clamp: "=match(@s, {log: true}, false)" } } } },
    ];
    test('a child\'s object onto a switch of objects is merged into its default, the cases stay whole', () => {
        const merged = mergeAll(switched);
        expect(resolve(merged, names(merged)).dims.y.scale).toEqual({ type: 'linear', nice: true, clamp: false });
        expect(resolve(merged, names(merged, { s: 'log' })).dims.y.scale).toEqual({ type: 'log' });
    });
    test('the expressions of the globals in a part chosen by a switch are resolved', () => {
        const merged = mergeAll([
            { globals: { values: 'abs', unit: 'pj' }, dims: { y: { axis: { format: "=match(@unit, {pj: ',.0f'}, ',.1f')" } } } },
            { dims: { y: { axis: "=match(@values, {share: literal({format: '.0%'})})" } } },
        ]);
        expect(resolve(merged, names(merged)).dims.y.axis).toEqual({ format: ',.0f' });
        expect(resolve(merged, names(merged, { unit: 'twh' })).dims.y.axis).toEqual({ format: ',.1f' });
        expect(resolve(merged, names(merged, { values: 'share' })).dims.y.axis).toEqual({ format: '.0%' });
    });
    test('a match of the categories in the props of a legend is a value, also below a switch', () => {
        const merged = mergeAll([
            { globals: { mode: 'a' }, dims: { land: { column: 'land', legend: { props: { fill: "=match(@land, {W: 'red'}, 'gray')" } } } } },
            { dims: { land: { legend: { props: { fill: "=match(@mode, {b: 'blue'})" } } } } },
        ]);
        const props = resolve(merged, names(merged)).dims.land.legend.props;
        expect(props.fill).toEqual({ match: ['@mode', { b: 'blue' }, { match: ['@land', { W: 'red' }, 'gray'] }] });
        expect(evaluate(props.fill, { mode: 'a', land: 'W' })).toBe('red');
        expect(evaluate(props.fill, { mode: 'b', land: 'W' })).toBe('blue');
    });
});

describe('the entries of controls (review of 5.0)', () => {
    test('a value and an entry without a name have the text of the value as their name and id, also as fields of the selected entry', () => {
        const controls = [{ type: 'radio', global: 'year', values: [{ value: 2024 }, '2025'] }];
        expect(namesOfGlobals({ year: 2024 }, controls)).toMatchObject({ 'year:name': '2024', 'year:id': '2024', 'year:value': 2024 });
        expect(namesOfGlobals({ year: '2025' }, controls)).toMatchObject({ 'year:name': '2025', 'year:id': '2025' });
    });
});
