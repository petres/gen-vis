export { layout, axisNames, visibleKeys, markRows, markGroups, withColor, unknownOf, gridOf, facetDims, inFacet };

import { categoryOrder, continuous, convert, filter, filterRows, groupBy, keptRows, sourceRows, stack, withoutConditions } from "@/utils/data";
import * as d3 from "@/utils/d3";
import { bind, constant, evaluate, formatter, isOperator, refNames } from "@/utils/expr";
import { isObject } from "@/utils/values";
import { autoMargins } from "@/utils/margins";
import { bandCenter, logProblems, makeScale } from "@/utils/scales";
import { compareCategories } from "@/utils/values";
import { facetBy } from "@/utils/normalize";
import { markPath, sizeOf, warnOnce, withPath } from "@/utils/warn";
import { highlightVars } from "@/utils/highlight";
import { textWidth } from "@/utils/measure";
import { directOf, elementOf, replaceRow } from "@/utils/draw";
import { markTypes } from "@/plots";
import { alongRows } from "@/plots/elements";

// the warning of a condition of a filter of no dim, e.g. of a column
// instead of the dim of it, which no row has, see rowFilter
const unknownOf = store => (path, dim) => warnOnce(store, `unknown ${path}`,
    `${path}: unknown dim '${dim}', the keys of a filter object are the names of dims, not columns (an expression reads columns, e.g. "@${dim} == 1"), no row is drawn`);

/**
 * The view of a visualisation, computed from its store without Vue: the rows
 * shown, the facets with their rows, sizes and scales, and the scales of
 * colors, the components only draw it. The scales of colors and the ones of
 * `facets.scales` are the same in all facets, the others are the ones of the
 * rows of a facet. The rows are not changed, values computed of them, e.g.
 * the stacks, are kept beside them.
 */

// the names of the dims of the positions (h) and of the values (v) of
// the hover and the stacks, e.g. of the horizontal and the vertical axis.
// Of several dims of an orientation the stacked one, the one with a
// hover or the first one. In a coordinate system with `flip` the positions
// are the vertical ones and the values the horizontal ones if these are
// stacked or the vertical ones are categories and the horizontal ones not,
// e.g. of horizontal bars, with `"flip": "stacked"` only if they are
// stacked, e.g. the angles of a pie in polar plots. A stacked dim of the
// positions without one of the values is the one of the values, e.g. the
// angle of a pie without a radius.
const axisNames = store => {
    if (store.coord.names)
        return store.coord.names(store);
    const dims = store.def.dims;
    const of = orientation => {
        const names = Object.keys(dims).filter(n => dims[n].scale?.orientation == orientation);
        return names.find(n => dims[n].stacked) ?? names.find(n => dims[n].hover) ?? names[0];
    };
    let h = of(store.coord.axis.h);
    let v = of(store.coord.axis.v);
    const categorical = n => n !== undefined && !['numeric', 'date'].includes(dims[n].type);
    const flip = store.coord.flip;
    if (flip && h !== undefined && (v === undefined ? dims[h].stacked
        : (dims[h].stacked && !dims[v].stacked) || (flip !== 'stacked' && categorical(v) && !categorical(h))))
        [h, v] = [v, h];
    // the positions of the stacks of `stackBy` are the ones of the hover,
    // e.g. the start of the class of a bin, not the values of the rows
    const by = v === undefined ? undefined : dims[v].stacked && dims[v].stackBy;
    if (by && Object.hasOwn(dims, by))
        h = by;
    return { ...(h === undefined ? {} : { h }), ...(v === undefined ? {} : { v }) };
};

// the visible categories of the dims with categories, e.g. of the legends,
// in the order of the categories
const visibleKeys = def => Object.entries(def.dims)
    .filter(([, m]) => m.categoryProps)
    .map(([dim, m]) => ({ dim, key: m.keys.filter(k => m.categoryProps[k].visible) }));

// the conditions of the visible categories (see visibleKeys): the rows of a
// hidden category are left out, the ones without a value are in no category
// and stay, e.g. rows of other marks which do not use the dim
const visibleRows = visible => visible.map(({ dim, key }) => {
    const keys = new Set(key.map(String));
    return { dim, key: v => v === null || v === undefined || keys.has(String(v)) };
});

// the props of a category of a dim, e.g. of a value of the data,
// undefined for other values
const ownProp = (props, key) => props && Object.hasOwn(props, key) ? props[key] : undefined;

// the facets in the order of the categories of their dim, not of the
// rows, only the ones with rows
/**
 * The dims of the rows and the columns of a grid of facets
 * (`"facets": { "rows": "band", "cols": "group" }`, a string of `cols` is a
 * dim, a number the columns of the facets of `dim`), null otherwise.
 */
const gridOf = def => {
    const { grid, rows, cols } = facetBy(def.facets);
    return grid ? { rows, cols } : null;
};

