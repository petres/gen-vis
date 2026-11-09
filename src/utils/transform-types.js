// the computation of the transforms, loaded for definitions with transforms, see
// utils/transform.js
export { applyTransforms, transformTypes, randomOf };

import { quantile } from "d3-array";
import { timeFormat, utcFormat } from "d3-time-format";
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

// the aggregate of numbers (`op`): the sum, mean, least or largest one, the
// number of them (0 of none), the median (the mean of the two middle ones of
// an even number), the quartiles (`q1`, `q3`) or the quantile `p` (between
// 0 and 1, interpolated between the two nearest values as the median, the
// R-7 rule of d3-array, Excel and R) or the first or the last one, none of
// no numbers
const aggregateOps = ['sum', 'mean', 'min', 'max', 'count', 'median', 'q1', 'q3', 'quantile', 'first', 'last'];
const checkOp = t => {
    if (!aggregateOps.includes(t.op))
        throw new Error(`aggregate: the op is one of ${aggregateOps.map(o => `'${o}'`).join(', ')}`);
    probabilityOf(t.op, t);
};
// the probability of a quantile op, of `p` of the transform
const quantiles = { median: 0.5, q1: 0.25, q3: 0.75 };
const probabilityOf = (op, t) => {
    if (op != 'quantile')
        return quantiles[op];
    const p = toNumber(t?.p);
    if (p === null || p < 0 || p > 1)
        throw new Error(`${t?.type ?? 'aggregate'}: the quantile needs 'p', a number from 0 to 1, e.g. 0.9`);
    return p;
};
const aggregateOf = (op, values, t) => {
    if (op == 'count')
        return values.length;
    if (Object.hasOwn(quantiles, op) || op == 'quantile') {
        const p = probabilityOf(op, t);
        return values.length == 0 ? null : quantile(values, p);
    }
    if (values.length == 0)
        return null;
    switch (op) {
    case 'sum': return values.reduce((a, b) => a + b, 0);
    case 'mean': return values.reduce((a, b) => a + b, 0)/values.length;
    case 'min': return values.reduce((a, b) => Math.min(a, b));
    case 'max': return values.reduce((a, b) => Math.max(a, b));
    case 'first': return values[0];
    case 'last': return values[values.length - 1];
    default:
        throw new Error(`aggregate: the op is one of ${aggregateOps.map(o => `'${o}'`).join(', ')}`);
    }
};

/**
 * The sum, mean, least or largest value, the median or a quantile (`op`) of the values of `size` rows
 * of the group in their order, the ones before (`"align": "end"`, by
 * default) or around the row (`"center"`), missing values are left out,
 * only of whole windows, a row without a value has none, as of cumulative.
 * The window moves along the rows, its sum is compensated (Neumaier), so
 * small values beside large ones are kept, e.g. 1 beside 1e17.
 */
