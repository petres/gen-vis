export { fillDirect, fillProps, getProps, prepareDef, entryToValue, toValue, entryToProp, isProp };

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


const toValue = (prop, base, final = true) => {
    if (prop.value === undefined || prop.value === null) {
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

const entryToProp = (value) => {
    if (typeof value === 'object' && value !== null) {
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



const prepareDef = def => {
    Object.values(def.mapping).forEach(m => {
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
    });

    if (!Array.isArray(def.plot))
        def.plot = [def.plot];

    def.plot.forEach(p => {
        p.categories ??= [];
    });


    def.plot.forEach(p => {
        p.props = mapObject(p.props, entryToProp);
        p._fill = d => fillProps(p.props, d)
    });


    return def;
}
