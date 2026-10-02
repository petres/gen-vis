export { plotTypes, registerPlotType };

import elements from "@/plots/elements";
import bars from "@/plots/bars";

/**
 * The plot types by name, the `type` of a plot:
 * - `render(groups, parent, plotDef, ctx)` draws the groups of rows into the
 *   d3 selection `parent`, every group has the `props` filled with the props
 *   of its categories and its rows as `values`, see Facet.vue for `ctx`
 * - `curve`: the type uses the `curve` of the plot
 * - `coords`: the coordinate systems of the type, all if it is not given
 */
const plotTypes = { ...elements, ...bars };

const registerPlotType = (name, type) => {
    plotTypes[name] = type;
};