const slide = (t, { n, numbers, groups }, op) => {
    const result = new Array(n).fill(null);
    const size = Math.max(1, Math.round(toNumber(t.size) ?? 1));
    const before = t.align == 'center' ? Math.floor((size - 1)/2) : size - 1;
    // the least or the largest value, the median or a quantile of the
    // window, of the values in it
    const ofWindow = (values, start, end) => {
        if (op != 'min' && op != 'max')
            return aggregateOf(op, values.slice(start, end + 1).filter(v => v !== null), t);
        let result = null;
        for (let k = start; k <= end; k++)
            if (values[k] !== null)
                result = result === null ? values[k] : (op == 'min' ? Math.min(result, values[k]) : Math.max(result, values[k]));
        return result;
    };
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
                result[g[start + before]] = count == 0 ? null
                    : op == 'mean' ? (sum + compensation)/count
                    : op == 'sum' ? sum + compensation
                    : ofWindow(values, start, end);
        }
    });
    return result;
};

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

    // the text of a date in a time format (`format`, of d3-time-format), in
    // the time zone of the scale, e.g. the week of the year (%W, from
    // Monday), the weekday (%u, 1 is Monday), the month (%m) or the quarter
    // (%q), e.g. the rows and columns of a calendar; the names of months
    // and days (%b, %a) are English, rows without a date have none
    format: (t, { n, values, utc }) => {
        if (typeof t.format != 'string')
            throw new Error(`format: the time format is needed, e.g. "%W" (the week of the year)`);
        const f = (utc ? utcFormat : timeFormat)(t.format);
        return Array.from({ length: n }, (_, i) => {
            const time = toDate(values(i), utc);
            return time === null ? null : f(new Date(time));
        });
    },

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
    // without a value has none, as of cumulative, see slide
    rolling: (t, context) => slide(t, context, 'mean'),

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

    // a random number of the row in `range` ([0, 1] by default), the same of
    // every draw: a hash of the `seed` (0 by default) and of the row, its
    // index in the data or its value of the column `key`, so a row keeps it
    // if others are left out, e.g. the vertical place of a point of a strip
    // plot in its band, see randomOf
    random: (t, { n, get, index }) => {
        const [lo, hi] = Array.isArray(t.range) ? t.range.map(toNumber) : [0, 1];
        const seed = String(t.seed ?? 0);
        return Array.from({ length: n }, (_, i) => {
            const key = t.key === undefined ? index(i) : get(i, t.key);
            return lo + (hi - lo)*randomOf(`${seed}:${missing(key) ? '' : key}`);
        });
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

/**
 * The least squares fit of the values of `column` (y) on the ones of the
 * column `x` (numbers, or dates as milliseconds) of the rows of the group,
 * the fitted value of every row with an x (also of one without a y), e.g.
 * the trend line of a scatter plot drawn as a line through the data's x
 * range: `method` linear (y = a + bx, the default), log (y = a + b ln x, of
 * x > 0), exp (y = a e^(bx), the fit of ln y, of y > 0) or poly (a
 * polynomial of `degree` 2 or 3). x is centered and scaled for the fit, so
 * dates and large numbers are fitted as small ones. A group of fewer
 * points than coefficients (or of one x) has no values.
 */
const regressionMethods = ['linear', 'log', 'exp', 'poly'];
const regression = (t, { n, get, numbers, groups, utc }) => {
    const method = t.method ?? 'linear';
    if (!regressionMethods.includes(method))
        throw new Error(`regression: the method is one of ${regressionMethods.map(m => `'${m}'`).join(', ')}`);
    if (typeof t.x != 'string')
        throw new Error(`regression: the column of the x values ('x') is needed`);
    const degree = method == 'poly' ? Math.round(toNumber(t.degree) ?? 2) : 1;
    if (!(degree >= 1 && degree <= 3))
        throw new Error(`regression: the degree of a poly is 2 or 3`);
    const xOf = comparable(Array.from({ length: n }, (_, i) => get(i, t.x)), utc);
    // x of the fit: ln x of log, nothing of x <= 0; y: ln y of exp
    const fx = i => {
        const x = xOf(get(i, t.x));
        return typeof x != 'number' || !Number.isFinite(x) || (method == 'log' && x <= 0) ? null : (method == 'log' ? Math.log(x) : x);
    };
    const fy = i => {
        const y = numbers(i);
        return y === null || (method == 'exp' && y <= 0) ? null : (method == 'exp' ? Math.log(y) : y);
    };
    const result = new Array(n).fill(null);
    groups.forEach(g => {
        const points = g.map(i => [fx(i), fy(i)]).filter(([x, y]) => x !== null && y !== null);
        if (points.length < degree + 1)
            return;
        const mean = points.reduce((a, [x]) => a + x, 0)/points.length;
        const spread = Math.sqrt(points.reduce((a, [x]) => a + (x - mean)**2, 0)/points.length);
        if (!(spread > 0))
            return;
        const z = x => (x - mean)/spread;
        // the normal equations of the coefficients of 1, z, z², ...
        const k = degree + 1;
        const a = Array.from({ length: k }, () => new Array(k + 1).fill(0));
        points.forEach(([x, y]) => {
            const powers = Array.from({ length: k }, (_, j) => z(x)**j);
            for (let r = 0; r < k; r++) {
                for (let c = 0; c < k; c++)
                    a[r][c] += powers[r]*powers[c];
                a[r][k] += powers[r]*y;
            }
        });
        const coefficients = solve(a);
        if (!coefficients)
            return;
        g.forEach(i => {
            const x = fx(i);
            if (x === null)
                return;
            const v = coefficients.reduce((sum, c, j) => sum + c*z(x)**j, 0);
            result[i] = method == 'exp' ? Math.exp(v) : v;
        });
    });
    return result;
};

// the solution of the linear equations of an augmented matrix (Gauss with
// partial pivoting), null of a singular one, e.g. of too few distinct x
const solve = a => {
    const k = a.length;
    for (let c = 0; c < k; c++) {
        let pivot = c;
        for (let r = c + 1; r < k; r++)
            if (Math.abs(a[r][c]) > Math.abs(a[pivot][c]))
                pivot = r;
        if (Math.abs(a[pivot][c]) < 1e-12)
            return null;
        [a[c], a[pivot]] = [a[pivot], a[c]];
        for (let r = c + 1; r < k; r++) {
            const f = a[r][c]/a[c][c];
            for (let j = c; j <= k; j++)
                a[r][j] -= f*a[c][j];
        }
    }
    const x = new Array(k).fill(0);
    for (let r = k - 1; r >= 0; r--)
        x[r] = (a[r][k] - a[r].slice(r + 1, k).reduce((sum, v, j) => sum + v*x[r + 1 + j], 0))/a[r][r];
    return x;
};

// a number in [0, 1) of a text, the same of every run and implementation:
// the 32 bits of FNV-1a of its UTF-16 code units, mixed by the finalizer of
// MurmurHash3, divided by 2^32
const randomOf = text => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++)
        h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0)/4294967296;
};

