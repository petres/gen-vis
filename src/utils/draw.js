export { curves, setProps, setGroupData, highlightElements, rowOf };

import * as d3 from "d3";
import { isProp } from "@/utils/props";

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

const setProps = function(d) {
    const e = d3.select(this);
    Object.entries(d).forEach(([k, v]) => {
        if (v instanceof Object) {
            if (!isProp(v))
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
