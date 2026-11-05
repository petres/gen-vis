export { barScale, barWidth };

import * as d3 from "@/utils/d3";
import { bandCenter } from "@/utils/scales";
import { perGroup, perRow, finite, curve, points, propScale } from "@/plots/elements";
import { pixelOffset } from "@/utils/axis";
import { refOf } from "@/utils/expr";

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

// the position of the base of the values of a scale: of 0, or of the end of
// the range nearest to it if 0 is outside the domain
const baseOf = scale => {
    const [lo, hi] = d3.extent(scale.range());
    return Math.max(lo, Math.min(hi, scale(0)));
};

/**
 * The path of stairs of the points of a group: a horizontal line from `x0`
 * to `x1` at `y` (of an area `y1`) of every point (e.g. a class of a bin),
 * in the order of `x0`, vertical lines between neighbours (less than half a
 * pixel apart) and down to the base (`y0` of the first point of a run, by
 * default the position of 0, `base`) at the ends and at gaps between them,
 * e.g. the outline of a histogram; an area (`fill`) closes every run along
 * the base, a line with `open` ends starts and ends at the step of its
 * first and last point, e.g. a share. Points without a position are gaps.
 */
const stairs = (points, base, fill = false, open = false) => {
    const y = fill ? 'y1' : 'y';
    const steps = points.filter(p => finite(p.x0, p.x1, p[y])).sort((a, b) => a.x0 - b.x0);
    const close = fill ? 'Z' : '';
    let path = '';
    let end = null;
    steps.forEach(p => {
        if (end === null || Math.abs(p.x0 - end.x) >= 0.5) {
            if (end !== null && !open)
                path += `V${end.y0}${close}`;
            end = { y0: finite(p.y0) ? p.y0 : base };
            path += open ? `M${p.x0},${p[y]}H${p.x1}` : `M${p.x0},${end.y0}V${p[y]}H${p.x1}`;
        } else
            path += `V${p[y]}H${p.x1}`;
        end.x = p.x1;
    });
    return end === null ? null : open ? path : `${path}V${end.y0}${close}`;
};

