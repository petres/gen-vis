export { fillDirect, fillProps, getProps, prepareDef, calcValue, toValue, entryToProp, isProp };

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


const calcValue = (info, bases) => {
    if (info.mode == 'relative')
        return info.ratio*bases[info.base];

    return info;
}

const getProps = (dataGrouped, plot, mappings) => {
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
            props: plot._fill(Object.assign({}, ...Object.keys(g.group).map(v => mappings[v].props[g.group[v]]))),
            // props: Object.keys(g.group).reduce(
            //     (storage, item) => fill(storage, mappings[item].props[g.group[item]])
            // , plot.props),
            values: g.entries,
        }
    })
}


const toValue = (prop, d, final = true) => {
    // console.log(prop)
    // if (prop.value == null) {
        if (prop.key !== null) {
            const value = d[prop.key];
            if (value !== undefined)
                prop.value = value;
        }
    // }

    if (final)
        return prop.value

    return prop;
}

// const toValue = (prop, d, final) => {
//     // console.log(prop)
//     if (typeof prop !== 'object')
//         return prop;
//
//     if (prop.key === null)
//         return prop.value;
//
//     const value = d[prop.key];
//     if (value !== undefined)
//         return value;
//
//     if (!final)
//         return prop;
//
//
//     return null;
// }


const fillDirect = (raw, base, final = true) => {
    // console.log({raw, base, final})
    return fillProps(mapObjectOrArray(raw, entryToProp), base, final);
}


const fillProps = (props, base, final = false) =>
    mapObjectOrArray(props, prop => toValue({...prop}, base, final))

const isProp = o => o.prop === true;

const entryToProp = (value) => {
    if (typeof value === 'object' && value !== null) {
        if (isProp(value)) {
            return value;
        }
        return mapObject(value, entryToProp)
    }

    let prop = true;
    let key = null;
    let parts = null;
    if ((typeof value) == "string" && value.charAt() == '@') {
        key = value.substring(1);
        value = null;
        parts = key.split(':');
    }

    return {
        prop, key, value, parts
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
