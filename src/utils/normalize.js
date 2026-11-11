export { normalize, scaleTypeOf, defaultScaleType, categoryKeys, hasCategories, isCategorical, facetBy, rowHeadersOf };

import { isObject } from '@/utils/values';
import { isOperator, refNames } from '@/utils/expr';

/**
 * The normalization of the form the engine reads (of a definition of 5.0
 * merged with its parents, resolved and translated, see translate of
 * utils/language.js) into the form the renderer reads, see spec/normalize.
 * Both forms have the names of the definition (`dims`, `marks`, ...), the
 * normalization writes out what the form may leave out. It is pure, JSON to JSON, the parts which
 * need the rows, the types of dims without a type, follow when the rows
 * are loaded, see inferTypes of utils/data.js and prepareDim of
 * utils/def.js.
 *
 * - `domain` and `nice` of a dim are the ones of its scale
 * - the dims of the positions of the coordinate system (`x` and `y`,
 *   polar also `angle` and `radius`) have a scale of the orientation of the
 *   name and an axis, unless they are false (an orientation null is none), an axis is at the position of
 *   the orientation of its scale
 * - the type of a dim follows from its parts: categories (see
 *   hasCategories) or a band, point or ordinal scale are categorical, a time
 *   or utc scale a date, other scales numeric, a dim of the facets or of
 *   the groups of a scale is categorical, the type of a scale follows from
 *   the type of the dim, see scaleTypeOf
 * - the type of a mark without the prefix of the coordinate system (translate
 *   writes the full names of the built-in types) is the one of the coordinate
 *   system, of svg elements or the only registered one of the name
 * - the props of a mark are merged into the `defaults` of its type, of a
 *   short name and of a full one alike (`line` is `cartesian:line`), null
 *   removes a default
 *
 * `markTypes` are the mark types by name, see marks/index.js.
 */

// the parts of the categories of a dim, a dim with any of them has
// categories, see prepareDim of utils/def.js
const categoryKeys = ['categories', 'scheme', 'common', 'fromData', 'ranks', 'order'];
const hasCategories = m => isObject(m) && categoryKeys.some(k => m[k] !== undefined);
// the parts of the scale which may stand at the dim
const scaleKeys = ['domain', 'nice'];

// the orientations of the scales of the names of the dims of the
// positions of the coordinate systems
const positions = {
    cartesian: { x: 'horizontal', y: 'vertical' },
    polar: { x: 'angular', y: 'radial', angle: 'angular', radius: 'radial' },
};
// the position of an axis of the orientation of its scale
const axisPositions = { horizontal: 'bottom', vertical: 'left', angular: 'angular', radial: 'radial' };

const categoricalScales = ['band', 'point', 'ordinal'];
const dateScales = ['time', 'utc'];

// a dim (as written or of the engine's form) of categories by its parts: categories (see
// hasCategories) or a band, point or ordinal scale
// (a scale without a type of the parts of a scale of categories, e.g. the
// order of the categories or the space between the bands, is one of them)
const categoryScaleParts = ['order', 'groups', 'padding', 'step'];
const ofCategories = m => hasCategories(m) || (isObject(m.scale) && (categoricalScales.includes(m.scale.type)
    || (m.scale.type === undefined && categoryScaleParts.some(k => m.scale[k] !== undefined))));

/**
 * Whether a dim (as written or of the engine's form) is categorical before the types of
 * the rows are known: of its type, without one of its parts (see
 * ofCategories), e.g. the center of the band of its position, the color of
 * its categories of a fill (see utils/language.js).
 */
const isCategorical = m => isObject(m) && (m.type == 'categorical' || (m.type === undefined && ofCategories(m)));

// the mark types of bars, a categorical scale of their position is a band scale
const barTypes = ['cartesian:bar', 'polar:arc'];

const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));

/**
 * The mark type of a name without the prefix of a coordinate system, e.g.
 * "cartesian:line" of "line", see normalize, undefined if there is none.
 */
const resolveType = (n, coord, markTypes) => {
    for (const t of [`${coord}:${n}`, `svg:${n}`])
        if (Object.hasOwn(markTypes, t) && (!markTypes[t].coords || markTypes[t].coords.includes(coord)))
            return t;
    const named = Object.keys(markTypes).filter(t => t.endsWith(`:${n}`) && !t.startsWith('annotation:')
        && (!markTypes[t].coords || markTypes[t].coords.includes(coord)));
    return named.length == 1 ? named[0] : undefined;
};

// nested props, objects which are no operators, e.g. `d` of a line
const nested = v => isObject(v) && !isOperator(v);

