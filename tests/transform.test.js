import { describe, test, expect } from 'vitest';
import { applyTransforms, transformColumns, transformGlobals, transformTypes } from '@/utils/transform';
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

const column = (transforms, name, globals) => applyTransforms(rows, transforms, globals).get(name);

describe('transforms', () => {
    test('the year of a date and the date in another year, without and with a time', () => {
        expect(column({ type: 'year', column: 'date', as: 'year' }, 'year')).toEqual([2019, 2019, 2020, 2019, 2020, 2019]);
        expect(column({ type: 'align', column: 'date', as: 'day' }, 'day')).toEqual(['2020-01-01', '2020-07-01', '2020-01-01', '2020-01-01', '2020-01-01', '2020-07-01']);
        expect(applyTransforms([{ d: '2023-02-28T13:05:00' }, { d: '2024-02-29' }], [{ type: 'align', column: 'd', year: 2024 }]).get('d'))
            .toEqual(['2024-02-28T13:05:00', '2024-02-29']);
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
    });
});
