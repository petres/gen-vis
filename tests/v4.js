// The semantics of gen-vis 4 which the migration keeps, ported from 4.x
// (`main`: mergeAll, resolveParents of utils/load.js, patchedParts of
// utils/def.js), the reference of tests/migrate.test.js: a definition of
// 4.x merged with its parents and with the patches of the entries of its
// form elements selected by globals, as 4.x drew it.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deepMerge } from '@/utils/merge.js';
import { sameValue, isObject } from '@/utils/values.js';
import { isOperator } from '@/utils/expr.js';
import { normalize } from '@/utils/normalize.js';
import { plotTypes } from '@/plots';

// lists whose entries all have an `id` merge by it (4.x knew no other keys)
const hasIds = a => a.length > 0 && a.every(e => e !== null && typeof e == 'object' && !Array.isArray(e) && 'id' in e);
const arrayMerge = (target, source, options) => {
    if (!hasIds(target) || !hasIds(source))
        return source.map(e => structuredClone(e));
    const merged = target.map(t => {
        const s = source.find(e => e.id == t.id);
        return s ? deepMerge(t, s, options) : structuredClone(t);
    });
    return [...merged, ...source.filter(s => !target.some(t => t.id == s.id)).map(e => structuredClone(e))];
};
// a text of a mapping which the other part writes as an object is its column
const columnOf = (m, other) => typeof m == 'string' && isObject(other) ? { column: m } : m;
const mergeMappings = (target, source, options) => {
    const t = { ...target };
    const s = { ...source };
    Object.keys(s).filter(k => Object.hasOwn(t, k)).forEach(k => {
        t[k] = columnOf(t[k], s[k]);
        s[k] = columnOf(s[k], t[k]);
    });
    return deepMerge(t, s, options);
};
const customMerge = key => key == 'mapping' ? mergeMappings : undefined;

const mergeAll4 = parts => parts.reduce((a, b) => deepMerge(a, b, { arrayMerge, customMerge }), {});

// a definition of a file merged with its parents (relative urls, mixins in
// their order, a shared parent once, before the first one using it)
const resolveParents4 = (def, url) => {
    const parts = [];
    const included = new Set();
    const add = (d, u) => {
        [d.parent ?? []].flat().map(p => new URL(p, u).href).forEach(p => {
            if (included.has(p))
                return;
            included.add(p);
            add(JSON.parse(readFileSync(fileURLToPath(p), 'utf8')), p);
        });
        parts.push(d);
    };
    add(def, url);
    return mergeAll4(parts);
};

const patchable = ['options', 'mapping', 'plot', 'annotations', 'filter', 'facets', 'geo', 'transform'];
const selectedEntry = (globals, e) => (Array.isArray(e.values) ? e.values : []).find(v => sameValue(v.value, globals[e.ref]));

/**
 * The merged definition of 4.x with the globals `globals` (over its own),
 * the patches of the selected entries merged into its patchable parts in
 * the order of the form elements, an entry's `globals` set (patchedParts
 * of 4.x); without the form elements, whose patches are applied.
 */
const patched4 = (def, globals = {}) => {
    const g = { ...def.globals, ...globals };
    const elements = (def.formElements ?? []).filter(isObject);
    let selected = [];
    for (let i = 0; i <= elements.length; i++) {
        selected = elements.map(e => selectedEntry(g, e)).filter(Boolean);
        const before = JSON.stringify(g);
        selected.filter(v => isObject(v.globals)).forEach(v => Object.assign(g, v.globals));
        if (JSON.stringify(g) == before)
            break;
    }
    const pick = d => Object.fromEntries(patchable.filter(k => d?.[k] !== undefined).map(k => [k, d[k]]));
    const parts = mergeAll4([pick(def), ...selected.filter(v => isObject(v.patch)).map(v => pick(v.patch))]);
    const out = { ...structuredClone(def), globals: g };
    patchable.forEach(k => delete out[k]);
    delete out.formElements;
    // null removes a part, e.g. a filter or a mapping
    Object.entries(parts).filter(([, v]) => v !== null).forEach(([k, v]) => out[k] = v);
    if (isObject(out.mapping))
        Object.keys(out.mapping).filter(n => out.mapping[n] === null).forEach(n => delete out.mapping[n]);
    return out;
};

