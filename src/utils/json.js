export { fillDirect, fillProps, getProps, prepareDef, applyFormElements, templateRefs, fillTemplate, mergeAll, sameValue, entryToValue, toValue, entryToProp, isProp, refNames };

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

const sameValue = (a, b) => a == b || JSON.stringify(a) == JSON.stringify(b);

const mapObject = (d, t) => Object.fromEntries(
    Object.entries(d).map(([k, v]) => [k, t(v, k)])
);

const mapObjectOrArray = (d, t) =>
    Array.isArray(d) ? d.map(t) : mapObject(d, t);


// the props of every group are filled with globs and the props of its categories
const getProps = (dataGrouped, plotDef, globs, mappings) => dataGrouped.map(g => ({
    group: Object.keys(g.group).map(d => ({
        dim: d,
        key: g.group[d],
    })),
    // categories without props only group the rows, e.g. a line per id
    props: plotDef._fill(Object.assign({}, globs, ...Object.keys(g.group).map(v => mappings[v].props?.[g.group[v]]))),
    values: g.entries,
}));


const toValue = (prop, base, final = true, reevaluate = false) => {
    if (prop.value === undefined || prop.value === null || reevaluate) {
        if (prop.prop == "ref") {
            const value = base[prop.ref];
            if (value !== undefined)
                prop.value = value;
        }

        if (prop.prop == "relative") {
            const value = base[prop.ref];
            if (value !== undefined)
                prop.value = prop.ratio*value;
        }

        if (prop.prop == "steps") {
            const value = base[prop.ref];
            if (value !== undefined) {
                prop.steps.forEach(s => {
                    if (value > s.cut)
                        prop.value = s.value;
                });
            }
        }
    }

    if (final)
        return prop.value

    return prop;
}

const entryToValue = (e, base) =>
    toValue({...entryToProp(e)}, base, true);

const fillDirect = (raw, base, final = true) =>
    fillProps(mapObjectOrArray(raw, entryToProp), base, final);

const fillProps = (props, base, final = false) =>
    mapObjectOrArray(props, prop => toValue({...prop}, base, final))

const isProp = o => o.prop !== undefined;

// the names referenced by the (nested) props, e.g. `y` for "@y:scaled"
const refNames = props => Object.values(props).flatMap(p => {
    if (p === null || typeof p != 'object')
        return [];
    if (!isProp(p))
        return refNames(p);
    return typeof p.ref == 'string' ? [p.ref.split(':')[0]] : [];
});



/**
 * Converts strings to props
 */
const entryToProp = (value) => {
    if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
        if (isProp(value))
            return value;
        return mapObject(value, entryToProp)
    }

    if ((typeof value) == "string" && value.charAt() == '@') {
        const ref = value.substring(1);
        return {
            prop: "ref",
            ref: ref,
            parts: ref.split(':'),
        }
    }

    return {
        prop: "fixed",
        value: value,
    }
}



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

        if (!m.scale.domainAbs)
            m.scale.domainRel ??= m.scale.domain.map((v, i) => v === null ? (i == 0 ? -1 : 1) * 0.02 : 0);

        m.scale.domainAbs ??= [0, 0];
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

    if (!Array.isArray(def.plot))
        def.plot = [def.plot];

    // the facets are the categories of one mapping, older definitions list it
    if (def.facets && Array.isArray(def.facets.dim))
        def.facets.dim = def.facets.dim[0];

    def.plot.forEach((p, i) => {
        p.categories ??= [];
        p.id ??= `plot-${i}`;
        p.highlightProps = Object.keys(p.props).filter(n => n.startsWith('highlight-')).map(n => n.substring(10));
    });

    def.plot.forEach(p => {
        p.props = mapObject(p.props, entryToProp);
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
