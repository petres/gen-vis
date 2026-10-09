export { groupwise, pointwise, finite, curve, propScale };

import * as d3 from "@/utils/d3";
import { refOf } from "@/utils/props";
import { curves, rowOf, setGroupData, setProps } from "@/utils/draw";

const finite = (...values) => values.every(v => Number.isFinite(v));

const curve = plot => curves[plot.curve ?? 'linear'] ?? d3.curveLinear;

// the scale of the mapping a prop of a plot refers to, e.g. the one of `x`
// of "@x:scaled" or of `d.angle`, undefined if it is no reference
const propScale = (plot, ctx, path) => {
    const ref = refOf(path.split('.').reduce((p, k) => p?.[k], plot.props));
    return ref === undefined ? undefined : ctx.scales[ref.split(':')[0]];
};

// a path per group, e.g. a line, with the props of the group
const groupwise = (groups, parent) => parent
    .classed("paths", true)
    .selectAll("path")
    .data(groups)
    .enter()
    .append("path")
    .each(function(g) { setProps.call(this, g.attrs) })
    .each(setGroupData);

// an element of `type` per row, without the rows of missing values,
// `translate(values, row, group)` changes the values of the props of a row
const pointwise = (groups, parent, type, translate = v => v) => parent
    .classed(type, true)
    .selectAll(`g.group`)
    .data(groups)
    .enter()
    .append("g")
    .attr("class", `group`)
    .each(setGroupData)
    .selectAll(type)
    .data(g => g.rows.filter(g.complete).map(row => {
        // the row of the element, e.g. for the highlight of a row
        const v = translate(g.at(row), row, g);
        v[rowOf] = row;
        return v;
    }))
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
