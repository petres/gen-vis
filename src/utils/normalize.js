export { normalize, scaleTypeOf, defaultScaleType, categoryKeys, hasCategories, isCategorical, facetMappings, rowHeadersOf };

import { isObject } from '@/utils/values';
import { isOperator, refNames } from '@/utils/expr';

/**
 * The normalization of a definition of 4.0 (merged with its parents) into the
 * form the renderer reads, see docs/design-4.0.md and spec/normalize. It
 * keeps the names of 4.0 and writes out what a definition may leave out. It
 * is pure, JSON to JSON, the parts which need the rows, the types of mappings
 * without a type, follow when the rows are loaded, see inferTypes of
 * utils/data.js and prepareMapping of utils/def.js.
 *
 * - a mapping of a text is the one of the column, e.g. "x": "year"
 * - `domain` and `nice` of a mapping are the ones of its scale
 * - the mappings of the positions of the coordinate system (`x` and `y`,
 *   polar also `angle` and `radius`) have a scale of the orientation of the
 *   name and an axis, unless they are false (an orientation null is none), an axis is at the position of
 *   the orientation of its scale
 * - the type of a mapping follows from its parts: categories (see
 *   hasCategories) or a band, point or ordinal scale are categorical, a time
 *   or utc scale a date, other scales numeric, a mapping of the facets or of
 *   the groups of a scale is categorical, the type of a scale follows from
 *   the type of the mapping, see scaleTypeOf
 * - the type of a plot without the prefix of the coordinate system is the one
 *   of the coordinate system (`line` is `cartesian:line` or `polar:line`), of
 *   svg elements (`circle` is `svg:circle` of cartesian plots) or the only
 *   registered one of the name, `point` is `circle`
 * - the props of a plot are merged into the `defaults` of its type, of a
 *   short name and of a full one alike (`line` is `cartesian:line`), null
 *   removes a default
 *
 * `plotTypes` are the plot types by name, see plots/index.js. (The
 * patches of the form elements of 4.x are no part of it: a definition of
 * 4.x is migrated before, its patches are expressions of the globals.)
 */

// the parts of the categories of a mapping, a mapping with any of them has
// categories, see prepareMapping of utils/def.js
const categoryKeys = ['categories', 'scheme', 'common', 'fromData', 'ranks', 'order'];
const hasCategories = m => isObject(m) && categoryKeys.some(k => m[k] !== undefined);
// the parts of the scale which may stand at the mapping
const scaleKeys = ['domain', 'nice'];

// the orientations of the scales of the names of the mappings of the
// positions of the coordinate systems
const positions = {
    cartesian: { x: 'horizontal', y: 'vertical' },
    polar: { x: 'angular', y: 'radial', angle: 'angular', radius: 'radial' },
};
// the position of an axis of the orientation of its scale
const axisPositions = { horizontal: 'bottom', vertical: 'left', angular: 'angular', radial: 'radial' };

const categoricalScales = ['band', 'point', 'ordinal'];
const dateScales = ['time', 'utc'];

// a mapping (or a dim of 5.0) of categories by its parts: categories (see
// hasCategories) or a band, point or ordinal scale
const ofCategories = m => hasCategories(m) || (isObject(m.scale) && categoricalScales.includes(m.scale.type));

/**
 * Whether a mapping (or a dim of 5.0) is categorical before the types of
 * the rows are known: of its type, without one of its parts (see
 * ofCategories), e.g. the center of the band of its position, the color of
 * its categories of a fill (see utils/language.js), of the migration.
 */
const isCategorical = m => isObject(m) && (m.type == 'categorical' || (m.type === undefined && ofCategories(m)));

// the plot types of bars, a categorical scale of their position is a band scale
const barTypes = ['cartesian:bar', 'polar:arc'];

const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));

/**
 * The plot type of a name without the prefix of a coordinate system, e.g.
 * "cartesian:line" of "line", see normalize, undefined if there is none.
 */
