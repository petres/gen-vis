// the plot types of polar plots, loaded with the first one, see coords/polar.js
import { arc, areaRadial, lineRadial, pointRadial } from 'd3-shape';
import * as d3 from "@/utils/d3";
import { bandCenter } from "@/utils/scales";
import { perGroup, perRow, finite, curve, points, propScale, dodge, halo } from "@/plots/elements";
import { barScale, barWidth } from "@/plots/cartesian";
import { radiusRange } from "@/coords/polar-plot";

// the angles of a band scale are in the center of the band, as the ones of the axis
const angleOffset = (plot, ctx, path) => {
    const scale = propScale(plot, ctx, path);
    return scale ? bandCenter(scale) : 0;
};

// the radii of the rows of the groups, the ones of the same angle moved apart
// to at least the distance `gap`, see dodge
const dodgedRadii = (groups, gap) => {
    const rows = groups.flatMap(g => g.rows.filter(g.complete).map(row => [row, g.at(row)]));
    const radii = new Map();
    d3.group(rows, ([, v]) => v.angle).forEach(same => {
        const moved = dodge(same.map(([, v]) => parseFloat(v.radius)), gap);
        same.forEach(([row], i) => radii.set(row, moved[i]));
    });
    return radii;
};

// an element of `type` per row at the `angle` and `radius` of the props, as
// `x` and `y`, texts with a `halo` and the ones of the same angle moved apart
// along the radius (`dodge`)
const positioned = (name, type, x, y) => ({
    coords: ['polar'],
    update: true,
    marks(groups, plot, ctx) {
        const offset = angleOffset(plot, ctx, 'angle');
        const text = type == 'text';
        const below = text ? halo(plot) : {};
        const radii = text && plot.dodge ? dodgedRadii(groups, plot.dodge) : null;
        return perRow(groups, type, (v, row) => {
            if (!('angle' in v && 'radius' in v))
                throw new Error(`${name}: the props 'angle' and 'radius' are needed`);
            const [px, py] = pointRadial(v.angle + offset, radii ? radii.get(row) : v.radius);
            const { angle, radius, ...props } = v;
            return { ...below, ...props, [x]: px, [y]: py };
        });
    },
});

const arcProps = ['angle', 'width', 'startAngle', 'endAngle', 'innerRadius', 'outerRadius', 'padAngle', 'cornerRadius'];

// the plot types of the polar coordinate system, the angles are in radians,
// clockwise from the top, missing values are gaps in paths and areas
export default {
    // a line per group, `d` with `angle` and `radius`
    'polar:line': {
        curve: true,
        coords: ['polar'],
        update: true,
        marks(groups, plot, ctx) {
            const offset = angleOffset(plot, ctx, 'd.angle');
            return perGroup(groups, g => lineRadial()
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
        marks(groups, plot, ctx) {
            const offset = angleOffset(plot, ctx, 'd.angle');
            return perGroup(groups, g => areaRadial()
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
    // step of a point scale, or from `startAngle` to `endAngle`, e.g. the
    // slices of a pie of stacked angles, `innerRadius` defaults to the inner
    // radius of the plot, `outerRadius` to its outer radius
    'polar:arc': {
        coords: ['polar'],
        update: true,
        marks: (groups, plot, ctx) => perRow(groups, "path", v => {
            let [start, end] = [v.startAngle, v.endAngle];
            if (!('startAngle' in v && 'endAngle' in v)) {
                if (!('angle' in v))
                    throw new Error(`polar:arc: the props 'angle' or 'startAngle' and 'endAngle' are needed`);
                const s = barScale(plot, ctx, 'angle', 'polar:arc');
                const width = v.width ?? barWidth(s, 'polar:arc');
                const a = v.angle + bandCenter(s);
                [start, end] = [a - width/2, a + width/2];
            }
            const [inner, outer] = radiusRange(ctx);
            const d = arc()
                .padAngle(v.padAngle ?? 0)
                .cornerRadius(v.cornerRadius ?? 0)({
                    startAngle: start,
                    endAngle: end,
                    innerRadius: v.innerRadius ?? inner,
                    outerRadius: v.outerRadius ?? outer,
                });
            const props = Object.fromEntries(Object.entries(v).filter(([k]) => !arcProps.includes(k)));
            return { ...props, d };
        }),
    },

    'polar:circle': positioned('polar:circle', 'circle', 'cx', 'cy'),
    // `halo` of the plot draws a halo behind the texts, `dodge` moves the
    // texts of the same angle apart along the radius, to at least this distance
    'polar:text': positioned('polar:text', 'text', 'x', 'y'),
};
