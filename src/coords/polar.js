export { angleOf, radiusRange };

import * as d3 from "d3";
import { entryToValue } from "@/utils/props";
import { bandCenter } from "@/utils/scales";
import { tickValues, tickFormat } from "@/coords/ticks";
import { constraints, span, position, drawLabel, setAnnotationProps } from "@/coords/annotations";

const tau = 2*Math.PI;

// the angle of a value, in the center of a band, clockwise from the top in radians
const angleOf = (scale, value) => scale(value) + bandCenter(scale);

// the distance of two angles, also across the top
const angleDistance = (a, b) => {
    const d = Math.abs(a - b) % tau;
    return Math.min(d, tau - d);
};

// the inner and outer radius of the radius scale, the circle of the facet without it
const radiusRange = ctx => {
    const v = ctx.store.axis.v;
    return v ? d3.extent(ctx.info[v].scale.range()) : [0, ctx.dims.radius];
};

// the angles of the ticks, the values at the end of a cyclic domain are at the
// angle of the start, e.g. 0 and 360 degrees, they are omitted
const angleTicks = (scale, values) => values.filter((v, i) =>
    !values.slice(0, i).some(w => angleDistance(angleOf(scale, v), angleOf(scale, w)) < 1e-6));

// the anchor of a label outside of the circle at an angle
const anchor = a => Math.sin(a) > 0.01 ? "start" : (Math.sin(a) < -0.01 ? "end" : "middle");
const baseline = a => Math.cos(a) > 0.5 ? "auto" : (Math.cos(a) < -0.5 ? "hanging" : "middle");

// the categories or ticks around the circle, spokes as grid lines
const angularAxis = (ctx, g, s, values, format, axis) => {
    const [r0, r1] = radiusRange(ctx);
    const angles = angleTicks(s, values);

    if (axis.grid)
        ctx.inner.insert("g", () => g.node())
            .attr("class", "grid")
            .selectAll("line")
            .data(angles)
            .join("line")
            .each(function(v) {
                const [x1, y1] = d3.pointRadial(angleOf(s, v), r0);
                const [x2, y2] = d3.pointRadial(angleOf(s, v), r1);
                d3.select(this).attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
            });

    g.append("circle")
        .attr("class", "domain")
        .attr("r", r1)
        .attr("fill", "none")
        .attr("stroke", "currentColor");

    const ticks = g.selectAll("g.tick")
        .data(angles)
        .join("g")
        .attr("class", "tick");
    ticks.append("line")
        .attr("stroke", "currentColor")
        .each(function(v) {
            const [x1, y1] = d3.pointRadial(angleOf(s, v), r1);
            const [x2, y2] = d3.pointRadial(angleOf(s, v), r1 + 6);
            d3.select(this).attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
        });
    ticks.append("text")
        .attr("fill", "currentColor")
        .each(function(v) {
            const a = angleOf(s, v);
            const [x, y] = d3.pointRadial(a, r1 + 6 + axis.padding);
            d3.select(this).attr("x", x).attr("y", y)
                .attr("text-anchor", anchor(a))
                .attr("dominant-baseline", baseline(a));
        })
        .text(format);
};

// the values along a line from the center, circles (or polygons through the
// ticks of the angle) as grid lines, `angle` of the axis in degrees
const radialAxis = (ctx, g, s, values, format, axis) => {
    const a = (axis.angle ?? 0)/180*Math.PI;
    const [r0, r1] = d3.extent(s.range());

    if (axis.grid) {
        const grid = ctx.inner.insert("g", () => g.node())
            .attr("class", "grid")
            .attr("fill", "none");
        const h = ctx.store.axis.h;
        const angle = h && ctx.info[h].scale;
        if (axis.gridShape == "polygon" && angle) {
            const hAxis = ctx.store.mapping(h).axis;
            const angles = angleTicks(angle, hAxis ? tickValues(hAxis, angle, entryToValue(hAxis.ticks, ctx.relativeBases)) : angle.domain());
            grid.selectAll("path")
                .data(values)
                .join("path")
                .attr("d", v => d3.lineRadial().curve(d3.curveLinearClosed)
                    .angle(w => angleOf(angle, w))
                    .radius(() => s(v))(angles));
        } else {
            grid.selectAll("circle")
                .data(values)
                .join("circle")
                .attr("r", v => s(v));
        }
    }

    const [x0, y0] = d3.pointRadial(a, r0);
    const [x1, y1] = d3.pointRadial(a, r1);
    g.append("line")
        .attr("class", "domain")
        .attr("stroke", "currentColor")
        .attr("x1", x0).attr("y1", y0).attr("x2", x1).attr("y2", y1);

    // the labels on the left of the line, below it if it is horizontal
    const ticks = g.selectAll("g.tick")
        .data(values)
        .join("g")
        .attr("class", "tick");
    ticks.append("text")
        .attr("fill", "currentColor")
        .attr("stroke", "white")
        .attr("stroke-width", 3)
        .attr("paint-order", "stroke")
        .attr("text-anchor", Math.abs(Math.cos(a)) > 0.5 ? "end" : "middle")
        .attr("dominant-baseline", Math.abs(Math.cos(a)) > 0.5 ? "middle" : "hanging")
        .each(function(v) {
            const [x, y] = d3.pointRadial(a, s(v));
            const horizontal = Math.abs(Math.cos(a)) <= 0.5;
            d3.select(this)
                .attr("x", x - (horizontal ? 0 : axis.padding))
                .attr("y", y + (horizontal ? axis.padding : 0));
        })
        .text(format);

    if (axis.title) {
        const [x, y] = d3.pointRadial(a, r1 + axis.title.offset);
        ctx.inner.append("text")
            .attr("class", "axis-title")
            .attr("x", x)
            .attr("y", y)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .text(axis.title.name);
    }
};

