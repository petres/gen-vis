export { drawAxis };

import { animate, create, interrupt, itemOf, join, onEnd, setAttr } from "@/utils/dom";
import { fitText, motion, setAttrs } from "@/utils/draw";

/**
 * The ticks of an axis of the positions top, right, bottom or left, as the
 * ones of d3-axis 3.0.0: the domain, a tick per value (a line and a label),
 * the ticks of the draw before move to their new positions with the
 * animations of utils/dom.js, new ones come from their positions of the draw
 * before, old ones go to their new positions, they appear and disappear. The
 * ticks are the values of the axis of the scene, see axes of
 * coords/cartesian.js, drawn by drawAxis.
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

// the positions of the ticks of the draw before of the element of an axis
// (a function of a value), new ticks come from them, d3-axis has them as
// `__axis`; an element without one is a new axis
const positionOf = Symbol('axis');

// the attributes of an element, with the animation of the draw or at once
const change = (node, attrs, moving) => {
    if (moving)
        animate(node, attrs, { channel: 'vis', duration: motion.duration });
    else
        Object.entries(attrs).forEach(([name, value]) => setAttr(node, name, value));
};

// the ticks of the `values` of the `scale` with the labels `format(value)`
// into the element of the axis `ga`, `moving` with the animation of the
// draw, the sizes of the ticks are the ones of `tickSizeInner`,
// `tickSizeOuter` and `tickPadding`
const ticks = (ga, moving, orient, scale, { values, format, tickSizeInner, tickSizeOuter, tickPadding }) => {
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
    const before = ga[positionOf];

    // the line of the axis, before the ticks
    let path = [...ga.children].find(node => node.matches(".domain"));
    if (!path) {
        path = create("path");
        setAttr(path, "class", "domain");
        setAttr(path, "stroke", "currentColor");
        ga.insertBefore(path, [...ga.children].find(node => node.matches(".tick")) ?? null);
    }

    // a tick per value, the one of the same position on the new scale as
    // one of the draw before is the same, the key of d3-axis
    const entered = new Set();
    const tick = join(ga, values, {
        select: ".tick",
        key: d => String(scale(d)),
        create: () => {
            const g = create("g");
            setAttr(g, "class", "tick");
            const line = g.appendChild(create("line"));
            setAttr(line, "stroke", "currentColor");
            setAttr(line, x + "2", k * tickSizeInner);
            const text = g.appendChild(create("text"));
            setAttr(text, "fill", "currentColor");
            setAttr(text, x, k * spacing);
            setAttr(text, "dy", orient == "top" ? "0em" : orient == "bottom" ? "0.71em" : "0.32em");
            entered.add(g);
            return g;
        },
        // the old ticks go to their new positions and disappear, removed at
        // the end of their animation, without one at once
        exit: node => {
            if (!moving)
                return false;
            const p = position(node[itemOf]);
            animate(node, { opacity: epsilon, transform: isFinite(p) ? transform(p + offset) : node.getAttribute("transform") },
                { channel: 'vis', duration: motion.duration, remove: true });
            return true;
        },
    });

    // the new ticks come from their positions of the draw before
    if (moving)
        entered.forEach(node => {
            const p = before && before(node[itemOf]);
            setAttr(node, "opacity", epsilon);
            setAttr(node, "transform", transform((before && isFinite(p) ? p : position(node[itemOf])) + offset));
        });

    change(path, {
        d: orient == "left" || orient == "right"
            ? (tickSizeOuter ? "M" + k * tickSizeOuter + "," + range0 + "H" + offset + "V" + range1 + "H" + k * tickSizeOuter : "M" + offset + "," + range0 + "V" + range1)
            : (tickSizeOuter ? "M" + range0 + "," + k * tickSizeOuter + "V" + offset + "H" + range1 + "V" + k * tickSizeOuter : "M" + range0 + "," + offset + "H" + range1),
    }, moving);

    tick.forEach(node => {
        const d = node[itemOf];
        change(node, { opacity: 1, transform: transform(position(d) + offset) }, moving);
        const line = node.querySelector("line");
        if (line)
            change(line, { [x + "2"]: k * tickSizeInner }, moving);
        const text = node.querySelector("text");
        if (text) {
            change(text, { [x]: k * spacing }, moving);
            const label = format(d);
            text.textContent = label === null || label === undefined ? "" : label;
        }
    });

    if (!before) {
        setAttr(ga, "fill", "none");
        setAttr(ga, "font-size", 10);
        setAttr(ga, "font-family", "sans-serif");
        setAttr(ga, "text-anchor", orient == "right" ? "start" : orient == "left" ? "end" : "middle");
    }

    ga[positionOf] = position;
};

/**
 * Draws an axis of the scene into its element `ga` (an element, or a d3
 * selection of one), kept from one draw to the next, with the animation of
 * the draw (see withMotion of utils/draw.js): the mapping `name`, its
 * `position` (top, right, bottom or left), `scale`, the `values` of the
 * ticks and their labels (`format(value)`), the props of the labels
 * (`labels(value)`, e.g. their font weight or a `max-width`), the `padding`
 * of the labels, their angle (`rotate`, degrees, positive ones
 * counterclockwise), the props of the line of the axis (`domain`, e.g. its
 * stroke-opacity), the tick marks (`marks`, false without them, their
 * `size`, 9 pixels across the line of the axis by default, the labels are
 * moved by it, and their `props`) and the size of the plot area (`width`,
 * `height`).
 */
