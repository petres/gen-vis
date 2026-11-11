// the axes, the annotations and the hover of polar plots and their plot
// types, loaded with the first polar plot, see coords/polar.js
export { angleOf, radiusRange, plotTypes };

import * as d3 from "@/utils/d3";
import { arc as arcShape, lineRadial, pointRadial } from 'd3-shape';
import plotTypes from "@/plots/polar";
import { bandCenter } from "@/utils/scales";
import { tickValues, tickFormat, tickCount, labelProps, domainProps, tickMarks } from "@/coords/ticks";
import { constraints, span, position, annotationItem, labelItems } from "@/coords/annotations";
import { rect, placeLine } from "@/coords/hover";
import { childrenOf, directOf, elementOf } from "@/utils/draw";

const tau = 2*Math.PI;

// the angle of a value, in the center of a band, clockwise from the top in radians
const angleOf = (scale, value) => scale(value) + bandCenter(scale);

// the distance of two angles, also across the top
const angleDistance = (a, b) => {
    const d = Math.abs(a - b) % tau;
    return Math.min(d, tau - d);
};

// the dim of an orientation, `angular` or `radial`, the one of the
// positions or the values (e.g. of a stacked angle) or another one
const nameOf = (ctx, orientation) => [ctx.axis.v, ctx.axis.h, ...Object.keys(ctx.scales)]
    .find(n => n !== undefined && ctx.store.dim(n).scale?.orientation == orientation);

// the inner and outer radius of the radius scale, the circle of the facet without it
const radiusRange = ctx => {
    const r = nameOf(ctx, 'radial');
    return r ? d3.extent(ctx.scales[r].range()) : [0, ctx.dims.radius];
};

// the values are the angles, they are stacked, e.g. the slices of a pie, the
// positions are the rings of the radius, if there is one
const flipped = (ctx, names) => ctx.store.dim(names.v).scale?.orientation == 'angular';

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

// the angle from `a` to `b` in the `direction` of the ticks, negative
// counterclockwise, e.g. of a decreasing range, not the shortest one, which
// is the wrong side of a gap of more than half the circle
const stepTo = (a, b, direction) => {
    const d = ((b - a)%tau + tau)%tau;
    return direction < 0 ? d - tau : d;
};

// a part of an id of the name of a dim, which can have a space, the
// other characters as their codes, so the ids of two names differ
const idOf = name => name.replace(/[^A-Za-z0-9-]/g, c => `_${c.codePointAt(0).toString(16)}_`);

// the anchor of a label outside of the circle at an angle
const anchor = a => Math.sin(a) > 0.01 ? "start" : (Math.sin(a) < -0.01 ? "end" : "middle");
const baseline = a => Math.cos(a) > 0.5 ? "auto" : (Math.cos(a) < -0.5 ? "hanging" : "middle");

// a path around the circle of the radius `r` through the angle `a`, which
// is in its middle, clockwise or counterclockwise, e.g. of a curved label
const circlePath = (a, r, clockwise) => {
    const half = (clockwise ? 1 : -1)*0.99*Math.PI;
    const [p0, p1, p2] = [a - half, a, a + half].map(t => pointRadial(t, r));
    const arc = `A${r},${r} 0 0,${clockwise ? 1 : 0}`;
    return `M${p0}${arc} ${p1}${arc} ${p2}`;
};

// the label of a tick along the circle (`"curved": true` of the labels of
// the axis) centered at the angle `a`, on a path of its own (`id`), outside
// of the radius `r`, the ones of the lower half counterclockwise, so they
// are not upside down
const curvedLabel = (id, a, r, text, props) => {
    const lower = Math.cos(a) < -1e-9;
    return [
        { [elementOf]: "path", [directOf]: { id, d: circlePath(a, r, !lower), fill: "none" } },
        {
            [elementOf]: "text",
            [directOf]: { fill: "currentColor", "text-anchor": "middle", "dominant-baseline": lower ? "hanging" : "auto" },
            ...props,
            [childrenOf]: [{ [elementOf]: "textPath", [directOf]: { href: `#${id}`, startOffset: "50%" }, text }],
        },
    ];
};

