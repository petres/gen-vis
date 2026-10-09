export { groupBy, parseData, dataFormat, dataFormats, isBinary, prepareData, updateData, convert, filter, stack, categoryOrder, toDate, addDataValues };

import * as d3 from "@/utils/d3";
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

// the values of mappings of the parsed rows in the prepared ones, e.g. of
// another column of a form element, the rows are the same objects
const updateData = (rows, data, def, names) => {
    const mapping = names.map(n => ({
        name: n,
        column: def.mapping[n].column,
        convert: converters[def.mapping[n].type] ?? (v => v),
    }));
    rows.forEach((r, i) => {
        const e = data[i];
        for (const c of mapping)
            e[c.name] = c.convert(r[c.column]);
    });
    return data;
};

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

// the stacks of the values of `axis.v` at the positions of `axis.h` (and of
// `dims`, e.g. the facets), in the order of `compare`, by default the one of
// the rows, positive and negative values separately, a map of the rows to the
// start and the end of their value
const stack = (rows, axis, dims = [], compare = null) => {
    const stacks = new Map();
    groupBy(rows, [...dims, axis.h]).forEach(g => {
        let positive = 0;
        let negative = 0;
        for (const e of compare ? [...g.entries].sort(compare) : g.entries) {
            const v = e[axis.v];
            if (v >= 0)
                stacks.set(e, [positive, positive += v]);
            else
                stacks.set(e, [negative, negative += v]);
        }
    });
    return stacks;
};

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
