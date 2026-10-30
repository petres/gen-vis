export { perRow, perGroup, finite, curve, points, propScale, dodge };

import * as d3 from "@/utils/d3";
import { refOf } from "@/utils/props";
import { curves, groupAttrs, groupKey, keyOf, rowOf } from "@/utils/draw";

const finite = (...values) => values.every(v => Number.isFinite(v));

const curve = plot => curves[plot.curve ?? 'linear'] ?? d3.curveLinear;

// the points of the path of a group, the values of `d` of its rows
const points = g => {
    const d = g.prop('d');
    return g.rows.map(row => d(row) ?? {});
};

// the scale of the mapping a prop of a plot refers to, e.g. the one of `x`
// of "@x:scaled" or of `d.angle`, undefined if it is no reference
const propScale = (plot, ctx, path) => {
    const ref = refOf(path.split('.').reduce((p, k) => p?.[k], plot.props));
    return ref === undefined ? undefined : ctx.scales[ref.split(':')[0]];
};

// the layer of a path per group, e.g. a line, with the props of the group
// and `d(group)`, the path, the paths of the draw before are updated, see
// drawLayer of utils/draw.js
const perGroup = (groups, d) => ({
    element: 'path',
    key: item => item[keyOf],
    items: groups.map(g => ({ ...g.attrs, ...groupAttrs(g), ...(d ? { d: d(g) } : {}), [keyOf]: groupKey(g) })),
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

const element = type => ({ update: true, marks: groups => perRow(groups, type) });

// the svg elements, an element per row in any coordinate system, the props are
// its attributes, e.g. "@x:scaled" of cx
export default {
    'svg:circle': element("circle"),
    'svg:line': element("line"),
    'svg:rect': element("rect"),
    // `dodge` of the plot moves the texts apart vertically, to at least this
    // distance, e.g. labels at the ends of lines
    // `max-width` of the props cuts or wraps the texts, see fitText
    'svg:text': {
        update: true,
        marks(groups, plot) {
            if (!plot.dodge)
                return { ...perRow(groups, "text"), fit: true };
            // the positions of the texts of all groups, moved apart
            const rows = groups.flatMap(g => g.rows.filter(g.complete).map(row => [row, parseFloat(g.at(row).y)]));
            const moved = dodge(rows.map(([, y]) => y), plot.dodge);
            const ys = new Map(rows.map(([row], i) => [row, moved[i]]));
            return { ...perRow(groups, "text", (v, row) => ({ ...v, y: ys.get(row) })), fit: true };
        },
    },
};
