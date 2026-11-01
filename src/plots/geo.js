import { evaluate } from "@/utils/props";
import { directOf } from "@/utils/draw";
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

// the items of a layer of perRow without the ones of `drop(item)`
const without = (layer, drop) => {
    layer.groups.forEach(g => g.items = g.items.filter(v => !drop(v)));
    return layer;
};

// an element of `type` per row at its `lon` and `lat`, without them at the
// center of its feature, as `x` and `y`
const positioned = (type, x, y) => ({
    coords: ['geo'],
    update: true,
    marks(groups, plot, ctx) {
        const join = joined(ctx);
        const layer = perRow(groups, type, (v, row) => {
            const { lon, lat, ...props } = v;
            let p;
            if ('lon' in v && 'lat' in v) {
                p = ctx.projection([lon, lat]);
            } else {
                const f = featureOf(ctx, row);
                join.add(row, f);
                p = f && ctx.path.centroid(f);
            }
            // a position the projection has not (e.g. albersUsa) is not drawn
            return { ...props, [x]: p?.[0] ?? NaN, [y]: p?.[1] ?? NaN, 'data-geo-key': keyOf(ctx, row) };
        });
        join.warn();
        return without(layer, v => !finite(v[x], v[y]));
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
    'geo:text': positioned('text', 'x', 'y'),

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
