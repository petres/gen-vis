import * as d3 from "d3";
import * as pu from "@/utils/plot";
import * as ju from "@/utils/json";
import * as eu from "@/utils/else";

// horizontal lines for a vertical axis and vice versa
const grid = (ctx, s, values, vertical) => {
    const offset = pu.bandCenter(s);
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
        const ticks = ju.entryToValue(i.ticks, ctx.relativeBases);

        const a = d3[`axis${eu.capitalize(i.position)}`](s)
            .tickSizeInner(9)
            .tickSizeOuter(0)
            .ticks(ticks)
            .tickPadding(i.padding)

        if (i.format) {
            a.tickFormat(store.formatter(m.scale.type)(i.format))
        } else if (!i.values) {
            const format = store.locale.tickFormat(s, m.scale.type, ticks);
            if (format)
                a.tickFormat(format);
        }

        if (i.values) {
            a.tickValues(i.values)
        }

        // the grid lines are at the ticks of the axis
        if (i.grid) {
            const values = i.values ?? (s.ticks ? s.ticks(ticks) : s.domain());
            grid(ctx, s, values, ['left', 'right'].includes(i.position));
        }

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

// the plot area of the facet with a horizontal and a vertical axis
export default {
    ranges: { horizontal: [0, "@width"], vertical: ["@height", 0] },
    axis: { h: 'horizontal', v: 'vertical' },
    positions: ['top', 'bottom', 'left', 'right'],
    dims: (width, height) => ({ width, height }),
    axes,
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
            const x = s(key) + pu.bandCenter(s);
            line.attr("x1", x)
                .attr("x2", x)
                .attr("y1", 0)
                .attr("y2", ctx.innerHeight);
            return { x, y: ctx.innerHeight/2, side: x > ctx.innerWidth/2 ? "left" : "right" };
        },
    },
};
