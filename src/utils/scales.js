export { makeScale, bandCenter, intervalOf };

import * as d3 from "@/utils/d3";
import { evaluate } from "@/utils/expr";
import { continuous, convert } from "@/utils/data";
import { comparison } from "@/utils/values";

// the periods of the dates of a mapping (`interval`): day, week, month,
// quarter, half (a year), year or a number of them, e.g. "6 months", of the
// time zone of the scale, null without one or of another value
const units = { day: 'Day', week: 'Week', month: 'Month', quarter: ['Month', 3], half: ['Month', 6], year: 'Year' };
const intervalOf = (spec, utc = false) => {
    if (typeof spec != 'string')
        return null;
    const m = /^\s*(\d+)?\s*([a-z]+?)s?\s*$/.exec(spec.toLowerCase());
    const unit = m && Object.hasOwn(units, m[2]) ? units[m[2]] : null;
    if (!unit)
        return null;
    const [name, size] = Array.isArray(unit) ? unit : [unit, 1];
    const count = size*(m[1] ? Number(m[1]) : 1);
    const base = d3[`${utc ? 'utc' : 'time'}${name}`];
    const interval = count == 1 ? base : base.every(count);
    return interval && { offset: d => interval.offset(d instanceof Date ? d : new Date(d), 1) };
};

// the offset of the center of a band, the position of band scales is its start
const bandCenter = s => s.bandwidth ? s.bandwidth()/2 : 0;

// the colors of a scheme of d3, e.g. "Blues", schemes of several sizes have
// `classes` colors, by default the number of classes of a threshold scale or 5
const schemeRange = scaleDef => {
    const n = scaleDef.classes ?? (scaleDef.type == 'threshold' ? scaleDef.domain.length + 1 : 5);
    const colors = d3.schemeColors(scaleDef.scheme, n);
    if (!colors)
        throw new Error(`Unknown scheme '${scaleDef.scheme}', e.g. 'Blues' or 'Tableau10'`);
    return colors;
};

// the transform of the positions of a type of scale and its inverse, e.g.
// the log of log, sequentialLog and divergingLog, of the values of a domain
// of `sign` (the one of a log scale, its values are all positive or all
// negative), linear for the others
const transformOf = (type, sign) => {
    const t = type.toLowerCase();
    const sym = f => v => Math.sign(v)*f(Math.abs(v));
    if (t.endsWith('symlog'))
        return [sym(Math.log1p), sym(Math.expm1)];
    if (t.endsWith('log'))
        return [v => Math.log(sign*v), v => sign*Math.exp(v)];
    if (t.endsWith('sqrt'))
        return [sym(Math.sqrt), sym(v => v*v)];
    return [v => v, v => v];
};

// rounded ends of a domain, of log scales powers of 10, e.g. 1 and 1000 of
// 1.3 and 870, `count` is the number of steps of the others
const niceEnds = (type, lo, hi, count) => isLog(type)
    ? d3.scales.log().domain([lo, hi]).nice().domain()
    : d3.nice(lo, hi, count);

// a threshold scale whose classes include their upper end, e.g. `value > 74.5`
// of the second class, d3 includes the lower end (`closed: "left"`)
const rightClosed = s => {
    const f = x => x !== null && x !== undefined && x <= x ? s.range()[d3.bisectLeft(s.domain(), x)] : s.unknown();
    ['domain', 'range', 'unknown', 'invertExtent'].forEach(k => f[k] = (...a) => {
        const r = s[k](...a);
        return r === s ? f : r;
    });
    f.copy = () => rightClosed(s.copy());
    return f;
};

/**
 * A band or point scale `s` whose categories are in groups of the values of
 * the mapping `by` of their rows, in the order of their first category, with
 * a space of `padding` steps between the groups (1 by default), the
 * categories of a group are next to each other. `groupExtent(category)` is
 * the start of the first band and the end of the last band of its group.
 */
