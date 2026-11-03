export { plotTypes, registerPlotType };

import elements from "@/plots/elements";
import cartesian from "@/plots/cartesian";
import geo from "@/plots/geo";
import annotations from "@/plots/annotations";
import { defaults } from "@/plots/defaults";

/**
 * The plot types by name, the `type` of a plot:
 * - `marks(groups, plot, ctx)` returns the layer of the elements of the
 *   groups of rows of the plot (one per combination of its categories), see
 *   drawLayer of utils/draw.js and perRow and perGroup of plots/elements.js,
 *   it does not draw, null draws nothing. A group has its `rows`, the props
 *   of its categories (`props`), the values of the props of the plot of a
 *   row, `at(row)`, of one prop `prop(name)(row)`, the ones which are the
 *   same for all rows (`attrs`), e.g. the color of a line, and
 *   `complete(row)`, false if a mapping of the props has no value, see
 *   plotGroups of layout.js. The values are plain values, e.g. numbers of
 *   positions. `ctx` is the facet: the `store`, the `rows`, the `scales` by
 *   the names of the mappings, `axis` (the names of the positions and the
 *   values), `stackOf(row)` (the start and the end of a stacked value),
 *   `scope` (the names of the references of the facet), `innerWidth`,
 *   `innerHeight` and `dims` (the sizes of the coordinate system), maps also
 *   `projection` and `path`
 * - `update`: the layer is drawn into the elements of the draw before, the
 *   elements of the others are removed before they are drawn again, see
 *   Facet.vue
 * - `curve`: the type uses the `curve` of the plot
 * - `coords`: the coordinate systems of the type, all if it is not given
 * - `defaults`: the default props of a plot whose type is written without
 *   the prefix of the coordinate system, e.g. "line" of "cartesian:line",
 *   an object or a function of the props of the plot, see plots/defaults.js
 *   and utils/normalize.js
 */
// the plot types of polar plots are loaded with the first one, until then
// they are known by their names, e.g. to validateDef, see coords/polar.js
const later = (name, parts) => ({
    ...parts,
    coords: ['polar'],
    update: true,
    marks() { throw new Error(`${name}: a plot type of polar plots, of "coord": "polar"`); },
});
const polar = {
    'polar:line': later('polar:line', { curve: true }),
    'polar:area': later('polar:area', { curve: true }),
    'polar:arc': later('polar:arc'),
    'polar:circle': later('polar:circle'),
    'polar:text': later('polar:text'),
};

const plotTypes = { ...elements, ...cartesian, ...polar, ...geo, ...annotations };
Object.entries(defaults).forEach(([name, d]) => plotTypes[name].defaults = d);

const registerPlotType = (name, type) => {
    plotTypes[name] = type;
};
