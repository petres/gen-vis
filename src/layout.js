export { layout, axisNames, visibleKeys, plotRows, plotGroups, withColor };

import { categoryOrder, compareCategories, continuous, convert, filter, groupBy, rowFilter, stack } from "@/utils/data";
import * as d3 from "@/utils/d3";
import { bind, constant, evaluate, formatter, refNames } from "@/utils/props";
import { bandCenter, makeScale } from "@/utils/scales";

/**
 * The view of a visualisation, computed from its store without Vue: the rows
 * shown, the facets with their rows, sizes and scales, and the scales of
 * colors, the components only draw it. The scales of colors and the ones of
 * `facets.scales` are the same in all facets, the others are the ones of the
 * rows of a facet. The rows are not changed, values computed of them, e.g.
 * the stacks, are kept beside them.
 */

// the names of the mappings of the positions (h) and of the values (v) of
// the hover and the stacks, e.g. of the horizontal and the vertical axis.
// Of several mappings of an orientation the stacked one, the one with a
// hover or the first one. In a coordinate system with `flip` the positions
// are the vertical ones and the values the horizontal ones if these are
// stacked or the vertical ones are categories and the horizontal ones not,
// e.g. of horizontal bars, with `"flip": "stacked"` only if they are
// stacked, e.g. the angles of a pie in polar plots. A stacked mapping of the
// positions without one of the values is the one of the values, e.g. the
// angle of a pie without a radius.
const axisNames = store => {
    if (store.coord.names)
        return store.coord.names(store);
    const mapping = store.def.mapping;
    const of = orientation => {
        const names = Object.keys(mapping).filter(n => mapping[n].scale?.orientation == orientation);
        return names.find(n => mapping[n].stacked) ?? names.find(n => mapping[n].hover) ?? names[0];
    };
    let h = of(store.coord.axis.h);
    let v = of(store.coord.axis.v);
    const categorical = n => n !== undefined && !['numeric', 'date'].includes(mapping[n].type);
    const flip = store.coord.flip;
    if (flip && h !== undefined && (v === undefined ? mapping[h].stacked
        : (mapping[h].stacked && !mapping[v].stacked) || (flip !== 'stacked' && categorical(v) && !categorical(h))))
        [h, v] = [v, h];
    return { ...(h === undefined ? {} : { h }), ...(v === undefined ? {} : { v }) };
};

// the visible categories of the mappings with props, e.g. of the legends,
// in the order of the categories
const visibleKeys = def => Object.entries(def.mapping)
    .filter(([, m]) => m.props)
    .map(([dim, m]) => ({ dim, key: m.keys.filter(k => m.props[k].visible) }));

// the props of a category of a mapping, e.g. of a value of the data,
// undefined for other values
const ownProp = (props, key) => props && Object.hasOwn(props, key) ? props[key] : undefined;

// the facets in the order of the categories of their mapping, not of the
// rows, only the ones with rows
const facetEntries = (store, rows) => {
    const d = store.def.facets.dim;
    const m = Object.hasOwn(store.def.mapping, d) ? store.mapping(d) : null;
    if (!m?.props)
        throw new Error(`facets.dim: the facets are the categories of a mapping with props, e.g. { "fromData": true }, not '${d}'`);
    const { props, keys } = m;
    return groupBy(rows, [d])
        .filter(g => keys.includes(String(g.group[d])))
        .sort((a, b) => keys.indexOf(String(a.group[d])) - keys.indexOf(String(b.group[d])))
        .map(g => ({ key: g.group[d], name: props[String(g.group[d])].name, rows: g.entries }));
};

// the sizes of the categories of the scales of positions, e.g. `y:bandwidth`
// and `y:step` of a band scale, for the names of a facet
const scaleSizes = scales => Object.fromEntries(Object.entries(scales).filter(([, s]) => s.step)
    .flatMap(([n, s]) => [[`${n}:bandwidth`, s.bandwidth?.() ?? 0], [`${n}:step`, s.step()]]));

/**
 * The inner height of the facets of a vertical band or point scale with a
 * `step`, the pixels of a category, e.g. of a row of horizontal bars, so
 * the bars keep their size if categories are hidden and the plot is less
 * high, of the most categories of the rows of the facets (`rowsOf`), also
 * with the space of the groups of the scale, undefined without one.
 */
