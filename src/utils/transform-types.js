// the computation of the transforms, loaded for definitions with transforms, see
// utils/transform.js
export { applyTransforms, transformTypes };

import { toDate, toNumber } from "@/utils/data";
import { fillTemplate } from "@/utils/def";
import { bind, constant, refNames } from "@/utils/expr";
import { missing } from "@/utils/values";

/**
 * The transforms of a definition compute columns of the data in the browser,
 * e.g. an index of a base year, which can be the global of a form element,
 * instead of a column per base year in the file. A transform computes the
 * column `as` (by default its `column`, which it replaces) of the values of
 * `column` in the groups of the rows of the same values of the columns `by`,
 * in the order of the column `order` (by default the one of the rows). The
 * columns of the transforms before are columns of the later ones and of the
 * mappings. Strings of a transform are templates of the globals, e.g.
 * "{base}", it is computed again if the globals change. Dates are the ones
 * of the time zone of the scale of `column` or `as`, local or UTC (`utc`).
 */

// the truth of a value of an expression, as the one of `if` of utils/expr.js
const truthy = v => Array.isArray(v) ? v.length > 0 : Boolean(v);

// the comparable values of a column: numbers if all are numbers, otherwise
// timestamps of dates if all are dates, otherwise strings
const comparable = (values, utc = false) => {
    const present = values.filter(v => !missing(v));
    if (present.every(v => toNumber(v) !== null))
        return v => toNumber(v);
    if (present.every(v => toDate(v, utc) !== null))
        return v => toDate(v, utc);
    return v => missing(v) ? null : String(v);
};

// the parts of a date in the time zone of the scale, local or UTC
const partsOf = (time, utc) => {
    const d = new Date(time);
    return utc
        ? { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), hours: d.getUTCHours(), minutes: d.getUTCMinutes(), seconds: d.getUTCSeconds() }
        : { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), hours: d.getHours(), minutes: d.getMinutes(), seconds: d.getSeconds() };
};