// the combinations of the values of the form elements (their globals), the
// globals of the definition first; at most `limit`, then one form element
// at a time
const globalSets = (def, limit = 64) => {
    const base = { ...def.globals };
    const elements = (def.formElements ?? []).filter(e => isObject(e) && typeof e.ref == 'string' && Array.isArray(e.values) && e.values.length > 0);
    const valuesOf = e => e.values.filter(isObject).map(v => v.value).filter(v => v !== undefined);
    const count = elements.reduce((n, e) => n * Math.max(1, valuesOf(e).length), 1);
    const sets = count <= limit
        ? elements.reduce((sets, e) => sets.flatMap(s => valuesOf(e).map(v => ({ ...s, [e.ref]: v }))), [base])
        : [base, ...elements.flatMap(e => valuesOf(e).map(v => ({ ...base, [e.ref]: v })))];
    const seen = new Set();
    return [base, ...sets].filter(s => {
        const key = JSON.stringify(s);
        return !seen.has(key) && seen.add(key);
    });
};

// the positions of the default props of the plot types of 4.x (5.0 writes
// them of the channels of the marks, see mark of utils/language.js)
const positions4 = {
    'cartesian:line': props => isObject(props.d) && ('x0' in props.d || 'x1' in props.d) ? { d: { y: '@y:scaled' } } : { d: { x: '@x:scaled', y: '@y:scaled' } },
    'cartesian:area': props => isObject(props.d) && ('x0' in props.d || 'x1' in props.d) ? { d: { y0: '@y:scaled:0', y1: '@y:scaled' } }
        : { d: { x: '@x:scaled', y0: '@y:scaled:0', y1: '@y:scaled' } },
    'cartesian:bar': props => 'x1' in props && 'y1' in props ? {} : ('x1' in props ? { x1: '@x:scaled', y: '@y:scaled' } : { x: '@x:scaled', y1: '@y:scaled' }),
    'cartesian:rule': props => 'y' in props && !('x' in props) ? { y: '@y:scaled' } : { x: '@x:scaled' },
    'svg:circle': () => ({ cx: '@x:scaled', cy: '@y:scaled' }),
    'svg:text': () => ({ x: '@x:scaled', y: '@y:scaled' }),
    'polar:line': () => ({ d: { angle: '@x:scaled', radius: '@y:scaled' } }),
    'polar:area': () => ({ d: { angle: '@x:scaled', innerRadius: '@y:scaled:0', outerRadius: '@y:scaled' } }),
    'polar:circle': () => ({ angle: '@x:scaled', radius: '@y:scaled' }),
    'polar:text': () => ({ angle: '@x:scaled', radius: '@y:scaled' }),
};
// the props merged into the positions, nested ones deeply, null removes
// one (the engine's normalize the other defaults)
const nested = v => isObject(v) && !isOperator(v);
const withPositions = (positions, props) => {
    const merged = { ...positions };
    Object.entries(props).forEach(([k, v]) => merged[k] = nested(v) && nested(merged[k]) ? withPositions(merged[k], v) : v);
    Object.keys(positions).filter(k => merged[k] === null).forEach(k => delete merged[k]);
    return merged;
};

/**
 * The form the engine reads (see utils/normalize.js) of a merged and
 * patched definition of 4.x, as 4.x normalized it: a mapping of a text is
 * its column, `plot` a list, `point` is `circle`, the full names of the
 * plot types and the positions of their default props.
 */
const normalize4 = def => {
    const d = structuredClone(def);
    const coord = d.options?.coord ?? 'cartesian';
    if (isObject(d.mapping))
        Object.entries(d.mapping).forEach(([n, m]) => typeof m == 'string' && (d.mapping[n] = { column: m }));
    if (d.plot !== undefined)
        d.plot = [d.plot].flat().map(p => {
            if (!isObject(p) || typeof p.type != 'string')
                return p;
            const name = p.type == 'point' ? 'circle' : p.type;
            const type = normalize({ options: { coord }, plot: [{ type: name }] }, { plotTypes }).plot[0].type;
            const props = isObject(p.props) ? p.props : {};
            return { ...p, type, props: withPositions(positions4[type]?.(props) ?? {}, props) };
        });
    return normalize(d, { plotTypes });
};

export { mergeAll4, resolveParents4, patched4, globalSets, normalize4 };
