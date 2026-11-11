export { tickValues, tickFormat, tickCount, labelProps, domainProps, tickMarks, labelStep };

import { formatOf } from "@/utils/def";
import { evaluate } from "@/utils/expr";
import { convert } from "@/utils/data";
import { textWidth } from "@/utils/measure";

// fixed values outside of the range of the scale are not drawn, e.g. 10 of a
// log scale from 14, d3 would draw them in the margins, also the ones
// without a position: no category of a band or point scale, 0 of a log scale
const inRange = (scale, v) => {
    const p = scale(v);
    if (typeof p != 'number' || !isFinite(p))
        return false;
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
// converted as the values of the data of the `dim`, e.g. dates of
// "2020-04-01" or the categories as strings, e.g. "2004" of 2004, they can be
// a prop of the names of the facet (`scope`), dates in the time zone of the
// scale, also of the one of another dim (`"scale": { "of": "x" }`) of
// the `dims` of the definition
const tickValues = (axis, scale, ticks, dim, scope = {}, dims) => {
    // a list or a prop, e.g. steps of the width
    const values = axis.values === undefined ? undefined : evaluate(axis.values, scope);
    return Array.isArray(values)
        ? values.map(v => dim ? convert(dim, v, dims) : v).filter(v => v !== null && inRange(scale, v))
        : (scale.ticks ? scale.ticks(ticks) : scale.domain());
};

// the format of the ticks of the axis of a dim, by default as the one of
// d3 but in the locale, null for the default of d3; the categories with a
// name of their own are labelled by it, as in the legend, e.g. "Mon" of the
// key 1 (`labels.props.text` of the axis comes before it)
const tickFormat = (store, name, scale, ticks) => {
    const dim = store.dim(name);
    const format = numberFormat(store, dim, name, scale, ticks);
    const props = dim.categoryProps;
    if (!props || !Object.entries(props).some(([k, p]) => p.name !== undefined && p.name !== null && String(p.name) !== k))
        return format;
    const other = format ?? (scale.tickFormat ? scale.tickFormat(ticks) : d => d);
    return d => {
        const p = Object.hasOwn(props, String(d)) ? props[String(d)] : undefined;
        return p?.name !== undefined && p.name !== null && String(p.name) !== String(d) ? String(p.name) : other(d);
    };
};
const numberFormat = (store, dim, name, scale, ticks) => {
    const format = formatOf(dim, 'axis');
    if (format)
        return store.format(format, name);
    if (dim.axis.values)
        return null;
    return store.locale.tickFormat(scale, dim.scale.type, ticks);
};

/**
 * The props of the labels of the ticks of the axis of the dim `n` as a
 * function of the tick, `axis.labels.props`, e.g. { "font-weight": "@weight",
 * "text": "@short", "max-width": 300 }, of the names of the facet, the values
 * of the first row of the tick (e.g. `@short`), the props of the categories
 * of the tick and of the dims `axis.labels.by` of its row (e.g.
 * `@weight` of a category of a level), null without props, of the axes of
 * all coordinate systems.
 */
const labelProps = (ctx, n, labels) => {
    if (!labels?.props)
        return null;
    const store = ctx.store;
    const categories = [labels.by ?? []].flat().filter(c => store.dim(c)?.categoryProps);
    const rows = new Map();
    ctx.rows.forEach(r => {
        const k = String(r[n]);
        if (!rows.has(k))
            rows.set(k, r);
    });
    return d => {
        const row = rows.get(String(d)) ?? {};
        const props = Object.assign({}, store.dim(n).categoryProps ? store.prop(n, String(d)) : undefined,
            ...categories.map(c => store.prop(c, String(row[c]))));
        return evaluate(labels.props, { ...ctx.scope, ...row, [n]: d, ...props });
    };
};

// the props of the line of an axis (`axis.domain.props`, its class is
// `domain`), e.g. its stroke-opacity, of the names of the facet, null
// without props
const domainProps = (ctx, axis) => axis.domain?.props ? evaluate(axis.domain.props, ctx.scope) : null;

// the tick marks of an axis (`axis.tickMarks`): false without them, the
// labels stay at their places, otherwise their length (`size`), the part of
// it inside the plot area (`inset`, null of the one of the styles), by
// default the ones of `defaults` (`tickMarks` of the defaults of the axis,
// see utils/defaults.js), and their props of the names of the facet (`props`, null
// without), e.g. their stroke
const tickMarks = (ctx, axis, defaults) => axis.tickMarks === false ? false : {
    size: Number.isFinite(axis.tickMarks?.size) ? axis.tickMarks.size : defaults?.size,
    inset: Number.isFinite(axis.tickMarks?.inset) ? axis.tickMarks.inset : defaults?.inset,
    props: axis.tickMarks?.props ? evaluate(axis.tickMarks.props, ctx.scope) : null,
};

/**
 * The step of the labels of a horizontal axis which are shown, 1 of all of
 * them: every n-th one if the ones next to each other overlap (measured in
 * `font(i)`, the one of the label i), the smallest n whose labels are at
 * least `gap` pixels apart, e.g. a year per band of a heatmap of 21 years
 * in a narrow chart; `positions` are the ones of the centers of the labels,
 * `texts` their texts, empty ones take no place.
 */
const labelStep = (texts, positions, font, gap = 4) => {
    const n = texts.length;
    if (n < 3)
        return 1;
    let widths = null;
    const width = i => (widths ??= texts.map((t, j) => t ? textWidth(t, font(j)) : 0))[i];
    const fits = step => {
        let before = -1;
        for (let i = 0; i < n; i += step) {
            if (!texts[i] || !Number.isFinite(positions[i]))
                continue;
            if (before >= 0 && Math.abs(positions[i] - positions[before]) < (width(i) + width(before))/2 + gap)
                return false;
            before = i;
        }
        return true;
    };
    for (let step = 1; step < n; step++)
        if (fits(step))
            return step;
    return n;
};