// the categories or ticks around the circle, spokes as grid lines, the
// parts of the axes (see `axes` of coords/index.js), drawn anew, `label(v)`
// is the text and the props of the label of a tick, `domain` the props of
// the circle, the tick marks (`axis.tickMarks`, see tickMarks) outside of
// the circle, 6 pixels by default (see utils/defaults.js), the part of them
// inside it their `inset`, the labels after them, also without tick marks at
// their places, along the circle
// with `labels.curved`, at the tick (true) or between it and the next one
// (`between`), e.g. the names of the months
const angularAxis = (ctx, n, s, values, label, domain, axis) => {
    const d = ctx.store.axisDefaults('angular');
    const marks = tickMarks(ctx, axis, d.tickMarks);
    const size = marks ? marks.size : d.tickMarks?.size;
    const inset = marks ? marks.inset ?? 0 : 0;
    const at = size + (axis.padding ?? d.padding);
    const [r0, r1] = radiusRange(ctx);
    const angles = angleTicks(s, values);
    // the direction of the ticks, counterclockwise of a decreasing range or
    // of a reversed domain
    const direction = angles.length > 1 ? Math.sign(angleOf(s, angles[1]) - angleOf(s, angles[0])) : 1;
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

    const circle = { [elementOf]: "circle", [directOf]: { class: "domain", r: r1, fill: "none", stroke: "currentColor" }, ...domain };
    const curved = axis.labels?.curved;
    const ticks = angles.map((v, i) => {
        const a = angleOf(s, v);
        const { text, props } = label(v);
        const [x1, y1] = pointRadial(a, r1 - inset);
        const [x2, y2] = pointRadial(a, r1 - inset + size);
        const [x, y] = pointRadial(a, r1 + at);
        // the middle of the angle to the next tick, after the last one the first one
        const step = angles.length > 1 ? stepTo(a, angleOf(s, angles[(i + 1)%angles.length]), direction) : 0;
        return {
            [elementOf]: "g",
            [directOf]: { class: "tick" },
            [childrenOf]: [
                ...(marks === false ? [] : [{ [elementOf]: "line", [directOf]: { stroke: "currentColor", x1, y1, x2, y2 }, ...marks.props }]),
                ...(curved
                    ? curvedLabel(`${ctx.uid}-${idOf(n)}-${i}`, curved == 'between' ? a + step/2 : a, r1 + at, text, props)
                    : [{ [elementOf]: "text", [directOf]: { fill: "currentColor", x, y, "text-anchor": anchor(a), "dominant-baseline": baseline(a) }, ...props, text }]),
            ],
        };
    });
    return [parts, [circle, ...ticks]];
};

