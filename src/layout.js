export { layout, axisNames, visibleKeys, plotRows, plotGroups, withColor, unknownOf, gridOf, facetDims, inFacet };

import { categoryOrder, continuous, convert, filter, groupBy, keptRows, rowFilter, stack } from "@/utils/data";
import * as d3 from "@/utils/d3";
import { bind, constant, evaluate, formatter, refNames } from "@/utils/expr";
import { bandCenter, makeScale } from "@/utils/scales";
import { compareCategories } from "@/utils/values";
import { facetMappings } from "@/utils/normalize";
import { warnOnce } from "@/utils/warn";

// the warning of a condition of a filter of no mapping, e.g. of a column
// instead of the mapping of it, which no row has, see rowFilter
const unknownOf = store => (path, dim) => warnOnce(store, `unknown ${path}`,
    `${path}: unknown mapping '${dim}', the keys of a filter are the names of mappings, not columns, no row is drawn`);

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
    // the positions of the stacks of `stackBy` are the ones of the hover,
    // e.g. the start of the class of a bin, not the values of the rows
    const by = v === undefined ? undefined : mapping[v].stacked && mapping[v].stackBy;
    if (by && Object.hasOwn(mapping, by))
        h = by;
    return { ...(h === undefined ? {} : { h }), ...(v === undefined ? {} : { v }) };
};

// the visible categories of the mappings with categories, e.g. of the legends,
// in the order of the categories
const visibleKeys = def => Object.entries(def.mapping)
    .filter(([, m]) => m.categoryProps)
    .map(([dim, m]) => ({ dim, key: m.keys.filter(k => m.categoryProps[k].visible) }));

// the conditions of the visible categories (see visibleKeys): the rows of a
// hidden category are left out, the ones without a value are in no category
// and stay, e.g. rows of other plots which do not use the mapping
const visibleRows = visible => visible.map(({ dim, key }) => {
    const keys = new Set(key.map(String));
    return { dim, key: v => v === null || v === undefined || keys.has(String(v)) };
});

// the props of a category of a mapping, e.g. of a value of the data,
// undefined for other values
const ownProp = (props, key) => props && Object.hasOwn(props, key) ? props[key] : undefined;

// the facets in the order of the categories of their mapping, not of the
// rows, only the ones with rows
/**
 * The mappings of the rows and the columns of a grid of facets
 * (`"facets": { "rows": "band", "cols": "group" }`, a string of `cols` is a
 * mapping, a number the columns of the facets of `dim`), null otherwise.
 */
const gridOf = def => {
    const { grid, rows, cols } = facetMappings(def.facets);
    return grid ? { rows, cols } : null;
};

// the mappings of the facets, e.g. of their groups of rows and stacks
const facetDims = def => {
    const g = gridOf(def);
    return g ? [g.rows, g.cols].filter(Boolean) : def.facets ? [def.facets.dim] : [];
};

// the key of the facet of the values of the mappings of the facets (`values`,
// e.g. a row or a group), of a grid the pair of its row and its column
const facetKey = (def, values) => {
    const g = gridOf(def);
    return g ? JSON.stringify([g.rows ? String(values[g.rows]) : '', g.cols ? String(values[g.cols]) : '']) : values[def.facets.dim];
};

// the mapping of a part of a grid with the categories of the facets
const gridMapping = (store, part, d) => {
    const m = Object.hasOwn(store.def.mapping, d) ? store.mapping(d) : null;
    if (!m?.categoryProps)
        throw new Error(`facets.${part}: the facets are the categories of a mapping, e.g. { "fromData": true }, not '${d}'`);
    return m;
};

/**
 * The cells of a grid of facets: a facet per category of the mapping of the
 * rows and of the columns which are in the rows, in the order of their
 * categories, also of the combinations without rows (`empty`, a box of
 * the size of a facet), each with its `cell`: the keys, the names and the
 * indexes of its row and column. Without categories with rows none.
 */
