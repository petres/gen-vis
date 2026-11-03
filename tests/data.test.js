import { describe, test, expect } from 'vitest';
import zlib from 'node:zlib';
import { parquetWriteBuffer } from 'hyparquet-writer';
import { addDataValues, categoryOrder, dataFormat, distinctValues, filter, groupBy, inferType, parseData, prepareData, rowFilter, stack, toDate, updateData, usedColumns } from '@/utils/data';
import { prepareDef } from '@/utils/def';

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

    test('parquet, integers of 64 bits are numbers and timestamps are the ones of Date.parse', async () => {
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

    test('parquet, dates without a time are the strings of csv, so they are the same day everywhere', async () => {
        const buffer = parquetWriteBuffer({
            columnData: [{ name: 'day', data: [new Date('2020-01-01'), new Date('2021-06-15'), null] }],
            schema: [{ name: 'root', num_children: 1 }, { name: 'day', type: 'INT32', converted_type: 'DATE', repetition_type: 'OPTIONAL' }],
        });
        expect(await parseData(buffer)).toEqual([{ day: '2020-01-01' }, { day: '2021-06-15' }, { day: null }]);
    });

    test('parquet, timestamps without a time zone are the strings of csv, so they are the same time everywhere', async () => {
        const buffer = parquetWriteBuffer({
            columnData: [{ name: 'ts', data: [BigInt(Date.UTC(2024, 5, 1, 13)), null] }],
            schema: [{ name: 'root', num_children: 1 }, { name: 'ts', type: 'INT64', logical_type: { type: 'TIMESTAMP', isAdjustedToUTC: false, unit: 'MILLIS' }, repetition_type: 'OPTIONAL' }],
        });
        expect(await parseData(buffer)).toEqual([{ ts: '2024-06-01T13:00:00.000' }, { ts: null }]);
    });

    test('parquet, decimals are the doubles of their text, as the ones of csv, also of 64 bits and of bytes', async () => {
        const decimal = (name, type, precision, scale, more = {}) => ({ name, type, converted_type: 'DECIMAL', precision, scale,
            logical_type: { type: 'DECIMAL', precision, scale }, repetition_type: 'OPTIONAL', ...more });
        // the writer scales the values itself
        const buffer = parquetWriteBuffer({
            columnData: [
                { name: 'a', data: [164.732, 22.164, null, -0.003] },
                { name: 'b', data: [22.1637, 123456789.1234, null, -1.0001] },
                { name: 'c', data: [22.1637, 0.3, null, 1] },
                // only the logical type, the reader does not scale it
                { name: 'd', data: [221637, 3, null, -1] },
            ],
            schema: [
                { name: 'root', num_children: 4 },
                decimal('a', 'INT32', 9, 3),
                decimal('b', 'INT64', 18, 4),
                decimal('c', 'FIXED_LEN_BYTE_ARRAY', 18, 4, { type_length: 8 }),
                { name: 'd', type: 'INT32', logical_type: { type: 'DECIMAL', precision: 9, scale: 4 }, repetition_type: 'OPTIONAL' },
            ],
        });
        const rows = await parseData(buffer);
        const expected = [
            { a: 164.732, b: 22.1637, c: 22.1637, d: 22.1637 },
            { a: 22.164, b: 123456789.1234, c: 0.3, d: 0.0003 },
            { a: null, b: null, c: null, d: null },
            { a: -0.003, b: -1.0001, c: 1, d: -0.0001 },
        ];
        // the same numbers as the ones of the texts, not only close ones
        rows.forEach((row, i) => Object.keys(expected[i]).forEach(k => expect(Object.is(row[k], expected[i][k])).toBe(true)));
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

    test('parquet in the columns which are used, all without them or if none is in the file', async () => {
        const buffer = parquetWriteBuffer({ columnData: [
            { name: 'a', data: [1, 2], type: 'INT32' },
            { name: 'b', data: ['x', 'y'], type: 'STRING' },
            { name: 'c', data: [1.5, 2.5], type: 'DOUBLE' },
        ] });
        expect(await parseData(buffer, 'parquet', ['a', 'c', 'missing'])).toEqual([{ a: 1, c: 1.5 }, { a: 2, c: 2.5 }]);
        expect(await parseData(buffer, 'parquet')).toEqual([{ a: 1, b: 'x', c: 1.5 }, { a: 2, b: 'y', c: 2.5 }]);
        expect(await parseData(buffer, 'parquet', ['missing'])).toHaveLength(2);
    });
});

describe('the columns a definition uses', () => {
    test('of the mappings, the patches and the values of form elements', () => {
        expect(usedColumns({
            mapping: { x: { column: 'year' }, y: { column: 'value' }, c: { column: 'land' } },
            formElements: [
                { ref: 'col', values: [{ value: 'a' }, { value: 'b', patch: { mapping: { y: { column: 'share' } } } }] },
                { ref: 'year', values: { column: 'jahr' } },
            ],
        })).toEqual(['year', 'value', 'land', 'share', 'jahr']);
    });

    test('a template is a column of every value of its globals', () => {
        expect(usedColumns({
            globals: { values: 'twh', share: '', other: 'x' },
            mapping: { y: { column: '{values}{share}' }, z: { column: 'z.{other}' } },
            formElements: [
                { ref: 'values', values: [{ value: 'twh' }, { value: 'co2' }] },
                { ref: 'share', values: [{ value: '' }, { value: '.share' }] },
            ],
        })).toEqual(['twh', 'twh.share', 'co2', 'co2.share', 'z.x']);
        // the values of a column are not known before the data
        expect(usedColumns({
            mapping: { y: { column: 'value.{year}' } },
            formElements: [{ ref: 'year', values: { column: 'year' } }],
        })).toBeNull();
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
            .toEqual([{ x: 2020, t: new Date(2020, 0, 1).getTime(), c: 'Wien' }]);
    });

    test('a date without a time is the midnight of the time zone of the scale, the same day everywhere', () => {
        const zone = process.env.TZ;
        try {
            // west of UTC, where the midnight of UTC is the day before
            process.env.TZ = 'America/New_York';
            const mapping = type => ({ mapping: { t: { column: 'date', type: 'date', scale: { type } } } });
            const rows = [{ date: '2023-05-01' }, { date: '2023-05' }, { date: '2023' }, { date: '2023-02-30' }, { date: '2023-05-01T12:00:00Z' }];
            const local = prepareData(rows, mapping('time')).map(r => r.t);
            expect(local.slice(0, 3).map(t => new Date(t).toString().slice(4, 24)))
                .toEqual(['May 01 2023 00:00:00', 'May 01 2023 00:00:00', 'Jan 01 2023 00:00:00']);
            expect(local.slice(3)).toEqual([null, Date.parse('2023-05-01T12:00:00Z')]);
            expect(prepareData(rows, mapping('utc')).map(r => r.t))
                .toEqual([Date.UTC(2023, 4, 1), Date.UTC(2023, 4, 1), Date.UTC(2023, 0, 1), null, Date.parse('2023-05-01T12:00:00Z')]);
        } finally {
            process.env.TZ = zone;
        }
    });

    test('a date and a time without a time zone are the ones of the time zone of the scale', () => {
        const zone = process.env.TZ;
        try {
            process.env.TZ = 'America/New_York';
            const mapping = type => ({ mapping: { t: { column: 'date', type: 'date', scale: { type } } } });
            const rows = ['2024-06-01 13:00', '2024-06-01T13:00:00', '2024-06-01T13:00:00.5', '2024-06-01 25:00', '2024-06-01T13:00:00+02:00'].map(date => ({ date }));
            expect(prepareData(rows, mapping('utc')).map(r => r.t)).toEqual([
                Date.UTC(2024, 5, 1, 13), Date.UTC(2024, 5, 1, 13), Date.UTC(2024, 5, 1, 13, 0, 0, 500), null, Date.UTC(2024, 5, 1, 11),
            ]);
            expect(prepareData(rows, mapping('time')).map(r => r.t)).toEqual([
                new Date(2024, 5, 1, 13).getTime(), new Date(2024, 5, 1, 13).getTime(), new Date(2024, 5, 1, 13, 0, 0, 500).getTime(), null, Date.UTC(2024, 5, 1, 11),
            ]);
        } finally {
            process.env.TZ = zone;
        }
    });

    test('fractions of seconds are cut to milliseconds, 24:00 is the end of a day', () => {
        const mapping = { mapping: { t: { column: 'date', type: 'date', scale: { type: 'utc' } } } };
        expect(prepareData(['2024-12-31T23:59:59.9999', '2024-06-01 13:00:00.123456', '2024-06-01T24:00', '2024-06-01T24:01'].map(date => ({ date })), mapping).map(r => r.t))
            .toEqual([Date.UTC(2024, 11, 31, 23, 59, 59, 999), Date.UTC(2024, 5, 1, 13, 0, 0, 123), Date.UTC(2024, 5, 2), null]);
    });

    test('dates of the day first, e.g. German, not the month as of Date.parse', () => {
        const mapping = { mapping: { t: { column: 'date', type: 'date', scale: { type: 'utc' } } } };
        expect(prepareData(['01.06.2024', '1.6.2024 13:05', '31.02.2024'].map(date => ({ date })), mapping).map(r => r.t))
            .toEqual([Date.UTC(2024, 5, 1), Date.UTC(2024, 5, 1, 13, 5), null]);
    });

    test('a date with a time zone is one of ISO, Z or an offset, other texts are no dates', () => {
        expect(['2024-06-01T13:00:00Z', '2024-06-01 13:00z', '2024-06-01T13:00:00.25+02:00', '2024-06-01T13:00-0130', '2024-06-01T13:00:00 +02', '2024-06-01T24:00Z']
            .map(v => toDate(v))).toEqual([
            Date.UTC(2024, 5, 1, 13), Date.UTC(2024, 5, 1, 13), Date.UTC(2024, 5, 1, 11, 0, 0, 250), Date.UTC(2024, 5, 1, 14, 30), Date.UTC(2024, 5, 1, 11), Date.UTC(2024, 5, 2),
        ]);
        // of every scale the same time
        expect(toDate('2024-06-01T13:00:00+02:00', true)).toBe(toDate('2024-06-01T13:00:00+02:00', false));
        // which do not exist, and texts which Date.parse of V8 reads as dates
        expect(['2024-02-30T13:00Z', '2024-06-01T13:00+24:00', '2024-06-01T13:00:00+02:60', 'Phase 1', 'AT-1', 'Wien 2', 'Top 10', 'Product 5', 'June 1, 2024', 'Sat, 01 Jun 2024 13:00:00 GMT']
            .map(v => toDate(v))).toEqual(Array(10).fill(null));
        expect(inferType(['Phase 1', 'Phase 2', 'Phase 3'])).toBe('categorical');
        expect(inferType(['AT-1', 'AT-2'])).toBe('categorical');
        expect(inferType(['2024-06-01T13:00:00Z', '2024-06-01T14:00:00+01:00'])).toBe('date');
    });

    test('missing and invalid values are null, not 0, missing categories too, e.g. an empty cell of csv as null of JSON', () => {
        expect(prepareData([
            { year: '', date: '', land: '' },
            { year: 'NA', date: 'unknown', land: 'Tirol' },
            { year: null },
            { land: ' ' },
        ], def)).toEqual([
            { x: null, t: null, c: null },
            { x: null, t: null, c: 'Tirol' },
            { x: null, t: null, c: null },
            { x: null, t: null, c: null },
        ]);
    });

    test('numbers and timestamps of json data', () => {
        expect(prepareData([{ year: 0, date: 86400000 }], def)[0]).toMatchObject({ x: 0, t: 86400000 });
    });
});

describe('updateData', () => {
    test('only the given mappings, in the same rows', () => {
        const rows = [{ year: '2020', a: '1', b: '2' }];
        const def = { mapping: { x: { column: 'year', type: 'numeric' }, y: { column: 'a', type: 'numeric' } } };
        const data = prepareData(rows, def);
        const row = data[0];
        def.mapping.y.column = 'b';
        def.mapping.x.column = 'a';
        expect(updateData(rows, data, def, ['y'])).toBe(data);
        expect(data[0]).toBe(row);
        expect(row).toEqual({ x: 2020, y: 2 });
    });
});

describe('the categories of the data', () => {
    test('after the listed ones, in ascending order', () => {
        const rows = [{ a: 'y', b: 'q' }, { a: 'x', b: 'p' }, { a: 'x', b: '' }, { a: 'x', b: 'z' }];
        const keysOf = column => distinctValues(rows, null, column).map(String);
        const def = prepareDef({ globals: { col: 'b' }, mapping: { c: { column: '{col}', props: { fromData: true, categories: { z: {} } } }, d: { column: 'a', props: { categories: { x: {} } } } } }, { dataKeys: keysOf });
        expect(def.mapping.c.keys).toEqual(['z', 'p', 'q']);
        // only with fromData
        expect(def.mapping.d.keys).toEqual(['x']);
    });

    test('the values of a column of a form element', () => {
        const def = { formElements: [{ id: 'y', ref: 'y', values: { column: 'year' } }] };
        addDataValues(def, [{ year: '2021' }, { year: '2019' }, { year: '' }]);
        expect(def.formElements[0].values.map(v => v.value)).toEqual(['2019', '2021']);
        expect(def.globals.y).toBe('2021');
    });
});

describe('stack', () => {
    test('positive and negative values are stacked separately', () => {
        const data = [{ x: 1, y: 2 }, { x: 1, y: -1 }, { x: 1, y: 3 }, { x: 2, y: 5 }];
        const stacks = stack(data, { h: 'x', v: 'y' });
        expect(data.map(d => stacks.get(d))).toEqual([[0, 2], [0, -1], [2, 5], [0, 5]]);
        // the rows are not changed
        expect(data[0]).toEqual({ x: 1, y: 2 });
    });

    test('in the order of the categories, not of the rows', () => {
        const data = [{ x: 1, y: 1, c: 'b' }, { x: 1, y: 2, c: 'a' }, { x: 1, y: 4, c: 'c' }];
        const stacks = stack(data, { h: 'x', v: 'y' }, [], categoryOrder([{ dim: 'c', keys: ['a', 'b', 'c'] }]));
        expect(data.map(d => [d.c, ...stacks.get(d)])).toEqual([['b', 2, 3], ['a', 0, 2], ['c', 3, 7]]);
    });

    test('separately for the values of the dims, e.g. the facets', () => {
        const data = [{ x: 1, y: 1, f: 'a' }, { x: 1, y: 2, f: 'b' }, { x: 1, y: 4, f: 'a' }];
        const stacks = stack(data, { h: 'x', v: 'y' }, ['f']);
        expect(data.map(d => stacks.get(d))).toEqual([[0, 1], [0, 2], [1, 5]]);
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

describe('parquet, values as the ones of csv', () => {
    const optional = (name, type, more = {}) => ({ name, type, repetition_type: 'OPTIONAL', ...more });

    test('decimals of only the logical type of bytes, also negative and large ones', async () => {
        // the unscaled integers big-endian, two's complement
        const bytes = (n, length) => {
            const b = new Uint8Array(length);
            let v = BigInt.asUintN(8*length, BigInt(n));
            for (let i = length - 1; i >= 0; i--, v >>= 8n)
                b[i] = Number(v & 255n);
            return b;
        };
        const logical = { type: 'DECIMAL', precision: 30, scale: 4 };
        const unscaled = [221637n, -1n, -221637n, 10n**25n + 1n, null];
        const buffer = parquetWriteBuffer({
            columnData: [
                { name: 'f', data: unscaled.map(n => n === null ? null : bytes(n, 16)) },
                { name: 'b', data: unscaled.map(n => n === null ? null : bytes(n, n < 0 ? 3 : 11)) },
            ],
            schema: [
                { name: 'root', num_children: 2 },
                optional('f', 'FIXED_LEN_BYTE_ARRAY', { type_length: 16, logical_type: logical }),
                optional('b', 'BYTE_ARRAY', { logical_type: logical }),
            ],
        });
        const rows = await parseData(buffer);
        const expected = [22.1637, -0.0001, -22.1637, Number('1000000000000000000000.0001'), null];
        rows.forEach((row, i) => ['f', 'b'].forEach(k => expect(Object.is(row[k], expected[i])).toBe(true)));
    });

    test('dates of only the logical type are the days of csv, not timestamps of 1970', async () => {
        const buffer = parquetWriteBuffer({
            columnData: [{ name: 'day', data: [19875, -3593, null] }],
            schema: [{ name: 'root', num_children: 1 }, optional('day', 'INT32', { logical_type: { type: 'DATE' } })],
        });
        const rows = await parseData(buffer);
        expect(rows).toEqual([{ day: '2024-06-01' }, { day: '1960-03-01' }, { day: null }]);
        const csv = await parseData('day\n2024-06-01\n1960-03-01\n');
        const d = prepareDef({ mapping: { t: { column: 'day', type: 'date' } } });
        expect(prepareData(rows, d).slice(0, 2)).toEqual(prepareData(csv, d));
    });

    test('floats of 32 bits are the numbers of their shortest text', async () => {
        const values = [22.1637, 0.1, -3.4e38, 1e-7, 16777216, 0, null];
        const buffer = parquetWriteBuffer({ columnData: [{ name: 'f', data: values, type: 'FLOAT' }] });
        expect((await parseData(buffer)).map(r => r.f)).toEqual(values);
    });

    test('integers of 64 bits in lists and structs are no BigInt, bytes without a type are text', async () => {
        const buffer = parquetWriteBuffer({
            columnData: [
                { name: 'l', data: [[1n, 2n**60n, null], null, []] },
                { name: 's', data: [{ a: 1n, b: new TextEncoder().encode('ä') }, null, { a: 2n**60n, b: null }] },
                { name: 't', data: [new TextEncoder().encode('Wien'), null, new TextEncoder().encode('')] },
            ],
            schema: [
                { name: 'root', num_children: 3 },
                optional('l', undefined, { converted_type: 'LIST', num_children: 1 }),
                { name: 'list', repetition_type: 'REPEATED', num_children: 1 },
                optional('element', 'INT64'),
                optional('s', undefined, { num_children: 2 }),
                optional('a', 'INT64'),
                optional('b', 'BYTE_ARRAY'),
                optional('t', 'BYTE_ARRAY'),
            ],
        });
        const rows = await parseData(buffer);
        const bigints = v => typeof v == 'bigint' || (v && typeof v == 'object' && Object.values(v).some(bigints));
        expect(rows.some(bigints)).toBe(false);
        expect(rows[0]).toEqual({ l: [1, String(2n**60n), null], s: { a: 1, b: 'ä' }, t: 'Wien' });
        expect(rows[2]).toEqual({ l: [], s: { a: String(2n**60n), b: null }, t: '' });
        const d = prepareDef({ mapping: { v: { column: 'l', type: 'numeric' } } });
        expect(prepareData(rows, d)[0].v).toBeNull();
    });
});

describe('numbers, only finite numbers and texts of decimal numbers', () => {
    const d = prepareDef({ mapping: { v: { column: 'v', type: 'numeric' } } });
    const values = rows => prepareData(rows, d).map(r => r.v);

    test('of csv, with spaces, signs and exponents', async () => {
        expect(values(await parseData('v\n 12 \n-.5\n+1e3\n2.5E-1\n007\n\nNA\n-\n0x10\n0b1\n"1,234"\nInfinity\n1e999'))).toEqual(
            [12, -0.5, 1000, 0.25, 7, null, null, null, null, null, null, null, null]);
    });

    test('of json, no booleans, lists or objects', async () => {
        expect(values(await parseData('[{"v": 1.5}, {"v": true}, {"v": false}, {"v": [1]}, {"v": {}}, {"v": "0x10"}, {"v": null}, {"v": " 3 "}]')))
            .toEqual([1.5, null, null, null, null, null, null, 3]);
        expect(values([{ v: 2n**60n }, { v: 3n }])).toEqual([2**60, 3]);
    });
});

describe('filters of a mapping with the scale of another one', () => {
    test('dates of a utc scale of another mapping', () => {
        const d = prepareDef({ mapping: {
            x: { column: 'd', type: 'date', scale: { type: 'utc' } },
            x2: { column: 'e', type: 'date', scale: { of: 'x' } },
        } });
        const data = prepareData([{ d: '2020-01-01', e: '2020-01-01' }, { d: '2020-01-02', e: '2020-01-03' }], d);
        expect(data[0].x2).toBe(Date.UTC(2020, 0, 1));
        expect(filter(data, rowFilter({ x2: '2020-01-01' }, d.mapping))).toEqual([data[0]]);
        expect(filter(data, rowFilter({ x2: ['2020-01-03'] }, d.mapping))).toEqual([data[1]]);
        expect(filter(data, rowFilter({ x2: { range: ['2020-01-02', null] } }, d.mapping))).toEqual([data[1]]);
        expect(filter(data, rowFilter({ x2: { not: '2020-01-01' } }, d.mapping))).toEqual([data[1]]);
    });
});
