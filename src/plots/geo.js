import { evaluate } from "@/utils/props";
import { setProps } from "@/utils/draw";
import { pointwise } from "@/plots/elements";

// the feature of a row, joined by the mapping `join` of the geometry
const featureOf = (ctx, row) => ctx.store.geo.byKey.get(String(row[ctx.store.def.geo.join]));
const keyOf = (ctx, row) => String(row[ctx.store.def.geo.join]);

// an element of `type` per row at its `lon` and `lat`, without them at the
// center of its feature, as `x` and `y`
const positioned = (type, x, y) => ({
    coords: ['geo'],
    update: true,
    render: (groups, parent, plot, ctx) => pointwise(groups, parent, type, (v, row) => {
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
        render(groups, parent, plot, ctx) {
            const props = evaluate(plot.props, ctx.scope);
            parent.classed("vis-features", true)
                .selectAll("path")
                .data(ctx.store.geo.features)
                .join("path")
                .attr("d", ctx.path)
                .attr("data-geo-key", ctx.store.geo.key)
                .each(function() { setProps.call(this, props) });
        },
    },

    // the feature of every row, e.g. colored by its value, rows without a
    // feature are not drawn, the element of a feature is the one of the draw
    // before, also of another row, e.g. of another year of a slider, so its
    // color moves with a transition
    'geo:region': {
        coords: ['geo'],
        update: true,
        render: (groups, parent, plot, ctx) => pointwise(groups, parent, "path", (v, row) => {
            const f = featureOf(ctx, row);
            return { ...v, d: f ? ctx.path(f) : null, 'data-geo-key': keyOf(ctx, row) };
        }, v => v['data-geo-key']),
    },

    'geo:circle': positioned('circle', 'cx', 'cy'),
    'geo:text': positioned('text', 'x', 'y'),
};