// the edges of the classes of a bin: numbers and ranges { "from", "to",
// "step" } (from and to included if they are steps), sorted, or of `step`
// alone the multiples of it around the values, null without two of them
const binEdges = (t, values) => {
    const range = ({ from, to, step }) => {
        const [a, b, d] = [from, to, step].map(toNumber);
        if (![a, b, d].every(Number.isFinite) || !(d > 0) || b < a)
            throw new Error(`bin: a range of edges is { "from": 50, "to": 250, "step": 5 }`);
        // as integers of steps, so e.g. 0.1 steps have no rounding errors
        const count = Math.floor((b - a)/d + 1e-9);
        return Array.from({ length: count + 1 }, (_, k) => +(a + k*d).toPrecision(12));
    };
    let edges;
    if (t.edges !== undefined)
        edges = [t.edges].flat().flatMap(e => e !== null && typeof e == 'object' ? range(e) : [toNumber(e)]);
    else if (t.step !== undefined) {
        const step = toNumber(t.step);
        if (!(step > 0))
            throw new Error(`bin: 'step' is the width of the classes, e.g. 5`);
        // a loop, not Math.min(...values), which fails for more values than
        // the arguments of a call
        let lo = Infinity;
        let hi = -Infinity;
        for (const v of values)
            if (v !== null) {
                lo = Math.min(lo, v);
                hi = Math.max(hi, v);
            }
        if (lo > hi)
            return null;
        edges = range({ from: Math.floor(lo/step)*step, to: Math.max(Math.ceil(hi/step), Math.floor(lo/step) + 1)*step, step });
    } else
        throw new Error(`bin: the 'edges' of the classes are needed, e.g. [{ "from": 50, "to": 250, "step": 5 }, 143], or a 'step'`);
    edges = [...new Set(edges.filter(e => e !== null && Number.isFinite(e)))].sort((a, b) => a - b);
    return edges.length < 2 ? null : edges;
};

/**
 * The rows of a bin: a row per class of `edges` and group of `by` (of the
 * rows with values, also of empty classes, 0), with the values of the columns `by`, the start (`start`,
 * "start" by default) and the end (`end`, "end") of the class and the number
 * of the values of `column` in it (`as`, "count"), or the sum of their
 * `weight`, or of them `normalize`d: the `share` of the group or the
 * `density` (the share per unit of `column`, per `per` units), the count
 * per `per` units of the width of the class otherwise. The classes include their start, the last one also its end,
 * values outside the edges are left out (`outside`, their number).
 */
