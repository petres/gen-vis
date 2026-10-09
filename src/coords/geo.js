import * as d3 from "@/utils/d3";
import { setAnnotationProps } from "@/coords/annotations";

// the mapping of the regions, its values are the keys of the features
const joinOf = store => store.def.geo?.join;

// the projection of the definition, e.g. { "type": "conicConformal", "rotate": [-10, 0] },
// fitted to the facet, `fit` are the features of all keys (default), of the
// keys with data ("data") or of a list of keys, e.g. ["AT"]
const projection = ctx => {
    const def = ctx.store.def.geo ?? {};
    const { type = 'mercator', ...params } = def.projection ?? {};
    const make = d3.named(d3.projections, type);
    if (!make)
        throw new Error(`Unknown projection '${type}', e.g. 'mercator' or 'conicConformal'`);
    const p = make();
    Object.entries(params).forEach(([k, v]) => p[k](v));

    const { features, key } = ctx.store.geo;
    const join = joinOf(ctx.store);
    let keys = null;
    if (def.fit == 'data' && join)
        keys = new Set(ctx.rows.map(e => String(e[join])));
    else if (Array.isArray(def.fit))
        keys = new Set(def.fit.map(String));
    const fitted = keys ? features.filter(f => keys.has(key(f))) : features;
    return p.fitSize([ctx.innerWidth, ctx.innerHeight], { type: 'FeatureCollection', features: fitted.length ? fitted : features });
};

// the element of a feature under the pointer, the browser knows it, without
// layout (e.g. jsdom) the feature containing the point is taken
const featureAt = (ctx, pointer, event) => {
    const element = event && document.elementsFromPoint?.(event.clientX, event.clientY)
        .find(e => ctx.inner.node().contains(e) && e.hasAttribute('data-geo-key'));
    if (element)
        return element.getAttribute('data-geo-key');
    const position = ctx.projection.invert(pointer);
    const f = position && ctx.store.geo.features.find(f => d3.geoContains(f, position));
    return f ? ctx.store.geo.key(f) : null;
};

// a map, the features of the geometry of the definition in a projection, the
// rows are joined to them by the mapping `join` of the geometry
export default {
    ranges: {},
    axis: {},
    positions: [],
    dims: (width, height) => ({ width, height }),
    // the regions, the values of the hover are the first numeric mapping with a hover
    names(store) {
        const h = joinOf(store);
        const v = store.mappingNamesWithKey('hover')
            .find(n => n != h && ['numeric', 'date'].includes(store.mapping(n).type));
        return { ...(h ? { h } : {}), ...(v ? { v } : {}) };
    },
    prepare(ctx) {
        if (!ctx.store.geo)
            throw new Error(`A map needs a geometry, e.g. "geo": { "data": "regions.json" }`);
        ctx.projection = projection(ctx);
        ctx.path = d3.geoPath(ctx.projection);
    },
    axes: () => {},
    // a text or a circle at `lon` and `lat`, e.g. of a city
    annotations: ['text', 'circle'],
    annotate(ctx, g, a) {
        const p = ctx.projection([a.lon, a.lat]);
        if (!p)
            return;
        if (a.type == 'text')
            setAnnotationProps(g.append("text").attr("class", "annotation text").attr("x", p[0]).attr("y", p[1]), a, ctx, { "font-size": 11, fill: "#444" });
        else if (a.type == 'circle')
            setAnnotationProps(g.append("circle").attr("class", "annotation circle").attr("cx", p[0]).attr("cy", p[1]), a, ctx, { r: 4, fill: "#666" });
    },
    hover: {
        area: (ctx, parent) => parent.append("rect")
            .attr("width", ctx.innerWidth)
            .attr("height", ctx.innerHeight),

        // the region under the pointer, the values are not compared
        locate(ctx, pointer, names, event) {
            const key = featureAt(ctx, pointer, event);
            return key === null ? null : { key };
        },

        // no line, the hover is beside the center of the region
        marker(ctx, key, names, line) {
            line.attr("x1", null).attr("x2", null).attr("y1", null).attr("y2", null);
            const f = ctx.store.geo.byKey.get(String(key));
            const [x, y] = f ? ctx.path.centroid(f) : [ctx.innerWidth/2, ctx.innerHeight/2];
            return { x, y, side: x > ctx.innerWidth/2 ? "left" : "right" };
        },

        // the name of the props of the region, of the feature (`name` of the
        // geometry, the property "name" by default) or its key
        title(ctx, key, names) {
            const f = ctx.store.geo.byKey.get(String(key));
            const property = (ctx.store.def.geo.name ?? 'name').replace(/^properties\./, '');
            return ctx.store.mapping(names.h).props?.[key]?.name ?? f?.properties?.[property] ?? key;
        },
    },
};
