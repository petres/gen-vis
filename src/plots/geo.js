import { evaluate } from "@/utils/props";
import { directOf } from "@/utils/draw";
import { perRow } from "@/plots/elements";

// the feature of a row, joined by the mapping `join` of the geometry
const featureOf = (ctx, row) => ctx.store.geo.byKey.get(String(row[ctx.store.def.geo.join]));
const keyOf = (ctx, row) => String(row[ctx.store.def.geo.join]);

// an element of `type` per row at its `lon` and `lat`, without them at the
// center of its feature, as `x` and `y`
const positioned = (type, x, y) => ({
    coords: ['geo'],
    update: true,
    marks: (groups, plot, ctx) => perRow(groups, type, (v, row) => {
        const { lon, lat, ...props } = v;
        const f = featureOf(ctx, row);
        const p = 'lon' in v && 'lat' in v ? ctx.projection([lon, lat]) : (f ? ctx.path.centroid(f) : [NaN, NaN]);
        return { ...props, [x]: p[0], [y]: p[1], 'data-geo-key': keyOf(ctx, row) };
    }),
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
        marks: (groups, plot, ctx) => perRow(groups, "path", (v, row) => {
            const f = featureOf(ctx, row);
            return { ...v, d: f ? ctx.path(f) : null, 'data-geo-key': keyOf(ctx, row) };
        }, v => v['data-geo-key']),
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
