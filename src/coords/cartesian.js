import * as d3 from "@/utils/d3";
import { bandCenter } from "@/utils/scales";
import { tickValues, tickFormat, tickCount } from "@/coords/ticks";
import { constraints, span, position, drawLabel, setAnnotationProps } from "@/coords/annotations";

// the positions of the hover are vertical, e.g. of horizontal bars
const isVertical = (ctx, names) => ctx.store.mapping(names.h).scale?.orientation == 'vertical';

// horizontal lines for a vertical axis and vice versa
const grid = (ctx, s, values, vertical) => {
    const offset = bandCenter(s);
    const lines = ctx.inner.append("g")
        .attr("class", "vis-grid")
        .selectAll('line')
        .data(values)
        .enter()
        .append("line")

    if (vertical) {
        lines.attr('x1', 0)
            .attr('x2', ctx.innerWidth)
            .attr('y1', d => s(d) + offset)
            .attr('y2', d => s(d) + offset)
    } else {
        lines.attr('y1', 0)
            .attr('y2', ctx.innerHeight)
            .attr('x1', d => s(d) + offset)
            .attr('x2', d => s(d) + offset)
    }
};

const axes = ctx => {
    const { store, inner, innerWidth, innerHeight } = ctx;
    store.mappingNamesWithKey('axis').forEach(n => {
        const m = store.mapping(n);
        const i = m.axis;
        const s = ctx.scales[n];
        const ticks = tickCount(i, ctx.scope, Math.abs(s.range()[1] - s.range()[0]));

        const a = d3.axes[i.position](s)
            .tickSizeInner(9)
            .tickSizeOuter(0)
            .ticks(ticks)
            .tickPadding(i.padding)

        const format = tickFormat(store, m, s, ticks);
        if (format)
            a.tickFormat(format);

        if (i.values) {
            a.tickValues(tickValues(i, s, ticks))
        }

        // the grid lines are at the ticks of the axis
        if (i.grid)
            grid(ctx, s, tickValues(i, s, ticks), ['left', 'right'].includes(i.position));

        const ga = inner.append("g")
            .attr("class", `vis-axis vis-axis-${i.position}`)
            .attr("data-mapping", n)
            .call(a)

        if (i.position == 'bottom')
            ga.attr('transform', `translate(0, ${innerHeight})`)
        if (i.position == 'right')
            ga.attr('transform', `translate(${innerWidth}, 0)`)

        // positive angles rotate counterclockwise, negative ones
        // clockwise, the labels start at their tick in both cases
        if (i.rotate)
            ga.selectAll("text")
                .attr("text-anchor", i.rotate > 0 ? "end" : "start")
                .attr("transform", `rotate(${-i.rotate})`)

        if (i.title) {
            const at = inner.append("text")
                .attr('class', 'vis-axis-title')
                .attr('y', 0)
                .attr('x', 0)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .text(ctx.store.text(i.title.name))

            if (i.position == 'left')
                at.attr("transform", `rotate(-90) translate(-${innerHeight/2} -${i.title.offset})`)

            if (i.position == 'right')
                at.attr("transform", `rotate(90) translate(${innerHeight/2} -${innerWidth + i.title.offset})`)

            if (i.position == 'top')
                at.attr("transform", `translate(${innerWidth/2} -${i.title.offset})`)

            if (i.position == 'bottom')
                at.attr("transform", `translate(${innerWidth/2} ${innerHeight + i.title.offset})`)
        }
    });
};

// a band, a line, a text or a circle at values of the mappings of the axes,
// without a value of an axis over the whole plot area, e.g. a band of the
// horizontal axis has the height of the plot area
const annotate = (ctx, g, a) => {
    const c = constraints(ctx, a);
    const h = c.find(e => e.orientation == 'horizontal');
    const v = c.find(e => e.orientation == 'vertical');
    const [x0, x1] = h ? span(h) : [0, ctx.innerWidth];
    const [y0, y1] = v ? span(v) : [0, ctx.innerHeight];

    if (a.type == 'band') {
        setAnnotationProps(g.append("rect").attr("class", "vis-annotation vis-band")
            .attr("x", x0).attr("y", y0).attr("width", x1 - x0).attr("height", y1 - y0), a, ctx);
        drawLabel(g, a, x0 + 4, y0 + 4);
    } else if (a.type == 'line') {
        // a value of the horizontal axis is a vertical line, of the vertical one a horizontal line
        const line = g.append("line").attr("class", "vis-annotation vis-line");
        if (h) {
            const x = position(h);
            line.attr("x1", x).attr("x2", x).attr("y1", y0).attr("y2", y1);
            drawLabel(g, a, x + 4, y0 + 4);
        } else {
            const y = v ? position(v) : 0;
            line.attr("x1", x0).attr("x2", x1).attr("y1", y).attr("y2", y);
            drawLabel(g, a, x1 - 4, y - 4, "end", "auto");
        }
        setAnnotationProps(line, a, ctx);
    } else if (a.type == 'text' || a.type == 'circle') {
        const x = h ? position(h) : 0;
        const y = v ? position(v) : 0;
        if (a.type == 'text')
            setAnnotationProps(g.append("text").attr("class", "vis-annotation vis-text").attr("x", x).attr("y", y), a, ctx, { "font-size": 11 });
        else
            setAnnotationProps(g.append("circle").attr("class", "vis-annotation vis-circle").attr("cx", x).attr("cy", y), a, ctx, { r: 4 });
    }
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
    // the positions can be the vertical ones, e.g. of horizontal bars, see axisNames of layout.js
    flip: true,
    hover: {
        area: (ctx, parent) => parent.append("rect")
            .attr("width", ctx.innerWidth)
            .attr("height", ctx.innerHeight),

        // the nearest position with data, e.g. horizontal, and the value at
        // the pointer, e.g. vertical
        locate(ctx, [px, py], names) {
            const vertical = isVertical(ctx, names);
            const key = ctx.scales[names.h].nearest(vertical ? py : px);
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
                line.attr("x1", 0).attr("x2", ctx.innerWidth).attr("y1", p).attr("y2", p);
                return { x: ctx.innerWidth/2, y: p, side: p > ctx.innerHeight/2 ? "above" : "below" };
            }
            line.attr("x1", p)
                .attr("x2", p)
                .attr("y1", 0)
                .attr("y2", ctx.innerHeight);
            return { x: p, y: ctx.innerHeight/2, side: p > ctx.innerWidth/2 ? "left" : "right" };
        },
    },
};