const resolveType = (name, coord, plotTypes) => {
    const n = name == 'point' ? 'circle' : name;
    for (const t of [`${coord}:${n}`, `svg:${n}`])
        if (Object.hasOwn(plotTypes, t) && (!plotTypes[t].coords || plotTypes[t].coords.includes(coord)))
            return t;
    const named = Object.keys(plotTypes).filter(t => t.endsWith(`:${n}`) && !t.startsWith('annotation:')
        && (!plotTypes[t].coords || plotTypes[t].coords.includes(coord)));
    return named.length == 1 ? named[0] : undefined;
};

// nested props, objects which are no operators, e.g. `d` of a line
const nested = v => isObject(v) && !isOperator(v);

/**
 * The props of a plot merged into the defaults of its type, nested props
 * deeply (e.g. `d`), null removes a default.
 */
const withDefaults = (defaults, props) => {
    const merged = { ...defaults };
    Object.entries(props ?? {}).forEach(([k, v]) => {
        merged[k] = nested(v) && nested(merged[k]) ? withDefaults(merged[k], v) : v;
    });
    Object.keys(merged).filter(k => merged[k] === null).forEach(k => delete merged[k]);
    return merged;
};

/**
 * The type of the scale of a mapping of a type: `linear` of numeric ones,
 * `time` of dates, of categorical ones `band` of the positions of bars,
 * `point` of other positions and `ordinal` otherwise, e.g. colors, undefined
 * without a type. `plots` are the plots of the normalized definition,
 * `name` the one of the mapping.
 */
const scaleTypeOf = (m, name, plots = []) => {
    if (m.type == 'numeric')
        return 'linear';
    if (m.type == 'date')
        return 'time';
    if (m.type != 'categorical')
        return undefined;
    if (m.scale?.orientation === undefined)
        return 'ordinal';
    const bars = [plots ?? []].flat().filter(p => isObject(p) && barTypes.includes(p.type));
    return bars.some(p => refNames(p.props ?? {}).some(r => r == `${name}:scaled` || r.startsWith(`${name}:scaled:`) || r.startsWith(`${name}:start:scaled`) || r.startsWith(`${name}:end:scaled`)))
        ? 'band' : 'point';
};

// the type of the scale of its own of a mapping, see scaleTypeOf, linear of a
// mapping without a type, e.g. of no column
const defaultScaleType = (m, name, plots = []) => scaleTypeOf(m, name, plots) ?? 'linear';

// the type of a mapping of its parts, see normalize, undefined if they do not tell
const typeOf = (m, name, used) => {
    if (ofCategories(m))
        return 'categorical';
    const type = isObject(m.scale) ? m.scale.type : undefined;
    if (dateScales.includes(type))
        return 'date';
    if (typeof type == 'string')
        return 'numeric';
    return used.has(name) ? 'categorical' : undefined;
};

// the normalized mapping, `orientation` the one of its name in the coordinate system
const normalizeMapping = (raw, orientation) => {
    if (!isObject(raw) && typeof raw != 'string')
        return raw;
    const m = typeof raw == 'string' ? { column: raw } : { ...raw };
    const scaled = scaleKeys.filter(k => k in m);
    if (scaled.length > 0) {
        if (m.scale !== null && m.scale !== false)
            m.scale = { ...(isObject(m.scale) ? m.scale : {}), ...Object.fromEntries(scaled.map(k => [k, m[k]])) };
        scaled.forEach(k => delete m[k]);
    }
    if (orientation) {
        if (m.scale === undefined)
            m.scale = {};
        if (isObject(m.scale) && m.scale.of === undefined) {
            m.scale = { orientation, ...m.scale };
            if (m.axis === undefined && m.scale.orientation !== null)
                m.axis = {};
        }
    }
    // a scale of the name of a position which is none, e.g. of the radius of points
    if (isObject(m.scale) && m.scale.orientation === null) {
        m.scale = { ...m.scale };
        delete m.scale.orientation;
    }
    if (isObject(m.axis) && m.axis.position === undefined && isObject(m.scale) && axisPositions[m.scale.orientation])
        m.axis = { ...m.axis, position: axisPositions[m.scale.orientation] };
    return m;
};

