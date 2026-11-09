export { createFacetHover, orderOf, sortedByOrder, nearestWithRows, nearestRow, pointFinder, pointPosition, placed, positionsInOrder, clamp };

import * as d3 from "@/utils/d3";
import { evaluate } from "@/utils/expr";
import { dataAttribute } from "@/utils/draw";
import { create, pointer } from "@/utils/dom";
import { placeLine } from "@/coords/hover";
import { filterRows } from "@/utils/data";
import { unknownOf, withColor } from "@/layout";
import { entrySymbol } from "@/comp/legend";
import { bandCenter } from "@/utils/scales";
import { patch } from "@/comp/html";
import { createHover, byOrder } from "@/comp/hover";

/**
 * The place of a row in the hover, from the top, of the rows of its
 * position: of a stacked value the middle of its stack, a row which is not
 * stacked, e.g. a total, is above the stacked ones of the categories before
 * it, below the ones of the categories after it. `ctx` has the name of the
 * values `v`, `stackOf`, `isStacked` and `stackOrder`, see layout.js.
 */
const orderOf = (row, rows, { v, stackOf, isStacked, stackOrder }) => {
    if (!stackOf)
        return row[v];
    if (isStacked(row))
        return d3.mean(stackOf(row));
    const stacked = rows.filter(isStacked);
    const before = stacked.filter(s => stackOrder(s, row) < 0).length;
    return stacked.length == 0 || (before > 0 && before < stacked.length) ? row[v] : (before > 0 ? Infinity : -Infinity);
};

// the rows from the top to the bottom, each order is computed once
const sortedByOrder = (rows, order) => rows.map(row => [order(row), row])
    .sort((a, b) => byOrder(a[0], b[0]))
    .map(([, row]) => row);

/**
 * The key nearest to a position (`scale.nearest(p)`, see utils/scales.js) of
 * the ones with rows of the hover (`keys`), a key without rows, e.g. of
 * values which are null or which the filter of the hover removes, is
 * replaced by the nearest one with rows, undefined if there is none.
 * Undefined without `scale.nearest`.
 */
const nearestWithRows = (scale, keys) => {
    if (!scale?.nearest)
        return undefined;
    const has = new Set(keys.map(String));
    // the positions of the keys with rows, sorted once, at the first key without rows
    let sorted = null;
    return p => {
        const key = scale.nearest(p);
        if (key === undefined || has.has(String(key)))
            return key;
        sorted ??= keys.map(k => [scale(k) + bandCenter(scale), k])
            .filter(([x]) => Number.isFinite(x))
            .sort((a, b) => a[0] - b[0]);
        if (sorted.length == 0)
            return undefined;
        return sorted[d3.bisectCenter(sorted.map(([x]) => x), p)][1];
    };
};

// the row of `rows` nearest to `value`, of stacked values the segment of the
// value, outside of the stacks the closest one, undefined without a value,
// rows without a value are not the nearest one (a stack of them has no
// extent, null is no 0)
const nearestRow = (rows, value, v, stackOf, isStacked = null) => {
    if (value === undefined)
        return undefined;
    const distance = stackOf ? row => {
        const [lo, hi] = d3.extent(stackOf(row));
        if (lo === undefined)
            return Infinity;
        return value < lo ? lo - value : (value > hi ? value - hi : 0);
    } : row => row[v] === null || row[v] === undefined ? Infinity : Math.abs(row[v] - value);
    // a row which is not stacked (e.g. a line of the total) is not the
    // nearest one in a segment of a stack nor of the same distance as one
    if (!isStacked)
        return d3.least(rows, distance);
    // (a key of the row, not a comparison, so the distance is computed once
    // per row: the ones not stacked after the stacked ones of the same distance)
    let best;
    let bestDistance = Infinity;
    let bestStacked = false;
    for (const row of rows) {
        const d = distance(row);
        const stacked = isStacked(row);
        if (best === undefined || d < bestDistance || (d == bestDistance && stacked && !bestStacked))
            [best, bestDistance, bestStacked] = [row, d, stacked];
    }
    return best;
};

/**
 * The nearest of `points` (`[x, y, row]`) to a position within `radius`
 * pixels, null if there is none. The points are in cells of the size of the
 * radius, so only the ones of the nine cells around the position are compared.
 */