// the plot types of the cartesian coordinate system, missing values are gaps
// in lines and areas
export default {
    // a line per group, `d` with `x` and `y`
    'cartesian:line': {
        curve: true,
        coords: ['cartesian'],
        update: true,
        marks(groups, plot, ctx) {
            // stairs of `x0` and `x1`, e.g. the outline of a histogram
            if (plot.props.d && ('x0' in plot.props.d || 'x1' in plot.props.d)) {
                const scale = propScale(plot, ctx, 'd.y');
                const base = scale ? baseOf(scale) : ctx.innerHeight;
                return perGroup(groups, g => stairs(points(g), base, false, plot.ends == 'open'));
            }
            return perGroup(groups, g => d3.line()
                .curve(curve(plot))
                .defined(e => finite(e.x, e.y))
                .x(e => e.x)
                .y(e => e.y)
                (points(g, plot, ctx, 'd.x'))
            );
        },
    },

    // an area per group, `d` with `x`, `y0` and `y1`
    'cartesian:area': {
        curve: true,
        coords: ['cartesian'],
        update: true,
        marks(groups, plot, ctx) {
            // filled stairs of `x0` and `x1`, e.g. of the classes of a bin
            if (plot.props.d && ('x0' in plot.props.d || 'x1' in plot.props.d)) {
                const scale = propScale(plot, ctx, 'd.y1');
                const base = scale ? baseOf(scale) : ctx.innerHeight;
                return perGroup(groups, g => stairs(points(g), base, true));
            }
            return perGroup(groups, g => d3.area()
                .curve(curve(plot))
                .defined(e => finite(e.x, e.y0, e.y1))
                .x(e => e.x)
                .y1(e => e.y1)
                .y0(e => e.y0)
                (points(g, plot, ctx, 'd.x'))
            );
        },
    },

    // a line per row across the plot area at `x`, vertical, or at `y`,
    // horizontal (without an `x`), from `y1` to `y2` (or `x1` to `x2`, by
    // default the edges of the plot area), at the half pixel of the ticks,
    // e.g. the caps of categories at their values
    'cartesian:rule': {
        coords: ['cartesian'],
        update: true,
        marks(groups, plot, ctx) {
            const o = pixelOffset();
            const vertical = 'x' in plot.props;
            return perRow(groups, "line", v => {
                const { x, y, x1, x2, y1, y2, ...props } = v;
                return vertical
                    ? { ...props, x1: x + o, x2: x + o, y1: y1 ?? 0, y2: y2 ?? ctx.innerHeight }
                    : { ...props, x1: x1 ?? 0, x2: x2 ?? ctx.innerWidth, y1: y + o, y2: y + o };
            });
        },
    },

    // a bar per row from `y0` (by default the position of 0 of the scale of `y1`)
    // to `y1`, e.g. "@y:start:scaled" and "@y:end:scaled" of stacked values,
    // centered at `x`, in the middle of a band, `width` defaults to the width
    // of a band or the step of a point scale. With `x1` a horizontal bar from
    // `x0` to `x1` centered at `y`, `height` is its thickness.
    'cartesian:bar': {
        coords: ['cartesian'],
        update: true,
        marks(groups, plot, ctx) {
            const type = 'cartesian:bar';
            // the scales, the default width and the base of the bars are the
            // same for all rows, they are taken at the first row which needs
            // them, e.g. the error of a missing width only with rows
            const once = f => {
                let value;
                return () => value ??= f();
            };
            // a vertical bar from `x0` to `x1`, e.g. a class of a bin, from `y0`
            // (by default the position of 0) to `y1`
            if ('x1' in plot.props && 'y1' in plot.props) {
                const base = once(() => baseOf(barScale(plot, ctx, 'y1', type)));
                return perRow(groups, "rect", v => {
                    const { x0, x1 } = v;
                    const y0 = 'y0' in v ? v.y0 : base();
                    const { x0: _, x1: __, y0: ___, y1: ____, ...props } = v;
                    return { ...props, x: Math.min(x0, x1), width: Math.abs(x1 - x0), y: Math.min(y0, v.y1), height: Math.abs(v.y1 - y0) };
                });
            }
            if ('x1' in plot.props) {
                const yScale = once(() => barScale(plot, ctx, 'y', type));
                const thickness = once(() => barWidth(yScale(), type));
                const base = once(() => barScale(plot, ctx, 'x1', type)(0));
                return perRow(groups, "rect", v => {
                    const height = v.height ?? thickness();
                    const x0 = 'x0' in v ? v.x0 : base();
                    const { x0: _, x1: __, ...props } = v;
                    return {
                        ...props,
                        x: Math.min(x0, v.x1),
                        width: Math.abs(v.x1 - x0),
                        y: v.y + bandCenter(yScale()) - height/2,
                        height,
                    };
                });
            }
            const xScale = once(() => barScale(plot, ctx, 'x', type));
            // of the periods of dates (`interval` of the mapping of x): a bar
            // in the middle of its period (@x:scaled), 80% of its length by default
            const periodOf = once(() => {
                const s = xScale();
                const name = refOf(plot.props.x)?.split(':');
                return s.period && name?.length == 2 && name[1] == 'scaled'
                    ? row => (s(s.period.offset(row[name[0]])) - s(row[name[0]])) : null;
            });
            const thickness = once(() => barWidth(xScale(), type));
            const base = once(() => barScale(plot, ctx, 'y1', type)(0));
            return perRow(groups, "rect", (v, row) => {
                const period = periodOf()?.(row);
                const width = v.width ?? (period === undefined ? thickness() : 0.8*period);
                const y0 = 'y0' in v ? v.y0 : base();
                const { y0: _, y1: __, ...props } = v;
                return {
                    ...props,
                    x: v.x + (period === undefined ? bandCenter(xScale()) : 0) - width/2,
                    width,
                    y: Math.min(y0, v.y1),
                    height: Math.abs(v.y1 - y0),
                };
            });
        },
    },
};