const binRows = (t, { n, get, numbers, groups }) => {
    const values = Array.from({ length: n }, (_, i) => numbers(i));
    const edges = binEdges(t, values);
    const by = [t.by ?? []].flat();
    const names = { start: t.start ?? 'start', end: t.end ?? 'end', value: t.as ?? 'count' };
    const last = edges ? edges.length - 2 : -1;
    let outside = 0;
    // one group of all rows without `by`, also without rows, otherwise the
    // groups of rows with values, e.g. not the ones of the rows of another bin
    const all = by.length == 0 ? [Array.from({ length: n }, (_, i) => i)] : groups.filter(g => g.some(i => values[i] !== null));
    const rows = edges === null ? [] : all.flatMap(g => {
        const sums = new Array(last + 1).fill(0);
        for (const i of g) {
            const v = values[i];
            if (v === null)
                continue;
            if (v < edges[0] || v > edges[last + 1]) {
                outside++;
                continue;
            }
            // the class of the value: the last edge not after it, the end of the last class is in it
            let lo = 0;
            let hi = last + 1;
            while (hi - lo > 1) {
                const mid = (lo + hi) >> 1;
                if (edges[mid] <= v)
                    lo = mid;
                else
                    hi = mid;
            }
            const w = t.weight === undefined ? 1 : toNumber(get(i, t.weight));
            sums[lo] += w ?? 0;
        }
        const keys = Object.fromEntries(by.map(c => [c, g.length ? get(g[0], c) ?? null : null]));
        // the share of the sum of the group, a density per unit of `column`
        // (the area of the classes is 1) or per `per` units, the count (or
        // sum) per `per` units of the width of the class
        const total = sums.reduce((a, b) => a + b, 0);
        const width = k => (edges[k + 1] - edges[k])/(t.per ?? 1);
        const value = (sum, k) => t.normalize == 'share' ? (total ? sum/total : 0)
            : t.normalize == 'density' ? (total ? sum/total/width(k) : 0)
            : (t.per === undefined ? sum : sum/width(k));
        return sums.map((sum, k) => ({ ...keys, [names.start]: edges[k], [names.end]: edges[k + 1], [names.value]: value(sum, k) }));
    });
    const notes = [];
    // edges of no class, e.g. a single one, not the ones of a step without values
    if (edges === null && t.edges !== undefined)
        notes.push(`the edges ${JSON.stringify(t.edges)} are no classes, at least two different ones are needed`);
    if (outside > 0)
        notes.push(`${outside} values of '${t.column}' outside the edges ${edges[0]} to ${edges.at(-1)} are left out`);
    return { rows, notes };
};

// the columns of a fold: the list `columns` or the ones of the `names` of
// the columns which match a pattern with a `*`, e.g. "20*", in their order
const foldColumns = (t, names) => {
    if (t.columns === undefined)
        throw new Error(`fold: the 'columns' to fold are needed, e.g. ["2019", "2020"] or "20*"`);
    if (Array.isArray(t.columns))
        return t.columns.map(String);
    const pattern = String(t.columns);
    const parts = pattern.split('*');
    if (parts.length == 1)
        return [pattern];
    if (parts.length > 2)
        throw new Error(`fold: a pattern of columns has a single '*', e.g. "20*", not '${pattern}'`);
    const [prefix, suffix] = parts;
    return names.filter(c => c.length >= prefix.length + suffix.length && c.startsWith(prefix) && c.endsWith(suffix));
};

/**
 * The rows of a fold, wide to long: of every row and every column of
 * `columns` (a list or a pattern with a `*`, e.g. "20*", the columns of the
 * row which match) in their order a row with the other columns of the row
 * (also the ones of the transforms before), the name of the column (`key`,
 * "key" by default) and its value (`value`, "value"), as it is.
 */
const foldRows = (t, { n, get, names }) => {
    const columns = foldColumns(t, names);
    const folded = new Set(columns);
    const [key, value] = [t.key ?? 'key', t.value ?? 'value'];
    const others = names.filter(c => !folded.has(c));
    const notes = [];
    // a column of the name of the key or the value is replaced by it
    const replaced = others.filter(c => c == key || c == value);
    if (replaced.length > 0)
        notes.push(`the column${replaced.length > 1 ? 's' : ''} ${replaced.map(c => `'${c}'`).join(', ')} of the rows ${replaced.length > 1 ? 'are' : 'is'} replaced by the ${replaced.map(c => c == key ? 'key' : 'value').join(' and the ')} of the fold, see 'key' and 'value'`);
    if (key == value)
        notes.push(`the key and the value have the same name '${key}', the value replaces the key`);
    const rows = [];
    for (let i = 0; i < n; i++) {
        const row = Object.fromEntries(others.map(c => [c, get(i, c) ?? null]));
        columns.forEach(c => rows.push({ ...row, [key]: c, [value]: get(i, c) ?? null }));
    }
    return { rows, notes };
};

