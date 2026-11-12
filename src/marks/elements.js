export { perRow, perGroup, linePerGroup, finite, curve, points, areaPoints, alongRows, propDim, propScale, bandOffset, once, dodge, halo, inside, centered };

import * as d3 from "@/utils/d3";
import { refOf, refNames } from '@/utils/expr';
import { curves, groupAttrs, groupKey, keyOf, rowOf } from "@/utils/draw";
import { bandCenter } from "@/utils/scales";

const finite = (...values) => values.every(v => Number.isFinite(v));

const curve = mark => curves[mark.curve ?? 'linear'] ?? d3.curveLinear;

// a value which is the same for all rows of a mark, computed at the first
// row which needs it, e.g. the error of a missing width only with rows,
// also a value of null only once
const once = f => {
    let done = false;
    let value;
    return () => {
        if (!done) {
            value = f();
            done = true;
        }
        return value;
    };
};

// the dim of a prop of a mark (`path`, e.g. `d.x`) and its scale: of a
// reference to its scaled value, also in an expression, e.g. "@x:scaled"
// of dodged bars
const propDim = (mark, ctx, path) => {
    const value = path.split('.').reduce((p, k) => p?.[k], mark?.props);
    const ref = refOf(value) ?? refNames(value).find(n => n.split(':')[1] == 'scaled');
    const name = ref?.split(':')[0];
    const scale = name === undefined ? undefined : ctx?.scales?.[name];
    return scale ? { name, scale } : undefined;
};

// the rank of the rows of a dim along its scale: of a band or a point scale
// the order of its categories, of a continuous one the value (missing ones
// at the end), undefined of other scales
const rankOf = ({ name, scale }) => {
    if (scale.step) {
        const at = new Map(scale.domain().map((k, i) => [String(k), i]));
        return row => at.get(String(row[name])) ?? at.size;
    }
    if (typeof scale.invert == 'function')
        return row => (typeof row[name] == 'number' && Number.isFinite(row[name]) ? row[name] : Infinity);
    return undefined;
};

/**
 * The rows of a group in the order along the dim its path runs along: the
 * dim of `x` (`cx` of circles, of polar charts `angle`, the prefix `d.` of the paths of lines
 * and areas), of `y` if that one is categorical and `x` is not (a vertical
 * line through the categories); of a band or a point scale in the order of
 * its categories, of a continuous one ascending (the rows without a value at
 * the end), so lines and areas of unsorted rows do not zig-zag and `select`
 * `first` and `last` are the ends of the line. `order` of the mark: "x" or
 * "y" (of polar charts the angle or the radius) is the dim, "rows" keeps
 * the order of the rows, e.g. of a connected scatter plot.
 */
const alongRows = (rows, mark, ctx, prefix = '') => {
    const order = mark?.order;
    if (order == 'rows' || rows.length < 2)
        return rows;
    const polar = /^polar:/.test(mark?.type ?? '');
    // (of a circle, e.g. a point, its center `cx` and `cy`)
    const first = propDim(mark, ctx, `${prefix}${polar ? 'angle' : 'x'}`) ?? (polar ? undefined : propDim(mark, ctx, `${prefix}cx`));
    const other = propDim(mark, ctx, `${prefix}${polar ? 'radius' : 'y'}`) ?? (polar ? undefined : propDim(mark, ctx, `${prefix}cy`));
    const dim = order == 'x' ? first : order == 'y' ? other
        : (!polar && other?.scale.step && !first?.scale.step ? other : first);
    const rank = dim && rankOf(dim);
    if (!rank)
        return rows;
    const ranks = rows.map(rank);
    let sorted = true;
    for (let i = 1; i < ranks.length && sorted; i++)
        sorted = ranks[i - 1] <= ranks[i];
    if (sorted)
        return rows;
    // stable: rows of the same place keep their order
    return rows.map((row, i) => i).sort((a, b) => ranks[a] - ranks[b] || a - b).map(i => rows[i]);
};

// the points of the path of a group, the values of `d` of its rows in the
// order along its dim (see alongRows), e.g. a line or the polygon of a radar
// through the categories in the order of `categories`
const points = (g, mark, ctx, path) => {
    const d = g.prop('d');
    const rows = mark ? alongRows(g.rows, mark, ctx, path.includes('.') ? `${path.split('.')[0]}.` : '') : g.rows;
    return rows.map(row => d(row) ?? {});
};

/**
 * The points of the paths of the groups of an area (see points) by their
 * group, `keys` are the names of the position, the start and the end of a
 * point, e.g. `x`, `y0` and `y1`. Of stacked areas a group without a row at
 * a position of another group has a point of no height there, at its place
 * in the stack (the start of the next group of the stack, or the end of the
 * one before), so the areas of the others do not overlap it between its
 * neighbours, e.g. a series without a row of a year; not of `"order":
 * "rows"`. Kept for the groups of a draw, e.g. of the labels inside the
 * areas (see marks/inside.js).
 */
