export { migrate, migrateExpr, migrateParts };

import { isObject } from '@/utils/values';
import { isOperator } from '@/utils/expr';
import { mergeAll } from '@/utils/def';
import { plotTypes as registered } from '@/plots';
import { categoryKeys, positions, resolveType, scaleTypeOf, withDefaults } from '@/utils/normalize';

/**
 * The migration of a definition of 3.x to 4.0, see docs/design-4.0.md and
 * spec/migrate, normalize (utils/normalize.js) of the migrated definition is
 * the definition of 3.x. A definition of 4.0 stays as it is (migrate is
 * idempotent), except mappings without a type, which are categorical in
 * 3.x, so a definition of both, e.g. of a parent of 3.x, is migrated as
 * well. It is loaded with the check (`@preschen/gen-vis/check`) and by the
 * load of a definition with constructs of 3.x, see isLegacy of
 * utils/normalize.js.
 */

const clone = v => JSON.parse(JSON.stringify(v));
// the same values, objects of the same entries in any order
const same = (a, b) => {
    if (isObject(a) && isObject(b))
        return Object.keys(a).length == Object.keys(b).length && Object.keys(a).every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
    if (Array.isArray(a) && Array.isArray(b))
        return a.length == b.length && a.every((e, i) => same(e, b[i]));
    return a === b;
};

// an object with the entries instead of the key at its place, e.g. `by`
// instead of `categories`, the other entries of these names are left out
const replaced = (o, key, entries) => {
    const names = new Set(entries.map(([k]) => k));
    return Object.fromEntries(Object.entries(o).flatMap(([k, v]) => k == key ? entries : (names.has(k) ? [] : [[k, v]])));
};

// a value which is not evaluated: texts of references, objects and lists as
// `literal`, others as they are
const literal = v => (typeof v == 'string' && v.startsWith('@')) || (v !== null && typeof v == 'object') ? { literal: v } : v;

// the 3.x props of a reference (`ref`) or of another prop (`of`)
const source = raw => 'of' in raw ? migrateExpr(raw.of) : `@${raw.ref}`;

/**
 * The expressions of 4.0 of the props of 3.x, also nested ones:
 * { "prop": "relative", "ref": "x", "ratio": 2, "offset": 1 } is
 * { "+": [{ "*": ["@x", 2] }, 1] }, `steps` are an object of their cuts,
 * ascending, `fixed` is `literal`.
 */
const migrateExpr = raw => {
    if (Array.isArray(raw))
        return raw.map(migrateExpr);
    if (!isObject(raw))
        return raw;
    if (!('prop' in raw) || typeof raw.prop != 'string')
        return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, migrateExpr(v)]));
    switch (raw.prop) {
        case 'ref':
            return source(raw);
        case 'relative': {
            const ratio = raw.ratio ?? 1;
            const offset = raw.offset ?? 0;
            const scaled = ratio === 1 ? source(raw) : { '*': [source(raw), ratio] };
            return offset === 0 ? scaled : { '+': [scaled, offset] };
        }
        case 'steps': {
            const steps = [...(raw.steps ?? [])].sort((a, b) => a.cut - b.cut);
            return { steps: [source(raw), Object.fromEntries(steps.map(s => [String(s.cut), literal(s.value)]))] };
        }
        case 'format':
            return { format: [source(raw), raw.format] };
        case 'match': {
            const cases = Object.fromEntries(Object.entries(raw.cases ?? {}).map(([k, v]) => [k, migrateExpr(v)]));
            return { match: [source(raw), cases, ...(raw.default === undefined ? [] : [migrateExpr(raw.default)])] };
        }
    }
    return literal(raw.value);
};

// the operators of calc of 3.x
const calcOps = { add: '+', subtract: '-', multiply: '*', divide: '/', min: 'min', max: 'max' };

