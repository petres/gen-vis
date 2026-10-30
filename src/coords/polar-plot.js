// the axes, the annotations and the hover of polar plots and their plot
// types, loaded with the first polar plot, see coords/polar.js
export { angleOf, radiusRange, plotTypes };

import * as d3 from "@/utils/d3";
import { arc as arcShape, lineRadial, pointRadial } from 'd3-shape';
import plotTypes from "@/plots/polar";
import { bandCenter } from "@/utils/scales";
import { tickValues, tickFormat, tickCount } from "@/coords/ticks";
import { constraints, span, position, annotationItem, labelItems } from "@/coords/annotations";
import { childrenOf, directOf, elementOf } from "@/utils/draw";

const tau = 2*Math.PI;

// the angle of a value, in the center of a band, clockwise from the top in radians
const angleOf = (scale, value) => scale(value) + bandCenter(scale);

// the distance of two angles, also across the top
const angleDistance = (a, b) => {
    const d = Math.abs(a - b) % tau;
    return Math.min(d, tau - d);
};

// the mapping of an orientation, `angular` or `radial`, the one of the
// positions or the values (e.g. of a stacked angle) or another one
const nameOf = (ctx, orientation) => [ctx.axis.v, ctx.axis.h, ...Object.keys(ctx.scales)]
    .find(n => n !== undefined && ctx.store.mapping(n).scale?.orientation == orientation);

// the inner and outer radius of the radius scale, the circle of the facet without it
const radiusRange = ctx => {
    const r = nameOf(ctx, 'radial');
    return r ? d3.extent(ctx.scales[r].range()) : [0, ctx.dims.radius];
};

// the values are the angles, they are stacked, e.g. the slices of a pie, the
// positions are the rings of the radius, if there is one
const flipped = (ctx, names) => ctx.store.mapping(names.v).scale?.orientation == 'angular';

// the angles of the slice of a row of stacked angles, its inner and outer
// radius, the ones of its ring or of the circle
const sliceOf = (ctx, row, names) => {
    const s = ctx.scales[names.v];
    const [a0, a1] = (ctx.stackOf?.(row) ?? [0, row[names.v]]).map(v => s(v));
    let [inner, outer] = radiusRange(ctx);
    if (names.h) {
        const r = ctx.scales[names.h];
        inner = r(row[names.h]);
        outer = inner + (r.bandwidth?.() ?? 0);
    }
    return { a0, a1, inner, outer };
};

// the angles of the ticks, the values at the end of a cyclic domain are at the
// angle of the start, e.g. 0 and 360 degrees, they are omitted
const angleTicks = (scale, values) => values.filter((v, i) =>
    !values.slice(0, i).some(w => angleDistance(angleOf(scale, v), angleOf(scale, w)) < 1e-6));

// the anchor of a label outside of the circle at an angle
const anchor = a => Math.sin(a) > 0.01 ? "start" : (Math.sin(a) < -0.01 ? "end" : "middle");
const baseline = a => Math.cos(a) > 0.5 ? "auto" : (Math.cos(a) < -0.5 ? "hanging" : "middle");

// the categories or ticks around the circle, spokes as grid lines, the
// parts of the axes (see `axes` of coords/index.js), drawn anew
const angularAxis = (ctx, n, s, values, format, axis) => {
    const [r0, r1] = radiusRange(ctx);
    const angles = angleTicks(s, values);
    const parts = [];

    if (axis.grid)
        parts.push({
            key: `grid ${n}`,
            fresh: true,
            element: "g",
            attrs: { class: "vis-grid" },
            layer: {
                items: angles.map(v => {
                    const [x1, y1] = pointRadial(angleOf(s, v), r0);
                    const [x2, y2] = pointRadial(angleOf(s, v), r1);
                    return { [elementOf]: "line", [directOf]: { x1, y1, x2, y2 } };
                }),
            },
        });

    const domain = { [elementOf]: "circle", [directOf]: { class: "domain", r: r1, fill: "none", stroke: "currentColor" } };
    const ticks = angles.map(v => {
        const a = angleOf(s, v);
        const [x1, y1] = pointRadial(a, r1);
        const [x2, y2] = pointRadial(a, r1 + 6);
        const [x, y] = pointRadial(a, r1 + 6 + axis.padding);
        return {
            [elementOf]: "g",
            [directOf]: { class: "tick" },
            [childrenOf]: [
                { [elementOf]: "line", [directOf]: { stroke: "currentColor", x1, y1, x2, y2 } },
                { [elementOf]: "text", [directOf]: { fill: "currentColor", x, y, "text-anchor": anchor(a), "dominant-baseline": baseline(a) }, text: format(v) },
            ],
        };
    });
    return [parts, [domain, ...ticks]];
};

