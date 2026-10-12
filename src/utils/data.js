export { groupBy, parseData, dataFormat, dataFormats, isBinary, prepareData, updateData, convert, filter, stack, categoryOrder, toDate, addDataValues, distinctValues, usedColumns, columnValues };

import * as d3 from "@/utils/d3";
import { sameValue, templateRefs } from "@/utils/def";
import { transformColumns } from "@/utils/transform";
import { lazy } from "@/utils/lazy";

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
 * for parquet data, it reads only the `columns` given, all without them.
 */
const parseData = async (data, format, columns = null) => {
    if (isBinary(data)) {
        const { parseParquet } = await lazy.parquet();
        return parseParquet(data, columns);
    }
    if (Array.isArray(data))
        return data;
    if (typeof data != "string")
        throw new Error('expected rows, a string of CSV, TSV or JSON or parquet');
    if (format == 'parquet')
        throw new Error('Parquet data needs to be binary, e.g. an ArrayBuffer.');
    data = data.replace(/^\uFEFF/, '');
    if (format == 'tsv')
        return d3.tsvParse(data);
    if (format == 'json' || (format != 'csv' && /^\s*[[{]/.test(data))) {
        const rows = JSON.parse(data);
        if (!Array.isArray(rows))
            throw new Error('the JSON is not a list of rows');
        return rows;
    }
    return d3.csvParse(data);
};

const missing = v => v === null || v === undefined || (typeof v == 'string' && v.trim() === '');

// missing and invalid values are null, also integers of 64 bits, e.g. of parquet
const toNumber = v => {
    const n = missing(v) ? NaN : Number(v);
    return isNaN(n) ? null : n;
};

// a date without a time zone: of ISO, e.g. "2022-06-01", "2022-06", "2022"
// or "2022-06-01 13:00:00" (also with a T and the fraction of a second), and
// the day first of German and other languages, e.g. "01.06.2022 13:00"
const isoDate = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?)?)?$/;
const dayFirst = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?$/;

// the time of a date and a time of the time zone of a scale, local or UTC,
// NaN if it does not exist, e.g. "2022-02-30", which Date.parse reads as the
// 2nd of March
const wallTime = (utc, y, m = 1, d = 1, h = 0, mi = 0, s = 0, fraction = '') => {
    // years before 100 are not the ones of 1900, as of new Date(y, m, d)
    const date = new Date(0);
    const ms = Math.round(Number(`0.${fraction || 0}`)*1000);
    if (utc) {
        date.setUTCFullYear(+y, m - 1, +d);
        date.setUTCHours(+h, +mi, +s, ms);
    } else {
        date.setFullYear(+y, m - 1, +d);
        date.setHours(+h, +mi, +s, ms);
    }
    const [year, month, day] = utc
        ? [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()]
        : [date.getFullYear(), date.getMonth(), date.getDate()];
    const valid = year == +y && month == m - 1 && day == +d && +h < 24 && +mi < 60 && +s < 60;
    return valid ? date.getTime() : NaN;
};