// a calc of `op` and `columns` as one of an expression, the other transforms as they are
const migrateTransform = t => {
    if (!isObject(t) || t.type != 'calc' || t.op === undefined || !Object.hasOwn(calcOps, t.op))
        return t;
    const { op, columns, scale, ...rest } = t;
    const refs = [columns ?? []].flat().map(c => `@${c}`);
    // a single column is a number as well
    const combined = refs.length == 1 && op != 'subtract' ? { '+': refs } : { [calcOps[op]]: refs };
    const expr = scale === undefined || scale === 1 ? combined : { '*': [combined, scale] };
    return { ...rest, ...(rest.as === undefined && rest.column === undefined && refs.length ? { as: [columns].flat()[0] } : {}), expr };
};

// the props which differ from the defaults, of nested props the ones which
// differ, undefined if a default is not one of the props (the type keeps its
// prefix then, a null would remove it)
const ownProps = (defaults, props) => {
    const own = {};
    for (const [k, d] of Object.entries(defaults)) {
        if (!Object.hasOwn(props, k))
            return undefined;
        if (isObject(d) && !isOperator(d) && isObject(props[k]) && !isOperator(props[k]) && !same(d, props[k])) {
            const inner = ownProps(d, props[k]);
            if (inner === undefined)
                return undefined;
            if (Object.keys(inner).length > 0)
                own[k] = inner;
        } else if (!same(d, props[k]))
            own[k] = props[k];
    }
    Object.entries(props).filter(([k]) => !Object.hasOwn(defaults, k)).forEach(([k, v]) => own[k] = v);
    return own;
};

// the plot of 4.0 of one of 3.x in the coordinate system `coord`: `by`
// instead of `categories`, the props of the highlight and of the others as
// objects, the type without its prefix if its props are the defaults of the
// type and the ones which differ, in the same order (the one of the
// attributes of the elements), see withDefaults of utils/normalize.js
const migratePlot = (raw, coord, plotTypes, merged = raw) => {
    if (!isObject(raw))
        return raw;
    let p = { ...raw };
    if (p.categories !== undefined) {
        const by = [p.categories].flat();
        p = replaced(p, 'categories', p.by === undefined ? [['by', by.length == 1 ? by[0] : by]] : []);
    }
    if (isObject(p.props)) {
        // the props of the highlight and of the others after the other ones,
        // in this order (the one of the attributes), the mode of the
        // highlight is part of the object of its props, otherwise the props
        // keep their prefixes
        const part = k => ['highlight', 'others'].find(h => k.startsWith(`${h}-`));
        const keys = Object.keys(p.props);
        // of the merged plot, e.g. of a part of the props of the plot of a parent
        const all = Object.keys(isObject(merged?.props) ? merged.props : p.props);
        const sorted = [...all.filter(k => !part(k)), ...all.filter(k => part(k) == 'highlight'), ...all.filter(k => part(k) == 'others')];
        if (keys.some(part) && sorted.join() == all.join() && !isObject(p.highlight) && !isObject(p.others)) {
            const parts = { highlight: typeof p.highlight == 'string' && keys.some(k => part(k) == 'highlight') ? { mode: p.highlight } : undefined };
            const props = {};
            Object.entries(p.props).forEach(([k, v]) => {
                const h = part(k);
                if (h)
                    (parts[h] ??= {})[k.substring(h.length + 1)] = v;
                else
                    props[k] = v;
            });
            // after the props
            p = replaced(p, 'props', [['props', props], ...['highlight', 'others'].filter(h => parts[h]).map(h => [h, parts[h]])]);
        }
    }
    const [prefix, name] = typeof p.type == 'string' ? p.type.split(':') : [];
    if (name !== undefined && (prefix == coord || prefix == 'svg') && Object.hasOwn(plotTypes, p.type)) {
        const short = prefix == 'svg' && name == 'circle' && coord == 'cartesian' ? 'point' : name;
        const defaults = plotTypes[p.type].defaults;
        const own = typeof defaults == 'function' ? defaults(p.props ?? {}) : defaults;
        const full = p.props ?? {};
        let props = isObject(own) && resolveType(short, coord, plotTypes) == p.type ? ownProps(own, full) : undefined;
        // the defaults of the props without the ones of the defaults, e.g. of
        // a horizontal bar without its `x1`, which keeps them then
        const of = props => typeof defaults == 'function' ? defaults(props) : defaults;
        if (props !== undefined && !same(withDefaults(of(props), props), full))
            props = { ...props, ...Object.fromEntries(Object.keys(own).filter(k => !Object.hasOwn(of(props), k)).map(k => [k, full[k]])) };
        // the attributes of the elements are in the order of the props, also
        // the ones of the defaults, nested props are no attributes, e.g. `d`
        const order = props => Object.keys(props).filter(k => !isObject(props[k]) || isOperator(props[k])).join();
        if (props !== undefined && same(withDefaults(of(props), props), full) && order(withDefaults(of(props), props)) == order(full)) {
            p.type = short;
            p.props = props;
        }
    }
    if (isObject(p.props) && Object.keys(p.props).length == 0)
        delete p.props;
    return p;
};

