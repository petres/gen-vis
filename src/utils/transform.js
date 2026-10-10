export { applyTransforms, transformTypes, transformColumns, transformGlobals };

import { toDate } from "@/utils/data";
import { fillTemplate, templateRefs } from "@/utils/def";

/**
 * The transforms of a definition compute columns of the data in the browser,
 * e.g. an index of a base year, which can be the global of a form element,
 * instead of a column per base year in the file. A transform computes the
 * column `as` (by default its `column`, which it replaces) of the values of
 * `column` in the groups of the rows of the same values of the columns `by`,
 * in the order of the column `order` (by default the one of the rows). The
 * columns of the transforms before are columns of the later ones and of the
 * mappings. Strings of a transform are templates of the globals, e.g.
 * "{base}", it is computed again if the globals change.
 */

const missing = v => v === null || v === undefined || (typeof v == 'string' && v.trim() === '');

const toNumber = v => {
    const n = missing(v) ? NaN : Number(v);
    return isNaN(n) ? null : n;
};

// the comparable values of a column: numbers if all are numbers, otherwise
// timestamps of dates if all are dates, otherwise strings
const comparable = values => {
    const present = values.filter(v => !missing(v));
    if (present.every(v => toNumber(v) !== null))
        return v => toNumber(v);
    if (present.every(v => toDate(v) !== null))
        return v => toDate(v);
    return v => missing(v) ? null : String(v);
};

// the indexes of the rows by the values of the columns `by`, as strings, in
// the order of the column `order`, rows without a value of it at the end
const groupsOf = (n, get, by, order) => {
    const groups = new Map();
    for (let i = 0; i < n; i++) {
        const key = JSON.stringify(by.map(c => String(get(i, c) ?? '')));
        if (!groups.has(key))
            groups.set(key, []);
        groups.get(key).push(i);
    }
    if (order) {
        const values = Array.from({ length: n }, (_, i) => get(i, order));
        const value = comparable(values);
        const keys = values.map(value);
        const rank = v => v === null ? Infinity : v;
        groups.forEach(g => g.sort((a, b) => {
            const [x, y] = [rank(keys[a]), rank(keys[b])];
            return x < y ? -1 : (x > y ? 1 : a - b);
        }));
    }
    return [...groups.values()];
};

// two digits, e.g. of a month
const pad = (v, n = 2) => String(v).padStart(n, '0');

// a date without a time, e.g. "2024-06-01", as the ones of the data
const dateOnly = /^\d{4}(-\d{2}(-\d{2})?)?$/;

const transformTypes = {
    // the year of a date, e.g. 2024 of "2024-06-01"
    year: (t, { n, values }) => Array.from({ length: n }, (_, i) => {
        const time = toDate(values(i));
        return time === null ? null : new Date(time).getFullYear();
    }),

    // the same day and time of a date in the year `year` (2020 by default,
    // a leap year, so the 29th of February is kept), e.g. to compare the
    // years of daily data, a date without a time is one without a time
    align: (t, { n, values }) => Array.from({ length: n }, (_, i) => {
        const v = values(i);
        const time = toDate(v);
        if (time === null)
            return null;
        const d = new Date(time);
        const day = `${pad(t.year ?? 2020, 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        return typeof v == 'string' && dateOnly.test(v.trim()) ? day
            : `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }),

    // the values relative to the mean of the values of the rows of `base`
    // in the group, times `scale` (100 by default), e.g. 100 in the base year
    index: (t, { n, numbers, groups, matches }) => {
        const result = new Array(n).fill(null);
        groups.forEach(g => {
            const base = g.filter(matches).map(numbers).filter(v => v !== null);
            const mean = base.length ? base.reduce((a, b) => a + b, 0)/base.length : null;
            g.forEach(i => {
                const v = numbers(i);
                result[i] = v === null || !mean ? null : v/mean*(t.scale ?? 100);
            });
        });
        return result;
    },

    // the share of the value of the sum of the values of the group, e.g. of
    // a date by "by": ["date"]
    share: (t, { n, numbers, groups }) => {
        const result = new Array(n).fill(null);
        groups.forEach(g => {
            const sum = g.map(numbers).filter(v => v !== null).reduce((a, b) => a + b, 0);
            g.forEach(i => {
                const v = numbers(i);
                result[i] = v === null || sum === 0 ? null : v/sum;
            });
        });
        return result;
    },

    // the mean of the values of `size` rows of the group in their order, the
    // ones before (`"align": "end"`, by default) or around the row
    // (`"center"`), missing values are left out, only of whole windows
    rolling: (t, { n, numbers, groups }) => {
        const result = new Array(n).fill(null);
        const size = Math.max(1, Math.round(t.size ?? 1));
        const before = t.align == 'center' ? Math.floor((size - 1)/2) : size - 1;
        groups.forEach(g => g.forEach((i, j) => {
            const start = j - before;
            if (start < 0 || start + size > g.length)
                return;
            const values = g.slice(start, start + size).map(numbers).filter(v => v !== null);
            result[i] = values.length ? values.reduce((a, b) => a + b, 0)/values.length : null;
        }));
        return result;
    },

    // the sum of the values of the group up to the row in their order, e.g.
    // of the days of a year, rows without a value have none
    cumulative: (t, { n, numbers, groups }) => {
        const result = new Array(n).fill(null);
        groups.forEach(g => {
            let sum = 0;
            g.forEach(i => {
                const v = numbers(i);
                if (v !== null)
                    result[i] = sum += v;
            });
        });
        return result;
    },
};

