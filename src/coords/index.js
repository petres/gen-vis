export { coords, getCoord, registerCoord };

import cartesian from "@/coords/cartesian";
import polar from "@/coords/polar";

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
 *   [0, 0] if it is not given
 * - `axes(ctx)`: draws the axes and grid lines of the mappings, `raise(ctx)`
 *   is called after the plots, e.g. to raise axes in the plot area above them
 * - `hover.area(ctx, parent)`: appends the element of the pointer events,
 *   `hover.locate(ctx, pointer, names)` returns the `key` (a value of the
 *   position mapping) and the `value` at the pointer, null if there is no key,
 *   `hover.marker(ctx, key, names, line)` places the marker line of the key and
 *   returns the position of the hover, `{x, y, side}`
 */
const coords = { cartesian, polar };

const getCoord = (name = 'cartesian') => {
    if (!Object.hasOwn(coords, name))
        throw new Error(`Unknown coordinate system '${name}', expected one of ${Object.keys(coords).map(n => `'${n}'`).join(', ')}`);
    return coords[name];
};

const registerCoord = (name, coord) => {
    coords[name] = coord;
};
