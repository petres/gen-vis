export { plotTypes, registerPlotType };

import elements from "@/plots/elements";
import cartesian from "@/plots/cartesian";
import polar from "@/plots/polar";
import geo from "@/plots/geo";
import annotations from "@/plots/annotations";

/**
 * The plot types by name, the `type` of a plot:
 * - `render(groups, parent, plot, ctx)` draws the groups of rows of the plot
 *   (one per combination of its categories) into the d3 selection `parent`.
 *   A group has its `rows`, the props of its categories (`props`), the
 *   values of the props of the plot of a row, `at(row)`, of one prop
 *   `prop(name)(row)`, the ones which are the same for all rows (`attrs`),
 *   e.g. the color of a line, and `complete(row)`, false if a mapping of the
 *   props has no value, see plotGroups of layout.js. The values are plain
 *   values, e.g. numbers of positions. `ctx` is the facet: the `store`, the
 *   d3 selection `inner` of the plot area, the `rows`, the `scales` by the
 *   names of the mappings, `axis` (the names of the positions and the values),
 *   `stackOf(row)` (the start and the end of a stacked value), `scope` (the
 *   names of the references of the facet), `innerWidth`, `innerHeight` and
 *   `dims` (the sizes of the coordinate system), maps also `projection` and
 *   `path`
 * - `curve`: the type uses the `curve` of the plot
 * - `coords`: the coordinate systems of the type, all if it is not given
 */
const plotTypes = { ...elements, ...cartesian, ...polar, ...geo, ...annotations };

const registerPlotType = (name, type) => {
    plotTypes[name] = type;
};
