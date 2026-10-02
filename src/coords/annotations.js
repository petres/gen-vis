export { annotationKeys, constraints, span, position, drawLabel, setAnnotationProps };

import * as d3 from "d3";
import * as du from "@/utils/data";
import * as ju from "@/utils/json";
import * as pu from "@/utils/plot";

// the keys of an annotation which are not mappings
const annotationKeys = ['type', 'props', 'label', 'text', 'above', 'facet', 'lon', 'lat'];

// the mappings of an annotation with their values, e.g. { "x": ["2025-07-01", null] },
// the values are converted as the ones of the rows, e.g. dates
const constraints = (ctx, a) => Object.entries(a)
    .filter(([k]) => !annotationKeys.includes(k) && ctx.info[k])
    .map(([name, value]) => {
        const mapping = ctx.store.mapping(name);
        const convert = v => v === null ? null : du.convert(mapping, v);
        return {
            name,
            orientation: mapping.scale.orientation,
            scale: ctx.info[name].scale,
            value: Array.isArray(value) ? value.map(convert) : convert(value),
        };
    });

// the first and last value of a domain, e.g. for null
const edges = s => [s.domain()[0], s.domain().at(-1)];

// the half of the space of a category, a band or the step of a point scale
const half = s => s.bandwidth ? (s.bandwidth() || s.step())/2 : 0;

// the center of a value
const center = (s, v) => s(v) + pu.bandCenter(s);

// the positions of a constraint, a range or a value (e.g. a category), null
// is an edge of the domain, they are within the range of the scale and sorted,
// unless `sorted` is false, e.g. for a range of angles across the top
const span = (c, sorted = true) => {
    const s = c.scale;
    const [first, last] = Array.isArray(c.value) ? c.value : [c.value, c.value];
    const [d0, d1] = edges(s);
    const p = [center(s, first ?? d0) - half(s), center(s, last ?? d1) + half(s)];
    const [r0, r1] = d3.extent(s.range());
    return (sorted ? d3.extent(p) : p).map(v => Math.max(r0, Math.min(r1, v)));
};

// the position of a constraint, of a range its center
const position = c => Array.isArray(c.value) ? d3.mean(span(c)) : center(c.scale, c.value);

// the label of an annotation, e.g. the name of a band
const drawLabel = (g, a, x, y, anchor = "start", baseline = "hanging") => {
    if (a.label !== undefined)
        g.append("text")
            .attr("class", "annotation-label")
            .attr("x", x)
            .attr("y", y)
            .attr("text-anchor", anchor)
            .attr("dominant-baseline", baseline)
            .attr("font-size", 11)
            .attr("fill", "#555")
            .attr("stroke", "white")
            .attr("stroke-width", 3)
            .attr("paint-order", "stroke")
            .text(a.label);
};

// the props of an annotation, svg attributes, also props of the size of the facet
const setAnnotationProps = (element, a, ctx, defaults = {}) => {
    const props = ju.fillProps(ju.entryToProp({ ...defaults, ...a.props }), ctx.relativeBases, true);
    element.each(function() { pu.setProps.call(this, props) });
    if (a.type == 'text')
        element.text(a.text ?? '');
};
