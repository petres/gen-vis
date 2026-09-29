export { addScale, setProps, setGroupData, highlightElements };

import * as d3 from "d3";
import * as ju from "@/utils/json.js";
import * as eu from "@/utils/else.js";

const addScale = (info, dims) => {
    const scaleDef = info.mapping.scale;

    const s = d3[`scale${eu.capitalize(scaleDef.type)}`]()

    // fill width and height
    s.range(ju.fillDirect(scaleDef.range, dims))
    if (info.extent) {
        info.domain = [...scaleDef.domain];

        info.domainRel = [...(scaleDef.domainRel ? scaleDef.domainRel : [0, 0])];
        info.domainAbs = scaleDef.domainAbs;

        info.domain[0] ??= info.extent[0];
        info.domain[1] ??= info.extent[1];

        const da = info.domain[1] - info.domain[0];
        info.domain[0] += da*info.domainRel[0];
        info.domain[1] += da*info.domainRel[1];

        info.domain[0] += info.domainAbs[0];
        info.domain[1] += info.domainAbs[1];

        // the nearest value with data
        s.invertCustom = (v) => info.values[d3.bisectCenter(info.values, s.invert(v))];
    } else {
        info.domain = info.values;
        scaleDef.padding ??= 0.4
        s.padding(scaleDef.padding);
        s.invertCustom = (v) => {
          const index = Math.floor(v / s.step());
          return s.domain()[Math.max(0,Math.min(index, s.domain().length-1))];
        }
    }

    s.domain(info.domain)
    info.scale = s;
};

const setProps = function(d) {
    const e = d3.select(this);
    Object.entries(d).forEach(([k, v], i) => {
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


// the elements of a plot in the groups of dataEntry, the values are compared
// directly, they are not part of a selector, so they can contain any character
const groupElements = (inner, plotDef, dataEntry) => {
    const conditions = plotDef.categories
        .filter(c => c in dataEntry)
        .map(c => ({ attr: `data-group-${c}`, value: String(dataEntry[c]) }));
    if (conditions.length == 0)
        return null;
    return inner.selectAll(`g.plotGroup.${plotDef.id} [${conditions[0].attr}]`)
        .filter(function() { return conditions.every(c => this.getAttribute(c.attr) === c.value) });
}

// the highlight- props of the plots replace the props of the highlighted
// elements, their default values are kept in default- attributes
const highlightElements = (inner, plotDefs, dataEntry = null) => {
    plotDefs.filter(p => p.highlightProps.length > 0).forEach(plotDef => {
        inner.selectAll(`g.plotGroup.${plotDef.id} .highlight`)
            .classed('highlight', false)
            .each(function() {
                const e = d3.select(this);
                plotDef.highlightProps.forEach(n => e.attr(n, e.attr(`default-${n}`)));
            });

        const elements = dataEntry && groupElements(inner, plotDef, dataEntry);
        if (!elements)
            return;
        elements.classed('highlight', true)
            .raise()
            .each(function() {
                const e = d3.select(this);
                plotDef.highlightProps.forEach(n => {
                    e.attr(`default-${n}`, e.attr(n))
                     .attr(n, e.attr(`highlight-${n}`))
                });
            });
    })
}