// the values along a line from the center, circles (or polygons through the
// ticks of the angle) as grid lines, `angle` of the axis in degrees, the
// parts of the axes, drawn anew, `label(v)` is the text and the props of the
// label of a tick, `domain` the props of the line
const radialAxis = (ctx, n, s, values, label, domain, axis) => {
    const a = (axis.angle ?? 0)/180*Math.PI;
    const [r0, r1] = d3.extent(s.range());
    const d = ctx.store.axisDefaults('radial');
    const padding = axis.padding ?? d.padding;
    const parts = [];

    if (axis.grid) {
        const h = nameOf(ctx, 'angular');
        const angle = h && ctx.scales[h];
        let items;
        if (axis.gridShape == "polygon" && angle) {
            const hAxis = ctx.store.dim(h).axis;
            const arc = Math.abs(angle.range()[1] - angle.range()[0])*radiusRange(ctx)[1];
            const angles = angleTicks(angle, hAxis ? tickValues(hAxis, angle, tickCount(hAxis, ctx.scope, arc), ctx.store.dim(h), ctx.scope, ctx.store.def.dims) : angle.domain());
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
    const line = { [elementOf]: "line", [directOf]: { class: "domain", stroke: "currentColor", x1: x0, y1: y0, x2: x1, y2: y1 }, ...domain };

    // the labels on the left of the line, below it if it is horizontal
    const horizontal = Math.abs(Math.cos(a)) <= 0.5;
    const ticks = values.map(v => {
        const [x, y] = pointRadial(a, s(v));
        const { text, props } = label(v);
        return {
            [elementOf]: "g",
            [directOf]: { class: "tick" },
            [childrenOf]: [{
                [elementOf]: "text",
                [directOf]: {
                    fill: "currentColor",
                    "text-anchor": horizontal ? "middle" : "end",
                    "dominant-baseline": horizontal ? "hanging" : "middle",
                    x: x - (horizontal ? 0 : padding),
                    y: y + (horizontal ? padding : 0),
                },
                ...props,
                text,
            }],
        };
    });

    const after = [];
    if (axis.title) {
        const [x, y] = pointRadial(a, r1 + (axis.title.offset ?? d.title?.offset ?? 16));
        after.push({
            key: `axis title ${n}`,
            fresh: true,
            element: "text",
            attrs: { class: "vis-axis-title", x, y, "text-anchor": "middle", "dominant-baseline": "middle" },
            text: ctx.store.text(axis.title.name),
        });
    }
    return [parts, [line, ...ticks], after];
};

// the parts of the axes: the grid lines, the axis, its domain and ticks, and
// of radial axes the title, see `axes` of coords/index.js
const axes = ctx => {
    const { store } = ctx;
    return store.dimNamesWithKey('axis').flatMap(n => {
        const m = store.dim(n);
        const i = m.axis;
        const s = ctx.scales[n];
        // the length of a radial axis, of an angular one the arc at the outer radius
        const span = Math.abs(s.range()[1] - s.range()[0]);
        const ticks = tickCount(i, ctx.scope, i.position == 'angular' ? span*radiusRange(ctx)[1] : span);
        const format = tickFormat(store, n, s, ticks) ?? (v => v);
        // the props of the labels, also their texts, as the ones of cartesian
        // axes, see labelProps
        const labelsOf = labelProps(ctx, n, i.labels);
        const label = v => {
            if (!labelsOf)
                return { text: format(v), props: {} };
            const { text, ...props } = labelsOf(v);
            return { text: !('text' in i.labels.props) ? format(v) : (text === null || text === undefined ? '' : String(text)), props };
        };
        const draw = { angular: angularAxis, radial: radialAxis }[i.position];
        const [before, items, after = []] = draw(ctx, n, s, tickValues(i, s, ticks, m, ctx.scope, ctx.store.def.dims), label, domainProps(ctx, i) ?? {}, i);
        return [
            ...before,
            {
                key: `axis ${n}`,
                fresh: true,
                element: "g",
                attrs: { class: `vis-axis vis-axis-${i.position}`, "data-dim": n, "font-size": 10, "font-family": "sans-serif" },
                // the labels with a max-width are cut or wrapped
                layer: { items, fit: true },
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
    raise: ctx => ctx.inner.querySelectorAll(".vis-axis-radial").forEach(node => {
        if (node.nextSibling)
            node.parentNode.appendChild(node);
    }),
    hover: {
        // the whole facet, the angle is also taken outside of the circle
        area: (ctx, parent) => parent.appendChild(rect(ctx.innerWidth, ctx.innerHeight, -ctx.innerWidth/2, -ctx.innerHeight/2)),

        // the values of stacked angles without the radius, e.g. of a pie
        values: true,

        // the nearest angle with data (of the hover with rows, `ctx.nearest`),
        // also across the top, and the radius,
        // of stacked angles the ring of the radius and the angle, e.g. the
        // slice of a pie under the pointer, not outside of the circle
        locate(ctx, [px, py], names) {
            const a = (Math.atan2(px, -py) + tau) % tau;
            if (flipped(ctx, names)) {
                const r = Math.hypot(px, py);
                if (!names.h && r > radiusRange(ctx)[1])
                    return null;
                const key = names.h ? (ctx.nearest ?? ctx.scales[names.h].nearest)?.(r) : undefined;
                if (names.h && key === undefined)
                    return null;
                return { key, value: ctx.scales[names.v].invert?.(a) };
            }
            const s = ctx.scales[names.h];
            const keys = [a - tau, a, a + tau].map(v => (ctx.nearest ?? s.nearest)(v)).filter(k => k !== undefined);
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
            // not through the center, as the plots, see plots/polar.js
            const s = ctx.scales[names.v];
            return pointRadial(angleOf(ctx.scales[names.h], row[names.h]), Math.max(d3.min(s.range()), s(value)));
        },

        // a line from the center, the hover is in the center, on the other
        // side than the line, of a slice of stacked angles beside its middle,
        // towards the center, e.g. over the hole of a donut
        marker(ctx, key, names, line, nearest) {
            if (flipped(ctx, names)) {
                placeLine(line, null);
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
            line.setAttribute("x1", x1);
            line.setAttribute("y1", y1);
            line.setAttribute("x2", x2);
            line.setAttribute("y2", y2);
            return { x: 0, y: 0, side: Math.sin(a) >= 0 ? "left" : "right" };
        },
    },
};
