// the parts of maps with d3-geo, loaded with the first map, see coords/geo.js
import {
    geoAlbers, geoAlbersUsa, geoAzimuthalEqualArea, geoAzimuthalEquidistant, geoConicConformal,
    geoConicEqualArea, geoConicEquidistant, geoContains, geoEqualEarth, geoEquirectangular, geoGnomonic,
    geoIdentity, geoMercator, geoNaturalEarth1, geoOrthographic, geoPath, geoStereographic, geoTransverseMercator,
} from 'd3-geo';
import { named } from "@/utils/registry";
import { annotationItem } from "@/coords/annotations";
import { rect, placeLine } from "@/coords/hover";
import { featureByKey } from "@/plots/geo";

// the projections of maps (`geo.projection.type`), e.g. mercator
export const projections = {
    albers: geoAlbers, albersUsa: geoAlbersUsa, azimuthalEqualArea: geoAzimuthalEqualArea,
    azimuthalEquidistant: geoAzimuthalEquidistant, conicConformal: geoConicConformal,
    conicEqualArea: geoConicEqualArea, conicEquidistant: geoConicEquidistant, equalEarth: geoEqualEarth,
    equirectangular: geoEquirectangular, gnomonic: geoGnomonic, identity: geoIdentity, mercator: geoMercator,
    naturalEarth1: geoNaturalEarth1, orthographic: geoOrthographic, stereographic: geoStereographic,
    transverseMercator: geoTransverseMercator,
};

// the keys of the features the projection is fitted to, `fit` are the ones of
// all keys (default, null), of the keys with data ("data") or a list of keys,
// e.g. ["AT"], sorted
const fitKeys = ctx => {
    const def = ctx.store.def.geo ?? {};
    const join = ctx.store.def.geo?.join;
    if (def.fit == 'data' && join) {
        const { key } = ctx.store.geo;
        return [...new Set(ctx.rows.map(e => featureByKey(ctx.store.geo, e[join])).filter(f => f).map(key))].sort();
    }
    if (Array.isArray(def.fit))
        return [...new Set(def.fit.map(String))].sort();
    return null;
};

// the projection of the definition, e.g. { "type": "conicConformal", "rotate": [-10, 0] },
// fitted to the features of the keys in the facet
const projection = (ctx, keys) => {
    const { type = 'mercator', ...params } = ctx.store.def.geo?.projection ?? {};
    const make = named(projections, type);
    if (!make)
        throw new Error(`Unknown projection '${type}', e.g. 'mercator' or 'conicConformal'`);
    const p = make();
    Object.entries(params).forEach(([k, v]) => {
        if (typeof p[k] != 'function')
            throw new Error(`The projection '${type}' has no parameter '${k}' (geo.projection.${k})`);
        p[k](v);
    });

    // features without a geometry have no bounds, a fit to them is NaN
    const { features: all, key } = ctx.store.geo;
    const features = all.filter(f => f.geometry);
    const set = keys && new Set(keys);
    const fitted = set ? features.filter(f => set.has(key(f))) : features;
    if (!features.length)
        return p;
    return p.fitSize([ctx.innerWidth, ctx.innerHeight], { type: 'FeatureCollection', features: fitted.length ? fitted : features });
};

// the features of a map are needed, an empty geometry or an `include` of no
// key of them draws nothing
const checkFeatures = store => {
    if (store.geo.features.some(f => f.geometry))
        return;
    const { include, exclude, key = 'id' } = store.def.geo;
    if (include || exclude)
        throw new Error(`The map has no features: none of the geometry is left by geo.include or geo.exclude, matched to their key '${key}' (geo.key)`);
    throw new Error('The map has no features: the geometry is empty');
};

// the paths and their centers of the features of a projection, computed once
const memoPath = p => {
    const path = geoPath(p);
    const paths = new Map();
    const centroids = new Map();
    const memo = f => {
        if (!paths.has(f))
            paths.set(f, path(f));
        return paths.get(f);
    };
    memo.centroid = f => {
        if (!centroids.has(f))
            centroids.set(f, path.centroid(f));
        return centroids.get(f);
    };
    return memo;
};

// the last projections of a map with their paths, by the projection, the
// fitted features and the size of the facet, e.g. a slider over the years
// draws the paths again without computing them
const cacheSize = 8;
const projected = ctx => {
    const keys = fitKeys(ctx);
    const id = JSON.stringify([ctx.store.def.geo?.projection ?? null, keys, ctx.innerWidth, ctx.innerHeight]);
    const cache = ctx.store.geo.projections;
    if (!cache.has(id)) {
        if (cache.size >= cacheSize)
            cache.delete(cache.keys().next().value);
        const p = projection(ctx, keys);
        cache.set(id, { projection: p, path: memoPath(p) });
    }
    return cache.get(id);
};

// the element of a feature under the pointer, the browser knows it, without
// layout (e.g. jsdom) the feature containing the point is taken
const featureAt = (ctx, pointer, event) => {
    const element = event && document.elementsFromPoint?.(event.clientX, event.clientY)
        .find(e => ctx.inner.contains(e) && e.hasAttribute('data-geo-key'));
    if (element)
        return element.getAttribute('data-geo-key');
    const position = ctx.projection.invert(pointer);
    const f = position && ctx.store.geo.features.find(f => geoContains(f, position));
    return f ? ctx.store.geo.key(f) : null;
};

// the projection, the annotations and the hover of maps, see coords/geo.js
export default {
    prepare(ctx) {
        if (!ctx.store.geo)
            throw new Error(`A map needs a geometry, e.g. "geo": { "data": "regions.json" }`);
        checkFeatures(ctx.store);
        const { projection, path } = projected(ctx);
        ctx.projection = projection;
        ctx.path = path;
    },
    // a text or a circle at `lon` and `lat`, the items of a layer
    annotate(ctx, a) {
        const p = ctx.projection([a.lon, a.lat]);
        if (!p)
            return [];
        if (a.type == 'text')
            return [annotationItem("text", { class: "vis-annotation vis-text", x: p[0], y: p[1] }, a, ctx, { "font-size": 11 })];
        if (a.type == 'circle')
            return [annotationItem("circle", { class: "vis-annotation vis-circle", cx: p[0], cy: p[1] }, a, ctx, { r: 4 })];
        return [];
    },
    hover: {
        area: (ctx, parent) => parent.appendChild(rect(ctx.innerWidth, ctx.innerHeight)),

        // the region under the pointer, the values are not compared
        locate(ctx, pointer, names, event) {
            const key = featureAt(ctx, pointer, event);
            return key === null ? null : { key };
        },

        // no line, the hover is beside the center of the region
        marker(ctx, key, names, line) {
            placeLine(line, null);
            const f = featureByKey(ctx.store.geo, key);
            const [x, y] = f ? ctx.path.centroid(f) : [ctx.innerWidth/2, ctx.innerHeight/2];
            return { x, y, side: x > ctx.innerWidth/2 ? "left" : "right" };
        },

        // the name of the props of the region, of the feature (`name` of the
        // geometry, the property "name" by default) or its key
        title(ctx, key, names) {
            const f = featureByKey(ctx.store.geo, key);
            const property = (ctx.store.def.geo.name ?? 'name').replace(/^properties\./, '');
            const props = ctx.store.mapping(names.h).categoryProps;
            return ctx.store.text(props && Object.hasOwn(props, key) ? props[key].name : undefined) ?? f?.properties?.[property] ?? key;
        },
    },
};
