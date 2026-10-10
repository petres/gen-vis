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
        update: true,
        render: (groups, parent, plot) => groupwise(groups, parent, g => d3.line()
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
        update: true,
        render: (groups, parent, plot) => groupwise(groups, parent, g => d3.area()
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
    // of a band or the step of a point scale. With `x1` a horizontal bar from
    // `x0` to `x1` centered at `y`, `height` is its thickness.
    'cartesian:bar': {
        coords: ['cartesian'],
        update: true,
        render(groups, parent, plot, ctx) {
            const type = 'cartesian:bar';
            if ('x1' in plot.props)
                return pointwise(groups, parent, "rect", v => {
                    const yScale = barScale(plot, ctx, 'y', type);
                    const height = v.height ?? barWidth(yScale, type);
                    const x0 = 'x0' in v ? v.x0 : barScale(plot, ctx, 'x1', type)(0);
                    const { x0: _, x1: __, ...props } = v;
                    return {
                        ...props,
                        x: Math.min(x0, v.x1),
                        width: Math.abs(v.x1 - x0),
                        y: v.y + bandCenter(yScale) - height/2,
                        height,
                    };
                });
            return pointwise(groups, parent, "rect", v => {
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
            });
        },
    },
};
