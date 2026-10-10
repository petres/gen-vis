export { layout, axisNames, visibleKeys, plotRows, plotGroups };

import { categoryOrder, convert, filter, groupBy, stack } from "@/utils/data";
import * as d3 from "@/utils/d3";
import { bind, constant, evaluate, refNames } from "@/utils/props";
import { makeScale } from "@/utils/scales";

/**
 * The view of a visualisation, computed from its store without Vue: the rows
 * shown, the facets with their rows, sizes and scales, and the scales of
 * colors, the components only draw it. The scales of colors and the ones of
 * `facets.scales` are the same in all facets, the others are the ones of the
 * rows of a facet. The rows are not changed, values computed of them, e.g.
 * the stacks, are kept beside them.
 */

// the names of the mappings of the positions (h) and of the values (v) of
// the hover and the stacks, e.g. of the horizontal and the vertical axis
const axisNames = store => {
    if (store.coord.names)
        return store.coord.names(store);
    const axis = {};
    Object.entries(store.def.mapping).filter(([, m]) => m.scale).forEach(([n, m]) => {
        Object.entries(store.coord.axis).forEach(([a, orientation]) => {
            if (m.scale.orientation == orientation)
                axis[a] = n;
        });
    });
    return axis;
};

// the visible categories of the mappings with props, e.g. of the legends,
// in the order of the categories
const visibleKeys = def => Object.entries(def.mapping)
    .filter(([, m]) => m.props)
    .map(([dim, m]) => ({ dim, key: m.keys.filter(k => m.props[k].visible) }));

// the facets in the order of the categories of their mapping, not of the
// rows, only the ones with rows
const facetEntries = (store, rows) => {
    const d = store.def.facets.dim;
    const { props, keys } = store.mapping(d);
    return groupBy(rows, [d])
        .filter(g => keys.includes(String(g.group[d])))
        .sort((a, b) => keys.indexOf(String(a.group[d])) - keys.indexOf(String(b.group[d])))
        .map(g => ({ key: g.group[d], name: props[g.group[d]].name, rows: g.entries }));
};

/**
 * The view of the store in the `width` of the visualisation, the globals
 * and the width are the references of the definition, e.g. of the height.
 */
const layout = (store, width) => {
    const def = store.def;
    const axis = axisNames(store);
    const scope = { ...def.globals, totalWidth: width };

    // the rows of the visible categories and of the values of `filter`, e.g.
    // of a global of a form element, they are compared as the values of the
    // rows, e.g. dates as timestamps
    const visible = visibleKeys(def);
    const values = Object.entries(def.filter ?? {}).map(([dim, v]) => ({
        dim,
        key: [evaluate(v, scope)].flat().map(k => convert(store.mapping(dim), k)),
    }));
    const rows = filter(store.data, [...visible, ...values]);

    // the start and the end of the stacked values of the rows, stacked in the
    // order of the categories, not of the rows
    const stacks = axis.v && store.mapping(axis.v).stacked
        ? stack(rows, axis, def.facets ? [def.facets.dim] : [], categoryOrder(visible.map(f => ({ dim: f.dim, keys: f.key }))))
        : null;
    const stackOf = stacks ? row => stacks.get(row) : null;

    // without facets, or if no facet has rows, one of all rows
    const entries = def.facets ? facetEntries(store, rows) : [];
    const faceted = entries.length > 0;

    // the sizes of a facet
    const margins = def.options.margins;
    const cols = faceted ? evaluate(def.facets.cols, scope) : 1;
    const size = { width: width/cols, height: evaluate(def.options.height, scope) };
    size.innerWidth = size.width - (margins.left + margins.right);
    size.innerHeight = size.height - (margins.top + margins.bottom);
    const facetScope = { ...scope, ...size };
    const dims = store.coord.dims(size.innerWidth, size.innerHeight);

    // the scale of a mapping for the rows, in the sizes of a facet
    const scaleOf = (name, rows) => makeScale(name, store.mapping(name), rows,
        { dims, coord: store.coord, scope: facetScope, stackOf: name == axis.v ? stackOf : null });

    // the scales of all facets: the shared ones and the ones without
    // orientation, e.g. of colors
    const scaled = Object.keys(def.mapping).filter(n => def.mapping[n].scale);
    const colors = scaled.filter(n => !def.mapping[n].scale.orientation);
    const shared = faceted && def.facets.scales ? evaluate(def.facets.scales, scope) : [];
    const common = Object.fromEntries([...new Set([...shared, ...colors])].map(n => [n, scaleOf(n, rows)]));

    const facets = (faceted ? entries : [{ key: undefined, name: undefined, rows }]).map(f => ({
        ...f,
        ...size,
        margins,
        dims,
        axis,
        stackOf,
        scope: facetScope,
        scales: {
            ...common,
            ...Object.fromEntries(scaled.filter(n => !(n in common)).map(n => [n, scaleOf(n, f.rows)])),
        },
    }));

    return {
        axis,
        rows,
        stackOf,
        faceted,
        facets,
        colors: Object.fromEntries(colors.map(n => [n, common[n]])),
        height: size.height,
    };
};