const pointFinder = (points, radius) => {
    const size = Math.max(radius, 1);
    const cellOf = (x, y) => `${Math.floor(x/size)} ${Math.floor(y/size)}`;
    const cells = d3.group(points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)), ([x, y]) => cellOf(x, y));
    return ([px, py]) => {
        const [cx, cy] = [Math.floor(px/size), Math.floor(py/size)];
        const near = [-1, 0, 1].flatMap(dx => [-1, 0, 1].flatMap(dy => cells.get(`${cx + dx} ${cy + dy}`) ?? []));
        const best = d3.least(near, ([x, y]) => (x - px)**2 + (y - py)**2);
        return best && (best[0] - px)**2 + (best[1] - py)**2 <= radius**2 ? best : null;
    };
};

// the hover beside a point, on the side with more space of the plot area
const pointPosition = (point, width) => ({ x: point[0], y: point[1], side: point[0] > width/2 ? "left" : "right" });

/**
 * The position of the hover: the one of the coordinate system (`position`,
 * beside its marker) or at the pointer (`"position": "pointer"` of the
 * `options` of the hover), e.g. above the region of a map, on the side with
 * more space or the `side` of the options, moved by their `offset`.
 */
const placed = (position, options, pointerAt) => {
    if (options.position == 'pointer' && pointerAt)
        position = { ...position, x: pointerAt[0], y: pointerAt[1] };
    const [dx = 0, dy = 0] = options.offset ?? [];
    return { ...position, x: position.x + dx, y: position.y + dy, side: options.side ?? position.side };
};

// the positions (`{key, ...}`) in the order of the scale, e.g. from the left
// to the right, without one by their titles, e.g. the regions of a map
const positionsInOrder = (positions, scale, titleOf) => scale
    ? positions.sort((a, b) => scale(a.key) - scale(b.key))
    : positions.sort((a, b) => String(titleOf(a.key)).localeCompare(String(titleOf(b.key))));

// an index in [0, length - 1]
const clamp = (index, length) => Math.max(0, Math.min(length - 1, index));

/**
 * The hover of a facet, of the pointer and of the keyboard: the marker of
 * the position (`marker`), the box of the rows beside it (see comp/hover.js)
 * in `live`, which screen readers read when the keyboard moves it, and the
 * hover and select events (`emit`). `facetOf()` is the facet drawn,
 * `origin()` the origin of its plots, `highlight(entry)` highlights the
 * elements of the categories of a row. `init(ctx)` prepares the hover of a
 * draw (`ctx` of the plot types, see plots/index.js), e.g. its rows, and
 * shows the one of the draw before, `render()` places the marker and the
 * box, `key(e)` moves the hover by the keyboard, `hide()` hides it,
 * `keyboard` tells whether the facet has a hover, `visible` whether it is
 * shown.
 */
