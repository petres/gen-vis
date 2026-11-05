import * as d3 from "@/utils/d3";
import { bandCenter } from "@/utils/scales";
import { keyOf } from "@/utils/draw";
import { tickValues, tickFormat, tickCount, labelProps, domainProps, tickMarks } from "@/coords/ticks";
import { constraints, span, position, annotationItem, labelItems } from "@/coords/annotations";
import { rect, placeLine } from "@/coords/hover";
import { pixelOffset, tickPosition } from "@/utils/axis";
import { convert } from "@/utils/data";
import { evaluate } from "@/utils/expr";

// the mapping of the other orientation, e.g. y of an axis of x, the one of
// the positions or the values of the facet first
const otherMapping = (ctx, n) => {
    const other = ctx.store.mapping(n).scale?.orientation == 'horizontal' ? 'vertical' : 'horizontal';
    const of = k => k !== undefined && ctx.scales[k] && ctx.store.mapping(k).scale?.orientation == other;
    return [ctx.axis?.h, ctx.axis?.v].find(of) ?? Object.keys(ctx.scales).find(of);
};

// the value of `at` of an axis as a value of the other mapping, e.g. a date,
// undefined without one
const atValue = (ctx, n, at) => {
    const o = otherMapping(ctx, n);
    const v = at === undefined || o === undefined ? null : evaluate(at, ctx.scope);
    return v === null || v === undefined ? undefined : { name: o, value: convert(ctx.store.mapping(o), v, ctx.store.def.mapping) };
};

// the position of the line of an axis at a value of the other axis
// (`at`), e.g. 0 of y of an axis of x: the one of the tick of the value
// without the half pixel of the line (see tickPosition), null at its edge,
// also of a value outside of the domain or without a position, e.g. 0 of
// a log scale
const crossing = (ctx, n, at) => {
    const a = atValue(ctx, n, at);
    if (!a)
        return null;
    const s = ctx.scales[a.name];
    const inside = s.step ? s.domain().some(d => String(d) == String(a.value))
        : (([lo, hi]) => +a.value >= +lo && +a.value <= +hi)(d3.extent(s.domain(), d => +d));
    const p = inside ? tickPosition(s)(a.value) - pixelOffset() : NaN;
    return Number.isFinite(p) ? p : null;
};

// the positions of the hover are vertical, e.g. of horizontal bars
const isVertical = (ctx, names) => ctx.store.mapping(names.h).scale?.orientation == 'vertical';

// horizontal lines for a vertical axis and vice versa, the part of the
// axes, the lines of the draw before are moved, e.g. with a transition
const grid = (ctx, n, s, values, vertical) => {
    const offset = bandCenter(s);
    return {
        key: `grid ${n}`,
        element: "g",
        attrs: { class: "vis-grid" },
        layer: {
            element: "line",
            key: item => item[keyOf],
            items: values.map(d => {
                const p = s(d) + offset;
                return {
                    ...(vertical ? { x1: 0, x2: ctx.innerWidth, y1: p, y2: p } : { y1: 0, y2: ctx.innerHeight, x1: p, x2: p }),
                    [keyOf]: String(+d === +d ? +d : d),
                };
            }),
        },
    };
};