// a value of a row of the data of a plot as the ones of the data, e.g. a
// date, also the values of a range, e.g. ["2020-01-01", null] of a band
const convertValue = (mapping, v) => Array.isArray(v)
    ? v.map(e => e === null ? null : convert(mapping, e))
    : (v === null ? null : convert(mapping, v));

/**
 * The rows of a plot in a facet: the rows of the facet or the ones of the
 * `data` of the plot, e.g. events. These have the names of the mappings and
 * others, e.g. a `label`, the values of the mappings are converted as the
 * ones of the data, e.g. dates, the values of rows of the definition are
 * props of the facet, e.g. references to globals. A row with a value of the
 * mapping of the facets is only in its facet.
 */
const plotRows = (store, plot, facet) => {
    if (!plot.data)
        return facet.rows;
    const mapping = store.def.mapping;
    const dim = store.def.facets?.dim;
    const inline = !plot.loaded;
    return plot.data
        .map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => {
            const value = inline ? evaluate(v, facet.scope) : v;
            return [k, Object.hasOwn(mapping, k) ? convertValue(mapping[k], value) : value];
        })))
        .filter(r => !dim || facet.key === undefined || !Object.hasOwn(r, dim) || String(r[dim]) == String(facet.key));
};

// one row of the rows of a group: the first or the last one, in the order of
// the rows, or the one with the least or the most value of a mapping, e.g.
// { "max": "x" }, of the rows with values of the mappings of the props
const selected = (rows, select) => {
    if (select == 'first' || select == 'last')
        return select == 'first' ? rows.slice(0, 1) : rows.slice(-1);
    const [kind, name] = Object.entries(select ?? {})[0] ?? [];
    const values = rows.filter(r => r[name] !== null && r[name] !== undefined);
    const row = kind == 'min' ? d3.least(values, r => r[name]) : (kind == 'max' ? d3.greatest(values, r => r[name]) : undefined);
    return row ? [row] : [];
};

// a name of the rows of a facet as a function of the row, e.g. "x" or
// "x:scaled", undefined for other names, see README "Props"
const rowValue = (ctx, name, rows) => {
    const [m, ...parts] = name.split(':');
    // the other names of the rows of the data of a plot, e.g. a label
    if (!Object.hasOwn(ctx.store.def.mapping, m))
        return rows !== ctx.rows && rows.some(r => Object.hasOwn(r, name)) ? (row => row[name]) : undefined;
    const s = ctx.scales[m];
    const stackOf = ctx.axis.v == m ? ctx.stackOf : null;
    const start = row => stackOf(row)?.[0];
    const end = row => stackOf(row)?.[1];
    const values = {
        '': () => row => row[m],
        'scaled': () => s && (row => s(row[m])),
        'scaled:0': () => s && constant(s(0)),
        'scaled:min': () => s && constant(s(s.domain()[0])),
        'scaled:max': () => s && constant(s(s.domain().at(-1))),
        'start': () => stackOf && start,
        'end': () => stackOf && end,
        'start:scaled': () => stackOf && s && (row => s(start(row))),
        'end:scaled': () => stackOf && s && (row => s(end(row))),
        'height:scaled': () => stackOf && s && (row => s(start(row)) - s(end(row))),
    };
    return values[parts.join(':')]?.() || undefined;
};

/**
 * The groups of the rows of a plot by its categories, see plots/index.js:
 * the props of their categories (`props`), their `rows`, the values of the
 * props of the plot of a row (`at(row)`, `prop(name)(row)` of one prop) and
 * the ones which are the same for all rows (`attrs`), e.g. the color of a
 * line. The names of the props are the props of the categories, the names
 * of the rows (see rowValue) and the ones of the facet (`ctx.scope`), in
 * this order. `complete(row)` is false if a mapping of the props has no
 * value, e.g. a point is not drawn.
 */
const plotGroups = (plot, rows, ctx) => {
    const mapping = ctx.store.def.mapping;
    const needed = [...new Set(refNames(plot.props).map(n => n.split(':')[0]))].filter(m => Object.hasOwn(mapping, m));
    const complete = row => needed.every(m => row[m] !== null);
    return groupBy(rows, plot.categories).map(g => {
        const props = Object.assign({}, ...plot.categories.map(c => mapping[c].props?.[g.group[c]]));
        const resolve = name => Object.hasOwn(props, name) ? constant(props[name])
            : rowValue(ctx, name, rows) ?? (Object.hasOwn(ctx.scope, name) ? constant(ctx.scope[name]) : undefined);
        const at = bind(plot.props, resolve);
        return {
            categories: g.group,
            props,
            rows: plot.select === undefined ? g.entries : selected(g.entries.filter(complete), plot.select),
            at,
            prop: name => at.entries.get(name) ?? constant(undefined),
            attrs: Object.fromEntries([...at.entries].filter(([, f]) => f.constant).map(([k, f]) => [k, f()])),
            complete,
        };
    });
};
