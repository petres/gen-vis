import { describe, test, expect, beforeAll } from 'vitest';
import { applyTransforms, loadTransforms, transformColumns, transformNames } from '@/utils/transform';
import { transformTypes } from '@/utils/transform-types';
import { usedColumns } from '@/utils/data';
import { validateDef } from '@/utils/validate';
import schema from '../schema.json';

const rows = [
    { date: '2019-01-01', type: 'gas', value: '10' },
    { date: '2019-07-01', type: 'gas', value: '30' },
    { date: '2020-01-01', type: 'gas', value: '40' },
    { date: '2019-01-01', type: 'oil', value: '5' },
    { date: '2020-01-01', type: 'oil', value: '' },
    { date: '2019-07-01', type: 'oil', value: '15' },
];

// the transforms are loaded by the store for definitions with transforms
beforeAll(loadTransforms);

const column = (transforms, name, globals) => applyTransforms(rows, transforms, globals).get(name);

describe('transforms', () => {
    test('the year of a date and the date in another year, without and with a time', () => {
        expect(column({ type: 'year', column: 'date', as: 'year' }, 'year')).toEqual([2019, 2019, 2020, 2019, 2020, 2019]);
        expect(column({ type: 'align', column: 'date', as: 'day' }, 'day')).toEqual(['2020-01-01', '2020-07-01', '2020-01-01', '2020-01-01', '2020-01-01', '2020-07-01']);
        expect(applyTransforms([{ d: '2023-02-28T13:05:00' }, { d: '2024-02-29' }], [{ type: 'align', column: 'd', year: 2024 }]).get('d'))
            .toEqual(['2024-02-28T13:05:00', '2024-02-29']);
    });

    test('the year and the day of dates of a utc scale are the ones of UTC', () => {
        const zone = process.env.TZ;
        try {
            process.env.TZ = 'Europe/Vienna';
            const dates = [{ d: '2023-12-31T23:30:00Z' }, { d: '2024-03-30T23:30:00Z' }, { d: '2024-06-01 13:00' }];
            const transforms = [{ type: 'year', column: 'd', as: 'year' }, { type: 'align', column: 'd', as: 'day' }];
            const local = applyTransforms(dates, transforms);
            expect(local.get('year')).toEqual([2024, 2024, 2024]);
            const utc = applyTransforms(dates, transforms, {}, new Set(['d']));
            expect(utc.get('year')).toEqual([2023, 2024, 2024]);
            expect(utc.get('day')).toEqual(['2020-12-31T23:30:00', '2020-03-30T23:30:00', '2020-06-01T13:00:00']);
        } finally {
            process.env.TZ = zone;
        }
    });

    test('an index of the mean of the base in the groups, a column of a transform before, a global', () => {
        const transforms = [
            { type: 'year', column: 'date', as: 'year' },
            { type: 'index', column: 'value', as: 'index', by: 'type', base: { year: '{base}' } },
        ];
        // the mean of gas in 2019 is 20, of oil 10, a missing value has none
        expect(column(transforms, 'index', { base: 2019 })).toEqual([50, 150, 200, 50, null, 150]);
        // without values of the base none
        expect(column(transforms, 'index', { base: 2020 })).toEqual([25, 75, 100, null, null, null]);
        // a range of dates, a scale
        expect(column({ type: 'index', column: 'value', by: ['type'], base: { date: ['2019-06-01', null] }, scale: 1 }, 'value'))
            .toEqual([10/35, 30/35, 40/35, 5/15, null, 1]);
    });

    test('the transforms are computed again from the first one which a global changes', () => {
        const transforms = [
            { type: 'year', column: 'date', as: 'year' },
            { type: 'index', column: 'value', as: 'index', by: 'type', base: { year: '{base}' } },
            { type: 'cumulative', column: 'index', as: 'sum', by: 'type' },
        ];
        const before = applyTransforms(rows, transforms, { base: 2019 });
        expect(applyTransforms(rows, transforms, { base: 2019 }, new Set(), before)).toBe(before);
        const after = applyTransforms(rows, transforms, { base: 2020 }, new Set(), before);
        expect(after.get('year')).toBe(before.get('year'));
        expect([...after.changed]).toEqual(['index', 'sum']);
        expect(after.get('sum')).toEqual(applyTransforms(rows, transforms, { base: 2020 }).get('sum'));
    });

    test('a calc and a filter are computed again if a global of their expression changes, not of a column', () => {
        const transforms = [
            { type: 'year', column: 'date', as: 'year' },
            { type: 'calc', as: 'w', expr: { '*': ['@value', '@f'] } },
            { type: 'filter', expr: { '>': ['@value', '@min'] } },
            { type: 'calc', as: 'y', expr: { '+': ['@year', 0] } },
        ];
        const before = applyTransforms(rows, transforms, { f: 1, min: 0, year: 1 });
        expect(before.get('w')).toEqual([10, 30, 40, 5, null, 15]);
        // `year` is a column of a transform before, not the global
        expect(applyTransforms(rows, transforms, { f: 1, min: 0, year: 2 }, new Set(), before)).toBe(before);
        const after = applyTransforms(rows, transforms, { f: 10, min: 0, year: 1 }, new Set(), before);
        expect(after.get('year')).toBe(before.get('year'));
        expect(after.get('w')).toEqual([100, 300, 400, 50, null, 150]);
        const filtered = applyTransforms(rows, transforms, { f: 10, min: 20, year: 1 }, new Set(), after);
        expect(filtered.get('w')).toBe(after.get('w'));
        expect(filtered.kept).toEqual([1, 2]);
    });

    test('a rolling mean of large and small values, infinite values are missing', () => {
        const values = v => v.map(value => ({ value: String(value) }));
        expect(applyTransforms(values([1e17, 1, 1, 1]), { type: 'rolling', column: 'value', size: 2 }).get('value').slice(2)).toEqual([1, 1]);
        expect(applyTransforms(values([1, 'Infinity', 3, 4, 5]), { type: 'rolling', column: 'value', size: 2 }).get('value')).toEqual([null, null, 3, 3.5, 4.5]);
        const [zero, mean] = applyTransforms(values([0.1, 0.2, -0.3, 0]), { type: 'rolling', column: 'value', size: 3 }).get('value').slice(2);
        expect(zero).toBeCloseTo(0, 15);
        expect(mean).toBeCloseTo(-1/30, 15);
    });

    test('a rolling mean of many rows and a large window is fast', () => {
        const many = Array.from({ length: 250000 }, (_, i) => ({ v: i % 7 == 0 ? '' : String(i % 100) }));
        const start = performance.now();
        const means = applyTransforms(many, { type: 'rolling', column: 'v', size: 365 }).get('v');
        expect(performance.now() - start).toBeLessThan(1000);
        // the row 365 has a value, 364 not (a multiple of 7)
        const window = many.slice(1, 366).map(r => r.v).filter(v => v !== '').map(Number);
        expect(means[365]).toBeCloseTo(window.reduce((a, b) => a + b, 0)/window.length, 9);
        expect(means[363]).toBeNull();
    });

    test('the share of the sum of the group', () => {
        expect(column({ type: 'share', column: 'value', as: 'share', by: 'date' }, 'share')).toEqual([10/15, 30/45, 1, 5/15, null, 15/45]);
        expect(column({ type: 'share', column: 'value', as: 'share' }, 'share')).toEqual([0.1, 0.3, 0.4, 0.05, null, 0.15]);
    });

    test('a rolling mean and a cumulative sum in the order of a column', () => {
        expect(column({ type: 'rolling', column: 'value', as: 'mean', by: 'type', order: 'date', size: 2 }, 'mean')).toEqual([null, 20, 35, null, null, 10]);
        expect(column({ type: 'rolling', column: 'value', as: 'mean', by: 'type', order: 'date', size: 3, align: 'center' }, 'mean')).toEqual([null, 80/3, null, null, null, 10]);
        expect(column({ type: 'cumulative', column: 'value', as: 'sum', by: 'type', order: 'date' }, 'sum')).toEqual([10, 40, 80, 5, null, 20]);
    });

    test('an unknown transform is an error', () => {
        expect(() => applyTransforms(rows, [{ type: 'nope', column: 'value' }])).toThrow("Unknown transform 'nope'");
    });

    test('the columns of the data of the transforms', () => {
        const transforms = [
            { type: 'year', column: 'date', as: 'year' },
            { type: 'index', column: 'value', as: 'index', by: ['type'], base: { year: '{base}' } },
            { type: 'rolling', column: 'index', size: 2, order: 'date' },
        ];
        expect(transformColumns(transforms)).toEqual(['date', 'value', 'type']);
        expect(usedColumns({ mapping: { y: { column: 'index' } }, transform: transforms })).toEqual(['index', 'date', 'value', 'type']);
    });

    test('calc of the values of columns combined', () => {
        const wide = [{ v: '50', base: '200' }, { v: '3', base: '0' }, { v: '', base: '1' }];
        const calc = expr => applyTransforms(wide, { type: 'calc', expr, as: 'c' }).get('c');
        expect(calc({ '*': [{ '/': ['@v', '@base'] }, 100] })).toEqual([25, null, null]);
        expect(calc({ '-': ['@base', '@v'] })).toEqual([150, -3, null]);
        expect(calc({ '+': ['@v', '@base', '@v'] })).toEqual([300, 6, null]);
        // the least and the largest value, e.g. the ends of a band above or below a mean
        expect(calc({ min: ['@v', '@base'] })).toEqual([50, 0, null]);
        expect(calc({ max: ['@v', '@base'] })).toEqual([200, 3, null]);
    });

    test('mean, of the group, of the base and of at least `min` values', () => {
        // the mean of all rows of a type, the missing value of oil is left out
        expect(column({ type: 'mean', column: 'value', by: 'type', as: 'm' }, 'm')).toEqual([80/3, 80/3, 80/3, 10, 10, 10]);
        // of the dates of a day of the year (the day of align), e.g. the mean of a day of all years
        expect(applyTransforms(rows, [{ type: 'align', column: 'date', as: 'day' }, { type: 'mean', column: 'value', by: 'day', as: 'm' }]).get('m'))
            .toEqual([55/3, 22.5, 55/3, 55/3, 55/3, 22.5]);
        // of the rows of a period, of all rows without groups
        expect(applyTransforms(rows, [{ type: 'year', column: 'date', as: 'year' }, { type: 'mean', column: 'value', base: { year: [2019, 2019] }, as: 'm' }]).get('m'))
            .toEqual(Array(6).fill(15));
        // without the least number of values none
        expect(column({ type: 'mean', column: 'value', by: 'type', min: 3, as: 'm' }, 'm')).toEqual([80/3, 80/3, 80/3, null, null, null]);
        expect(validateDef({ mapping: { y: { column: 'm', type: 'numeric' } }, transform: [
            { type: 'mean', column: 'value', base: [2019], as: 'm' },
            { type: 'share', column: 'value', min: 2, as: 's' },
        ] }).filter(w => w.startsWith('transform'))).toEqual([
            `transform[0].base: the rows of the mean, e.g. { "year": [1961, 1990] }`,
            'transform[1].min: the least number of values of a mean, e.g. 22',
        ]);
    });

    test('rank, the same values have the same rank', () => {
        const values = [{ g: 'a', v: '3' }, { g: 'a', v: '1' }, { g: 'a', v: '3' }, { g: 'a', v: '' }, { g: 'b', v: '7' }, { g: 'a', v: '0' }];
        expect(applyTransforms(values, { type: 'rank', column: 'v', by: 'g', as: 'r' }).get('r')).toEqual([3, 2, 3, null, 1, 1]);
        expect(applyTransforms(values, { type: 'rank', column: 'v', by: 'g', descending: true, as: 'r' }).get('r')).toEqual([1, 3, 1, null, 1, 4]);
    });

    test('lookup, the value of the row of a file of the key', () => {
        const countries = [{ code: 'AT', name_de: 'Österreich', name_en: 'Austria' }, { code: 'SE', name_de: 'Schweden', name_en: 'Sweden' }];
        const files = new Map([['countries.json', countries]]);
        const data = [{ c: 'SE' }, { c: 'AT' }, { c: 'XX' }, { c: '' }];
        const lookup = { type: 'lookup', column: 'c', data: 'countries.json', key: 'code', value: 'name_{lang}', as: 'name' };
        expect(applyTransforms(data, lookup, { lang: 'en' }, new Set(), null, files).get('name')).toEqual(['Sweden', 'Austria', null, null]);
        expect(applyTransforms(data, lookup, { lang: 'de' }, new Set(), null, files).get('name')).toEqual(['Schweden', 'Österreich', null, null]);
        expect(() => applyTransforms(data, lookup, { lang: 'de' })).toThrow("lookup: the rows of 'countries.json' are not loaded");
    });

    test('the checks of validateDef and the schema', () => {
        const def = {
            mapping: { y: { column: 'index', type: 'numeric' } },
            plot: { type: 'svg:rect', props: { y: '@y' } },
            transform: [{ type: 'index', column: 'value', base: { year: '{base}' } }, { type: 'rolling', column: 'value', align: 'left' }, { type: 'sum' }],
        };
        expect(validateDef(def)).toEqual([
            "transform[0]: unknown global 'base' in the template",
            "transform[1].size: the number of the rows of the window is needed, e.g. 7",
            "transform[1].align: expected 'end' or 'center'",
            "transform[2].type: unknown transform 'sum', expected one of 'year', 'align', 'format', 'index', 'mean', 'share', 'rolling', 'cumulative', 'calc', 'filter', 'rank', 'random', 'lookup', 'bin', 'fold', 'aggregate', 'window', 'regression'",
            "transform[2].column: the column of the values is needed",
        ]);
        expect(schema.definitions.transform.properties.type.enum).toEqual(Object.keys(transformTypes));
        expect(transformNames).toEqual(Object.keys(transformTypes));
    });
});