// the dims of the facets, e.g. of their groups of rows and stacks
const facetDims = def => {
    const g = gridOf(def);
    return g ? [g.rows, g.cols].filter(Boolean) : def.facets ? [def.facets.dim] : [];
};

// the key of the facet of the values of the dims of the facets (`values`,
// e.g. a row or a group), of a grid the pair of its row and its column
const facetKey = (def, values) => {
    const g = gridOf(def);
    return g ? JSON.stringify([g.rows ? String(values[g.rows]) : '', g.cols ? String(values[g.cols]) : '']) : values[def.facets.dim];
};

// the dim of the facets (of a part of a grid, `part`) with its
// categories, an error names the path of the definition, e.g. facets.by.rows
const facetDim = (store, part, d) => {
    const m = Object.hasOwn(store.def.dims, d) ? store.dim(d) : null;
    const path = part ? `facets.by.${part}` : 'facets.by';
    if (!m)
        throw new Error(`${path}: unknown dim '${d}', the dims are ${Object.keys(store.def.dims).map(n => `'${n}'`).join(', ') || 'none'}`);
    if (!m.categoryProps)
        throw new Error(`${path}: the facets are the categories of a dim, '${d}' has none${m.type ? ` (a ${m.type} dim)` : ''}, e.g. "type": "categorical"`);
    return m;
};

/**
 * The cells of a grid of facets: a facet per category of the dim of the
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
        const m = facetDim(store, part, d);
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
    const { categoryProps: props, keys } = facetDim(store, null, d);
    return groupBy(rows, [d])
        .filter(g => keys.includes(String(g.group[d])))
        .sort((a, b) => keys.indexOf(String(a.group[d])) - keys.indexOf(String(b.group[d])))
        .map(g => ({ key: g.group[d], name: props[String(g.group[d])].name, rows: g.entries }));
};

/**
 * The edges and the size of the plot area in the coordinates of the marks
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
 * the bars keep their size if categories are hidden and the mark is less
 * high, of the most categories of the scales of the facets (`rowsOf(name)`,
 * the rows of each and the ones of its domain, see domainOf of layout), also
 * with the space of the groups of the scale, undefined without one.
 */
const stepHeight = (store, rowsOf, scope) => {
    const dims = store.def.dims;
    const name = Object.keys(dims).find(n => dims[n].scale?.step !== undefined && dims[n].scale.orientation == 'vertical'
        && ['band', 'point'].includes(dims[n].scale.type));
    if (name === undefined)
        return undefined;
    const m = dims[name];
    const step = Number(evaluate(m.scale.step, scope));
    if (!(step > 0))
        return undefined;
    // the steps of the categories of a range of the length 1, e.g. the
    // categories, their padding and the space between groups
    const unit = { ...m, scale: { ...m.scale, range: [0, 1], inset: undefined } };
    const steps = Math.max(0, ...rowsOf(name).map(([rows, domainRows]) => {
        const s = makeScale(name, unit, rows, { scope, domainRows });
        return s.domain().length > 0 ? 1/s.step() : 0;
    }));
    return Math.round(steps*step);
};

// the rows and the positions of the stacks of the stacked dim: the ones
// of the positions (`axis.h`) or of `stackBy` of the dim, e.g. the
// start of the class of a bin (`lo`) of a histogram whose x are the values
// of the rows, the rows without one are not stacked; the slices of a pie
// (stacked angles) have no negative size, see aroundOf
const stackSource = (def, axis, rows) => {
    const by = def.dims[axis.v]?.stackBy;
    const around = aroundOf(def, axis) ? { positive: true } : def.dims[axis.v]?.stackDiverging ? { diverging: true } : {};
    return by === undefined ? [rows, { ...axis, ...around }] : [rows.filter(r => r[by] !== null && r[by] !== undefined), { ...axis, ...around, h: by }];
};
// stacks around the circle (of an angular scale), e.g. the slices of a pie:
// a negative value is left out (a slice of no size at the end of the
// stack), it would overlap the others
const aroundOf = (def, axis) => def.dims[axis.v]?.scale?.orientation == 'angular';

// the dims of the groups of the stacks besides the facets: the slots of
// dodged stacked bars (`stackGroups` of the stacked dim, see translate of
// utils/language.js), a stack per position and slot
const stackGroups = (def, axis) => [...facetDims(def), ...(def.dims[axis.v]?.stackGroups ?? [])];

