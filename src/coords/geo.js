// a map, the features of the geometry of the definition in a projection, the
// rows are joined to them by the mapping `join` of the geometry. The
// projection, the annotations and the hover, with d3-geo, are loaded with the
// first map, see coords/geo-map.js and loadCoord of coords/index.js.

// the mapping of the regions, its values are the keys of the features
const joinOf = store => store.def.geo?.join;

// the names of the projections (`geo.projection.type`), e.g. for validateDef
export const projectionNames = [
    'albers', 'albersUsa', 'azimuthalEqualArea', 'azimuthalEquidistant', 'conicConformal',
    'conicEqualArea', 'conicEquidistant', 'equalEarth', 'equirectangular', 'gnomonic', 'identity',
    'mercator', 'naturalEarth1', 'orthographic', 'stereographic', 'transverseMercator',
];

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
    axes: () => {},
    // a text or a circle at `lon` and `lat`, e.g. of a city
    annotations: ['text', 'circle'],
    load: () => import('@/coords/geo-map.js'),
};