// the normalized plot, its type of the coordinate system `coord`
const normalizePlot = (raw, coord, plotTypes) => {
    if (!isObject(raw))
        return raw;
    const p = { ...raw };
    if (typeof p.type == 'string') {
        const type = p.type.includes(':') ? p.type : resolveType(p.type, coord, plotTypes);
        if (type !== undefined && Object.hasOwn(plotTypes, type)) {
            p.type = type;
            const defaults = plotTypes[type].defaults;
            const own = typeof defaults == 'function' ? defaults(isObject(p.props) ? p.props : {}) : defaults;
            if (isObject(own))
                p.props = withDefaults(clone(own), isObject(p.props) ? p.props : {});
        }
    }
    return p;
};

const normalizePlots = (plot, coord, plotTypes) => Array.isArray(plot) ? plot.map(p => normalizePlot(p, coord, plotTypes))
    : normalizePlot(plot, coord, plotTypes);

// the normalized mappings, `coord` the coordinate system of the
// definition, `used` the names of the mappings of categories
const normalizeMappings = (mapping, coord, plots = [], used = new Set()) => {
    if (!isObject(mapping))
        return mapping;
    const names = positions[coord] ?? {};
    return Object.fromEntries(Object.entries(mapping).map(([n, raw]) => {
        const m = normalizeMapping(raw, Object.hasOwn(names, n) ? names[n] : undefined);
        if (isObject(m)) {
            m.type ??= typeOf(m, n, used);
            if (m.type === undefined)
                delete m.type;
            if (isObject(m.scale) && m.scale.of === undefined && m.scale.type === undefined && m.type !== undefined)
                m.scale = { ...m.scale, type: scaleTypeOf(m, n, plots) };
        }
        return [n, m];
    }));
};

// the names of the mappings of the facets and of the groups of scales, they
// are categorical, the categories of a plot (`by`) are not, they group the
// rows of any type, e.g. of a year
/**
 * The mappings of the facets: of a grid (`rows` and `cols`, the mappings of
 * its rows and its columns) or `dim`, `cols` of `dim` is the number of
 * columns, also a reference to a global ("@cols"), which is no mapping.
 */
const facetMappings = facets => {
    const mapping = v => typeof v == 'string' && !v.startsWith('@') ? v : null;
    const rows = mapping(facets?.rows);
    const cols = mapping(facets?.cols);
    return rows || cols ? { grid: true, rows, cols, all: [rows, cols].filter(Boolean) }
        : { grid: false, rows: null, cols: null, all: typeof facets?.dim == 'string' ? [facets.dim] : [] };
};

/**
 * The side and the direction of the headers of the rows of a grid of
 * facets (`facets.rowHeaders`): "right" (vertical, the default), "left"
 * (horizontal) or { "side", "vertical" } (by default vertical at the right,
 * horizontal at the left), e.g. vertical at the left as a title of an axis.
 */
const rowHeadersOf = facets => {
    const given = facets?.rowHeaders;
    const side = (isObject(given) ? given.side : given) == 'left' ? 'left' : 'right';
    const vertical = isObject(given) && typeof given.vertical == 'boolean' ? given.vertical : side == 'right';
    return { side, vertical };
};

const categoryNames = def => new Set([
    ...(isObject(def.facets) ? facetMappings(def.facets).all : []),
    ...Object.values(isObject(def.mapping) ? def.mapping : {}).filter(m => isObject(m) && isObject(m.scale)).map(m => m.scale.groups?.by),
].filter(n => typeof n == 'string'));

/**
 * The normalized definition of 4.0 (merged with its parents), see above,
 * the definition is not changed.
 */
const normalize = (raw, { plotTypes = {} } = {}) => {
    const def = clone(raw);
    if (!isObject(def))
        return def;
    const coord = def.options?.coord ?? 'cartesian';
    if (def.plot !== undefined)
        def.plot = normalizePlots(def.plot, coord, plotTypes);
    const used = categoryNames(def);
    if (def.mapping !== undefined)
        def.mapping = normalizeMappings(def.mapping, coord, def.plot, used);
    return def;
};
