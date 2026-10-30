export { geoFeatures, geoKey, geoMesh };

// the features of the geometry of maps, loaded with the first map
import { geoArea } from 'd3-geo';
import { feature, mesh } from "topojson-client";

// the rings of d3 are clockwise, the ones of GeoJSON (RFC 7946) counterclockwise,
// a polygon of the wrong order covers the rest of the globe, it is reversed
const rewindPolygon = rings => geoArea({ type: 'Polygon', coordinates: rings }) > 2*Math.PI
    ? rings.map(r => [...r].reverse()) : rings;

const rewind = f => {
    const g = f.geometry;
    if (g?.type == 'Polygon')
        return { ...f, geometry: { ...g, coordinates: rewindPolygon(g.coordinates) } };
    if (g?.type == 'MultiPolygon')
        return { ...f, geometry: { ...g, coordinates: g.coordinates.map(rewindPolygon) } };
    return f;
};

// an object of TopoJSON, by default its first one
const topoObject = (json, object) => {
    const names = Object.keys(json.objects);
    const name = object ?? names[0];
    if (!json.objects[name])
        throw new Error(`Unknown object '${name}' of the TopoJSON, expected one of ${names.map(n => `'${n}'`).join(', ')}`);
    return json.objects[name];
};

/**
 * The features of GeoJSON or of an `object` of TopoJSON, by default its first
 * one, the rings of their polygons are in the order of d3.
 */
const geoFeatures = (json, object) => {
    let features;
    if (json?.type == 'Topology') {
        features = feature(json, topoObject(json, object)).features;
    } else if (json?.type == 'FeatureCollection') {
        features = json.features;
    } else if (json?.type == 'Feature') {
        features = [json];
    } else {
        throw new Error('The geometry is neither GeoJSON nor TopoJSON.');
    }
    return features.map(rewind);
};

// the key of a feature, `id` or a property, as a string, e.g. of "properties.code"
const geoKey = key => f => {
    const v = key == 'id' ? f.id : f.properties?.[key.replace(/^properties\./, '')];
    return v === undefined || v === null ? null : String(v);
};

/**
 * The borders of an `object` of TopoJSON, by default its first one, as one
 * MultiLineString, every border once: all of them, the ones between two
 * features (`inner`) or the ones of only one feature (`outer`, the outline).
 * Only the geometries of `keep(geometry)` are taken, e.g. without the ones of
 * `exclude`.
 */
const geoMesh = (json, object, borders = 'all', keep = () => true) => {
    if (json?.type != 'Topology')
        throw new Error('geo:mesh needs TopoJSON, its borders are the arcs of the topology.');
    const o = topoObject(json, object);
    const geometries = o.type == 'GeometryCollection' ? o.geometries.filter(keep) : [o];
    const filter = borders == 'inner' ? (a, b) => a !== b : borders == 'outer' ? (a, b) => a === b : undefined;
    return mesh(json, { type: 'GeometryCollection', geometries }, filter);
};
