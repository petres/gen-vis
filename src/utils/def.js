export { mergeAll, sameValue, prepareDef, applyPatches, patchedParts, patchable, variants, selectedEntry, selectedEntries, templateNames, templateRefs, fillTemplate, fillText, fillHtml, formatOf, symbolShortcuts };

import merge from 'deepmerge';
import { schemeColors } from '@/utils/d3';
import { comparison, isObject, sameValue } from '@/utils/values';
import { scaleTypeOf } from '@/utils/normalize';

// arrays whose entries all have an `id`, e.g. the form elements and their
// values, are merged by it, entries with a new id are appended, all other
// arrays are replaced
const hasIds = a => a.length > 0 && a.every(e => e !== null && typeof e == 'object' && !Array.isArray(e) && 'id' in e);
const arrayMerge = (target, source, options) => {
    if (!hasIds(target) || !hasIds(source))
        return source;
    const merged = target.map(t => {
        const s = source.find(e => e.id == t.id);
        return s ? merge(t, s, options) : t;
    });
    return [...merged, ...source.filter(s => !target.some(t => t.id == s.id))];
};

// the mappings of two parts, a text of one which the other one writes as
// an object is the mapping of its column, e.g. "facet": "group" of a parent
// and "facet": { "categories": {} } of its child is the column with the
// categories
const columnOf = (m, other) => typeof m == 'string' && isObject(other) ? { column: m } : m;
const mergeMappings = (target, source, options) => {
    const t = { ...target };
    const s = { ...source };
    Object.keys(s).filter(k => Object.hasOwn(t, k)).forEach(k => {
        t[k] = columnOf(t[k], s[k]);
        s[k] = columnOf(s[k], t[k]);
    });
    return merge(t, s, options);
};
const customMerge = key => key == 'mapping' ? mergeMappings : undefined;

const mergeAll = parts => merge.all(parts, { arrayMerge, customMerge });

// keys of categories ascending or descending, numbers by their value
const sortKeys = (keys, descending) => {
    const compare = comparison(keys);
    return [...keys].sort(descending ? (a, b) => compare(b, a) : compare);
};

/**
 * The keys of the categories in their order: the one of `categories` (keys
 * which are integers, e.g. years, are first and ascending, as JavaScript
 * orders them), `"ascending"` or `"descending"` (numbers by their value) or
 * a list of keys, which are first, the others after them.
 */
const orderKeys = (keys, order) => {
    if (order == 'ascending' || order == 'descending')
        return sortKeys(keys, order == 'descending');
    if (Array.isArray(order)) {
        const listed = order.map(String).filter(k => keys.includes(k));
        return [...new Set(listed), ...keys.filter(k => !listed.includes(k))];
    }
    return keys;
};

/**
 * The svg elements of the symbol of a legend of a shortcut, `"line"`,
 * `"rect"` or `"circle"` in the color of the categories (`@color`), with
 * their `stroke-width`, `stroke-dasharray` and `opacity` if the categories
 * have them, `names` are the props of the categories. The object form has
 * the `size` (16 by default) and `props` of the element, e.g. a width.
 */
const symbolShortcuts = ['line', 'rect', 'circle'];
const symbolOf = (symbol, names) => {
    const { type, size = 16, props = {} } = typeof symbol == 'string' ? { type: symbol } : symbol;
    const own = keys => Object.fromEntries(keys.filter(k => names.has(k)).map(k => [k, `@${k}`]));
    const shapes = {
        line: { x1: 0, x2: size, y1: size/2, y2: size/2, stroke: '@color', 'stroke-width': 2, ...own(['stroke-width', 'stroke-dasharray', 'opacity']) },
        rect: { x: 0, y: 0, width: size, height: size - 1, rx: 2, fill: '@color', ...own(['opacity']) },
        circle: { cx: size/2, cy: size/2, r: size/2 - 2, fill: '@color', ...own(['opacity']) },
    };
    return { size, elements: [{ type, props: { ...shapes[type], ...props } }] };
};

// the colors of the categories without colors, of d3's scheme Observable10,
// distinct colors which are also distinct for most color vision deficiencies
const defaultColors = ['#4269D0', '#EFB118', '#FF725C', '#6CC5B0', '#3CA951', '#FF8AB7', '#A463F2', '#97BBF5', '#9C6B4E', '#9498A0'];

// an entry of a definition which is an object, e.g. a mapping or a plot, an
// error otherwise, e.g. of null, `path` names it
const object = (v, path, expected) => {
    if (!isObject(v))
        throw new Error(`${path}: expected ${expected}`);
    return v;
};

