export { perRow, perGroup, finite, curve, points, alongRows, propScale, dodge, halo, inside, centered };

import * as d3 from "@/utils/d3";
import { refOf, refNames } from '@/utils/expr';
import { fromVersion4, markPath, warnOnce } from '@/utils/warn';
import { curves, groupAttrs, groupKey, keyOf, rowOf } from "@/utils/draw";

const finite = (...values) => values.every(v => Number.isFinite(v));

const curve = plot => curves[plot.curve ?? 'linear'] ?? d3.curveLinear;

// the dim of a prop of a plot (`path`, e.g. `d.x`) and its scale: of a
// reference to its scaled value, also in an expression, e.g. "@x:scaled"
const propDim = (plot, ctx, path) => {
    const value = path.split('.').reduce((p, k) => p?.[k], plot?.props);
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
 * dim of `x` (of polar charts `angle`, the prefix `d.` of the paths of lines
 * and areas), of `y` if that one is categorical and `x` is not (a vertical
 * line through the categories); of a band or a point scale in the order of
 * its categories, of a continuous one ascending (the rows without a value at
 * the end), so lines and areas of unsorted rows do not zig-zag and `select`
 * `first` and `last` are the ends of the line. `order` of the mark: "x" or
 * "y" (of polar charts the angle or the radius) is the dim, "rows" keeps
 * the order of the rows, e.g. of a connected scatter plot.
 */
const alongRows = (rows, plot, ctx, prefix = '') => {
    const order = plot?.order;
    if (order == 'rows' || rows.length < 2)
        return rows;
    const polar = /^polar:/.test(plot?.type ?? '');
    const first = propDim(plot, ctx, `${prefix}${polar ? 'angle' : 'x'}`);
    const other = propDim(plot, ctx, `${prefix}${polar ? 'radius' : 'y'}`);
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
    // a numeric dim (not dates) of unsorted rows of a definition of 4.x,
    // which drew them in the order of the rows: maybe a connected scatter
    // plot, a warning says how to keep it (once per mark, `order` given none)
    if (order === undefined && ctx?.store?.defOrg?.[fromVersion4] && !dim.scale.step && !(dim.scale.domain()[0] instanceof Date))
        warnOnce(ctx.store, `order:${plot.id}`, `${markPath(ctx.store.def, plot, true)}: the rows are not in the order of '${dim.name}', gen-vis 5 draws them along it, 4.x in their order; "order": "rows" keeps the order of the rows, e.g. of a connected scatter plot ("order": "${dim === first ? 'x' : 'y'}" without this warning)`);
    // stable: rows of the same place keep their order
    return rows.map((row, i) => i).sort((a, b) => ranks[a] - ranks[b] || a - b).map(i => rows[i]);
};

// the points of the path of a group, the values of `d` of its rows in the
// order along its dim (see alongRows), e.g. a line or the polygon of a radar
// through the categories in the order of `categories`
const points = (g, plot, ctx, path) => {
    const d = g.prop('d');
    const rows = plot ? alongRows(g.rows, plot, ctx, path.includes('.') ? `${path.split('.')[0]}.` : '') : g.rows;
    return rows.map(row => d(row) ?? {});
};

// the scale of the mapping a prop of a plot refers to, e.g. the one of `x`
// of "@x:scaled" or of `d.angle`, undefined if it is no reference
const propScale = (plot, ctx, path) => {
    const value = path.split('.').reduce((p, k) => p?.[k], plot.props);
    // a reference, or the scaled position in an expression, e.g. "@x:scaled" of dodged bars
    const ref = refOf(value) ?? refNames(value).find(n => n.split(':')[1] == 'scaled');
    return ref === undefined ? undefined : ctx.scales[ref.split(':')[0]];
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

// the layer of an element of `element` per row, without the rows of missing
// values, `translate(values, row, group)` changes the values of the props of
// a row, the elements of the draw before are updated, the ones of the same
// rows or of the same `key(values)`, e.g. the feature of a map in another
// year, see drawLayer of utils/draw.js
const perRow = (groups, element, translate = v => v, key) => ({
    element,
    key,
    groups: groups.map(g => ({
        categories: g.categories,
        // the custom properties of the highlight of the group, set on its element, see setGroupData
        vars: g.vars,
        items: g.rows.filter(g.complete).map(row => {
            // the row of the element, e.g. for the highlight of a row
            const v = translate(g.at(row), row, g);
            v[rowOf] = row;
            return v;
        }),
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

// the props of the halo of texts (`halo` of the plot, true or its width in
// pixels), in the color of `--gen-vis-halo-color`, the props of the plot
// replace them, e.g. a `stroke`
const halo = plot => !plot.halo ? {} : {
    "paint-order": "stroke",
    stroke: "var(--gen-vis-halo-color, white)",
    "stroke-width": plot.halo === true ? 3 : plot.halo,
    "stroke-linejoin": "round",
};

const element = type => ({ update: true, marks: groups => perRow(groups, type) });

// the labels placed inside of bands (see placeInside of plots/inside.js):
// a group of the row of each label and the spots by the rows, centered
const centered = { 'text-anchor': 'middle', 'dominant-baseline': 'central' };
const inside = placed => ({ groups: placed.map(([g, row]) => ({ ...g, rows: [row] })), spots: new Map(placed.map(([, row, s]) => [row, s])) });

// the svg elements, an element per row in any coordinate system, the props are
// its attributes, e.g. "@x:scaled" of cx
export default {
    'svg:circle': element("circle"),
    'svg:line': element("line"),
    'svg:rect': element("rect"),
    // `dodge` of the plot moves the texts apart vertically, to at least this
    // distance, e.g. labels at the ends of lines, `halo` draws a halo
    // `max-width` of the props cuts or wraps the texts, see fitText
    'svg:text': {
        update: true,
        marks(groups, plot, ctx) {
            const props = halo(plot);
            // inside the bands of an area plot (`place`), see plots/inside.js
            if (plot.place?.in !== undefined) {
                const { groups: placed, spots } = inside(ctx.store.inside.placeInside(groups, plot, ctx, false));
                return { ...perRow(placed, "text", (v, row) => ({ ...props, ...v, ...centered, x: spots.get(row).x, y: spots.get(row).y })), fit: true };
            }
            if (!plot.dodge)
                return { ...perRow(groups, "text", v => ({ ...props, ...v })), fit: true };
            // the positions of the texts of all groups, moved apart
            const rows = groups.flatMap(g => g.rows.filter(g.complete).map(row => [row, parseFloat(g.at(row).y)]));
            const moved = dodge(rows.map(([, y]) => y), plot.dodge);
            const ys = new Map(rows.map(([row], i) => [row, moved[i]]));
            return { ...perRow(groups, "text", (v, row) => ({ ...props, ...v, y: ys.get(row) })), fit: true };
        },
    },
};
