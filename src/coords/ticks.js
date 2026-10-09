export { tickValues, tickFormat };

import { formatOf } from "@/utils/def";

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

// the values of the ticks of an axis, also of the grid lines
const tickValues = (axis, scale, ticks) => axis.values
    ? axis.values.filter(v => inRange(scale, v))
    : (scale.ticks ? scale.ticks(ticks) : scale.domain());

// the format of the ticks of an axis, by default as the one of d3 but in the
// locale, null for the default of d3
const tickFormat = (store, mapping, scale, ticks) => {
    const format = formatOf(mapping, 'axis');
    if (format)
        return store.formatter(mapping.scale.type)(format);
    if (mapping.axis.values)
        return null;
    return store.locale.tickFormat(scale, mapping.scale.type, ticks);
};
