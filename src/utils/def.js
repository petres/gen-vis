export { mergeAll, sameValue, prepareDef, applyFormElements, templateRefs, fillTemplate, fillText, fillHtml, formatOf, symbolShortcuts };

import merge from 'deepmerge';
import { schemeColors } from '@/utils/d3';

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

const mergeAll = parts => merge.all(parts, { arrayMerge });

// values of globals and entries are the same as strings, e.g. the year 2024
// of the data and "2024" of a definition, but not 0 and "", missing ones are
// null, lists and objects are compared by their content
const scalar = v => v === null || v === undefined || typeof v != 'object';
const sameValue = (a, b) => {
    if (!scalar(a) || !scalar(b))
        return JSON.stringify(a) == JSON.stringify(b);
    if (a === null || a === undefined || b === null || b === undefined)
        return (a ?? null) === (b ?? null);
    return String(a) === String(b);
};

// keys of categories ascending or descending, numbers by their value
const numeric = v => v.trim() !== '' && !isNaN(+v);
const sortKeys = (keys, descending) => {
    const compare = keys.every(numeric) ? (a, b) => a - b : (a, b) => a.localeCompare(b);
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

const prepareMapping = m => {
    if (m.props) {
        // the props of a category: the color of a scheme in the order of the
        // categories, e.g. Tableau10, the common ones, the ones of its rank,
        // e.g. the newest year, and its own ones, `keys` is the order of the
        // categories, the one of the legend, the facets and the stacks
        const props = m.props;
        const keys = orderKeys(Object.keys(props.categories ?? {}), props.order);
        const colors = props.scheme ? schemeColors(props.scheme, keys.length) : undefined;
        if (props.scheme && !colors)
            throw new Error(`Unknown scheme '${props.scheme}', e.g. 'Tableau10' or 'Blues'`);
        const ranks = props.ranks ?? [];
        m.keys = keys;
        m.props = Object.fromEntries(keys.map((k, i) => {
            const rank = ranks.length > 0 ? ranks[Math.min(i, ranks.length - 1)] : {};
            const t = Object.assign({}, colors ? { color: colors[i % colors.length] } : {}, props.common, rank, props.categories[k]);
            t.name ??= k;
            t.visible ??= true;
            return [k, t];
        }))
    }

    if (m.scale) {
        m.scale.type ??= "linear";
        m.scale.domain ??= [null, null];
    }

    if (m.axis) {
        m.axis.padding ??= 3;
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
    const { type, props = {}, above, facet, ...row } = a;
    return {
        type: `annotation:${type}`,
        id: `annotation-${i}`,
        data: [row],
        props,
        layer: above ? 'above' : 'below',
        ...(facet === undefined ? {} : { facet }),
    };
});

const prepareDef = def => {
    // the space around the plots of a facet, e.g. of the axes
    def.options = { ...def.options, margins: { top: 0, right: 0, bottom: 0, left: 0, ...def.options?.margins } };

    Object.values(def.mapping).forEach(prepareMapping);

    def.plot = [...[def.plot ?? []].flat(), ...annotationPlots(def.annotations)];
    delete def.annotations;

    def.plot.forEach((p, i) => {
        p.props ??= {};
        p.categories ??= [];
        p.id ??= `plot-${i}`;
        p.highlightProps = Object.keys(p.props).filter(n => n.startsWith('highlight-')).map(n => n.substring(10));
    });

    return def;
}

// the d3 format of the values of a mapping in a part of the visualisation:
// of the axis its own, of the hover its own or the one of the axis, of the
// legend of colors its own or the one of the hover, undefined for the
// default of the part, see coords/ticks.js, ColorLegend.vue and
// valueFormat of utils/locale.js
const formatOf = (m, part) => {
    const axis = m.axis?.format;
    const hover = m.hover?.format ?? axis;
    if (part == 'axis')
        return axis;
    if (part == 'legend')
        return m.legend?.format ?? hover;
    return hover;
};

// the names of the globals in a column template, e.g. `values` and `share` of "{values}{share}"
const templateRefs = column => typeof column == 'string' ?
    [...column.matchAll(/\{(\w+)\}/g)].map(m => m[1]) : [];

// unknown globals are kept as they are
const fillTemplate = (column, globals = {}) =>
    column.replace(/\{(\w+)\}/g, (t, n) => n in globals ? String(globals[n]) : t);

// a text of the definition with the values of the globals, e.g. a title or
// a name, other values are kept, e.g. undefined
const fillText = (text, globals) => typeof text == 'string' ? fillTemplate(text, globals) : text;

const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = text => String(text).replace(/[&<>"']/g, c => escapes[c]);

// a template of html, e.g. of the hover, with the values of `names` as text,
// e.g. {land.unit}, unknown names are kept
const fillHtml = (template, names) => template.replace(/\{([\w.-]+)\}/g, (t, name) =>
    Object.hasOwn(names, name) && names[name] !== null && names[name] !== undefined ? escapeHtml(names[name]) : t);

/**
 * Entries of form elements can patch mappings, e.g. to switch the column of
 * an axis. Patched mappings are prepared again from the original definition
 * with the patches of the selected entries, the props are kept, so the legend
 * state survives. Columns can be templates of globals, e.g. "{values}{share}",
 * so they can depend on several form elements. Returns the names of the
 * mappings whose values change, the ones of another column or type.
 */
const applyFormElements = (def, defOrg) => {
    const elements = def.formElements ?? [];
    const names = new Set([
        ...elements.flatMap(e => e.values.flatMap(v => Object.keys(v.mapping ?? {}))),
        ...Object.keys(defOrg.mapping ?? {}).filter(n => templateRefs(defOrg.mapping[n].column).length > 0),
    ]);
    if (names.size == 0)
        return [];

    const selected = elements
        .map(e => e.values.find(v => sameValue(v.value, def.globals?.[e.ref])))
        .filter(v => v && v.mapping);

    const changed = [];
    names.forEach(n => {
        const patches = selected.filter(v => v.mapping[n]).map(v => v.mapping[n]);
        const merged = mergeAll([defOrg.mapping[n] ?? {}, ...patches]);
        if (typeof merged.column == 'string')
            merged.column = fillTemplate(merged.column, def.globals);
        const m = prepareMapping(merged);
        const before = def.mapping[n];
        if (before && 'props' in before) {
            m.props = before.props;
            m.keys = before.keys;
        }
        if (before?.column !== m.column || before?.type !== m.type)
            changed.push(n);
        def.mapping[n] = m;
    });

    return changed;
}
