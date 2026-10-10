import { loadColors } from '@/utils/d3';
import { describe, test, expect, beforeAll } from 'vitest';
import { sameValue, applyFormElements, fillTemplate, formatOf, mergeAll, prepareDef, templateRefs } from '@/utils/def';

// the colors of d3 are loaded by the store, see loadColors
beforeAll(loadColors);

describe('prepareDef', () => {
    test('defaults', () => {
        const def = prepareDef({
            mapping: {
                x: { column: 'a', scale: { orientation: 'horizontal' }, axis: { format: 'c' }, hover: {} },
                c: { column: 'b', props: { common: { r: 3 }, categories: { a: {}, b: { visible: false, name: 'B' } } } },
            },
            plot: { type: 'svg:circle', props: { r: '@r', 'highlight-r': 5 } },
        });
        expect(def.mapping.x.scale).toMatchObject({ type: 'linear', domain: [null, null] });
        expect(def.mapping.c.props).toEqual({ a: { r: 3, name: 'a', visible: true }, b: { r: 3, name: 'B', visible: false } });
        expect(def.plot).toHaveLength(1);
        expect(def.plot[0]).toMatchObject({ id: 'plot-0', categories: [], highlightProps: ['r'] });
        expect(def.options.margins).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    });
});

describe('the props of categories', () => {
    const prepared = props => prepareDef({ mapping: { c: { column: 'c', props } }, plot: [] }).mapping.c;

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
        const symbol = (symbol, props = {}) => prepareDef({ mapping: { c: { column: 'c', legend: { symbol }, props: { categories: { a: props } } } }, plot: [] }).mapping.c.legend.symbol;
        expect(symbol('line')).toEqual({ size: 16, elements: [{ type: 'line', props: { x1: 0, x2: 16, y1: 8, y2: 8, stroke: '@color', 'stroke-width': 2 } }] });
        expect(symbol('line', { 'stroke-width': 3, 'stroke-dasharray': '2 2', opacity: 0.5 }).elements[0].props).toEqual({
            x1: 0, x2: 16, y1: 8, y2: 8, stroke: '@color', 'stroke-width': '@stroke-width', 'stroke-dasharray': '@stroke-dasharray', opacity: '@opacity',
        });
        expect(symbol('rect')).toEqual({ size: 16, elements: [{ type: 'rect', props: { x: 0, y: 0, width: 16, height: 15, rx: 2, fill: '@color' } }] });
        expect(symbol({ type: 'circle', size: 12, props: { stroke: 'white' } })).toEqual({ size: 12, elements: [{ type: 'circle', props: { cx: 6, cy: 6, r: 4, fill: '@color', stroke: 'white' } }] });
        // the svg elements are kept
        const elements = { size: 10, elements: [{ type: 'rect', props: { width: 10 } }] };
        expect(symbol(elements)).toEqual(elements);
    });

    test('the props of the ranks of the categories, the last one of all others', () => {
        const c = prepared({
            categories: { 2023: {}, 2024: {}, 2025: { opacity: 0.9 }, 2026: {} },
            order: 'descending',
            common: { opacity: 0.5, width: 2 },
            ranks: [{ color: 'red', opacity: 1 }, { color: 'orange' }, { color: 'grey', opacity: 0.2 }],
        });
        expect(c.keys).toEqual(['2026', '2025', '2024', '2023']);
        expect(c.keys.map(k => [c.props[k].color, c.props[k].opacity, c.props[k].width])).toEqual([
            ['red', 1, 2], ['orange', 0.9, 2], ['grey', 0.2, 2], ['grey', 0.2, 2],
        ]);
    });

    test('the colors of a scheme in the order of the categories, the given ones are kept', () => {
        const def = prepareDef({ mapping: { c: { column: 'c', props: { scheme: 'Blues', common: { r: 2 }, categories: { a: {}, b: { color: 'red' }, c: {} } } } }, plot: [] });
        expect(def.mapping.c.props).toEqual({
            a: { color: '#deebf7', r: 2, name: 'a', visible: true },
            b: { color: 'red', r: 2, name: 'b', visible: true },
            c: { color: '#3182bd', r: 2, name: 'c', visible: true },
        });
        expect(() => prepareDef({ mapping: { c: { props: { scheme: 'Nope', categories: {} } } }, plot: [] })).toThrow("Unknown scheme 'Nope'");
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

describe('applyFormElements', () => {
    const defOrg = {
        globals: { value: 'a' },
        formElements: [{ ref: 'value', type: 'radio', values: [
            { value: 'a', mapping: { y: { column: 'A' } } },
            { value: 'b', mapping: { y: { column: 'B' } } },
        ] }],
        mapping: { y: { column: 'A', type: 'numeric', scale: { orientation: 'vertical' } } },
        plot: { type: 'cartesian:line', props: {} },
    };

    test('the selected entries patch the mappings', () => {
        const def = prepareDef(JSON.parse(JSON.stringify(defOrg)));
        def.globals.value = 'b';
        expect(applyFormElements(def, defOrg)).toEqual(['y']);
        expect(def.mapping.y).toMatchObject({ column: 'B', type: 'numeric', scale: { type: 'linear' } });
        expect(defOrg.mapping.y.column).toBe('A');
    });

    test('nothing to do without patches', () => {
        expect(applyFormElements({ mapping: {} }, { mapping: {} })).toEqual([]);
    });

    test('columns are filled from the globals of several form elements', () => {
        const org = {
            globals: { values: 'twh', share: '' },
            formElements: [
                { ref: 'values', type: 'radio', values: [{ value: 'twh' }, { value: 'co2' }] },
                { ref: 'share', type: 'radio', values: [
                    { value: '' },
                    { value: '.share', mapping: { y: { axis: { format: '.0%' } } } },
                ] },
            ],
            mapping: { y: { column: '{values}{share}', type: 'numeric', axis: { format: ',.1f' } } },
            plot: { type: 'cartesian:line', props: {} },
        };
        const def = prepareDef(JSON.parse(JSON.stringify(org)));
        expect(applyFormElements(def, org)).toEqual(['y']);
        expect(def.mapping.y).toMatchObject({ column: 'twh', axis: { format: ',.1f' } });
        // the same column, e.g. a form element of other globals
        expect(applyFormElements(def, org)).toEqual([]);

        Object.assign(def.globals, { values: 'co2', share: '.share' });
        expect(applyFormElements(def, org)).toEqual(['y']);
        expect(def.mapping.y).toMatchObject({ column: 'co2.share', axis: { format: '.0%' } });
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

describe('sameValue', () => {
    test('scalars as strings, e.g. years of the data and of a definition', () => {
        expect(sameValue(2024, '2024')).toBe(true);
        expect(sameValue('a', 'a')).toBe(true);
        expect(sameValue(true, 'true')).toBe(true);
        expect(sameValue(1, 2)).toBe(false);
    });

    test('0, the empty string and missing values are different', () => {
        expect(sameValue(0, '')).toBe(false);
        expect(sameValue(0, null)).toBe(false);
        expect(sameValue('', undefined)).toBe(false);
        expect(sameValue(null, undefined)).toBe(true);
    });

    test('lists and objects by their content', () => {
        expect(sameValue(['y'], ['y'])).toBe(true);
        expect(sameValue([], ['y'])).toBe(false);
        expect(sameValue({ a: 1 }, { a: 1 })).toBe(true);
        expect(sameValue(['y'], 'y')).toBe(false);
    });
});
