export { addScale, bandCenter };

import * as d3 from "@/utils/d3";
import { fillDirect } from "@/utils/props";
import { toDate } from "@/utils/data";

// the offset of the center of a band, the position of band scales is its start
const bandCenter = s => s.bandwidth ? s.bandwidth()/2 : 0;

// `coord` has the default ranges of the orientations, in the sizes of `dims`,
// and the cyclic orientations, e.g. the angle, see coords/index.js
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

const addScale = (info, dims, coord = {}, bases = {}) => {
    const scaleDef = info.mapping.scale;
    const ranges = coord.ranges ?? {};
    // the end of a cyclic range is its start, e.g. of the angles of a circle
    const cyclic = (coord.cyclic ?? []).includes(scaleDef.orientation);

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

    // fill width and height (of `dims`, e.g. the inner area) and the other
    // bases, scales without orientation and range keep the range of d3, e.g. [0, 1]
    const range = Array.isArray(scaleDef.range) ? scaleDef.range :
        (scaleDef.scheme ? schemeRange(scaleDef) : ranges[scaleDef.orientation]);
    if (range)
        s.range(fillDirect(range, { ...bases, ...dims }))

    // dates of a fixed domain are parsed as the ones of the data, e.g. "2020-01-01"
    const fixed = () => scaleDef.domain.map(v => v !== null && info.mapping.type == 'date' ? toDate(v) : v);
    if (scaleDef.type == 'threshold') {
        // the values between the classes
        info.domain = fixed();
    } else if (scaleDef.type == 'quantile') {
        // classes of the same number of values
        info.domain = info.values;
    } else if (info.extent) {
        info.domain = fixed();
        // the first and the last entry, a diverging domain has a middle one
        const last = info.domain.length - 1;

        // without fixed values the domain of a position is extended a bit, not
        // if it is cyclic, e.g. not the domain of colors
        info.domainRel = [...(scaleDef.domainRel ?? (scaleDef.domainAbs || cyclic || !scaleDef.orientation ? [0, 0] :
            [info.domain[0] === null ? -0.02 : 0, info.domain[last] === null ? 0.02 : 0]))];
        info.domainAbs = scaleDef.domainAbs ?? [0, 0];

        // the ends taken from the data, `nice` rounds them
        const fromData = [info.domain[0] === null, info.domain[last] === null];
        info.domain[0] ??= info.extent[0];
        info.domain[last] ??= info.extent[1];

        // of a log scale relative to its positions, e.g. 5% of the height
        // below and above, linear values could get below 0
        const [to, from] = scaleDef.type == 'log' ? [Math.log, Math.exp] : [v => v, v => v];
        const [d0, d1] = [to(info.domain[0]), to(info.domain[last])];
        const da = d1 - d0;
        info.domain[0] = from(d0 + da*info.domainRel[0]);
        info.domain[last] = from(d1 + da*info.domainRel[1]);

        info.domain[0] += info.domainAbs[0];
        info.domain[last] += info.domainAbs[1];

        // round values for the ends taken from the data, e.g. 0.951 to 1, `true`
        // for steps of about a tenth of the domain or the number of steps
        if (scaleDef.nice && info.mapping.type == 'numeric') {
            const [lo, hi] = d3.nice(info.domain[0], info.domain[last], scaleDef.nice === true ? 10 : scaleDef.nice);
            if (fromData[0])
                info.domain[0] = lo;
            if (fromData[1])
                info.domain[last] = hi;
        }

        // the nearest value with data
        s.invertCustom = (v) => info.values[d3.bisectCenter(info.values, s.invert(v))];
    } else {
        info.domain = info.values;
        // the categories of a cyclic range have the same distance, also the
        // last and the first one
        scaleDef.padding ??= cyclic && !s.bandwidth ? 0.5 : 0.4;
        s.padding(scaleDef.padding);
        if (cyclic && s.paddingOuter)
            s.paddingOuter(scaleDef.padding/2);
        // the category with the nearest position, e.g. the center of a band
        s.invertCustom = (v) => d3.least(s.domain(), d => Math.abs(s(d) + bandCenter(s) - v));
    }

    s.domain(info.domain)
    info.scale = s;
};
