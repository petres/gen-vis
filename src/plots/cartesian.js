export { barScale, barWidth };

import * as d3 from "d3";
import { entryToProp, valuesOf } from "@/utils/props";
import { bandCenter } from "@/utils/scales";
import { groupwise, pointwise, finite, curve } from "@/plots/elements";

// the scale of a prop of a bar, e.g. of "@x:scaled"
const barScale = (info, prop, type) => {
    const scale = info[prop?.parts?.[0]]?.scale;
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

// the plot types of the cartesian coordinate system, missing values are gaps
// in lines and areas
export default {
    // a line per group, `d` with `x` and `y`
    'cartesian:line': {
        curve: true,
        coords: ['cartesian'],
        render: (groups, parent, plotDef) => groupwise(groups, parent)
            .attr("d", d => d3.line()
                .curve(curve(plotDef))
                .defined(e => finite(e.x, e.y))
                .x(e => e.x)
                .y(e => e.y)
                (d.values.map(valuesOf(d.props.d)))
            ),
    },

    // an area per group, `d` with `x`, `y0` and `y1`
    'cartesian:area': {
        curve: true,
        coords: ['cartesian'],
        render: (groups, parent, plotDef) => groupwise(groups, parent)
            .attr("d", d => d3.area()
                .curve(curve(plotDef))
                .defined(e => finite(e.x, e.y0, e.y1))
                .x(e => e.x)
                .y1(e => e.y1)
                .y0(e => e.y0)
                (d.values.map(valuesOf(d.props.d)))
            ),
    },

    // a bar per row from `y0` (by default the position of 0 of the scale of `y1`)
    // to `y1`, e.g. "@y:start:scaled" and "@y:end:scaled" of stacked values,
    // centered at `x`, in the middle of a band, `width` defaults to the width
    // of a band or the step of a point scale
    'cartesian:bar': {
        coords: ['cartesian'],
        render: (groups, parent, plotDef, { info }) => pointwise(groups, parent, "rect", v => {
            const type = 'cartesian:bar';
            const xScale = barScale(info, v.x, type);
            const width = v.width?.value ?? barWidth(xScale, type);
            const y1 = v.y1?.value;
            const y0 = v.y0 ? v.y0.value : barScale(info, v.y1, type)(0);
            const { y0: _, y1: __, ...props } = v;
            return {
                ...props,
                x: entryToProp(v.x.value + bandCenter(xScale) - width/2),
                width: entryToProp(width),
                y: entryToProp(Math.min(y0, y1)),
                height: entryToProp(Math.abs(y1 - y0)),
            };
        }),
    },
};
