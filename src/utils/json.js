export { fillDirect, fillProps, getProps, prepareDef, applyFormElements, mergeAll, sameValue, entryToValue, toValue, entryToProp, isProp };

import merge from 'deepmerge';
const overwriteMerge = (target, source, options) => source;

const mergeAll = parts => merge.all(parts, { arrayMerge: overwriteMerge });

const sameValue = (a, b) => a == b || JSON.stringify(a) == JSON.stringify(b);

const mapObject = (d, t) => Object.fromEntries(
    Object.entries(d).map(
        ([k, v], i) => [k, t(v, k)]
    )
);

const mapObjectOrArray = (d, t) =>
    Array.isArray(d) ? d.map(t) : mapObject(d, t);


const arrayToObject = (a, key, value = v => v) => Object.fromEntries(
    a.map(e => [key(e), value(e)])
);


const getProps = (dataGrouped, plotDef, globs, mappings) => {
     // console.log(plot)
    // dataGrouped.forEach(g => {
    //     Object.keys(g.group).forEach((item, i) => {
    //         console.log([item, g.group[item].props])
    //     });
    // });
    return dataGrouped.map(g => {
        // console.log(Object.assign({}, ...Object.keys(g.group).map(v => mappings[v].props[g.group[v]])));
        // console.log(plot._fill(Object.assign({}, ...Object.keys(g.group).map(v => mappings[v].props[g.group[v]]))));

        return {
            group: Object.keys(g.group).map(d => ({
                dim: d,
                key: g.group[d],
            })),
            // TODO: SPEED UP
            props: plotDef._fill(Object.assign(globs, ...Object.keys(g.group).map(v => mappings[v].props[g.group[v]]))),
            // props: Object.keys(g.group).reduce(
            //     (storage, item) => fill(storage, mappings[item].props[g.group[item]])
            // , plot.props),
            values: g.entries,
        }
    })
}


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

const fillDirect = (raw, base, final = true) => {
    // console.log({raw, base, final})
    return fillProps(mapObjectOrArray(raw, entryToProp), base, final);
}

const fillProps = (props, base, final = false) =>
    mapObjectOrArray(props, prop => toValue({...prop}, base, final))

const isProp = o => o.prop !== undefined;



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
    // console.log(m)
    if (m.props) {
        const props = m.props
        // console.log(m.props)
        const keys = Object.keys(props);
        // if (keys.includes('manual') && keys.includes('common')) {
            m.props = Object.fromEntries(Object.keys(props.manual).map(k => {
                const t = Object.assign({}, props.common, props.manual[k])
                t.name ??= k;
                t.visible ??= true;
                return [k, t];
            }))
        // }

    }

    if (m.scale) {
        m.scale.type ??= "linear";
        m.scale.domain ??= [null, null];

        if (!m.scale.domainAbs)
            m.scale.domainRel ??= m.scale.domain.map((v, i) => v === null ? (i == 0 ? -1 : 1) * 0.02 : 0);

        m.scale.domainAbs ??= [0, 0];


        if (!Array.isArray(m.scale.range)) {
            if (m.scale.orientation == "horizontal") {
                m.scale.range = [0, "@width"];
            } else if (m.scale.orientation == "vertical") {
                m.scale.range = ["@height", 0];
            }
        }
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


/**
 * Entries of form elements can patch mappings, e.g. to switch the column of
 * an axis. Patched mappings are prepared again from the original definition
 * with the patches of the selected entries, the props are kept, so the legend
 * state survives. Returns true if there are patched mappings.
 */
const applyFormElements = (def, defOrg) => {
    const elements = def.formElements ?? [];
    const names = new Set(elements.flatMap(e => e.values.flatMap(v => Object.keys(v.mapping ?? {}))));
    if (names.size == 0)
        return false;

    const selected = elements
        .map(e => e.values.find(v => sameValue(v.value, def.globals?.[e.ref])))
        .filter(v => v && v.mapping);

    names.forEach(n => {
        const patches = selected.filter(v => v.mapping[n]).map(v => v.mapping[n]);
        const m = prepareMapping(mergeAll([defOrg.mapping[n] ?? {}, ...patches]));
        if (def.mapping[n] && 'props' in def.mapping[n])
            m.props = def.mapping[n].props;
        def.mapping[n] = m;
    });

    return true;
}