// dates are strings, timestamps or Date objects. A date without a time zone,
// e.g. "2024-06-01" or "2024-06-01 13:00", is the one of the time zone of the
// scale, local or UTC (`utc`), so it is the same day everywhere (Date.parse
// reads a date without a time as midnight UTC, the day before west of UTC
// in local time). Others are read by Date.parse, e.g. with a time zone.
const toDate = (v, utc = false) => {
    if (missing(v))
        return null;
    let t;
    if (v instanceof Date)
        t = v.getTime();
    else if (typeof v == 'number' || typeof v == 'bigint')
        t = Number(v);
    else {
        const text = String(v).trim();
        const iso = isoDate.exec(text);
        const day = !iso && dayFirst.exec(text);
        t = iso ? wallTime(utc, ...iso.slice(1).map(p => p ?? undefined))
            : (day ? wallTime(utc, day[3], day[2], day[1], ...day.slice(4).map(p => p ?? undefined)) : Date.parse(text));
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

// the values of a column of the data by the index of a row, of a transform
// (`columns`, see utils/transform.js) or of the rows
const columnValues = (rows, columns, column) => columns?.has(column)
    ? (values => i => values[i])(columns.get(column))
    : i => rows[i]?.[column];

// the values of mappings of the parsed rows in the prepared ones, e.g. of
// another column of a form element, the rows are the same objects
const updateData = (rows, data, def, names, columns = null) => {
    const mapping = names.map(n => ({
        name: n,
        value: columnValues(rows, columns, def.mapping[n].column),
        convert: converter(def.mapping[n]),
    }));
    rows.forEach((r, i) => {
        const e = data[i];
        for (const c of mapping)
            e[c.name] = c.convert(c.value(i));
    });
    return data;
};

// maps the parsed rows to the mappings, e.g. column `share` to `y`, also the
// columns of transforms
const prepareData = (data, def, columns = null) => {
    const mapping = Object.keys(def.mapping).map(n => ({
        name: n,
        value: columnValues(data, columns, def.mapping[n].column),
        convert: converter(def.mapping[n]),
    }));

    return data.map((d, i) => {
        const e = {};
        mapping.forEach(c => {
            e[c.name] = c.convert(c.value(i));
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


/**
 * The columns of the data a definition can use, null if they are not known:
 * the ones of the mappings, also of the patches of form elements, and of the
 * values of form elements. A column template is a column of every value of
 * its globals, e.g. "{values}{share}" of the entries of two form elements,
 * a global of a form element with the values of a column has unknown ones.
 */
const usedColumns = def => {
    const elements = def.formElements ?? [];
    // the values of a global, the one of the definition and the ones of its form elements
    const valuesOf = ref => {
        const own = elements.filter(e => e.ref == ref);
        if (own.some(e => !Array.isArray(e.values)))
            return null;
        return [...new Set([def.globals?.[ref], ...own.flatMap(e => e.values.map(v => v.value))].map(String))];
    };
    const expand = column => {
        if (typeof column != 'string')
            return [];
        let columns = [column];
        for (const ref of new Set(templateRefs(column))) {
            const values = valuesOf(ref);
            if (values === null)
                return null;
            columns = columns.flatMap(c => values.map(v => c.replaceAll(`{${ref}}`, v)));
        }
        return columns;
    };
    const columns = [
        ...Object.values(def.mapping ?? {}).map(m => m?.column),
        ...elements.flatMap(e => Array.isArray(e.values) ? e.values.flatMap(v => Object.values(v.mapping ?? {}).map(m => m?.column)) : []),
        ...transformColumns(def.transform),
    ].map(expand);
    if (columns.includes(null))
        return null;
    return [...new Set([...columns.flat(), ...elements.map(e => e.values?.column).filter(c => typeof c == 'string')])];
};

// the distinct values of a column of the rows (or of a transform, see
// columnValues), without missing ones, ascending, numbers by their value
const distinctValues = (rows, columns, column) => {
    const numeric = v => typeof v == 'number' || (typeof v == 'string' && v.trim() !== '' && !isNaN(+v));
    const value = columnValues(rows, columns, column);
    const values = [...new Set(rows.map((r, i) => value(i)))].filter(v => v !== null && v !== undefined && v !== '');
    return values.sort(values.every(numeric) ? (a, b) => a - b : (a, b) => String(a).localeCompare(String(b)));
};

// the entries of form elements with the values of a column of the rows, e.g.
// "values": { "column": "year" }, distinct and ascending, numbers by their
// value, a global which is none of them (or missing) is the last value, e.g.
// the latest year
const addDataValues = (def, rows, columns = null) => {
    (def.formElements ?? []).filter(e => e?.values && !Array.isArray(e.values)).forEach(e => {
        const values = distinctValues(rows, columns, e.values.column);
        e.values = values.map(v => ({ id: String(v), name: String(v), value: v }));
        def.globals ??= {};
        if (values.length > 0 && !values.some(v => sameValue(v, def.globals[e.ref])))
            def.globals[e.ref] = values.at(-1);
    });
};
