// the default props of the built-in mark types, the `defaults` of the types
// (see marks/index.js), of the marks of the type, "line" and
// "cartesian:line" alike, see utils/normalize.js, a definition writes only
// the props which differ, null removes one. The positions are no defaults,
// translate writes them of the channels of the marks (see mark of
// utils/language.js). The color of a mark without categories is the one of
// the text, the fill of bars, areas and arcs the first color of the default
// colors of categories (observable10, see utils/def.js), not a black block.
const color = { or: ['@color', 'currentColor'] };
const fill = { or: ['@color', '#4269D0'] };

export const defaults = {
    'cartesian:line': { stroke: color, fill: 'none' },
    'cartesian:area': { fill },
    // the classes of a bin, a bar from `x0` to `x1` with `x1` and `y1`, with
    // crisp edges, so neighbours meet without a seam also in a scaled image
    'cartesian:bar': props => props && 'x1' in props && 'y1' in props ? { fill, 'shape-rendering': 'crispEdges' } : { fill },
    'cartesian:rule': { stroke: color },
    'svg:circle': { r: 3, fill: color },
    'svg:text': { fill: '@color' },
    'polar:line': { stroke: color, fill: 'none' },
    'polar:area': { fill },
    'polar:arc': { fill },
    'polar:circle': { r: 3, fill: color },
    'polar:text': { fill: '@color' },
    // the labels of a map are centered on their place, e.g. the pole of their
    // area, vertically without a `dy` of their own (one of 4.x, e.g. 0.35em,
    // moves them from their baseline)
    'geo:text': props => props && 'dy' in props ? { 'text-anchor': 'middle' } : { 'text-anchor': 'middle', 'dominant-baseline': 'middle' },
};