const stepHeight = (store, rowsOf, scope) => {
    const mapping = store.def.mapping;
    const name = Object.keys(mapping).find(n => mapping[n].scale?.step !== undefined && mapping[n].scale.orientation == 'vertical'
        && ['band', 'point'].includes(mapping[n].scale.type));
    if (name === undefined)
        return undefined;
    const m = mapping[name];
    const step = Number(evaluate(m.scale.step, scope));
    if (!(step > 0))
        return undefined;
    // the steps of the categories of a range of the length 1, e.g. the
    // categories, their padding and the space between groups
    const unit = { ...m, scale: { ...m.scale, range: [0, 1], inset: undefined } };
    const steps = Math.max(0, ...rowsOf.map(rows => {
        const s = makeScale(name, unit, rows, { scope });
        return s.domain().length > 0 ? 1/s.step() : 0;
    }));
    return Math.round(steps*step);
};

/**
 * The view of the store in the `width` of the visualisation, the globals
 * and the width are the references of the definition, e.g. of the height.
 */
const layout = (store, width) => {
    const def = store.def;
    const axis = axisNames(store);
    const scope = { ...def.globals, totalWidth: width, [formatter]: store.scope[formatter] };

    // the rows of the visible categories and of the conditions of `filter`,
    // e.g. of a global of a form element, see rowFilter
    const visible = visibleKeys(def);
    const rows = filter(store.data, [...visible, ...rowFilter(def.filter, def.mapping, scope)]);

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
    // the margins can be props, e.g. steps of the width of the visualisation
    const margins = Object.fromEntries(Object.entries(def.options.margins).map(([k, v]) => [k, Number(evaluate(v, scope)) || 0]));
    const cols = faceted ? evaluate(def.facets.cols, scope) : 1;
    // the height of the categories of a scale with a `step`, e.g. of the rows
    // of horizontal bars, the height of the definition otherwise
    const stepped = stepHeight(store, faceted ? entries.map(f => f.rows) : [rows], scope);
    const size = { width: width/cols, height: stepped === undefined ? evaluate(def.options.height, scope) : stepped + margins.top + margins.bottom };
    size.innerWidth = size.width - (margins.left + margins.right);
    size.innerHeight = size.height - (margins.top + margins.bottom);
    const dims = store.coord.dims(size.innerWidth, size.innerHeight);
    // the radius of polar plots is a size of the facet, e.g. of the hole of a donut
    const facetScope = { ...scope, ...size, ...(dims.radius === undefined ? {} : { radius: dims.radius }) };

    // the mappings with the scale of another one (`"scale": { "of": "y" }`),
    // e.g. the end of a band, their values are in its domain
    const borrowed = Object.keys(def.mapping).filter(n => def.mapping[n].scale?.of !== undefined);
    const also = name => borrowed.filter(n => def.mapping[n].scale.of === name);

    // the scale of a mapping for the rows, in the sizes of a facet
    const scaleOf = (name, rows) => makeScale(name, store.mapping(name), rows,
        { dims, coord: store.coord, scope: facetScope, stackOf: name == axis.v ? stackOf : null, also: also(name) });

    // the scales of all facets: the shared ones and the ones without
    // orientation, e.g. of colors
    const scaled = Object.keys(def.mapping).filter(n => def.mapping[n].scale && !borrowed.includes(n));
    const colors = scaled.filter(n => !def.mapping[n].scale.orientation);
    const shared = faceted && def.facets.scales ? evaluate(def.facets.scales, scope) : [];
    const common = Object.fromEntries([...new Set([...shared, ...colors])].map(n => [n, scaleOf(n, rows)]));

    const facets = (faceted ? entries : [{ key: undefined, name: undefined, rows }]).map(f => {
        const scales = {
            ...common,
            ...Object.fromEntries(scaled.filter(n => !Object.hasOwn(common, n)).map(n => [n, scaleOf(n, f.rows)])),
        };
        borrowed.filter(n => Object.hasOwn(scales, def.mapping[n].scale.of)).forEach(n => scales[n] = scales[def.mapping[n].scale.of]);
        return {
            ...f,
            ...size,
            margins,
            dims,
            axis,
            stackOf,
            // the sizes of the bands of the scales, e.g. "@y:bandwidth" of annotations
            scope: { ...facetScope, ...scaleSizes(scales) },
            scales,
        };
    });

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
 * mapping of the facets is only in its facet. `filter` of the plot leaves
 * out rows, see rowFilter.
 */
const plotRows = (store, plot, facet) => {
    const conditions = rowFilter(plot.filter, store.def.mapping, facet.scope, `plot ${plot.id}: filter`);
    if (!plot.data)
        return conditions.length > 0 ? filter(facet.rows, conditions) : facet.rows;
    const mapping = store.def.mapping;
    const dim = store.def.facets?.dim;
    const inline = !plot.loaded;
    const rows = plot.data
        .map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => {
            const value = inline ? evaluate(v, facet.scope) : v;
            return [k, Object.hasOwn(mapping, k) ? convertValue(mapping[k], value) : value];
        })))
        .filter(r => !dim || facet.key === undefined || !Object.hasOwn(r, dim) || String(r[dim]) == String(facet.key));
    return conditions.length > 0 ? filter(rows, conditions) : rows;
};