// the rows of a view, see layout
const rowsOf = (store, def, axis, scope, stacked) => {
    // the rows of the conditions of `filter`, e.g. of a global of a form
    // element, see rowFilter, and of them the ones of the visible categories
    const visible = visibleKeys(def);
    const filtered = filterRows(keptRows(store.data, store.columns), def.filter, def.dims, scope, { columns: store.columns, path: 'filter', unknown: unknownOf(store) });
    const shown = visibleRows(visible);
    const rows = shown.length > 0 ? filter(filtered, shown) : filtered;

    // the start and the end of the stacked values of the rows, stacked in the
    // order of the categories, not of the rows, the rows of the conditions of
    // `stacked` (all of `true`), e.g. { "type": { "not": "load" } }, the
    // others have their own value as start and end, e.g. a line of a total
    // on stacked areas
    const stackOrder = categoryOrder(visible.map(f => ({ dim: f.dim, keys: f.key })));
    const stackedRows = stacked && stacked !== true
        ? filterRows(rows, stacked, def.dims, scope, { columns: store.columns, path: `dims.${axis.v}.stacked` }) : rows;
    const stacks = stacked ? stack(...stackSource(def, axis, stackedRows), stackGroups(def, axis), stackOrder) : null;
    const negative = stacks && aroundOf(def, axis) ? stackedRows.filter(r => r[axis.v] < 0).length : 0;
    if (negative > 0)
        warnOnce(store, `around:${axis.v}`, `dims.${axis.v}: ${negative} negative values of dim '${axis.v}' are left out of the stacks around the circle (e.g. the slices of a pie), a slice has no negative size`);
    const stackOf = stacks ? row => stacks.get(row) ?? [row[axis.v], row[axis.v]] : null;
    const isStacked = stacks ? row => stacks.has(row) : null;

    // without facets, or if no facet has rows, one of all rows
    const entries = def.facets ? facetEntries(store, rows) : [];
    return {
        rows, stackOrder, stackOf, isStacked, entries,
        domains: domainRows(store, def, axis, scope, stacked, shown, stackOrder),
        // the categories of the filtered rows of the legends with `onlyData`,
        // also the hidden ones, e.g. the sources of the selected year
        inData: Object.fromEntries(Object.keys(def.dims).filter(n => def.dims[n].legend?.onlyData)
            .map(n => [n, new Set(filtered.map(r => String(r[n])))])),
        // the rows are kept for another width if their conditions do not
        // depend on it, see layout
        keep: !ofWidth(def.filter) && !(stacked && stacked !== true && ofWidth(stacked)),
    };
};

/**
 * The rows of the domains of the scales with `domainIgnores` by their
 * dim: the rows of the other conditions of `filter`, e.g. of all months
 * of a slider, of the visible categories, as the ones of a facet
 * (`facets`, by the key of the facet), the stacks of them (`stackOf`) are
 * also the ones of the values of the ignored conditions, e.g. per month.
 */
