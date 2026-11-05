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

// the places of the labels of maps, see positioned of plots/geo.js
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
export const pole = (rings, precision = 1) => {
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

// the items of labels (`x` and `y`) which do not fit into the area around
// their place (`fit`, `placeOf(item)`, see labelPlace) or overlap the label
// of a larger area (`"overlap": false`), of the larger areas first
const fitLabels = (items, plot, x, y, placeOf) => {
    const kept = [];
    const dropped = new Set();
    items.map(v => ({ v, box: textBox(v), place: placeOf(v) }))
        .sort((a, b) => (b.place?.area ?? 0) - (a.place?.area ?? 0))
        .forEach(({ v, box, place }) => {
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
    return dropped;
};

// the projection, the annotations and the hover of maps, see coords/geo.js
export default {
    // the places of the labels of maps, loaded with them, see plots/geo.js
    labelPlace,
    fitLabels,
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
