export { normalize, resolveType, withDefaults, scaleTypeOf, positions, categoryKeys };

import { isObject } from '@/utils/values';
import { isOperator, refNames } from '@/utils/expr';

/**
 * The normalization of a definition of 4.0 (merged with its parents) into the
 * internal form of the renderer, see docs/design-4.0.md and
 * spec/normalize. It is pure, JSON to JSON, the parts which need the rows,
 * the types of mappings without a type, follow when the rows are loaded, see
 * inferTypes of utils/data.js and prepareMapping of utils/def.js.
 *
 * - a mapping of a text is the one of the column, e.g. "x": "year"
 * - `categories`, `scheme`, `common`, `fromData`, `ranks` and `order` of a
 *   mapping are the ones of its categories (`props`), `domain` and `nice`
 *   the ones of its scale
 * - the mappings of the positions of the coordinate system (`x` and `y`,
 *   polar also `angle` and `radius`) have a scale of the orientation of the
 *   name and an axis, unless they are false (an orientation null is none), an axis is at the position of
 *   the orientation of its scale
 * - the type of a mapping follows from its parts: categories or a band,
 *   point or ordinal scale are categorical, a time or utc scale a date, other
 *   scales numeric, a mapping of the categories of a plot or of the facets
 *   is categorical, the type of a scale follows from the type of the mapping,
 *   see scaleTypeOf
 * - `by` of a plot are its `categories`, `highlight` and `others` objects of
 *   props are the props `highlight-` and `others-`, `mode` of the highlight
 *   is the highlight of the internal form (`group` or `row`)
 * - the type of a plot without the prefix of the coordinate system is the one
 *   of the coordinate system (`line` is `cartesian:line` or `polar:line`), of
 *   svg elements (`circle` is `svg:circle` of cartesian plots) or the only
 *   registered one of the name, `point` is `circle`, its props are merged
 *   into the `defaults` of the type, null removes a default
 *
 * The parts of the internal form are not the ones of a definition, they are
 * not read: `props` of a mapping, `categories` of a plot, a text of its
 * `highlight` and its props of the prefixes `highlight-` and `others-`.
 *
 * The patches of the entries of form elements are parts, they are only
 * written in the internal form, without the defaults, except the plots of a
 * type, of the coordinate system of the patch, and the positions of the
 * mappings of the definition in another coordinate system of a patch.
 * `plotTypes` are the plot types by name, see plots/index.js.
 */

// the parts of the categories of a mapping, `props` of the internal form
const categoryKeys = ['categories', 'scheme', 'common', 'fromData', 'ranks', 'order'];
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
 * without a type. `plots` are the plots of the definition (of the internal
 * form), `name` the one of the mapping.
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

// the type of a mapping of its parts, see normalize, undefined if they do not tell
const typeOf = (m, name, used) => {
    if (isObject(m.props))
        return 'categorical';
    const type = isObject(m.scale) ? m.scale.type : undefined;
    if (categoricalScales.includes(type))
        return 'categorical';
    if (dateScales.includes(type))
        return 'date';
    if (typeof type == 'string')
        return 'numeric';
    return used.has(name) ? 'categorical' : undefined;
};

