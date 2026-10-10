import * as d3 from "@/utils/d3";
import { bandCenter } from "@/utils/scales";
import { groupwise, pointwise, finite, curve, propScale } from "@/plots/elements";
import { barScale, barWidth } from "@/plots/cartesian";
import { radiusRange } from "@/coords/polar";

// the angles of a band scale are in the center of the band, as the ones of the axis
const angleOffset = (plot, ctx, path) => {
    const scale = propScale(plot, ctx, path);
    return scale ? bandCenter(scale) : 0;
};

// the points of the path of a group, the values of `d` of its rows
const points = g => {
    const d = g.prop('d');
    return g.rows.map(row => d(row) ?? {});
};

// an element of `type` per row at the `angle` and `radius` of the props, as `x` and `y`
const positioned = (name, type, x, y) => ({
    coords: ['polar'],
    update: true,
    render: (groups, parent, plot, ctx) => pointwise(groups, parent, type, v => {
        if (!('angle' in v && 'radius' in v))
            throw new Error(`${name}: the props 'angle' and 'radius' are needed`);
        const [px, py] = d3.pointRadial(v.angle + angleOffset(plot, ctx, 'angle'), v.radius);
        const { angle, radius, ...props } = v;
        return { ...props, [x]: px, [y]: py };
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
        update: true,
        render(groups, parent, plot, ctx) {
            const offset = angleOffset(plot, ctx, 'd.angle');
            groupwise(groups, parent)
                .attr("d", g => d3.lineRadial()
                    .curve(curve(plot))
                    .defined(e => finite(e.angle, e.radius))
                    .angle(e => e.angle + offset)
                    .radius(e => e.radius)
                    (points(g))
                );
        },
    },

    // an area per group, `d` with `angle`, `innerRadius` and `outerRadius`
    'polar:area': {
        curve: true,
        coords: ['polar'],
        update: true,
        render(groups, parent, plot, ctx) {
            const offset = angleOffset(plot, ctx, 'd.angle');
            groupwise(groups, parent)
                .attr("d", g => d3.areaRadial()
                    .curve(curve(plot))
                    .defined(e => finite(e.angle, e.innerRadius, e.outerRadius))
                    .angle(e => e.angle + offset)
                    .innerRadius(e => e.innerRadius)
                    .outerRadius(e => e.outerRadius)
                    (points(g))
                );
        },
    },

    // a segment of a ring per row, e.g. the bars of a rose or a stacked one,
    // centered at the `angle`, `width` defaults to the width of a band or the
    // step of a point scale, `innerRadius` to the inner radius of the plot
    'polar:arc': {
        coords: ['polar'],
        update: true,
        render: (groups, parent, plot, ctx) => pointwise(groups, parent, "path", v => {
            const s = barScale(plot, ctx, 'angle', 'polar:arc');
            const width = v.width ?? barWidth(s, 'polar:arc');
            const a = v.angle + bandCenter(s);
            const [inner, outer] = radiusRange(ctx);
            const d = d3.arc()
                .padAngle(v.padAngle ?? 0)
                .cornerRadius(v.cornerRadius ?? 0)({
                    startAngle: a - width/2,
                    endAngle: a + width/2,
                    innerRadius: v.innerRadius ?? inner,
                    outerRadius: v.outerRadius ?? outer,
                });
            const props = Object.fromEntries(Object.entries(v).filter(([k]) => !arcProps.includes(k)));
            return { ...props, d };
        }),
    },

    'polar:circle': positioned('polar:circle', 'circle', 'cx', 'cy'),
    'polar:text': positioned('polar:text', 'text', 'x', 'y'),
};
