export { builtInDefaults, registerDefaults, axisDefaults, symbolDefaults, marginDefaults, withMarkDefaults };

import { mergeAll } from '@/utils/merge';
import { isObject } from '@/utils/values';
import { typeOf } from '@/utils/language';

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
    // the margins of the facets of definitions without them, e.g. of a house
    // style, a side in pixels or "auto" (measured of the axes, the default),
    // also the css variables --gen-vis-margin-top, ... of the page, see
    // utils/margins.js
    margins: {},
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
 * The defaults of the symbols of the legends (`legend.symbol` of the
 * defaults): the `size` (or `width` and `height`) of their box and per
 * shortcut (`line`, `rect`, `circle`) its own box and `props`, of the
 * built-in ones, the ones of the page and of the chart (`own`), see
 * symbolOf of utils/def.js.
 */
const symbolDefaults = own => mergeAll([builtInDefaults, registered, own].map(d => d?.legend?.symbol).filter(isObject));

/**
 * The defaults of an axis at `position` (e.g. "left" or "angular"), of the
 * shape of `axis` of builtInDefaults: the built-in ones, the ones of the
 * page (registerDefaults) and of the chart (`own`, its prop) merged in this
 * order, in each the ones of all axes (`axis`) before the ones of the axes
 * of the type of its scale (`<scaleType>Axis`, e.g. `bandAxis` of the
 * categories of bars, `pointAxis`, `linearAxis`, `timeAxis`) and the ones of
 * the axes of the position (`<position>Axis`, e.g. `angularAxis` or
 * `leftAxis`). `tickMarks: false` is `tickMarks.hidden` (the size stays the
 * space of the labels), an object of a later part shows them again.
 */
const axisDefaults = (own, position, scaleType) => {
    const parts = [builtInDefaults, registered, own]
        .flatMap(d => [d?.axis, scaleType ? d?.[`${scaleType}Axis`] : undefined, d?.[`${position}Axis`]]).filter(isObject);
    // `tickMarks: false` leaves them out, a later object of them shows them
    // again; the size of the marks stays, the labels keep their places
    const shown = parts.reduce((s, p) => p.tickMarks === false ? false : isObject(p.tickMarks) ? true : s, true);
    const merged = mergeAll(parts.map(p => {
        if (p.tickMarks !== false)
            return p;
        const { tickMarks: _, ...rest } = p;
        return rest;
    }));
    if (!shown)
        merged.tickMarks = { ...merged.tickMarks, hidden: true };
    return merged;
};

// the margins of the defaults (`margins` of builtInDefaults), of the page
// and of the chart (`own`), e.g. { "left": 60 }, a side without one is measured
const marginDefaults = own => mergeAll([builtInDefaults, registered, own].map(d => d?.margins).filter(isObject));

/**
 * The mark types `types` (see marks/index.js) with the defaults of the
 * attributes of their marks of the page and of the chart (`own`, its prop)
 * after their built-in ones (see marks/defaults.js), below the props of a
 * mark: `marks` of the defaults by the type as a definition writes it
 * (e.g. `line`, `point`, `bar`, of all coordinate systems) or its full name
 * (e.g. `polar:line`, after the short one), e.g. { "marks": { "line": {
 * "stroke-width": 1.33 }, "point": { "r": 2 } } } of a house style; null
 * removes a built-in one. `types` without such defaults are returned as they are.
 */
const withMarkDefaults = (types, own) => {
    const parts = [registered, own].map(d => d?.marks).filter(isObject);
    if (parts.length == 0)
        return types;
    // the full names of a written type, e.g. svg:circle, polar:circle and geo:circle of point
    const named = new Map();
    parts.forEach(p => Object.keys(p).forEach(k => new Set(['cartesian', 'polar', 'geo'].map(c => typeOf(k, c))).forEach(t => {
        if (Object.hasOwn(types, t) && !named.get(t)?.includes(k))
            named.set(t, [...named.get(t) ?? [], k]);
    })));
    if (named.size == 0)
        return types;
    return Object.fromEntries(Object.entries(types).map(([name, type]) => {
        // of each level the written types, then the full name
        const extra = parts.flatMap(p => [...(named.get(name) ?? []).filter(k => k != name), name].map(k => p[k])).filter(isObject);
        if (extra.length == 0)
            return [name, type];
        const base = type.defaults;
        const added = Object.assign({}, ...extra);
        return [name, { ...type, defaults: props => ({ ...(typeof base == 'function' ? base(props) : base), ...added }) }];
    }));
};