// the values along a line from the center, circles (or polygons through the
// ticks of the angle) as grid lines, `angle` of the axis in degrees, the
// parts of the axes, drawn anew
const radialAxis = (ctx, n, s, values, format, axis) => {
    const a = (axis.angle ?? 0)/180*Math.PI;
    const [r0, r1] = d3.extent(s.range());
    const parts = [];

    if (axis.grid) {
        const h = nameOf(ctx, 'angular');
        const angle = h && ctx.scales[h];
        let items;
        if (axis.gridShape == "polygon" && angle) {
            const hAxis = ctx.store.mapping(h).axis;
            const arc = Math.abs(angle.range()[1] - angle.range()[0])*radiusRange(ctx)[1];
            const angles = angleTicks(angle, hAxis ? tickValues(hAxis, angle, tickCount(hAxis, ctx.scope, arc), ctx.store.mapping(h), ctx.scope) : angle.domain());
            items = values.map(v => ({ [elementOf]: "path", [directOf]: { d: lineRadial().curve(d3.curveLinearClosed)
                .angle(w => angleOf(angle, w))
                .radius(() => s(v))(angles) } }));
        } else {
            items = values.map(v => ({ [elementOf]: "circle", [directOf]: { r: s(v) } }));
        }
        parts.push({ key: `grid ${n}`, fresh: true, element: "g", attrs: { class: "vis-grid", fill: "none" }, layer: { items } });
    }

    const [x0, y0] = pointRadial(a, r0);
    const [x1, y1] = pointRadial(a, r1);
    const domain = { [elementOf]: "line", [directOf]: { class: "domain", stroke: "currentColor", x1: x0, y1: y0, x2: x1, y2: y1 } };

    // the labels on the left of the line, below it if it is horizontal
    const horizontal = Math.abs(Math.cos(a)) <= 0.5;
    const ticks = values.map(v => {
        const [x, y] = pointRadial(a, s(v));
        return {
            [elementOf]: "g",
            [directOf]: { class: "tick" },
            [childrenOf]: [{
                [elementOf]: "text",
                [directOf]: {
                    fill: "currentColor",
                    "text-anchor": horizontal ? "middle" : "end",
                    "dominant-baseline": horizontal ? "hanging" : "middle",
                    x: x - (horizontal ? 0 : axis.padding),
                    y: y + (horizontal ? axis.padding : 0),
                },
                text: format(v),
            }],
        };
    });

    const after = [];
    if (axis.title) {
        const [x, y] = pointRadial(a, r1 + (axis.title.offset ?? 16));
        after.push({
            key: `axis title ${n}`,
            fresh: true,
            element: "text",
            attrs: { class: "vis-axis-title", x, y, "text-anchor": "middle", "dominant-baseline": "middle" },
            text: ctx.store.text(axis.title.name),
        });
    }
    return [parts, [domain, ...ticks], after];
};

// the parts of the axes: the grid lines, the axis, its domain and ticks, and
// of radial axes the title, see `axes` of coords/index.js
const axes = ctx => {
    const { store } = ctx;
    return store.mappingNamesWithKey('axis').flatMap(n => {
        const m = store.mapping(n);
        const i = m.axis;
        const s = ctx.scales[n];
        // the length of a radial axis, of an angular one the arc at the outer radius
        const span = Math.abs(s.range()[1] - s.range()[0]);
        const ticks = tickCount(i, ctx.scope, i.position == 'angular' ? span*radiusRange(ctx)[1] : span);
        const format = tickFormat(store, n, s, ticks) ?? (v => v);
        const draw = { angular: angularAxis, radial: radialAxis }[i.position];
        const [before, items, after = []] = draw(ctx, n, s, tickValues(i, s, ticks, m, ctx.scope), format, i);
        return [
            ...before,
            {
                key: `axis ${n}`,
                fresh: true,
                element: "g",
                attrs: { class: `vis-axis vis-axis-${i.position}`, "data-mapping": n, "font-size": 10, "font-family": "sans-serif" },
                layer: { items },
            },
            ...after,
        ];
    });
};