// `merged` are the plots of the merged definition of a part, see migrateParts
const migratePlots = (plot, coord, plotTypes, merged = null) => {
    const list = merged === null ? null : [merged ?? []].flat();
    const of = (p, i) => list === null ? p : (isObject(p) && p.id !== undefined ? list.find(m => isObject(m) && String(m.id) == String(p.id)) : list[i]);
    return Array.isArray(plot) ? plot.map((p, i) => migratePlot(p, coord, plotTypes, of(p, i))) : migratePlot(plot, coord, plotTypes, of(plot, 0));
};

// a mapping of 4.0 of one of 3.x of the coordinate system `coord`: the
// parts of its categories at the mapping, of the mappings of the definition
// (`own`, not of a patch) the type categorical if it has none and the type
// of the scale linear if it has none, unless normalize finds them, the
// mappings of the names of positions without a scale or an axis with false
// and without an orientation with null, a mapping of the parts of 4.0 (e.g.
// `categories` or `format`) stays as it is
const migrateMapping = (raw, name, coord, own, used, plots) => {
    // a mapping of 4.0, e.g. of a definition of a parent of 3.x
    if (!isObject(raw) || [...categoryKeys, 'domain', 'nice', 'format'].some(k => k in raw))
        return raw;
    let m = { ...raw };
    if (isObject(m.props)) {
        // at the place of the props, in their order
        const { props } = m;
        const rest = Object.fromEntries(Object.entries(props).filter(([k]) => !categoryKeys.includes(k)));
        m = replaced(m, 'props', [...Object.entries(props).filter(([k]) => categoryKeys.includes(k)), ...(Object.keys(rest).length ? [['props', rest]] : [])]);
    }
    if (!own)
        return m;
    // a mapping without a type is categorical, normalize finds it of its categories
    const categorical = m.props !== undefined || categoryKeys.some(k => k in m) || used.has(name)
        || ['band', 'point', 'ordinal'].includes(m.scale?.type);
    if (m.type === undefined && !categorical)
        m.type = 'categorical';
    // a scale of 3.x without a type is linear
    const type = m.type ?? 'categorical';
    if (isObject(m.scale) && m.scale.of === undefined && m.scale.type === undefined) {
        const orientation = m.scale.orientation ?? (Object.hasOwn(positions[coord] ?? {}, name) ? positions[coord][name] : undefined);
        if (scaleTypeOf({ type, scale: { orientation } }, name, plots) != 'linear')
            m.scale = { type: 'linear', ...m.scale };
    }
    if (Object.hasOwn(positions[coord] ?? {}, name)) {
        if (m.scale === undefined)
            m.scale = false;
        else if (isObject(m.scale) && m.scale.of === undefined) {
            if (m.scale.orientation === undefined)
                m.scale = { ...m.scale, orientation: null };
            if (m.axis === undefined)
                m.axis = false;
        }
    }
    return m;
};

const migrateMappings = (mapping, coord, own, used = new Set(), plots = []) => isObject(mapping)
    ? Object.fromEntries(Object.entries(mapping).map(([n, m]) => [n, migrateMapping(m, n, coord, own, used, plots)]))
    : mapping;

// the names of the mappings of the categories of the plots, of the facets and
// of the groups of scales, of 3.x
const usedNames = (def, patches) => new Set([
    ...[def.plot, ...patches.map(p => p.plot)].flatMap(plot => [plot ?? []].flat()).filter(isObject).flatMap(p => [p.categories ?? p.by ?? []].flat()),
    def.facets?.dim,
    ...Object.values(isObject(def.mapping) ? def.mapping : {}).map(m => m?.scale?.groups?.by),
].filter(n => typeof n == 'string'));

