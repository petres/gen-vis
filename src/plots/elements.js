export { groupwise, pointwise, finite, curve };

import * as d3 from "d3";
import * as pu from "@/utils/plot";
import * as ju from "@/utils/json";

const finite = (...values) => values.every(v => Number.isFinite(v));

const curve = plotDef => pu.curves[plotDef.curve ?? 'linear'] ?? d3.curveLinear;

// a path per group, e.g. a line
const groupwise = (groups, parent) => parent
    .classed("paths", true)
    .selectAll("path")
    .data(groups)
    .enter()
    .append("path")
    .each(function(d) { pu.setProps.call(this, d.props) })
    .each(pu.setGroupData);

// an element of `type` per row, `translate` changes the filled props of a row,
// it also gets the row
const pointwise = (groups, parent, type, translate = v => v) => parent
    .classed(type, true)
    .selectAll(`g.group`)
    .data(groups)
    .enter()
    .append("g")
    .attr("class", `group`)
    .each(pu.setGroupData)
    .selectAll(type)
    .data(d => {
        // entries with missing values are not drawn
        const names = ju.refNames(d.props);
        return d.values
            .filter(e => names.every(n => e[n] !== null))
            .map(e => translate(ju.fillProps(d.props, e), e));
    })
    .enter()
    .append(type)
    .each(pu.setProps);

const element = type => ({ render: (groups, parent) => pointwise(groups, parent, type) });

// the svg elements, missing values are gaps in paths and areas
export default {
    'svg:path': {
        curve: true,
        render: (groups, parent, plotDef) => groupwise(groups, parent)
            .attr("d", d => d3.line()
                .curve(curve(plotDef))
                .defined(e => finite(e.x, e.y))
                .x(e => e.x)
                .y(e => e.y)
                (d.values.map(e => ju.fillProps(d.props.d, e, true)))
            ),
    },
    'svg:circle': element("circle"),
    'svg:line': element("line"),
    'svg:rect': element("rect"),
    'svg:text': element("text"),
    'base:area': {
        curve: true,
        render: (groups, parent, plotDef) => groupwise(groups, parent)
            .attr("d", d => d3.area()
                .curve(curve(plotDef))
                .defined(e => finite(e.x, e.y0, e.y1))
                .x(e => e.x)
                .y1(e => e.y1)
                .y0(e => e.y0)
                (d.values.map(e => ju.fillProps(d.props.d, e, true)))
            ),
    },
};