const gridEntries = (store, rows, grid) => {
    const groups = new Map(groupBy(rows, facetDims(store.def)).map(g => [facetKey(store.def, g.group), g.entries]));
    const keysOf = (part, d) => {
        if (!d)
            return [{ key: undefined, name: undefined }];
        const m = gridMapping(store, part, d);
        const present = new Set(rows.map(r => String(r[d])));
        return m.keys.filter(k => present.has(k)).map(k => ({ key: k, name: m.categoryProps[k].name }));
    };
    const rowKeys = keysOf('rows', grid.rows);
    const colKeys = keysOf('cols', grid.cols);
    return rowKeys.flatMap((r, ri) => colKeys.map((c, ci) => {
        const key = JSON.stringify([r.key ?? '', c.key ?? '']);
        const cellRows = groups.get(key) ?? [];
        return {
            key,
            // the title of the cells of the first row, the names of the columns
            name: c.name,
            rows: cellRows,
            empty: cellRows.length == 0,
            cell: { row: r.key, col: c.key, rowName: r.name, colName: c.name, rowIndex: ri, colIndex: ci, rows: rowKeys.length, cols: colKeys.length },
        };
    }));
};

const facetEntries = (store, rows) => {
    const grid = gridOf(store.def);
    if (grid)
        return gridEntries(store, rows, grid);
    const d = store.def.facets.dim;
    const m = Object.hasOwn(store.def.mapping, d) ? store.mapping(d) : null;
    if (!m?.categoryProps)
        throw new Error(`facets.dim: the facets are the categories of a mapping, e.g. { "fromData": true }, not '${d}'`);
    const { categoryProps: props, keys } = m;
    return groupBy(rows, [d])
        .filter(g => keys.includes(String(g.group[d])))
        .sort((a, b) => keys.indexOf(String(a.group[d])) - keys.indexOf(String(b.group[d])))
        .map(g => ({ key: g.group[d], name: props[String(g.group[d])].name, rows: g.entries }));
};

/**
 * The edges and the size of the plot area in the coordinates of the plots
 * (`@plot:top`, ...), e.g. 0 to innerHeight of cartesian plots and around the
 * center of polar ones, unlike `height` of the facet, which includes the
 * margins (the `height` of a range of a scale is the one of the plot area).
 */
