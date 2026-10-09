export { mergeAll, sameValue, prepareDef, applyFormElements, templateRefs, fillTemplate, formatOf };

import merge from 'deepmerge';

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

const prepareMapping = m => {
    if (m.props) {
        const props = m.props
        m.props = Object.fromEntries(Object.keys(props.manual).map(k => {
            const t = Object.assign({}, props.common, props.manual[k])
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

        if (!('name' in m.legend.props)) {
             m.legend.props.name = "@name"
        }
    }

    if (m.hover) {
        if (m.hover.props === undefined)
            m.hover.props = {};

        if (!('name' in m.hover.props)) {
             m.hover.props.name = "@name"
        }
    }

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
// of the axis its own, of the hover its own or the one of the axis, by
// default the date of time scales and the number otherwise, of the legend of
// colors its own or the one of the hover, undefined for the default of the
// axis or the legend, see coords/ticks.js and ColorLegend.vue
const formatOf = (m, part) => {
    const axis = m.axis?.format;
    const hover = m.hover?.format ?? axis;
    if (part == 'axis')
        return axis;
    if (part == 'legend')
        return m.legend?.format ?? hover;
    return hover ?? (['time', 'utc'].includes(m.scale?.type) ? '%x' : 'c');
};

// the names of the globals in a column template, e.g. `values` and `share` of "{values}{share}"
const templateRefs = column => typeof column == 'string' ?
    [...column.matchAll(/\{(\w+)\}/g)].map(m => m[1]) : [];

// unknown globals are kept as they are
const fillTemplate = (column, globals = {}) =>
    column.replace(/\{(\w+)\}/g, (t, n) => n in globals ? String(globals[n]) : t);

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
        if (before && 'props' in before)
            m.props = before.props;
        if (before?.column !== m.column || before?.type !== m.type)
            changed.push(n);
        def.mapping[n] = m;
    });

    return changed;
}