// the rows of an aggregate with `rows`: a row per group, in the order of
// their first rows, with the values of the columns `by` of the first row
// of the group (as they are) and the aggregate (`as`), without `by` one row
// of all rows, also without rows
const aggregateRows = (t, { n, get, numbers, groups }) => {
    checkOp(t);
    const by = [t.by ?? []].flat();
    const all = by.length == 0 ? [Array.from({ length: n }, (_, i) => i)] : groups;
    const as = t.as ?? t.column;
    const rows = all.map(g => {
        const first = g.reduce((a, b) => Math.min(a, b), Infinity);
        const keys = Object.fromEntries(by.map(c => [c, get(first, c) ?? null]));
        return { ...keys, [as]: aggregateOf(t.op, g.map(numbers).filter(v => v !== null), t) };
    });
    // the aggregate replaces a column of the groups of its name
    const notes = by.includes(as) ? [`the aggregate '${as}' replaces the column '${as}' of 'by', see 'as'`] : [];
    return { rows, notes };
};

// the value of another row of the group in their order, `offset` rows
// (1 by default) before (`lag`) or after (`lead`) the row, or relative to
// the one before: the difference (`diff`) or the change in percent
// (`pct`, none of a value before of 0), none at the ends of the group or
// of a missing value; or the sum, mean, least or largest value of a
// window of `size` rows, as rolling (`sum`, `mean`, `min`, `max`, `median`,
// `q1`, `q3`, `quantile` of `p`), e.g. a rolling median
const windowOps = ['sum', 'mean', 'min', 'max', 'median', 'q1', 'q3', 'quantile'];
const windowOf = (t, context) => {
    const { n, numbers, groups } = context;
    if (windowOps.includes(t.op)) {
        probabilityOf(t.op, t);
        return slide(t, context, t.op);
    }
    if (!['lag', 'lead', 'diff', 'pct'].includes(t.op))
        throw new Error(`window: the op is one of ${['lag', 'lead', 'diff', 'pct', ...windowOps].map(o => `'${o}'`).join(', ')}`);
    const result = new Array(n).fill(null);
    const offset = Math.round(toNumber(t.offset) ?? 1);
    // the values of lag and lead: numbers, other values as they are, e.g.
    // texts or dates; numbers of the differences
    const valueOf = t.op == 'lag' || t.op == 'lead' ? i => {
        const v = context.values(i);
        return toNumber(v) ?? (v === undefined || v === '' ? null : v);
    } : numbers;
    groups.forEach(g => {
        const values = g.map(valueOf);
        g.forEach((i, k) => {
            const j = t.op == 'lead' ? k + offset : k - offset;
            const other = j >= 0 && j < values.length ? values[j] : null;
            const v = values[k];
            result[i] = t.op == 'lag' || t.op == 'lead' ? other
                : v === null || other === null ? null
                : t.op == 'diff' ? v - other
                : other === 0 ? null : (v/other - 1)*100;
        });
    });
    return result;
};

// an aggregate of the values of the group: their sum, mean, least or
// largest value, number (`count`), median, quartile or quantile, first or last one in their
// order (`op`), missing values are left out, a value of every row of the
// group, e.g. the total of a country of all years; with `rows` a row per
// group instead, see aggregateRows
const aggregateOfGroups = (t, { n, numbers, groups }) => {
    checkOp(t);
    const result = new Array(n).fill(null);
    groups.forEach(g => {
        const value = aggregateOf(t.op, g.map(numbers).filter(v => v !== null), t);
        g.forEach(i => result[i] = value);
    });
    return result;
};

// the transforms which change the rows, see applyTransforms: a bin and a
// fold, an aggregate with `rows`; their rows replace the rows (`replace`,
// by default of a fold and always of an aggregate) or follow them; the
// columns of their rows are their own, not ones of the data
transformTypes.bin = binRows;
transformTypes.fold = foldRows;
transformTypes.aggregate = aggregateOfGroups;
transformTypes.window = windowOf;
transformTypes.regression = regression;
const producesRows = t => t.type == 'bin' || t.type == 'fold' || (t.type == 'aggregate' && Boolean(t.rows));
const replaces = t => t.type == 'aggregate' || (t.replace ?? t.type == 'fold');
const rowColumns = t => t.type == 'bin' ? [t.start ?? 'start', t.end ?? 'end', t.as ?? 'count', ...[t.by ?? []].flat()]
    : t.type == 'fold' ? [t.key ?? 'key', t.value ?? 'value']
    : [t.as ?? t.column, ...[t.by ?? []].flat()];

