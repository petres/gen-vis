export { drawAxis };

import * as d3 from "@/utils/d3";
import { fitText, motion, setProps } from "@/utils/draw";

/**
 * The ticks of an axis of the positions top, right, bottom or left, as the
 * ones of d3-axis 3.0.0: the domain, a tick per value (a line and a label),
 * the ticks of the draw before move to their new positions in a transition,
 * new ones come from their positions of the draw before, old ones go to their
 * new positions, they appear and disappear. The ticks are the values of the
 * axis of the scene, see axes of coords/cartesian.js, drawn by drawAxis.
 *
 * d3-axis: Copyright 2010-2021 Mike Bostock
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR
 * IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

const epsilon = 1e-6;
const translateX = x => "translate(" + x + ",0)";
const translateY = y => "translate(0," + y + ")";
const number = scale => d => +scale(d);
// the center of a band
const center = (scale, offset) => {
    offset = Math.max(0, scale.bandwidth() - offset * 2) / 2;
    if (scale.round())
        offset = Math.round(offset);
    return d => +scale(d) + offset;
};
function entering() {
    return !this.__axis;
}

// the ticks of the `values` of the `scale` with the labels `format(value)`
// into the element of the axis or its transition (`context`), the sizes of
// the ticks are the ones of `tickSizeInner`, `tickSizeOuter` and `tickPadding`
const ticks = (context, orient, scale, { values, format, tickSizeInner, tickSizeOuter, tickPadding }) => {
    // the lines at half pixels of screens of a pixel per pixel, sharp
    const offset = typeof window !== "undefined" && window.devicePixelRatio > 1 ? 0 : 0.5;
    const k = orient == "top" || orient == "left" ? -1 : 1;
    const x = orient == "left" || orient == "right" ? "x" : "y";
    const transform = orient == "top" || orient == "bottom" ? translateX : translateY;
    const spacing = Math.max(tickSizeInner, 0) + tickPadding;
    const range = scale.range();
    const range0 = +range[0] + offset;
    const range1 = +range[range.length - 1] + offset;
    const position = (scale.bandwidth ? center : number)(scale.copy(), offset);
    const selection = context.selection ? context.selection() : context;
    let path = selection.selectAll(".domain").data([null]);
    let tick = selection.selectAll(".tick").data(values, scale).order();
    let tickExit = tick.exit();
    const tickEnter = tick.enter().append("g").attr("class", "tick");
    let line = tick.select("line");
    let text = tick.select("text");

    path = path.merge(path.enter().insert("path", ".tick")
        .attr("class", "domain")
        .attr("stroke", "currentColor"));

    tick = tick.merge(tickEnter);

    line = line.merge(tickEnter.append("line")
        .attr("stroke", "currentColor")
        .attr(x + "2", k * tickSizeInner));

    text = text.merge(tickEnter.append("text")
        .attr("fill", "currentColor")
        .attr(x, k * spacing)
        .attr("dy", orient == "top" ? "0em" : orient == "bottom" ? "0.71em" : "0.32em"));

    if (context !== selection) {
        path = path.transition(context);
        tick = tick.transition(context);
        line = line.transition(context);
        text = text.transition(context);

        tickExit = tickExit.transition(context)
            .attr("opacity", epsilon)
            .attr("transform", function(d) { return isFinite(d = position(d)) ? transform(d + offset) : this.getAttribute("transform"); });

        tickEnter
            .attr("opacity", epsilon)
            .attr("transform", function(d) { let p = this.parentNode.__axis; return transform((p && isFinite(p = p(d)) ? p : position(d)) + offset); });
    }

    tickExit.remove();

    path
        .attr("d", orient == "left" || orient == "right"
            ? (tickSizeOuter ? "M" + k * tickSizeOuter + "," + range0 + "H" + offset + "V" + range1 + "H" + k * tickSizeOuter : "M" + offset + "," + range0 + "V" + range1)
            : (tickSizeOuter ? "M" + range0 + "," + k * tickSizeOuter + "V" + offset + "H" + range1 + "V" + k * tickSizeOuter : "M" + range0 + "," + offset + "H" + range1));

    tick
        .attr("opacity", 1)
        .attr("transform", function(d) { return transform(position(d) + offset); });

    line
        .attr(x + "2", k * tickSizeInner);

    text
        .attr(x, k * spacing)
        .text(format);

    selection.filter(entering)
        .attr("fill", "none")
        .attr("font-size", 10)
        .attr("font-family", "sans-serif")
        .attr("text-anchor", orient == "right" ? "start" : orient == "left" ? "end" : "middle");

    selection
        .each(function() { this.__axis = position; });
};

/**
 * Draws an axis of the scene into its element `ga`, a d3 selection, kept from
 * one draw to the next, with the transition of the draw (see withMotion of
 * utils/draw.js): the mapping `name`, its `position` (top, right, bottom or
 * left), `scale`, the `values` of the ticks and their labels
 * (`format(value)`), the props of the labels (`labels(value)`, e.g. their
 * font weight or a `max-width`), the `padding` of the labels, their angle
 * (`rotate`, degrees, positive ones counterclockwise), the props of the
 * line of the axis (`domain`, e.g. its stroke-opacity) and the size of the
 * plot area (`width`, `height`).
 */
const drawAxis = (ga, { name, position, scale, values, format, labels, padding, rotate, domain, width, height }) => {
    ga.attr("class", `vis-axis vis-axis-${position}`)
        .attr("data-mapping", name);
    // the transitions are loaded for definitions with a transition, see loadTransition
    if (d3.hasTransitions(ga))
        ga.interrupt('vis').selectAll('*').interrupt('vis');
    // the ticks of the draw before move with a transition
    const moving = motion.duration > 0 && ga.node().hasChildNodes() && d3.hasTransitions(ga);
    const drawn = moving ? ga.transition('vis').duration(motion.duration) : ga;
    ticks(drawn, position, scale, { values, format, tickSizeInner: 9, tickSizeOuter: 0, tickPadding: +padding });
    // the props of the line at once, its path moves with the transition
    if (domain)
        Object.entries(domain).filter(([, v]) => v === null || (typeof v != 'object' && typeof v != 'function'))
            .forEach(([k, v]) => ga.select('.domain').attr(k, v));
    if (labels) {
        const texts = ga.selectAll('.tick text');
        texts.each(function(d) { setProps.call(this, labels(d)) });
        // texts in a width, at once or at the end of the transition of their texts
        const fit = () => texts.filter(function() { return this.hasAttribute('max-width') }).each(function() { fitText(this) });
        if (moving)
            drawn.on('end.labels', fit);
        else
            fit();
    }

    if (position == 'bottom')
        ga.attr('transform', `translate(0, ${height})`);
    if (position == 'right')
        ga.attr('transform', `translate(${width}, 0)`);

    // positive angles rotate counterclockwise, negative ones
    // clockwise, the labels start at their tick in both cases
    if (rotate)
        ga.selectAll("text")
            .attr("text-anchor", rotate > 0 ? "end" : "start")
            .attr("transform", `rotate(${-rotate})`);
};
