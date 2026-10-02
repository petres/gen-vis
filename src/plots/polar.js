import * as d3 from "d3";
import * as pu from "@/utils/plot";
import * as ju from "@/utils/json";
import { groupwise, pointwise, finite, curve } from "@/plots/elements";
import { barScale, barWidth } from "@/plots/cartesian";
import { radiusRange } from "@/coords/polar";

// the angles of a band scale are in the center of the band, as the ones of the axis
const angleOffset = (info, prop) => {
    const scale = info[prop?.parts?.[0]]?.scale;
    return scale ? pu.bandCenter(scale) : 0;
};

const fill = d => d.values.map(ju.valuesOf(d.props.d));

// an element of `type` per row at the `angle` and `radius` of the props, as `x` and `y`
const positioned = (name, type, x, y) => ({
    coords: ['polar'],
    render: (groups, parent, plotDef, { info }) => pointwise(groups, parent, type, v => {
        if (!v.angle || !v.radius)
            throw new Error(`${name}: the props 'angle' and 'radius' are needed`);
        const [px, py] = d3.pointRadial(v.angle.value + angleOffset(info, v.angle), v.radius.value);
        const { angle, radius, ...props } = v;
        return { ...props, [x]: ju.entryToProp(px), [y]: ju.entryToProp(py) };
    }),
});

const arcProps = ['angle', 'width', 'innerRadius', 'outerRadius', 'padAngle', 'cornerRadius'];

// the plot types of the polar coordinate system, the angles are in radians,
// clockwise from the top, missing values are gaps in paths and areas
export default {
    // a line per group, `d` with `angle` and `radius`
    'polar:line': {
        curve: true,
        coords: ['polar'],
        render(groups, parent, plotDef, { info }) {
            const offset = angleOffset(info, plotDef.props.d?.angle);
            groupwise(groups, parent)
                .attr("d", d => d3.lineRadial()
                    .curve(curve(plotDef))
                    .defined(e => finite(e.angle, e.radius))
                    .angle(e => e.angle + offset)
                    .radius(e => e.radius)
                    (fill(d))
                );
        },
    },

    // an area per group, `d` with `angle`, `innerRadius` and `outerRadius`
    'polar:area': {
        curve: true,
        coords: ['polar'],
        render(groups, parent, plotDef, { info }) {
            const offset = angleOffset(info, plotDef.props.d?.angle);
            groupwise(groups, parent)
                .attr("d", d => d3.areaRadial()
                    .curve(curve(plotDef))
                    .defined(e => finite(e.angle, e.innerRadius, e.outerRadius))
                    .angle(e => e.angle + offset)
                    .innerRadius(e => e.innerRadius)
                    .outerRadius(e => e.outerRadius)
                    (fill(d))
                );
        },
    },

    // a segment of a ring per row, e.g. the bars of a rose or a stacked one,
    // centered at the `angle`, `width` defaults to the width of a band or the
    // step of a point scale, `innerRadius` to the inner radius of the plot
    'polar:arc': {
        coords: ['polar'],
        render: (groups, parent, plotDef, ctx) => pointwise(groups, parent, "path", v => {
            const s = barScale(ctx.info, v.angle, 'polar:arc');
            const width = v.width?.value ?? barWidth(s, 'polar:arc');
            const a = v.angle.value + pu.bandCenter(s);
            const d = d3.arc()
                .padAngle(v.padAngle?.value ?? 0)
                .cornerRadius(v.cornerRadius?.value ?? 0)({
                    startAngle: a - width/2,
                    endAngle: a + width/2,
                    innerRadius: v.innerRadius?.value ?? radiusRange(ctx)[0],
                    outerRadius: v.outerRadius?.value ?? radiusRange(ctx)[1],
                });
            const props = Object.fromEntries(Object.entries(v).filter(([k]) => !arcProps.includes(k)));
            return { ...props, d: ju.entryToProp(d) };
        }),
    },

    'polar:circle': positioned('polar:circle', 'circle', 'cx', 'cy'),
    'polar:text': positioned('polar:text', 'text', 'x', 'y'),
};