// the names of the columns of rows: of csv the ones of its header, of JSON
// the ones of all rows (a row may lack some, e.g. a year without a value),
// in the order they first appear
const rowNames = rows => {
    if (Array.isArray(rows.columns))
        return rows.columns;
    const names = new Set();
    for (const r of rows)
        for (const k in r)
            names.add(k);
    return [...names];
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
 * the files of lookups by their url, see the store. A transform of rows
 * (`bin`, `fold`, `aggregate` with `rows`) adds its rows after the rows or
 * replaces them (`replace`): then `rows` are the rows of the columns, the
 * ones of the data otherwise (null).
 * `notes` are the warnings of the transforms, e.g. values outside the edges.
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
        if (producesRows(t))
            rowColumns(t).forEach(c => own.add(c));
        else if (t.type != 'filter')
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

    // the state after the transforms which are kept: the rows (the ones of
    // the data or of a transform of rows), the columns of the transforms in
    // their order and the rows of the filters (`kept`, the indexes of the
    // rows, null without a filter), the later transforms compute the values
    // of these rows, the others have none
    const state = steps[first - 1]?.state ?? { rows, columns: [], kept: null, notes: [] };
    let base = state.rows;
    const columns = new Map(state.columns);
    columns.steps = steps.slice(0, first);
    columns.kept = state.kept;
    const notes = [...state.notes];
    // also the columns which are not computed anymore, e.g. of another `as`
    columns.changed = new Set(steps.slice(first).map(s => s.name).filter(n => n !== null));
    const read = (i, c) => columns.has(c) ? columns.get(c)[i] ?? null : base[i][c];
    const save = (key, name) => columns.steps.push({ key, name,
        state: { rows: base, columns: [...columns], kept: columns.kept, notes: [...notes] } });
    for (const [k, { t, inUtc }] of list.entries()) {
        if (k < first)
            continue;
        let compute = Object.hasOwn(transformTypes, t.type) ? transformTypes[t.type] : undefined;
        if (t.type == 'aggregate' && producesRows(t))
            compute = aggregateRows;
        if (!compute)
            throw new Error(`Unknown transform '${t.type}', expected one of ${Object.keys(transformTypes).map(n => `'${n}'`).join(', ')}`);
        // the rows of the filters before, by their index among them
        const index = columns.kept;
        const n = index ? index.length : base.length;
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
            // the index of the row in the rows, e.g. of the data
            index: index ? i => index[i] : i => i,
            // only of the types which need them, e.g. not of the year
            get groups() { return groups ??= groupsOf(n, get, by, t.order, inUtc); },
            matches: i => conditions.every(c => c(i)),
            utc: inUtc,
            // the names of the columns of the rows and of the transforms
            // before, in their order, e.g. of a pattern of a fold
            get names() { return [...new Set([...rowNames(base), ...columns.keys()])]; },
        });
        if (producesRows(t)) {
            // the rows of the transform after the rows (the columns before
            // have the values of the rows which have them, e.g. of a fold,
            // none otherwise, the filters before keep them), or instead of
            // them (`replace`, all columns are new)
            result.notes.forEach(note => notes.push(`transform[${k}] (${t.type}): ${note}`));
            if (!replaces(t)) {
                const added = result.rows.map((_, j) => base.length + j);
                [...columns].forEach(([c, v]) => columns.set(c, [...v, ...result.rows.map(r => r[c] ?? null)]));
                columns.kept = index ? [...index, ...added] : null;
                base = [...base, ...result.rows];
            } else {
                columns.clear();
                columns.kept = null;
                base = result.rows;
            }
            result.rows.forEach(r => Object.keys(r).forEach(c => present.add(c)));
            save(keys[k], null);
            continue;
        }
        if (t.type == 'filter') {
            columns.kept = (index ?? Array.from({ length: n }, (_, i) => i)).filter((r, i) => result[i]);
            save(keys[k], null);
            continue;
        }
        const name = t.as ?? t.column;
        // the values of all rows, none of the ones of the filters before
        const all = index ? new Array(base.length).fill(null) : result;
        if (index)
            index.forEach((r, i) => all[r] = result[i]);
        columns.set(name, all);
        save(keys[k], name);
        columns.changed.add(name);
    }
    columns.rows = base === rows ? null : base;
    columns.notes = notes;
    return columns;
};
