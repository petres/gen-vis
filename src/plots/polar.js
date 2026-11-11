// the mark types of polar plots, loaded with the first one, see coords/polar.js
import { arc, areaRadial, lineRadial, pointRadial } from 'd3-shape';
import * as d3 from "@/utils/d3";
import { bandCenter } from "@/utils/scales";
import { perGroup, perRow, finite, curve, points, areaPoints, propScale, once, dodge, halo, inside, centered } from "@/plots/elements";
import { barScale, barWidth } from "@/plots/cartesian";
import { radiusRange } from "@/coords/polar-plot";
import { defaults } from "@/plots/defaults";
import { shapeOf } from "@/utils/draw";

// the angles of a band scale are in the center of the band, as the ones of the axis
const angleOffset = (mark, ctx, path) => {
    const scale = propScale(mark, ctx, path);
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
    marks(groups, mark, ctx) {
        const offset = angleOffset(mark, ctx, 'angle');
        const text = type == 'text';
        const below = text ? halo(mark) : {};
        const [r0] = radiusRange(ctx);
        // inside the bands of an area mark (`place`), see plots/inside.js
        if (text && mark.place?.in !== undefined) {
            const { groups: placed, spots } = inside(ctx.store.inside.placeInside(groups, mark, ctx, true));
            return perRow(placed, type, (v, row) => {
                const { angle, radius, ...props } = v;
                return { ...below, ...props, ...centered, [x]: spots.get(row).x, [y]: spots.get(row).y };
            });
        }
        const radii = text && mark.dodge ? dodgedRadii(groups, mark.dodge, r0) : null;
        return perRow(groups, type, (v, row) => {
            if (!('angle' in v && 'radius' in v))
                throw new Error(`a ${name.split(':')[1]} of a polar chart needs an angle and a radius, the channels x and y (or the attributes angle and radius)`);
            const [px, py] = pointRadial(v.angle + offset, radii ? radii.get(row) : clampRadius(v.radius, r0));
            const { angle, radius, ...props } = v;
            return { ...below, ...props, [x]: px, [y]: py };
        });
    },
});

const arcPath = a => arc().padAngle(a.padAngle).cornerRadius(a.cornerRadius)(a);

const arcProps = ['angle', 'width', 'startAngle', 'endAngle', 'innerRadius', 'outerRadius', 'padAngle', 'cornerRadius'];

// the mark types of the polar coordinate system, the angles are in radians,
// clockwise from the top, missing values are gaps in paths and areas
const types = {
    // a line per group, `d` with `angle` and `radius`
    'polar:line': {
        curve: true,
        coords: ['polar'],
        update: true,
        marks(groups, mark, ctx) {
            const offset = angleOffset(mark, ctx, 'd.angle');
            const [r0] = radiusRange(ctx);
            return perGroup(groups, g => lineRadial()
                .curve(curve(mark))
                .defined(e => finite(e.angle, e.radius))
                .angle(e => e.angle + offset)
                .radius(e => clampRadius(e.radius, r0))
                (points(g, mark, ctx, 'd.angle'))
            );
        },
    },

    // an area per group, `d` with `angle`, `innerRadius` and `outerRadius`
    'polar:area': {
        curve: true,
        coords: ['polar'],
        update: true,
        marks(groups, mark, ctx) {
            const offset = angleOffset(mark, ctx, 'd.angle');
            const [r0] = radiusRange(ctx);
            // of stacked areas with a point of no height where a group has no row
            const pts = areaPoints(groups, mark, ctx, ['angle', 'innerRadius', 'outerRadius']);
            return perGroup(groups, g => areaRadial()
                .curve(curve(mark))
                .defined(e => finite(e.angle, e.innerRadius, e.outerRadius))
                .angle(e => e.angle + offset)
                .innerRadius(e => clampRadius(e.innerRadius, r0))
                .outerRadius(e => clampRadius(e.outerRadius, r0))
                (pts.get(g))
            );
        },
    },

    // a segment of a ring per row, e.g. the bars of a rose or a stacked one,
    // centered at the `angle`, `width` defaults to the width of a band or the
    // step of a point scale, or from `startAngle` to `endAngle`, e.g. the
    // slices of a pie of stacked angles, `innerRadius` defaults to the inner
    // radius of the mark, `outerRadius` to its outer radius
    'polar:arc': {
        coords: ['polar'],
        update: true,
        marks(groups, mark, ctx) {
            // the scale of the angle, the default width and the radii of the
            // mark are the same for all rows, see once
            const scale = once(() => barScale(mark, ctx, 'angle', 'polar:arc'));
            const band = once(() => barWidth(scale(), 'polar:arc'));
            const [inner, outer] = radiusRange(ctx);
            return perRow(groups, "path", v => {
                let [start, end] = [v.startAngle, v.endAngle];
                if (!('startAngle' in v && 'endAngle' in v)) {
                    if (!('angle' in v))
                        throw new Error(`an arc needs an angle, the channel x (or the attribute angle, or startAngle and endAngle)`);
                    const width = v.width ?? band();
                    const a = v.angle + bandCenter(scale());
                    [start, end] = [a - width/2, a + width/2];
                }
                const [r0, r1] = [clampRadius(v.innerRadius ?? inner, inner), clampRadius(v.outerRadius ?? outer, inner)];
                // no arc without a position, e.g. of 0 of a log scale
                if (!finite(start, end, r0, r1))
                    return null;
                // the path of the values of an arc, a transition moves these, not
                // the numbers of the path (the flags of its arcs are 0 or 1)
                const values = { startAngle: start, endAngle: end, innerRadius: r0, outerRadius: r1, padAngle: v.padAngle ?? 0, cornerRadius: v.cornerRadius ?? 0 };
                const props = Object.fromEntries(Object.entries(v).filter(([k]) => !arcProps.includes(k)));
                return { ...props, d: arcPath(values), [shapeOf]: { d: { values, build: arcPath } } };
            });
        },
    },

    'polar:circle': positioned('polar:circle', 'circle', 'cx', 'cy'),
    // `halo` of the mark draws a halo behind the texts, `dodge` moves the
    // texts of the same angle apart along the radius, to at least this distance
    'polar:text': positioned('polar:text', 'text', 'x', 'y'),
};

// with their default props, see plots/defaults.js
export default Object.fromEntries(Object.entries(types).map(([name, t]) => [name, { ...t, defaults: defaults[name] }]));
