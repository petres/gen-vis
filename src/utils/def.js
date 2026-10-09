export { mergeAll, sameValue, prepareDef, applyFormElements, templateRefs, fillTemplate };

import merge from 'deepmerge';
import { entryToProp, fillProps } from '@/utils/props';

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

const sameValue = (a, b) => a == b || JSON.stringify(a) == JSON.stringify(b);

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

    if (m.hover !== undefined && m.axis !== undefined) {
        m.hover.format ??= m.axis.format;
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

const prepareDef = def => {
    Object.values(def.mapping).forEach(prepareMapping);

    def.plot = [def.plot].flat();

    def.plot.forEach((p, i) => {
        p.categories ??= [];
        p.id ??= `plot-${i}`;
        p.highlightProps = Object.keys(p.props).filter(n => n.startsWith('highlight-')).map(n => n.substring(10));
    });

    def.plot.forEach(p => {
        p.props = entryToProp(p.props);
        p._fill = d => fillProps(p.props, d)
    });

    return def;
}

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
 * so they can depend on several form elements. Returns true if there are
 * patched or templated mappings.
 */
const applyFormElements = (def, defOrg) => {
    const elements = def.formElements ?? [];
    const names = new Set([
        ...elements.flatMap(e => e.values.flatMap(v => Object.keys(v.mapping ?? {}))),
        ...Object.keys(defOrg.mapping ?? {}).filter(n => templateRefs(defOrg.mapping[n].column).length > 0),
    ]);
    if (names.size == 0)
        return false;

    const selected = elements
        .map(e => e.values.find(v => sameValue(v.value, def.globals?.[e.ref])))
        .filter(v => v && v.mapping);

    names.forEach(n => {
        const patches = selected.filter(v => v.mapping[n]).map(v => v.mapping[n]);
        const merged = mergeAll([defOrg.mapping[n] ?? {}, ...patches]);
        if (typeof merged.column == 'string')
            merged.column = fillTemplate(merged.column, def.globals);
        const m = prepareMapping(merged);
        if (def.mapping[n] && 'props' in def.mapping[n])
            m.props = def.mapping[n].props;
        def.mapping[n] = m;
    });

    return true;
}