// a sector or a ring (band), a spoke or a circle (line), a text or a circle at
// values of the angle and the radius, without a value of the angle around the
// whole circle, without one of the radius from its inner to its outer radius,
// the items of a layer
const annotate = (ctx, a) => {
    const c = constraints(ctx, a);
    const angle = c.find(e => e.orientation == 'angular');
    const radius = c.find(e => e.orientation == 'radial');
    const [inner, outer] = radiusRange(ctx);

    if (a.type == 'band') {
        // a range of angles can be across the top, e.g. from November to February
        let [a0, a1] = angle ? span(angle, false) : [0, tau];
        if (a1 < a0)
            a1 += tau;
        const [r0, r1] = radius ? span(radius) : [inner, outer];
        const arc = arcShape().innerRadius(r0).outerRadius(r1).startAngle(a0).endAngle(a1);
        const [x, y] = arc.centroid();
        return [annotationItem("path", { class: "vis-annotation vis-band", d: arc() }, a, ctx), ...labelItems(a, x, y, "middle", "middle")];
    }
    if (a.type == 'line') {
        if (angle) {
            const p = position(angle);
            const [x1, y1] = pointRadial(p, inner);
            const [x2, y2] = pointRadial(p, outer);
            return [annotationItem("line", { class: "vis-annotation vis-line", x1, y1, x2, y2 }, a, ctx), ...labelItems(a, x2, y2 - 4, "middle", "auto")];
        }
        const r = radius ? position(radius) : outer;
        return [annotationItem("circle", { class: "vis-annotation vis-line", r }, a, ctx, { fill: "none" }), ...labelItems(a, 4, -r - 4, "start", "auto")];
    }
    const [x, y] = pointRadial(angle ? position(angle) : 0, radius ? position(radius) : outer);
    if (a.type == 'text')
        return [annotationItem("text", { class: "vis-annotation vis-text", x, y }, a, ctx, { "font-size": 11 })];
    if (a.type == 'circle')
        return [annotationItem("circle", { class: "vis-annotation vis-circle", cx: x, cy: y }, a, ctx, { r: 4 })];
    return [];
};

// the parts of the polar coordinate system which are loaded, see coords/polar.js
export default {
    axes,
    annotate,
    // the labels of the radial axes are in the plot area, they are above the plots
    raise: ctx => ctx.inner.selectAll(".vis-axis-radial").raise(),
    hover: {
        // the whole facet, the angle is also taken outside of the circle
        area: (ctx, parent) => parent.append("rect")
            .attr("x", -ctx.innerWidth/2)
            .attr("y", -ctx.innerHeight/2)
            .attr("width", ctx.innerWidth)
            .attr("height", ctx.innerHeight),

        // the values of stacked angles without the radius, e.g. of a pie
        values: true,

        // the nearest angle with data, also across the top, and the radius,
        // of stacked angles the ring of the radius and the angle, e.g. the
        // slice of a pie under the pointer, not outside of the circle
        locate(ctx, [px, py], names) {
            const a = (Math.atan2(px, -py) + tau) % tau;
            if (flipped(ctx, names)) {
                const r = Math.hypot(px, py);
                if (!names.h && r > radiusRange(ctx)[1])
                    return null;
                const key = names.h ? ctx.scales[names.h].nearest?.(r) : undefined;
                if (names.h && key === undefined)
                    return null;
                return { key, value: ctx.scales[names.v].invert?.(a) };
            }
            const s = ctx.scales[names.h];
            const keys = [a - tau, a, a + tau].map(v => s.nearest(v)).filter(k => k !== undefined);
            if (keys.length == 0)
                return null;
            const key = d3.least(keys, k => angleDistance(angleOf(s, k), a));
            return { key, value: ctx.scales[names.v].invert?.(Math.hypot(px, py)) };
        },

        // the position of the point of a row, of the hover of the nearest point
        point(ctx, row, names) {
            if (flipped(ctx, names)) {
                const { a0, a1, inner, outer } = sliceOf(ctx, row, names);
                return pointRadial((a0 + a1)/2, (inner + outer)/2);
            }
            const value = ctx.stackOf ? d3.mean(ctx.stackOf(row)) : row[names.v];
            return pointRadial(angleOf(ctx.scales[names.h], row[names.h]), ctx.scales[names.v](value));
        },

        // a line from the center, the hover is in the center, on the other
        // side than the line, of a slice of stacked angles beside its middle,
        // towards the center, e.g. over the hole of a donut
        marker(ctx, key, names, line, nearest) {
            if (flipped(ctx, names)) {
                line.attr("x1", null).attr("x2", null).attr("y1", null).attr("y2", null);
                if (!nearest)
                    return { x: 0, y: 0, side: "right" };
                const { a0, a1, inner, outer } = sliceOf(ctx, nearest, names);
                const [x, y] = pointRadial((a0 + a1)/2, (inner + outer)/2);
                return { x, y, side: Math.sin((a0 + a1)/2) >= 0 ? "left" : "right" };
            }
            const a = angleOf(ctx.scales[names.h], key);
            const [r0, r1] = radiusRange(ctx);
            const [x1, y1] = pointRadial(a, r0);
            const [x2, y2] = pointRadial(a, r1);
            line.attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
            return { x: 0, y: 0, side: Math.sin(a) >= 0 ? "left" : "right" };
        },
    },
};