const stackedPoints = new WeakMap();
const areaPoints = (groups, mark, ctx, keys) => {
    if (stackedPoints.get(groups)?.mark === mark)
        return stackedPoints.get(groups).points;
    const [pos, lo, hi] = keys;
    const lists = groups.map(g => points(g, mark, ctx, `d.${pos}`));
    const result = new Map(groups.map((g, i) => [g, lists[i]]));
    stackedPoints.set(groups, { mark, points: result });
    const v = ctx.axis?.v;
    const stacked = v !== undefined && refOf(mark.props.d?.[lo]) == `${v}:start:scaled` && refOf(mark.props.d?.[hi]) == `${v}:end:scaled`;
    if (!stacked || mark.order == 'rows' || groups.length < 2)
        return result;
    // the groups in the order of the stack, their points by their position
    const order = groups.map((g, i) => i).filter(i => groups[i].rows.length > 0)
        .sort((a, b) => ctx.stackOrder?.(groups[a].rows[0], groups[b].rows[0]) || a - b);
    const at = new Map();
    order.forEach(i => lists[i].filter(p => finite(p[pos])).forEach(p => {
        if (!at.has(p[pos]))
            at.set(p[pos], new Map());
        at.get(p[pos]).set(i, p);
    }));
    // the direction of the points along the position, e.g. of a reversed scale
    const run = lists.map(l => l.filter(p => finite(p[pos]))).find(l => l.length > 1 && l[0][pos] !== l.at(-1)[pos]);
    const direction = run && run.at(-1)[pos] < run[0][pos] ? -1 : 1;
    const added = new Set();
    at.forEach((of, x) => {
        if (of.size == order.length)
            return;
        order.forEach((i, k) => {
            if (of.has(i))
                return;
            const after = order.slice(k + 1).find(j => of.has(j));
            const before = order.slice(0, k).findLast(j => of.has(j));
            const level = after !== undefined ? of.get(after)[lo] : of.get(before)[hi];
            if (!finite(level))
                return;
            lists[i].push({ [pos]: x, [lo]: level, [hi]: level });
            added.add(i);
        });
    });
    // along the position again
    added.forEach(i => result.set(groups[i], lists[i].filter(p => finite(p[pos])).map((p, j) => [p, j])
        .sort(([p, a], [q, b]) => direction*(p[pos] - q[pos]) || a - b).map(([p]) => p)));
    return result;
};

// the scale of the dim a prop of a mark refers to, e.g. the one of `x`
// of "@x:scaled" or of `d.angle`, undefined if it is no reference
const propScale = (mark, ctx, path) => propDim(mark, ctx, path)?.scale;

// the offset of the center of the band of a position of a path (`path`, e.g.
// `d.x` of a line): of the scaled value of a dim of a band scale
// ("@x:scaled", its start), so a line runs through the centers of the bars
// of its categories, 0 of other scales and of other names, e.g.
// "@x:scaled:center"
const bandOffset = (mark, ctx, path) => {
    const value = path.split('.').reduce((p, k) => p?.[k], mark.props);
    const name = refNames(value).map(n => n.split(':')).find(n => n.length == 2 && n[1] == 'scaled')?.[0];
    const scale = name === undefined ? undefined : ctx.scales?.[name];
    return scale ? bandCenter(scale) : 0;
};

// the layer of a path per group, e.g. a line, with the props of the group
// and `d(group)`, the path, the paths of the draw before are updated, see
// drawLayer of utils/draw.js
const perGroup = (groups, d) => ({
    element: 'path',
    key: item => item[keyOf],
    // the custom properties of the highlight of the group (see highlightVars) on its path
    items: groups.map(g => ({ ...g.attrs, ...groupAttrs(g), ...(g.vars ?? {}), ...(d ? { d: d(g) } : {}), [keyOf]: groupKey(g) })),
});

// the layer of the paths of lines per group (see perGroup): a value between
// missing ones, a sub-path of one point (`M x,yZ` of d3), is a dot of the
// width of the line, a short segment with round caps (of the path, unless
// the mark has a `stroke-linecap`), a sub-path of no length has no caps of
// the default butt
const isolated = /M([-+\d.,e]+)Z/g;
const linePerGroup = (groups, d) => {
    const layer = perGroup(groups, d);
    layer.items.forEach(item => {
        const dots = typeof item.d == 'string' && isolated.test(item.d);
        isolated.lastIndex = 0;
        if (dots)
            item.d = item.d.replace(isolated, 'M$1h0.01');
        // (null removes the round caps of a draw before)
        item['stroke-linecap'] ??= dots ? 'round' : null;
    });
    return layer;
};

