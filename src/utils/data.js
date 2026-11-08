export { sourceRows, groupBy, inferTypes, inferType, keptRows, rowFilter, filterRows, withoutConditions, rawRow, rawIndex, rowResolver, parseData, dataFormat, dataFormats, isBinary, prepareData, updateData, convert, continuous, scaleDef, filter, stack, categoryOrder, toDate, toNumber, addDataValues, updateDataValues, distinctValues, usedColumns, columnValues };

import * as d3 from "@/utils/d3";
import { fillTemplate, inLanguage, sameValue, templateRefs, variants } from "@/utils/def";
import { transformColumns } from "@/utils/transform";
import { lazy } from "@/utils/lazy";
import { bind, constant, evaluate, isOperator, refNames } from "@/utils/expr";
import { comparison, compareCategories, isObject, missing, toNumber } from "@/utils/values";

const dataFormats = ['csv', 'tsv', 'json', 'parquet'];

// the format of the data of a url, the given one or the one of its extension,
// undefined if it is neither, then its content tells, see parseData
const dataFormat = (url, format) => format ??
    dataFormats.find(f => new URL(url, 'file:///').pathname.toLowerCase().endsWith(`.${f}`));

const isBinary = data => data instanceof ArrayBuffer || ArrayBuffer.isView(data);

const bytesOf = data => data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

// parquet files begin with PAR1
const isParquet = data => {
    const b = bytesOf(data);
    return b.length >= 4 && b[0] == 0x50 && b[1] == 0x41 && b[2] == 0x52 && b[3] == 0x31;
};

/**
 * The rows of the data: binary data is parquet if it begins with PAR1 (or
 * of the `format` parquet), otherwise the text of its bytes (UTF-8), strings
 * are parsed in their `format`, without one as JSON (a list of rows) or CSV
 * by their content, already parsed rows are passed through. The parquet
 * reader is only loaded for parquet data, it reads only the `columns`
 * given, all without them.
 */
const parseData = async (data, format, columns = null) => {
    if (isBinary(data)) {
        if (format == 'parquet' || isParquet(data)) {
            const { parseParquet } = await lazy.parquet();
            return parseParquet(data, columns);
        }
        data = new TextDecoder().decode(bytesOf(data));
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

// a date without a time zone: of ISO, e.g. "2022-06-01", "2022-06", "2022"
// or "2022-06-01 13:00:00" (also with a T and the fraction of a second), and
// the day first of German and other languages, e.g. "01.06.2022 13:00"
const isoDate = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?)?)?$/;
const dayFirst = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?$/;
// a date and a time with a time zone of ISO, Z or an offset, e.g.
// "2024-06-01T13:00:00Z" or "2024-06-01 13:00+02:00", of every scale the same time
const isoZoned = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?\s?(?:([Zz])|([+-])(\d{2})(?::?(\d{2}))?)$/;

// the days of the months of a year which is no leap year
const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
// the milliseconds of 400 years, the leap years repeat after them
const cycle = 146097*86400000;

// the time of a date and a time of the time zone of a scale, local or UTC,
// NaN if it does not exist, e.g. "2022-02-30", which Date.parse reads as the
// 2nd of March, 24:00 is the midnight at the end of the day, a fraction of a
// second is cut to milliseconds, e.g. of pandas
const wallTime = (utc, y, m = 1, d = 1, h = 0, mi = 0, s = 0, fraction = '') => {
    y = +y; m = +m; d = +d; h = +h; mi = +mi; s = +s;
    const ms = fraction ? +`${fraction}00`.slice(0, 3) : 0;
    const end = h == 24 && mi == 0 && s == 0 && ms == 0;
    const days = m == 2 && ((y % 4 == 0 && y % 100 != 0) || y % 400 == 0) ? 29 : monthDays[m - 1];
    if (!(d >= 1 && d <= days && (end || h < 24) && mi < 60 && s < 60))
        return NaN;
    // years before 100 are not the ones of 1900, as of new Date(y, m, d), but
    // the ones of 400 years later, before them
    const early = y < 100;
    const args = [early ? y + 400 : y, m - 1, d + (end ? 1 : 0), end ? 0 : h, mi, s, ms];
    return (utc ? Date.UTC(...args) : new Date(...args).getTime()) - (early ? cycle : 0);
};

// the time of a date with a time zone, see isoZoned, NaN if it does not exist
const zonedTime = ([, y, m, d, h, mi, s, fraction, z, sign, oh, om = '00']) => {
    if (z)
        return wallTime(true, y, m, d, h, mi, s, fraction);
    if (+oh > 23 || +om > 59)
        return NaN;
    return wallTime(true, y, m, d, h, mi, s, fraction) - (sign == '-' ? -1 : 1)*(oh*60 + +om)*60000;
};