// the indexes of the rows by the values of the columns `by`, as strings, in
// the order of the column `order`, rows without a value of it at the end
const groupsOf = (n, get, by, order, utc) => {
    const groups = new Map();
    for (let i = 0; i < n; i++) {
        const key = JSON.stringify(by.map(c => String(get(i, c) ?? '')));
        if (!groups.has(key))
            groups.set(key, []);
        groups.get(key).push(i);
    }
    if (order) {
        const values = Array.from({ length: n }, (_, i) => get(i, order));
        const value = comparable(values, utc);
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
    year: (t, { n, values, utc }) => Array.from({ length: n }, (_, i) => {
        const time = toDate(values(i), utc);
        return time === null ? null : partsOf(time, utc).year;
    }),

    // the same day and time of a date in the year `year` (2020 by default,
    // a leap year, so the 29th of February is kept), e.g. to compare the
    // years of daily data, a date without a time is one without a time
    align: (t, { n, values, utc }) => Array.from({ length: n }, (_, i) => {
        const v = values(i);
        const time = toDate(v, utc);
        if (time === null)
            return null;
        const d = partsOf(time, utc);
        const day = `${pad(t.year ?? 2020, 4)}-${pad(d.month + 1)}-${pad(d.day)}`;
        return typeof v == 'string' && dateOnly.test(v.trim()) ? day
            : `${day}T${pad(d.hours)}:${pad(d.minutes)}:${pad(d.seconds)}`;
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

    // the mean of the values of the rows of `base` (all of them by default)
    // in the group, a value of every row of the group, e.g. the mean of a day
    // of all years with "by": "day" (the day of `align`) or the one of the
    // years of a period with "base": { "year": [1961, 1990] }, without one if
    // there are less than `min` values (1 by default)
    mean: (t, { n, numbers, groups, matches }) => {
        const result = new Array(n).fill(null);
        const least = Math.max(1, Number(t.min) || 1);
        groups.forEach(g => {
            const base = g.filter(matches).map(numbers).filter(v => v !== null);
            const mean = base.length >= least ? base.reduce((a, b) => a + b, 0)/base.length : null;
            g.forEach(i => result[i] = mean);
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
    // (`"center"`), missing values are left out, only of whole windows, a row
    // without a value has none, as of cumulative. The window moves along the
    // rows, its sum is compensated (Neumaier), so small values beside large
    // ones are kept, e.g. 1 beside 1e17.
    rolling: (t, { n, numbers, groups }) => {
        const result = new Array(n).fill(null);
        const size = Math.max(1, Math.round(t.size ?? 1));
        const before = t.align == 'center' ? Math.floor((size - 1)/2) : size - 1;
        groups.forEach(g => {
            const values = g.map(numbers);
            let sum = 0;
            let compensation = 0;
            let count = 0;
            const add = x => {
                const s = sum + x;
                compensation += Math.abs(sum) >= Math.abs(x) ? (sum - s) + x : (x - s) + sum;
                sum = s;
            };
            for (let end = 0; end < values.length; end++) {
                if (values[end] !== null) {
                    add(values[end]);
                    count++;
                }
                const start = end - size + 1;
                if (start > 0 && values[start - 1] !== null) {
                    add(-values[start - 1]);
                    count--;
                }
                // the window of the row `start + before`
                if (start >= 0 && values[start + before] !== null)
                    result[g[start + before]] = count ? (sum + compensation)/count : null;
            }
        });
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

    // the value of the expression `expr` of the row (see utils/expr.js), its
    // names are the columns of the row and the globals, e.g. { "*": [{ "/":
    // ["@value", "@inno"] }, 100] }, no value is null
    calc: (t, { n, expr }) => {
        const f = expr(t.expr ?? null);
        return Array.from({ length: n }, (_, i) => f(i) ?? null);
    },

    // the rows whose expression `expr` is true (see utils/expr.js, the names
    // are the ones of calc), the later transforms and the plots have only
    // them, e.g. { ">": ["@value", 0] }, see applyTransforms
    filter: (t, { n, expr }) => {
        const f = expr(t.expr ?? true);
        return Array.from({ length: n }, (_, i) => truthy(f(i)));
    },

    // the rank of the value in its group, 1 of the least one or of the
    // largest one (`"descending": true`), the same values have the same
    // rank, e.g. 1, 2, 2, 4, rows without a value have none
    rank: (t, { n, numbers, groups }) => {
        const result = new Array(n).fill(null);
        groups.forEach(g => {
            const values = g.filter(i => numbers(i) !== null).sort((a, b) => t.descending ? numbers(b) - numbers(a) : numbers(a) - numbers(b));
            values.forEach((i, k) => {
                result[i] = k > 0 && numbers(values[k - 1]) === numbers(i) ? result[values[k - 1]] : k + 1;
            });
        });
        return result;
    },

    // the value of the column `value` of the row of a file of rows (`data`)
    // whose column `key` is the value of the column, e.g. the name of a
    // country in a language, "value": "name_{lang}", missing ones have none
    lookup: (t, { n, values, files }) => {
        const rows = files?.get(t.data);
        if (!rows)
            throw new Error(`lookup: the rows of '${t.data}' are not loaded, the url of the data can not be a template`);
        const byKey = new Map();
        rows.forEach(r => {
            const k = String(r[t.key]);
            if (!byKey.has(k))
                byKey.set(k, r[t.value]);
        });
        return Array.from({ length: n }, (_, i) => {
            const v = values(i);
            return missing(v) ? null : byKey.get(String(v)) ?? null;
        });
    },
};

// the strings of a transform with the values of the globals
const filled = (t, globals) => {
    const fill = v => typeof v == 'string' ? fillTemplate(v, globals) : (Array.isArray(v) ? v.map(fill)
        : (v !== null && typeof v == 'object' ? Object.fromEntries(Object.entries(v).map(([k, e]) => [fill(k), fill(e)])) : v));
    return fill(t);
};

/**
 * The columns of the transforms, a Map of the names of the columns to their
 * values, one per row, `globals` are the values of the templates, `utc` the
 * columns of dates of `utc` scales, see utcColumns. With the columns of the
 * rows `before`, e.g. before a change of a global, the transforms are
 * computed from the first one which changes, e.g. by the global, the ones
 * before it are kept, `changed` are the names of the columns computed again,
 * without changes the columns are the ones before. `files` are the rows of
 * the files of lookups by their url, see the store.
 */
const applyTransforms = (rows, transforms = [], globals = {}, utc = new Set(), before = null, files = null) => {
    const present = new Set(rows.length ? Object.keys(rows[0]) : []);
    // the columns of the transforms before, the names of an expression which
    // are none of them or of the rows are globals
    const own = new Set();
    const list = [transforms].flat().map(raw => {
        const t = filled(raw, globals);
        // the values of the globals of an expression are part of the key, so
        // e.g. a calc of "@factor" is computed again if the global changes
        const refs = t.expr === undefined ? [] : [...new Set(refNames(t.expr))]
            .filter(n => typeof n == 'string' && !own.has(n) && !present.has(n) && Object.hasOwn(globals, n));
        if (t.type != 'filter')
            own.add(t.as ?? t.column);
        return { t, inUtc: utc.has(t.column) || utc.has(t.as ?? t.column), refs: refs.map(n => [n, globals[n] ?? null]) };
    });
    const keys = list.map(({ t, inUtc, refs }) => JSON.stringify([t, inUtc, refs]));
    const steps = before?.steps ?? [];
    let first = 0;
    while (first < list.length && first < steps.length && steps[first].key === keys[first])
        first++;
    if (before && first == list.length && steps.length == list.length)
        return before;

    // the columns of the transforms which are kept, in their order, and the
    // rows of the filters (`kept`, the indexes of the rows, null without a
    // filter), the later transforms compute the values of these rows, the
    // others have none
    const columns = new Map();
    const kept = steps.slice(0, first);
    kept.forEach(s => s.name !== null && columns.set(s.name, s.values));
    columns.steps = [...kept];
    columns.kept = kept.at(-1)?.kept ?? null;
    // also the columns which are not computed anymore, e.g. of another `as`
    columns.changed = new Set(steps.slice(first).map(s => s.name).filter(n => n !== null));
    const read = (i, c) => columns.has(c) ? columns.get(c)[i] : rows[i][c];
    for (const [k, { t, inUtc }] of list.entries()) {
        if (k < first)
            continue;
        const compute = Object.hasOwn(transformTypes, t.type) ? transformTypes[t.type] : undefined;
        if (!compute)
            throw new Error(`Unknown transform '${t.type}', expected one of ${Object.keys(transformTypes).map(n => `'${n}'`).join(', ')}`);
        // the rows of the filters before, by their index among them
        const index = columns.kept;
        const n = index ? index.length : rows.length;
        const get = index ? (i, c) => read(index[i], c) : read;
        const values = i => get(i, t.column);
        const by = [t.by ?? []].flat();
        // the rows of the base of an index, e.g. { "year": "2019" } or a range
        // of the comparable values of a column, e.g. { "date": ["2019-01-01", "2019-12-31"] }
        const conditions = Object.entries(t.base ?? {}).map(([c, v]) => {
            if (!Array.isArray(v))
                return i => String(get(i, c)) === String(v);
            const value = comparable([...Array.from({ length: n }, (_, i) => get(i, c)), ...v.filter(e => e !== null)], inUtc);
            const [from, to] = v.map(e => e === null ? null : value(e));
            return i => {
                const x = value(get(i, c));
                return x !== null && (from === null || x >= from) && (to === null || x <= to);
            };
        });
        // an expression of the row, its names are the columns of the row and the globals
        const expr = raw => bind(raw, name => typeof name == 'symbol' ? undefined
            : (!columns.has(name) && !present.has(name) && Object.hasOwn(globals, name) ? constant(globals[name]) : i => get(i, name)));
        let groups = null;
        const result = compute(t, {
            n,
            get,
            files,
            values,
            expr,
            numbers: i => toNumber(values(i)),
            // only of the types which need them, e.g. not of the year
            get groups() { return groups ??= groupsOf(n, get, by, t.order, inUtc); },
            matches: i => conditions.every(c => c(i)),
            utc: inUtc,
        });
        if (t.type == 'filter') {
            columns.kept = (index ?? Array.from({ length: n }, (_, i) => i)).filter((r, i) => result[i]);
            columns.steps.push({ key: keys[k], name: null, kept: columns.kept });
            continue;
        }
        const name = t.as ?? t.column;
        // the values of all rows, none of the ones of the filters before
        const all = index ? new Array(rows.length).fill(null) : result;
        if (index)
            index.forEach((r, i) => all[r] = result[i]);
        columns.set(name, all);
        columns.steps.push({ key: keys[k], name, values: all, kept: index });
        columns.changed.add(name);
    }
    return columns;
};
