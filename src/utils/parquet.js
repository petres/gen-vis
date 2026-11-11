// loaded by parseData only if there is parquet data, e.g. a bundler of the host
// application puts it into a chunk of its own
export { parseParquet };

import { parquetMetadata, parquetReadObjects, parquetSchema } from 'hyparquet';

// snappy, the default of arrow, pandas and duckdb, is part of hyparquet, the
// decompressors of the other compressions are loaded one by one, only the
// ones of the file, e.g. zstd of polars (3 kB), not all of
// hyparquet-compressors (75 kB, most of it brotli)
const builtIn = ['UNCOMPRESSED', 'SNAPPY'];
const decompressors = {
    GZIP: async () => {
        const { gunzip } = await import('hyparquet-compressors/src/gzip.js');
        return (input, length) => gunzip(input, new Uint8Array(length));
    },
    ZSTD: async () => {
        const { decompress } = await import('fzstd');
        return input => decompress(input);
    },
    BROTLI: async () => (await import('hyparquet-compressors/src/brotli.js')).decompressBrotli,
    LZ4: async () => (await import('hyparquet-compressors/src/lz4.js')).decompressLz4,
    LZ4_RAW: async () => (await import('hyparquet-compressors/src/lz4.js')).decompressLz4Raw,
};
const loadCompressors = async codecs => {
    const others = [...new Set(codecs.filter(c => !builtIn.includes(c)))];
    if (others.length == 0)
        return undefined;
    const unknown = others.filter(c => !Object.hasOwn(decompressors, c));
    if (unknown.length)
        throw new Error(`Unknown compression of parquet: ${unknown.join(', ')}`);
    return Object.fromEntries(await Promise.all(others.map(async c => [c, await decompressors[c]()])));
};

const decoder = new TextDecoder();

// integers of 64 bits are numbers if they are exact, e.g. years, otherwise
// strings, e.g. ids, also in lists, timestamps (of UTC) are the texts of
// ISO with a Z, e.g. "2024-06-01T13:00:00.000Z", so their column is one of
// dates, not of numbers, dates (without a time) and timestamps without a
// time zone are strings as the ones of csv, e.g. "2024-06-01" or
// "2024-06-01T13:00:00.000", so they are the same day and time in every
// time zone, see toDate of utils/data.js,
// floats of 32 bits are the shortest decimals of them, as the ones of csv,
// e.g. 22.1637 (not 22.163700103759766), bytes are text, e.g. of writers
// without the type STRING, values of lists and structs are the ones of their
// columns, `node` is the one of the schema of the value
const normalize = (v, node) => {
    if (v === null || v === undefined)
        return v;
    const { leaf, e, decimal, kind } = columnOf(node);
    if (Array.isArray(v))
        return v.map(w => normalize(w, leaf));
    if (decimal)
        return exact(v, decimal);
    if (typeof v == 'bigint')
        return Number.isSafeInteger(Number(v)) ? Number(v) : String(v);
    if (v instanceof Uint8Array)
        return !e || e.type == 'BYTE_ARRAY' ? decoder.decode(v) : v;
    if (v instanceof Date)
        return isNaN(v) ? null : (kind == 'date' ? v.toISOString().slice(0, 10) : v.toISOString().slice(0, kind == 'local' ? 23 : 24));
    if (typeof v == 'number')
        // the days of a date of only the logical type, the reader keeps them
        return kind == 'date' ? new Date(v*86400000).toISOString().slice(0, 10) : (e?.type == 'FLOAT' ? shortest(v) : v);
    if (typeof v == 'object' && !ArrayBuffer.isView(v))
        return Object.fromEntries(Object.entries(v).map(([k, w]) => [k, normalize(w, leaf?.children.find(c => c.element.name == k))]));
    return v;
};

// the column of a node of the schema, of a group of a single child the one
// of its values, e.g. of the elements of a list (the list, its repeated
// group and the element), once per node, not per value
const nodeColumns = new WeakMap();
const columnOf = node => {
    if (!node)
        return {};
    if (!nodeColumns.has(node)) {
        let leaf = node;
        while (leaf.children.length == 1)
            leaf = leaf.children[0];
        const e = leaf.children.length ? null : leaf.element;
        nodeColumns.set(node, { leaf, e, decimal: e && decimalOf(e), kind: e && kindOf(e) });
    }
    return nodeColumns.get(node);
};