// dates are strings, timestamps or Date objects. A date without a time zone,
// e.g. "2024-06-01" or "2024-06-01 13:00", is the one of the time zone of the
// scale, local or UTC (`utc`), so it is the same day everywhere (Date.parse
// reads a date without a time as midnight UTC, the day before west of UTC
// in local time). A date with a time zone is the one of ISO, e.g.
// "2024-06-01T13:00:00Z", other strings are no dates, e.g. "Phase 1", which
// Date.parse of some browsers reads as one.
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
        const zoned = !iso && !day && isoZoned.exec(text);
        t = iso ? wallTime(utc, ...iso.slice(1).map(p => p ?? undefined))
            : (day ? wallTime(utc, day[3], day[2], day[1], ...day.slice(4).map(p => p ?? undefined))
                : (zoned ? zonedTime(zoned.map(p => p ?? undefined)) : NaN));
    }
    return isNaN(t) ? null : t;
};

// the values of the mapping are numbers or dates (timestamps), the others,
// also of a mapping without a type, are categories
const continuous = mapping => mapping?.type == 'numeric' || mapping?.type == 'date';

// the categories are strings, as the values of csv, so the values of JSON and
// parquet are the same ones, e.g. the year 2004 is "2004" of every format, a
// missing one is null, also an empty cell of csv, as the null of JSON
const toCategory = v => missing(v) ? null : String(v);

// the definition of the scale of a mapping, of a mapping with the scale of
// another one (`"scale": { "of": "y" }`) the one of the other one, of the
// `mappings` of the definition
const scaleDef = (mappings, m) => m?.scale?.of !== undefined ? mappings?.[m.scale.of]?.scale : m?.scale;

// the conversion of the values of a mapping, e.g. the dates of a `utc` scale
// (also the one of another mapping, of the `mappings` of the definition) or
// the categories as strings
const converter = (mapping, mappings) => {
    if (mapping?.type == 'numeric')
        return toNumber;
    if (mapping?.type == 'date') {
        const utc = scaleDef(mappings, mapping)?.type == 'utc';
        return v => toDate(v, utc);
    }
    return toCategory;
};

// a value as the ones of the rows of a mapping, e.g. "2022-06-01" of a date,
// of the time zone of its scale, also the one of another mapping (`"scale":
// { "of": "x" }`) of the `mappings` of the definition
const convert = (mapping, v, mappings) => converter(mapping, mappings)(v);

// the prepared rows of the filters of the transforms (`columns.kept`, see
// utils/transform-types.js), all without one
const keptRows = (data, columns) => columns?.kept ? columns.kept.map(i => data[i]) : data;

// the rows of the data, or the ones of a transform of rows (`columns.rows`,
// e.g. the classes of a bin, see utils/transform-types.js), the columns of
// the transforms are the ones of these rows
const sourceRows = (rows, columns) => columns?.rows ?? rows;

// the values of a column of the data by the index of a row, of a transform
// (`columns`, see utils/transform.js) or of the rows
const columnValues = (rows, columns, column) => {
    const source = sourceRows(rows, columns);
    return columns?.has(column) ? (values => i => values[i])(columns.get(column)) : i => source[i]?.[column];
};

// the values of mappings of the parsed rows in the prepared ones, e.g. of
// another column of a form element, the rows are the same objects
const updateData = (rows, data, def, names, columns = null) => {
    const mapping = names.map(n => ({
        name: n,
        value: columnValues(rows, columns, def.mapping[n].column),
        convert: converter(def.mapping[n], def.mapping),
    }));
    sourceRows(rows, columns).forEach((r, i) => {
        const e = data[i];
        for (const c of mapping)
            e[c.name] = c.convert(c.value(i));
    });
    return data;
};

// the row of the data a prepared row was made of and its index, e.g. for
// the columns of a filter which are no mappings, see rowResolver
const rawRow = Symbol('rawRow');
const rawIndex = Symbol('rawIndex');

// maps the parsed rows to the mappings, e.g. column `share` to `y`, also the
// columns of transforms
const prepareData = (data, def, columns = null) => {
    const mapping = Object.keys(def.mapping).map(n => ({
        name: n,
        value: columnValues(data, columns, def.mapping[n].column),
        convert: converter(def.mapping[n], def.mapping),
    }));

    return sourceRows(data, columns).map((d, i) => {
        const e = {};
        mapping.forEach(c => {
            e[c.name] = c.convert(c.value(i));
        });
        // not enumerable, so a prepared row is only its values, e.g. of a copy of it
        Object.defineProperty(e, rawRow, { value: d });
        Object.defineProperty(e, rawIndex, { value: i });
        return e;
    })
};

