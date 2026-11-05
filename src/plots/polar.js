// the plot types of polar plots, loaded with the first one, see coords/polar.js
import { arc, areaRadial, lineRadial, pointRadial } from 'd3-shape';
import * as d3 from "@/utils/d3";
import { bandCenter } from "@/utils/scales";
import { perGroup, perRow, finite, curve, points, propScale, dodge, halo } from "@/plots/elements";
import { barScale, barWidth } from "@/plots/cartesian";
import { radiusRange } from "@/coords/polar-plot";
import { defaults } from "@/plots/defaults";

// the angles of a band scale are in the center of the band, as the ones of the axis
const angleOffset = (plot, ctx, path) => {
    const scale = propScale(plot, ctx, path);
    return scale ? bandCenter(scale) : 0;
};

const tau = 2*Math.PI;

// a radius not inside of the inner radius `r0`, a value below the domain of
// the radius is not on the other side of the center
const clampRadius = (r, r0) => Number.isFinite(r) ? Math.max(r0, r) : r;

// the same angle, also 0 and 2π, rounded, as an angle of a scale can differ
// in its last digits
const angleKey = a => {
    const k = Math.round(((a%tau + tau)%tau)*1e6);
    return k == Math.round(tau*1e6) ? 0 : k;
};

// the radii of the rows of the groups, the ones of the same angle moved apart
// to at least the distance `gap`, see dodge, around their mean, a group
// moved outward if one of them would be inside of the inner radius `r0`
const dodgedRadii = (groups, gap, r0) => {
    const rows = groups.flatMap(g => g.rows.filter(g.complete).map(row => [row, g.at(row)]));
    const radii = new Map();
    d3.group(rows, ([, v]) => angleKey(v.angle)).forEach(same => {
        const moved = dodge(same.map(([, v]) => clampRadius(parseFloat(v.radius), r0)), gap);
        const shift = Math.max(0, r0 - (d3.min(moved) ?? r0));
        same.forEach(([row], i) => radii.set(row, moved[i] + shift));
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
        const [r0] = radiusRange(ctx);
        const radii = text && plot.dodge ? dodgedRadii(groups, plot.dodge, r0) : null;
        return perRow(groups, type, (v, row) => {
            if (!('angle' in v && 'radius' in v))
                throw new Error(`${name}: the props 'angle' and 'radius' are needed`);
            const [px, py] = pointRadial(v.angle + offset, radii ? radii.get(row) : clampRadius(v.radius, r0));
            const { angle, radius, ...props } = v;
            return { ...below, ...props, [x]: px, [y]: py };
        });
    },
});

const arcProps = ['angle', 'width', 'startAngle', 'endAngle', 'innerRadius', 'outerRadius', 'padAngle', 'cornerRadius'];

// the plot types of the polar coordinate system, the angles are in radians,
// clockwise from the top, missing values are gaps in paths and areas
const types = {
    // a line per group, `d` with `angle` and `radius`
    'polar:line': {
        curve: true,
        coords: ['polar'],
        update: true,
        marks(groups, plot, ctx) {
            const offset = angleOffset(plot, ctx, 'd.angle');
            const [r0] = radiusRange(ctx);
            return perGroup(groups, g => lineRadial()
                .curve(curve(plot))
                .defined(e => finite(e.angle, e.radius))
                .angle(e => e.angle + offset)
                .radius(e => clampRadius(e.radius, r0))
                (points(g, plot, ctx, 'd.angle'))
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
            const [r0] = radiusRange(ctx);
            return perGroup(groups, g => areaRadial()
                .curve(curve(plot))
                .defined(e => finite(e.angle, e.innerRadius, e.outerRadius))
                .angle(e => e.angle + offset)
                .innerRadius(e => clampRadius(e.innerRadius, r0))
                .outerRadius(e => clampRadius(e.outerRadius, r0))
                (points(g, plot, ctx, 'd.angle'))
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
                    innerRadius: clampRadius(v.innerRadius ?? inner, inner),
                    outerRadius: clampRadius(v.outerRadius ?? outer, inner),
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

// with their default props, see plots/defaults.js
export default Object.fromEntries(Object.entries(types).map(([name, t]) => [name, { ...t, defaults: defaults[name] }]));
