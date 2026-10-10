export { groupBy, parseData, dataFormat, dataFormats, isBinary, prepareData, updateData, convert, filter, stack, categoryOrder, toDate, addDataValues };

import * as d3 from "@/utils/d3";
import { fillTemplate, sameValue } from "@/utils/def";

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

// a date without a time, e.g. "2022-06-01", "2022-06" or "2022"
const dateOnly = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

// the midnight of a date without a time, local or UTC, NaN if it does not
// exist, e.g. "2022-02-30", which Date.parse reads as the 2nd of March
const midnight = ([, y, m = 1, d = 1], utc) => {
    // years before 100 are not the ones of 1900, as of new Date(y, m, d)
    const date = new Date(0);
    if (utc) {
        date.setUTCFullYear(+y, m - 1, +d);
    } else {
        date.setFullYear(+y, m - 1, +d);
        date.setHours(0, 0, 0, 0);
    }
    const [year, month, day] = utc
        ? [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()]
        : [date.getFullYear(), date.getMonth(), date.getDate()];
    return year == +y && month == m - 1 && day == +d ? date.getTime() : NaN;
};

// dates are strings, timestamps or Date objects. Date.parse reads a date
// without a time as midnight UTC, so it is the day before west of UTC in the
// local time of a `time` scale, it is the midnight of the time zone of the
// scale, local or UTC (`utc`), so it is the same day everywhere
const toDate = (v, utc = false) => {
    if (missing(v))
        return null;
    let t;
    if (v instanceof Date)
        t = v.getTime();
    else if (typeof v == 'number' || typeof v == 'bigint')
        t = Number(v);
    else {
        const day = dateOnly.exec(String(v).trim());
        t = day ? midnight(day, utc) : Date.parse(v);
    }
    return isNaN(t) ? null : t;
};

// the conversion of the values of a mapping, e.g. the dates of a `utc` scale
const converter = mapping => {
    if (mapping?.type == 'numeric')
        return toNumber;
    if (mapping?.type == 'date') {
        const utc = mapping.scale?.type == 'utc';
        return v => toDate(v, utc);
    }
    return v => v;
};

// a value as the ones of the rows of a mapping, e.g. "2022-06-01" of a date
const convert = (mapping, v) => converter(mapping)(v);

// the values of mappings of the parsed rows in the prepared ones, e.g. of
// another column of a form element, the rows are the same objects
const updateData = (rows, data, def, names) => {
    const mapping = names.map(n => ({
        name: n,
        column: def.mapping[n].column,
        convert: converter(def.mapping[n]),
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
        convert: converter(def.mapping[n]),
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
// order of the `categories` of the props, `orders` are the dims with their ordered keys
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
    const distinct = column => {
        const values = [...new Set(rows.map(r => r[column]))].filter(v => v !== null && v !== undefined && v !== '');
        return values.sort(values.every(numeric) ? (a, b) => a - b : (a, b) => String(a).localeCompare(String(b)));
    };

    // the categories of the data which are not listed, after the listed ones
    Object.values(def.mapping ?? {}).filter(m => m?.props?.fromData && typeof m.column == 'string').forEach(m => {
        m.props.categories ??= {};
        distinct(fillTemplate(m.column, def.globals)).map(String).filter(k => !Object.hasOwn(m.props.categories, k))
            .forEach(k => m.props.categories[k] = {});
    });

    (def.formElements ?? []).filter(e => e.values && !Array.isArray(e.values)).forEach(e => {
        const values = distinct(e.values.column);
        e.values = values.map(v => ({ id: String(v), name: String(v), value: v }));
        def.globals ??= {};
        if (values.length > 0 && !values.some(v => sameValue(v, def.globals[e.ref])))
            def.globals[e.ref] = values.at(-1);
    });
};
