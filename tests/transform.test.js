import { describe, test, expect, beforeAll } from 'vitest';
import { applyTransforms, loadTransforms, transformColumns, transformGlobals, transformNames } from '@/utils/transform';
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

    test('the columns of the data and the globals of the transforms', () => {
        const transforms = [
            { type: 'year', column: 'date', as: 'year' },
            { type: 'index', column: 'value', as: 'index', by: ['type'], base: { year: '{base}' } },
            { type: 'rolling', column: 'index', size: 2, order: 'date' },
        ];
        expect(transformColumns(transforms)).toEqual(['date', 'value', 'type']);
        expect(transformGlobals(transforms)).toEqual(['base']);
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
            "transform[2].type: unknown transform 'sum', expected one of 'year', 'align', 'index', 'mean', 'share', 'rolling', 'cumulative', 'calc', 'filter', 'rank', 'random', 'lookup', 'bin'",
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
        expect(checks([{ type: 'calc', as: 'c', expr: 1, replace: true }])).toEqual([`transform[0].replace: only of a bin: its rows replace the rows`]);
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
