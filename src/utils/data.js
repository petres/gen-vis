export { groupBy, parseData, dataFormat, dataFormats, isBinary, prepareData, convert, filter, addDimInfo, addScaledData, addStackedData, categoryOrder, toDate, addDataValues };

import * as d3 from "d3";
import { sameValue } from "@/utils/def";

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
    // the names and the positions of the scales which are the same for all rows,
    // e.g. of 0, a diverging domain has a middle entry, its last one is the max
    const scales = Object.values(infos).map(i => ({
        s: i.scale,
        dim: i.dim,
        stacked: i.mapping.stacked,
        scaled: `${i.dim}:scaled`,
        min: [`${i.dim}:scaled:min`, i.scale(i.domain[0])],
        zero: [`${i.dim}:scaled:0`, i.scale(0)],
        max: [`${i.dim}:scaled:max`, i.scale(i.domain.at(-1))],
        start: [`${i.dim}:start`, `${i.dim}:start:scaled`],
        end: [`${i.dim}:end`, `${i.dim}:end:scaled`],
        height: `${i.dim}:height:scaled`,
    }));
    for (const d of data) {
        for (const c of scales) {
            d[c.scaled] = c.s(d[c.dim]);
            d[c.min[0]] = c.min[1];
            d[c.zero[0]] = c.zero[1];
            d[c.max[0]] = c.max[1];
            if (c.stacked) {
                d[c.start[1]] = c.s(d[c.start[0]]);
                d[c.end[1]] = c.s(d[c.end[0]]);
                // the height of the bar of a stacked value, e.g. of an svg:rect
                d[c.height] = d[c.start[1]] - d[c.end[1]];
            }
        }
    }
}


// the groups are in the order of their first entry, the values of the keys
// are not joined, so e.g. 'a-b', 'c' and 'a', 'b-c' are different groups, they
// are the keys of nested maps
const groupBy = (data, keys) => {
    const root = new Map();
    const groups = [];
    const last = keys.length - 1;
    for (const item of data) {
        let m = root;
        for (let i = 0; i < last; i++) {
            const v = item[keys[i]];
            if (!m.has(v))
                m.set(v, new Map());
            m = m.get(v);
        }
        const v = last < 0 ? undefined : item[keys[last]];
        let g = m.get(v);
        if (!g) {
            g = { group: Object.fromEntries(keys.map(k => [k, item[k]])), entries: [] };
            m.set(v, g);
            groups.push(g);
        }
        g.entries.push(item);
    }
    return groups;
};


// always a new array, the facets are rendered again if their data changes, a
// list of keys is compared as strings, e.g. the keys of props with the numbers
// of JSON or parquet rows
const filter = (data, conditions) => {
    const tests = conditions.map(c => {
        const dim = c.dim;
        if (Array.isArray(c.key)) {
            const keys = new Set(c.key.map(String));
            return e => {
                const v = e[dim];
                return typeof v == 'string' ? keys.has(v) : (v !== null && v !== undefined && keys.has(String(v)));
            };
        }
        if (typeof c.key == 'function')
            return e => c.key(e[dim]);
        return e => e[dim] == c.key;
    });
    if (tests.length == 1)
        return data.filter(tests[0]);
    return data.filter(e => {
        for (const t of tests)
            if (!t(e))
                return false;
        return true;
    });
};


// the entries of form elements with the values of a column of the rows, e.g.
// "values": { "column": "year" }, distinct and ascending, numbers by their
// value, a global which is none of them (or missing) is the last value, e.g.
// the latest year
const addDataValues = (def, rows) => {
    const numeric = v => typeof v == 'number' || (typeof v == 'string' && v.trim() !== '' && !isNaN(+v));
    (def.formElements ?? []).filter(e => e.values && !Array.isArray(e.values)).forEach(e => {
        const values = [...new Set(rows.map(r => r[e.values.column]))].filter(v => v !== null && v !== undefined && v !== '');
        values.sort(values.every(numeric) ? (a, b) => a - b : (a, b) => String(a).localeCompare(String(b)));
        e.values = values.map(v => ({ id: String(v), name: String(v), value: v }));
        def.globals ??= {};
        if (values.length > 0 && !values.some(v => sameValue(v, def.globals[e.ref])))
            def.globals[e.ref] = values.at(-1);
    });
};
