export { groupwise, pointwise, finite, curve, propScale, dodge };

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
    .selectAll("path")
    .data(groups)
    .enter()
    .append("path")
    .each(function(g) { setProps.call(this, g.attrs) })
    .each(setGroupData);

// an element of `type` per row, without the rows of missing values,
// `translate(values, row, group)` changes the values of the props of a row
const pointwise = (groups, parent, type, translate = v => v) => parent
    .selectAll("g.vis-group")
    .data(groups)
    .enter()
    .append("g")
    .attr("class", "vis-group")
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

/**
 * The positions `ys` moved apart to at least the distance `gap`, e.g. of
 * labels at the ends of lines, positions which are too close are a group,
 * they are spread around the mean of their positions.
 */
const dodge = (ys, gap) => {
    const order = ys.map((y, i) => i).filter(i => Number.isFinite(ys[i])).sort((a, b) => ys[a] - ys[b]);
    const top = c => c.mean - (c.items.length - 1)*gap/2;
    const groups = order.map(i => ({ items: [i], mean: ys[i] }));
    for (let k = 1; k < groups.length; k++) {
        const [a, b] = [groups[k - 1], groups[k]];
        if (top(b) < top(a) + a.items.length*gap) {
            const items = [...a.items, ...b.items];
            groups.splice(k - 1, 2, { items, mean: d3.mean(items, i => ys[i]) });
            // the merged group can be too close to the one before
            k = Math.max(0, k - 2);
        }
    }
    const moved = [...ys];
    groups.forEach(g => g.items.forEach((i, j) => moved[i] = top(g) + j*gap));
    return moved;
};

const element = type => ({ render: (groups, parent) => pointwise(groups, parent, type) });

// the svg elements, an element per row in any coordinate system, the props are
// its attributes, e.g. "@x:scaled" of cx
export default {
    'svg:circle': element("circle"),
    'svg:line': element("line"),
    'svg:rect': element("rect"),
    // `dodge` of the plot moves the texts apart vertically, to at least this
    // distance, e.g. labels at the ends of lines
    'svg:text': {
        render(groups, parent, plot) {
            const texts = pointwise(groups, parent, "text").nodes();
            if (plot.dodge) {
                const moved = dodge(texts.map(t => parseFloat(t.getAttribute('y'))), plot.dodge);
                texts.forEach((t, i) => t.setAttribute('y', moved[i]));
            }
        },
    },
};
