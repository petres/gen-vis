export { tickValues, tickFormat, tickCount, labelProps, domainProps, tickMarks };

import { formatOf } from "@/utils/def";
import { evaluate } from "@/utils/props";
import { convert } from "@/utils/data";

// fixed values outside of the range of the scale are not drawn, e.g. 10 of a
// log scale from 14, d3 would draw them in the margins, also the ones which
// are no category of a band or point scale, they have no position
const inRange = (scale, v) => {
    const p = scale(v);
    if (typeof p != 'number' || !isFinite(p))
        return !scale.step;
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
// "2020-04-01" or the categories as strings, e.g. "2004" of 2004, they can be
// a prop of the names of the facet (`scope`)
const tickValues = (axis, scale, ticks, mapping, scope = {}) => {
    // a list or a prop, e.g. steps of the width
    const values = axis.values === undefined ? undefined : evaluate(axis.values, scope);
    return Array.isArray(values)
        ? values.map(v => mapping ? convert(mapping, v) : v).filter(v => v !== null && inRange(scale, v))
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

/**
 * The props of the labels of the ticks of the axis of the mapping `n` as a
 * function of the tick, `axis.labels.props`, e.g. { "font-weight": "@weight",
 * "text": "@short", "max-width": 300 }, of the names of the facet, the values
 * of the first row of the tick (e.g. `@short`), the props of the categories
 * of the tick and of the mappings `axis.labels.categories` of its row (e.g.
 * `@weight` of a category of a level), null without props, of the axes of
 * all coordinate systems.
 */
const labelProps = (ctx, n, labels) => {
    if (!labels?.props)
        return null;
    const store = ctx.store;
    const categories = [labels.categories ?? []].flat().filter(c => store.mapping(c)?.props);
    const rows = new Map();
    ctx.rows.forEach(r => {
        const k = String(r[n]);
        if (!rows.has(k))
            rows.set(k, r);
    });
    return d => {
        const row = rows.get(String(d)) ?? {};
        const props = Object.assign({}, store.mapping(n).props ? store.prop(n, String(d)) : undefined,
            ...categories.map(c => store.prop(c, String(row[c]))));
        return evaluate(labels.props, { ...ctx.scope, ...row, [n]: d, ...props });
    };
};

// the props of the line of an axis (`axis.domain.props`, its class is
// `domain`), e.g. its stroke-opacity, of the names of the facet, null
// without props
const domainProps = (ctx, axis) => axis.domain?.props ? evaluate(axis.domain.props, ctx.scope) : null;

// the tick marks of an axis (`axis.tickMarks`): false without them, the
// labels stay at their places, otherwise their length (`size`, by default
// the one of the coordinate system) and their props of the names of the
// facet (`props`, null without), e.g. their stroke
const tickMarks = (ctx, axis) => axis.tickMarks === false ? false : {
    size: Number.isFinite(axis.tickMarks?.size) ? axis.tickMarks.size : null,
    props: axis.tickMarks?.props ? evaluate(axis.tickMarks.props, ctx.scope) : null,
};
