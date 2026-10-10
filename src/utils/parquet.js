// loaded by parseData only if there is parquet data, e.g. a bundler of the host
// application puts it into a chunk of its own
export { parseParquet };

import { parquetMetadata, parquetReadObjects, parquetSchema } from 'hyparquet';

// snappy, the default of arrow, pandas and duckdb, is part of hyparquet, other
// compressions, e.g. zstd of polars, need hyparquet-compressors, it is only
// loaded for them, the standalone script does not have it
const builtIn = ['UNCOMPRESSED', 'SNAPPY'];
const loadCompressors = async codecs => {
    const others = codecs.filter(c => !builtIn.includes(c));
    if (others.length == 0)
        return undefined;
    if (__GEN_VIS_STANDALONE__)
        throw new Error(`The standalone script reads parquet with snappy or without compression, not ${others.join(', ')}.`);
    return (await import('hyparquet-compressors')).compressors;
};

// integers of 64 bits are numbers if they are exact, e.g. years, otherwise
// strings, e.g. ids, timestamps are the ones of Date.parse, dates (without a
// time) are strings as the ones of csv, e.g. "2024-06-01", so they are the
// same day in every time zone, see toDate of utils/data.js
const normalize = (v, date) => {
    if (typeof v == 'bigint')
        return Number.isSafeInteger(Number(v)) ? Number(v) : String(v);
    if (v instanceof Date)
        return date ? v.toISOString().slice(0, 10) : v.getTime();
    return v;
};

// the columns of dates without a time, read as midnight UTC
const isDate = e => e.converted_type == 'DATE' || e.logical_type?.type == 'DATE';

// the rows of a parquet file, an ArrayBuffer or a view of one, only the
// `columns` of the file which are given, e.g. the ones a definition uses, all
// without them, a file is read by its columns, so the others are skipped
const parseParquet = async (data, columns = null) => {
    const file = data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const metadata = parquetMetadata(file);
    const names = parquetSchema(metadata).children.map(c => c.element.name);
    const read = columns && names.filter(n => columns.includes(n));
    const used = new Set(read?.length ? read : names);
    // the compressions of the columns which are read
    const codecs = [...new Set(metadata.row_groups.flatMap(g => g.columns
        .filter(c => used.has(c.meta_data?.path_in_schema?.[0]))
        .map(c => c.meta_data?.codec)))];
    const rows = await parquetReadObjects({ file, metadata, columns: [...used], compressors: await loadCompressors(codecs) });
    const dates = new Set(metadata.schema.filter(isDate).map(e => e.name));
    rows.forEach(row => Object.keys(row).forEach(k => row[k] = normalize(row[k], dates.has(k))));
    return rows;
};
