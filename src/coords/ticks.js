export { tickValues, tickFormat, tickCount };

import { formatOf } from "@/utils/def";
import { evaluate } from "@/utils/props";
import { convert } from "@/utils/data";

// fixed values outside of the range of the scale are not drawn, e.g. 10 of a
// log scale from 14, d3 would draw them in the margins, values without a
// position (e.g. of a band scale) are kept as they are
const inRange = (scale, v) => {
    const p = scale(v);
    if (typeof p != 'number' || !isFinite(p))
        return true;
    const [a, b] = [...scale.range()].sort((x, y) => x - y);
    return p >= a - 0.5 && p <= b + 0.5;
};

// the number of the ticks of an axis, its `ticks` or one per `tickSpacing`
// pixels of its `length`, e.g. of the width of the plot area, at least 2
const tickCount = (axis, scope, length) => {
    // null is no number, e.g. of a parent, so the one of tickSpacing
    const ticks = evaluate(axis.ticks, scope) ?? undefined;
    if (ticks !== undefined || !axis.tickSpacing)
        return ticks;
    return Math.max(2, Math.round(length / evaluate(axis.tickSpacing, scope)));
};

// the values of the ticks of an axis, also of the grid lines, fixed ones are
// converted as the values of the data of the `mapping`, e.g. dates of
// "2020-04-01", they can be a prop of the names of the facet (`scope`)
const tickValues = (axis, scale, ticks, mapping, scope = {}) => {
    // a list or a prop, e.g. steps of the width
    const values = axis.values === undefined ? undefined : evaluate(axis.values, scope);
    return Array.isArray(values)
        ? values.map(v => mapping && ['numeric', 'date'].includes(mapping.type) ? convert(mapping, v) : v).filter(v => v !== null && inRange(scale, v))
        : (scale.ticks ? scale.ticks(ticks) : scale.domain());
};

// the format of the ticks of the axis of a mapping, by default as the one of
// d3 but in the locale, null for the default of d3
const tickFormat = (store, name, scale, ticks) => {
    const mapping = store.mapping(name);
    const format = formatOf(mapping, 'axis');
    if (format)
        return store.format(format, name);
    if (mapping.axis.values)
        return null;
    return store.locale.tickFormat(scale, mapping.scale.type, ticks);
};
