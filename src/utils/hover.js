export { orderOf, byOrder, sortedByOrder, nearestWithRows, nearestRow, pointFinder, pointPosition, placed, positionsInOrder, clamp };

// the parts of the hover of a facet without its elements and events, see
// hoverInit of comp/facet.js
import * as d3 from "@/utils/d3";
import { bandCenter } from "@/utils/scales";

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

// the higher order first, a total order, also of two rows above or below
// all stacks (Infinity - Infinity is NaN), the same orders keep their order
const byOrder = (a, b) => (b > a) - (b < a);

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
// value, outside of the stacks the closest one, undefined without a value
const nearestRow = (rows, value, v, stackOf) => {
    if (value === undefined)
        return undefined;
    const distance = stackOf ? row => {
        const [lo, hi] = d3.extent(stackOf(row));
        return value < lo ? lo - value : (value > hi ? value - hi : 0);
    } : row => Math.abs(row[v] - value);
    return d3.least(rows, distance);
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