// the mapping in the internal form, `own` if it is one of the definition, not
// of a patch, `orientation` the one of its name in the coordinate system
const normalizeMapping = (raw, orientation, own) => {
    if (!isObject(raw) && typeof raw != 'string')
        return raw;
    const m = typeof raw == 'string' ? { column: raw } : { ...raw };
    delete m.props;
    const categories = categoryKeys.filter(k => k in m);
    if (categories.length > 0) {
        m.props = Object.fromEntries(categories.map(k => [k, m[k]]));
        categories.forEach(k => delete m[k]);
    }
    const scaled = scaleKeys.filter(k => k in m);
    if (scaled.length > 0) {
        if (m.scale !== null && m.scale !== false)
            m.scale = { ...(isObject(m.scale) ? m.scale : {}), ...Object.fromEntries(scaled.map(k => [k, m[k]])) };
        scaled.forEach(k => delete m[k]);
    }
    if (own && orientation) {
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

// the plot in the internal form, its type of the coordinate system `coord`
const normalizePlot = (raw, coord, plotTypes) => {
    if (!isObject(raw))
        return raw;
    const p = { ...raw };
    delete p.categories;
    if (typeof p.highlight == 'string')
        delete p.highlight;
    if (isObject(p.props))
        p.props = Object.fromEntries(Object.entries(p.props).filter(([k]) => !/^(highlight|others)-/.test(k)));
    if ('by' in p) {
        p.categories = p.by;
        delete p.by;
    }
    if (typeof p.type == 'string' && !p.type.includes(':')) {
        const type = resolveType(p.type, coord, plotTypes);
        if (type !== undefined) {
            p.type = type;
            const defaults = plotTypes[type].defaults;
            const own = typeof defaults == 'function' ? defaults(isObject(p.props) ? p.props : {}) : defaults;
            if (isObject(own))
                p.props = withDefaults(clone(own), isObject(p.props) ? p.props : {});
        }
    }
    // the props of the highlight and of the others, e.g. "highlight": { "stroke-width": 3 }
    // and `mode` of the highlight, the elements of the group or of the row
    ['highlight', 'others'].filter(k => isObject(p[k])).forEach(k => {
        const { mode, ...props } = p[k];
        p.props = { ...(isObject(p.props) ? p.props : {}), ...Object.fromEntries(Object.entries(k == 'highlight' ? props : p[k]).map(([n, v]) => [`${k}-${n}`, v])) };
        delete p[k];
        if (k == 'highlight' && mode !== undefined)
            p.highlight = mode;
    });
    return p;
};

const normalizePlots = (plot, coord, plotTypes) => Array.isArray(plot) ? plot.map(p => normalizePlot(p, coord, plotTypes))
    : normalizePlot(plot, coord, plotTypes);

// the mappings in the internal form, `own` of the definition, `coord` its
// coordinate system, `used` the names of the mappings of categories
const normalizeMappings = (mapping, coord, own, plots = [], used = new Set()) => {
    if (!isObject(mapping))
        return mapping;
    const names = positions[coord] ?? {};
    return Object.fromEntries(Object.entries(mapping).map(([n, raw]) => {
        const m = normalizeMapping(raw, Object.hasOwn(names, n) ? names[n] : undefined, own);
        if (own && isObject(m)) {
            m.type ??= typeOf(m, n, used);
            if (m.type === undefined)
                delete m.type;
            if (isObject(m.scale) && m.scale.of === undefined && m.scale.type === undefined && m.type !== undefined)
                m.scale = { ...m.scale, type: scaleTypeOf(m, n, plots) };
        }
        return [n, m];
    }));
};

// the names of the mappings of the categories of plots, of the facets and of
// the groups of scales, they are categorical
const categoryNames = (def, plots) => new Set([
    ...[plots ?? []].flat().filter(isObject).flatMap(p => [p.categories ?? []].flat()),
    ...(isObject(def.facets) && typeof def.facets.dim == 'string' ? [def.facets.dim] : []),
    ...Object.values(isObject(def.mapping) ? def.mapping : {}).filter(m => isObject(m) && isObject(m.scale)).map(m => m.scale.groups?.by),
].filter(n => typeof n == 'string'));

/**
 * The internal form of a definition of 4.0 (merged with its parents), see
 * above, the definition is not changed.
 */
const normalize = (raw, { plotTypes = {} } = {}) => {
    const def = clone(raw);
    if (!isObject(def))
        return def;
    const coord = def.options?.coord ?? 'cartesian';
    if (def.plot !== undefined)
        def.plot = normalizePlots(def.plot, coord, plotTypes);
    const ownNames = new Set(Object.keys(isObject(def.mapping) ? def.mapping : {}));
    const patches = (Array.isArray(def.formElements) ? def.formElements : []).flatMap(e => Array.isArray(e?.values) ? e.values : []).filter(v => isObject(v?.patch));
    // the plots of the patches are categories as well, e.g. of another plot
    const used = categoryNames(def, [def.plot, ...patches.map(v => normalizePlots(v.patch.plot, coord, plotTypes))]);
    if (def.mapping !== undefined)
        def.mapping = normalizeMappings(def.mapping, coord, true, def.plot, used);
    patches.forEach(v => {
        const patch = v.patch;
        const own = patch.options?.coord ?? coord;
        if (patch.plot !== undefined)
            patch.plot = normalizePlots(patch.plot, own, plotTypes);
        if (patch.mapping !== undefined)
            patch.mapping = normalizeMappings(patch.mapping, own, false);
        // the positions of the mappings of the definition in another coordinate system
        const names = positions[own] ?? {};
        if (own != coord && isObject(def.mapping) && (patch.mapping === undefined || isObject(patch.mapping))) {
            [...ownNames].filter(n => Object.hasOwn(names, n) && isObject(def.mapping[n]?.scale) && def.mapping[n].scale.of === undefined
                && raw.mapping?.[n]?.scale?.orientation === undefined).forEach(n => {
                const m = patch.mapping?.[n];
                if (m === null)
                    return;
                patch.mapping ??= {};
                const scale = { orientation: names[n], ...(isObject(m?.scale) ? m.scale : {}) };
                patch.mapping[n] = { ...(isObject(m) ? m : {}), scale, ...(isObject(def.mapping[n].axis) ? { axis: { position: axisPositions[scale.orientation], ...m?.axis } } : {}) };
            });
        }
    });
    return def;
};