// the parts of the axes of the mappings with an axis (see `axes` of
// coords/index.js): the grid lines, the axis, its ticks are its values and
// their labels (see drawAxis of utils/axis.js), and its title
const axes = ctx => {
    const { store, innerWidth, innerHeight } = ctx;
    return store.mappingNamesWithKey('axis').flatMap(n => {
        const m = store.mapping(n);
        const i = m.axis;
        const s = ctx.scales[n];
        const ticks = tickCount(i, ctx.scope, Math.abs(s.range()[1] - s.range()[0]));

        // the format of the labels, the one of d3 of the scale for fixed
        // values without a format
        let format = tickFormat(store, n, s, ticks) || (s.tickFormat ? s.tickFormat(ticks) : d => d);
        // the props of the labels, e.g. their texts, see labelProps
        const labelsOf = labelProps(ctx, n, i.labels);
        if (labelsOf && 'text' in i.labels.props)
            format = d => {
                const text = labelsOf(d).text;
                return text === null || text === undefined ? '' : String(text);
            };

        // the line at a value of the other axis (`at`), the labels at the
        // edge (by default) or with it (`"labels": { "at": "axis" }`), then
        // without the label where the line of the other axis crosses it
        const cross = crossing(ctx, n, i.at);
        const edge = { bottom: innerHeight, right: innerWidth }[i.position] ?? 0;
        const withLine = i.labels?.at == 'axis';
        const other = otherMapping(ctx, n);
        const crossed = withLine && other !== undefined && store.mapping(other).axis && crossing(ctx, other, store.mapping(other).axis.at) !== null
            ? atValue(ctx, other, store.mapping(other).axis.at) : undefined;
        if (crossed?.name == n) {
            const shown = format;
            format = d => String(+d === +d ? +d : d) == String(+crossed.value === +crossed.value ? +crossed.value : crossed.value) ? '' : shown(d);
        }

        // the values without ones of the axis, see utils/defaults.js
        const d = store.axisDefaults(i.position);
        const parts = [];
        // the grid lines are at the ticks of the axis
        if (i.grid)
            parts.push(grid(ctx, n, s, tickValues(i, s, ticks, m, ctx.scope, ctx.store.def.mapping), ['left', 'right'].includes(i.position)));

        // the axis of the draw before, its ticks are moved with a transition
        parts.push({
            key: `axis ${n}`,
            axis: {
                name: n,
                position: i.position,
                scale: s,
                values: i.values ? tickValues(i, s, ticks, m, ctx.scope, ctx.store.def.mapping) : (s.ticks ? s.ticks(ticks) : s.domain()),
                format,
                labels: labelsOf && (d => {
                    const { text, ...attrs } = labelsOf(d);
                    return attrs;
                }),
                padding: i.padding ?? d.padding,
                rotate: i.rotate,
                domain: domainProps(ctx, i),
                marks: tickMarks(ctx, i, d.tickMarks),
                markSize: d.tickMarks?.size,
                width: innerWidth,
                height: innerHeight,
                at: cross,
                labelShift: cross === null || withLine ? 0 : edge - cross,
            },
        });

        // the titles only at the outer facets (`facets.axisTitles`), e.g.
        // the one of the bottom axis in the bottom row
        if (i.title && (store.def.facets?.axisTitles != 'outer' || ctx.outer?.[i.position] !== false)) {
            // the distance of the title from the axis, by default near the
            // edge of the margin, e.g. outside of the labels of the ticks
            const offset = i.title.offset ?? d.title?.offset ?? Math.max(0, ctx.margins[i.position] - 8);
            // the middle of the range of the scale, e.g. of a scale of the
            // upper part of the plot area
            const [lo, hi] = d3.extent(s.range());
            const middle = (lo + hi)/2;
            const vertical = ['left', 'right'].includes(i.position);
            // a title of a vertical axis at the top: horizontal, above the
            // range of the scale, starting at the distance of the title from
            // the axis, e.g. the unit at the top left
            const top = vertical && i.title.position == 'top';
            const transform = top ? `translate(${i.position == 'left' ? -offset : innerWidth + offset} ${lo - (i.title.gap ?? 8)})` : {
                left: `rotate(-90) translate(-${middle} -${offset})`,
                right: `rotate(90) translate(${middle} -${innerWidth + offset})`,
                top: `translate(${middle} -${offset})`,
                bottom: `translate(${middle} ${innerHeight + offset})`,
            }[i.position];
            parts.push({
                key: `axis title ${n}`,
                element: "text",
                attrs: { class: `vis-axis-title${top ? ' vis-axis-title-top' : ''}`, y: 0, x: 0,
                    "text-anchor": top ? (i.position == 'left' ? 'start' : 'end') : "middle", "dominant-baseline": top ? "auto" : "middle", ...(transform ? { transform } : {}) },
                text: ctx.store.text(i.title.name),
            });
        }
        return parts;
    });
};