const axes = ctx => {
    const { store } = ctx;
    store.mappingNamesWithKey('axis').forEach(n => {
        const m = store.mapping(n);
        const i = m.axis;
        const s = ctx.info[n].scale;
        const ticks = entryToValue(i.ticks, ctx.relativeBases);
        const format = tickFormat(store, m, s, ticks) ?? (v => v);

        const g = ctx.inner.append("g")
            .attr("class", `axis-name-${n} axis-position-${i.position}`)
            .attr("font-size", 10)
            .attr("font-family", "sans-serif");
        const draw = { angular: angularAxis, radial: radialAxis }[i.position];
        draw(ctx, g, s, tickValues(i, s, ticks), format, i);
    });
};

// a sector or a ring (band), a spoke or a circle (line), a text or a circle at
// values of the angle and the radius, without a value of the angle around the
// whole circle, without one of the radius from its inner to its outer radius
const annotate = (ctx, g, a) => {
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
        const arc = d3.arc().innerRadius(r0).outerRadius(r1).startAngle(a0).endAngle(a1);
        setAnnotationProps(g.append("path").attr("class", "annotation band").attr("d", arc()), a, ctx, { fill: "#EEE" });
        const [x, y] = arc.centroid();
        drawLabel(g, a, x, y, "middle", "middle");
    } else if (a.type == 'line') {
        if (angle) {
            const p = position(angle);
            const [x1, y1] = d3.pointRadial(p, inner);
            const [x2, y2] = d3.pointRadial(p, outer);
            setAnnotationProps(g.append("line").attr("class", "annotation line")
                .attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2), a, ctx, { stroke: "#999" });
            drawLabel(g, a, x2, y2 - 4, "middle", "auto");
        } else {
            const r = radius ? position(radius) : outer;
            setAnnotationProps(g.append("circle").attr("class", "annotation line").attr("r", r), a, ctx, { stroke: "#999", fill: "none" });
            drawLabel(g, a, 4, -r - 4, "start", "auto");
        }
    } else if (a.type == 'text' || a.type == 'circle') {
        const [x, y] = d3.pointRadial(angle ? position(angle) : 0, radius ? position(radius) : outer);
        if (a.type == 'text')
            setAnnotationProps(g.append("text").attr("class", "annotation text").attr("x", x).attr("y", y), a, ctx, { "font-size": 11, fill: "#444" });
        else
            setAnnotationProps(g.append("circle").attr("class", "annotation circle").attr("cx", x).attr("cy", y), a, ctx, { r: 4, fill: "#666" });
    }
};

// the plot area is a circle in the center of the facet, the angle (clockwise
// from the top) and the radius are the positions
export default {
    ranges: { angular: [0, tau], radial: [0, "@radius"] },
    cyclic: ['angular'],
    axis: { h: 'angular', v: 'radial' },
    positions: ['angular', 'radial'],
    dims: (width, height) => ({ width, height, radius: Math.min(width, height)/2 }),
    origin: (width, height) => [width/2, height/2],
    axes,
    annotations: ['band', 'line', 'text', 'circle'],
    annotate,
    // the labels of the radial axes are in the plot area, they are above the plots
    raise: ctx => ctx.inner.selectAll(".axis-position-radial").raise(),
    hover: {
        // the whole facet, the angle is also taken outside of the circle
        area: (ctx, parent) => parent.append("rect")
            .attr("x", -ctx.innerWidth/2)
            .attr("y", -ctx.innerHeight/2)
            .attr("width", ctx.innerWidth)
            .attr("height", ctx.innerHeight),

        // the nearest angle with data, also across the top, and the radius
        locate(ctx, [px, py], names) {
            const s = ctx.info[names.h].scale;
            const a = (Math.atan2(px, -py) + tau) % tau;
            const keys = [a - tau, a, a + tau].map(v => s.invertCustom(v)).filter(k => k !== undefined);
            if (keys.length == 0)
                return null;
            const key = d3.least(keys, k => angleDistance(angleOf(s, k), a));
            return { key, value: ctx.info[names.v].scale.invert?.(Math.hypot(px, py)) };
        },

        // a line from the center, the hover is in the center, on the other
        // side than the line
        marker(ctx, key, names, line) {
            const a = angleOf(ctx.info[names.h].scale, key);
            const [r0, r1] = radiusRange(ctx);
            const [x1, y1] = d3.pointRadial(a, r0);
            const [x2, y2] = d3.pointRadial(a, r1);
            line.attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
            return { x: 0, y: 0, side: Math.sin(a) >= 0 ? "left" : "right" };
        },
    },
};
