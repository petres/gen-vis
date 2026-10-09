import { describe, test, expect } from 'vitest';
import zlib from 'node:zlib';
import { parquetWriteBuffer } from 'hyparquet-writer';
import { addDimInfo, addStackedData, categoryOrder, dataFormat, filter, groupBy, parseData, prepareData } from '@/utils/data';

const def = {
    mapping: {
        x: { column: 'year', type: 'numeric' },
        t: { column: 'date', type: 'date' },
        c: { column: 'land', type: 'categorical' },
    },
};

describe('parseData', () => {
    test('csv', async () => {
        expect([...await parseData('a,b\n1,2')]).toEqual([{ a: '1', b: '2' }]);
    });

    test('json, also with leading whitespace', async () => {
        expect(await parseData('[{"a": 1}]')).toEqual([{ a: 1 }]);
        expect(await parseData(' \n[{"a": 1}]')).toEqual([{ a: 1 }]);
    });

    test('a byte order mark is removed', async () => {
        expect((await parseData('\uFEFFa,b\n1,2')).columns).toEqual(['a', 'b']);
        expect(await parseData('\uFEFF[{"a": 1}]')).toEqual([{ a: 1 }]);
    });

    test('parsed data is passed through', async () => {
        const rows = [{ a: 1 }];
        expect(await parseData(rows)).toBe(rows);
    });

    test('the format of the data', async () => {
        expect([...await parseData('a\tb\n1\t2', 'tsv')]).toEqual([{ a: '1', b: '2' }]);
        expect([...await parseData('[a]\n1', 'csv')]).toEqual([{ '[a]': '1' }]);
        await expect(parseData('{', 'json')).rejects.toThrow();
        await expect(parseData('a,b', 'parquet')).rejects.toThrow('Parquet data needs to be binary');
    });

    test('the format of a url by its extension', () => {
        expect(dataFormat('https://a.at/data.parquet?v=2')).toBe('parquet');
        expect(dataFormat('/data/bev/data.TSV')).toBe('tsv');
        expect(dataFormat('data.json')).toBe('json');
        expect(dataFormat('/api/data')).toBeUndefined();
        expect(dataFormat('/api/data', 'csv')).toBe('csv');
    });

    test('parquet, integers of 64 bits are numbers and dates are timestamps', async () => {
        const buffer = parquetWriteBuffer({ columnData: [
            { name: 'year', data: [2020n, 2021n, null], type: 'INT64' },
            { name: 'id', data: [2n**60n, 1n, 2n], type: 'INT64' },
            { name: 'date', data: [new Date('2020-01-01'), new Date('2021-06-15T12:00:00Z'), null], type: 'TIMESTAMP' },
            { name: 'land', data: ['Wien', 'Tirol', 'Wien'], type: 'STRING' },
            { name: 'value', data: [1.5, 2, null], type: 'DOUBLE' },
        ] });
        expect(await parseData(buffer)).toEqual([
            { year: 2020, id: String(2n**60n), date: Date.parse('2020-01-01'), land: 'Wien', value: 1.5 },
            { year: 2021, id: 1, date: Date.parse('2021-06-15T12:00:00Z'), land: 'Tirol', value: 2 },
            { year: null, id: 2, date: null, land: 'Wien', value: null },
        ]);
        // also a view of a buffer
        expect(await parseData(new Uint8Array(buffer))).toHaveLength(3);
    });

    test('parquet with other compressions than snappy, e.g. zstd of polars', async () => {
        // the writer only has snappy
        const compressors = {
            GZIP: b => new Uint8Array(zlib.gzipSync(b)),
            BROTLI: b => new Uint8Array(zlib.brotliCompressSync(b)),
            ZSTD: b => new Uint8Array(zlib.zstdCompressSync(b)),
        };
        for (const codec of ['UNCOMPRESSED', 'GZIP', 'BROTLI', 'ZSTD']) {
            const buffer = parquetWriteBuffer({ codec, compressors, columnData: [{ name: 'a', data: [1, 2], type: 'INT32' }] });
            expect(await parseData(buffer)).toEqual([{ a: 1 }, { a: 2 }]);
        }
    });
});

describe('values of other formats than csv', () => {
    test('numbers and dates', () => {
        const def = { mapping: { n: { column: 'n', type: 'numeric' }, d: { column: 'd', type: 'date' } } };
        expect(prepareData([{ n: 5n, d: new Date(0) }, { n: 2, d: 86400000n }], def))
            .toEqual([{ n: 5, d: 0 }, { n: 2, d: 86400000 }]);
    });

    test('keys of categories are compared as strings', () => {
        const data = [{ year: 2020 }, { year: 2021 }, { year: '2022' }, { year: null }];
        expect(filter(data, [{ dim: 'year', key: ['2020', '2022'] }])).toEqual([{ year: 2020 }, { year: '2022' }]);
        const order = categoryOrder([{ dim: 'year', keys: ['2021', '2020'] }]);
        expect([{ year: 2020 }, { year: 2021 }].sort(order)).toEqual([{ year: 2021 }, { year: 2020 }]);
    });
});