/**
 * The props of a mark merged into the defaults of its type, nested props
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
 * The type of the scale of a dim of a type: `linear` of numeric ones,
 * `time` of dates, of categorical ones `band` of the positions of bars,
 * `point` of other positions and `ordinal` otherwise, e.g. colors, undefined
 * without a type. `marks` are the marks of the normalized definition,
 * `name` the one of the dim.
 */
const scaleTypeOf = (m, name, marks = []) => {
    if (m.type == 'numeric')
        return 'linear';
    if (m.type == 'date')
        return 'time';
    if (m.type != 'categorical')
        return undefined;
    if (m.scale?.orientation === undefined)
        return 'ordinal';
    const bars = [marks ?? []].flat().filter(p => isObject(p) && barTypes.includes(p.type));
    return bars.some(p => refNames(p.props ?? {}).some(r => r == `${name}:scaled` || r.startsWith(`${name}:scaled:`) || r.startsWith(`${name}:start:scaled`) || r.startsWith(`${name}:end:scaled`)))
        ? 'band' : 'point';
};

// the type of the scale of its own of a dim, see scaleTypeOf, linear of a
// dim without a type, e.g. of no column
const defaultScaleType = (m, name, marks = []) => scaleTypeOf(m, name, marks) ?? 'linear';

// the type of a dim of its parts, see normalize, undefined if they do not tell
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

// the normalized dim, `orientation` the one of its name in the coordinate system
const normalizeDim = (raw, orientation) => {
    const m = { ...raw };
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

// the normalized mark, its type of the coordinate system `coord`
const normalizeMark = (raw, coord, markTypes) => {
    const p = { ...raw };
    if (typeof p.type == 'string') {
        const type = p.type.includes(':') ? p.type : resolveType(p.type, coord, markTypes);
        if (type !== undefined && Object.hasOwn(markTypes, type)) {
            p.type = type;
            const defaults = markTypes[type].defaults;
            const own = typeof defaults == 'function' ? defaults(isObject(p.props) ? p.props : {}) : defaults;
            if (isObject(own))
                p.props = withDefaults(clone(own), isObject(p.props) ? p.props : {});
        }
    }
    return p;
};

// the normalized dims, `coord` the coordinate system of the
// definition, `used` the names of the dims of categories
const normalizeDims = (dims, coord, marks = [], used = new Set()) => {
    const names = positions[coord] ?? {};
    return Object.fromEntries(Object.entries(dims).map(([n, raw]) => {
        const m = normalizeDim(raw, Object.hasOwn(names, n) ? names[n] : undefined);
        m.type ??= typeOf(m, n, used);
        if (m.type === undefined)
            delete m.type;
        if (isObject(m.scale) && m.scale.of === undefined && m.scale.type === undefined && m.type !== undefined)
            m.scale = { ...m.scale, type: scaleTypeOf(m, n, marks) };
        return [n, m];
    }));
};

// the names of the dims of the facets and of the groups of scales, they
// are categorical, the categories of a mark (`by`) are not, they group the
// rows of any type, e.g. of a year
/**
 * The dims of the facets (`facets.by`): of a grid (an object of `rows` and
 * `cols`, the dims of its rows and its columns) or the dim `dim` (a text),
 * `all` are the names of both; a reference to a global ("@by") is no dim.
 */
const facetBy = facets => {
    const by = facets?.by;
    const dim = v => typeof v == 'string' && !v.startsWith('@') ? v : null;
    const rows = isObject(by) ? dim(by.rows) : null;
    const cols = isObject(by) ? dim(by.cols) : null;
    return rows || cols ? { grid: true, rows, cols, all: [rows, cols].filter(Boolean) }
        : { grid: false, rows: null, cols: null, dim: isObject(by) ? undefined : by, all: typeof by == 'string' ? [by] : [] };
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
    ...(isObject(def.facets) ? facetBy(def.facets).all : []),
    ...Object.values(isObject(def.dims) ? def.dims : {}).filter(m => isObject(m) && isObject(m.scale)).map(m => m.scale.groups?.by),
].filter(n => typeof n == 'string'));

/**
 * The normalized form of a translated definition, see above, the
 * definition is not changed.
 */
const normalize = (raw, { markTypes = {} } = {}) => {
    const def = clone(raw);
    const coord = def.coord ?? 'cartesian';
    if (def.marks !== undefined)
        def.marks = def.marks.map(p => normalizeMark(p, coord, markTypes));
    const used = categoryNames(def);
    if (def.dims !== undefined)
        def.dims = normalizeDims(def.dims, coord, def.marks, used);
    return def;
};