const plotArea = (coord, { innerWidth: w, innerHeight: h }) => {
    const [x, y] = coord.origin?.(w, h) ?? [0, 0];
    return { 'plot:left': x ? -x : 0, 'plot:top': y ? -y : 0, 'plot:right': w - x, 'plot:bottom': h - y, 'plot:width': w, 'plot:height': h };
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
const stepHeight = (store, rowsOf, scope, domainOf) => {
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
    const steps = Math.max(0, ...rowsOf.map(([rows, key]) => {
        const s = makeScale(name, unit, rows, { scope, domainRows: domainOf(name, key)?.rows });
        return s.domain().length > 0 ? 1/s.step() : 0;
    }));
    return Math.round(steps*step);
};

// the rows and the positions of the stacks of the stacked mapping: the ones
// of the positions (`axis.h`) or of `stackBy` of the mapping, e.g. the
// start of the class of a bin (`lo`) of a histogram whose x are the values
// of the rows, the rows without one are not stacked
const stackSource = (def, axis, rows) => {
    const by = def.mapping[axis.v]?.stackBy;
    return by === undefined ? [rows, axis] : [rows.filter(r => r[by] !== null && r[by] !== undefined), { ...axis, h: by }];
};

// the rows of a view, see layout
const rowsOf = (store, def, axis, scope, stacked) => {
    // the rows of the conditions of `filter`, e.g. of a global of a form
    // element, see rowFilter, and of them the ones of the visible categories
    const visible = visibleKeys(def);
    const filtered = filter(keptRows(store.data, store.columns), rowFilter(def.filter, def.mapping, scope, 'filter', unknownOf(store)));
    const shown = visibleRows(visible);
    const rows = shown.length > 0 ? filter(filtered, shown) : filtered;

    // the start and the end of the stacked values of the rows, stacked in the
    // order of the categories, not of the rows, the rows of the conditions of
    // `stacked` (all of `true`), e.g. { "type": { "not": "load" } }, the
    // others have their own value as start and end, e.g. a line of a total
    // on stacked areas
    const stackOrder = categoryOrder(visible.map(f => ({ dim: f.dim, keys: f.key })));
    const stackedRows = stacked && stacked !== true
        ? filter(rows, rowFilter(stacked, def.mapping, scope, `mapping.${axis.v}.stacked`)) : rows;
    const stacks = stacked ? stack(...stackSource(def, axis, stackedRows), facetDims(def), stackOrder) : null;
    const stackOf = stacks ? row => stacks.get(row) ?? [row[axis.v], row[axis.v]] : null;
    const isStacked = stacks ? row => stacks.has(row) : null;

    // without facets, or if no facet has rows, one of all rows
    const entries = def.facets ? facetEntries(store, rows) : [];
    return {
        rows, stackOrder, stackOf, isStacked, entries,
        domains: domainRows(store, def, axis, scope, stacked, shown, stackOrder),
        // the categories of the filtered rows of the legends with `onlyData`,
        // also the hidden ones, e.g. the sources of the selected year
        inData: Object.fromEntries(Object.keys(def.mapping).filter(n => def.mapping[n].legend?.onlyData)
            .map(n => [n, new Set(filtered.map(r => String(r[n])))])),
        // the rows are kept for another width if their conditions do not
        // depend on it, see layout
        keep: !ofWidth(def.filter) && !(stacked && stacked !== true && ofWidth(stacked)),
    };
};

/**
 * The rows of the domains of the scales with `domainIgnores` by their
 * mapping: the rows of the other conditions of `filter`, e.g. of all months
 * of a slider, of the visible categories, as the ones of a facet
 * (`facets`, by the key of the facet), the stacks of them (`stackOf`) are
 * also the ones of the values of the ignored conditions, e.g. per month.
 */
const domainRows = (store, def, axis, scope, stacked, shown, stackOrder) => {
    const conditions = Object.keys(def.filter ?? {});
    const kept = new Map();
    const domains = {};
    Object.entries(def.mapping).forEach(([n, m]) => {
        const ignores = m.scale?.of === undefined ? m.scale?.domainIgnores : undefined;
        const names = ignores ? conditions.filter(c => ignores === true || ignores.includes(c)) : [];
        if (names.length == 0)
            return;
        const key = names.join('\0');
        if (!kept.has(key)) {
            const others = Object.fromEntries(Object.entries(def.filter).filter(([c]) => !names.includes(c)));
            kept.set(key, filter(keptRows(store.data, store.columns), [...rowFilter(others, def.mapping, scope), ...shown]));
        }
        const rows = kept.get(key);
        const dims = facetDims(def);
        let stackOf = null;
        if (n == axis.v && stacked) {
            const stackedRows = stacked !== true ? filter(rows, rowFilter(stacked, def.mapping, scope, `mapping.${n}.stacked`)) : rows;
            const stacks = stack(...stackSource(def, axis, stackedRows), [...dims, ...names], stackOrder);
            stackOf = row => stacks.get(row) ?? [row[n], row[n]];
        }
        const facets = def.facets ? new Map(groupBy(rows, dims).map(g => [String(facetKey(def, g.group)), g.entries])) : null;
        domains[n] = { rows, stackOf, facets };
    });
    return domains;
};

// the parts of a view which do not depend on the width, see layout
const rowsKept = Symbol('rowsKept');

// the names of the scope which change with the width, of the conditions of
// the rows (`filter`, `stacked`), see layout
const widthNames = ['totalWidth'];
const ofWidth = raw => raw !== undefined && raw !== null && typeof raw != 'boolean'
    && refNames(raw).some(n => widthNames.includes(n));

/**
 * The view of the store in the `width` of the visualisation, the globals
 * and the width are the references of the definition, e.g. of the height.
 * The rows of the view `before` of the same store are kept, e.g. of a new
 * width (only of a resize, not of a change of the store, e.g. of the state,
 * the data or the definition, as these change parts of it in place), the
 * scales of the same rows keep their values, see valuesOf of utils/scales.js.
 */
const layout = (store, width, before = null) => {
    const def = store.def;
    const axis = axisNames(store);
    const scope = { ...def.globals, totalWidth: width, [formatter]: store.scope[formatter] };
    const stacked = axis.v ? store.mapping(axis.v).stacked : undefined;
    const kept = before?.[rowsKept];
    const reuse = kept?.keep && kept.store === store && kept.def === def && kept.data === store.data && kept.columns === store.columns
        && kept.coord === store.coord && kept.stateSets === store.stateSets && kept.loads === store.loads
        && kept.axisV === axis.v && kept.axisH === axis.h && kept.stacked === stacked;
    const parts = reuse ? kept : {
        ...rowsOf(store, def, axis, scope, stacked),
        store, def, data: store.data, columns: store.columns, coord: store.coord, stateSets: store.stateSets,
        loads: store.loads, axisV: axis.v, axisH: axis.h, stacked,
    };
    const { rows, stackOrder, stackOf, isStacked, entries, domains } = parts;

    // the rows of the domain of a scale with `domainIgnores`, of the rows of
    // a facet (`key`) or of all rows (undefined), null of other scales
    const domainOf = (name, key) => {
        const d = Object.hasOwn(domains, name) ? domains[name] : null;
        return d && (key === undefined || !d.facets ? d : { rows: d.facets.get(String(key)) ?? [], stackOf: d.stackOf });
    };

    const faceted = entries.length > 0;

    // the sizes of a facet
    // the margins can be props, e.g. steps of the width of the visualisation
    const margins = Object.fromEntries(Object.entries(def.options.margins).map(([k, v]) => [k, Number(evaluate(v, scope)) || 0]));
    const grid = faceted ? gridOf(def) : null;
    const cols = grid ? entries[0].cell.cols : (faceted ? evaluate(def.facets.cols, scope) : 1);
    // the width of the facets of a grid without the one of the headers of
    // its rows, see facets.js
    const usable = grid ? Math.max(0, width - (store.rowHeaderWidth ?? 0)) : width;
    // the height of the categories of a scale with a `step`, e.g. of the rows
    // of horizontal bars, the height of the definition otherwise
    const stepped = stepHeight(store, faceted ? entries.map(f => [f.rows, f.key]) : [[rows]], scope, domainOf);
    const size = { width: usable/cols, height: stepped === undefined ? evaluate(def.options.height, scope) : stepped + margins.top + margins.bottom };
    // a container smaller than its margins has no room, not a negative one,
    // which would flip the ranges of the scales, e.g. a negative radius
    size.innerWidth = Math.max(0, size.width - (margins.left + margins.right));
    size.innerHeight = Math.max(0, size.height - (margins.top + margins.bottom));
    const dims = store.coord.dims(size.innerWidth, size.innerHeight);
    if (dims.radius !== undefined)
        dims.radius = Math.max(0, dims.radius);
    // the radius of polar plots is a size of the facet, e.g. of the hole of a donut
    const facetScope = { ...scope, ...size, ...(dims.radius === undefined ? {} : { radius: dims.radius }), ...plotArea(store.coord, size) };

    // the mappings with the scale of another one (`"scale": { "of": "y" }`),
    // e.g. the end of a band, their values are in its domain
    const borrowed = Object.keys(def.mapping).filter(n => def.mapping[n].scale?.of !== undefined);
    const also = name => borrowed.filter(n => def.mapping[n].scale.of === name);

    // the scale of a mapping for the rows, in the sizes of a facet, of the
    // facet `key` (undefined of all rows)
    const scaleOf = (name, rows, key) => {
        const domain = domainOf(name, key);
        return makeScale(name, store.mapping(name), rows, { dims, coord: store.coord, scope: facetScope, mappings: def.mapping,
            stackOf: name == axis.v ? stackOf : null, also: also(name), domainRows: domain?.rows, domainStackOf: domain?.stackOf });
    };

    // the scales of all facets: the shared ones and the ones without
    // orientation, e.g. of colors
    const scaled = Object.keys(def.mapping).filter(n => def.mapping[n].scale && !borrowed.includes(n));
    const colors = scaled.filter(n => !def.mapping[n].scale.orientation);
    // the scales of all facets (a list of mappings) or of each row or column
    // of a grid (`{ "y": "row", "x": "all" }`)
    const raw = faceted && def.facets.scales ? evaluate(def.facets.scales, scope) : [];
    const sharing = Array.isArray(raw) ? Object.fromEntries(raw.map(n => [n, 'all'])) : (raw && typeof raw == 'object' ? raw : {});
    const shared = Object.keys(sharing).filter(n => sharing[n] == 'all');
    const common = Object.fromEntries([...new Set([...shared, ...colors])].map(n => [n, scaleOf(n, rows)]));
    // the scales of a row or a column of a grid, of the rows of its facets
    const partScales = new Map();
    const partScale = (n, f) => {
        const part = sharing[n] == 'row' ? f.cell.rowIndex : f.cell.colIndex;
        const id = `${n} ${sharing[n]} ${part}`;
        if (!partScales.has(id))
            partScales.set(id, scaleOf(n, entries.filter(e => (sharing[n] == 'row' ? e.cell.rowIndex : e.cell.colIndex) === part).flatMap(e => e.rows)));
        return partScales.get(id);
    };

    // the edges of the grid of facets a facet is at, e.g. the bottom row
    // without a facet below it, see `facets.axisTitles`, of a grid without a
    // facet (not an empty cell) beyond it, e.g. the facet above an empty
    // cell of the bottom row has the labels and the title of x
    const count = faceted ? entries.length : 1;
    const beyond = (cell, same, index, side) => entries.some(e => !e.empty && e.cell[same] == cell[same] && Math.sign(e.cell[index] - cell[index]) == side);
    const outerOf = (i, cell) => cell
        ? { top: !beyond(cell, 'colIndex', 'rowIndex', -1), bottom: !beyond(cell, 'colIndex', 'rowIndex', 1),
            left: !beyond(cell, 'rowIndex', 'colIndex', -1), right: !beyond(cell, 'rowIndex', 'colIndex', 1) }
        :{ top: i < cols, bottom: i + cols >= count, left: i % cols == 0, right: i % cols == cols - 1 || i == count - 1 };
    const facets = (faceted ? entries : [{ key: undefined, name: undefined, rows }]).map((f, i) => {
        const scales = {
            ...common,
            ...Object.fromEntries(scaled.filter(n => !Object.hasOwn(common, n))
                .map(n => [n, f.cell && ['row', 'col'].includes(sharing[n]) ? partScale(n, f) : scaleOf(n, f.rows, f.key)])),
        };
        borrowed.filter(n => Object.hasOwn(scales, def.mapping[n].scale.of)).forEach(n => scales[n] = scales[def.mapping[n].scale.of]);
        return {
            ...f,
            ...size,
            margins,
            dims,
            axis,
            stackOf,
            isStacked,
            stackOrder,
            outer: outerOf(i, f.cell),
            // the mappings whose scale is the one of all facets or of the row or the column
            sharing,
            // the sizes of the bands of the scales, e.g. "@y:bandwidth" of annotations
            // also the key and the name of the facet, e.g. of a text once per facet
            scope: { ...facetScope, ...scaleSizes(scales), ...(faceted ? { facet: f.key, 'facet:name': f.name } : {}),
                // the row and the column of a facet of a grid
                ...(f.cell ? { 'facet:row': f.cell.row, 'facet:col': f.cell.col, 'facet:row:name': f.cell.rowName, 'facet:col:name': f.cell.colName } : {}) },
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
        inData: parts.inData,
        height: size.height,
        [rowsKept]: parts,
    };
};

// a value of a row of the data of a plot as the ones of the data, e.g. a
// date, also the values of a range, e.g. ["2020-01-01", null] of a band
const convertValue = (mapping, v) => Array.isArray(v)
    ? v.map(e => e === null ? null : convert(mapping, e))
    : (v === null ? null : convert(mapping, v));

// the rows of the `filter` of a plot of the rows of a facet, kept for the
// same rows if the filter has only references to globals, e.g. of the
// facet of a new width, see layout
const plotRowsKept = new WeakMap();
const onceRows = new WeakMap();
const keptPlotRows = (store, plot, facet) => {
    const globals = store.def.globals ?? {};
    const names = refNames(plot.filter);
    const own = names.every(n => Object.hasOwn(globals, n) && facet.scope[n] === globals[n]);
    const key = own ? JSON.stringify(names.map(n => globals[n])) : null;
    let kept = plotRowsKept.get(facet.rows);
    const hit = kept?.get(plot);
    if (key !== null && hit?.key === key)
        return hit.rows;
    const conditions = rowFilter(plot.filter, store.def.mapping, facet.scope, `plot ${plot.id}: filter`, unknownOf(store));
    const rows = conditions.length > 0 ? filter(facet.rows, conditions) : facet.rows;
    if (key !== null) {
        if (!kept)
            plotRowsKept.set(facet.rows, kept = new Map());
        kept.set(plot, { key, rows });
    }
    return rows;
};

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
    // one row without values per facet, e.g. a header or a unit label at
    // the edges of the plot area (@plot:top), the same one of a facet
    if (plot.once) {
        if (!onceRows.has(facet.rows))
            onceRows.set(facet.rows, [{}]);
        return onceRows.get(facet.rows);
    }
    if (!plot.data && plot.filter)
        return keptPlotRows(store, plot, facet);
    const conditions = rowFilter(plot.filter, store.def.mapping, facet.scope, `plot ${plot.id}: filter`, unknownOf(store));
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
        .filter(r => facet.key === undefined || (facet.cell ? inCell(store.def, facet.cell, r)
            : !dim || !Object.hasOwn(r, dim) || String(r[dim]) == String(facet.key)));
    return conditions.length > 0 ? filter(rows, conditions) : rows;
};

// a row of a plot is in a cell of a grid if its values of the mappings of
// the rows and the columns are the ones of the cell (or it has none)
const inCell = (def, cell, r) => {
    const g = gridOf(def);
    return (!g.rows || !Object.hasOwn(r, g.rows) || String(r[g.rows]) == String(cell.row))
        && (!g.cols || !Object.hasOwn(r, g.cols) || String(r[g.cols]) == String(cell.col));
};

/**
 * The facets of a plot or an annotation (`facet`): a key or a list of keys
 * of the facets of `dim`, of a grid also the values of the mappings of its
 * rows and columns, e.g. { "group": "Bau" } (a column, a row or a cell);
 * all facets without one.
 */
const inFacet = (def, part, facet) => {
    if (part.facet === undefined)
        return true;
    if (part.facet !== null && typeof part.facet == 'object' && !Array.isArray(part.facet)) {
        const g = gridOf(def);
        return Object.entries(part.facet).every(([d, v]) => {
            const value = g && d === g.rows ? facet.cell?.row : g && d === g.cols ? facet.cell?.col : undefined;
            return value !== undefined && [v].flat().map(String).includes(String(value));
        });
    }
    return [part.facet].flat().map(String).includes(String(facet.key));
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
// "x:scaled", undefined for other names, see docs/definition.md "Props of the definition"
const rowValue = (ctx, name, rows) => {
    // the place of the row among the rows of the plot in the facet, from 0,
    // e.g. the line of a small table, without a mapping `row`
    if (name == 'row:index' && !Object.hasOwn(ctx.store.def.mapping, 'row')) {
        const index = new Map(rows.map((r, i) => [r, i]));
        return row => index.get(row);
    }
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
        // the position of the value, of the period of a date (`interval`) its
        // middle, `scaled:start` its start
        'scaled': () => s && (s.period ? row => (s(row[m]) + s(s.period.offset(row[m])))/2 : row => s(row[m])),
        'scaled:start': () => s?.period && (row => s(row[m])),
        // the center of a band, e.g. of a label of a bar, or of the period of
        // a date (`interval`), its end
        'scaled:center': () => s && (s.period ? row => (s(row[m]) + s(s.period.offset(row[m])))/2 : row => s(row[m]) + bandCenter(s)),
        'scaled:end': () => s?.period && (row => s(s.period.offset(row[m]))),
        'scaled:min': () => s && constant(s(s.domain()[0])),
        'scaled:max': () => s && constant(s(s.domain().at(-1))),
        // the size of a band and the distance of the categories, e.g. of a band scale
        'bandwidth': () => s && constant(s.bandwidth?.() ?? 0),
        // the start of the first band and the end of the last band of the
        // group of the category, see `groups` of scales, of other scales the
        // band of the category
        'group:start': () => s?.step && (row => s.groupExtent ? s.groupExtent(row[m])[0] : s(row[m])),
        'group:end': () => s?.step && (row => s.groupExtent ? s.groupExtent(row[m])[1] : s(row[m]) + (s.bandwidth?.() ?? 0)),
        // the pixels of a category, of the period of a date its length
        'step': () => s && (s.period ? row => s(s.period.offset(row[m])) - s(row[m]) : constant(s.step?.() ?? 0)),
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

// the names of the rows which are not values of the row, e.g. "@y:scaled:max"
// of the end of the scale, a row needs no value of their mapping, see rowValue
const ofScale = /^(scaled:(min|max|-?\d+(\.\d+)?)|bandwidth|step)$/;

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
    const needed = [...new Set(refNames(plot.props).filter(n => !ofScale.test(n.split(':').slice(1).join(':')))
        .map(n => n.split(':')[0]))].filter(m => Object.hasOwn(mapping, m));
    const complete = row => needed.every(m => row[m] !== null);
    // not without data, e.g. the empty classes of a bin of no rows
    if (needed.length > 0 && rows.length > 0 && ctx.store.rows?.length > 0 && !rows.some(complete))
        warnOnce(ctx.store, `plot:${plot.id}:missing`, `plot '${plot.id}': none of its ${rows.length} rows is drawn, `
            + needed.map(m => [m, rows.filter(r => r[m] === null).length]).filter(([, n]) => n > 0)
                .map(([m, n]) => `${n} without a value of mapping '${m}'`).join(', '));
    // the rows without a value of a mapping of categories of `by` are in
    // no category, e.g. rows of other plots
    const categorized = plot.by.filter(c => mapping[c].categoryProps);
    const groups = groupBy(rows, plot.by);
    return (categorized.length ? groups.filter(g => categorized.every(c => g.group[c] !== null && g.group[c] !== undefined)) : groups).map(g => {
        const props = withColor(plot.by.map(c => ownProp(mapping[c].categoryProps, g.group[c])));
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
