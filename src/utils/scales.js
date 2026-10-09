export { makeScale, bandCenter };

import * as d3 from "@/utils/d3";
import { evaluate } from "@/utils/props";
import { toDate } from "@/utils/data";

// the offset of the center of a band, the position of band scales is its start
const bandCenter = s => s.bandwidth ? s.bandwidth()/2 : 0;

// the colors of a scheme of d3, e.g. "Blues", schemes of several sizes have
// `classes` colors, by default the number of classes of a threshold scale or 5
const schemeRange = scaleDef => {
    const scheme = d3.named(d3.schemes, scaleDef.scheme);
    if (!scheme)
        throw new Error(`Unknown scheme '${scaleDef.scheme}', e.g. 'Blues' or 'Tableau10'`);
    if (typeof scheme.at(-1) == 'string')
        return scheme;
    const n = scaleDef.classes ?? (scaleDef.type == 'threshold' ? scaleDef.domain.length + 1 : 5);
    return scheme[Math.min(Math.max(n, 3), scheme.length - 1)].slice(0, n);
};

// the values of a mapping in the rows, continuous ones sorted for the lookup
// of the nearest value, and their extent, of stacked values (`stackOf`, see
// layout.js) the one of the stacks, e.g. from 0
const valuesOf = (name, mapping, rows, stackOf) => {
    const values = [...new Set(rows.map(d => d[name]))];
    if (mapping.type != 'numeric' && mapping.type != 'date')
        return { values };
    const sorted = values.filter(v => v !== null).sort((a, b) => a - b);
    const extent = mapping.stacked && stackOf ? d3.extent(rows.flatMap(stackOf)) : d3.extent(sorted);
    return { values: sorted, extent };
};

/**
 * The scale of a mapping for the values of the rows, a d3 scale, `nearest(p)`
 * is the value with data nearest to a position, e.g. of the hover. The range
 * is the one of the definition or of the orientation of the coordinate
 * system (`coord`), the references of the range are the names of `scope`
 * and the sizes `dims` of the coordinate system, e.g. its `radius`.
 */
const makeScale = (name, mapping, rows, { dims = {}, coord = {}, scope = {}, stackOf } = {}) => {
    const scaleDef = mapping.scale;
    const ranges = coord.ranges ?? {};
    // the end of a cyclic range is its start, e.g. of the angles of a circle
    const cyclic = (coord.cyclic ?? []).includes(scaleDef.orientation);
    const { values, extent } = valuesOf(name, mapping, rows, stackOf);

    const scale = d3.named(d3.scales, scaleDef.type);
    if (!scale)
        throw new Error(`Unknown scale '${scaleDef.type}', e.g. 'linear', 'time' or 'band'`);
    const s = scale();

    // the colors of sequential and diverging scales, e.g. "Blues"
    if (scaleDef.interpolator) {
        const interpolator = d3.named(d3.interpolators, scaleDef.interpolator);
        if (!interpolator)
            throw new Error(`Unknown interpolator '${scaleDef.interpolator}', e.g. 'Blues' or 'RdYlGn'`);
        s.interpolator(interpolator);
    }

    // scales without orientation and range keep the range of d3, e.g. [0, 1]
    const range = Array.isArray(scaleDef.range) ? scaleDef.range :
        (scaleDef.scheme ? schemeRange(scaleDef) : ranges[scaleDef.orientation]);
    if (range)
        s.range(evaluate(range, { ...scope, ...dims }));

    // dates of a fixed domain are parsed as the ones of the data, e.g. "2020-01-01"
    const fixed = () => scaleDef.domain.map(v => v !== null && mapping.type == 'date' ? toDate(v) : v);
    let domain;
    if (scaleDef.type == 'threshold') {
        // the values between the classes
        domain = fixed();
    } else if (scaleDef.type == 'quantile') {
        // classes of the same number of values
        domain = values;
    } else if (extent) {
        domain = fixed();
        // the first and the last entry, a diverging domain has a middle one
        const last = domain.length - 1;

        // without fixed values the domain of a position is extended a bit, not
        // if it is cyclic, e.g. not the domain of colors
        const domainRel = scaleDef.domainRel ?? (scaleDef.domainAbs || cyclic || !scaleDef.orientation ? [0, 0] :
            [domain[0] === null ? -0.02 : 0, domain[last] === null ? 0.02 : 0]);
        const domainAbs = scaleDef.domainAbs ?? [0, 0];

        // the ends taken from the data, `nice` rounds them
        const fromData = [domain[0] === null, domain[last] === null];
        domain[0] ??= extent[0];
        domain[last] ??= extent[1];

        // of a log scale relative to its positions, e.g. 5% of the height
        // below and above, linear values could get below 0
        const [to, from] = scaleDef.type == 'log' ? [Math.log, Math.exp] : [v => v, v => v];
        const [d0, d1] = [to(domain[0]), to(domain[last])];
        const da = d1 - d0;
        domain[0] = from(d0 + da*domainRel[0]) + domainAbs[0];
        domain[last] = from(d1 + da*domainRel[1]) + domainAbs[1];

        // round values for the ends taken from the data, e.g. 0.951 to 1, `true`
        // for steps of about a tenth of the domain or the number of steps
        if (scaleDef.nice && mapping.type == 'numeric') {
            const [lo, hi] = d3.nice(domain[0], domain[last], scaleDef.nice === true ? 10 : scaleDef.nice);
            if (fromData[0])
                domain[0] = lo;
            if (fromData[1])
                domain[last] = hi;
        }

        // the nearest value with data
        s.nearest = p => values[d3.bisectCenter(values, s.invert(p))];
    } else {
        domain = values;
        // the categories of a cyclic range have the same distance, also the
        // last and the first one
        const padding = scaleDef.padding ?? (cyclic && !s.bandwidth ? 0.5 : 0.4);
        s.padding(padding);
        if (cyclic && s.paddingOuter)
            s.paddingOuter(padding/2);
        // the category with the nearest position, e.g. the center of a band
        s.nearest = p => d3.least(s.domain(), d => Math.abs(s(d) + bandCenter(s) - p));
    }

    s.domain(domain);
    return s;
};
