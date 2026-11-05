import { evaluate } from "@/utils/expr";
import { directOf, rowOf } from "@/utils/draw";
import { perRow, finite } from "@/plots/elements";
import { warnOnce } from "@/utils/warn";

const keyOf = (ctx, row) => String(row[ctx.store.def.geo.join]);

// the features of the integer keys without their leading zeros, e.g. "1" of
// the id "01" for the value 1 of a CSV, of keys which are not ambiguous
// (null), by the geometry
const integerKeys = new WeakMap();
const integer = k => /^\d+$/.test(k) ? k.replace(/^0+(?=\d)/, '') : null;
const byInteger = geo => {
    if (!integerKeys.has(geo)) {
        const map = new Map();
        geo.byKey.forEach((f, k) => {
            const i = k === null ? null : integer(k);
            if (i !== null)
                map.set(i, map.has(i) ? null : f);
        });
        integerKeys.set(geo, map);
    }
    return integerKeys.get(geo);
};

/**
 * The feature of a value of the join of a map by its key or as an integer
 * without leading zeros, e.g. the id "01" of the value 1, also of the hover.
 */
export const featureByKey = (geo, key) => {
    const k = String(key);
    const f = geo.byKey.get(k);
    if (f || integer(k) === null)
        return f;
    return byInteger(geo).get(integer(k)) ?? undefined;
};

// the feature of a row, joined by the mapping `join` of the geometry
const featureOf = (ctx, row) => featureByKey(ctx.store.geo, keyOf(ctx, row));

// the rows without a feature are not drawn, e.g. of a region the geometry
// has not, if no row has one the join is broken (e.g. the wrong key of the
// features), a warning names the first keys, once per chart, the keys left
// out by `include` and `exclude` are not counted
const joined = ctx => {
    const unmatched = new Set();
    let matched = false;
    const { include, exclude } = ctx.store.def.geo;
    const left = k => (include && !include.map(String).includes(k)) || (exclude ?? []).map(String).includes(k);
    return {
        add(row, f) {
            if (f)
                matched = true;
            else if (!left(keyOf(ctx, row)))
                unmatched.add(keyOf(ctx, row));
        },
        warn() {
            if (matched || !unmatched.size)
                return;
            const { join, key = 'id' } = ctx.store.def.geo;
            const first = [...unmatched].slice(0, 3).map(k => `'${k}'`).join(', ');
            warnOnce(ctx.store, 'geo:join', `no value of the join '${join}' (${first}${unmatched.size > 3 ? ', ...' : ''}) `
                + `matches a feature by its key '${key}', the rows are not drawn, the key of the features is geo.key, e.g. "properties.code"`);
        },
    };
};

// the distance of a point to the rings of a polygon (projected), negative
// outside of it
const ringDistance = (x, y, rings) => {
    let inside = false;
    let min = Infinity;
    for (const ring of rings)
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [ax, ay] = ring[i];
            const [bx, by] = ring[j];
            if ((ay > y) != (by > y) && x < (bx - ax)*(y - ay)/(by - ay) + ax)
                inside = !inside;
            // the distance to the segment
            const dx = bx - ax;
            const dy = by - ay;
            const t = dx || dy ? Math.max(0, Math.min(1, ((x - ax)*dx + (y - ay)*dy)/(dx*dx + dy*dy))) : 0;
            min = Math.min(min, Math.hypot(x - ax - t*dx, y - ay - t*dy));
        }
    return inside ? min : -min;
};

/**
 * The pole of inaccessibility of a polygon (projected rings, the first one
 * the outer one): the point inside of it farthest from its edges, and the
 * distance (polylabel of Mapbox: cells of a grid split until they can not
 * have a farther point, within `precision` pixels).
 */
const pole = (rings, precision = 1) => {
    const xs = rings[0].map(p => p[0]);
    const ys = rings[0].map(p => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const size = Math.min(x1 - x0, y1 - y0);
    if (!(size > 0))
        return { x: x0, y: y0, d: 0 };
    const cell = (x, y, h) => {
        const d = ringDistance(x, y, rings);
        return { x, y, h, d, max: d + h*Math.SQRT2 };
    };
    const queue = [];
    for (let x = x0; x < x1; x += size)
        for (let y = y0; y < y1; y += size)
            queue.push(cell(x + size/2, y + size/2, size/2));
    let best = cell((x0 + x1)/2, (y0 + y1)/2, 0);
    while (queue.length) {
        // the cell which can have the farthest point first
        let k = 0;
        for (let i = 1; i < queue.length; i++)
            if (queue[i].max > queue[k].max)
                k = i;
        const c = queue.splice(k, 1)[0];
        if (c.d > best.d)
            best = c;
        if (c.max - best.d <= precision)
            continue;
        const h = c.h/2;
        queue.push(cell(c.x - h, c.y - h, h), cell(c.x + h, c.y - h, h), cell(c.x - h, c.y + h, h), cell(c.x + h, c.y + h, h));
    }
    return best;
};

export { pole };

// the place of the label of a feature: the pole of inaccessibility of its
// largest polygon in the projection (the area of the largest circle in it
// is around it, `d` its radius), the centroid of other geometries, kept
// per projection
const poles = new WeakMap();
const labelPlace = (ctx, f) => {
    let byFeature = poles.get(ctx.projection);
    if (!byFeature)
        poles.set(ctx.projection, byFeature = new WeakMap());
    if (!byFeature.has(f)) {
        const g = f.geometry;
        const polygons = g?.type == 'Polygon' ? [g.coordinates] : g?.type == 'MultiPolygon' ? g.coordinates : [];
        const projected = polygons.map(p => p.map(ring => ring.map(c => ctx.projection(c)).filter(Boolean))).filter(p => p[0]?.length > 2);
        const area = rings => Math.abs(rings[0].reduce((s, [x, y], i, r) => s + x*r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0]*y, 0))/2;
        const largest = projected.reduce((a, b) => !a || area(b) > area(a) ? b : a, null);
        const p = largest ? pole(largest) : null;
        const c = ctx.path.centroid(f);
        byFeature.set(f, p ? { x: p.x, y: p.y, d: p.d, area: largest ? area(largest) : 0 } : { x: c[0], y: c[1], d: 0, area: 0 });
    }
    return byFeature.get(f);
};

