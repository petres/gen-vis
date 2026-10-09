import { entryToProp, fillProps } from "@/utils/props";
import { setProps } from "@/utils/draw";
import { pointwise } from "@/plots/elements";

// the feature of a row, joined by the mapping `join` of the geometry
const featureOf = (ctx, row) => ctx.store.geo.byKey.get(String(row[ctx.store.def.geo.join]));
const keyOf = (ctx, row) => entryToProp(String(row[ctx.store.def.geo.join]));

// an element of `type` per row at its `lon` and `lat`, without them at the
// center of its feature, as `x` and `y`
const positioned = (type, x, y) => ({
    coords: ['geo'],
    render: (groups, parent, plotDef, ctx) => pointwise(groups, parent, type, (v, row) => {
        const { lon, lat, ...props } = v;
        const f = featureOf(ctx, row);
        const p = lon && lat ? ctx.projection([lon.value, lat.value]) : (f ? ctx.path.centroid(f) : [NaN, NaN]);
        return { ...props, [x]: entryToProp(p[0]), [y]: entryToProp(p[1]), 'data-geo-key': keyOf(ctx, row) };
    }),
});

// the plot types of maps, the geometry is drawn in the projection of the facet
export default {
    // all features, e.g. as background or borders, the props are fixed
    'geo:base': {
        coords: ['geo'],
        render(groups, parent, plotDef, ctx) {
            const props = fillProps(plotDef.props, ctx.relativeBases, true);
            parent.classed("features", true)
                .selectAll("path")
                .data(ctx.store.geo.features)
                .join("path")
                .attr("d", ctx.path)
                .attr("data-geo-key", ctx.store.geo.key)
                .each(function() { setProps.call(this, props) });
        },
    },

    // the feature of every row, e.g. colored by its value, rows without a
    // feature are not drawn
    'geo:region': {
        coords: ['geo'],
        render: (groups, parent, plotDef, ctx) => pointwise(groups, parent, "path", (v, row) => {
            const f = featureOf(ctx, row);
            return { ...v, d: entryToProp(f ? ctx.path(f) : null), 'data-geo-key': keyOf(ctx, row) };
        }),
    },

    'geo:circle': positioned('circle', 'cx', 'cy'),
    'geo:text': positioned('text', 'x', 'y'),
};