describe('rolling, rows without a value', () => {
    test('have no mean, as no cumulative sum', () => {
        const values = [{ v: '' }, { v: '15' }, { v: 'NA' }, { v: '20' }];
        expect(applyTransforms(values, { type: 'rolling', column: 'v', size: 2 }).get('v')).toEqual([null, 15, null, 20]);
        expect(applyTransforms(values, { type: 'rolling', column: 'v', size: 3, align: 'center' }).get('v')).toEqual([null, 15, null, null]);
        expect(applyTransforms(values, { type: 'cumulative', column: 'v' }).get('v')).toEqual([null, 15, null, 35]);
    });

    test('texts which are no decimal numbers are missing, e.g. hexadecimal ones', () => {
        const values = [{ v: '0x10' }, { v: ' 2 ' }, { v: '1e1' }];
        expect(applyTransforms(values, { type: 'cumulative', column: 'v' }).get('v')).toEqual([null, 2, 12]);
    });
});

describe('bin and random in a chart', () => {
    const data = 'v,g\n1,a\n3,a\n7,b\n9,b';
    const def = () => ({
        globals: { step: '5' },
        transform: [
            { type: 'random', as: 'jitter', seed: 1 },
            { type: 'bin', column: 'v', step: '{step}', start: 'lo', end: 'hi' },
        ],
        mapping: {
            x: { column: 'v', type: 'numeric', scale: { orientation: 'horizontal' } },
            lo: { column: 'lo', type: 'numeric', scale: { of: 'x' } },
            hi: { column: 'hi', type: 'numeric', scale: { of: 'x' } },
            y: { column: 'count', type: 'numeric', scale: { orientation: 'vertical', domain: [0, null] } },
            g: { column: 'g', type: 'categorical', fromData: true, legend: {} },
            jitter: { column: 'jitter', type: 'numeric' },
        },
        plot: [
            { type: 'bar', props: { x0: '@lo:scaled', x1: '@hi:scaled', y1: '@y:scaled' } },
            { type: 'point', by: 'g', props: { cy: '@jitter' } },
        ],
    });

    test('the rows of the classes after the rows, again of another global, the numbers of the rows stay', async () => {
        const { createStore } = await import('@/store');
        const store = createStore();
        await store.init({ def: def(), data });
        const classes = () => store.data.filter(r => r.y !== null).map(r => [r.lo, r.hi, r.y]);
        const jitter = () => store.data.filter(r => r.jitter !== null).map(r => r.jitter);
        expect(store.data).toHaveLength(6);
        expect(classes()).toEqual([[0, 5, 2], [5, 10, 2]]);
        const before = jitter();
        // other edges: other rows of the classes, the chart's rows are new
        store.setGlobals({ step: '2' });
        expect(classes()).toEqual([[0, 2, 1], [2, 4, 1], [4, 6, 0], [6, 8, 1], [8, 10, 1]]);
        expect(store.data).toHaveLength(9);
        expect(jitter()).toEqual(before);
        // a hidden category does not change the numbers
        store.def.mapping.g.categoryProps.a.visible = false;
        expect(jitter()).toEqual(before);
    });

    test('replaced rows of groups after a filter, a calc after them, other edges of a global', async () => {
        const { createStore } = await import('@/store');
        const store = createStore();
        await store.init({ def: { ...def(), transform: [
            { type: 'filter', expr: { '>': ['@v', 1] } },
            { type: 'bin', column: 'v', step: '{step}', by: 'g', start: 'lo', end: 'hi', replace: true },
            { type: 'calc', as: 'density', expr: { '/': ['@count', { '-': ['@hi', '@lo'] }] } },
        ], mapping: { ...def().mapping, y: { column: 'density', type: 'numeric', scale: { orientation: 'vertical' } }, jitter: undefined } }, data });
        // the classes with values, the empty ones are rows of 0
        const classes = () => store.data.filter(r => r.y > 0).map(r => [r.g, r.lo, r.hi, r.y]);
        expect(classes()).toEqual([['a', 0, 5, 0.2], ['b', 5, 10, 0.4]]);
        expect(store.data).toHaveLength(4);
        store.setGlobals({ step: '2' });
        expect(classes()).toEqual([['a', 2, 4, 0.5], ['b', 6, 8, 0.5], ['b', 8, 10, 0.5]]);
        expect(store.data).toHaveLength(8);
        expect(store.def.mapping.g.keys).toEqual(['a', 'b']);
    });

    // the values of a form element are the ones of the transforms of the globals of the definition
    test('the values of a form element of a column of a bin follow other edges', async () => {
        const { createStore } = await import('@/store');
        const store = createStore();
        await store.init({ def: { ...def(), formElements: [{ id: 'lo', ref: 'lo', type: 'select', values: { column: 'lo' } }] }, data });
        expect(store.def.formElements[0].values.map(v => v.value)).toEqual(['0', '5']);
        store.setGlobals({ step: '2' });
        expect(store.def.formElements[0].values.map(v => v.value)).toEqual(['0', '2', '4', '6', '8']);
        // also of a global of the page when the chart is loaded
        const page = createStore();
        await page.init({ def: { ...def(), formElements: [{ id: 'lo', ref: 'lo', type: 'select', values: { column: 'lo' } }] }, data, globals: { step: '2' } });
        expect(page.def.formElements[0].values.map(v => v.value)).toEqual(['0', '2', '4', '6', '8']);
    });

    test('the rows of a bin: replaced, with later calc and share, after a filter, without values', () => {
        const source = [{ v: '1', g: 'a', y: '2020' }, { v: '3', g: 'a', y: '2021' }, { v: '7', g: 'b', y: '2020' }, { v: '', g: 'b', y: '2021' }, { v: '12', g: 'b', y: '2020' }];
        // the rows after the transforms with the columns of the transforms, of the filters
        const rowsOf = transforms => {
            const c = applyTransforms(source, transforms);
            const base = c.rows ?? source;
            const all = base.map((r, i) => ({ ...r, ...Object.fromEntries([...c].map(([k, v]) => [k, v[i]])) }));
            return { rows: c.kept ? c.kept.map(i => all[i]) : all, notes: c.notes };
        };
        const replaced = rowsOf([{ type: 'bin', column: 'v', edges: [0, 5, 10], by: 'g', replace: true },
            { type: 'calc', as: 'd', expr: { '*': ['@count', 2] } }, { type: 'share', column: 'count', by: 'g', as: 's' }]);
        expect(replaced.rows).toEqual([
            { g: 'a', start: 0, end: 5, count: 2, d: 4, s: 1 }, { g: 'a', start: 5, end: 10, count: 0, d: 0, s: 0 },
            { g: 'b', start: 0, end: 5, count: 0, d: 0, s: 0 }, { g: 'b', start: 5, end: 10, count: 1, d: 2, s: 1 }]);
        expect(replaced.notes).toEqual([`transform[0] (bin): 1 values of 'v' outside the edges 0 to 10 are left out`]);
        // the rows of a filter before are kept, the classes after them, of their values
        const filtered = rowsOf([{ type: 'filter', expr: { '==': ['@y', '2020'] } }, { type: 'bin', column: 'v', edges: [0, 5, 15] },
            { type: 'calc', as: 'd', expr: { '*': ['@count', 2] } }]);
        expect(filtered.rows.map(r => r.v ?? [r.start, r.end, r.count, r.d])).toEqual(['1', '7', '12', [0, 5, 1, 2], [5, 15, 2, 4]]);
        // no values: empty classes of all rows, none of groups
        expect(rowsOf([{ type: 'bin', column: 'none', edges: [0, 5], replace: true }]).rows).toEqual([{ start: 0, end: 5, count: 0 }]);
        expect(rowsOf([{ type: 'bin', column: 'none', edges: [0, 5], by: 'g', replace: true }]).rows).toEqual([]);
        expect(rowsOf([{ type: 'bin', column: 'none', step: 5, replace: true }]).rows).toEqual([]);
        // fewer than two edges are no classes, named in a note
        const one = rowsOf([{ type: 'bin', column: 'v', edges: [5, '5'], replace: true }]);
        expect(one.rows).toEqual([]);
        expect(one.notes).toEqual([`transform[0] (bin): the edges [5,"5"] are no classes, at least two different ones are needed`]);
    });

    test('validateDef: the edges of a bin, the name of a random number', () => {
        const checks = transform => validateDef({ ...def(), transform }).filter(w => w.startsWith('transform'));
        expect(checks([{ type: 'bin', column: 'v' }])).toEqual([`transform[0].edges: the edges of the classes are needed, e.g. [{ "from": 50, "to": 250, "step": 5 }, 143], or a 'step'`]);
        expect(checks([{ type: 'random' }])).toEqual([`transform[0].as: the name of the new column is needed, e.g. "jitter"`]);
        expect(checks([{ type: 'calc', as: 'c', expr: 1, replace: true }])).toEqual([`transform[0].replace: only of a bin or a fold: its rows replace the rows`]);
        expect(checks(def().transform)).toEqual([]);
    });

    test('the edges of a step of many values, more than the arguments of a function call', () => {
        const many = Array.from({ length: 300000 }, (_, i) => ({ v: String(i % 1000) }));
        const result = applyTransforms(many, { type: 'bin', column: 'v', step: 250, replace: true });
        expect(result.rows.map(r => [r.start, r.end, r.count])).toEqual([[0, 250, 75000], [250, 500, 75000], [500, 750, 75000], [750, 1000, 75000]]);
    });

    test('the columns of the data the transforms use, not their own ones', () => {
        expect(transformColumns([{ type: 'bin', column: 'v', by: 'g', weight: 'w' }, { type: 'calc', as: 'd', expr: { '/': ['@count', '@end'] } }]))
            .toEqual(['v', 'g', 'w']);
        expect(transformColumns([{ type: 'random', as: 'r', key: 'id' }])).toEqual(['id']);
    });
});

