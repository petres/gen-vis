export { markTypes, registerMarkType };

import elements from "@/plots/elements";
import cartesian from "@/plots/cartesian";
import geo from "@/plots/geo";
import annotations from "@/plots/annotations";
import { defaults } from "@/plots/defaults";

/**
 * The mark types by name, the `type` of a mark:
 * - `marks(groups, mark, ctx)` returns the layer of the elements of the
 *   groups of rows of the mark (one per combination of its categories), see
 *   drawLayer of utils/draw.js and perRow and perGroup of plots/elements.js,
 *   it does not draw, null draws nothing. A group has its `rows`, the props
 *   of its categories (`props`), the values of the props of the mark of a
 *   row, `at(row)`, of one prop `prop(name)(row)`, the ones which are the
 *   same for all rows (`attrs`), e.g. the color of a line, and
 *   `complete(row)`, false if a dim of the props has no value, see
 *   markGroups of layout.js. The values are plain values, e.g. numbers of
 *   positions. `ctx` is the facet: the `store`, `inner` (the element `g`
 *   of the marks and axes, a DOM element), the `rows`, the `scales` by
 *   the names of the dims, `axis` (the names of the positions and the
 *   values), `stackOf(row)` (the start and the end of a stacked value),
 *   `scope` (the names of the references of the facet), `innerWidth`,
 *   `innerHeight` and `dims` (the sizes of the coordinate system), maps also
 *   `projection` and `path`
 * - `update`: the layer is drawn into the elements of the draw before, the
 *   elements of the others are removed before they are drawn again, see
 *   comp/facet.js
 * - `curve`: the type uses the `curve` of the mark
 * - `coords`: the coordinate systems of the type, all if it is not given
 * - `defaults`: the default props of the marks of the type, written with or
 *   without the prefix of the coordinate system ("line" is
 *   "cartesian:line"), an object or a function of the props of the mark,
 *   see plots/defaults.js and utils/normalize.js
 */
// the mark types of polar plots are loaded with the first one, until then
// they are known by their names, e.g. to validateDef, see coords/polar.js
const later = (name, parts) => ({
    ...parts,
    coords: ['polar'],
    update: true,
    marks() { throw new Error(`the mark type '${name}' is one of polar charts, of "coord": "polar"`); },
});
const polar = {
    'polar:line': later('polar:line', { curve: true }),
    'polar:area': later('polar:area', { curve: true }),
    'polar:arc': later('polar:arc'),
    'polar:circle': later('polar:circle'),
    'polar:text': later('polar:text'),
};

const markTypes = { ...elements, ...cartesian, ...polar, ...geo, ...annotations };
Object.entries(defaults).forEach(([name, d]) => markTypes[name].defaults = d);

const registerMarkType = (name, type) => {
    markTypes[name] = type;
};