const createFacetHover = ({ store, slots, emit, marker, live, highlight, origin, facetOf }) => {
    // the hover shown and its position
    const hover = { visible: false, x: 0, y: 0 };
    // the facet has a hover, it can be moved by the keyboard
    let keyboard = false;
    // the hover was moved by the keyboard, so screen readers read it
    let announced = false;
    // the functions of the hover of the draw, see init
    let hide = null, step = null, selectShown = null;
    let lastEvent = null, lastKey = null, pointerAt = null;
    let box = null;

    // the options of the hover, see docs/usage.md "Events and slots"
    const hoverOptions = () => store.def.options.hover ?? {};

    // the keys of the hover: the arrows to the left and the right move it
    // to the position before and after, the ones up and down to the row
    // above and below, home and end to the first and the last position,
    // enter and space select it, as a click, escape hides it
    const key = e => {
        const s = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 'down', ArrowUp: 'up', Home: 'first', End: 'last' }[e.key];
        if (e.key == 'Escape') {
            hide?.();
        } else if ((e.key == 'Enter' || e.key == ' ') && selectShown) {
            e.preventDefault();
            selectShown();
        } else if (s !== undefined && step) {
            e.preventDefault();
            step(s);
        }
    };

    // the marker of the position and the box of the hover beside it, also
    // of the hover slot
    const render = (o = origin()) => {
        patch(marker, { visibility: hover.visible && (hoverOptions().marker !== false || hoverOptions().cross) ? 'visible' : 'hidden', class: 'vis-hover-marker' });
        // above the other facets (positioned after this one, e.g. the next
        // row of a grid): the transform makes the element a layer of its own,
        // so its z-index decides, not the one of the box in it
        patch(live, {
            'aria-live': announced ? 'polite' : 'off',
            style: `transform: translate(${facetOf().margins.left + o[0] + hover.x}px, ${facetOf().margins.top + o[1] + hover.y}px); position: absolute; top: 0; left: 0; z-index: 1;`,
        });
        if (hover.visible && hoverOptions().box !== false) {
            if (!box) {
                box = createHover(store, slots);
                box.show(hover);
                live.appendChild(box.el);
            } else
                box.show(hover);
        } else if (box) {
            box.el.remove();
            box = null;
        }
    };

    const init = ctx => {
        const coord = store.coord;
        hide = null;
        step = null;
        selectShown = null;

        // the hover needs the mappings of the positions and of the values,
        // of a coordinate system with `values` of the hover only the ones
        // of the values, e.g. of a pie without rings, all rows are one position
        const names = ctx.axis;
        keyboard = Boolean(names.v && (names.h || coord.hover.values));
        if (!keyboard) {
            hover.visible = false;
            return;
        }

        const format = { h: names.h ? store.valueFormat(names.h, ctx.scales[names.h]) : () => '', v: store.valueFormat(names.v, ctx.scales[names.v]) };
        const v = names.v;
        // the start and the end of a stacked value
        const stackOf = ctx.stackOf;
        // the place of a row in the hover, see orderOf
        const stacks = { v, stackOf, isStacked: ctx.isStacked, stackOrder: ctx.stackOrder };

        // categorical mappings, and other values with a hover, e.g. of a second vertical axis
        const categories = store.mappingNamesWithKey('hover')
            .filter(n => n != names.h && n != v && store.mapping(n).categoryProps);
        // the other dims with a hover: numbers and dates in their format, the
        // values of a dim of texts without categories as they are
        const others = store.mappingNamesWithKey('hover')
            .filter(n => n != names.h && n != v && !store.mapping(n).categoryProps);
        const formats = Object.fromEntries(others.map(n => [n, ['numeric', 'date'].includes(store.mapping(n).type)
            ? store.valueFormat(n, ctx.scales[n]) : (x => String(x))]));
        // the value of the position is a cell unless `"value": false`, e.g. a
        // hover of only the categories of a map or of other dims
        const valueCell = hoverOptions().value !== false;
        // the label of a column, the name of its dim, its axis title or its name
        const labelOf = n => {
            const m = store.mapping(n);
            return store.text(m.name ?? m.axis?.title?.name ?? n) ?? n;
        };
        // the color of the category of a row, of the first dim of categories
        // of the hover with a color, e.g. a swatch beside its name
        // (the symbol of its entry of the legend of the dim, if it has one, e.g. a line
        // of a line and a box of an area, drawn with the props of the category)
        const swatchOf = row => {
            for (const n of categories) {
                const props = store.prop(n, row[n]);
                const color = props?.color;
                if (typeof color != 'string' || !color)
                    continue;
                const m = store.mapping(n);
                const symbol = m.legend ? entrySymbol(m, props) : null;
                return symbol ? { color, symbol, scope: { ...scope, ...withColor([props]) } } : { color };
            }
            return null;
        };
        // the mappings whose categories style the rows (`hover.row.props`),
        // and the ones of categories as attributes of the rows, e.g. data-type="load"
        const styled = categories.filter(n => store.mapping(n).hover.row?.props);
        const keyed = Object.keys(store.def.mapping).filter(n => store.mapping(n).categoryProps && dataAttribute(n));

        const line = marker.querySelector("line");
        // the lines of the crosshair (`cross`) through the point of the
        // nearest row, of the coordinate systems which have one (cartesian),
        // instead of the line of the position
        const crossing = Boolean(hoverOptions().cross && coord.hover.cross);
        const crossLines = !crossing ? [] : ['h', 'v'].map(d => marker.querySelector(`line.vis-hover-cross-${d}`) ?? (() => {
            const l = marker.appendChild(create('line'));
            l.setAttribute('class', `vis-hover-cross vis-hover-cross-${d}`);
            return l;
        })());
        const noCross = () => crossLines.forEach(l => placeLine(l, null));
        // the marker without a line, e.g. of a hidden hover or of a point
        const noLine = () => {
            line.removeAttribute("x1");
            line.removeAttribute("x2");
            line.removeAttribute("y1");
            line.removeAttribute("y2");
            noCross();
        };
        const scope = store.scope;

        // the rows of the hover, with a value and of its `filter`, by their
        // key, e.g. of the horizontal axis, compared as strings
        const options = hoverOptions();
        const hoverRows = filterRows(ctx.rows.filter(e => e[v] !== null), options.filter, store.def.mapping, ctx.scope, { columns: store.columns, path: 'hover.filter', unknown: unknownOf(store) });
        const rowsByKey = d3.group(hoverRows, e => String(e[names.h]));
        // the nearest key is one with rows, e.g. not one of null values, of
        // the coordinate systems with the `nearest` of the context, unless
        // the hover of keys without rows is shown (`"empty": true`)
        // the classes of `stackBy` (the positions of the stacks are their
        // starts, e.g. of the classes of a bin): the class under the pointer,
        // the last start not after it, its marker in its middle, up to the
        // next start (the last class as wide as the one before)
        const hs = ctx.scales[names.h];
        const classes = names.v && store.mapping(names.v).stackBy === names.h && hs?.invert ? (() => {
            const starts = [...rowsByKey.values()].map(rows => rows[0][names.h]).sort((a, b) => a - b);
            const index = k => d3.bisectLeft(starts, +k);
            const end = i => i + 1 < starts.length ? starts[i + 1] : 2*starts[i] - (starts[i - 1] ?? starts[i]);
            return {
                nearest: p => starts.length ? starts[Math.max(0, d3.bisectRight(starts, +hs.invert(p)) - 1)] : undefined,
                middle: k => (hs(k) + hs(end(index(k))))/2,
            };
        })() : null;
        const located = options.empty ? ctx
            : { ...ctx, nearest: classes?.nearest ?? nearestWithRows(ctx.scales[names.h], [...rowsByKey.values()].map(rows => rows[0][names.h])) };
        let last = null;
        // the rows of the hover shown, e.g. for a select by the keyboard
        let current = null;

        // a hidden hover has no position, as the one of a new facet
        hide = () => {
            if (hover.visible)
                emit('hover', null);
            last = null;
            current = null;
            lastEvent = null;
            lastKey = null;
            Object.assign(hover, { visible: false, x: 0, y: 0 });
            noLine();
            highlight(null);
            render();
        };

        // the hover of the nearest point, e.g. of a scatter plot, within
        // `radius` pixels, of the coordinate systems with points of rows,
        // the points of the rows are placed at the first use
        const pointMode = options.mode == 'point' && coord.hover.point;
        let points = null;
        let nearestPoint = null;
        const preparePoints = () => {
            points ??= hoverRows.filter(row => row[names.h] !== null)
                .map(row => [...coord.hover.point(ctx, row, names), row]);
            nearestPoint ??= pointFinder(points, options.radius ?? 30);
        };

        // the rows at the pointer and the nearest one, stacked: the segment
        // under the pointer, outside of the stack the closest one, null
        // without a key, the rows are not formatted yet
        const at = e => {
            if (pointMode) {
                preparePoints();
                const point = nearestPoint(pointer(e, ctx.inner));
                return point && { key: point[2][names.h], rows: [point[2]], nearest: point[2], point };
            }
            const position = coord.hover.locate(located, pointer(e, ctx.inner), names, e);
            if (!position)
                return null;
            const { key, value } = position;
            const rows = rowsByKey.get(String(key)) ?? [];
            return { key, value, rows, nearest: nearestRow(rows, value, v, stackOf, ctx.isStacked) };
        };

        const titleOf = key => coord.hover.title ? coord.hover.title(ctx, key, names) : format.h(key);

        // the rows of the table from the top to the bottom, stacks as they
        // are drawn, the cells are a cell per hover prop of the categories,
        // e.g. their name, and the value
        const entriesOf = (rows, nearest) => {
            // the other dims with a value in a row of the hover, a column of no values is none
            const present = new Set(others.filter(n => rows.some(r => r[n] !== null && r[n] !== undefined)));
            return rows.map(row => {
                const cells = [];
                // the values of the mappings with `"cell": false` are names of
                // the templates, without a cell of the table
                const celled = n => store.mapping(n).hover.cell !== false;
                const entries = Object.fromEntries(categories.map(n => {
                    const values = evaluate(store.mapping(n).hover.props, { ...scope, ...store.prop(n, row[n]) });
                    const texts = Object.fromEntries(Object.entries(values).map(([k, t]) => [k, store.text(t)]));
                    // of a point the categories are the title, see pointTitle
                    Object.entries(texts).filter(([, t]) => t !== null && t !== undefined && celled(n) && !(pointMode && names.h))
                        .forEach(([k, t]) => cells.push({ mapping: n, prop: k == 'name' ? null : k, text: t }));
                    return [n, texts];
                }));
                entries[v] = { value: row[v], name: format.v(row[v]) };
                // of a point (a scatter plot) the horizontal value is a cell, the title names the categories
                if (pointMode && names.h && categories.length > 0) {
                    entries[names.h] = { value: row[names.h], name: format.h(row[names.h]) };
                    cells.push({ mapping: names.h, value: true, text: entries[names.h].name, label: labelOf(names.h) });
                }
                if (valueCell)
                    cells.push({ mapping: v, value: true, text: entries[v].name, label: labelOf(v) });
                others.forEach(n => {
                    entries[n] = { value: row[n], name: row[n] === null || row[n] === undefined ? '' : formats[n](row[n]) };
                    if (celled(n) && present.has(n))
                        cells.push({ mapping: n, value: true, text: entries[n].name, label: labelOf(n) });
                });
                // the styles of the row, of the props of its categories, the
                // later mappings override the ones before, see hover.js
                const style = {};
                styled.forEach(n => Object.entries(evaluate(store.mapping(n).hover.row.props, { ...scope, ...store.prop(n, row[n]) }))
                    .filter(([, s]) => s !== null && s !== undefined && s !== '')
                    .forEach(([k, s]) => style[k] = String(s)));
                const attrs = Object.fromEntries(keyed.filter(n => row[n] !== null && row[n] !== undefined)
                    .map(n => [dataAttribute(n), String(row[n])]));
                return { entries, cells, swatch: swatchOf(row), data: row, nearest: row === nearest, order: orderOf(row, rows, stacks), style, attrs };
            });
        };

        // the rows of the events and the slot, copies of the values of the mappings
        const plain = row => Object.fromEntries(Object.entries(row));
        // the title of a point: the names of the categories of its row, e.g.
        // the country of a point of a scatter plot, else the horizontal value
        const pointTitle = row => categories.map(n => store.text(store.prop(n, row?.[n])?.name ?? row?.[n])).filter(t => t !== null && t !== undefined && t !== '').join(' · ');
        const payload = ({ key, rows, nearest, point }) => ({
            key,
            title: point && categories.length > 0 && nearest ? pointTitle(nearest) : titleOf(key),
            rows: rows.map(plain),
            nearest: nearest ? plain(nearest) : null,
        });

        // the hover of the rows of a position and the nearest one
        const show = found => {
            const { key, value, rows, nearest } = found;
            // no hover without rows, e.g. of a region without a value,
            // unless `"empty": true`, e.g. the name of every region
            if (rows.length == 0 && !options.empty) {
                hide();
                return;
            }
            hover.visible = true;
            current = found;

            // the same key and row as before, e.g. a move within a step
            // of the axis, nothing is formatted or drawn, a hover at the
            // pointer moves with it
            if (last && last.key === key && last.nearest === nearest) {
                if (options.position == 'pointer' && pointerAt)
                    Object.assign(hover, placed(last.position, options, pointerAt));
                render();
                return;
            }

            // there is no entry e.g. if all categories are hidden, without
            // a value the elements of the key are highlighted, e.g. a region
            highlight(nearest ?? (value === undefined ? {[names.h]: key} : null));

            const p = payload(found);
            // a point has no line, the hover is beside it
            const position = found.point
                ? (noLine(), pointPosition(found.point, ctx.innerWidth))
                : coord.hover.marker(classes ? { ...ctx, markerAt: classes.middle } : ctx, key, names, line, nearest);
            // the crosshair through the nearest row replaces the line of the position
            if (crossing) {
                noLine();
                if (!nearest || !coord.hover.cross(ctx, nearest, names, crossLines))
                    noCross();
            }
            last = { key, nearest, position };
            // the sum of the stacked values of the position (`total`), of the
            // format of the values
            const total = options.total && stackOf && ctx.isStacked
                ? rows.filter(ctx.isStacked).reduce((sum, r) => sum + (Number.isFinite(r[v]) ? r[v] : 0), 0) : null;
            Object.assign(hover, placed(position, options, pointerAt), {
                data: entriesOf(rows, nearest),
                title: p.title,
                payload: p,
                total: total === null ? null : { value: total, name: format.v(total) },
            });
            emit('hover', p);
            render();
        };

        // the hover of the pointer, also the one of the draw before at its
        // position, e.g. after a toggle by the keyboard
        const move = e => {
            // nothing under the pointer, e.g. the sea of a map, no empty or old hover
            const found = at(e);
            if (!found) {
                hide();
                return;
            }
            lastEvent = e;
            lastKey = null;
            // the hover of the pointer is not read by screen readers
            announced = false;
            pointerAt = pointer(e, ctx.inner);
            show(found);
        };

        // the positions with rows in their order, e.g. from the left to
        // the right, the ones of a map by their titles, and of the points
        // their order from the left, the rows of a position as in the table
        let positions = null;
        const positionsOf = () => {
            if (pointMode) {
                preparePoints();
                return [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
                    .map(point => ({ key: point[2][names.h], rows: [point[2]], point }));
            }
            const all = [...rowsByKey.values()].map(rows => ({ key: rows[0][names.h], rows: sortedByOrder(rows, row => orderOf(row, rows, stacks)) }));
            return positionsInOrder(all, ctx.scales[names.h], titleOf);
        };
        // the position of an index, of a key before, e.g. of the draw before
        // with other positions, at its index if it has none anymore
        const showKey = (index, row, before) => {
            positions ??= positionsOf();
            if (positions.length == 0) {
                hide();
                return;
            }
            const same = before === undefined ? -1 : positions.findIndex(p => String(p.key) === String(before));
            const i = same >= 0 ? same : clamp(index, positions.length);
            const { key, rows, point } = positions[i];
            const r = clamp(row, rows.length);
            lastEvent = null;
            pointerAt = null;
            // the hover of the keyboard is read by screen readers
            announced = true;
            lastKey = { index: i, row: r, key };
            show({ key, rows, nearest: rows[r], point });
        };
        selectShown = () => {
            if (current)
                emit('select', payload(current));
        };
        step = s => {
            const current = lastKey;
            if (s == 'first' || s == 'last')
                return showKey(s == 'first' ? 0 : Infinity, 0);
            if (s == 'up' || s == 'down')
                return current ? showKey(current.index, current.row + (s == 'down' ? 1 : -1)) : showKey(0, 0);
            showKey(current ? current.index + s : (s > 0 ? 0 : Infinity), 0);
        };

        // mouse, touch and pen, vertical swipes still scroll the page
        // the area of the events, the plot area or with `"area": "facet"` also
        // the margins, e.g. the labels of the rows of horizontal bars
        const area = coord.hover.area(ctx, ctx.inner);
        if (options.area == 'facet' && area.tagName == 'rect') {
            const facet = facetOf();
            const o = origin();
            area.setAttribute("x", -(facet.margins.left + o[0]));
            area.setAttribute("y", -(facet.margins.top + o[1]));
            area.setAttribute("width", facet.width);
            area.setAttribute("height", facet.height);
        }
        // the full text of a cut text under the pointer (see fitText of
        // utils/draw.js) is the title of the area, it is above the texts,
        // so the browser shows it as their tooltip
        let tooltip = null;
        // the texts are cut in the draw, before the hover, so they are searched once
        const anyCut = Boolean(ctx.inner.querySelector('text > title'));
        const cutText = e => {
            const text = e.pointerType == 'mouse' && anyCut
                ? document.elementsFromPoint?.(e.clientX, e.clientY)
                    .find(el => el.tagName == 'text' && ctx.inner.contains(el) && el.querySelector(':scope > title'))
                : null;
            const full = text ? text.querySelector(':scope > title').textContent : '';
            if (full || tooltip)
                tooltip ??= area.appendChild(create("title"));
            if (tooltip && tooltip.textContent !== full)
                tooltip.textContent = full;
        };
        area.setAttribute("class", "vis-events");
        area.setAttribute("opacity", 0);
        area.style.setProperty("touch-action", "pan-y");
        area.addEventListener("pointerdown", move);
        area.addEventListener("pointermove", move);
        area.addEventListener("pointermove", cutText);
        // a click or a tap, e.g. on a region of a map
        area.addEventListener("click", e => {
            const found = at(e);
            if (found)
                emit('select', payload(found));
        });
        area.addEventListener("pointerleave", e => {
            if (e.pointerType != "touch")
                hide();
        });
        // the browser scrolls the page instead
        area.addEventListener("pointercancel", hide);

        // the hover of the draw before with the rows of this one
        if (hover.visible && lastEvent)
            move(lastEvent);
        else if (hover.visible && lastKey)
            showKey(lastKey.index, lastKey.row, lastKey.key);
        else
            hover.visible = false;
    };

    return {
        init,
        render,
        key,
        hide: () => hide?.(),
        get keyboard() { return keyboard },
        get visible() { return hover.visible },
    };
};
