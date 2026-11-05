export { mergeAll, sameValue, prepareDef, applyPatches, patchedParts, patchable, variants, selectedEntry, selectedEntries, templateNames, templateRefs, fillTemplate, fillText, fillHtml, formatOf, symbolShortcuts, symbolOf, symbolShape };

import merge from 'deepmerge';
import { ownColors, schemeColors } from '@/utils/d3';
import { comparison, isObject, sameValue } from '@/utils/values';
import { defaultScaleType, hasCategories } from '@/utils/normalize';
import { refNames } from '@/utils/expr';

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
 * the `size`, or `width` and `height`, of the box of the symbol and the
 * `props` of the element, e.g. a dash, the line is in the middle of the
 * box, the circle in its center. Without them the ones of the `defaults`
 * (see symbolDefaults of utils/defaults.js): of the shortcut, then of all
 * symbols, 16 pixels; the props of the defaults of the shortcut come before
 * the ones of the symbol.
 */
const symbolShortcuts = ['line', 'rect', 'circle'];
const symbolOf = (symbol, names, defaults = {}) => {
    const { type, ...given } = typeof symbol == 'string' ? { type: symbol } : symbol;
    const shortcut = defaults?.[type] ?? {};
    const size = given.size ?? shortcut.size ?? defaults?.size ?? 16;
    const width = given.width ?? (given.size === undefined ? shortcut.width ?? defaults?.width : undefined) ?? size;
    const height = given.height ?? (given.size === undefined ? shortcut.height ?? defaults?.height : undefined) ?? size;
    const props = { ...shortcut.props, ...given.props };
    const own = keys => Object.fromEntries(keys.filter(k => names.has(k)).map(k => [k, `@${k}`]));
    const extra = { line: own(['stroke-width', 'stroke-dasharray', 'opacity']), rect: { rx: 2, ...own(['opacity']) }, circle: own(['opacity']) }[type];
    return { width, height, elements: [{ type, props: { ...symbolShape(type, width, height), ...extra, ...props } }] };
};

/**
 * The element of a symbol of a legend (`line`, `rect` or `circle`) in its
 * box of `width` and `height`, in the color of the category: a line
 * through its middle, a box of its height without the half pixels at its
 * edges, a dot in its center, also of "auto" and of the annotations.
 */
const symbolShape = (kind, width, height) => kind == 'line'
    ? { x1: 0, x2: width, y1: height/2, y2: height/2, stroke: '@color', 'stroke-width': 2 }
    : kind == 'rect' ? { x: 0, y: 0.5, width, height: height - 1, fill: '@color' }
    : { cx: width/2, cy: height/2, r: Math.min(width, height)/2 - 2, fill: '@color' };