// the strings of a transform with the values of the globals
const filled = (t, globals) => {
    const fill = v => typeof v == 'string' ? fillTemplate(v, globals) : (Array.isArray(v) ? v.map(fill)
        : (v !== null && typeof v == 'object' ? Object.fromEntries(Object.entries(v).map(([k, e]) => [fill(k), fill(e)])) : v));
    return fill(t);
};

// the names of the globals of the transforms, e.g. `base` of "{base}"
const transformGlobals = transforms => [...new Set(templateRefs(JSON.stringify(transforms ?? [])))];

/**
 * The columns of the transforms, a Map of the names of the columns to their
 * values, one per row, `globals` are the values of the templates.
 */
const applyTransforms = (rows, transforms = [], globals = {}) => {
    const columns = new Map();
    const get = (i, c) => columns.has(c) ? columns.get(c)[i] : rows[i][c];
    for (const raw of [transforms].flat()) {
        const t = filled(raw, globals);
        const compute = transformTypes[t.type];
        if (!compute)
            throw new Error(`Unknown transform '${t.type}', expected one of ${Object.keys(transformTypes).map(n => `'${n}'`).join(', ')}`);
        const n = rows.length;
        const values = i => get(i, t.column);
        const by = [t.by ?? []].flat();
        // the rows of the base of an index, e.g. { "year": "2019" } or a range
        // of the comparable values of a column, e.g. { "date": ["2019-01-01", "2019-12-31"] }
        const conditions = Object.entries(t.base ?? {}).map(([c, v]) => {
            if (!Array.isArray(v))
                return i => String(get(i, c)) === String(v);
            const value = comparable([...Array.from({ length: n }, (_, i) => get(i, c)), ...v.filter(e => e !== null)]);
            const [from, to] = v.map(e => e === null ? null : value(e));
            return i => {
                const x = value(get(i, c));
                return x !== null && (from === null || x >= from) && (to === null || x <= to);
            };
        });
        columns.set(t.as ?? t.column, compute(t, {
            n,
            values,
            numbers: i => toNumber(values(i)),
            groups: groupsOf(n, get, by, t.order),
            matches: i => conditions.every(c => c(i)),
        }));
    }
    return columns;
};

// the columns of the data the transforms use, e.g. for parquet, the ones of
// the transforms themselves are no columns of the data
const transformColumns = transforms => {
    const own = new Set();
    const used = new Set();
    [transforms ?? []].flat().forEach(t => {
        [t.column, ...[t.by ?? []].flat(), t.order, ...Object.keys(t.base ?? {})]
            .filter(c => typeof c == 'string' && !own.has(c)).forEach(c => used.add(c));
        own.add(t.as ?? t.column);
    });
    return [...used];
};