// `dataKeys(column)` are the distinct values of a column of the data as
// strings, see distinctValues of utils/data.js, the categories of `fromData`
const prepareMapping = (m, name, dataKeys = () => [], globals = {}, plots = []) => {
    object(m, `mapping.${name}`, `a mapping, e.g. { "column": "value", "type": "numeric" }`);
    // null or false removes a part, e.g. the hover of a parent
    ['scale', 'axis', 'legend', 'hover', 'props'].forEach(k => {
        if (m[k] === null || m[k] === false)
            delete m[k];
        else if (m[k] !== undefined)
            object(m[k], `mapping.${name}.${k}`, 'an object, e.g. {}');
    });
    if (m.props) {
        // the props of a category: the color of a scheme in the order of the
        // categories, e.g. Tableau10, the common ones, the ones of its rank,
        // e.g. the newest year, and its own ones, `keys` is the order of the
        // categories, the one of the legend, the facets and the stacks. The
        // categories of the data which are not listed are after the listed ones.
        const props = m.props;
        const categories = { ...props.categories };
        if (props.fromData && typeof m.column == 'string')
            dataKeys(fillTemplate(m.column, globals)).filter(k => !Object.hasOwn(categories, k)).forEach(k => categories[k] = {});
        const keys = orderKeys(Object.keys(categories), props.order);
        // the colors of a scheme, without one and without colors of the
        // categories the default colors, `defaultColor`, the color of a plot
        // or a legend if no category of it has a color, see plotGroups
        const given = [props.common, ...[props.ranks ?? []].flat(), ...Object.values(categories)].some(c => c?.color !== undefined);
        const colors = props.scheme ? schemeColors(props.scheme, keys.length) : undefined;
        if (props.scheme && !colors)
            throw new Error(`Unknown scheme '${props.scheme}', e.g. 'Tableau10' or 'Blues'`);
        const ranks = props.ranks ?? [];
        m.keys = keys;
        m.props = Object.fromEntries(keys.map((k, i) => {
            const rank = ranks.length > 0 ? ranks[Math.min(i, ranks.length - 1)] : {};
            const t = Object.assign({}, colors ? { color: colors[i % colors.length] } : {}, props.common, rank, categories[k]);
            t.name ??= k;
            t.visible ??= true;
            if (!colors && !given)
                t.defaultColor = defaultColors[i % defaultColors.length];
            return [k, t];
        }))
    }

    // the scale of another mapping (`of`) has no parts of its own, the type
    // of the scale follows from the one of the mapping, see scaleTypeOf
    if (m.scale && m.scale.of === undefined) {
        m.scale.type ??= scaleTypeOf(m, name, plots) ?? 'linear';
        m.scale.domain ??= [null, null];
    }

    if (m.legend) {
        if (m.legend.props === undefined)
            m.legend.props = {};

        const symbol = m.legend.symbol;
        if (typeof symbol == 'string' || symbolShortcuts.includes(symbol?.type))
            m.legend.symbol = symbolOf(symbol, new Set(Object.values(m.props ?? {}).flatMap(p => Object.keys(p))));

        if (!('name' in m.legend.props)) {
             m.legend.props.name = "@name"
        }
    }

    // the name of the category is the first column of the hover, `null` leaves it out
    if (m.hover)
        m.hover.props = { name: '@name', ...m.hover.props };

    return m;
}

// the annotations are plots of a row of their values, of the types of
// plots/annotations.js, below the axes and the plots, `above` above the plots
const annotationPlots = (annotations = []) => [annotations].flat().map((a, i) => {
    const { type, props = {}, above, facet, ...row } = object(a, `annotations[${i}]`, 'an annotation, e.g. { "type": "line", "y": 0 }');
    return {
        type: `annotation:${type}`,
        id: `annotation-${i}`,
        data: [row],
        props,
        layer: above ? 'above' : 'below',
        ...(facet === undefined ? {} : { facet }),
    };
});

// the options of the definition, the height of a facet and the space around
// its plots, e.g. of the axes
const prepareOptions = options => ({ height: 400, ...options, margins: { top: 0, right: 0, bottom: 0, left: 0, ...options?.margins } });

// the plots and the annotations, which are plots of their own, the rows of
// files of plots are the ones loaded, see `files` of applyPatches
const preparePlots = (plot, annotations, files) => {
    const plots = [...[plot ?? []].flat(), ...annotationPlots(annotations ?? [])];
    return plots.map((raw, i) => {
        const p = { ...object(raw, `plot[${i}]`, 'a plot, e.g. { "type": "svg:circle", "props": {} }') };
        p.props ??= {};
        // a mapping or a list of them
        p.categories = [p.categories ?? []].flat();
        p.id ??= `plot-${i}`;
        p.highlightProps = Object.keys(p.props).filter(n => n.startsWith('highlight-')).map(n => n.substring(10));
        p.othersProps = Object.keys(p.props).filter(n => n.startsWith('others-')).map(n => n.substring(7));
        if (typeof p.data == 'string' && files?.has(p.data)) {
            p.data = files.get(p.data);
            p.loaded = true;
        }
        return p;
    });
};