// the plot types drawn as a filled box, a line or a dot in a symbol of "auto"
const symbolKinds = [
    ['rect', ['cartesian:area', 'cartesian:bar', 'polar:area', 'polar:arc', 'svg:rect', 'geo:region'], ['fill', 'fill-opacity', 'opacity']],
    ['line', ['cartesian:line', 'cartesian:rule', 'polar:line', 'svg:line'], ['stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'opacity']],
    ['circle', ['svg:circle', 'polar:circle', 'geo:circle'], ['fill', 'fill-opacity', 'stroke', 'opacity']],
];

/**
 * The symbol of a legend of the plots of its categories (`"symbol": "auto"`):
 * a box of the ones which fill an area (e.g. bars, areas), a line of the
 * lines and a circle of the dots, in this order, e.g. a light area under a
 * line, with the props of their style which are the same for all rows of a
 * category: values or references to the props of the categories, e.g.
 * `@color` or `@dash`, not to values of the rows. The box is the one of the
 * shortcut of the line (or of the box or the dot) of the `defaults`, a
 * rect without plots of the categories.
 */
const autoSymbol = (symbol, name, plots, names, defaults, key) => {
    const given = typeof symbol == 'string' ? {} : symbol;
    const own = v => !refNames(v).some(n => typeof n != 'string' || (n != 'color' && !names.has(n)));
    const parts = symbolKinds.flatMap(([kind, types, keys]) => {
        // the first plot of the first type of the kind, e.g. a line before a
        // rule, of the ones which draw the category `key` (all without one)
        const of = [plots ?? []].flat().filter(p => [p?.by ?? []].flat().includes(name) && (key === undefined || draws(p.filter, name, key)));
        const plot = types.map(t => of.find(p => p?.type == t)).find(Boolean);
        if (!plot)
            return [];
        const props = Object.fromEntries(keys.filter(k => plot.props?.[k] !== undefined && own(plot.props[k])).map(k => [k, plot.props[k]]));
        return [{ kind, props }];
    });
    if (parts.length == 0)
        return symbolOf({ ...given, type: 'rect' }, names, defaults);
    // the box of the line, of the area or of the dot
    const base = symbolOf({ ...given, type: parts.find(p => p.kind == 'line')?.kind ?? parts[0].kind, props: {} }, names, defaults);
    const { width, height } = base;
    return { width, height, elements: parts.map(p => ({ type: p.kind, props: { ...symbolShape(p.kind, width, height), ...p.props, ...given.props } })) };
};

// whether a plot draws a category of a mapping by its `filter` on the
// mapping, e.g. { "land": "Wien" } or { "land": { "not": ["Wien"] } }; the
// conditions of globals and ranges are of all categories (undecided here)
const draws = (filter, name, key) => {
    if (!isObject(filter) || !Object.hasOwn(filter, name))
        return true;
    const ref = v => typeof v == 'string' && v.startsWith('@');
    const test = c => Array.isArray(c) ? (c.some(ref) ? undefined : c.map(String).includes(key))
        : isObject(c) ? ('not' in c ? (r => r === undefined ? undefined : !r)(test(c.not)) : undefined)
        : ref(c) ? undefined : c !== null && String(c) === key;
    return test(filter[name]) ?? true;
};

// the colors of the categories without colors, the scheme observable10
// registered by the page (registerScheme, e.g. the colors of a house style)
// or d3's scheme Observable10, distinct colors which are also distinct for
// most color vision deficiencies
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
const prepareMapping = (m, name, dataKeys = () => [], globals = {}, plots = [], symbols = {}) => {
    object(m, `mapping.${name}`, `a mapping, e.g. { "column": "value", "type": "numeric" }`);
    // null or false removes a part, e.g. the hover of a parent
    ['scale', 'axis', 'legend', 'hover'].forEach(k => {
        if (m[k] === null || m[k] === false)
            delete m[k];
        else if (m[k] !== undefined)
            object(m[k], `mapping.${name}.${k}`, 'an object, e.g. {}');
    });
    if (hasCategories(m)) {
        // the props of a category (`categoryProps`, by its key): the color of
        // a scheme in the order of the categories, e.g. Tableau10, the common
        // ones, the ones of its rank, e.g. the newest year, and its own ones,
        // `keys` is the order of the categories, the one of the legend, the
        // facets and the stacks. The categories of the data which are not
        // listed are after the listed ones.
        const categories = { ...m.categories };
        if (m.fromData && typeof m.column == 'string')
            dataKeys(fillTemplate(m.column, globals)).filter(k => !Object.hasOwn(categories, k)).forEach(k => categories[k] = {});
        const keys = orderKeys(Object.keys(categories), m.order);
        // the colors of a scheme, without one and without colors of the
        // categories the default colors, `defaultColor`, the color of a plot
        // or a legend if no category of it has a color, see plotGroups
        const given = [m.common, ...[m.ranks ?? []].flat(), ...Object.values(categories)].some(c => c?.color !== undefined);
        const colors = m.scheme ? schemeColors(m.scheme, keys.length) : undefined;
        if (m.scheme && !colors)
            throw new Error(`Unknown scheme '${m.scheme}', e.g. 'Tableau10' or 'Blues'`);
        const ranks = m.ranks ?? [];
        const palette = colors || given ? null : ownColors('observable10', keys.length) ?? defaultColors;
        m.keys = keys;
        m.categoryProps = Object.fromEntries(keys.map((k, i) => {
            const rank = ranks.length > 0 ? ranks[Math.min(i, ranks.length - 1)] : {};
            const t = Object.assign({}, colors ? { color: colors[i % colors.length] } : {}, m.common, rank, categories[k]);
            t.name ??= k;
            t.visible ??= true;
            if (palette)
                t.defaultColor = palette[i % palette.length];
            return [k, t];
        }))
    }

    // the scale of another mapping (`of`) has no parts of its own, the type
    // of the scale follows from the one of the mapping, see defaultScaleType
    if (m.scale && m.scale.of === undefined) {
        m.scale.type ??= defaultScaleType(m, name, plots);
        m.scale.domain ??= [null, null];
    }

    if (m.legend) {
        if (m.legend.props === undefined)
            m.legend.props = {};

        // the symbols of the legend and of its categories, e.g. a rect of
        // one category and lines of the others
        const names = new Set(Object.values(m.categoryProps ?? {}).flatMap(p => Object.keys(p)));
        const prepared = symbol => symbol === 'auto' || symbol?.type == 'auto' ? autoSymbol(symbol, name, plots, names, symbols)
            : (typeof symbol == 'string' || symbolShortcuts.includes(symbol?.type) ? symbolOf(symbol, names, symbols) : symbol);
        const auto = m.legend.symbol === 'auto' || m.legend.symbol?.type == 'auto' ? m.legend.symbol : null;
        m.legend.symbol = prepared(m.legend.symbol);
        Object.values(m.categoryProps ?? {}).filter(p => p.symbol !== undefined).forEach(p => p.symbol = prepared(p.symbol));
        // "auto" of plots of some categories (a filter of the mapping): the
        // symbol of each category of the plots which draw it, e.g. a line of
        // one and bars of the others
        if (auto && [plots ?? []].flat().some(p => [p?.by ?? []].flat().includes(name) && isObject(p.filter) && Object.hasOwn(p.filter, name)))
            Object.entries(m.categoryProps ?? {}).filter(([, p]) => p.symbol === undefined)
                .forEach(([k, p]) => p.symbol = autoSymbol(auto, name, plots, names, symbols, k));

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
// plots/annotations.js, below the axes and the plots (`layer`, `"above"` or
// `above` above the plots), or right before the plot `before` in its layer,
// see preparePlots
const annotationPlots = (annotations = []) => [annotations].flat().map((a, i) => {
    const { type, props = {}, above, layer, before, legend, facet, ...row } = object(a, `annotations[${i}]`, 'an annotation, e.g. { "type": "line", "y": 0 }');
    return {
        type: `annotation:${type}`,
        id: `annotation-${i}`,
        data: [row],
        props,
        layer: layer ?? (above ? 'above' : 'below'),
        ...(before === undefined ? {} : { before }),
        ...(legend === undefined ? {} : { legend }),
        ...(facet === undefined ? {} : { facet }),
    };
});

// the annotations with `before` right before their plot, in its layer, e.g.
// lines above the bars but below the labels whose halo cuts them
const placed = plots => {
    const moved = plots.filter(p => p?.before !== undefined && plots.some(q => q?.id === p.before && q !== p));
    const rest = plots.filter(p => !moved.includes(p));
    moved.forEach(p => {
        const target = rest.findIndex(q => q?.id === p.before);
        const { layer, ...own } = p;
        rest.splice(target, 0, rest[target].layer === undefined ? own : { ...own, layer: rest[target].layer });
    });
    return rest;
};

// the options of the definition, the height of a facet and the space around
// its plots, e.g. of the axes
const prepareOptions = options => ({ height: 400, ...options, margins: { top: 0, right: 0, bottom: 0, left: 0, ...options?.margins } });

// the props of a highlight or of the others of a plot, without the mode of
// the highlight, e.g. "highlight": { "mode": "row", "r": 5 }
const partProps = part => isObject(part) ? Object.keys(part).filter(n => n != 'mode') : [];

// the plots and the annotations, which are plots of their own, the rows of
// files of plots are the ones loaded, see `files` of applyPatches. The props
// of the highlight and of the others are props of the elements with the
// prefixes `highlight-` and `others-`, attributes which the highlight reads,
// see highlighter of utils/draw.js.
const preparePlots = (plot, annotations, files) => {
    const plots = placed([...[plot ?? []].flat(), ...annotationPlots(annotations ?? [])]);
    return plots.map((raw, i) => {
        const p = { ...object(raw, `plot[${i}]`, 'a plot, e.g. { "type": "svg:circle", "props": {} }') };
        p.props ??= {};
        // a mapping or a list of them
        p.by = [p.by ?? []].flat();
        p.id ??= `plot-${i}`;
        p.highlightProps = partProps(p.highlight);
        p.othersProps = partProps(p.others);
        if (p.highlightProps.length > 0 || p.othersProps.length > 0)
            p.props = {
                ...p.props,
                ...Object.fromEntries(p.highlightProps.map(n => [`highlight-${n}`, p.highlight[n]])),
                ...Object.fromEntries(p.othersProps.map(n => [`others-${n}`, p.others[n]])),
            };
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
 * transform, `files` are the rows of the files of plots, by their url,
 * `symbols` the defaults of the symbols of legends, see symbolDefaults.
 * Returns the names of the mappings whose values change, the ones of another
 * column or type.
 */
const applyPatches = (def, defOrg, { dataKeys = () => [], keepVisible = true, transform = () => {}, files = null, symbols = {} } = {}) => {
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
        const keys = merged.fromData && typeof merged.column == 'string' ? dataKeys(merged.column) : null;
        // a symbol "auto" of the legend or of a category is the one of the
        // plots, e.g. bars of a patch instead of lines
        const auto = [merged.legend?.symbol, ...Object.values(isObject(merged.categories) ? merged.categories : {}).map(c => c?.symbol)]
            .some(s => s === 'auto' || s?.type == 'auto');
        const source = JSON.stringify([merged, keys, auto ? after.plot : null]);
        after.mapping[n] = source;
        const old = def.mapping?.[n];
        // without `keepVisible` the entries of the legend are the ones of the definition
        if (old && keepVisible && before.mapping?.[n] === source) {
            mapping[n] = old;
            return;
        }
        const m = prepareMapping(merged, n, dataKeys, {}, def.plot, symbols);
        if (keepVisible && old?.categoryProps && m.categoryProps)
            m.keys.filter(k => Object.hasOwn(old.categoryProps, k)).forEach(k => m.categoryProps[k].visible = old.categoryProps[k].visible);
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
