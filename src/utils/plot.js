export { addScale, bandCenter, setProps, setGroupData, highlightElements, curves, rowOf };

import * as d3 from "d3";
import * as ju from "@/utils/json.js";
import * as eu from "@/utils/else.js";
import { toDate } from "@/utils/data.js";

// the interpolations of the paths and areas between their points, `monotoneX`
// is smooth without overshooting the values, e.g. for monthly data
const curves = {
    linear: d3.curveLinear,
    monotoneX: d3.curveMonotoneX,
    natural: d3.curveNatural,
    catmullRom: d3.curveCatmullRom,
    basis: d3.curveBasis,
    step: d3.curveStep,
    stepBefore: d3.curveStepBefore,
    stepAfter: d3.curveStepAfter,
    // closed, e.g. around the circle of polar plots
    linearClosed: d3.curveLinearClosed,
    catmullRomClosed: d3.curveCatmullRomClosed,
    basisClosed: d3.curveBasisClosed,
};

// the offset of the center of a band, the position of band scales is its start
const bandCenter = s => s.bandwidth ? s.bandwidth()/2 : 0;

// `coord` has the default ranges of the orientations, in the sizes of `dims`,
// and the cyclic orientations, e.g. the angle, see coords/index.js
// the colors of a scheme of d3, e.g. "Blues", schemes of several sizes have
// `classes` colors, by default the number of classes of a threshold scale or 5
const schemeRange = scaleDef => {
    const scheme = d3[`scheme${eu.capitalize(scaleDef.scheme)}`];
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

    const s = d3[`scale${eu.capitalize(scaleDef.type)}`]()

    // the colors of sequential and diverging scales, e.g. "Blues"
    if (scaleDef.interpolator)
        s.interpolator(d3[`interpolate${eu.capitalize(scaleDef.interpolator)}`]);

    // fill width and height (of `dims`, e.g. the inner area) and the other
    // bases, scales without orientation and range keep the range of d3, e.g. [0, 1]
    const range = Array.isArray(scaleDef.range) ? scaleDef.range :
        (scaleDef.scheme ? schemeRange(scaleDef) : ranges[scaleDef.orientation]);
    if (range)
        s.range(ju.fillDirect(range, { ...bases, ...dims }))

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

        const da = info.domain[last] - info.domain[0];
        info.domain[0] += da*info.domainRel[0];
        info.domain[last] += da*info.domainRel[1];

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

const setProps = function(d) {
    const e = d3.select(this);
    Object.entries(d).forEach(([k, v]) => {
        if (v instanceof Object) {
            if (!ju.isProp(v))
                return;
            v = v.value;
        }
        if (k == "text") {
            e.text(v);
            return;
        }
        e.attr(k, v);
    });
}

const setGroupData = function(d) {
    const element = d3.select(this);
    d.group.forEach(e => {
        element.attr(`data-group-${e.dim}`, e.key)
    });

    d.group.forEach(e => {
        element.attr(`data-visible-${e.dim}`, e.visible)
    });

    element.attr(`data-visible`, d.group.reduce((s, e) => s && e.visible, true))
}


// the groups of a plot, the ids are compared directly, they are not part of
// a selector, so they can contain any character, e.g. spaces
const plotGroups = (inner, plotDef) => inner.selectAll('g.plotGroup')
    .filter(function() { return this.getAttribute('data-plot') === plotDef.id });

// the elements of a plot in the groups of dataEntry, the values are compared
// directly as well
const groupElements = (inner, plotDef, dataEntry) => {
    const conditions = plotDef.categories
        .filter(c => c in dataEntry)
        .map(c => ({ attr: `data-group-${c}`, value: String(dataEntry[c]) }));
    if (conditions.length == 0)
        return null;
    return plotGroups(inner, plotDef).selectAll(`[${conditions[0].attr}]`)
        .filter(function() { return conditions.every(c => this.getAttribute(c.attr) === c.value) });
}

// the row of an element per row, a symbol, so it is not an attribute
const rowOf = Symbol('row');

// the elements with highlight- props of a group, the path of a group or its
// elements per row, e.g. circles, with `"highlight": "row"` only the element of
// the row of the hover, e.g. the segment of a stacked bar, the entry of a
// legend highlights all
const targets = (plotDef, group, dataEntry) => {
    const nodes = [group, ...group.querySelectorAll('*')]
        .filter(node => plotDef.highlightProps.some(n => node.hasAttribute(`highlight-${n}`)));
    if (plotDef.highlight != 'row')
        return nodes;
    const rows = nodes.filter(node => node.__data__?.[rowOf] === dataEntry);
    return rows.length > 0 ? rows : nodes;
};

// the highlight- props of the plots replace the props of the highlighted
// elements, their default values are kept in default- attributes
const highlightElements = (inner, plotDefs, dataEntry = null) => {
    plotDefs.filter(p => p.highlightProps.length > 0).forEach(plotDef => {
        plotGroups(inner, plotDef).selectAll('.highlight')
            .classed('highlight', false)
            .each(function() {
                const e = d3.select(this);
                plotDef.highlightProps.forEach(n => e.attr(n, e.attr(`default-${n}`)));
            });

        const elements = dataEntry && groupElements(inner, plotDef, dataEntry);
        if (!elements)
            return;
        // the elements with the props, the path of a group or the elements of
        // a group of elements per row, e.g. circles
        elements.classed('highlight', true)
            .raise()
            .each(function() {
                targets(plotDef, this, dataEntry)
                    .forEach(node => {
                        const e = d3.select(node).classed('highlight', true);
                        plotDef.highlightProps.forEach(n => {
                            e.attr(`default-${n}`, e.attr(n))
                             .attr(n, e.attr(`highlight-${n}`))
                        });
                    });
            });
    })
}