// the shortest decimal of a float of 32 bits, the one which is the same
// float, the nearest decimal of a number of digits is it if any one is
const shortest = v => {
    if (!Number.isFinite(v))
        return v;
    for (let p = 1; p < 9; p++) {
        const d = Number(v.toPrecision(p));
        if (Math.fround(d) === v)
            return d;
    }
    return Number(v.toPrecision(9));
};

// the columns of dates without a time and of timestamps without a time zone
// (e.g. of pandas, polars and duckdb), the reader reads them as UTC
const kindOf = e => e.converted_type == 'DATE' || e.logical_type?.type == 'DATE' ? 'date'
    : (e.logical_type?.type == 'TIMESTAMP' && e.logical_type.isAdjustedToUTC === false ? 'local' : null);

// the columns of decimals (INT32, INT64, FIXED_LEN_BYTE_ARRAY or BYTE_ARRAY
// with a scale, e.g. doubles written as DECIMAL(9, 4), less than half the
// size), their scale and whether the reader scaled them: it reads the ones of
// the converted type DECIMAL as Number(unscaled) * 10 ** -scale, e.g.
// 22.163700000000002, the ones of only the logical type not at all, e.g. the
// bytes of the integer
const decimalOf = e => e.converted_type == 'DECIMAL' ? { scale: e.scale || 0, scaled: true }
    : (e.logical_type?.type == 'DECIMAL' ? { scale: e.logical_type.scale || 0, scaled: false } : null);

// the integer of bytes, big-endian two's complement, e.g. of a decimal
const fromBytes = bytes => {
    let n = 0n;
    for (const b of bytes)
        n = n*256n + BigInt(b);
    return bytes.length && bytes[0] >= 128 ? n - (1n << BigInt(8*bytes.length)) : n;
};

// the double nearest to a decimal, the one of the same text in a csv, e.g.
// 22.1637: the unscaled integer divided by an exact power of ten, the text
// of a large one, a scaled value stays if its unscaled one is no safe
// integer, e.g. of DECIMAL(18, x)
const exact = (v, { scale, scaled }) => {
    const f = 10 ** scale;
    if (!scaled) {
        const n = v instanceof Uint8Array ? fromBytes(v) : v;
        if (typeof n == 'bigint')
            return Number.isSafeInteger(Number(n)) ? Number(n)/f : Number(`${n}e-${scale}`);
        return typeof n == 'number' ? n/f : v;
    }
    const unscaled = typeof v == 'number' ? Math.round(v*f) : NaN;
    return Number.isSafeInteger(unscaled) ? unscaled/f : v;
};

// the rows of a parquet file, an ArrayBuffer or a view of one, only the
// `columns` of the file which are given, e.g. the ones a definition uses, all
// without them, a file is read by its columns, so the others are skipped
const parseParquet = async (data, columns = null) => {
    const file = Object.prototype.toString.call(data) == '[object ArrayBuffer]' ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const metadata = parquetMetadata(file);
    const columnNodes = new Map(parquetSchema(metadata).children.map(c => [c.element.name, c]));
    const names = [...columnNodes.keys()];
    const read = columns && names.filter(n => columns.includes(n));
    const used = new Set(read?.length ? read : names);
    // the compressions of the columns which are read
    const codecs = [...new Set(metadata.row_groups.flatMap(g => g.columns
        .filter(c => used.has(c.meta_data?.path_in_schema?.[0]))
        .map(c => c.meta_data?.codec)))];
    // bytes stay bytes (`utf8: false`), e.g. of decimals of only the logical
    // type, normalize reads the others as text
    const rows = await parquetReadObjects({ file, metadata, columns: [...used], compressors: await loadCompressors(codecs), utf8: false });
    rows.forEach(row => Object.keys(row).forEach(k => row[k] = normalize(row[k], columnNodes.get(k))));
    return rows;
};
