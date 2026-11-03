export default createColorLegend;

import * as d3 from "@/utils/d3";
import { formatOf } from "@/utils/def";
import { evaluate } from "@/utils/props";
import { create, setAttr } from "@/utils/dom";
import { el, patch, setText } from "@/comp/html";

// the gradients of the legends of a page have their own ids
let count = 0;

// the space before and after the scale
const padding = 16;

// a new svg element `tag` at the end of `parent`, with the attributes `attrs`
// and the text `text`
const append = (parent, tag, attrs = {}, text) => {
    const node = parent.appendChild(create(tag));
    for (const k in attrs)
        setAttr(node, k, attrs[k]);
    if (text !== undefined)
        node.textContent = text ?? '';
    return node;
};

// a scale of colors whose positions are linear in the values, e.g. not a sqrt,
// log or a diverging one with a middle which is not in the center
const isLinear = s => {
    const d = s.domain();
    const t = s.copy().interpolator(t => t);
    return d.length == 2 && Math.abs(t((d[0] + d[1])/2) - 0.5) < 1e-9;
};

// ticks of 1, 2 and 5 (and 0) of the decades of the domain with at least
// `space` pixels between them, e.g. 0, 2%, 10%, 20%, 50%, 100% of a sqrt scale,
// as ticks of a linear scale crowd at one end, the middle of a diverging domain
// and 0 first, then the powers of 10, the 5s and the 2s
const spacedTicks = (domain, position, space) => {
    const [lo, hi] = d3.extent(domain);
    const top = Math.ceil(Math.log10(Math.max(Math.abs(lo), Math.abs(hi)) || 1));
    const decades = d3.range(top, top - 7, -1);
    const steps = [1, 5, 2].flatMap(m => decades.map(e => +(m*10**e).toPrecision(12))).flatMap(v => [v, -v]);
    const ticks = [];
    [...(domain.length == 3 ? [domain[1]] : []), 0, ...steps]
        .filter(v => v >= lo && v <= hi && Number.isFinite(position(v)))
        .forEach(v => {
            if (ticks.every(t => Math.abs(position(v) - position(t)) >= space))
                ticks.push(v);
        });
    return ticks.sort((a, b) => position(a) - position(b));
};

// the digits of the smallest tick, e.g. 0,02 and 0,1, without trailing zeros
const fixedFormat = (locale, ticks) => {
    const small = d3.min(ticks.filter(v => v != 0).map(Math.abs));
    return locale.number.format(`,.${small ? d3.precisionFixed(small) : 0}~f`);
};

/**
 * The legend of the colors of a scale without orientation of the mapping
 * `legend`, a gradient of a continuous scale, the classes of a threshold,
 * quantize or quantile scale, `update(scale)` draws the scale of the plots,
 * the one of all facets, see layout.js. Loaded with the definitions which
 * have one, see utils/lazy.js.
 */