describe('fold, aggregate and window', () => {
    // the rows after the transforms with the columns of the transforms, of the filters
    const rowsOf = (source, transforms, globals) => {
        const c = applyTransforms(source, transforms, globals);
        const base = c.rows ?? source;
        const all = base.map((r, i) => ({ ...r, ...Object.fromEntries([...c].map(([k, v]) => [k, v[i]])) }));
        return c.kept ? c.kept.map(i => all[i]) : all;
    };

    test('fold: a row per row and column, the key and the value, a pattern of the globals, the rows replaced or appended', () => {
        const wide = [{ id: 'a', v_2019: '1', v_2020: '2' }, { id: 'b', v_2019: '', v_2020: '4' }];
        expect(rowsOf(wide, { type: 'fold', columns: ['v_2019', 'v_2020'], key: 'year' })).toEqual([
            { id: 'a', year: 'v_2019', value: '1' }, { id: 'a', year: 'v_2020', value: '2' }, { id: 'b', year: 'v_2019', value: '' }, { id: 'b', year: 'v_2020', value: '4' }]);
        expect(rowsOf(wide, { type: 'fold', columns: '{prefix}*' }, { prefix: 'v_' }).map(r => [r.key, r.value]))
            .toEqual([['v_2019', '1'], ['v_2020', '2'], ['v_2019', ''], ['v_2020', '4']]);
        // appended: the indexes of the rows of a random number after them
        const appended = applyTransforms(wide, [{ type: 'fold', columns: 'v_*', replace: false }, { type: 'random', as: 'r' }]);
        expect(appended.rows).toHaveLength(6);
        expect(appended.get('r')).toEqual(applyTransforms(wide, [{ type: 'random', as: 'r' }]).get('r').concat(appended.get('r').slice(2)));
        expect(() => applyTransforms(wide, { type: 'fold' })).toThrow("fold: the 'columns' to fold are needed");
    });

    test('aggregate: a column of the group or a row per group', () => {
        expect(column({ type: 'aggregate', column: 'value', by: 'type', op: 'sum', as: 'total' }, 'total')).toEqual([80, 80, 80, 20, 20, 20]);
        expect(column({ type: 'aggregate', column: 'value', by: 'type', op: 'last', order: 'date', as: 'last' }, 'last')).toEqual([40, 40, 40, 15, 15, 15]);
        expect(column({ type: 'aggregate', column: 'value', op: 'median', as: 'm' }, 'm')).toEqual([15, 15, 15, 15, 15, 15]);
        expect(rowsOf(rows, { type: 'aggregate', column: 'value', by: 'type', op: 'count', as: 'n', rows: true })).toEqual([{ type: 'gas', n: 3 }, { type: 'oil', n: 2 }]);
        expect(rowsOf(rows, [{ type: 'filter', expr: { '==': ['@type', 'oil'] } }, { type: 'aggregate', column: 'value', op: 'mean', rows: true }]))
            .toEqual([{ value: 10 }]);
        expect(() => applyTransforms(rows, { type: 'aggregate', column: 'value', op: 'total' })).toThrow('aggregate: the op is one of');
    });

    test('aggregate: quartiles and quantiles, as the median, also of rows (a box plot) and of a window', () => {
        // gas 10, 30, 40; oil 5, 15
        expect(column({ type: 'aggregate', column: 'value', by: 'type', op: 'q1', as: 'q' }, 'q')).toEqual([20, 20, 20, 7.5, 7.5, 7.5]);
        expect(column({ type: 'aggregate', column: 'value', by: 'type', op: 'q3', as: 'q' }, 'q')).toEqual([35, 35, 35, 12.5, 12.5, 12.5]);
        expect(column({ type: 'aggregate', column: 'value', by: 'type', op: 'quantile', p: 0.5, as: 'q' }, 'q'))
            .toEqual(column({ type: 'aggregate', column: 'value', by: 'type', op: 'median', as: 'q' }, 'q'));
        expect(column({ type: 'aggregate', column: 'value', op: 'quantile', p: '{p}', as: 'q' }, 'q', { p: '1' })).toEqual([40, 40, 40, 40, 40, 40]);
        expect(rowsOf(rows, { type: 'aggregate', column: 'value', by: 'type', op: 'q3', as: 'hi', rows: true })).toEqual([{ type: 'gas', hi: 35 }, { type: 'oil', hi: 12.5 }]);
        expect(() => applyTransforms(rows, { type: 'aggregate', column: 'value', op: 'quantile' })).toThrow("aggregate: the quantile needs 'p'");
        // several ops, a column of each, named by the op or by `as`, also of rows
        const several = applyTransforms(rows, { type: 'aggregate', column: 'value', by: 'type', op: ['q1', 'median', 'q3'] });
        expect([...several.keys()]).toEqual(['q1', 'median', 'q3']);
        expect(several.get('q1')).toEqual(column({ type: 'aggregate', column: 'value', by: 'type', op: 'q1', as: 'q' }, 'q'));
        expect(several.get('q3')).toEqual([35, 35, 35, 12.5, 12.5, 12.5]);
        expect(column({ type: 'aggregate', column: 'value', by: 'type', op: ['min', 'max'], as: ['lo', 'hi'] }, 'hi')).toEqual([40, 40, 40, 15, 15, 15]);
        expect(rowsOf(rows, { type: 'aggregate', column: 'value', by: 'type', op: ['min', 'max', 'count'], as: ['lo', 'hi', 'n'], rows: true }))
            .toEqual([{ type: 'gas', lo: 10, hi: 40, n: 3 }, { type: 'oil', lo: 5, hi: 15, n: 2 }]);
        // a later transform reads them, a change of the ops computes them again
        const before = applyTransforms(rows, [{ type: 'aggregate', column: 'value', op: ['min', 'max'], as: ['lo', 'hi'] }, { type: 'calc', as: 'range', expr: { '-': ['@hi', '@lo'] } }]);
        expect(before.get('range')).toEqual([35, 35, 35, 35, 35, 35]);
        const after = applyTransforms(rows, [{ type: 'aggregate', column: 'value', op: ['min', 'mean'], as: ['lo', 'hi'] }, { type: 'calc', as: 'range', expr: { '-': ['@hi', '@lo'] } }], {}, new Set(), before);
        expect(after.get('range')).toEqual([15, 15, 15, 15, 15, 15]);
        expect([...after.changed].sort()).toEqual(['hi', 'lo', 'range']);
        expect(() => applyTransforms(rows, { type: 'aggregate', column: 'value', op: ['min', 'max'], as: 'x' })).toThrow("aggregate: 'as' is a list");
        expect(() => applyTransforms(rows, { type: 'aggregate', column: 'value', op: ['min', 'max'], as: ['x', 'x'] })).toThrow('named alike');
        expect(() => applyTransforms(rows, { type: 'aggregate', column: 'value', op: [] })).toThrow('aggregate: the op is one of');
        // a rolling median of 3 rows, only of whole windows
        expect(column({ type: 'window', column: 'value', by: 'type', order: 'date', op: 'median', size: 3, align: 'center', as: 'm' }, 'm')).toEqual([null, 30, null, null, null, 10]);
        expect(() => applyTransforms(rows, { type: 'window', column: 'value', op: 'quantile', size: 2, p: -1 })).toThrow("window: the quantile needs 'p'");
    });

    test('window: lag, lead, diff and pct in the order of a column, sums and extremes of a window as rolling', () => {
        expect(column({ type: 'window', column: 'value', by: 'type', order: 'date', op: 'lag', as: 'prev' }, 'prev')).toEqual([null, 10, 30, null, 15, 5]);
        expect(column({ type: 'window', column: 'value', by: 'type', order: 'date', op: 'lead', as: 'next' }, 'next')).toEqual([30, 40, null, 15, null, null]);
        expect(column({ type: 'window', column: 'value', by: 'type', order: 'date', op: 'diff', as: 'd' }, 'd')).toEqual([null, 20, 10, null, null, 10]);
        expect(column({ type: 'window', column: 'value', by: 'type', order: 'date', op: 'pct', as: 'p' }, 'p')).toEqual([null, 200, (40/30 - 1)*100, null, null, 200]);
        expect(column({ type: 'window', column: 'value', by: 'type', order: 'date', op: 'sum', size: 2, as: 's' }, 's')).toEqual([null, 40, 70, null, null, 20]);
        expect(column({ type: 'window', column: 'value', by: 'type', order: 'date', op: 'mean', size: 2, as: 'm' }, 'm'))
            .toEqual(column({ type: 'rolling', column: 'value', by: 'type', order: 'date', size: 2, as: 'm' }, 'm'));
        expect(column({ type: 'window', column: 'value', by: 'type', order: 'date', op: 'max', size: 3, align: 'center', as: 'x' }, 'x')).toEqual([null, 40, null, null, null, 15]);
        expect(() => applyTransforms(rows, { type: 'window', column: 'value', op: 'cumsum' })).toThrow('window: the op is one of');
    });

    test('validateDef: the columns of a fold, the op of an aggregate and a window, the size and the offset, the keys of other types', () => {
        const checks = (transform, globals = {}, rows = null) => validateDef({ mapping: { y: { column: 'value', type: 'numeric' } }, plot: { type: 'svg:rect', props: {} }, transform, globals }, rows).filter(w => w.startsWith('transform'));
        expect(checks([{ type: 'fold' }])).toEqual([`transform[0].columns: the columns to fold are needed, a list or a pattern with a '*', e.g. ["2019", "2020"] or "20*"`]);
        expect(checks([{ type: 'fold', columns: '*_*' }])).toEqual([`transform[0].columns: a pattern of columns has a single '*', e.g. "20*"`]);
        expect(checks([{ type: 'fold', columns: '20*', key: 'year', value: 'v', replace: false }])).toEqual([]);
        // the key and the value replace the columns of the same names which are not folded
        expect(checks([{ type: 'fold', columns: '20*', key: 'v', value: 'v' }])).toEqual([`transform[0].value: the column of the values is the one of the keys, 'v', e.g. "key": "year", "value": "value"`]);
        const wide = [{ id: 'a', key: 'x', 2019: 1, 2020: 2 }];
        expect(checks([{ type: 'fold', columns: '20*' }], {}, wide)).toEqual([`transform[0].key: the column 'key' of the rows is replaced by the keys of the folded columns, e.g. "key": "name"`]);
        expect(checks([{ type: 'fold', columns: ['2019', '2020'], key: 'year', value: 'id' }], {}, wide)).toEqual([`transform[0].value: the column 'id' of the rows is replaced by the values of the folded columns, e.g. "value": "amount"`]);
        expect(checks([{ type: 'fold', columns: ['key', '2019'] }], {}, wide)).toEqual([]);
        const aggregates = `'sum', 'mean', 'min', 'max', 'count', 'median', 'q1', 'q3', 'quantile', 'first', 'last'`;
        expect(checks([{ type: 'aggregate', column: 'value' }])).toEqual([`transform[0].op: the operation is needed, one of ${aggregates}`]);
        expect(checks([{ type: 'aggregate', column: 'value', op: 'lag', rows: true }])).toEqual([`transform[0].op: unknown op 'lag', expected one of ${aggregates}`]);
        // several ops, a name of each
        expect(checks([{ type: 'aggregate', column: 'value', op: ['q1', 'median', 'q3'] }, { type: 'calc', as: 'iqr', expr: '=@q3 - @q1' }])).toEqual([]);
        expect(checks([{ type: 'aggregate', column: 'value', op: ['min', 'lag'] }])).toEqual([`transform[0].op: unknown op 'lag', expected one of ${aggregates}`]);
        expect(checks([{ type: 'aggregate', column: 'value', op: ['min', 'max'], as: ['lo'] }])).toEqual([`transform[0].as: a name per op, 2 names, e.g. "op": ["min", "max"], "as": ["lo", "hi"]`]);
        expect(checks([{ type: 'aggregate', column: 'value', op: ['min', 'max'], as: 'lo' }])).toEqual([`transform[0].as: a name per op, 2 names, e.g. "op": ["min", "max"], "as": ["lo", "hi"]`]);
        expect(checks([{ type: 'aggregate', column: 'value', op: 'min', as: ['lo'] }])).toEqual([`transform[0].as: a list of names is the one of a list of ops, e.g. "op": ["min", "max"], "as": ["lo", "hi"]`]);
        expect(checks([{ type: 'aggregate', column: 'value', op: ['min', 'min'] }])).toEqual([`transform[0].as: the columns of the ops are named alike, a name per op is needed, e.g. "op": ["min", "max"], "as": ["lo", "hi"]`]);
        // the probability of a quantile, only of a quantile
        expect(checks([{ type: 'aggregate', column: 'value', op: 'quantile' }])).toEqual([`transform[0].p: the probability of the quantile is needed, a number from 0 to 1, e.g. 0.9`]);
        expect(checks([{ type: 'aggregate', column: 'value', op: 'quantile', p: 2 }])).toEqual([`transform[0].p: the probability of the quantile is needed, a number from 0 to 1, e.g. 0.9`]);
        expect(checks([{ type: 'aggregate', column: 'value', op: 'median', p: 0.9 }])).toEqual([`transform[0].p: only of the op 'quantile', e.g. "op": "quantile", "p": 0.9`]);
        expect(checks([{ type: 'aggregate', column: 'value', op: 'quantile', p: 0.9 }, { type: 'window', column: 'value', op: 'quantile', p: '{p}', size: 5, as: 'w' }], { p: '0.1' })).toEqual([]);
        expect(checks([{ type: 'window', column: 'value', op: 'median' }])).toEqual([`transform[0].size: the number of the rows of the window is needed, e.g. 7`]);
        expect(checks([{ type: 'share', column: 'value', p: 0.5 }])).toEqual([`transform[0].p: only of a transform of the type 'aggregate' or 'window'`]);
        expect(checks([{ type: 'aggregate', column: 'value', op: '{op}' }])).toEqual([`transform[0]: unknown global 'op' in the template`]);
        expect(checks([{ type: 'window', column: 'value', op: 'sum' }])).toEqual([`transform[0].size: the number of the rows of the window is needed, e.g. 7`]);
        expect(checks([{ type: 'window', column: 'value', op: 'lag', offset: 0 }])).toEqual([`transform[0].offset: the number of the rows before or after the row, a positive integer, e.g. 1`]);
        expect(checks([{ type: 'window', column: 'value', op: 'lag', offset: 2 }])).toEqual([]);
        expect(checks([{ type: 'share', column: 'value', op: 'sum', rows: true, offset: 1, columns: ['a'] }])).toEqual([
            `transform[0].op: only of a transform of the type 'aggregate' or 'window'`,
            `transform[0].rows: only of a transform of the type 'aggregate'`,
            `transform[0].offset: only of a transform of the type 'window'`,
            `transform[0].columns: only of a transform of the type 'fold'`,
        ]);
        // the keys the type does not read, e.g. a by of a calc, an order of a share
        expect(checks([{ type: 'calc', as: 'c', expr: 1, by: 'g' }, { type: 'share', column: 'value', order: 'date' }])).toEqual([
            `transform[0].by: only of a transform of the type 'index', 'mean', 'share', 'rolling', 'cumulative', 'rank', 'bin', 'aggregate', 'window' or 'regression'`,
            `transform[1].order: only of a transform of the type 'rolling', 'cumulative', 'aggregate' or 'window'`,
        ]);
        // templates of the globals are values of their type
        expect(checks([{ type: 'window', column: 'value', op: '{op}', offset: '{k}', size: '{k}' }], { op: 'diff', k: '1' })).toEqual([]);
    });

    test('regression: the fitted values per group, validateDef of its x, as, method and degree', () => {
        const checks = transform => validateDef({ mapping: { y: { column: 'value', type: 'numeric' } }, plot: { type: 'svg:rect', props: {} }, transform }).filter(w => w.startsWith('transform'));
        // gas 10, 30, 40 at 2019-01-01, 2019-07-01, 2020-01-01: the dates are milliseconds
        const fit = column({ type: 'regression', column: 'value', x: 'date', by: 'type', as: 'fit' }, 'fit');
        expect(fit.slice(0, 3).map(v => Math.round(v*100)/100)).toEqual([11.72, 26.58, 41.69]);
        // oil: two values, the line through them, also at the date without a value
        expect(fit.slice(3).map(v => Math.round(v*100)/100)).toEqual([5, 25.17, 15]);
        expect(checks([{ type: 'regression', column: 'value' }])).toEqual([
            `transform[0].x: the column of the x values is needed, e.g. "x": "gdp"`,
            `transform[0].as: the name of the column of the fitted values is needed, e.g. "trend"`,
        ]);
        expect(checks([{ type: 'regression', column: 'value', x: 'date', as: 'f', method: 'lin', degree: 2 }])).toEqual([
            `transform[0].method: unknown method 'lin', expected one of 'linear', 'log', 'exp', 'poly'`,
            `transform[0].degree: only of the method 'poly', e.g. "method": "poly", "degree": 2`,
        ]);
        expect(checks([{ type: 'regression', column: 'value', x: 'date', as: 'f', method: 'poly', degree: 4 }])).toEqual([`transform[0].degree: the degree of the polynomial, 2 or 3`]);
        expect(checks([{ type: 'regression', column: 'value', x: 'date', as: 'f', method: 'poly', degree: 3 }])).toEqual([]);
        expect(transformColumns([{ type: 'regression', column: 'value', x: 'date', by: 'type', as: 'f' }])).toEqual(['value', 'type', 'date']);
    });

    test('format: the text of a date in a time format, validateDef of its format', () => {
        expect(column({ type: 'format', column: 'date', format: '%W-%u', as: 'w' }, 'w')).toEqual(['00-2', '26-1', '00-3', '00-2', '00-3', '26-1']);
        const checks = transform => validateDef({ mapping: { y: { column: 'value', type: 'numeric' } }, plot: { type: 'svg:rect', props: {} }, transform }).filter(w => w.startsWith('transform'));
        expect(checks([{ type: 'format', column: 'date', as: 'w' }])).toEqual([`transform[0].format: the time format is needed, e.g. "%W" (the week of the year) or "%u" (the weekday)`]);
        expect(checks([{ type: 'format', column: 'date', as: 'w', format: '%W' }])).toEqual([]);
    });

    test('the columns of the data: the folded ones, unknown of a pattern', () => {
        expect(transformColumns([{ type: 'fold', columns: ['a', 'b'], key: 'k', value: 'v' }, { type: 'calc', as: 'c', expr: { '+': ['@value', '@k', '@v'] } }])).toEqual(['a', 'b', 'value']);
        expect(transformColumns([{ type: 'fold', columns: 'v_*' }])).toBeNull();
        expect(usedColumns({ mapping: { y: { column: 'value' } }, transform: { type: 'fold', columns: 'v_*' } })).toBeNull();
        expect(transformColumns([{ type: 'aggregate', column: 'v', by: 'g', order: 'd', op: 'sum', rows: true }, { type: 'window', column: 'v', op: 'lag', order: 'd' }])).toEqual(['v', 'g', 'd']);
    });
});

