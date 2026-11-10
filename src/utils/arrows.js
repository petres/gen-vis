export { arrowheads };

import { create } from "@/utils/dom";
import { directOf } from "@/utils/draw";

/**
 * The arrowheads of the elements of a layer (see drawLayer of
 * utils/draw.js): an attribute `marker-start` or `marker-end` of the value
 * "arrow" (e.g. of a rule, a line or an annotation line) is the url of a
 * <marker> of an arrowhead in the color of the stroke of the element, one
 * per color in the <defs> of the svg of the facet (`svg`), with the ids of
 * the facet (`uid`), so they are unique on the page and an export of the
 * svg copies them. An element without a stroke of its own has the one of
 * its styles: of an annotation line the color of the lines of
 * annotations, else the color of the text. The arrowhead is in units of
 * the stroke width (a thicker line has a larger head), at the start turned
 * around (auto-start-reverse). In a browser the stylesheet paints it in the
 * stroke of its line as it is (context-stroke, see styles.css), so it
 * follows a highlight of the line; the color of the marker is the one of
 * the exports and of browsers without context-stroke. Other values are as
 * they are, e.g. the url of a marker of the page.
 */
const markerProps = ['marker-start', 'marker-end'];

const arrowheads = (layer, svg, uid) => {
    if (!layer || !svg)
        return layer;
    const items = [...(layer.items ?? []), ...(layer.groups ?? []).flatMap(g => g.items)];
    items.filter(item => markerProps.some(k => item[k] == 'arrow')).forEach(item => {
        const own = item.stroke;
        const annotation = String(item[directOf]?.class ?? '').includes('vis-line');
        const color = typeof own == 'string' && own && own != 'none' ? own
            : annotation ? 'var(--gen-vis-line-color, #9AA0A8)' : 'currentColor';
        const url = `url(#${markerOf(svg, uid, color)})`;
        markerProps.filter(k => item[k] == 'arrow').forEach(k => item[k] = url);
    });
    return layer;
};

// the id of the marker of an arrowhead of a color in the defs of the svg,
// a new one of a new color
const markerOf = (svg, uid, color) => {
    let defs = svg.querySelector(':scope > defs.vis-defs');
    if (!defs) {
        defs = create('defs');
        defs.setAttribute('class', 'vis-defs');
        svg.insertBefore(defs, svg.firstChild);
    }
    const markers = [...defs.querySelectorAll(':scope > marker.vis-arrow')];
    const same = markers.find(m => m.getAttribute('data-color') === color);
    if (same)
        return same.id;
    const marker = defs.appendChild(create('marker'));
    const attrs = { id: `${uid}-arrow-${markers.length}`, class: 'vis-arrow', 'data-color': color, viewBox: '0 0 10 10', refX: 8, refY: 5,
        markerWidth: 6, markerHeight: 6, markerUnits: 'strokeWidth', orient: 'auto-start-reverse' };
    Object.entries(attrs).forEach(([k, v]) => marker.setAttribute(k, v));
    const path = marker.appendChild(create('path'));
    path.setAttribute('d', 'M0,0L10,5L0,10L2,5Z');
    // a style, so a color of a css variable is one, e.g. of the annotations
    path.style.setProperty('fill', color);
    return marker.id;
};
