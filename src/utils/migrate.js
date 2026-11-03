export { migrate, migrateExpr, migrateParts, shorten };

import { isObject } from '@/utils/values';
import { isOperator } from '@/utils/expr';
import { formatOf, mergeAll } from '@/utils/def';
import { plotTypes as registered } from '@/plots';
import { categoryKeys, isLegacy, normalize, positions, resolveType, scaleTypeOf, withDefaults } from '@/utils/normalize';

/**
 * The migration of a definition of 3.x to 4.0, see docs/design-4.0.md and
 * spec/migrate, normalize (utils/normalize.js) of the migrated definition is
 * the definition of 3.x, the order of the props of the plots aside (the one
 * of the attributes of their elements). The migrated definition is written in
 * the shorter forms of 4.0 (see shorten), a definition of 4.0 is only written
 * shorter, so migrate is idempotent. It is loaded with the check
 * (`@preschen/gen-vis/check`) and by the load of a definition with
 * constructs of 3.x, see isLegacy of utils/normalize.js.
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
    // a prop without its reference stays as it is, validateDef names it
    if (raw.prop != 'fixed' && typeof raw.ref != 'string' && !('of' in raw))
        return raw;
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

// nested props, objects which are no operators, e.g. `d` of a line
const nested = v => isObject(v) && !isOperator(v);

// the props which differ from the defaults, in their order, of nested props
// the ones which differ, undefined if a default is not one of the props (the
// type keeps its prefix then, a null would remove it)
const ownProps = (defaults, props) => {
    if (Object.keys(defaults).some(k => !Object.hasOwn(props, k)))
        return undefined;
    const own = {};
    for (const [k, v] of Object.entries(props)) {
        const d = defaults[k];
        if (!Object.hasOwn(defaults, k))
            own[k] = v;
        else if (nested(d) && nested(v) && !same(d, v)) {
            const inner = ownProps(d, v);
            if (inner === undefined)
                return undefined;
            if (Object.keys(inner).length > 0)
                own[k] = inner;
        } else if (!same(d, v))
            own[k] = v;
    }
    return own;
};

// the plot of 4.0 of one of 3.x: `by` instead of `categories`, the shorter
// forms follow, see shorten
const migratePlot = raw => {
    if (!isObject(raw) || raw.categories === undefined)
        return raw;
    const by = [raw.categories].flat();
    return replaced(raw, 'categories', raw.by === undefined ? [['by', by.length == 1 ? by[0] : by]] : []);
};

const migratePlots = plot => Array.isArray(plot) ? plot.map(migratePlot) : migratePlot(plot);

// a mapping of 4.0 of one of 3.x of the coordinate system `coord`: the
// parts of its categories at the mapping, of the mappings of the definition
// (`own`, not of a patch) the type categorical if it has none and the type
// of the scale linear if it has none, unless normalize finds them, the
// mappings of the names of positions without a scale or an axis with false
// and without an orientation with null, a mapping of the parts of 4.0 (e.g.
// `categories` or `format`) stays as it is; the shorter forms follow, see
// shorten
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

// the patches of the entries of the form elements of a definition
const patchesOf = def => (Array.isArray(def?.formElements) ? def.formElements : []).flatMap(e => Array.isArray(e?.values) ? e.values : [])
    .filter(v => isObject(v?.patch)).map(v => v.patch);

// the constructs of 3.x of a definition in the ones of 4.0, see migrate
const migrateLegacy = (raw, { part, coord }) => {
    const def = migrateExpr(clone(raw));
    const patches = patchesOf(def);
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
            d.plot = migratePlots(d.plot);
        if (d !== def && d.mapping !== undefined)
            d.mapping = migrateMappings(d.mapping, own, false);
    });
    return def;
};

// the shorter forms of 4.0 of the parts of definitions, see shorten

// the formats of the axis, the hover and the legend of a mapping of the
// internal form, see formatOf
const formatsOf = m => ['axis', 'hover', 'legend'].map(part => formatOf(m, part));

// a mapping of the internal form with the formats of its parts instead of
// the ones written
const withFormats = (m, formats) => {
    const r = { ...m, formats };
    delete r.format;
    ['axis', 'hover', 'legend'].filter(k => isObject(r[k])).forEach(k => {
        r[k] = { ...r[k] };
        delete r[k].format;
    });
    return r;
};

// the internal form of a merged definition (normalize) as it is drawn: the
// formats of the mappings are the ones of their parts, also the ones of the
// mappings of a patch, which are merged into the ones of the definition
const drawn = (def, plotTypes) => {
    const d = normalize(def, { plotTypes });
    if (!isObject(d))
        return d;
    const base = isObject(d.mapping) ? d.mapping : {};
    patchesOf(d).filter(p => isObject(p.mapping)).forEach(p => {
        p.mapping = Object.fromEntries(Object.entries(p.mapping).map(([n, m]) =>
            [n, isObject(m) ? withFormats(m, formatsOf(isObject(base[n]) ? mergeAll([base[n], m]) : m)) : m]));
    });
    if (isObject(d.mapping))
        d.mapping = Object.fromEntries(Object.entries(base).map(([n, m]) => [n, isObject(m) ? withFormats(m, formatsOf(m)) : m]));
    return d;
};

// a copy of an object with a value at the place of the key `at` or before
// the first of the keys `before`, otherwise at the end
const inserted = (o, key, value, before) => {
    const keys = Object.keys(o).filter(k => k != key);
    const at = keys.findIndex(k => before.includes(k));
    const entries = keys.map(k => [k, o[k]]);
    entries.splice(at < 0 ? entries.length : at, 0, [key, value]);
    return Object.fromEntries(entries);
};

// a copy of a mapping without the part of the path, undefined if it has none
const without = (m, [key, inner]) => {
    if (inner === undefined)
        return key in m ? Object.fromEntries(Object.entries(m).filter(([k]) => k != key)) : undefined;
    if (!isObject(m[key]) || !(inner in m[key]))
        return undefined;
    return { ...m, [key]: Object.fromEntries(Object.entries(m[key]).filter(([k]) => k != inner)) };
};

// the parts of a mapping at the mapping, before its parts
const mappingParts = ['scale', 'axis', 'legend', 'hover', 'props', 'stacked'];

// the shorter forms of a mapping, one step each: without the type of the
// scale (inferred of the type), without the type (of the scale or the
// categories), without the orientation of a position and the position of the
// axis, the domain and `nice` at the mapping, without an empty axis and
// scale (of a position), the format at the mapping instead of the ones of the
// axis, the hover and the legend (of a mapping of the definition, `own`, a
// patch keeps the format of the part it changes), a text of the column
const mappingSteps = (m, own = true) => {
    if (!isObject(m))
        return [];
    const steps = [['scale', 'type'], ['type'], ['scale', 'orientation'], ['axis', 'position']].map(path => without(m, path));
    if (isObject(m.scale) && m.scale.of === undefined)
        ['domain', 'nice'].filter(k => k in m.scale && !(k in m)).forEach(k => steps.push(inserted(without(m, ['scale', k]), k, m.scale[k], mappingParts)));
    ['axis', 'scale'].filter(k => isObject(m[k]) && Object.keys(m[k]).length == 0).forEach(k => steps.push(without(m, [k])));
    const parts = ['axis', 'hover', 'legend'].filter(k => isObject(m[k]) && m[k].format !== undefined);
    const format = m.format ?? m.axis?.format ?? m.hover?.format;
    if (own && format !== undefined && parts.length > 0 && parts.every(k => m[k].format === format)) {
        // the format at the mapping, the parts without the same format
        const moved = parts.reduce((r, k) => without(r, [k, 'format']), m);
        steps.push(m.format === undefined ? inserted(moved, 'format', format, mappingParts) : moved);
    }
    if (Object.keys(m).length == 1 && typeof m.column == 'string')
        steps.push(m.column);
    return steps.filter(s => s !== undefined && !same(s, m));
};

// the props of the highlight and of the others as objects of a plot, after
// its props, the mode of the highlight in the object of its props, also the
// one of the merged plot (`merged`), e.g. of a parent
const highlightObjects = (p, merged) => {
    const part = k => ['highlight', 'others'].find(h => k.startsWith(`${h}-`));
    if (!isObject(p.props) || !Object.keys(p.props).some(part) || isObject(p.highlight) || isObject(p.others))
        return undefined;
    const props = {};
    const mode = p.highlight ?? merged?.highlight;
    const parts = {};
    Object.entries(p.props).forEach(([k, v]) => {
        const h = part(k);
        if (h)
            (parts[h] ??= h == 'highlight' && typeof mode == 'string' ? { mode } : {})[k.substring(h.length + 1)] = v;
        else
            props[k] = v;
    });
    const r = replaced(p, 'props', [...(Object.keys(props).length ? [['props', props]] : []),
        ...['highlight', 'others'].filter(h => parts[h]).map(h => [h, parts[h]])]);
    return r;
};

// the plot of the type without the prefix of the coordinate system `coord`
// (`point` of a circle) and of the props which differ from its defaults
const shortType = (p, coord, plotTypes) => {
    const [prefix, name] = typeof p.type == 'string' ? p.type.split(':') : [];
    if (name === undefined || !Object.hasOwn(plotTypes, p.type) || !prefix)
        return undefined;
    const short = name == 'circle' ? 'point' : name;
    const defaults = plotTypes[p.type].defaults;
    if (resolveType(short, coord, plotTypes) != p.type || defaults === undefined)
        return undefined;
    const full = isObject(p.props) ? p.props : {};
    const of = props => typeof defaults == 'function' ? defaults(props) : defaults;
    let props = isObject(of(full)) ? ownProps(of(full), full) : undefined;
    if (props === undefined)
        return undefined;
    // the defaults of the props without the ones of the defaults, e.g. of a
    // horizontal bar without its `x1`, which keeps them then
    if (!same(withDefaults(of(props), props), full))
        props = Object.fromEntries(Object.entries(full).filter(([k]) => Object.hasOwn(props, k) || !Object.hasOwn(of(props), k)));
    const r = { ...p, type: short, props };
    if (Object.keys(props).length == 0)
        delete r.props;
    return r;
};

// the shorter forms of a plot, one step each: the props of the highlight and
// of the others as objects, the type without its prefix
const plotSteps = (p, coord, plotTypes, merged) => isObject(p)
    ? [highlightObjects(p, merged), shortType(p, coord, plotTypes)].filter(s => s !== undefined)
    : [];

// the places of the mappings and the plots of a part of a definition, also
// the ones of its patches: [object, key, steps of the value]; `merged` is the
// merged definition of the part, e.g. of the plots of the parents
const placesOf = (part, merged, plotTypes) => {
    const coord = merged.options?.coord ?? 'cartesian';
    const mergedPlots = [merged.plot ?? []].flat();
    const places = [];
    [part, ...patchesOf(part)].forEach(d => {
        const own = d.options?.coord ?? coord;
        if (isObject(d.mapping))
            Object.keys(d.mapping).forEach(n => places.push([d.mapping, n, m => mappingSteps(m, d === part)]));
        const plotOf = (p, i) => d !== part ? undefined
            : (isObject(p) && p.id !== undefined ? mergedPlots.find(m => isObject(m) && String(m.id) == String(p.id)) : mergedPlots[i]);
        if (Array.isArray(d.plot))
            d.plot.forEach((p, i) => places.push([d.plot, i, v => plotSteps(v, own, plotTypes, plotOf(p, i))]));
        else if (isObject(d.plot))
            places.push([d, 'plot', v => plotSteps(v, own, plotTypes, plotOf(d.plot, 0))]);
    });
    return places;
};

/**
 * The parts of definitions in their shorter forms of 4.0, changed in place:
 * `chains` are lists of parts in the order of their merge (the parents
 * first), a part may be one of several chains, e.g. a parent of two
 * definitions. A shorter form of a mapping or of a plot (see mappingSteps
 * and plotSteps) is taken when every merged chain of the part draws the
 * same: its internal form (normalize) is the same, the props of the plots and
 * the parts of the mappings in any order (the order of attributes is no
 * change of the drawing), the formats as the ones of the axes, hovers and
 * legends.
 */