// the props of the position and the size of an element per row
const placing = ['x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'width', 'height'];

// the values of an element have a place: no prop of its position or size is
// a number which is not finite or without a value, e.g. of 0 of a log scale
// or of a category which is not in a fixed domain (null is no attribute)
const placed = v => placing.every(k => !(k in v) || v[k] === null || (typeof v[k] == 'number' ? Number.isFinite(v[k]) : v[k] !== undefined));

// the layer of an element of `element` per row, without the rows of missing
// values and the ones without a position (see placed, also the ones
// `translate` returns null of), `translate(values, row, group)` changes the
// values of the props of a row, the elements of the draw before are updated,
// the ones of the same rows or of the same `key(values)`, e.g. the feature
// of a map in another year, see drawLayer of utils/draw.js
const perRow = (groups, element, translate = v => v, key) => ({
    element,
    key,
    groups: groups.map(g => ({
        categories: g.categories,
        // the custom properties of the highlight of the group, set on its element, see setGroupData
        vars: g.vars,
        items: g.rows.filter(g.complete).map(row => {
            const v = translate(g.at(row), row, g);
            if (!v || !placed(v))
                return null;
            // the row of the element, e.g. for the highlight of a row
            v[rowOf] = row;
            return v;
        }).filter(Boolean),
    })),
});

/**
 * The positions `ys` moved apart to at least the distance `gap`, e.g. of
 * labels at the ends of lines, positions which are too close are a group,
 * they are spread around the mean of their positions.
 */
const dodge = (ys, gap) => {
    const order = ys.map((y, i) => i).filter(i => Number.isFinite(ys[i])).sort((a, b) => ys[a] - ys[b]);
    const top = c => c.mean - (c.items.length - 1)*gap/2;
    const groups = order.map(i => ({ items: [i], mean: ys[i] }));
    for (let k = 1; k < groups.length; k++) {
        const [a, b] = [groups[k - 1], groups[k]];
        if (top(b) < top(a) + a.items.length*gap) {
            const items = [...a.items, ...b.items];
            groups.splice(k - 1, 2, { items, mean: d3.mean(items, i => ys[i]) });
            // the merged group can be too close to the one before
            k = Math.max(0, k - 2);
        }
    }
    const moved = [...ys];
    groups.forEach(g => g.items.forEach((i, j) => moved[i] = top(g) + j*gap));
    return moved;
};

// the props of the halo of texts (`halo` of the mark, true or its width in
// pixels), in the color of `--gen-vis-halo-color`, the props of the mark
// replace them, e.g. a `stroke`
const halo = mark => !mark.halo ? {} : {
    "paint-order": "stroke",
    stroke: "var(--gen-vis-halo-color, white)",
    "stroke-width": mark.halo === true ? 3 : mark.halo,
    "stroke-linejoin": "round",
};

const element = type => ({ update: true, marks: groups => perRow(groups, type) });

// the labels placed inside of bands (see placeInside of marks/inside.js):
// a group of the row of each label and the spots by the rows, centered
const centered = { 'text-anchor': 'middle', 'dominant-baseline': 'central' };
const inside = placed => ({ groups: placed.map(([g, row]) => ({ ...g, rows: [row] })), spots: new Map(placed.map(([, row, s]) => [row, s])) });

// the svg elements, an element per row in any coordinate system, the props are
// its attributes, e.g. "@x:scaled" of cx
export default {
    'svg:circle': element("circle"),
    'svg:line': element("line"),
    'svg:rect': element("rect"),
    // `dodge` of the mark moves the texts apart vertically, to at least this
    // distance, e.g. labels at the ends of lines, `halo` draws a halo
    // `max-width` of the props cuts or wraps the texts, see fitText
    'svg:text': {
        update: true,
        marks(groups, mark, ctx) {
            const props = halo(mark);
            // inside the bands of an area mark (`place`), see marks/inside.js
            if (mark.place?.in !== undefined) {
                const { groups: placed, spots } = inside(ctx.store.inside.placeInside(groups, mark, ctx, false));
                return { ...perRow(placed, "text", (v, row) => ({ ...props, ...v, ...centered, x: spots.get(row).x, y: spots.get(row).y })), fit: true };
            }
            if (!mark.dodge)
                return { ...perRow(groups, "text", v => ({ ...props, ...v })), fit: true };
            // the positions of the texts of all groups, moved apart
            const rows = groups.flatMap(g => g.rows.filter(g.complete).map(row => [row, parseFloat(g.at(row).y)]));
            const moved = dodge(rows.map(([, y]) => y), mark.dodge);
            const ys = new Map(rows.map(([row], i) => [row, moved[i]]));
            return { ...perRow(groups, "text", (v, row) => ({ ...props, ...v, y: ys.get(row) })), fit: true };
        },
    },
};