/**
 * The prepared definition: the globals, the form elements and the parts
 * which they can patch with the selected entries, see applyPatches, the
 * definition is changed, `options` are the ones of applyPatches.
 */
const prepareDef = (def, options = {}) => {
    const org = JSON.parse(JSON.stringify(def));
    // the values of the form elements, also without globals of the definition
    def.globals ??= {};
    // a form element without entries has none
    def.formElements = (def.formElements ?? []).map((e, i) => object(e, `formElements[${i}]`, 'a form element'));
    def.formElements.forEach(e => {
        if (!Array.isArray(e.values))
            e.values = [];
    });
    def.mapping ??= {};
    applyPatches(def, org, options);
    return def;
};

// the parts of a definition which the entries of form elements can patch
const patchable = ['options', 'mapping', 'plot', 'annotations', 'filter', 'facets', 'geo', 'transform'];

// the definition and the patches of the entries of its form elements, e.g.
// to load the parts any of them needs, see requirements of store.js
const variants = def => [def, ...(def.formElements ?? [])
    .flatMap(e => Array.isArray(e?.values) ? e.values.map(v => v?.patch) : [])
    .filter(isObject)];

// the entry of a form element of the value of its global, undefined if
// there is none
const selectedEntry = (def, e) => e.values.find(v => sameValue(v.value, def.globals?.[e.ref]));

// the entries of the form elements of the values of their globals
const selectedEntries = def => (def.formElements ?? []).map(e => selectedEntry(def, e)).filter(Boolean);

// the sources of the prepared parts of a definition, a part whose source is
// the same is kept, e.g. a mapping with its categories of the data
const sources = Symbol('sources');

/**
 * The patchable parts of the original definition `defOrg` with the patches
 * of the entries of the form elements selected by the globals of `def`, in
 * the order of the form elements, see spec/merge.md. The globals of an entry
 * can select the entry of a later form element, e.g. a language selects its
 * names, they are set in `def.globals` until no entry changes them anymore,
 * at most once per form element, e.g. of entries which set each other's
 * globals.
 */
const patchedParts = (def, defOrg) => {
    let selected;
    for (let i = 0; i <= (def.formElements ?? []).length; i++) {
        selected = selectedEntries(def);
        const globals = JSON.stringify(def.globals);
        selected.filter(v => isObject(v.globals)).forEach(v => Object.assign(def.globals, v.globals));
        if (JSON.stringify(def.globals) == globals)
            break;
    }
    const pick = d => Object.fromEntries(patchable.filter(k => d?.[k] !== undefined).map(k => [k, d[k]]));
    return mergeAll([pick(defOrg), ...selected.filter(v => isObject(v.patch)).map(v => pick(v.patch))]);
};

/**
 * The parts of a definition with the patches of the selected entries of the
 * form elements (`patch`, e.g. { "mapping": { "y": { "column": "share" } } }
 * or { "geo": { "fit": "data" } }), merged into the original definition
 * `defOrg` in the order of the form elements, `null` removes a part. An
 * entry can also set globals (`globals`). Column templates are filled with
 * the globals, e.g. "{values}{share}". Only the parts which differ from the
 * ones prepared before are prepared again, e.g. a mapping with the categories
 * of the data of another column (`dataKeys`, see prepareMapping), the
 * entries of the legends of the same categories keep their state shown or
 * hidden (`keepVisible`). `transform()` is called once the transforms are
 * the new ones, before the mappings, their categories can be the ones of a
 * transform, `files` are the rows of the files of plots, by their url.
 * Returns the names of the mappings whose values change, the ones of another
 * column or type.
 */
