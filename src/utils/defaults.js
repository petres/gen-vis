export { builtInDefaults, registerDefaults, axisDefaults, symbolDefaults };

import merge from 'deepmerge';
import { isObject } from '@/utils/values';

/**
 * The built-in defaults of the parts of a chart, the values used where a
 * definition has none, see docs/definition.md "Defaults": of all axes (`axis`), the
 * ones of the axes of a position before them, e.g. of the angular and the
 * radial axes of polar plots (`angularAxis`, `radialAxis`). `padding` is the space between the tick
 * marks and the labels, `tickMarks.size` the length of the tick marks,
 * `tickMarks.inset` the part of it inside the plot area (null is the one
 * of the styles, 4 pixels of bottom and right axes, 5 of top and left
 * ones), `title.offset` the distance of the title from the axis, null is
 * 8 pixels inside the edge of the margin.
 */
const builtInDefaults = {
    axis: { padding: 3, tickMarks: { size: 9, inset: null }, title: { offset: null } },
    // the box of the symbols of the legends, all and per shortcut, e.g.
    // { "line": { "width": 18, "height": 9, "props": { "stroke-width": 1.6 } } }
    legend: { symbol: { size: 16 } },
    angularAxis: { tickMarks: { size: 6, inset: 0 } },
    radialAxis: { title: { offset: 16 } },
};

// the defaults of the page, see registerDefaults
let registered = null;

/**
 * The defaults of the page (an object of the shape of builtInDefaults, e.g.
 * { "axis": { "padding": 2, "tickMarks": { "size": 4 } } }) for all charts,
 * the prop `defaults` of a chart takes precedence over them, null removes
 * them; they replace the ones registered before, parts which are no objects
 * are none.
 */
const registerDefaults = defaults => {
    registered = defaults;
};

/**
 * The defaults of an axis at `position` (e.g. "left" or "angular"), of the
 * shape of `axis` of builtInDefaults: the built-in ones, the ones of the
 * page (registerDefaults) and of the chart (`own`, its prop) merged in this
 * order, in each the ones of all axes (`axis`) before the ones of the axes
 * of the position (`<position>Axis`, e.g. `angularAxis` or `leftAxis`).
 */
/**
 * The defaults of the symbols of the legends (`legend.symbol` of the
 * defaults): the `size` (or `width` and `height`) of their box and per
 * shortcut (`line`, `rect`, `circle`) its own box and `props`, of the
 * built-in ones, the ones of the page and of the chart (`own`), see
 * symbolOf of utils/def.js.
 */
const symbolDefaults = own => merge.all([builtInDefaults, registered, own].map(d => d?.legend?.symbol).filter(isObject));

const axisDefaults = (own, position) => merge.all([builtInDefaults, registered, own]
    .flatMap(d => [d?.axis, d?.[`${position}Axis`]]).filter(isObject));