const grouped = (s, rows, name, { by, padding: gap = 1 }) => {
    const groupOf = new Map();
    rows.forEach(r => {
        const key = String(r[name]);
        if (!groupOf.has(key))
            groupOf.set(key, String(r[by] ?? ''));
    });
    const groups = [...new Set(s.domain().map(d => groupOf.get(String(d)) ?? ''))];
    const domain = groups.flatMap(g => s.domain().filter(d => (groupOf.get(String(d)) ?? '') === g));
    const [r0, r1] = s.range();
    const [lo, hi] = [Math.min(r0, r1), Math.max(r0, r1)];
    // the padding of a point scale is the outer one, its bands have no width
    const inner = s.paddingInner ? s.paddingInner() : 1;
    const outer = s.paddingOuter ? s.paddingOuter() : s.padding();
    const step = (hi - lo) / Math.max(1, domain.length - inner + 2*outer + (groups.length - 1)*gap);
    const bandwidth = s.bandwidth ? step*(1 - inner) : 0;
    const starts = new Map(domain.map((d, i) => {
        const g = groups.indexOf(groupOf.get(String(d)) ?? '');
        const start = lo + step*(outer + i + g*gap);
        return [String(d), r1 < r0 ? lo + hi - start - bandwidth : start];
    }));
    const extents = new Map(groups.map(g => {
        const ends = domain.filter(d => (groupOf.get(String(d)) ?? '') === g).flatMap(d => [starts.get(String(d)), starts.get(String(d)) + bandwidth]);
        return [g, d3.extent(ends)];
    }));
    const f = d => starts.get(String(d));
    Object.assign(f, {
        domain: () => [...domain],
        range: () => [r0, r1],
        bandwidth: () => bandwidth,
        step: () => step,
        round: () => false,
        paddingInner: () => inner,
        paddingOuter: () => outer,
        copy: () => f,
        groupExtent: d => extents.get(groupOf.get(String(d)) ?? '') ?? [f(d), f(d) + bandwidth],
        nearest: p => d3.least(domain, d => Math.abs(f(d) + bandwidth/2 - p)),
    });
    return f;
};

/**
 * The categories of the data in the `order` of a scale: in the order of the
 * rows (by default), `"ascending"` or `"descending"` (numbers by their value)
 * or by the value of a mapping of their first row, e.g. bars by their length,
 * `{ "by": "x", "descending": true }`, categories without a value last.
 */
const sortCategories = (values, rows, name, order) => {
    if (order === undefined)
        return values;
    if (order == 'ascending' || order == 'descending') {
        const c = comparison(values);
        return [...values].sort(order == 'descending' ? (a, b) => c(b, a) : c);
    }
    const by = order?.by;
    if (typeof by != 'string')
        return values;
    const first = new Map();
    rows.forEach(r => {
        if (!first.has(r[name]) && r[by] !== null && r[by] !== undefined)
            first.set(r[name], r[by]);
    });
    const keyed = values.filter(v => first.has(v));
    const c = comparison(keyed.map(v => first.get(v)));
    keyed.sort((a, b) => order.descending ? c(first.get(b), first.get(a)) : c(first.get(a), first.get(b)));
    return [...keyed, ...values.filter(v => !first.has(v))];
};

// the categories in the order of the categories of the mapping (`keys`,
// e.g. of `categories`), the others after them in their order, e.g. of the
// rows, as the legend, the stacks and the facets
const byKeys = (values, keys) => {
    if (!keys?.length)
        return values;
    const rank = new Map(keys.map((k, i) => [String(k), i]));
    const known = values.filter(v => rank.has(String(v))).sort((a, b) => rank.get(String(a)) - rank.get(String(b)));
    return known.length ? [...known, ...values.filter(v => !rank.has(String(v)))] : values;
};

// a log scale, not a symlog one, its values are all positive or all negative
const isLog = type => type.toLowerCase().endsWith('log') && !type.toLowerCase().endsWith('symlog');

// the values of a log scale: the positive ones, without them the negative
// ones, 0 and the others have no position, e.g. 0 of 0, 10 and 100
const logValues = values => {
    const positive = values.filter(v => v > 0);
    return positive.length ? positive : values.filter(v => v < 0);
};

