export { coords, loadCoord, registerCoord };

import cartesian from "@/coords/cartesian";
import polar from "@/coords/polar";
import geo from "@/coords/geo";

/**
 * The coordinate systems by name, `options.coord` of a definition:
 * - `ranges`: the default ranges of the scales by their orientation, in the
 *   sizes of `dims`, `cyclic` are the orientations whose end is their start,
 *   e.g. the angle
 * - `axis`: the orientations of the mappings of the positions (`h`) and of
 *   the values (`v`) of the hover and the stacks
 * - `positions`: the positions of the axes
 * - `dims(innerWidth, innerHeight)`: the sizes of a facet the ranges refer to,
 *   `origin(innerWidth, innerHeight)` is the origin of the plots and axes,
 *   [0, 0] if it is not given, `centered`: the plots are in the center of
 *   the facet, its title is centered, e.g. above the circle of a polar plot
 * - `names(store)`: the mappings of the hover and the stacks instead of the
 *   ones of `axis`, e.g. of a map, `flip` swaps them, see axisNames of
 *   layout.js
 * The `ctx` is the facet, as the one of the plot types, see plots/index.js,
 * `ctx.inner` is the element of the plots and axes. The elements of the
 * functions are DOM elements, no d3 selections.
 * - `prepare(ctx)`: adds to the context before the axes and plots are drawn,
 *   e.g. the projection of a map
 * - `annotations`: the types of the annotations, `annotate(ctx, a)` returns
 *   the items of one (see drawLayer of utils/draw.js), see
 *   coords/annotations.js
 * - `axes(ctx)`: the parts of the axes and grid lines of the mappings, in
 *   their order, an element per part (`key`), kept from one draw to the
 *   next: an axis of the positions top, right, bottom or left (`axis`, see
 *   drawAxis of utils/axis.js) or an element (`element`, `g` by default)
 *   with the attributes `attrs`, the `text` and the elements of a `layer`
 *   (see drawLayer of utils/draw.js), `fresh` ones are drawn anew, see
 *   drawParts of comp/facet.js, `raise(ctx)` is called after the plots, e.g. to
 *   move axes in the plot area (elements of `ctx.inner`) above them
 * - `hover.area(ctx, parent)`: appends the element of the pointer events to
 *   the element `parent` (`ctx.inner`) and returns it, e.g. a rect,
 *   `hover.locate(ctx, pointer, names, event)` returns the `key` (a value of
 *   the position mapping) and the `value` at the pointer, null if there is no
 *   key, without a value the elements of the key are highlighted,
 *   `hover.marker(ctx, key, names, line, nearest)` places the marker line of
 *   the key (and of the nearest row), the svg element `line`, by its
 *   attributes `x1`, `y1`, `x2` and `y2` (removed without a line, see
 *   placeLine of coords/hover.js), and returns the position of the hover,
 *   `{x, y, side}`, `hover.values`: the hover of the values without a mapping
 *   of the positions, e.g. of a pie, the key is undefined, `hover.title(ctx, key,
 *   names)` the title of the hover, the formatted key by default,
 *   `hover.point(ctx, row, names)` the position of the point of a row, of
 *   the hover of the nearest point (`"mode": "point"` of the hover)
 * - `load()`: the module of the parts which are loaded with the first
 *   visualisation of the coordinate system, e.g. the ones of maps with
 *   d3-geo, its default export completes the coordinate system
 */
const coords = { cartesian, polar, geo };

const getCoord = (name = 'cartesian') => {
    if (!Object.hasOwn(coords, name))
        throw new Error(`coord: unknown coordinate system '${name}', expected one of ${Object.keys(coords).map(n => `'${n}'`).join(', ')}`);
    return coords[name];
};

// the coordinate system completed by the module it loads, once, a load which
// failed is tried again by the next visualisation, e.g. after a network error
const loadCoord = async name => {
    const coord = getCoord(name);
    if (coord.load)
        await (coord.loaded ??= coord.load().then(m => Object.assign(coord, m.default ?? m)).catch(error => {
            coord.loaded = null;
            throw error;
        }));
    return coord;
};

const registerCoord = (name, coord) => {
    coords[name] = coord;
};
