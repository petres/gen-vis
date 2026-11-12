export { oddValues, sourceRows, groupBy, inferTypes, inferType, keptRows, rowFilter, filterRows, withoutConditions, parseData, dataFormat, dataFormats, isBinary, prepareData, updateData, convert, continuous, scaleDef, filter, stack, categoryOrder, toDate, dateReader, toNumber, addDataValues, updateDataValues, distinctValues, usedColumns, columnValues };

import * as d3 from "@/utils/d3";
import { fillTemplate, inLanguage, sameValue, templateKeys, variants } from "@/utils/def";
import { transformColumns } from "@/utils/transform";
import { lazy } from "@/utils/lazy";
import { bind, constant, evaluate, isOperator, refNames } from "@/utils/expr";
import { comparison, compareCategories, inherited, isObject, missing, ownValue, toNumber, truthy } from "@/utils/values";

const dataFormats = ['csv', 'tsv', 'json', 'parquet'];

// the format of the data of a url, the given one or the one of its extension,
// undefined if it is neither, then its content tells, see parseData
const dataFormat = (url, format) => format ??
    dataFormats.find(f => new URL(url, 'file:///').pathname.toLowerCase().endsWith(`.${f}`));

// binary data, also of another realm, e.g. an ArrayBuffer of a worker or
// of node's vm, which `instanceof ArrayBuffer` of this one is not
const isArrayBuffer = data => Object.prototype.toString.call(data) == '[object ArrayBuffer]';
const isBinary = data => isArrayBuffer(data) || ArrayBuffer.isView(data);

const bytesOf = data => isArrayBuffer(data) ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

// parquet files begin with PAR1
const isParquet = data => {
    const b = bytesOf(data);
    return b.length >= 4 && b[0] == 0x50 && b[1] == 0x41 && b[2] == 0x52 && b[3] == 0x31;
};

// a page of HTML, e.g. the one a server answers for a wrong url (the
// index.html of a single page app), not data
const htmlPage = /^\s*<(?:!doctype\s+html|html|head|body)[\s>]/i;

// a row of the data is an object, not null, a number or a list
const isRow = r => r !== null && typeof r == 'object' && !Array.isArray(r);

// the indices of a list, the first `max` ones, e.g. "0, 3 and 2 others"
const indices = (list, max = 5) => list.length > max ? `${list.slice(0, max).join(', ')} and ${list.length - max} others` : list.join(', ');

// the rows which are objects, the others (e.g. null of JSON) are left out
// with a warning (`warn`) which names their indices; an error if no row is
// one, e.g. a list of lists
const rowsOf = (rows, warn) => {
    if (rows.every(isRow))
        return rows;
    const kept = rows.filter(isRow);
    const kind = r => r === null ? 'null' : Array.isArray(r) ? 'a list' : typeof r;
    if (kept.length == 0)
        throw new Error(`expected a list of rows as objects, e.g. [{"year": 2024, "value": 1.5}], the first row is ${kind(rows[0])}`);
    const others = rows.map((r, i) => isRow(r) ? -1 : i).filter(i => i >= 0);
    const kinds = [...new Set(others.map(i => kind(rows[i])))].join(' or ');
    warn?.(others.length == 1 ? `the row ${others[0]} (counted from 0) is ${kinds}, not an object of values, it is left out`
        : `${others.length} rows (${indices(others)}, counted from 0) are ${kinds}, not objects of values, they are left out`);
    return kept;
};

/**
 * The rows of CSV, TSV or other text of a `delimiter`: objects of the
 * columns of the header (the first line) with the texts of their values,
 * '' of the ones a line lacks, `columns` of the rows are the names of the
 * header, blank lines are left out (the header is the first line which is
 * none); otherwise as csvParse of d3-dsv, which compiles a function of the header
 * (`new Function`): a page with a Content Security Policy without
 * `unsafe-eval` could not read its data. A column `__proto__` is no column
 * (it would be the prototype of its rows), `warn(message)` tells of it.
 */
const delimited = (text, delimiter, warn) => {
    // the names of the columns and their places in a line
    let names = [];
    let at = [];
    let header = false;
    // (the rows are made line by line, not of a list of all lines)
    const rows = (formats[delimiter] ??= d3.dsvFormat(delimiter)).parseRows(text, line => {
        // a blank line is no row and no header, e.g. the ones at the end of a file
        if (line.length == 1 && line[0].trim() === '')
            return null;
        if (!header) {
            header = true;
            if (line.includes('__proto__'))
                warn?.(`the column '__proto__' is left out, it is no name of a column`);
            const places = line.map((name, i) => [name, i]).filter(([name]) => name !== '__proto__');
            names = places.map(([name]) => name);
            at = places.map(([, i]) => i);
            return null;
        }
        const row = {};
        for (let j = 0; j < names.length; j++)
            row[names[j]] = line[at[j]] || '';
        return row;
    });
    rows.columns = names;
    return rows;
};
// the readers of d3-dsv by their delimiter
const formats = {};

// the columns of the header of CSV or TSV which are in it more than once,
// of which the rows have the values of the last one
const duplicateColumns = (rows, warn) => {
    const counts = new Map();
    (rows.columns ?? []).forEach(c => counts.set(c, (counts.get(c) ?? 0) + 1));
    const twice = [...counts].filter(([, n]) => n > 1);
    if (twice.length > 0)
        warn?.(`${twice.map(([c, n]) => `the column '${c}' is in the header ${n} times`).join(', ')}, the rows have the values of the last one`);
    return rows;
};

