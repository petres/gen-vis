export { groupBy, parseData, dataFormat, dataFormats, isBinary, prepareData, convert, filter, addDimInfo, addScaledData, addStackedData, categoryOrder, toDate };

import * as d3 from "d3";

const dataFormats = ['csv', 'tsv', 'json', 'parquet'];

// the format of the data of a url, the given one or the one of its extension,
// undefined if it is neither, see parseData
const dataFormat = (url, format) => format ??
    dataFormats.find(f => new URL(url, 'file:///').pathname.toLowerCase().endsWith(`.${f}`));

const isBinary = data => data instanceof ArrayBuffer || ArrayBuffer.isView(data);

/**
 * The rows of the data: binary data is parquet, strings are parsed in their
 * `format`, without one as JSON (a list of rows) or CSV by their content,
 * already parsed rows are passed through. The parquet reader is only loaded
 * for parquet data.
 */
const parseData = async (data, format) => {
    if (isBinary(data)) {
        const { parseParquet } = await import('@/utils/parquet.js');
        return parseParquet(data);
    }
    if (typeof data != "string")
        return data;
    if (format == 'parquet')
        throw new Error('Parquet data needs to be binary, e.g. an ArrayBuffer.');
    data = data.replace(/^\uFEFF/, '');
    if (format == 'tsv')
        return d3.tsvParse(data);
    if (format == 'json' || (format != 'csv' && /^\s*\[/.test(data)))
        return JSON.parse(data);
    return d3.csvParse(data);
};

const missing = v => v === null || v === undefined || (typeof v == 'string' && v.trim() === '');

// missing and invalid values are null, also integers of 64 bits, e.g. of parquet
const toNumber = v => {
    const n = missing(v) ? NaN : Number(v);
    return isNaN(n) ? null : n;
};

// dates are strings, timestamps or Date objects
const toDate = v => {
    const t = missing(v) ? NaN :
        (v instanceof Date ? v.getTime() : (typeof v == 'number' || typeof v == 'bigint' ? Number(v) : Date.parse(v)));
    return isNaN(t) ? null : t;
};

const converters = { numeric: toNumber, date: toDate };

// a value as the ones of the rows of a mapping, e.g. "2022-06-01" of a date
const convert = (mapping, v) => (converters[mapping?.type] ?? (v => v))(v);

// maps the parsed rows to the mappings, e.g. column `share` to `y`
const prepareData = (data, def) => {
    const mapping = Object.keys(def.mapping).map(n => ({
        name: n,
        column: def.mapping[n].column,
        convert: converters[def.mapping[n].type] ?? (v => v),
    }));

    return data.map(d => {
        const e = {};
        mapping.forEach(c => {
            e[c.name] = c.convert(d[c.column]);
        });
        return e;
    })
};

const addDimInfo = (info, data) => {
    // get unique values
    info.values = [...new Set(data.map(d => d[info.dim]))];
    if (info.mapping.type == 'numeric' || info.mapping.type == 'date' ) {
        // sorted for the lookup of the nearest value
        info.values = info.values.filter(v => v !== null).sort((a, b) => a - b);
        if (info.mapping.stacked) {
            // the starts of the stacks, e.g. 0, are part of the extent
            info.extent = d3.extent(data.flatMap(d => [d[`${info.dim}:start`], d[`${info.dim}:end`]]));
        } else {
            info.extent = d3.extent(info.values);
        }
    }
}


// compares rows by the order of the categories in the definition, e.g. the
// order of the `manual` props, `orders` are the dims with their ordered keys
const categoryOrder = orders => {
    const ranks = orders.map(({ dim, keys }) => ({ dim, rank: new Map(keys.map((k, i) => [String(k), i])) }));
    return (a, b) => {
        for (const { dim, rank } of ranks) {
            const d = (rank.get(String(a[dim])) ?? Infinity) - (rank.get(String(b[dim])) ?? Infinity);
            if (d)
                return d;
        }
        return 0;
    };
};

// the values are stacked in the order of `compare`, by default in the order of the rows
const addStackedData = (data, axis, dims = [], compare = null) => {
    groupBy(data, [...dims, axis.h]).forEach(g => {
        let tp = 0;
        let tn = 0;
        const entries = compare ? [...g.entries].sort(compare) : g.entries;
        entries.forEach(e => {
            const v = e[axis.v];
            if (v >= 0) {
                e[`${axis.v}:start`] = tp;
                tp += v;
                e[`${axis.v}:end`] = tp;
            } else {
                e[`${axis.v}:start`] = tn;
                tn += v;
                e[`${axis.v}:end`] = tn;
            }
        });
    });
}


const addScaledData = (data, infos) => {
    data.forEach(d => {
        Object.values(infos).forEach(i => {
            d[`${i.dim}:scaled`] = i.scale(d[i.dim]);

            d[`${i.dim}:scaled:min`] = i.scale(i.domain[0]);
            d[`${i.dim}:scaled:0`] = i.scale(0);
            d[`${i.dim}:scaled:max`] = i.scale(i.domain[1]);

            if (i.mapping.stacked) {
                d[`${i.dim}:start:scaled`] = i.scale(d[`${i.dim}:start`]);
                d[`${i.dim}:end:scaled`] = i.scale(d[`${i.dim}:end`]);
                // the height of the bar of a stacked value, e.g. of an svg:rect
                d[`${i.dim}:height:scaled`] = d[`${i.dim}:start:scaled`] - d[`${i.dim}:end:scaled`];
            }
        });
    })
}


// the groups are in the order of their first entry, the values of the keys
// are not joined, so e.g. 'a-b', 'c' and 'a', 'b-c' are different groups
const groupBy = (data, keys) => {
    const groups = new Map();
    data.forEach(item => {
        const key = JSON.stringify(keys.map(k => item[k]));
        if (!groups.has(key))
            groups.set(key, { group: Object.fromEntries(keys.map(k => [k, item[k]])), entries: [] });
        groups.get(key).entries.push(item);
    });
    return [...groups.values()];
};


// always a new array, the facets are rendered again if their data changes, a
// list of keys is compared as strings, e.g. the keys of props with the numbers
// of JSON or parquet rows
const filter = (data, conditions) => {
    const tests = conditions.map(c => {
        if (Array.isArray(c.key)) {
            const keys = new Set(c.key.map(String));
            return e => e[c.dim] !== null && e[c.dim] !== undefined && keys.has(String(e[c.dim]));
        }
        if (typeof c.key == 'function')
            return e => c.key(e[c.dim]);
        return e => e[c.dim] == c.key;
    });
    return data.filter(e => tests.every(t => t(e)));
};