describe('fold, aggregate and window: rows of JSON, collisions, values', () => {
    const run = (rows, t) => applyTransforms(rows, t, {});

    test('a fold of a pattern reads the columns of all rows, not of the first one', () => {
        const c = run([{ id: 'a', 2019: 1 }, { id: 'b', 2019: 2, 2020: 3 }], { type: 'fold', columns: '20*' });
        expect(c.rows).toEqual([
            { id: 'a', key: '2019', value: 1 }, { id: 'a', key: '2020', value: null },
            { id: 'b', key: '2019', value: 2 }, { id: 'b', key: '2020', value: 3 },
        ]);
        // the other columns too, e.g. one only of a later row
        expect(run([{ id: 'a', 2019: 1 }, { id: 'b', 2019: 2, region: 'x' }], { type: 'fold', columns: ['2019'] }).rows)
            .toEqual([{ id: 'a', region: null, key: '2019', value: 1 }, { id: 'b', region: 'x', key: '2019', value: 2 }]);
    });

    test('a fold or an aggregate which replaces a column of the rows says so', () => {
        const fold = run([{ value: 'keep', a: 1, b: 2 }], { type: 'fold', columns: ['a', 'b'] });
        expect(fold.notes).toEqual([`transform[0] (fold): the column 'value' of the rows is replaced by the value of the fold, see 'key' and 'value'`]);
        expect(run([{ a: 1, b: 2 }], { type: 'fold', columns: ['a', 'b'], key: 'k', value: 'k' }).notes)
            .toEqual([`transform[0] (fold): the key and the value have the same name 'k', the value replaces the key`]);
        const aggregate = run([{ g: 'a', v: 1 }, { g: 'a', v: 2 }], { type: 'aggregate', column: 'v', by: 'g', op: 'sum', as: 'g', rows: true });
        expect(aggregate.notes).toEqual([`transform[0] (aggregate): the aggregate 'g' replaces the column 'g' of 'by', see 'as'`]);
        expect(run([{ a: 1, b: 2 }], { type: 'fold', columns: ['a', 'b'] }).notes).toEqual([]);
    });

    test('an aggregate without a known op is an error, also of no rows', () => {
        expect(() => run([{ g: 'a', v: '' }], { type: 'aggregate', column: 'v', by: 'g' })).toThrow(/the op is one of/);
        expect(() => run([], { type: 'aggregate', column: 'v', by: 'g', rows: true })).toThrow(/the op is one of/);
    });

    test('lag and lead of texts and dates are the values, numbers of numbers', () => {
        expect(run([{ v: 'a' }, { v: 'b' }], { type: 'window', column: 'v', op: 'lag', as: 'p' }).get('p')).toEqual([null, 'a']);
        expect(run([{ v: '2020-01-01' }, { v: '2020-02-01' }], { type: 'window', column: 'v', op: 'lead', as: 'p' }).get('p')).toEqual(['2020-02-01', null]);
        expect(run([{ v: '1' }, { v: '' }, { v: 3 }], { type: 'window', column: 'v', op: 'lag', as: 'p' }).get('p')).toEqual([null, 1, null]);
    });
});

describe('names of the prototype of objects are no columns (review of 5.0)', () => {
    test('a filter and a calc of "constructor" or "__proto__" have no value', () => {
        const data = [{ v: 1 }, { v: 2 }];
        expect(applyTransforms(data, [{ type: 'filter', expr: '@constructor' }]).kept).toEqual([]);
        expect(applyTransforms(data, [{ type: 'filter', expr: '@__proto__' }]).kept).toEqual([]);
        expect(applyTransforms(data, [{ type: 'calc', expr: '@toString', as: 'out' }]).get('out')).toEqual([null, null]);
        expect(applyTransforms([{ constructor: 'a' }, { constructor: 'b' }], [{ type: 'calc', expr: '@constructor', as: 'out' }]).get('out')).toEqual(['a', 'b']);
    });
});