/**
 * The rows of the data: binary data is parquet if it begins with PAR1 (or
 * of the `format` parquet), otherwise the text of its bytes (UTF-8), strings
 * are parsed in their `format`, without one as JSON (a list of rows) or CSV
 * by their content, already parsed rows are passed through. CSV is of commas
 * or, if its header has semicolons and no comma, of semicolons, then with
 * decimal commas, see decimalCommas. The parquet
 * reader is only loaded for parquet data, it reads only the `columns`
 * given, all without them. A page of HTML is an error (e.g. of a wrong url);
 * rows which are no objects (e.g. null) are left out, a column in the
 * header of CSV more than once is used once and a text of another encoding
 * than UTF-8 has characters which are none (U+FFFD), `warn(message)` tells
 * of them, once each.
 */
const parseData = async (data, format, columns = null, warn = null) => {
    if (isBinary(data)) {
        if (format == 'parquet' || isParquet(data)) {
            const { parseParquet } = await lazy.parquet();
            return parseParquet(data, columns);
        }
        data = new TextDecoder().decode(bytesOf(data));
    }
    if (Array.isArray(data))
        return rowsOf(data, warn);
    if (typeof data != "string")
        throw new Error('expected rows, a string of CSV, TSV or JSON or parquet');
    if (htmlPage.test(data))
        throw new Error(`it is a page of HTML, not ${format == 'parquet' ? 'parquet' : format ? format.toUpperCase() : 'CSV, TSV or JSON'}, e.g. the page a server answers for a wrong url`);
    if (format == 'parquet')
        throw new Error('Parquet data needs to be binary, e.g. an ArrayBuffer.');
    data = data.replace(/^\uFEFF/, '');
    // U+FFFD is of bytes which are no UTF-8, read as text
    if (data.includes('\uFFFD'))
        warn?.(`the text has characters which could not be read (U+FFFD, '\uFFFD'): the file is not UTF-8, e.g. Latin-1 or Windows-1252 of a spreadsheet, save it as UTF-8 (in Excel "CSV UTF-8")`);
    if (format == 'tsv')
        return duplicateColumns(delimited(data, '\t', warn), warn);
    if (format == 'json' || (format != 'csv' && /^\s*[[{]/.test(data))) {
        const rows = JSON.parse(data);
        if (!Array.isArray(rows))
            throw new Error('the JSON is not a list of rows');
        return rowsOf(rows, warn);
    }
    // of semicolons, e.g. of a spreadsheet in German, with decimal commas
    if (semicolons(data))
        return duplicateColumns(decimalCommas(delimited(data, ';', warn)), warn);
    return separators(duplicateColumns(delimited(data, ',', warn), warn), warn);
};

// CSV of semicolons: the header (the first line which is not blank) has
// semicolons and no comma, quoted names aside, e.g. `Jahr;Wert` of the CSV
// of a spreadsheet in German and other languages of a decimal comma
const semicolons = text => {
    let i = 0;
    while (i < text.length && text.charCodeAt(i) <= 32)
        i++;
    let quoted = false;
    let found = false;
    for (; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (c == 34)
            quoted = !quoted;
        else if (!quoted) {
            if (c == 10 || c == 13)
                break;
            if (c == 44)
                return false;
            if (c == 59)
                found = true;
        }
    }
    return found;
};

// a number of a decimal comma, e.g. "1,5" or "-0,25", and a whole number
const commaNumber = /^\s*[+-]?(?:\d+,\d*|,\d+)(?:e[+-]?\d+)?\s*$/i;
const wholeNumber = /^\s*[+-]?\d+(?:e[+-]?\d+)?\s*$/i;

/**
 * The rows of CSV of semicolons with the numbers of decimal commas as the
 * ones of decimal points, e.g. "1.5" of "1,5", once per file, so the values
 * are read as the ones of every CSV (see toNumber of utils/values.js): of
 * the columns whose values are numbers of a decimal comma or whole numbers,
 * the texts of missing values aside (see missingToken) and fewer other
 * texts of digits and no letters, e.g. "<5", as the numbers of inferType.
 * A column with a decimal point too stays as it is, e.g. "1.234,5" or
 * "12.500" of a separator of thousands, which is no number of it (see
 * oddValues), and a comma of CSV of commas is never a decimal one.
 */
const decimalCommas = rows => {
    for (const column of new Set(rows.columns)) {
        let commas = 0;
        let whole = 0;
        let others = 0;
        let numbers = true;
        for (let i = 0; i < rows.length && numbers; i++) {
            const v = rows[i][column];
            if (absent(v))
                continue;
            if (commaNumber.test(v))
                commas++;
            else if (wholeNumber.test(v))
                whole++;
            else if (v.includes('.') || !/\d/.test(v) || /\p{L}/u.test(v))
                numbers = false;
            else
                others++;
        }
        if (!numbers || commas == 0 || commas + whole <= others)
            continue;
        for (const row of rows) {
            const v = row[column];
            if (commaNumber.test(v))
                row[column] = v.replace(',', '.');
        }
    }
    return rows;
};

// CSV of one column whose name has tabs is TSV, `warn(message)` tells how to
// read it, before the dims miss its columns
const separators = (rows, warn) => {
    const columns = rows.columns ?? [];
    const name = columns[0];
    if (columns.length != 1 || typeof name != 'string')
        return rows;
    const short = name.length > 40 ? `${name.slice(0, 40)}…` : name;
    if (name.includes('\t'))
        warn?.(`the CSV has one column '${short.replaceAll('\t', '\\t')}' of tabs, it is TSV: "dataFormat": "tsv" reads it`);
    return rows;
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
// second is cut to milliseconds, e.g. of pandas; a local time skipped at the
// change to summer time (02:30 in Vienna) is the one an hour later, as of
// Date (decided: it keeps its row, an offset or utc makes it unambiguous)
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
    const year = early ? y + 400 : y;
    const day = end ? d + 1 : d;
    const hour = end ? 0 : h;
    return (utc ? Date.UTC(year, m - 1, day, hour, mi, s, ms) : new Date(year, m - 1, day, hour, mi, s, ms).getTime()) - (early ? cycle : 0);
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
    else
        t = textTime(String(v).trim(), utc);
    return isNaN(t) ? null : t;
};
// the time of the text of a date, NaN if it is none
const textTime = (text, utc) => {
    const iso = isoDate.exec(text);
    if (iso)
        return wallTime(utc, iso[1], iso[2], iso[3], iso[4], iso[5], iso[6], iso[7]);
    const day = dayFirst.exec(text);
    if (day)
        return wallTime(utc, day[3], day[2], day[1], day[4], day[5], day[6], day[7]);
    const zoned = isoZoned.exec(text);
    return zoned ? zonedTime(zoned) : NaN;
};

/**
 * toDate of the values of a column, e.g. of the rows of a dim: the time of
 * a text is kept and read once, the dates of a time series are the same
 * ones of every series (at most `memoSize` texts, the others are read each
 * time). Of one loop over the values, not kept longer: the time zone of
 * local times is the one of the loop.
 */
const memoSize = 100000;
const dateReader = (utc = false) => {
    const times = new Map();
    return v => {
        if (typeof v != 'string')
            return toDate(v, utc);
        let t = times.get(v);
        if (t === undefined) {
            t = toDate(v, utc);
            if (times.size < memoSize)
                times.set(v, t);
        }
        return t;
    };
};

// the values of the dim are numbers or dates (timestamps), the others,
// also of a dim without a type, are categories
const continuous = dim => dim?.type == 'numeric' || dim?.type == 'date';

// the categories are strings, as the values of csv, so the values of JSON and
// parquet are the same ones, e.g. the year 2004 is "2004" of every format, a
// missing one is null, also an empty cell of csv, as the null of JSON
const toCategory = v => missing(v) ? null : String(v);

// the definition of the scale of a dim, of a dim with the scale of
// another one (`"scale": { "of": "y" }`) the one of the other one, of the
// `dims` of the definition
const scaleDef = (dims, m) => m?.scale?.of !== undefined ? dims?.[m.scale.of]?.scale : m?.scale;

// the conversion of the values of a dim, e.g. the dates of a `utc` scale
// (also the one of another dim, of the `dims` of the definition) or
// the categories as strings; of the values of a column (`column`) the
// dates of the same text are read once, see dateReader
const converter = (dim, dims, column = false) => {
    if (dim?.type == 'numeric')
        return toNumber;
    if (dim?.type == 'date') {
        const utc = scaleDef(dims, dim)?.type == 'utc';
        return column ? dateReader(utc) : v => toDate(v, utc);
    }
    return toCategory;
};

// a value as the ones of the rows of a dim, e.g. "2022-06-01" of a date,
// of the time zone of its scale, also the one of another dim (`"scale":
// { "of": "x" }`) of the `dims` of the definition
const convert = (dim, v, dims) => converter(dim, dims)(v);

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
    if (columns?.has(column))
        return (values => i => values[i])(columns.get(column));
    // a name of the prototype of objects is no column, e.g. "constructor"
    return inherited(column) ? i => ownValue(source[i], column) : i => source[i]?.[column];
};

// the values of dims of the parsed rows in the prepared ones, e.g. of
// another column of a control, the rows are the same objects
const updateData = (rows, data, def, names, columns = null) => {
    const dims = names.map(n => ({
        name: n,
        value: columnValues(rows, columns, def.dims[n].column),
        convert: converter(def.dims[n], def.dims, true),
    }));
    sourceRows(rows, columns).forEach((r, i) => {
        const e = data[i];
        for (const c of dims)
            e[c.name] = c.convert(c.value(i));
    });
    return data;
};

// the row of the data a prepared row was made of and its index, e.g. for
// the columns of a filter which are no dims, see rowResolver: private
// fields of the prepared rows, so a row is only its values (e.g. of a copy
// or of toEqual) and is made as fast as a plain object (two properties
// defined per row cost three times as much, e.g. 40 ms of 253k rows)
class PreparedRow {
    #raw;
    #index;
    constructor(raw, index) {
        this.#raw = raw;
        this.#index = index;
    }
    // undefined of other rows, e.g. of the data of a mark, also of a proxy of a row
    static raw(row) {
        return #raw in row ? row.#raw : undefined;
    }
    static index(row) {
        return #index in row ? row.#index : undefined;
    }
}
const rawOf = PreparedRow.raw;
const rawIndexOf = PreparedRow.index;

// maps the parsed rows to the dims, e.g. column `share` to `y`, also the
// columns of transforms; `odd` collects the values the dims cannot use,
// see oddValues
const prepareData = (data, def, columns = null, odd = null) => {
    const dims = Object.keys(def.dims).map(n => ({
        name: n,
        value: columnValues(data, columns, def.dims[n].column),
        convert: odd ? checked(n, def.dims[n], converter(def.dims[n], def.dims, true), odd) : converter(def.dims[n], def.dims, true),
    }));

    return sourceRows(data, columns).map((d, i) => {
        const e = new PreparedRow(d, i);
        for (const c of dims)
            e[c.name] = c.convert(c.value(i));
        return e;
    })
};

// the conversion of the values of a dim `n` which collects the ones it
// cannot use in `odd` (a map of the names of the dims), by their text:
// of numbers and dates the ones which are none (`values`, not the usual
// texts of missing values, see missingToken) and of every type objects and
// lists (`objects`), e.g. of nested JSON, which are no values of a dim
const checked = (n, m, convert, odd) => v => {
    const c = convert(v);
    const object = v !== null && typeof v == 'object' && !(v instanceof Date);
    if (object || (c === null && (m.type == 'numeric' || m.type == 'date') && !absent(v))) {
        if (!odd.has(n))
            odd.set(n, { values: new Map(), objects: new Map() });
        const kind = odd.get(n)[object ? 'objects' : 'values'];
        const text = object ? JSON.stringify(v) : String(v);
        kind.set(text, (kind.get(text) ?? 0) + 1);
    }
    return c;
};

// the texts of the values and their numbers of rows, at most `max` of them, e.g. "'NA' (2 rows), 'x' (1 row)"
const counted = (values, max = 4) => {
    const entries = [...values].sort(([, a], [, b]) => b - a);
    const shown = entries.slice(0, max).map(([v, k]) => `'${v.length > 40 ? `${v.slice(0, 40)}...` : v}' (${k} ${k == 1 ? 'row' : 'rows'})`);
    return entries.length > max ? `${shown.join(', ')} and ${entries.length - max} other${entries.length - max == 1 ? '' : 's'}` : shown.join(', ');
};

/**
 * The warnings of the values the dims of the prepared definition `def`
 * could not use (`odd` of prepareData), once per column: texts of a dim of
 * numbers or dates which are none, e.g. "1,234" or "<5" (the usual texts of
 * missing values, e.g. NA or ":", are missing values without a warning, see
 * missingToken), and objects or lists, e.g. of nested JSON.
 */
const oddValues = (def, odd) => {
    const warned = new Set();
    return [...odd].flatMap(([n, { values, objects }]) => {
        const m = def.dims[n];
        const column = fillTemplate(m.column, def.globals ?? {});
        if (warned.has(column))
            return [];
        warned.add(column);
        const what = m.type == 'date' ? 'dates' : 'numbers';
        const written = m.type == 'numeric' && [...values.keys()].some(v => /\d[,'\s]\d/.test(v))
            ? ' (a number is written as 1234.5, without a separator of thousands)' : '';
        return [
            ...(values.size > 0 ? [`dims.${n}: values of the column '${column}' are no ${what}, they are missing: ${counted(values)}${written}`] : []),
            ...(objects.size > 0 ? [`dims.${n}: values of the column '${column}' are objects or lists, not numbers, dates or texts: ${counted(objects, 2)}`] : []),
        ];
    });
};

/**
 * The resolver of the names of an expression of a row, e.g. of a filter:
 * the value of a dim of the prepared row, else of a column of the
 * transforms (`columns`) or of the data (see rawOf), else of the `scope`,
 * e.g. a global; as the functions of the row of `bind`.
 */
const rowResolver = (dims, columns, scope = {}, converted = null) => {
    const resolve = name => {
        if (typeof name == 'symbol')
            return Object.hasOwn(scope, name) ? constant(scope[name]) : undefined;
        // a value compared with a date as a date, see datesAsDates
        if (converted?.has(name)) {
            const { m, raw } = converted.get(name);
            const value = bind(raw, resolve);
            return value.constant ? constant(convert(m, value(), dims)) : row => convert(m, value(row), dims);
        }
        return resolveName(name);
    };
    const resolveName = rowName(dims, columns, scope);
    return resolve;
};
const rowName = (dims, columns, scope) => name => {
    // the value of the row, of a date its time, see datesAsDates
    if (Object.hasOwn(dims, name))
        return row => row[name];
    if (columns?.has(name)) {
        const values = columns.get(name);
        return row => {
            const i = rawIndexOf(row);
            return i === undefined ? undefined : values[i];
        };
    }
    // a column of the data before a global of the same name, e.g. a column
    // `country` beside the global `country` of a select (`@globals.country`)
    if (Object.hasOwn(scope, name)) {
        const value = scope[name];
        return row => {
            const raw = row ? rawOf(row) : undefined;
            return raw && Object.hasOwn(raw, name) ? raw[name] : value;
        };
    }
    return inherited(name) ? row => ownValue(rawOf(row), name) : row => rawOf(row)?.[name];
};

/**
 * The rows of a filter `spec`: an expression of the row (see rowResolver,
 * the names are the dims, the columns and the `scope`), e.g.
 * `"@year == @selected"`, true are all rows; or the conditions of dims
 * (an object), see rowFilter. `path` names it in errors, `unknown(path, dim)`
 * reports a condition of no dim.
 */
const filterRows = (rows, spec, dims, scope = {}, { columns = null, path = 'filter', unknown = null } = {}) => {
    if (spec === undefined || spec === null || spec === true)
        return rows;
    if (spec === false)
        return [];
    if (isObject(spec) && !isOperator(spec)) {
        const conditions = rowFilter(spec, dims, scope, path, unknown);
        return conditions.length > 0 ? filter(rows, conditions) : rows;
    }
    const { expression, converted } = datesAsDates(spec, dims);
    const test = bind(expression, rowResolver(dims, columns, scope, converted));
    if (test.constant)
        return truthy(test()) ? rows : [];
    return rows.filter(row => truthy(test(row)));
};

/**
 * An expression of the rows whose comparisons of a date dim compare dates:
 * the other values of a comparison (`==`, `!=`, `<`, ...) of a reference to
 * a dim of dates, e.g. `"@date >= '2020-06-01'"` or `"@year == @selected"`,
 * and the cases of a `match` of one are converted as the values of the
 * dim (timestamps, see convert), as the conditions of the object form,
 * so dates of every format compare, e.g. of a transform, of JSON timestamps
 * or "01.06.2020". `converted` are the names of the references which replace
 * the values converted at the row, see rowResolver; kept per expression.
 */
// the operators of comparisons, see also withoutConditions
const comparisons = ['==', '!=', '<', '<=', '>', '>='];
const convertedOf = new WeakMap();
const datesAsDates = (spec, dims) => {
    if (!isObject(spec) && !Array.isArray(spec))
        return { expression: spec, converted: null };
    const kept = convertedOf.get(spec);
    if (kept?.dims === dims && kept.types === typesKey(dims))
        return kept.result;
    const converted = new Map();
    const dateOf = raw => {
        const name = typeof raw == 'string' && raw.startsWith('@') ? raw.slice(1) : undefined;
        return name !== undefined && Object.hasOwn(dims, name) && dims[name]?.type == 'date' ? dims[name] : undefined;
    };
    const rewrite = raw => {
        if (Array.isArray(raw))
            return raw.map(rewrite);
        if (!isOperator(raw))
            return raw;
        const op = Object.keys(raw)[0];
        if (op == 'literal')
            return raw;
        const args = raw[op];
        const list = Array.isArray(args) ? args : [args];
        if (comparisons.includes(op)) {
            const m = list.map(dateOf).find(Boolean);
            if (m) {
                return { [op]: list.map(a => {
                    if (dateOf(a))
                        return a;
                    const name = `\0date${converted.size}`;
                    converted.set(name, { m, raw: a });
                    return `@${name}`;
                }) };
            }
        }
        if (op == 'match' && dateOf(list[0]) && isObject(list[1])) {
            const m = dateOf(list[0]);
            const cases = Object.fromEntries(Object.entries(list[1]).map(([k, v]) => [String(convert(m, k, dims)), rewrite(v)]));
            return { match: [list[0], cases, ...list.slice(2).map(rewrite)] };
        }
        return { [op]: Array.isArray(args) ? args.map(rewrite) : rewrite(args) };
    };
    const expression = rewrite(spec);
    const result = { expression: converted.size > 0 || expression !== spec ? expression : spec, converted: converted.size > 0 ? converted : null };
    convertedOf.set(spec, { dims, types: typesKey(dims), result });
    return result;
};
// the types of the dims, of the date ones, e.g. inferred after a change of the globals
const typesKey = dims => Object.keys(dims).filter(n => dims[n]?.type == 'date').join('\0');

/**
 * A filter expression without its conditions of the dims `names`: a
 * comparison which references one of them is true, e.g. of the domain of a
 * scale which ignores the filter of a slider (`domainIgnores`), see
 * domainRows of layout.js; the conditions of an object without their keys.
 */
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
// the rows, positive and negative values separately, the first one nearest
// to 0 on both sides (of `axis.diverging` the negative ones in the reverse
// order, the last one nearest to 0: the rows run in their order from the
// negative end to the positive one, e.g. the answers of a Likert scale; of
// `axis.positive` the negative ones have no size, at the end of the
// positive ones, e.g. of a pie), a map of the rows to the start and the end
// of their value
const stack = (rows, axis, dims = [], compare = null) => {
    const stacks = new Map();
    groupBy(rows, [...dims, axis.h]).forEach(g => {
        let positive = 0;
        let negative = 0;
        const entries = compare ? [...g.entries].sort(compare) : g.entries;
        for (const e of entries) {
            const v = e[axis.v];
            if (v >= 0)
                stacks.set(e, [positive, positive += v]);
            else if (axis.positive)
                stacks.set(e, [positive, positive]);
            else if (!axis.diverging)
                stacks.set(e, [negative, negative += v]);
        }
        if (axis.diverging && !axis.positive)
            for (let i = entries.length - 1; i >= 0; i--) {
                const e = entries[i];
                const v = e[axis.v];
                if (!(v >= 0))
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


// a condition of the values of a dim `m` of a filter: a value or a list
// of values, compared as the ones of the rows, e.g. dates, `null` the rows
// without a value, `{ "not": condition }` and `{ "range": [from, to] }`
// (`null` is open), the values are evaluated already, e.g. of globals, the
// `dims` of the definition are the ones of a scale of another dim
const missingValue = v => v === null || v === undefined;
const condition = (m, c, path, dims) => {
    if (missingValue(c))
        return missingValue;
    if (Array.isArray(c)) {
        const keys = new Set(c.map(k => String(convert(m, k, dims))));
        return v => !missingValue(v) && keys.has(String(v));
    }
    if (typeof c == 'object') {
        if ('not' in c) {
            const test = condition(m, c.not, path, dims);
            return v => !test(v);
        }
        if (Array.isArray(c.range)) {
            // categories as numbers if they are numbers, e.g. "9" is below "10"
            const [from, to] = c.range.map(e => missingValue(e) ? null : convert(m, e, dims));
            const compare = continuous(m) ? (a, b) => a - b : compareCategories;
            return v => !missingValue(v) && (from === null || compare(v, from) >= 0) && (to === null || compare(v, to) <= 0);
        }
        throw new Error(`${path}: expected a value, a list of values, null, { "not": ... } or { "range": [from, to] }`);
    }
    const key = String(convert(m, c, dims));
    return v => !missingValue(v) && String(v) === key;
};

/**
 * The test of the rows of a filter, e.g. { "year": "@year", "value": { "not":
 * null } }, the conditions of the values of dims, see `condition`, as
 * props of the `scope`, e.g. the globals, `dims` are the dims of the
 * definition, `path` names it in errors, a list of { dim, key } of `filter`.
 */
const rowFilter = (conditions, dims, scope = {}, path = 'filter', unknown = null) => Object.entries(conditions ?? {}).map(([dim, c]) => {
    // a condition of no dim is one of no value of the rows, e.g. of a
    // column instead of its dim, `unknown(path)` reports it
    if (unknown && !Object.hasOwn(dims, dim))
        unknown(`${path}.${dim}`, dim);
    return { dim, key: condition(Object.hasOwn(dims, dim) ? dims[dim] : undefined, conditionValues(c, scope), `${path}.${dim}`, dims) };
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
 * the ones of the dims, also of the other values of the controls (see
 * variants), and of the values of the controls and of their names. A column
 * template is a column of every value of its globals, e.g. "{values}{share}"
 * of the entries of two controls, or of the field of every entry, e.g.
 * "{group:name}"; a global of a control with the values of a column
 * has unknown ones, also a global without a control, which the page
 * sets to any value (the `globals` of the visualisation).
 */
const usedColumns = def => {
    const elements = def.controls ?? [];
    // the values of a name of a template: of a global the one of the
    // definition and the ones of its controls, of a field the ones of
    // their entries (`global:field`)
    const valuesOf = name => {
        const [ref, field] = name.split(':');
        const own = elements.filter(e => e.global == ref);
        if (own.length == 0 || own.some(e => !Array.isArray(e.values)))
            return null;
        const entries = own.flatMap(e => e.values);
        if (field !== undefined)
            return [...new Set(entries.map(v => v?.[field]).filter(v => v === null || typeof v != 'object').map(String))];
        return [...new Set([def.globals?.[ref], ...entries.map(v => v.value)].map(String))];
    };
    const expand = column => {
        if (typeof column != 'string')
            return [];
        let columns = [column];
        for (const name of new Set(templateKeys(column))) {
            const values = valuesOf(name);
            if (values === null)
                return null;
            columns = columns.flatMap(c => values.map(v => c.replaceAll(`{${name}}`, v)));
        }
        return columns;
    };
    // the columns of the transforms, unknown ones of a pattern of a fold
    const ofTransforms = transformColumns(def.transform);
    if (ofTransforms === null)
        return null;
    const columns = [
        ...variants(def).flatMap(d => Object.values(d.dims ?? {}).map(m => m?.column)),
        ...ofTransforms,
    ].map(expand);
    if (columns.includes(null))
        return null;
    // the columns of the values of the controls and of their names
    const ofValues = elements.flatMap(e => [e.values?.column, e.values?.names]).filter(c => typeof c == 'string');
    return [...new Set([...columns.flat(), ...ofValues, ...variants(def).flatMap(expressionColumns)])];
};

// the names of the expressions of the rows a definition filters by, which
// can be columns of the data, not only dims, see rowResolver: of the
// `filter` of the definition and of its marks, the conditions of the
// stacked dims and of the hover (the conditions of an object name
// dims), e.g. "@region == 'W'" of a column `region`
const expressionColumns = def => {
    const expressions = [def.filter, ...[def.marks ?? []].flat().map(p => p?.filter),
        ...Object.values(def.dims ?? {}).map(m => m?.stacked), def.hover?.filter];
    return expressions.filter(e => e !== undefined && e !== null && typeof e != 'boolean' && !(isObject(e) && !isOperator(e)))
        .flatMap(e => refNames(e)).filter(n => typeof n == 'string').map(n => n.split(':')[0]);
};

// the distinct values of a column of the rows (or of a transform, see
// columnValues), without missing ones, ascending, numbers by their value,
// or in the order of the rows (`inOrder`); values of the same text are one,
// the first one, e.g. 1 and "1" of JSON, the same category and entry
const distinctValues = (rows, columns, column, inOrder = false) => {
    const value = columnValues(rows, columns, column);
    const texts = new Set();
    const values = [...new Set(sourceRows(rows, columns).map((r, i) => value(i)))].filter(v => {
        if (v === null || v === undefined || v === '' || texts.has(String(v)))
            return false;
        texts.add(String(v));
        return true;
    });
    return inOrder ? values : values.sort(comparison(values));
};

// the spec of the values of a control of a column (`values` of the
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

// the entries of controls with the values of a column of the rows, e.g.
// "values": { "column": "year" }, see dataValues, a global which is none of
// them (or missing) is the last value, e.g. the latest year
const addDataValues = (def, rows, columns = null, formatOf = null) => {
    (def.controls ?? []).filter(e => e?.values && !Array.isArray(e.values)).forEach(e => {
        e[valuesSource] = e.values;
        e.values = dataValues(e.values, rows, columns, formatOf);
        def.globals ??= {};
        if (e.values.length > 0 && !e.values.some(v => sameValue(v.value, def.globals[e.global])))
            def.globals[e.global] = e.values.at(-1).value;
    });
};

/**
 * The values of the controls of columns of the prepared definition
 * `def` again, of the specs kept on the ones of the original one (`defOrg`,
 * see addDataValues), e.g. of the column of a transform of a global, the
 * classes of other edges of a bin, their names in `language`; only the ones
 * of `changed(spec)`. A global which is none of the new values becomes the
 * last one, as of addDataValues, not one of `kept(ref)`, e.g. one set by the
 * page; returns the refs of the globals changed.
 */
const updateDataValues = (defOrg, def, rows, columns, formatOf = null, changed = () => true, language = undefined, kept = () => false) => {
    const reset = [];
    (defOrg.controls ?? []).forEach((e, i) => {
        const spec = e?.[valuesSource];
        const target = (def.controls ?? []).find(f => f?.id !== undefined && f.id === e.id) ?? def.controls?.[i];
        if (!spec || !target || !changed(spec))
            return;
        target.values = dataValues(spec, rows, columns, formatOf, language);
        const ref = target.global ?? e.global;
        if (ref !== undefined && !kept(ref) && target.values.length > 0
            && !target.values.some(v => sameValue(v.value, def.globals?.[ref]))) {
            def.globals ??= {};
            def.globals[ref] = target.values.at(-1).value;
            reset.push(ref);
        }
    });
    return reset;
};

// the usual texts of missing values of statistics, e.g. NA and NaN of R and
// pandas, ":" of Eurostat, "-", "." and ".." of statistical offices, "n.v."
// and "k.A." of German tables, compared trimmed and in lower case; a column
// of numbers or dates with them is one of numbers or dates, they are missing
// values (null) without a warning, see inferType and oddValues; NaN of
// parquet or of rows of JavaScript too
const missingTokens = new Set(['na', 'n/a', 'n.a.', 'nan', 'null', 'none', '-', '--', '\u2013', '\u2014', '.', '..', '...', '\u2026', ':', '?', '#n/a', 'n.v.', 'k.a.']);
const missingToken = v => (typeof v == 'string' && v.length < 8 && missingTokens.has(v.trim().toLowerCase())) || (typeof v == 'number' && Number.isNaN(v));
// missing or one of the texts of missing values
const absent = v => missing(v) || missingToken(v);

/**
 * The type of the values of a column: numeric if all of them are numbers,
 * date if all of them are dates, the usual texts of missing values aside
 * (see missingToken), otherwise categorical, undefined without values
 * (e.g. of empty data). A pass of numbers which ends at the first value
 * which is none (a value which is the one before is skipped, e.g. the years
 * of many rows), then a pass of dates of the distinct values, which ends at
 * the first value which is no date; then numeric if `hint` says the dim is
 * continuous (its parts, see typeHint: 'numeric' or 'continuous') and some
 * values are numbers, or without a hint if more than half of the values
 * are numbers and the others have digits and no letters, e.g. "1,234",
 * "<5" or "12 %", numbers written otherwise, which are missing values with
 * a warning (see oddValues), not "Total", "Wien", "Phase 1" or "2025
 * (Prognose)" among "2023", "2024", e.g. the categories of a legend. `value(i)` is the one of the row i of `n` rows
 * (or `values` an array).
 */
const inferType = (values, n = values.length, hint = undefined) => {
    const at = typeof values == 'function' ? values : i => values[i];
    // the values of a dim of periods (an `interval`, hint 'date') which are
    // all texts of dates are dates, also years, e.g. "2019", not numbers;
    // numbers are timestamps then, they stay numbers
    if (hint == 'date') {
        let dated = false;
        const checked = new Set();
        for (let j = 0; j < n; j++) {
            const v = at(j);
            if (checked.has(v) || absent(v))
                continue;
            checked.add(v);
            if (typeof v != 'string' || toDate(v) === null)
                return inferType(values, n, 'continuous');
            dated = true;
        }
        return dated ? 'date' : undefined;
    }
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
        if (absent(v))
            continue;
        if (toNumber(v) === null)
            break;
        present = true;
    }
    if (i == n)
        return present ? 'numeric' : undefined;
    const seen = new Set();
    let dates = true;
    for (let j = 0; j < n && dates; j++) {
        const v = at(j);
        if (seen.has(v))
            continue;
        seen.add(v);
        if (!absent(v) && toDate(v) === null)
            dates = false;
    }
    if (dates)
        return 'date';
    // the numbers among the other values
    let numbers = 0;
    let others = 0;
    let digits = true;
    before = undefined;
    let wasNumber = false;
    for (let j = 0; j < n; j++) {
        const v = at(j);
        if (j == 0 || v !== before) {
            before = v;
            if (absent(v)) {
                wasNumber = null;
                continue;
            }
            wasNumber = toNumber(v) !== null;
            // (a number written otherwise has digits and no letters, e.g.
            // "1,234", "<5", "12 %", not "Phase 1" or "2025 (Prognose)")
            if (!wasNumber && digits && (typeof v == 'object' || !/\d/.test(String(v)) || /\p{L}/u.test(String(v))))
                digits = false;
        }
        if (wasNumber)
            numbers++;
        else if (wasNumber === false)
            others++;
    }
    return numbers > 0 && (hint !== undefined || (digits && numbers > others)) ? 'numeric' : 'categorical';
};

// a d3 number format, e.g. ",.1f" or ".0%", see d3-format (not an empty one)
const numberFormat = /^(?:(.)?([<>=^]))?([+\-( ])?([$#])?(0)?(\d+)?(,)?(\.\d+)?(~)?([a-z%])?$/i;

/**
 * Whether the parts of a dim without a type say that its values are
 * numbers or dates, not categories, e.g. "NA" among numbers: 'numeric' of a
 * number format (of the dim, its axis, hover or legend), of a domain or
 * an `include` of numbers, 'continuous' of the
 * other parts of a continuous scale (an open domain, `nice`, `pad`,
 * `center`, `zero`, e.g. of the value of bars), 'date' of an `interval`, undefined otherwise. A scale type and the
 * categories make the type already, see normalize.
 */
const typeHint = m => {
    const scale = isObject(m.scale) ? m.scale : {};
    const formats = [m.format, m.axis?.format, m.hover?.format, m.legend?.format].filter(f => typeof f == 'string' && f !== '');
    if (formats.some(f => !timeFormat.test(f) && numberFormat.test(f))
        || [m.domain, scale.domain, m.include, scale.include].some(v => [v].flat().some(e => typeof e == 'number')))
        return 'numeric';
    // the periods of dates, also of years, see inferType
    if (m.interval !== undefined)
        return 'date';
    if ([m.domain, scale.domain].some(v => Array.isArray(v) && v.includes(null))
        || ['nice', 'pad', 'center'].some(k => m[k] !== undefined || scale[k] !== undefined)
        || scale.zero === true || m.zero === true)
        return 'continuous';
    return undefined;
};

// a d3 time format, e.g. "%b %Y", not a number format, e.g. ".0%"
const timeFormat = /%[-_0]?[a-zA-Z]/;

// the type of a dim without values, e.g. of empty data: date of a time
// format of the dim, otherwise categorical (e.g. a band scale of bars)
const formatType = m => [m.format, m.axis?.format, m.hover?.format, m.legend?.format]
    .some(f => typeof f == 'string' && timeFormat.test(f)) ? 'date' : 'categorical';

/**
 * The types of the dims without a type of the values of their columns
 * (see inferType, of a column without values see formatType), of the rows
 * and the columns of the transforms, a column template of the globals, also
 * the ones of the dims of the other values of the controls which are
 * not dims of the definition, the definition is changed. Only the columns which are `known`
 * (all by default), e.g. of the check of the definition.
 */
// the types of the columns of a source of values (the rows of the data or
// the values of a column of a transform), inferred once: a change of the
// globals infers the types of the definition again, the values are the same
const typesOf = new WeakMap();
// a column of no row, of rows (without rows the columns are not known)
const nowhere = (rows, column) => rows.length > 0 && !rows.some(r => isRow(r) && Object.hasOwn(r, column));
const inferTypes = (def, rows, columns = null, known = () => true) => {
    const infer = m => {
        if (!isObject(m) || m.type !== undefined || typeof m.column != 'string')
            return;
        const column = fillTemplate(m.column, def.globals ?? {});
        if (!known(column))
            return;
        const source = columns?.has(column) ? columns.get(column) : sourceRows(rows, columns);
        if (!typesOf.has(source))
            typesOf.set(source, new Map());
        const types = typesOf.get(source);
        const hint = typeHint(m);
        const key = `${hint ?? ''}\0${column}`;
        // a column which is neither one of the transforms nor of the rows
        // has no type, and none is kept of it: it can be one of a transform
        // later, e.g. of other globals
        const unknown = !types.has(key) && !columns?.has(column) && nowhere(sourceRows(rows, columns), column);
        if (!types.has(key) && !unknown)
            types.set(key, inferType(columnValues(rows, columns, column), sourceRows(rows, columns).length, hint));
        // a dim on the scale of another one without values of its own, e.g.
        // of a column of the rows of a mark only (the ends of an arrow), has
        // the type of that one (below), so the values of the rows are
        // converted as its ones
        if (types.get(key) === undefined && typeof m.scale?.of == 'string' && isObject(def.dims?.[m.scale.of])) {
            ofScale.push(m);
            return;
        }
        if (unknown)
            return;
        // without values of the parts of a continuous dim numeric, e.g. of `"zero": true`
        m.type = types.get(key) ?? (hint == 'date' ? 'date' : hint && formatType(m) != 'date' ? 'numeric' : formatType(m));
    };
    const ofScale = [];
    Object.values(def.dims ?? {}).forEach(infer);
    variants(def).slice(1).forEach(variant => Object.entries(isObject(variant.dims) ? variant.dims : {})
        .filter(([n]) => !Object.hasOwn(def.dims ?? {}, n)).forEach(([, m]) => infer(m)));
    ofScale.forEach(m => m.type = def.dims[m.scale.of].type ?? (typeHint(m) == 'date' ? 'date' : typeHint(m) && formatType(m) != 'date' ? 'numeric' : formatType(m)));
};