// one row of the rows of a group: the first or the last one, in the order of
// the rows, or the one with the least or the most value of a mapping, e.g.
// { "max": "x" }, of the rows with values of the mappings of the props,
// categories as numbers if they are numbers, e.g. "10" after "9"
const selected = (rows, select, mapping) => {
    if (select == 'first' || select == 'last')
        return select == 'first' ? rows.slice(0, 1) : rows.slice(-1);
    const [kind, name] = Object.entries(select ?? {})[0] ?? [];
    const values = rows.filter(r => r[name] !== null && r[name] !== undefined);
    const compare = Object.hasOwn(mapping, name) && !continuous(mapping[name])
        ? (a, b) => compareCategories(a[name], b[name])
        : r => r[name];
    const row = kind == 'min' ? d3.least(values, compare) : (kind == 'max' ? d3.greatest(values, compare) : undefined);
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
    // the format of the hover of the mapping or the one of the locale
    const format = () => {
        const f = ctx.store.valueFormat(m, s);
        return row => row[m] === null || row[m] === undefined ? '' : f(row[m]);
    };
    const start = row => stackOf(row)?.[0];
    const end = row => stackOf(row)?.[1];
    const values = {
        '': () => row => row[m],
        'formatted': format,
        'scaled': () => s && (row => s(row[m])),
        // the center of a band, e.g. of a label of a bar
        'scaled:center': () => s && (row => s(row[m]) + bandCenter(s)),
        'scaled:min': () => s && constant(s(s.domain()[0])),
        'scaled:max': () => s && constant(s(s.domain().at(-1))),
        // the size of a band and the distance of the categories, e.g. of a band scale
        'bandwidth': () => s && constant(s.bandwidth?.() ?? 0),
        // the start of the first band and the end of the last band of the
        // group of the category, see `groups` of scales, of other scales the
        // band of the category
        'group:start': () => s?.step && (row => s.groupExtent ? s.groupExtent(row[m])[0] : s(row[m])),
        'group:end': () => s?.step && (row => s.groupExtent ? s.groupExtent(row[m])[1] : s(row[m]) + (s.bandwidth?.() ?? 0)),
        'step': () => s && constant(s.step?.() ?? 0),
        'start': () => stackOf && start,
        'end': () => stackOf && end,
        'start:scaled': () => stackOf && s && (row => s(start(row))),
        'end:scaled': () => stackOf && s && (row => s(end(row))),
        'height:scaled': () => stackOf && s && (row => s(start(row)) - s(end(row))),
        // the middle of a stacked value, e.g. of a label in its stack
        'mid': () => stackOf && (row => (start(row) + end(row))/2),
        'mid:scaled': () => stackOf && s && (row => s((start(row) + end(row))/2)),
    };
    const kind = parts.join(':');
    // the position of a value, e.g. "@x:scaled:0" or "@y:scaled:100"
    const at = /^scaled:(-?\d+(?:\.\d+)?)$/.exec(kind);
    if (at)
        return s ? constant(s(convert(ctx.store.mapping(m), at[1]))) : undefined;
    return Object.hasOwn(values, kind) ? values[kind]() || undefined : undefined;
};

// the props of categories (a list of them, the later ones override the ones
// before) and, if none of them has a color, the default color of the first
// one which has one, see prepareMapping of utils/def.js
const withColor = parts => {
    const props = Object.assign({}, ...parts);
    if (props.color === undefined) {
        const first = parts.find(p => p?.defaultColor !== undefined);
        if (first)
            props.color = first.defaultColor;
    }
    return props;
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
        const props = withColor(plot.categories.map(c => ownProp(mapping[c].props, g.group[c])));
        const scoped = name => Object.hasOwn(ctx.scope, name) ? constant(ctx.scope[name]) : undefined;
        const resolve = name => typeof name == 'symbol' ? scoped(name) : (Object.hasOwn(props, name) ? constant(props[name])
            : rowValue(ctx, name, rows) ?? scoped(name));
        const at = bind(plot.props, resolve);
        return {
            categories: g.group,
            props,
            rows: plot.select === undefined ? g.entries : selected(g.entries.filter(complete), plot.select, mapping),
            at,
            prop: name => at.entries.get(name) ?? constant(undefined),
            attrs: Object.fromEntries([...at.entries].filter(([, f]) => f.constant).map(([k, f]) => [k, f()])),
            complete,
        };
    });
};