// a band, a line, a text or a circle at values of the mappings of the axes,
// without a value of an axis over the whole plot area, e.g. a band of the
// horizontal axis has the height of the plot area, the items of a layer
const annotate = (ctx, a) => {
    const c = constraints(ctx, a);
    const h = c.find(e => e.orientation == 'horizontal');
    const v = c.find(e => e.orientation == 'vertical');
    const [x0, x1] = h ? span(h) : [0, ctx.innerWidth];
    const [y0, y1] = v ? span(v) : [0, ctx.innerHeight];

    if (a.type == 'band')
        return [
            annotationItem("rect", { class: "vis-annotation vis-band", x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, a, ctx),
            ...labelItems(a, x0 + 4, y0 + 4),
        ];
    if (a.type == 'line') {
        // a value of the horizontal axis is a vertical line, of the vertical
        // one a horizontal line, at the position of the tick of the value
        // (a half pixel, see utils/axis.js), so it is sharp and on the tick,
        // the label at the position of the value, of a range at its center
        const at = c => Array.isArray(c.value) ? position(c) + pixelOffset() : tickPosition(c.scale)(c.value);
        if (h) {
            const x = at(h);
            return [
                annotationItem("line", { class: "vis-annotation vis-line", x1: x, x2: x, y1: y0, y2: y1 }, a, ctx),
                ...labelItems(a, position(h) + 4, y0 + 4),
            ];
        }
        const y = v ? at(v) : pixelOffset();
        return [
            annotationItem("line", { class: "vis-annotation vis-line", x1: x0, x2: x1, y1: y, y2: y }, a, ctx),
            ...labelItems(a, x1 - 4, (v ? position(v) : 0) - 4, "end", "auto"),
        ];
    }
    const x = h ? position(h) : 0;
    const y = v ? position(v) : 0;
    if (a.type == 'text')
        return [annotationItem("text", { class: "vis-annotation vis-text", x, y }, a, ctx, { "font-size": 11 })];
    if (a.type == 'circle')
        return [annotationItem("circle", { class: "vis-annotation vis-circle", cx: x, cy: y }, a, ctx, { r: 4 })];
    return [];
};

// the plot area of the facet with a horizontal and a vertical axis
export default {
    ranges: { horizontal: [0, "@width"], vertical: ["@height", 0] },
    axis: { h: 'horizontal', v: 'vertical' },
    positions: ['top', 'bottom', 'left', 'right'],
    dims: (width, height) => ({ width, height }),
    axes,
    annotations: ['band', 'line', 'text', 'circle'],
    annotate,
    // an axis at a value of the other axis (`at`) crosses the plots, it is
    // above them, e.g. the line at 0 of bars of negative values
    raise: ctx => ctx.inner.querySelectorAll(".vis-axis-at").forEach(node => {
        if (node.nextSibling)
            node.parentNode.appendChild(node);
    }),
    // the positions can be the vertical ones, e.g. of horizontal bars, see axisNames of layout.js
    flip: true,
    hover: {
        area: (ctx, parent) => parent.appendChild(rect(ctx.innerWidth, ctx.innerHeight)),

        // the nearest position with data, e.g. horizontal, of the hover the
        // one with rows (`ctx.nearest`, see comp/facet.js), and the value at the
        // pointer, e.g. vertical
        locate(ctx, [px, py], names) {
            const vertical = isVertical(ctx, names);
            const key = (ctx.nearest ?? ctx.scales[names.h].nearest)(vertical ? py : px);
            if (key === undefined)
                return null;
            return { key, value: ctx.scales[names.v].invert?.(vertical ? px : py) };
        },

        // the position of the point of a row, of the hover of the nearest
        // point, stacked values at the middle of their stack
        point(ctx, row, names) {
            const [h, v] = [ctx.scales[names.h], ctx.scales[names.v]];
            const value = ctx.stackOf ? d3.mean(ctx.stackOf(row)) : row[names.v];
            const p = [h(row[names.h]) + bandCenter(h), v(value) + bandCenter(v)];
            return isVertical(ctx, names) ? [p[1], p[0]] : p;
        },

        // a vertical line, the hover is beside it, on the side with more
        // space, of vertical positions a horizontal line, the hover above or
        // below it
        marker(ctx, key, names, line) {
            const s = ctx.scales[names.h];
            const p = s(key) + bandCenter(s);
            if (isVertical(ctx, names)) {
                placeLine(line, 0, p, ctx.innerWidth, p);
                return { x: ctx.innerWidth/2, y: p, side: p > ctx.innerHeight/2 ? "above" : "below" };
            }
            placeLine(line, p, 0, p, ctx.innerHeight);
            return { x: p, y: ctx.innerHeight/2, side: p > ctx.innerWidth/2 ? "left" : "right" };
        },
    },
};