// the size of a text of an item, estimated: of its characters and its font
// size (11 pixels by default), the marks are computed before they are drawn
const textBox = v => {
    const size = parseFloat(v['font-size']) || 11;
    return { w: String(v.text ?? '').length*size*0.55, h: size };
};

// the items of a layer of perRow without the ones of `drop(item)`
const without = (layer, drop) => {
    layer.groups.forEach(g => g.items = g.items.filter(v => !drop(v)));
    return layer;
};

// an element of `type` per row at its `lon` and `lat`, without them at the
// center of its feature (`labels`: at the pole of its largest polygon,
// `"place": "centroid"` at the centroid, `"fit": true` only the ones which
// fit into the area around it, `"overlap": false` without the ones which
// overlap the one of a larger area), as `x` and `y`
const positioned = (type, x, y, labels = false) => ({
    coords: ['geo'],
    update: true,
    marks(groups, plot, ctx) {
        const join = joined(ctx);
        const atPole = labels && plot.place != 'centroid';
        const places = new Map();
        const layer = perRow(groups, type, (v, row) => {
            const { lon, lat, ...props } = v;
            let p;
            if ('lon' in v && 'lat' in v) {
                p = ctx.projection([lon, lat]);
            } else {
                const f = featureOf(ctx, row);
                join.add(row, f);
                const place = f && atPole ? labelPlace(ctx, f) : null;
                p = place ? [place.x, place.y] : f && ctx.path.centroid(f);
                if (place)
                    places.set(row, place);
            }
            // a position the projection has not (e.g. albersUsa) is not drawn
            return { ...props, [x]: p?.[0] ?? NaN, [y]: p?.[1] ?? NaN, 'data-geo-key': keyOf(ctx, row) };
        });
        join.warn();
        without(layer, v => !finite(v[x], v[y]));
        if (!labels || (!plot.fit && plot.overlap !== false))
            return layer;
        // the labels which fit into their area, of the larger areas first
        // without overlaps, see textBox
        const items = layer.groups.flatMap(g => g.items).map(v => ({ v, box: textBox(v), place: places.get(v[rowOf]) }))
            .sort((a, b) => (b.place?.area ?? 0) - (a.place?.area ?? 0));
        const kept = [];
        const dropped = new Set();
        items.forEach(({ v, box, place }) => {
            if (plot.fit && place && (box.w/2 > 1.5*place.d || box.h/2 > place.d)) {
                dropped.add(v);
                return;
            }
            // 2 pixels around a label
            const r = { x0: v[x] - box.w/2 - 2, x1: v[x] + box.w/2 + 2, y0: v[y] - box.h/2 - 2, y1: v[y] + box.h/2 + 2 };
            if (plot.overlap === false && kept.some(k => r.x0 < k.x1 && k.x0 < r.x1 && r.y0 < k.y1 && k.y0 < r.y1)) {
                dropped.add(v);
                return;
            }
            kept.push(r);
        });
        return without(layer, v => dropped.has(v));
    },
});

// the plot types of maps, the geometry is drawn in the projection of the facet
export default {
    // all features, e.g. as background or borders, the props are the ones of
    // the facet, e.g. of the globals
    'geo:base': {
        coords: ['geo'],
        update: true,
        marks(groups, plot, ctx) {
            const props = evaluate(plot.props, ctx.scope);
            const { features, key } = ctx.store.geo;
            return {
                class: "vis-features",
                element: "path",
                items: features.map(f => ({ [directOf]: { d: ctx.path(f), 'data-geo-key': key(f) }, ...props })),
            };
        },
    },

    // the feature of every row, e.g. colored by its value, rows without a
    // feature are not drawn, the element of a feature is the one of the draw
    // before, also of another row, e.g. of another year of a slider, so its
    // color moves with a transition
    'geo:region': {
        coords: ['geo'],
        update: true,
            marks(groups, plot, ctx) {
            const join = joined(ctx);
            const layer = perRow(groups, "path", (v, row) => {
                const f = featureOf(ctx, row);
                join.add(row, f);
                return { ...v, d: f ? ctx.path(f) : null, 'data-geo-key': keyOf(ctx, row) };
            }, v => v['data-geo-key']);
            join.warn();
            return without(layer, v => v.d === null);
        },
    },

    'geo:circle': positioned('circle', 'cx', 'cy'),
    'geo:text': positioned('text', 'x', 'y', true),

    // the borders of an object of TopoJSON (`object`, the one of the geometry
    // by default) as one path, every border once, e.g. the ones of the states
    // above the districts, `borders` all (default), the ones between features
    // (inner) or the outline (outer), the props are fixed as of geo:base
    'geo:mesh': {
        coords: ['geo'],
        update: true,
        marks(groups, plot, ctx) {
            const props = evaluate(plot.props, ctx.scope);
            const mesh = ctx.store.geo.mesh(plot.object, plot.borders);
            return { class: "vis-mesh", element: "path", items: [{ [directOf]: { d: ctx.path(mesh), fill: "none" }, ...props }] };
        },
    },
};
