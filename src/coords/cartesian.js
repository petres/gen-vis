import * as d3 from "d3";
import { entryToValue } from "@/utils/props";
import { bandCenter, capitalize } from "@/utils/scales";
import { tickValues, tickFormat } from "@/coords/ticks";
import { constraints, span, position, drawLabel, setAnnotationProps } from "@/coords/annotations";

// horizontal lines for a vertical axis and vice versa
const grid = (ctx, s, values, vertical) => {
    const offset = bandCenter(s);
    const lines = ctx.inner.append("g")
        .attr("class", "grid")
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
        const s = ctx.info[n].scale;
        const ticks = entryToValue(i.ticks, ctx.relativeBases);

        const a = d3[`axis${capitalize(i.position)}`](s)
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
            .attr("class", `axis-name-${n} axis-position-${i.position}`)
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
                .attr('class', 'axis-title')
                .attr('y', 0)
                .attr('x', 0)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .text(i.title.name)

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
        setAnnotationProps(g.append("rect").attr("class", "annotation band")
            .attr("x", x0).attr("y", y0).attr("width", x1 - x0).attr("height", y1 - y0), a, ctx, { fill: "#EEE" });
        drawLabel(g, a, x0 + 4, y0 + 4);
    } else if (a.type == 'line') {
        // a value of the horizontal axis is a vertical line, of the vertical one a horizontal line
        const line = g.append("line").attr("class", "annotation line");
        if (h) {
            const x = position(h);
            line.attr("x1", x).attr("x2", x).attr("y1", y0).attr("y2", y1);
            drawLabel(g, a, x + 4, y0 + 4);
        } else {
            const y = v ? position(v) : 0;
            line.attr("x1", x0).attr("x2", x1).attr("y1", y).attr("y2", y);
            drawLabel(g, a, x1 - 4, y - 4, "end", "auto");
        }
        setAnnotationProps(line, a, ctx, { stroke: "#999" });
    } else if (a.type == 'text' || a.type == 'circle') {
        const x = h ? position(h) : 0;
        const y = v ? position(v) : 0;
        if (a.type == 'text')
            setAnnotationProps(g.append("text").attr("class", "annotation text").attr("x", x).attr("y", y), a, ctx, { "font-size": 11, fill: "#444" });
        else
            setAnnotationProps(g.append("circle").attr("class", "annotation circle").attr("cx", x).attr("cy", y), a, ctx, { r: 4, fill: "#666" });
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
    hover: {
        area: (ctx, parent) => parent.append("rect")
            .attr("width", ctx.innerWidth)
            .attr("height", ctx.innerHeight),

        // the nearest horizontal value with data and the vertical value at the pointer
        locate(ctx, [px, py], names) {
            const key = ctx.info[names.h].scale.invertCustom(px);
            if (key === undefined)
                return null;
            return { key, value: ctx.info[names.v].scale.invert?.(py) };
        },

        // a vertical line, the hover is beside it, on the side with more space
        marker(ctx, key, names, line) {
            const s = ctx.info[names.h].scale;
            const x = s(key) + bandCenter(s);
            line.attr("x1", x)
                .attr("x2", x)
                .attr("y1", 0)
                .attr("y2", ctx.innerHeight);
            return { x, y: ctx.innerHeight/2, side: x > ctx.innerWidth/2 ? "left" : "right" };
        },
    },
};
