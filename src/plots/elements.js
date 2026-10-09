export { groupwise, pointwise, finite, curve };

import * as d3 from "@/utils/d3";
import { propsOf, refNames } from "@/utils/props";
import { curves, rowOf, setGroupData, setProps } from "@/utils/draw";

const finite = (...values) => values.every(v => Number.isFinite(v));

const curve = plotDef => curves[plotDef.curve ?? 'linear'] ?? d3.curveLinear;

// a path per group, e.g. a line
const groupwise = (groups, parent) => parent
    .classed("paths", true)
    .selectAll("path")
    .data(groups)
    .enter()
    .append("path")
    .each(function(d) { setProps.call(this, d.props) })
    .each(setGroupData);

// an element of `type` per row, `translate` changes the filled props of a row,
// it also gets the row
const pointwise = (groups, parent, type, translate = v => v) => parent
    .classed(type, true)
    .selectAll(`g.group`)
    .data(groups)
    .enter()
    .append("g")
    .attr("class", `group`)
    .each(setGroupData)
    .selectAll(type)
    .data(d => {
        // entries with missing values are not drawn
        const names = refNames(d.props);
        const fill = propsOf(d.props);
        return d.values
            .filter(e => names.every(n => e[n] !== null))
            .map(e => {
                // the row of the element, e.g. for the highlight of a row
                const v = translate(fill(e), e);
                v[rowOf] = e;
                return v;
            });
    })
    .enter()
    .append(type)
    .each(setProps);

const element = type => ({ render: (groups, parent) => pointwise(groups, parent, type) });

// the svg elements, an element per row in any coordinate system, the props are
// its attributes, e.g. "@x:scaled" of cx
export default {
    'svg:circle': element("circle"),
    'svg:line': element("line"),
    'svg:rect': element("rect"),
    'svg:text': element("text"),
};