// the values of a mapping in the rows, continuous ones sorted for the lookup
// of the nearest value (sorted when they are read, e.g. not for a scale
// which only needs the extent), and their extent, of stacked values
// (`stackOf`, see layout.js) the one of the stacks, e.g. from 0, the extent
// and the categories include the values of the mappings with this scale
// (`also`, `"scale": { "of": ... }`), e.g. of a band between two columns, of
// a log scale (`log`) only the ones with a position, see logValues, the
// extent is null without values. The values are read only, they are kept
// for the same rows, e.g. of the scales of a new width, see valuesOf
const computeValues = (name, numeric, rows, stackOf, also, log) => {
    const values = [...new Set(rows.map(d => d[name]))];
    const others = also.flatMap(n => rows.map(d => d[n])).filter(v => v !== null && v !== undefined);
    // a row without a value is in no category, e.g. one of another plot
    if (!numeric)
        return { values: [...new Set([...values, ...others])].filter(v => v !== null && v !== undefined) };
    const present = values.filter(v => v !== null && v !== undefined);
    let all = [...(stackOf ? rows.flatMap(stackOf) : present), ...others].filter(v => v !== null && v !== undefined);
    if (log)
        all = logValues(all);
    const extent = all.length ? d3.extent(all) : null;
    let sorted = null;
    return {
        get values() {
            if (sorted === null) {
                sorted = present.sort((a, b) => a - b);
                if (log)
                    sorted = sorted.filter(v => Math.sign(v) == Math.sign(all[0]));
            }
            return sorted;
        },
        extent,
    };
};

// the values of computeValues of the rows, kept per rows: the rows of a
// view are new ones after a change of the data or the state, see layout.js
const valueCache = new WeakMap();
const valuesOf = (name, mapping, rows, stackOf, also = [], log = false) => {
    const numeric = mapping.type == 'numeric' || mapping.type == 'date';
    const stacks = numeric && mapping.stacked && stackOf ? stackOf : null;
    const key = JSON.stringify([name, also, numeric, log]);
    let cached = valueCache.get(rows);
    if (!cached)
        valueCache.set(rows, cached = new Map());
    const hit = cached.get(key);
    if (hit?.stacks === stacks)
        return hit.result;
    const result = computeValues(name, numeric, rows, stacks, also, log);
    cached.set(key, { stacks, result });
    return result;
};

/**
 * The scale of a mapping for the values of the rows, a d3 scale, `nearest(p)`
 * is the value with data nearest to a position, e.g. of the hover. The range
 * is the one of the definition or of the orientation of the coordinate
 * system (`coord`), the references of the range are the names of `scope`
 * and the sizes `dims` of the coordinate system, e.g. its `radius`, values
 * of the definition are converted as the ones of the rows, also of the
 * `mappings` of the definition, e.g. dates of a scale of another mapping.
 * The values of the domain are the ones of `domainRows` if given, e.g. the
 * rows of `domainIgnores` (see layout.js), with their stacks `domainStackOf`.
 */
