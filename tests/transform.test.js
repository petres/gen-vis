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

    test('a rolling mean of large and small values, infinite values are missing', () => {
        const values = v => v.map(value => ({ value: String(value) }));
        expect(applyTransforms(values([1e17, 1, 1, 1]), { type: 'rolling', column: 'value', size: 2 }).get('value').slice(2)).toEqual([1, 1]);
        expect(applyTransforms(values([1, 'Infinity', 3, 4, 5]), { type: 'rolling', column: 'value', size: 2 }).get('value')).toEqual([null, 1, 3, 3.5, 4.5]);
        const [zero, mean] = applyTransforms(values([0.1, 0.2, -0.3, 0]), { type: 'rolling', column: 'value', size: 3 }).get('value').slice(2);
        expect(zero).toBeCloseTo(0, 15);
        expect(mean).toBeCloseTo(-1/30, 15);
    });

    test('a rolling mean of many rows and a large window is fast', () => {
        const many = Array.from({ length: 250000 }, (_, i) => ({ v: i % 7 == 0 ? '' : String(i % 100) }));
        const start = performance.now();
        const means = applyTransforms(many, { type: 'rolling', column: 'v', size: 365 }).get('v');
        expect(performance.now() - start).toBeLessThan(1000);
        const window = many.slice(0, 365).map(r => r.v).filter(v => v !== '').map(Number);
        expect(means[364]).toBeCloseTo(window.reduce((a, b) => a + b, 0)/window.length, 9);
        expect(means[363]).toBeNull();
    });

    test('the share of the sum of the group', () => {
        expect(column({ type: 'share', column: 'value', as: 'share', by: 'date' }, 'share')).toEqual([10/15, 30/45, 1, 5/15, null, 15/45]);
        expect(column({ type: 'share', column: 'value', as: 'share' }, 'share')).toEqual([0.1, 0.3, 0.4, 0.05, null, 0.15]);
    });

    test('a rolling mean and a cumulative sum in the order of a column', () => {
        expect(column({ type: 'rolling', column: 'value', as: 'mean', by: 'type', order: 'date', size: 2 }, 'mean')).toEqual([null, 20, 35, null, 15, 10]);
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

    test('the checks of validateDef and the schema', () => {
        const def = {
            mapping: { y: { column: 'index', type: 'numeric' } },
            plot: { type: 'svg:circle', props: { cy: '@y' } },
            transform: [{ type: 'index', column: 'value', base: { year: '{base}' } }, { type: 'rolling', column: 'value', align: 'left' }, { type: 'sum' }],
        };
        expect(validateDef(def)).toEqual([
            "transform[0]: unknown global 'base' in the template",
            "transform[1].size: the number of the rows of the window is needed, e.g. 7",
            "transform[1].align: expected 'end' or 'center'",
            "transform[2].type: unknown transform 'sum', expected one of 'year', 'align', 'index', 'share', 'rolling', 'cumulative'",
            "transform[2].column: the column of the values is needed",
        ]);
        expect(schema.definitions.transform.properties.type.enum).toEqual(Object.keys(transformTypes));
        expect(transformNames).toEqual(Object.keys(transformTypes));
    });
});
