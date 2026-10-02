export { tickValues, tickFormat };

// the values of the ticks of an axis, also of the grid lines
const tickValues = (axis, scale, ticks) => axis.values ?? (scale.ticks ? scale.ticks(ticks) : scale.domain());

// the format of the ticks of an axis, by default as the one of d3 but in the
// locale, null for the default of d3
const tickFormat = (store, mapping, scale, ticks) => {
    if (mapping.axis.format)
        return store.formatter(mapping.scale.type)(mapping.axis.format);
    if (mapping.axis.values)
        return null;
    return store.locale.tickFormat(scale, mapping.scale.type, ticks);
};