const domainRows = (store, def, axis, scope, stacked, shown, stackOrder) => {
    // the conditions of the filter: the keys of conditions of 4.x, the dims
    // an expression references, `true` ignores all of them
    const expression = def.filter !== undefined && def.filter !== null && !(isObject(def.filter) && !isOperator(def.filter));
    const conditions = def.filter === undefined || def.filter === null ? [] : expression ? [...new Set(refNames(def.filter).map(n => n.split(':')[0]))] : Object.keys(def.filter);
    const kept = new Map();
    const domains = {};
    Object.entries(def.dims).forEach(([n, m]) => {
        const ignores = m.scale?.of === undefined ? m.scale?.domainIgnores : undefined;
        const names = ignores ? conditions.filter(c => ignores === true || ignores.includes(c)) : [];
        if (names.length == 0)
            return;
        const key = names.join('\0');
        if (!kept.has(key)) {
            const others = ignores === true ? undefined : withoutConditions(def.filter, names);
            kept.set(key, filter(filterRows(keptRows(store.data, store.columns), others, def.dims, scope, { columns: store.columns }), shown));
        }
        const rows = kept.get(key);
        const dims = facetDims(def);
        let stackOf = null;
        if (n == axis.v && stacked) {
            const stackedRows = stacked !== true ? filterRows(rows, stacked, def.dims, scope, { columns: store.columns, path: `dims.${n}.stacked` }) : rows;
            const stacks = stack(...stackSource(def, axis, stackedRows), [...stackGroups(def, axis), ...names], stackOrder);
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
    const scope = { ...store.names, totalWidth: width, [formatter]: store.scope[formatter] };
    const stacked = axis.v ? store.dim(axis.v).stacked : undefined;
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
    // the distinct values of a dim of all rows, e.g. the slots of dodged
    // bars of a dim without categories, see rowValue
    const slots = new Map();
    const slotKeys = name => {
        if (!slots.has(name))
            slots.set(name, distinctKeys(rows, name));
        return slots.get(name);
    };

    // values a log scale has no position of, e.g. 0, once per dim
    Object.keys(def.dims).forEach(n => logProblems(n, def.dims[n], rows, scope)
        .forEach(p => warnOnce(store, `log:${n}:${p.split(',')[0]}`, `dims.${n}.scale: ${p}`)));

    // the sizes of a facet
    // the margins: of the definition, else of the styles of the page
    // (--gen-vis-margin-left, ...), else of the defaults of the page or the
    // chart (registerDefaults), else measured of the axes ("auto", see
    // autoMargins of utils/margins.js); they can be props, e.g. steps of
    // the width of the visualisation
    const marginDefaults = store.marginDefaults?.() ?? {};
    // an expression of the side, e.g. of the width, may be "auto" too, one
    // without a value (null) is no side of the definition
    const side = v => {
        if (v === undefined || v === null || v === 'auto')
            return v;
        const e = evaluate(v, scope);
        return e === undefined || e === null || e === 'auto' ? e : Number(e) || 0;
    };
    const given = Object.fromEntries(['top', 'right', 'bottom', 'left'].map(k =>
        [k, side(def.options.margins?.[k]) ?? store.styleMargins?.[k] ?? side(marginDefaults[k]) ?? 'auto']));
    const auto = Object.values(given).includes('auto');
    const grid = faceted ? gridOf(def) : null;
    // (at least one column, e.g. of 0 or of an expression without a number)
    const cols = grid ? entries[0].cell.cols : (faceted ? Math.max(1, Math.floor(Number(evaluate(def.facets.cols, scope))) || 1) : 1);
    // the width of the facets of a grid without the one of the headers of
    // its rows, see facets.js
    const usable = grid ? Math.max(0, width - (store.rowHeaderWidth ?? 0)) : width;
    // the scales of all facets (a list of dims) or of each row or column
    // of a grid (`{ "y": "row", "x": "all" }`)
    const raw = faceted && def.facets.scales ? evaluate(def.facets.scales, scope) : [];
    const sharing = Array.isArray(raw) ? Object.fromEntries(raw.map(n => [n, 'all'])) : (raw && typeof raw == 'object' ? raw : {});
    // the facets of the scale of a dim of a facet of a grid shared by its
    // row or its column, the facet alone otherwise
    const partOf = (n, f) => {
        if (!f.cell || !['row', 'col'].includes(sharing[n]))
            return [f];
        const index = e => sharing[n] == 'row' ? e.cell.rowIndex : e.cell.colIndex;
        return entries.filter(e => index(e) === index(f));
    };
    // the rows of the domain of the scale of the facets, e.g. of a row
    const domainOfAll = (n, part) => {
        const of = part.map(e => domainOf(n, e.key));
        return of[0] ? { rows: of.flatMap(d => d.rows), stackOf: of[0].stackOf } : null;
    };
    // the height of the categories of a scale with a `step`, e.g. of the rows
    // of horizontal bars, the height of the definition otherwise, of the rows
    // of the scale of each facet, e.g. the ones of its row of a grid
    const stepped = stepHeight(store, n => !faceted || sharing[n] == 'all' ? [[rows, domainOf(n)?.rows]]
        : entries.map(f => partOf(n, f)).map(part => [part.flatMap(e => e.rows), domainOfAll(n, part)?.rows]), scope);
    // the facets of the margins: their sizes, scopes and scales
    const build = margins => {
        const size = { width: usable/cols, height: stepped === undefined ? sizeOf(store, evaluate(def.options.height, scope), 'height', 400) : stepped + margins.top + margins.bottom };
        // a container smaller than its margins has no room, not a negative one,
        // which would flip the ranges of the scales, e.g. a negative radius
        size.innerWidth = Math.max(0, size.width - (margins.left + margins.right));
        size.innerHeight = Math.max(0, size.height - (margins.top + margins.bottom));
        const dims = store.coord.dims(size.innerWidth, size.innerHeight);
        if (dims.radius !== undefined)
            dims.radius = Math.max(0, dims.radius);
        // the radius of polar plots is a size of the facet, e.g. of the hole of a donut
        const facetScope = { ...scope, ...size, ...(dims.radius === undefined ? {} : { radius: dims.radius }), ...plotArea(store.coord, size) };

        // the dims with the scale of another one (`"scale": { "of": "y" }`),
        // e.g. the end of a band, their values are in its domain
        const borrowed = Object.keys(def.dims).filter(n => def.dims[n].scale?.of !== undefined);
        const also = name => borrowed.filter(n => def.dims[n].scale.of === name);

        // the scale of a dim for the rows, in the sizes of a facet, of the
        // facet `key` (undefined of all rows), of the rows of `domain` if given
        // an error names the dim, e.g. of a domain which is no list
        const scaleOf = (name, rows, key, domain = domainOf(name, key)) => {
            try {
                return makeScale(name, store.dim(name), rows, { dims, coord: store.coord, scope: facetScope, allDims: def.dims,
                    stackOf: name == axis.v ? stackOf : null, also: also(name), domainRows: domain?.rows, domainStackOf: domain?.stackOf });
            } catch (error) {
                throw withPath(error, `dims.${name}.scale`);
            }
        };

        // the scales of all facets: the shared ones and the ones without
        // orientation, e.g. of colors
        const scaled = Object.keys(def.dims).filter(n => def.dims[n].scale && !borrowed.includes(n));
        const colors = scaled.filter(n => !def.dims[n].scale.orientation);
        // of the dims with a scale ("shared" names all dims, also the ones without one)
        const shared = Object.keys(sharing).filter(n => sharing[n] == 'all' && scaled.includes(n));
        const common = Object.fromEntries([...new Set([...shared, ...colors])].map(n => [n, scaleOf(n, rows)]));
        // the scales of a row or a column of a grid, of the rows of its facets
        const partScales = new Map();
        // of the rows of the domains of its facets, e.g. of `domainIgnores`
        const partScale = (n, f) => {
            const id = `${n} ${sharing[n]} ${sharing[n] == 'row' ? f.cell.rowIndex : f.cell.colIndex}`;
            if (!partScales.has(id)) {
                const part = partOf(n, f);
                partScales.set(id, scaleOf(n, part.flatMap(e => e.rows), undefined, domainOfAll(n, part)));
            }
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
            : { top: i < cols, bottom: i + cols >= count, left: i % cols == 0, right: i % cols == cols - 1 || i == count - 1 };
        const facets = (faceted ? entries : [{ key: undefined, name: undefined, rows }]).map((f, i) => {
            const scales = {
                ...common,
                ...Object.fromEntries(scaled.filter(n => !Object.hasOwn(common, n))
                    .map(n => [n, f.cell && ['row', 'col'].includes(sharing[n]) ? partScale(n, f) : scaleOf(n, f.rows, f.key)])),
            };
            borrowed.filter(n => Object.hasOwn(scales, def.dims[n].scale.of)).forEach(n => scales[n] = scales[def.dims[n].scale.of]);
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
                slotKeys,
                // the dims whose scale is the one of all facets or of the row or the column
                sharing,
                // the sizes of the bands of the scales, e.g. "@y:bandwidth" of annotations
                // also the key and the name of the facet, e.g. of a text once per facet
                scope: { ...facetScope, ...scaleSizes(scales), ...(faceted ? { facet: f.key, 'facet:name': f.name } : {}),
                    // the row and the column of a facet of a grid
                    ...(f.cell ? { 'facet:row': f.cell.row, 'facet:col': f.cell.col, 'facet:row:name': f.cell.rowName, 'facet:col:name': f.cell.colName } : {}) },
                scales,
            };
        });
        return { size, facets, colors: Object.fromEntries(colors.map(n => [n, common[n]])) };
    };
    // the margins of "auto" are measured of the axes of the facets of
    // provisional margins, then the facets are built again with them
    let built = build(auto ? Object.fromEntries(Object.entries(given).map(([k, v]) => [k, v === 'auto' ? 30 : v])) : given);
    if (auto)
        built = build(autoMargins(store, built.facets, given, f => textBoxes(store, f)));
    const { size, facets } = built;

    return {
        axis,
        rows,
        stackOf,
        faceted,
        facets,
        colors: built.colors,
        inData: parts.inData,
        height: size.height,
        [rowsKept]: parts,
    };
};

// a value of a row of the data of a mark as the ones of the data, e.g. a
// date, also the values of a range, e.g. ["2020-01-01", null] of a band
const convertValue = (dim, v) => Array.isArray(v)
    ? v.map(e => e === null ? null : convert(dim, e))
    : (v === null ? null : convert(dim, v));

// the rows of the `filter` of a mark of the rows of a facet, kept for the
// same rows if the filter has only references to globals, e.g. of the
// facet of a new width, see layout
const markRowsKept = new WeakMap();
const onceRows = new WeakMap();
const keptMarkRows = (store, mark, facet) => {
    const globals = store.def.globals ?? {};
    const names = refNames(mark.filter);
    const own = names.every(n => Object.hasOwn(globals, n) && facet.scope[n] === globals[n]);
    const key = own ? JSON.stringify(names.map(n => globals[n])) : null;
    let kept = markRowsKept.get(facet.rows);
    const hit = kept?.get(mark);
    if (key !== null && hit?.key === key)
        return hit.rows;
    const rows = filterRows(facet.rows, mark.filter, store.def.dims, facet.scope, { columns: store.columns, path: `${markPath(store.def, mark)}.filter`, unknown: unknownOf(store) });
    if (key !== null) {
        if (!kept)
            markRowsKept.set(facet.rows, kept = new Map());
        kept.set(mark, { key, rows });
    }
    return rows;
};

/**
 * The rows of a mark in a facet: the rows of the facet or the ones of the
 * `data` of the mark, e.g. events. These have the names of the dims and
 * others, e.g. a `label`, the values of the dims are converted as the
 * ones of the data, e.g. dates, the values of rows of the definition are
 * props of the facet, e.g. references to globals. A row with a value of the
 * dim of the facets is only in its facet. `filter` of the mark leaves
 * out rows, see rowFilter.
 */
const markRows = (store, mark, facet) => {
    // one row without values per facet, e.g. a header or a unit label at
    // the edges of the plot area (@plot:top), the same one of a facet
    if (mark.once) {
        if (!onceRows.has(facet.rows))
            onceRows.set(facet.rows, [{}]);
        return onceRows.get(facet.rows);
    }
    if (!mark.data && mark.filter)
        return keptMarkRows(store, mark, facet);
    const filtered = rows => filterRows(rows, mark.filter, store.def.dims, facet.scope, { columns: store.columns, path: `${markPath(store.def, mark)}.filter`, unknown: unknownOf(store) });
    if (!mark.data)
        return filtered(facet.rows);
    const dims = store.def.dims;
    const dim = store.def.facets?.dim;
    const inline = !mark.loaded;
    // the rows of the draw before of the same values are kept, the others
    // have their keys, so the elements are the ones of the draw before, see
    // ownRows
    const before = ownRows(mark, facet.key);
    const rows = mark.data
        .map((r, i) => {
            const row = Object.fromEntries(Object.entries(r).map(([k, v]) => {
                const value = inline ? evaluate(v, facet.scope) : v;
                return [k, Object.hasOwn(dims, k) ? convertValue(dims[k], value) : value];
            }));
            return before[i] = !before[i] ? row : sameRow(before[i], row) ? before[i] : replaceRow(before[i], row);
        })
        .filter(r => facet.key === undefined || (facet.cell ? inCell(store.def, facet.cell, r)
            : !dim || !Object.hasOwn(r, dim) || String(r[dim]) == String(facet.key)));
    return filtered(rows);
};

// the rows of the `data` of a mark of its last draw in the facet of `key`,
// by their index: the elements of a draw are the ones of the same rows (see
// rowKey of utils/draw.js), a row of the same values is the same object in
// every draw, one of other values (e.g. of a global) has the key of the
// row before (see replaceRow), so their elements are kept and move with a
// transition; not the ones of other data of the mark
const ownRowsKept = new WeakMap();
const ownRows = (mark, key) => {
    let kept = ownRowsKept.get(mark);
    if (kept?.data !== mark.data)
        ownRowsKept.set(mark, kept = { data: mark.data, facets: new Map() });
    if (!kept.facets.has(key))
        kept.facets.set(key, []);
    return kept.facets.get(key);
};

// two rows of a mark have the same values: the same keys, dates of the same
// time and ranges of the same values, e.g. ["2020-01-01", null] of a band
const sameRow = (a, b) => {
    const keys = Object.keys(a);
    const same = (x, y) => Object.is(x, y) || (x instanceof Date && y instanceof Date && +x == +y)
        || (Array.isArray(x) && Array.isArray(y) && x.length == y.length && x.every((v, i) => same(v, y[i])));
    return keys.length == Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
};

// a row of a mark is in a cell of a grid if its values of the dims of
// the rows and the columns are the ones of the cell (or it has none)
const inCell = (def, cell, r) => {
    const g = gridOf(def);
    return (!g.rows || !Object.hasOwn(r, g.rows) || String(r[g.rows]) == String(cell.row))
        && (!g.cols || !Object.hasOwn(r, g.cols) || String(r[g.cols]) == String(cell.col));
};

/**
 * The facets of a mark or an annotation (`facet`): a key or a list of keys
 * of the facets of `dim`, of a grid also the values of the dims of its
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

// one row of the rows of a group: the first or the last one along the dim
// of the position of the mark (as the points of a line, see alongRows, in
// the order of the rows with `"order": "rows"`), or the one with the least
// or the most value of a dim, e.g. { "max": "x" }, of the rows with
// values of the dims of the props, categories as numbers if they are
// numbers, e.g. "10" after "9"
const selected = (rows, select, dims, mark, ctx) => {
    if (select == 'first' || select == 'last') {
        const along = alongRows(rows, mark, ctx);
        return select == 'first' ? along.slice(0, 1) : along.slice(-1);
    }
    const [kind, name] = Object.entries(select ?? {})[0] ?? [];
    const values = rows.filter(r => r[name] !== null && r[name] !== undefined);
    const compare = Object.hasOwn(dims, name) && !continuous(dims[name])
        ? (a, b) => compareCategories(a[name], b[name])
        : r => r[name];
    const row = kind == 'min' ? d3.least(values, compare) : (kind == 'max' ? d3.greatest(values, compare) : undefined);
    return row ? [row] : [];
};

// a name of the rows of a facet as a function of the row, e.g. "x" or
// "x:scaled", undefined for other names, see docs/definition.md "Expressions" > "Names"
const rowValue = (ctx, name, rows) => {
    // the place of the row among the rows of the mark in the facet, from 0,
    // e.g. the line of a small table, without a dim `row`
    if (name == 'row:index' && !Object.hasOwn(ctx.store.def.dims, 'row')) {
        const index = new Map(rows.map((r, i) => [r, i]));
        return row => index.get(row);
    }
    const [m, ...parts] = name.split(':');
    // the other names of the rows of the data of a mark, e.g. a label
    if (!Object.hasOwn(ctx.store.def.dims, m))
        return rows !== ctx.rows && rows.some(r => Object.hasOwn(r, name)) ? (row => row[name]) : undefined;
    const s = ctx.scales[m];
    const stackOf = ctx.axis.v == m ? ctx.stackOf : null;
    // the format of the hover of the dim or the one of the locale
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
        // the place of the category of the row among the visible categories
        // of the dim, from 0, and their number, e.g. of dodged bars (see
        // `dodge` of utils/language.js); of a dim without categories the
        // distinct values of the rows of the chart (of all facets, before the
        // filters of the marks, see slotKeys of layout) in their order, so
        // the slots are the same in all facets and marks; a row without a
        // value or of another category has none
        'index': () => {
            const keys = categoryKeys();
            const index = new Map(keys.map((k, i) => [k, i]));
            return row => row[m] === null || row[m] === undefined ? undefined : index.get(String(row[m]));
        },
        'count': () => constant(categoryKeys().length),
    };
    let keysOf;
    const categoryKeys = () => {
        if (keysOf)
            return keysOf;
        const dim = ctx.store.def.dims[m];
        keysOf = Array.isArray(dim?.keys)
            ? dim.keys.filter(k => dim.categoryProps?.[k]?.visible !== false).map(String)
            : (ctx.slotKeys?.(m) ?? distinctKeys(rows, m));
        return keysOf;
    };
    const kind = parts.join(':');
    // the position of a value, e.g. "@x:scaled:0" or "@y:scaled:100"
    const at = /^scaled:(-?\d+(?:\.\d+)?)$/.exec(kind);
    if (at)
        return s ? constant(s(convert(ctx.store.dim(m), at[1]))) : undefined;
    return Object.hasOwn(values, kind) ? values[kind]() || undefined : undefined;
};

// the distinct values of a dim of rows as texts, in the order of the
// rows, without missing ones
const distinctKeys = (rows, name) => {
    const keys = new Set();
    for (const r of rows) {
        const v = r[name];
        if (v !== null && v !== undefined)
            keys.add(String(v));
    }
    return [...keys];
};

// the props of categories (a list of them, the later ones override the ones
// before) and, if none of them has a color, the default color of the first
// one which has one, see prepareDim of utils/def.js
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
// of the end of the scale, a row needs no value of their dim, see rowValue
const ofScale = /^(scaled:(min|max|-?\d+(\.\d+)?)|bandwidth|step)$/;

/**
 * The groups of the rows of a mark by its categories, see plots/index.js:
 * the props of their categories (`props`), their `rows`, the values of the
 * props of the mark of a row (`at(row)`, `prop(name)(row)` of one prop) and
 * the ones which are the same for all rows (`attrs`), e.g. the color of a
 * line. The names of the props are the props of the categories, the names
 * of the rows (see rowValue) and the ones of the facet (`ctx.scope`), in
 * this order. `complete(row)` is false if a dim of the props has no
 * value, e.g. a point is not drawn.
 */
// the length of an attribute of a text in pixels, e.g. dy of "0.35em"
const lengthOf = (v, fontSize) => {
    if (v === undefined || v === null || v === '')
        return 0;
    const n = parseFloat(v);
    return Number.isFinite(n) ? (/em$/.test(String(v).trim()) ? n*fontSize : n) : 0;
};

/**
 * The boxes of the texts of the text marks of a facet of the layout (the
 * ones of `svg:text`, e.g. labels at the ends of lines or bars), in the
 * coordinates of the plot area, `{ left, right, top, bottom }`, measured in
 * the font of the visualisation, see autoMargins of utils/margins.js: texts
 * of the mark types as they are drawn (positions, `dx`, `dy`, anchors and
 * baselines, `max-width`), not the rotated ones (a transform).
 */
const textBoxes = (store, f) => {
    const family = store.fontFamily || 'sans-serif';
    // of cartesian charts (the positions of polar ones are around the center, maps have no margins)
    if ((store.def.options?.coord ?? 'cartesian') != 'cartesian')
        return [];
    const marks = (store.def.marks ?? []).filter(p => (p.type == 'svg:text' || String(p.type).startsWith('annotation:'))
        && p.place?.in === undefined && inFacet(store.def, p, f));
    if (marks.length == 0)
        return [];
    const groups = new Map();
    const ctx = { ...f, store, groupsOf: id => {
        if (!groups.has(id)) {
            const p = store.def.marks.find(q => q.id === id);
            groups.set(id, p ? markGroups(p, markRows(store, p, f), ctx) : []);
        }
        return groups.get(id);
    } };
    return marks.flatMap(p => {
        let layer;
        try {
            layer = markTypes[p.type].marks(ctx.groupsOf(p.id), p, ctx);
        } catch {
            return [];
        }
        // the texts of the layer: of a text mark all, of annotations their
        // texts and labels (their position and anchor in the attributes set at
        // once, a label in the size of its style, see styles.css)
        const items = layer?.groups ? layer.groups.flatMap(g => g.items) : layer?.items ?? [];
        return items.filter(v => (v[elementOf] ?? layer.element) == 'text').map(item => {
            const v = { ...(item[directOf] ?? {}), ...item };
            if (String(v.class ?? '').includes('vis-annotation-label') && v['font-size'] === undefined)
                v['font-size'] = 11;
            const text = v.text;
            if (text === null || text === undefined || text === '' || v.transform || v.visibility == 'hidden')
                return null;
            const size = parseFloat(v['font-size']) || store.fontSize || 12;
            const max = parseFloat(v['max-width']);
            const width = Math.min(textWidth(String(text), `${v['font-weight'] ?? ''} ${size}px ${family}`.trim()), max > 0 ? max : Infinity);
            const x = parseFloat(v.x) + lengthOf(v.dx, size), y = parseFloat(v.y) + lengthOf(v.dy, size);
            if (!Number.isFinite(x) || !Number.isFinite(y))
                return null;
            const anchor = v['text-anchor'], baseline = v['dominant-baseline'];
            const left = anchor == 'middle' ? x - width/2 : anchor == 'end' ? x - width : x;
            const top = ['middle', 'central'].includes(baseline) ? y - size/2 : ['hanging', 'text-before-edge'].includes(baseline) ? y : y - 0.8*size;
            // the place of the text in the plot area (without `dx`), e.g. the end of a line
            return { left, right: left + width, top, bottom: top + size, x: parseFloat(v.x) };
        }).filter(Boolean);
    });
};

// the note of a column which is not in the data (no row and no transform
// has it), e.g. of a typo of a dim's column
const absentColumn = (store, column) => {
    if (typeof column != 'string' || store.columns?.has?.(column))
        return '';
    const rows = sourceRows(store.rows ?? [], store.columns);
    return rows.some(r => r && Object.hasOwn(r, column)) ? '' : ` (column '${column}' is not in the data)`;
};

const markGroups = (mark, rows, ctx) => {
    const dims = ctx.store.def.dims;
    const needed = [...new Set(refNames(mark.props).filter(n => !ofScale.test(n.split(':').slice(1).join(':')))
        .map(n => n.split(':')[0]))].filter(m => Object.hasOwn(dims, m));
    // (a row of the data of a mark may lack a dim, e.g. { "y": 2 } of a point)
    const missing = (row, m) => row[m] === null || row[m] === undefined;
    const complete = row => !needed.some(m => missing(row, m));
    // not without data, e.g. the empty classes of a bin of no rows
    if (needed.length > 0 && rows.length > 0 && ctx.store.rows?.length > 0 && !rows.some(complete))
        warnOnce(ctx.store, `plot:${mark.id}:missing`, `${markPath(ctx.store.def, mark, true)}: none of its ${rows.length} rows is drawn, `
            + needed.map(m => [m, rows.filter(r => missing(r, m)).length]).filter(([, n]) => n > 0)
                .map(([m, n]) => `${n} without a value of dim '${m}'${mark.data === undefined ? absentColumn(ctx.store, dims[m].column) : ''}`).join(', '));
    // the rows without a value of a dim of categories of `by` are in
    // no category, e.g. rows of other marks
    const categorized = mark.by.filter(c => dims[c].categoryProps);
    const groups = groupBy(rows, mark.by);
    return (categorized.length ? groups.filter(g => categorized.every(c => g.group[c] !== null && g.group[c] !== undefined)) : groups).map(g => {
        const props = withColor(mark.by.map(c => ownProp(dims[c].categoryProps, g.group[c])));
        const scoped = name => Object.hasOwn(ctx.scope, name) ? constant(ctx.scope[name]) : undefined;
        const resolve = name => typeof name == 'symbol' ? scoped(name) : (Object.hasOwn(props, name) ? constant(props[name])
            : rowValue(ctx, name, rows) ?? scoped(name));
        const at = bind(mark.props, resolve);
        return {
            categories: g.group,
            props,
            rows: mark.select === undefined ? g.entries : selected(g.entries.filter(complete), mark.select, dims, mark, ctx),
            at,
            prop: name => at.entries.get(name) ?? constant(undefined),
            attrs: Object.fromEntries([...at.entries].filter(([, f]) => f.constant).map(([k, f]) => [k, f()])),
            // the custom properties of the highlight of the group, of its first row
            vars: highlightVars(mark, value => bind(value, resolve), g.entries[0]),
            complete,
        };
    });
};