function createColorLegend(vis, legend) {
    const { store } = vis;
    const uid = `gen-vis-gradient-${count++}`;
    const root = el('div', { class: 'vis-legend vis-color-legend', 'data-dim': legend });
    const title = root.appendChild(el('div', { class: 'vis-legend-title' }));
    // the entry of the missing values below a vertical scale
    const scaleBox = root.appendChild(el('div'));
    // an image of the colors, named by the legend for screen readers
    const svg = scaleBox.appendChild(create('svg'));
    let missingBox = null;
    let scale = null;
    let drawnVertical = null;

    const options = () => store.mapping(legend).legend ?? {};
    // the length of the scale, 240 pixels by default
    const size = () => Number(options().size) || 240;
    // a vertical scale has the high values at the top, a prop of the width
    // of the visualisation, e.g. horizontal on a phone
    const isVertical = () => evaluate(options().orientation, { ...store.scope, totalWidth: store.visWidth }) == 'vertical';

    const draw = vertical => {
        const m = store.mapping(legend);
        const s = scale;
        const opts = options();
        svg.replaceChildren();
        const width = size();
        // the labels after the scale (below it, right of a vertical one) or before it
        const before = opts.labels == 'before';
        const along = vertical ? (vertical && before ? 48 : 2) : padding;
        const g = append(svg, "g", { transform: vertical ? `translate(${along}, ${padding})` : `translate(${padding}, ${before ? 20 : 2})` });
        // a position along the scale, of a vertical one from the bottom
        const at = x => vertical ? width - x : x;
        // a box from `x` of the length `w` in the color `fill`
        const box = (x, w, fill) => append(g, "rect", {
            [vertical ? "y" : "x"]: vertical ? at(x + w) : x, [vertical ? "x" : "y"]: 0,
            [vertical ? "height" : "width"]: w, [vertical ? "width" : "height"]: 10, fill,
        });
        const label = (x, v, format) => {
            const p = at(x);
            const [t0, t1] = before ? [-4, 0] : [10, 14];
            if (vertical) {
                append(g, "line", { y1: p, y2: p, x1: t0, x2: t1, stroke: "currentColor" });
                append(g, "text", { y: p, x: before ? -6 : 16, "text-anchor": before ? "end" : "start",
                    "dominant-baseline": "middle", fill: "currentColor" }, format(v));
            } else {
                append(g, "line", { x1: p, x2: p, y1: t0, y2: t1, stroke: "currentColor" });
                append(g, "text", { x: p, y: before ? -8 : 26, "text-anchor": "middle", fill: "currentColor" }, format(v));
            }
        };
        // a gradient of `color(t)` of t from 0 to 1 along the scale
        const gradient = color => {
            const defs = append(append(svg, "defs"), "linearGradient", { id: uid, ...(vertical ? { x1: 0, x2: 0, y1: 1, y2: 0 } : {}) });
            d3.range(11).forEach(i => append(defs, "stop", { offset: `${i*10}%`, "stop-color": color(i/10) }));
            box(0, width, `url(#${uid})`);
        };
        // the format of the legend or the hover, by default the one of the ticks of an axis
        const given = formatOf(m, 'legend');
        const formatter = values => given
            ? store.format(given, legend)
            : store.locale.tickFormat(d3.scaleLinear(d3.extent(values)), 'linear', 4);
        // the ticks of the definition, the ones in the domain
        const fixed = domain => opts.values?.filter(v => v >= d3.min(domain) && v <= d3.max(domain));
        if (!s.ticks && !s.invertExtent && !s.interpolator) {
            // the categories of an ordinal scale, a box per category with its name
            const categories = s.domain();
            const w = width/Math.max(categories.length, 1);
            categories.forEach((c, i) => box(i*w, w, s(c)));
            categories.forEach((c, i) => label((i + 0.5)*w, c, String));
            g.querySelectorAll("line").forEach(line => line.remove());
        } else if (s.invertExtent) {
            // a box per class, the limits between them
            const colors = s.range();
            const w = width/colors.length;
            colors.forEach((c, i) => box(i*w, w, c));
            const limits = colors.slice(1).map(c => s.invertExtent(c)[0]);
            const format = formatter(limits);
            limits.forEach((v, i) => label((i + 1)*w, v, format));
        } else if (s.interpolator) {
            // sequential and diverging scales: the gradient and the ticks at
            // the positions of the colors, e.g. of a sqrt or a log scale, the
            // middle of a diverging domain is in the middle
            const position = s.copy().interpolator(t => t*width);
            gradient(t => s.interpolator()(t));
            const domain = s.domain();
            const ticks = fixed(domain) ?? (isLinear(s) ? d3.ticks(domain[0], domain.at(-1), 4) : spacedTicks(domain, position, 30));
            const format = given || isLinear(s) ? formatter(ticks) : fixedFormat(store.locale, ticks);
            ticks.forEach(v => label(position(v), v, format));
        } else {
            // e.g. a linear scale with a range of colors
            const domain = s.domain();
            const x = d3.scaleLinear([domain[0], domain.at(-1)], [0, width]);
            gradient(t => s(x.invert(t*width)));
            const ticks = fixed(domain) ?? x.ticks(4);
            const format = formatter(ticks);
            ticks.forEach(v => label(x(v), v, format));
        }
    };

    // the parts of the legend, the title, the image and the missing values
    const render = vertical => {
        const m = store.mapping(legend);
        const name = store.text(m.name);
        patch(root, { class: 'vis-legend vis-color-legend', 'data-dim': legend });
        setText(title, name);
        patch(scaleBox, { class: 'vis-color-scale', style: vertical ? { flexDirection: 'column' } : null });
        patch(svg, { role: 'img', 'aria-label': name || undefined, width: vertical ? 64 : size() + 2*padding, height: vertical ? size() + 2*padding : 34 });
        // the regions without a value, e.g. the color of geo:base
        const missing = options().missing;
        if (missing) {
            if (!missingBox) {
                missingBox = scaleBox.appendChild(el('div', { class: 'vis-legend-missing' }, el('span'), el('span')));
            }
            patch(missingBox.firstChild, { class: 'vis-swatch', style: { background: missing.color ?? 'var(--gen-vis-missing-color, #EEE)' } });
            setText(missingBox.lastChild, store.text(missing.name));
        } else if (missingBox) {
            missingBox.remove();
            missingBox = null;
        }
    };

    return {
        el: root,
        // a new scale is drawn at once, a new orientation as well
        update(next) {
            const vertical = isVertical();
            if (next !== scale || vertical !== drawnVertical) {
                scale = next;
                drawnVertical = vertical;
                draw(vertical);
            }
            render(vertical);
        },
    };
}