/**
 * The resolver of the names of an expression of a row, e.g. of a filter:
 * the value of a mapping of the prepared row, else of a column of the
 * transforms (`columns`) or of the data (see rawRow), else of the `scope`,
 * e.g. a global; as the functions of the row of `bind`.
 */
const rowResolver = (mapping, columns, scope = {}) => name => {
    if (typeof name == 'symbol')
        return Object.hasOwn(scope, name) ? constant(scope[name]) : undefined;
    if (Object.hasOwn(mapping, name)) {
        // a date as the text of the data, e.g. "2022-06-01", so it compares
        // with the texts of globals and of the definition, not as its timestamp
        const m = mapping[name];
        if (m?.type == 'date' && typeof m.column == 'string')
            return row => row[rawRow] ? (row[rawRow][m.column] ?? row[name]) : row[name];
        return row => row[name];
    }
    if (columns?.has(name)) {
        const values = columns.get(name);
        return row => row[rawIndex] === undefined ? undefined : values[row[rawIndex]];
    }
    // a column of the data before a global of the same name, e.g. a column
    // `country` beside the global `country` of a select (`@globals.country`)
    if (Object.hasOwn(scope, name)) {
        const value = scope[name];
        return row => {
            const raw = row?.[rawRow];
            return raw && Object.hasOwn(raw, name) ? raw[name] : value;
        };
    }
    return row => row[rawRow]?.[name];
};

/**
 * The rows of a filter `spec`: an expression of the row (see rowResolver,
 * the names are the mappings, the columns and the `scope`), e.g.
 * `"@year == @selected"`, true are all rows; or the conditions of mappings
 * of 4.x, see rowFilter. `path` names it in errors, `unknown(path, dim)`
 * reports a condition of no mapping.
 */
const filterRows = (rows, spec, mapping, scope = {}, { columns = null, path = 'filter', unknown = null } = {}) => {
    if (spec === undefined || spec === null || spec === true)
        return rows;
    if (spec === false)
        return [];
    if (isObject(spec) && !isOperator(spec)) {
        const conditions = rowFilter(spec, mapping, scope, path, unknown);
        return conditions.length > 0 ? filter(rows, conditions) : rows;
    }
    const test = bind(spec, rowResolver(mapping, columns, scope));
    if (test.constant)
        return truthy(test()) ? rows : [];
    return rows.filter(row => truthy(test(row)));
};

// false, 0, "", null, no value, NaN and empty lists are false, as the
// conditions of expressions
const truthy = v => Array.isArray(v) ? v.length > 0 : Boolean(v);

/**
 * A filter expression without its conditions of the dims `names`: a
 * comparison which references one of them is true, e.g. of the domain of a
 * scale which ignores the filter of a slider (`domainIgnores`), see
 * domainRows of layout.js; conditions of 4.x (an object) without their keys.
 */