const applyPatches = (def, defOrg, { dataKeys = () => [], keepVisible = true, transform = () => {}, files = null } = {}) => {
    const patched = patchedParts(def, defOrg);
    const before = def[sources] ?? {};
    const after = { mapping: {} };
    // a part prepared again if its source differs from the one before
    const part = (name, raw, prepare) => {
        const source = JSON.stringify(raw ?? null);
        after[name] = source;
        if (before[name] !== source || !(name in def))
            def[name] = prepare(raw);
    };

    part('options', patched.options, prepareOptions);
    part('facets', patched.facets ?? null, f => f && isObject(f) ? { cols: 1, ...f } : undefined);
    if (!def.facets)
        delete def.facets;
    part('filter', patched.filter ?? null, f => f ?? undefined);
    if (!def.filter)
        delete def.filter;
    part('geo', patched.geo ?? null, g => g ?? undefined);
    if (!def.geo)
        delete def.geo;
    part('plot', [patched.plot ?? null, patched.annotations ?? null], ([p, a]) => preparePlots(p, a, files));
    delete def.annotations;
    part('transform', patched.transform ?? null, t => t ?? undefined);
    if (!def.transform)
        delete def.transform;
    def[sources] = after;
    transform();

    const changed = [];
    const mapping = {};
    const names = templateNames(def);
    Object.entries(patched.mapping ?? {}).forEach(([n, raw]) => {
        if (raw === null || raw === undefined)
            return;
        object(raw, `mapping.${n}`, `a mapping, e.g. { "column": "value", "type": "numeric" }`);
        const merged = JSON.parse(JSON.stringify(raw));
        if (typeof merged.column == 'string')
            merged.column = fillTemplate(merged.column, names);
        // the categories of the data are part of the source, e.g. of a column
        // of a transform of the globals, such as the names of a language
        const keys = merged.props?.fromData && typeof merged.column == 'string' ? dataKeys(merged.column) : null;
        const source = JSON.stringify([merged, keys]);
        after.mapping[n] = source;
        const old = def.mapping?.[n];
        // without `keepVisible` the entries of the legend are the ones of the definition
        if (old && keepVisible && before.mapping?.[n] === source) {
            mapping[n] = old;
            return;
        }
        const m = prepareMapping(merged, n, dataKeys, {}, def.plot);
        if (keepVisible && old?.props && m.props)
            m.keys.filter(k => Object.hasOwn(old.props, k)).forEach(k => m.props[k].visible = old.props[k].visible);
        if (old?.column !== m.column || old?.type !== m.type)
            changed.push(n);
        mapping[n] = m;
    });
    def.mapping = mapping;
    return changed;
};

// the d3 format of the values of a mapping in a part of the visualisation:
// of the axis its own or the one of the mapping (`format`), of the hover its
// own, the one of the mapping or the one of the axis, of the
// legend of colors its own or the one of the hover, undefined for the
// default of the part, see coords/ticks.js, ColorLegend.vue and
// valueFormat of utils/locale.js
const formatOf = (m, part) => {
    const axis = m.axis?.format ?? m.format;
    const hover = m.hover?.format ?? m.format ?? axis;
    if (part == 'axis')
        return axis;
    if (part == 'legend')
        return m.legend?.format ?? hover;
    return hover;
};

// a name of a template, a global or a field of the entry of a form element
// selected by it, e.g. `group` or `group:name`, of letters of any language,
// digits and _, e.g. {größe}
const templateName = /\{([\p{L}\p{N}_]+(?::[\p{L}\p{N}_]+)?)\}/gu;

// the names of the globals in a column template, e.g. `values` and `share` of
// "{values}{share}", `group` of "{group:name}"
const templateRefs = column => typeof column == 'string' ?
    [...column.matchAll(templateName)].map(m => m[1].split(':')[0]) : [];

// unknown names are kept as they are
const fillTemplate = (column, names = {}) =>
    column.replace(templateName, (t, n) => Object.hasOwn(names, n) ? String(names[n]) : t);

// the names of the templates of a prepared definition: the globals and the
// fields of the selected entries of the form elements, e.g. `group:name` of
// the name of the entry of the global `group`
const templateNames = def => {
    const names = { ...def.globals };
    (def.formElements ?? []).forEach(e => {
        Object.entries(selectedEntry(def, e) ?? {}).filter(([, v]) => v === null || typeof v != 'object')
            .forEach(([k, v]) => names[`${e.ref}:${k}`] ??= v);
    });
    return names;
};

// a text of the definition with the values of the globals, e.g. a title or
// a name, other values are kept, e.g. undefined
const fillText = (text, globals) => typeof text == 'string' ? fillTemplate(text, globals) : text;

const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = text => String(text).replace(/[&<>"']/g, c => escapes[c]);

// a template of html, e.g. of the hover, with the values of `names` as text,
// e.g. {land.unit}, unknown names are kept
const fillHtml = (template, names) => template.replace(/\{([\p{L}\p{N}_.:-]+)\}/gu, (t, name) =>
    Object.hasOwn(names, name) && names[name] !== null && names[name] !== undefined ? escapeHtml(names[name]) : t);
