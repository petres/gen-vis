export { barScale, barWidth };

import * as d3 from "@/utils/d3";
import { bandCenter } from "@/utils/scales";
import { groupwise, pointwise, finite, curve, propScale } from "@/plots/elements";

// the scale of a prop of a bar, e.g. of "@x:scaled"
const barScale = (plot, ctx, prop, type) => {
    const scale = propScale(plot, ctx, prop);
    if (!scale)
        throw new Error(`${type}: the positions need a scaled value, e.g. "@x:scaled"`);
    return scale;
};

// the default width of the bars of a categorical scale
const barWidth = (scale, type) => {
    if (!scale.step)
        throw new Error(`${type}: a 'width' is needed for a continuous scale`);
    return scale.bandwidth() || scale.step()*(1 - scale.padding());
};

// the points of the path of a group, the values of `d` of its rows
const points = g => {
    const d = g.prop('d');
    return g.rows.map(row => d(row) ?? {});
};

// the plot types of the cartesian coordinate system, missing values are gaps
// in lines and areas
export default {
    // a line per group, `d` with `x` and `y`
    'cartesian:line': {
        curve: true,
        coords: ['cartesian'],
        render: (groups, parent, plot) => groupwise(groups, parent)
            .attr("d", g => d3.line()
                .curve(curve(plot))
                .defined(e => finite(e.x, e.y))
                .x(e => e.x)
                .y(e => e.y)
                (points(g))
            ),
    },

    // an area per group, `d` with `x`, `y0` and `y1`
    'cartesian:area': {
        curve: true,
        coords: ['cartesian'],
        render: (groups, parent, plot) => groupwise(groups, parent)
            .attr("d", g => d3.area()
                .curve(curve(plot))
                .defined(e => finite(e.x, e.y0, e.y1))
                .x(e => e.x)
                .y1(e => e.y1)
                .y0(e => e.y0)
                (points(g))
            ),
    },

    // a bar per row from `y0` (by default the position of 0 of the scale of `y1`)
    // to `y1`, e.g. "@y:start:scaled" and "@y:end:scaled" of stacked values,
    // centered at `x`, in the middle of a band, `width` defaults to the width
    // of a band or the step of a point scale
    'cartesian:bar': {
        coords: ['cartesian'],
        render: (groups, parent, plot, ctx) => pointwise(groups, parent, "rect", v => {
            const type = 'cartesian:bar';
            const xScale = barScale(plot, ctx, 'x', type);
            const width = v.width ?? barWidth(xScale, type);
            const y0 = 'y0' in v ? v.y0 : barScale(plot, ctx, 'y1', type)(0);
            const { y0: _, y1: __, ...props } = v;
            return {
                ...props,
                x: v.x + bandCenter(xScale) - width/2,
                width,
                y: Math.min(y0, v.y1),
                height: Math.abs(v.y1 - y0),
            };
        }),
    },
};