const shorten = (chains, plotTypes = registered) => {
    const before = new Map(chains.map(c => [c, drawn(mergeAll(c), plotTypes)]));
    const keeps = part => chains.filter(c => c.includes(part)).every(c => same(drawn(mergeAll(c), plotTypes), before.get(c)));
    let changed = true;
    while (changed) {
        changed = false;
        for (const part of new Set(chains.flat())) {
            const merged = mergeAll(chains.find(c => c.includes(part)));
            for (const [o, key, steps] of placesOf(part, merged, plotTypes)) {
                let step;
                do {
                    const value = o[key];
                    step = steps(value).find(s => {
                        o[key] = s;
                        if (keeps(part))
                            return true;
                        o[key] = value;
                        return false;
                    });
                    changed ||= step !== undefined;
                } while (step !== undefined);
            }
        }
    }
    return chains;
};

/**
 * The definition of 4.0 of a (merged) definition of 3.x in its shorter forms,
 * the definition is not changed: the constructs of 3.x are migrated if it is
 * one of 3.x (`legacy`, by default if it has constructs of 3.x, see isLegacy
 * of utils/normalize.js, as the load reads it), a definition of 4.0 is only
 * written shorter (see shorten), so migrate is idempotent. `plotTypes` are
 * the plot types by name, by default the registered ones. A `part` of a
 * definition, e.g. a parent, is migrated without the parts its mappings
 * need as a whole (type, scale and axis, see migrateParts) and not shorter,
 * `coord` is the coordinate system of the definition of the part, by
 * default its own. Without `short` the definition is not written shorter,
 * e.g. of the load, which only needs its meaning, not its shorter forms.
 */
const migrate = (raw, { plotTypes = registered, part = false, coord = raw?.options?.coord ?? 'cartesian', legacy = isLegacy(raw), short = true } = {}) => {
    if (!isObject(raw))
        return raw;
    const def = legacy ? migrateLegacy(raw, { part, coord }) : clone(raw);
    if (!part && short)
        shorten([[def]], plotTypes);
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
 * 4.0 in their shorter forms, so their merge is the migrated merge of the
 * parts, `legacy` as the one of migrate of their merge. The parts of mappings which their merge needs, e.g. "type":
 * "categorical" of a mapping without a type, are in the first part of the
 * mapping (of its scale).
 */
const migrateParts = (parts, { plotTypes = registered, legacy = isLegacy(mergeAll(parts)) } = {}) => {
    const merged = mergeAll(parts);
    if (!legacy)
        return shorten([parts.map(clone)], plotTypes)[0];
    const coord = merged.options?.coord ?? 'cartesian';
    const target = migrateLegacy(merged, { part: false, coord });
    const migrated = parts.map(p => migrateLegacy(whole(p, merged), { part: true, coord }));
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
    return shorten([migrated], plotTypes)[0];
};