const drawAxis = (ga, { name, position, scale, values, format, labels, padding, rotate, domain, marks, width, height }) => {
    setAttr(ga, "class", `vis-axis vis-axis-${position}`);
    setAttr(ga, "data-mapping", name);
    // the animations of the draw before stop where they are, the ticks
    // which disappear are removed
    interrupt(ga, 'vis');
    ga.querySelectorAll('*').forEach(node => interrupt(node, 'vis'));
    // the ticks of the draw before move with an animation
    const moving = motion.duration > 0 && ga.hasChildNodes();
    ticks(ga, moving, position, scale, { values, format, tickSizeInner: marks?.size ?? 9, tickSizeOuter: 0, tickPadding: +padding });
    // the props of the line and of the labels at once, the animations of
    // the path and of the texts (their positions) go on
    if (domain)
        ga.querySelectorAll('.domain').forEach(node => setAttrs(node, domain));
    // without tick marks the labels are at their places of marks
    if (marks === false)
        ga.querySelectorAll('.tick line').forEach(node => node.remove());
    else if (marks?.props)
        ga.querySelectorAll('.tick line').forEach(node => setAttrs(node, marks.props));
    if (labels) {
        const texts = [...ga.querySelectorAll('.tick text')];
        texts.forEach(node => setAttrs(node, labels(node.parentNode[itemOf])));
        // texts in a width, at once or at the end of the animation of the
        // draw, the one of the element of the axis, without attributes, as
        // the transition of the axis of d3-axis
        const fit = () => texts.filter(node => node.hasAttribute('max-width')).forEach(node => fitText(node));
        if (moving) {
            animate(ga, {}, { channel: 'vis', duration: motion.duration });
            onEnd(ga, 'vis', fit);
        } else
            fit();
    }

    if (position == 'bottom')
        setAttr(ga, 'transform', `translate(0, ${height})`);
    if (position == 'right')
        setAttr(ga, 'transform', `translate(${width}, 0)`);

    // positive angles rotate counterclockwise, negative ones
    // clockwise, the labels start at their tick in both cases
    if (rotate)
        ga.querySelectorAll("text").forEach(node => {
            setAttr(node, "text-anchor", rotate > 0 ? "end" : "start");
            setAttr(node, "transform", `rotate(${-rotate})`);
        });
};
