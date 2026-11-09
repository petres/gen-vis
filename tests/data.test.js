import vm from 'node:vm';
import { translate } from '@/utils/language.js';
import { resolve, variants } from '@/utils/resolve.js';
import { variantsOf } from '@/utils/def.js';
import { describe, test, expect } from 'vitest';
import zlib from 'node:zlib';
import { parquetWriteBuffer } from 'hyparquet-writer';
import { toNumber } from '@/utils/values';
import { addDataValues, categoryOrder, dataFormat, distinctValues, filter, groupBy, inferType, inferTypes, isBinary, oddValues, parseData, prepareData, rowFilter, stack, toDate, updateData, usedColumns } from '@/utils/data';
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

    test('rows which are no objects are left out with a warning, a list of lists is an error (review of 5.0)', async () => {
        const warnings = [];
        const warn = w => warnings.push(w);
        expect(await parseData('[null, {"a": 1}]', undefined, null, warn)).toEqual([{ a: 1 }]);
        expect(await parseData([{ a: 1 }, null, 5, { a: 2 }], undefined, null, warn)).toEqual([{ a: 1 }, { a: 2 }]);
        expect(warnings).toEqual([
            'the row 0 (counted from 0) is null, not an object of values, it is left out',
            '2 rows (1, 2, counted from 0) are null or number, not objects of values, they are left out',
        ]);
        await expect(parseData('[[1, 2], [2, 3]]')).rejects.toThrow('expected a list of rows as objects, e.g. [{"year": 2024, "value": 1.5}], the first row is a list');
        // without a warning a list of rows is passed through
        expect(await parseData('[]', undefined, null, warn)).toEqual([]);
        expect(warnings.length).toBe(2);
    });

    test('a page of HTML is an error, e.g. of a wrong url (review of 5.0)', async () => {
        for (const page of ['<!DOCTYPE html><html><body>Not found</body></html>', '\uFEFF\n <html lang="en">', '<html>'])
            await expect(parseData(page)).rejects.toThrow('it is a page of HTML, not CSV, TSV or JSON, e.g. the page a server answers for a wrong url');
        await expect(parseData('<!doctype html>', 'csv')).rejects.toThrow('not CSV');
        await expect(parseData(new TextEncoder().encode('<!doctype html>'))).rejects.toThrow('a page of HTML');
        // a column of CSV in angle brackets is none
        expect([...await parseData('<a>,b\n1,2')]).toEqual([{ '<a>': '1', b: '2' }]);
    });

    test('a column in the header twice: a warning, the values of the last one (review of 5.0)', async () => {
        const warnings = [];
        expect([...await parseData('a,b,b\n1,2,9', undefined, null, w => warnings.push(w))]).toEqual([{ a: '1', b: '9' }]);
        expect(warnings).toEqual(["the column 'b' is in the header 2 times, the rows have the values of the last one"]);
    });

    test('binary data of another realm, e.g. of a worker (review of 5.0)', async () => {
        const buffer = vm.runInNewContext('new Uint8Array([97, 44, 98, 10, 49, 44, 50]).buffer');
        expect(buffer instanceof ArrayBuffer).toBe(false);
        expect(isBinary(buffer)).toBe(true);
        expect([...await parseData(buffer)]).toEqual([{ a: '1', b: '2' }]);
    });

    test('the format of the data', async () => {
        expect([...await parseData('a\tb\n1\t2', 'tsv')]).toEqual([{ a: '1', b: '2' }]);
        expect([...await parseData('[a]\n1', 'csv')]).toEqual([{ '[a]': '1' }]);
        await expect(parseData('{', 'json')).rejects.toThrow();
        await expect(parseData('a,b', 'parquet')).rejects.toThrow('Parquet data needs to be binary');
    });

    test('bytes are parquet by their content (PAR1) or of the format, otherwise text', async () => {
        const bytes = text => new TextEncoder().encode(text);
        expect([...await parseData(bytes('a,b\n1,2'))]).toEqual([{ a: '1', b: '2' }]);
        expect(await parseData(bytes('\uFEFF[{"a": 1}]').buffer)).toEqual([{ a: 1 }]);
        expect([...await parseData(bytes('a\tb\n1\t2'), 'tsv')]).toEqual([{ a: '1', b: '2' }]);
        const parquet = parquetWriteBuffer({ columnData: [{ name: 'a', data: [1], type: 'INT32' }] });
        expect(await parseData(parquet)).toEqual([{ a: 1 }]);
        // a view of a part of a buffer
        const padded = new Uint8Array(parquet.byteLength + 2);
        padded.set(new Uint8Array(parquet), 2);
        expect(await parseData(padded.subarray(2))).toEqual([{ a: 1 }]);
        await expect(parseData(bytes('a,b'), 'parquet')).rejects.toThrow();
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
    test('of the mappings, the columns of all values of the controls and the values of form elements', () => {
        // the definitions of all values of the controls, as the load keeps them, see utils/resolve.js
        const def = {
            globals: { col: 'a' },
            dims: { x: 'year', y: { column: "=match(@col, {b: 'share'}, 'value')" }, c: 'land' },
            controls: [
                { global: 'col', values: [{ value: 'a' }, { value: 'b' }] },
                { global: 'year', values: { column: 'jahr' } },
            ],
        };
        const engine = translate(resolve(def, { col: 'a' }));
        engine[variantsOf] = variants(def).map(translate);
        expect(usedColumns(engine)).toEqual(['year', 'value', 'land', 'share', 'jahr']);
    });

    test('the names of the expressions of filters, stacks and the hover filter, which can be columns', () => {
        const engine = translate({ dims: { x: 'year', y: { column: 'value', stacked: "@kind != 'total'" } }, filter: "@region == 'W'",
            hover: { filter: "@flag == 1" }, marks: { type: 'line', filter: "@other:scaled > 2" } });
        expect(usedColumns(engine)).toEqual(['year', 'value', 'region', 'other', 'kind', 'flag']);
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

    test('a column without values is a date of a time format, numeric of the parts of numbers, otherwise categorical', () => {
        expect(inferType([])).toBeUndefined();
        expect(inferType(['', null, ' '])).toBeUndefined();
        expect(inferType(['NA', ':'])).toBeUndefined();
        const def = { mapping: {
            t: { column: 't', axis: { format: '%Y' } },
            h: { column: 'h', hover: { format: '%b %y' } },
            p: { column: 'p', format: '.0%' },
            z: { column: 'z', scale: { domain: [0, null] } },
            c: { column: 'c' },
        } };
        inferTypes(def, []);
        expect(Object.values(def.mapping).map(m => m.type)).toEqual(['date', 'date', 'numeric', 'numeric', 'categorical']);
    });

    test('the usual texts of missing values among numbers and dates are missing ones (review of 5.0)', () => {
        expect(inferType(['10', 'NA', '30'])).toBe('numeric');
        for (const token of ['NaN', 'n/a', 'N.A.', '-', '.', '..', ':', '\u2013', 'null', '#N/A', ' na '])
            expect(inferType(['10', token, '30'])).toBe('numeric');
        expect(inferType([1, NaN, 3])).toBe('numeric');
        expect(inferType(['2024-01-01', 'NA', '2024-03-01'])).toBe('date');
        // categories stay categories, also with such texts
        expect(inferType(['A', '-', 'B'])).toBe('categorical');
        const rows = [{ v: '10' }, { v: 'NA' }, { v: ':' }, { v: '30' }];
        const def = { mapping: { y: { column: 'v' } } };
        inferTypes(def, rows);
        expect(def.mapping.y.type).toBe('numeric');
        const odd = new Map();
        expect(prepareData(rows, def, null, odd).map(r => r.y)).toEqual([10, null, null, 30]);
        // without a warning
        expect(oddValues(def, odd)).toEqual([]);
    });

    test('mostly numbers and texts with digits: numeric, the texts are missing with a warning (review of 5.0)', () => {
        // e.g. separators of thousands, a limit or a unit
        expect(inferType(['10', '1,234', '30', '<5', '7'])).toBe('numeric');
        // not of fewer numbers, nor of words, e.g. a total among years
        expect(inferType(['10', '1,234', '<5'])).toBe('categorical');
        expect(inferType(['2022', '2023', '2024', 'Total'])).toBe('categorical');
        expect(inferType(['2023', '2024', 'Phase 1'])).toBe('numeric');
        // dates stay dates
        expect(inferType(['2001', '2002', '2003-01-01'])).toBe('date');
        const rows = [{ v: '10' }, { v: '1,234' }, { v: '30' }, { v: '1,234' }, { v: '<5' }, { v: '7' }, { v: 'NA' }, { v: '8' }];
        const def = { mapping: { y: { column: 'v' } } };
        inferTypes(def, rows);
        expect(def.mapping.y.type).toBe('numeric');
        const odd = new Map();
        expect(prepareData(rows, def, null, odd).map(r => r.y)).toEqual([10, null, 30, null, null, 7, null, 8]);
        expect(oddValues(def, odd)).toEqual([
            "dims.y: values of the column 'v' are no numbers, they are missing: '1,234' (2 rows), '<5' (1 row) (a number is written as 1234.5, without a separator of thousands)",
        ]);
    });

    test('the parts of numbers make a dim numeric, also with other texts (review of 5.0)', () => {
        const rows = ['A', 'B', 'C', 'D'].map((a, i) => ({ a, b: ['10', 'n.a', 'Total', '30'][i] }));
        const typeOf = m => {
            const def = { mapping: { y: { column: 'b', ...m } } };
            inferTypes(def, rows);
            return def.mapping.y.type;
        };
        expect(typeOf({})).toBe('categorical');
        for (const parts of [{ scale: { domain: [0, null] } }, { domain: [0, 100] }, { scale: { include: 0 } }, { format: ',.1f' }, { axis: { format: '.0%' } },
            { scale: { nice: true } }, { scale: { pad: 0.1 } }, { scale: { domain: [null, null] } }])
            expect(typeOf(parts)).toBe('numeric');
        // a time format is no part of numbers
        expect(typeOf({ format: '%Y' })).toBe('categorical');
        // the type of the column is kept per hint
        expect(typeOf({})).toBe('categorical');
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
        const def = prepareDef({ globals: { col: 'b' }, mapping: { c: { column: '{col}', fromData: true, categories: { z: {} } }, d: { column: 'a', categories: { x: {} } } } }, { dataKeys: keysOf });
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

// the implementations before the faster ones, the same results of random
// values, of the time zone of the tests (Europe/Vienna, see vite.config.js)
describe('the faster dates and types are the ones of before', () => {
    // a seeded random number generator (mulberry32), the same values every run
    const random = (seed => () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    })(42);
    const int = (a, b) => a + Math.floor(random() * (b - a + 1));
    const pad = (v, n = 2) => String(v).padStart(n, '0');

    const wallTimeBefore = (utc, y, m = 1, d = 1, h = 0, mi = 0, s = 0, fraction = '') => {
        const date = new Date(0);
        const ms = +`${fraction ?? ''}000`.slice(0, 3);
        const end = +h == 24 && +mi == 0 && +s == 0 && ms == 0;
        if (utc) {
            date.setUTCFullYear(+y, m - 1, +d);
            date.setUTCHours(end ? 0 : +h, +mi, +s, ms);
        } else {
            date.setFullYear(+y, m - 1, +d);
            date.setHours(end ? 0 : +h, +mi, +s, ms);
        }
        const [year, month, day] = utc
            ? [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()]
            : [date.getFullYear(), date.getMonth(), date.getDate()];
        const valid = year == +y && month == m - 1 && day == +d && (end || +h < 24) && +mi < 60 && +s < 60;
        if (valid && end)
            utc ? date.setUTCDate(date.getUTCDate() + 1) : date.setDate(date.getDate() + 1);
        return valid ? date.getTime() : null;
    };

    // the rules of inferType written plainly: the usual texts of missing
    // values are missing ones, all numbers numeric, all dates date, then
    // numeric of a hint and some numbers, or of more numbers than other
    // values which all have digits, categorical otherwise
    const missingTexts = ['na', 'n/a', 'n.a.', 'nan', 'null', 'none', '-', '--', '\u2013', '\u2014', '.', '..', '...', '\u2026', ':', '?', '#n/a', 'n.v.', 'k.a.'];
    const inferTypeBefore = (values, hint) => {
        const absent = v => v === null || v === undefined || (typeof v == 'string' && (v.trim() === '' || missingTexts.includes(v.trim().toLowerCase())))
            || (typeof v == 'number' && isNaN(v));
        const present = values.filter(v => !absent(v));
        if (present.length == 0)
            return undefined;
        if (present.every(v => toNumber(v) !== null))
            return 'numeric';
        if (present.every(v => toDate(v) !== null))
            return 'date';
        const numbers = present.filter(v => toNumber(v) !== null).length;
        const others = present.filter(v => toNumber(v) === null);
        return numbers > 0 && (hint !== undefined || (others.every(v => /\d/.test(String(v))) && numbers > others.length)) ? 'numeric' : 'categorical';
    };

    test('random dates and times, also ones which do not exist, in UTC and local time', () => {
        const differences = [];
        for (let k = 0; k < 50000; k++) {
            const parts = [pad(int(0, 2100), 4), pad(int(0, 13)), pad(int(0, 32)), pad(int(0, 25)), pad(int(0, 60)), pad(int(0, 60)), random() < 0.3 ? String(int(0, 99999)) : undefined];
            const n = int(1, 7);
            const text = parts[0] + (n > 1 ? `-${parts[1]}` : '') + (n > 2 ? `-${parts[2]}` : '') + (n > 4 ? `T${parts[3]}:${parts[4]}` : '')
                + (n > 5 ? `:${parts[5]}` : '') + (n > 6 && parts[6] ? `.${parts[6]}` : '');
            const used = n > 4 ? parts.slice(0, n) : parts.slice(0, Math.min(n, 3));
            for (const utc of [false, true])
                if (toDate(text, utc) !== wallTimeBefore(utc, ...used))
                    differences.push([text, utc]);
        }
        // leap years, early years and the end of a day
        for (const text of ['2000-02-29', '1900-02-29', '2024-02-29', '2023-02-29', '0000-02-29', '0004-02-29', '0100-02-29', '0099-12-31T24:00', '0050-06-01T13:00:00.5'])
            for (const utc of [false, true]) {
                const [, y, m, d, h, mi, s, fraction] = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?$/.exec(text);
                if (toDate(text, utc) !== wallTimeBefore(utc, y, m, d, h, mi, s, fraction))
                    differences.push([text, utc]);
            }
        expect(differences).toEqual([]);
    });

    test('every minute of the days of the changes of the summer time of Vienna', () => {
        const differences = [];
        for (const day of ['2024-03-31', '2024-10-27', '2023-03-26', '2023-10-29'])
            for (let h = 0; h <= 24; h++)
                for (let mi = 0; mi < 60; mi++) {
                    const text = `${day} ${pad(h)}:${pad(mi)}`;
                    if (toDate(text) !== wallTimeBefore(false, ...day.split('-'), pad(h), pad(mi)))
                        differences.push(text);
                }
        expect(differences).toEqual([]);
    });

    test('random columns of numbers, dates, categories and missing values', () => {
        const pool = [1, 2.5, NaN, Infinity, '3', ' 4 ', '1e3', '2024-06-01', '2024-06', '01.06.2024', '2024-06-01T13:00Z', 'Wien', 'Phase 1', '', ' ', null, undefined, 0, Date.UTC(2024, 0, 1),
            'NA', ' n/a ', ':', '-', '1,234', '<5'];
        const differences = [];
        for (let k = 0; k < 20000; k++) {
            const values = Array.from({ length: int(0, 8) }, () => pool[int(0, pool.length - 1)]);
            const hint = [undefined, 'numeric', 'continuous'][int(0, 2)];
            if (inferType(values, values.length, hint) !== inferTypeBefore(values, hint))
                differences.push([values, hint]);
        }
        expect(differences).toEqual([]);
    });
});
