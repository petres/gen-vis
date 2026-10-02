// loaded by parseData only if there is parquet data, e.g. a bundler of the host
// application puts it into a chunk of its own
export { parseParquet };

import { parquetMetadata, parquetReadObjects } from 'hyparquet';

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
// strings, e.g. ids, dates are timestamps, as the ones of Date.parse
const normalize = v => {
    if (typeof v == 'bigint')
        return Number.isSafeInteger(Number(v)) ? Number(v) : String(v);
    if (v instanceof Date)
        return v.getTime();
    return v;
};

// the rows of a parquet file, an ArrayBuffer or a view of one
const parseParquet = async data => {
    const file = data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const metadata = parquetMetadata(file);
    const codecs = [...new Set(metadata.row_groups.flatMap(g => g.columns.map(c => c.meta_data?.codec)))];
    const rows = await parquetReadObjects({ file, metadata, compressors: await loadCompressors(codecs) });
    rows.forEach(row => Object.keys(row).forEach(k => row[k] = normalize(row[k])));
    return rows;
};