/**
 * The definition of 4.0 of a (merged) definition of 3.x, the definition is
 * not changed, `plotTypes` are the plot types by name, by default the
 * registered ones. A `part` of a definition, e.g. a parent, is migrated
 * without the parts its mappings need as a whole (type, scale and axis, see
 * migrateParts), `coord` is the coordinate system of the definition of the
 * part, by default its own, `merged` the merged definition, of the order of
 * the props of its plots.
 */
const migrate = (raw, { plotTypes = registered, part = false, coord = raw?.options?.coord ?? 'cartesian', merged = null } = {}) => {
    if (!isObject(raw))
        return raw;
    const def = migrateExpr(clone(raw));
    const patches = (Array.isArray(def.formElements) ? def.formElements : []).flatMap(e => Array.isArray(e?.values) ? e.values : [])
        .filter(v => isObject(v?.patch)).map(v => v.patch);
    const used = usedNames(def, patches);
    // the plots of the internal form, e.g. of the bars of a band scale
    const plots = [def.plot ?? []].flat();
    if (def.mapping !== undefined)
        def.mapping = migrateMappings(def.mapping, coord, !part, used, plots);
    [def, ...patches].forEach(d => {
        const own = d.options?.coord ?? coord;
        if (d.transform !== undefined)
            d.transform = Array.isArray(d.transform) ? d.transform.map(migrateTransform) : migrateTransform(d.transform);
        if (d.plot !== undefined)
            d.plot = migratePlots(d.plot, own, plotTypes, d === def && merged ? merged.plot : null);
        if (d !== def && d.mapping !== undefined)
            d.mapping = migrateMappings(d.mapping, own, false);
    });
    return def;
};

// the parts of the mappings of the merged definition which migrate adds, see migrateMapping
const wholeParts = [['type'], ['scale'], ['axis'], ['scale', 'type'], ['scale', 'orientation']];

// a part with the whole props of 3.x of the merged definition where it
// changes a part of one, e.g. the `steps` of a steps prop of its parent, also
// in the entries of lists of ids, e.g. the plots
const whole = (part, merged) => {
    if (Array.isArray(part) && Array.isArray(merged) && part.every(e => isObject(e) && 'id' in e))
        return part.map(e => whole(e, merged.find(m => isObject(m) && String(m.id) == String(e.id))));
    if (!isObject(part) || !isObject(merged))
        return part;
    if (typeof merged.prop == 'string' && typeof part.prop != 'string')
        return merged;
    return Object.fromEntries(Object.entries(part).map(([k, v]) => [k, whole(v, merged[k])]));
};

/**
 * The parts of a definition of 3.x, e.g. a definition and its parents in the
 * order of their merge (the parents first, see resolveParents), migrated to
 * 4.0, so their merge is the migrated merge of the parts. The parts of
 * mappings which their merge needs, e.g. "type": "categorical" of a mapping
 * without a type, are in the first part of the mapping (of its scale).
 */
const migrateParts = (parts, { plotTypes = registered } = {}) => {
    const merged = mergeAll(parts);
    const coord = merged.options?.coord ?? 'cartesian';
    const target = migrate(merged, { plotTypes });
    const migrated = parts.map(p => migrate(whole(p, merged), { plotTypes, part: true, coord, merged }));
    const result = mergeAll(migrated);
    Object.entries(isObject(target.mapping) ? target.mapping : {}).filter(([, m]) => isObject(m)).forEach(([n, m]) => {
        const at = (mapping, path) => path.reduce((v, k) => isObject(v) ? v[k] : undefined, mapping);
        wholeParts.forEach(path => {
            const value = at(m, path);
            if (value === undefined || at(result.mapping?.[n], path) !== undefined)
                return;
            const part = migrated.find(p => isObject(at(p.mapping?.[n], path.slice(0, -1))) && (path.length == 1 || isObject(p.mapping[n])));
            if (part)
                at(part.mapping[n], path.slice(0, -1))[path.at(-1)] = value;
        });
    });
    return migrated;
};