const makeScale = (name, mapping, rows, { dims = {}, coord = {}, scope = {}, stackOf, also = [], mappings, domainRows, domainStackOf } = {}) => {
    const scaleDef = mapping.scale;
    const ranges = coord.ranges ?? {};
    // the end of a cyclic range is its start, e.g. of the angles of a circle
    const cyclic = (coord.cyclic ?? []).includes(scaleDef.orientation);
    const log = isLog(scaleDef.type);
    // the domain is the one of `domainRows` (and their stacks), e.g. of all
    // months of `domainIgnores`, the nearest value with data is one of `rows`
    const all = domainRows ?? rows;
    const found = valuesOf(name, mapping, all, domainRows ? domainStackOf : stackOf, also, log);
    const near = () => (domainRows ? valuesOf(name, mapping, rows, stackOf, also, log) : found).values;
    let extent = found.extent;
    // the periods of the dates (`interval`): the domain of the data reaches
    // the end of the last one
    const period = mapping.type == 'date' ? intervalOf(mapping.interval, scaleDef.type == 'utc') : null;
    if (period && extent)
        extent = [extent[0], +period.offset(extent[1])];
    // the extent of the data includes the values of `include`, e.g. 0 or
    // 100, around `center` it is symmetric, e.g. of 0 of changes
    // a value of the definition as the ones of the data, e.g. a date or a category as a string
    const valueOf = v => v === null || v === undefined ? null : convert(mapping, v, mappings);
    if (continuous(mapping)) {
        let included = scaleDef.include === undefined ? []
            : [evaluate(scaleDef.include, scope)].flat().map(valueOf).filter(v => v !== null && v !== undefined);
        if (log)
            included = included.filter(v => extent ? Math.sign(v) == Math.sign(extent[0]) : v > 0);
        // without values, e.g. of empty rows, the extent of the included
        // values or 0 to 1 (1 to 10 of a log scale), not NaN to NaN
        if (!extent && new Set(included).size < 2)
            included.push(...(log ? [1, 10] : [0, 1]));
        extent = d3.extent([...(extent ?? []), ...included]);
    }
    if (continuous(mapping) && scaleDef.center !== undefined) {
        const c = valueOf(evaluate(scaleDef.center, scope));
        if (c !== null) {
            const d = Math.max(Math.abs(extent[0] - c), Math.abs(extent[1] - c));
            extent = [c - d, c + d];
        }
    }

    const scale = d3.named(d3.scales, scaleDef.type);
    if (!scale)
        throw new Error(`Unknown scale '${scaleDef.type}', e.g. 'linear', 'time' or 'band'`);
    const s = scale();

    // the colors of sequential and diverging scales, e.g. "Blues"
    if (scaleDef.interpolator) {
        const interpolator = d3.interpolator(scaleDef.interpolator);
        if (!interpolator)
            throw new Error(`Unknown interpolator '${scaleDef.interpolator}', e.g. 'Blues' or 'RdYlGn'`);
        s.interpolator(interpolator);
    }

    // scales without orientation and range keep the range of d3, e.g. [0, 1]
    const range = Array.isArray(scaleDef.range) ? scaleDef.range :
        (scaleDef.scheme ? schemeRange(scaleDef) : ranges[scaleDef.orientation]);
    if (range)
        s.range(evaluate(range, { ...scope, ...dims }));

    // the space at the start and the end of a range of numbers, of positions
    // in pixels, e.g. so the first and the last point are not at the edges
    if (scaleDef.inset !== undefined) {
        const [i0, i1 = i0] = [evaluate(scaleDef.inset, { ...scope, ...dims })].flat();
        const [r0, r1, ...others] = s.range();
        if (others.length == 0 && [r0, r1, i0, i1].every(Number.isFinite)) {
            const direction = Math.sign(r1 - r0) || 1;
            s.range([r0 + direction*i0, r1 - direction*i1]);
        }
    }

    // the values of a fixed domain are converted as the ones of the data, e.g.
    // dates of "2020-01-01" or numbers of a global "100", the values can be
    // references, e.g. to a global, categories are kept
    const fixed = () => (evaluate(scaleDef.domain, scope) ?? []).map(valueOf);
    let domain;
    if (scaleDef.type == 'threshold') {
        // the values between the classes
        domain = fixed();
    } else if (scaleDef.type == 'quantile' || scaleDef.type == 'sequentialQuantile') {
        // classes of the same number of values
        domain = found.values;
    } else if (extent && scaleDef.type != 'ordinal') {
        domain = fixed();
        // the first and the last entry, a diverging domain has a middle one
        const last = domain.length - 1;

        // without fixed values the domain of a position is extended a bit, not
        // if it is cyclic, e.g. not the domain of colors
        // `pad` extends both ends relative to the size (a number or
        // [start, end], positive values extend), `domainRel` adds to them
        const pad = scaleDef.pad === undefined ? null : [scaleDef.pad].flat().map(Number);
        const domainRel = pad ? [-pad[0], pad[1] ?? pad[0]] : scaleDef.domainRel ?? (scaleDef.domainAbs || cyclic || period || !scaleDef.orientation ? [0, 0] :
            [domain[0] === null ? -0.02 : 0, domain[last] === null ? 0.02 : 0]);
        const domainAbs = scaleDef.domainAbs ?? [0, 0];

        // the ends taken from the data, `nice` rounds them
        const fromData = [domain[0] === null, domain[last] === null];
        domain[0] ??= extent[0];
        domain[last] ??= extent[1];

        // relative to the positions, e.g. of a log or a sqrt scale 2% of the
        // height below and above, values of a log scale do not get below 0
        const [to, from] = transformOf(scaleDef.type, Math.sign(domain[0] || domain[last]) || 1);
        // only the ends which are extended, so fixed ones stay exact, e.g. 3 of a sqrt scale
        const [d0, d1] = [to(domain[0]), to(domain[last])];
        const da = d1 - d0;
        if (domainRel[0])
            domain[0] = from(d0 + da*domainRel[0]);
        if (domainRel[1])
            domain[last] = from(d1 + da*domainRel[1]);
        domain[0] += domainAbs[0];
        domain[last] += domainAbs[1];

        // round values for the ends taken from the data, e.g. 0.951 to 1, `true`
        // for steps of about a tenth of the domain or the number of steps
        if (scaleDef.nice && mapping.type == 'numeric') {
            const [lo, hi] = niceEnds(scaleDef.type, domain[0], domain[last], scaleDef.nice === true ? 10 : scaleDef.nice);
            if (fromData[0])
                domain[0] = lo;
            if (fromData[1])
                domain[last] = hi;
        }

        // the nearest value with data
        if (s.invert)
            s.nearest = p => {
                const values = near();
                return values[d3.bisectCenter(values, s.invert(p))];
            };
    } else {
        // the categories of the data or a fixed list of them, in its order,
        // as the values of the rows, e.g. the numbers of a JSON column
        const given = fixed();
        const values = found.values;
        const byText = new Map(values.map(v => [String(v), v]));
        domain = given.length > 0 && given.every(v => v !== null)
            ? [...new Set(given.map(v => byText.get(String(v)) ?? v))]
            : sortCategories(scaleDef.order === undefined ? byKeys(values, mapping.keys) : values, all, name, scaleDef.order);
        // the positions of the categories, e.g. of a band scale, not the
        // colors of an ordinal scale
        // a point scale has no inner padding (its bandwidth is 0)
        if (s.step && cyclic && !s.paddingInner) {
            // the points of a cyclic range have the same distance, also the last
            // and the first one, the `padding` is the place of the first one in
            // steps, e.g. 0 at the start of the range (the top of a circle),
            // half a step by default
            s.padding(0.5);
            const offset = (Number(scaleDef.padding ?? 0.5) - 0.5)*(s.range()[1] - s.range()[0])/Math.max(1, domain.length);
            if (offset)
                s.range([s.range()[0] + offset, s.range()[1] + offset]);
            s.nearest = p => d3.least(s.domain(), d => Math.abs(s(d) - p));
        } else if (s.step) {
            // the categories of a cyclic range have the same distance, also the
            // last and the first one
            const padding = scaleDef.padding ?? 0.4;
            s.padding(padding);
            if (cyclic && s.paddingOuter)
                s.paddingOuter(padding/2);
            // the category with the nearest position, e.g. the center of a band
            s.nearest = p => d3.least(s.domain(), d => Math.abs(s(d) + bandCenter(s) - p));
        }
    }

    s.domain(domain);
    // the periods of the dates, e.g. of bars in their period, see rowValue of layout.js
    if (period)
        s.period = period;
    if (scaleDef.type == 'threshold' && scaleDef.closed == 'right')
        return rightClosed(s);
    // the categories in groups with a space between them, e.g. the rows of
    // horizontal bars of groups of indicators, not of a cyclic range
    if (scaleDef.groups?.by && s.step && !cyclic)
        return grouped(s, all, name, scaleDef.groups);
    return s;
};