describe('prepareData', () => {
    test('maps the columns and converts the values', () => {
        expect(prepareData([{ year: '2020', date: '2020-01-01', land: 'Wien' }], def))
            .toEqual([{ x: 2020, t: Date.parse('2020-01-01'), c: 'Wien' }]);
    });

    test('missing and invalid values are null, not 0', () => {
        expect(prepareData([
            { year: '', date: '', land: '' },
            { year: 'NA', date: 'unknown', land: 'Tirol' },
            { year: null },
        ], def)).toEqual([
            { x: null, t: null, c: '' },
            { x: null, t: null, c: 'Tirol' },
            { x: null, t: null, c: undefined },
        ]);
    });

    test('numbers and timestamps of json data', () => {
        expect(prepareData([{ year: 0, date: 86400000 }], def)[0]).toMatchObject({ x: 0, t: 86400000 });
    });
});

describe('addDimInfo', () => {
    test('continuous values are sorted, without missing ones', () => {
        const info = { dim: 'x', mapping: { type: 'numeric' } };
        addDimInfo(info, [{ x: 3 }, { x: null }, { x: 1 }, { x: 2 }, { x: 1 }]);
        expect(info.values).toEqual([1, 2, 3]);
        expect(info.extent).toEqual([1, 3]);
    });

    test('categorical values keep their order', () => {
        const info = { dim: 'c', mapping: { type: 'categorical' } };
        addDimInfo(info, [{ c: 'b' }, { c: 'a' }, { c: 'b' }]);
        expect(info.values).toEqual(['b', 'a']);
        expect(info.extent).toBeUndefined();
    });
});

describe('addStackedData', () => {
    test('positive and negative values are stacked separately', () => {
        const data = [{ x: 1, y: 2 }, { x: 1, y: -1 }, { x: 1, y: 3 }, { x: 2, y: 5 }];
        addStackedData(data, { h: 'x', v: 'y' });
        expect(data.map(d => [d['y:start'], d['y:end']])).toEqual([[0, 2], [0, -1], [2, 5], [0, 5]]);
    });

    test('in the order of the categories, not of the rows', () => {
        const data = [{ x: 1, y: 1, c: 'b' }, { x: 1, y: 2, c: 'a' }, { x: 1, y: 4, c: 'c' }];
        addStackedData(data, { h: 'x', v: 'y' }, [], categoryOrder([{ dim: 'c', keys: ['a', 'b', 'c'] }]));
        expect(data.map(d => [d.c, d['y:start'], d['y:end']])).toEqual([['b', 2, 3], ['a', 0, 2], ['c', 3, 7]]);
    });
});

describe('categoryOrder', () => {
    test('by the dims in turn, unknown keys last', () => {
        const compare = categoryOrder([{ dim: 'a', keys: ['y', 'x'] }, { dim: 'b', keys: ['2', '1'] }]);
        const rows = [{ a: 'x', b: '1' }, { a: 'z', b: '2' }, { a: 'y', b: '1' }, { a: 'x', b: '2' }];
        expect([...rows].sort(compare)).toEqual([rows[2], rows[3], rows[0], rows[1]]);
    });
});

describe('filter', () => {
    const data = [{ c: 'a', x: 1 }, { c: 'b', x: 2 }, { c: 'c', x: 3 }];

    test('by value, list and function', () => {
        expect(filter(data, [{ dim: 'c', key: 'b' }])).toEqual([data[1]]);
        expect(filter(data, [{ dim: 'c', key: ['a', 'c'] }])).toEqual([data[0], data[2]]);
        expect(filter(data, [{ dim: 'x', key: v => v > 1 }, { dim: 'c', key: ['a', 'c'] }])).toEqual([data[2]]);
    });

    test('always returns a new array', () => {
        const filtered = filter(data, []);
        expect(filtered).toEqual(data);
        expect(filtered).not.toBe(data);
    });
});

describe('groupBy', () => {
    test('groups by several keys', () => {
        const data = [{ a: 1, b: 'x' }, { a: 1, b: 'y' }, { a: 1, b: 'x' }];
        expect(groupBy(data, ['a', 'b'])).toEqual([
            { group: { a: 1, b: 'x' }, entries: [data[0], data[2]] },
            { group: { a: 1, b: 'y' }, entries: [data[1]] },
        ]);
    });

    test('values containing the separator are different groups', () => {
        const data = [{ a: 'a-b', b: 'c' }, { a: 'a', b: 'b-c' }];
        expect(groupBy(data, ['a', 'b'])).toHaveLength(2);
    });

    test('the groups are in the order of the data, also for numeric keys', () => {
        const data = [{ a: '2021' }, { a: '2020' }, { a: 'x' }];
        expect(groupBy(data, ['a']).map(g => g.group.a)).toEqual(['2021', '2020', 'x']);
    });
});