const comparisons = ['==', '!=', '<', '<=', '>', '>='];
const withoutConditions = (spec, names) => {
    if (isObject(spec) && !isOperator(spec))
        return Object.fromEntries(Object.entries(spec).filter(([k]) => !names.includes(k)));
    if (!isOperator(spec))
        return spec;
    const op = Object.keys(spec)[0];
    const args = [spec[op]].flat();
    const mentions = args.some(a => refNames(a).some(n => names.includes(n) || names.includes(n.split(':')[0])));
    if (comparisons.includes(op) || op == 'not' || op == 'match' || op == 'steps')
        return mentions ? true : spec;
    if (op == 'and' || op == 'or' || op == 'if')
        return { [op]: args.map(a => withoutConditions(a, names)) };
    return spec;
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


// a condition of the values of a mapping `m` of a filter: a value or a list
// of values, compared as the ones of the rows, e.g. dates, `null` the rows
// without a value, `{ "not": condition }` and `{ "range": [from, to] }`
// (`null` is open), the values are evaluated already, e.g. of globals, the
// `mappings` of the definition are the ones of a scale of another mapping
const missingValue = v => v === null || v === undefined;
const condition = (m, c, path, mappings) => {
    if (missingValue(c))
        return missingValue;
    if (Array.isArray(c)) {
        const keys = new Set(c.map(k => String(convert(m, k, mappings))));
        return v => !missingValue(v) && keys.has(String(v));
    }
    if (typeof c == 'object') {
        if ('not' in c) {
            const test = condition(m, c.not, path, mappings);
            return v => !test(v);
        }
        if (Array.isArray(c.range)) {
            // categories as numbers if they are numbers, e.g. "9" is below "10"
            const [from, to] = c.range.map(e => missingValue(e) ? null : convert(m, e, mappings));
            const compare = continuous(m) ? (a, b) => a - b : compareCategories;
            return v => !missingValue(v) && (from === null || compare(v, from) >= 0) && (to === null || compare(v, to) <= 0);
        }
        throw new Error(`${path}: expected a value, a list of values, null, { "not": ... } or { "range": [from, to] }`);
    }
    const key = String(convert(m, c, mappings));
    return v => !missingValue(v) && String(v) === key;
};

/**
 * The test of the rows of a filter, e.g. { "year": "@year", "value": { "not":
 * null } }, the conditions of the values of mappings, see `condition`, as
 * props of the `scope`, e.g. the globals, `mapping` are the mappings of the
 * definition, `path` names it in errors, a list of { dim, key } of `filter`.
 */
const rowFilter = (conditions, mapping, scope = {}, path = 'filter', unknown = null) => Object.entries(conditions ?? {}).map(([dim, c]) => {
    // a condition of no mapping is one of no value of the rows, e.g. of a
    // column instead of its mapping, `unknown(path)` reports it
    if (unknown && !Object.hasOwn(mapping, dim))
        unknown(`${path}.${dim}`, dim);
    return { dim, key: condition(Object.hasOwn(mapping, dim) ? mapping[dim] : undefined, conditionValues(c, scope), `${path}.${dim}`, mapping) };
});

// the values of a condition evaluated, `not` and `range` are parts of the
// condition, not operators of expressions, e.g. { "not": "@type" }
const conditionValues = (c, scope) => {
    if (isObject(c) && Object.keys(c).length == 1 && 'not' in c)
        return { not: conditionValues(c.not, scope) };
    if (isObject(c) && Array.isArray(c.range))
        return { ...c, range: evaluate(c.range, scope) };
    return evaluate(c, scope);
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
    // the columns of the transforms, unknown ones of a pattern of a fold
    const ofTransforms = transformColumns(def.transform);
    if (ofTransforms === null)
        return null;
    const columns = [
        ...variants(def).flatMap(d => Object.values(d.mapping ?? {}).map(m => m?.column)),
        ...ofTransforms,
    ].map(expand);
    if (columns.includes(null))
        return null;
    return [...new Set([...columns.flat(), ...elements.map(e => e.values?.column).filter(c => typeof c == 'string')])];
};

// the distinct values of a column of the rows (or of a transform, see
// columnValues), without missing ones, ascending, numbers by their value,
// or in the order of the rows (`inOrder`)
const distinctValues = (rows, columns, column, inOrder = false) => {
    const value = columnValues(rows, columns, column);
    const values = [...new Set(sourceRows(rows, columns).map((r, i) => value(i)))].filter(v => v !== null && v !== undefined && v !== '');
    return inOrder ? values : values.sort(comparison(values));
};

// the spec of the values of a form element of a column (`values` of the
// definition, e.g. { "column": "year" }), kept on the element of the
// original definition, see updateDataValues
const valuesSource = Symbol('valuesSource');

// the entries of the values of a column of the rows (`spec`), distinct and
// ascending, numbers by their value, the values are strings, as the ones of
// csv, of every format; the names of a column of the first row of the value
// (`names`), formatted (`format`, of dates a time format, e.g. "%b %Y", a
// number format otherwise, see `formatOf`), the values otherwise
const dataValues = (spec, rows, columns, formatOf, language) => {
    const values = distinctValues(rows, columns, spec.column).map(String);
    const { names } = spec;
    const format = inLanguage(spec.format, language);
    let nameOf = v => v;
    if (typeof names == 'string') {
        const source = sourceRows(rows, columns);
        const value = columnValues(rows, columns, spec.column);
        const name = columnValues(rows, columns, names);
        const byValue = new Map();
        source.forEach((r, i) => {
            const k = String(value(i));
            if (!byValue.has(k) && !missing(name(i)))
                byValue.set(k, String(name(i)));
        });
        nameOf = v => byValue.get(v) ?? v;
    } else if (typeof format == 'string' && formatOf)
        nameOf = formatOf(format);
    return values.map(v => ({ id: v, name: nameOf(v), value: v }));
};

// the entries of form elements with the values of a column of the rows, e.g.
// "values": { "column": "year" }, see dataValues, a global which is none of
// them (or missing) is the last value, e.g. the latest year
const addDataValues = (def, rows, columns = null, formatOf = null) => {
    (def.formElements ?? []).filter(e => e?.values && !Array.isArray(e.values)).forEach(e => {
        e[valuesSource] = e.values;
        e.values = dataValues(e.values, rows, columns, formatOf);
        def.globals ??= {};
        if (e.values.length > 0 && !e.values.some(v => sameValue(v.value, def.globals[e.ref])))
            def.globals[e.ref] = e.values.at(-1).value;
    });
};

/**
 * The values of the form elements of columns of the prepared definition
 * `def` again, of the specs kept on the ones of the original one (`defOrg`,
 * see addDataValues), e.g. of the column of a transform of a global, the
 * classes of other edges of a bin, their names in `language`; only the ones
 * of `changed(spec)`. A global which is none of the new values becomes the
 * last one, as of addDataValues, not one of `kept(ref)`, e.g. one set by the
 * page; returns the refs of the globals changed.
 */
const updateDataValues = (defOrg, def, rows, columns, formatOf = null, changed = () => true, language = undefined, kept = () => false) => {
    const reset = [];
    (defOrg.formElements ?? []).forEach((e, i) => {
        const spec = e?.[valuesSource];
        const target = (def.formElements ?? []).find(f => f?.id !== undefined && f.id === e.id) ?? def.formElements?.[i];
        if (!spec || !target || !changed(spec))
            return;
        target.values = dataValues(spec, rows, columns, formatOf, language);
        const ref = target.ref ?? e.ref;
        if (ref !== undefined && !kept(ref) && target.values.length > 0
            && !target.values.some(v => sameValue(v.value, def.globals?.[ref]))) {
            def.globals ??= {};
            def.globals[ref] = target.values.at(-1).value;
            reset.push(ref);
        }
    });
    return reset;
};

// the type of the values of a column: numeric if all of them are numbers,
// date if all of them are dates, otherwise categorical, undefined without
// values (e.g. of empty data). A pass of numbers which ends at the first
// value which is none (a value which is the one before is skipped, e.g. the
// years of many rows), then a pass of dates of the distinct values, which
// ends at the first value which is no date, `value(i)` is the one of the
// row i of `n` rows (or `values` an array)
const inferType = (values, n = values.length) => {
    const at = typeof values == 'function' ? values : i => values[i];
    let present = false;
    let before;
    let i = 0;
    for (; i < n; i++) {
        const v = at(i);
        if (v === before)
            continue;
        before = v;
        if (typeof v == 'number' && Number.isFinite(v)) {
            present = true;
            continue;
        }
        if (missing(v))
            continue;
        if (toNumber(v) === null)
            break;
        present = true;
    }
    if (i == n)
        return present ? 'numeric' : undefined;
    const seen = new Set();
    for (let j = 0; j < n; j++) {
        const v = at(j);
        if (seen.has(v))
            continue;
        seen.add(v);
        if (!missing(v) && toDate(v) === null)
            return 'categorical';
    }
    return 'date';
};

// a d3 time format, e.g. "%b %Y", not a number format, e.g. ".0%"
const timeFormat = /%[-_0]?[a-zA-Z]/;

// the type of a mapping without values, e.g. of empty data: date of a time
// format of the mapping, otherwise categorical (e.g. a band scale of bars)
const formatType = m => [m.format, m.axis?.format, m.hover?.format, m.legend?.format]
    .some(f => typeof f == 'string' && timeFormat.test(f)) ? 'date' : 'categorical';

/**
 * The types of the mappings without a type of the values of their columns
 * (see inferType, of a column without values see formatType), of the rows
 * and the columns of the transforms, a column template of the globals, also
 * the ones of the mappings of patches which are not mappings of the
 * definition, the definition is changed. Only the columns which are `known`
 * (all by default), e.g. of the check of the definition.
 */
const inferTypes = (def, rows, columns = null, known = () => true) => {
    const infer = m => {
        if (!isObject(m) || m.type !== undefined || typeof m.column != 'string')
            return;
        const column = fillTemplate(m.column, def.globals ?? {});
        if (!known(column))
            return;
        const value = columnValues(rows, columns, column);
        m.type = inferType(value, sourceRows(rows, columns).length) ?? formatType(m);
    };
    Object.values(def.mapping ?? {}).forEach(infer);
    variants(def).slice(1).forEach(patch => Object.entries(isObject(patch.mapping) ? patch.mapping : {})
        .filter(([n]) => !Object.hasOwn(def.mapping ?? {}, n)).forEach(([, m]) => infer(m)));
};

