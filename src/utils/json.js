export { fill, fill2, getProps, prepareDef, calcValue, toValue };

const calcValue = (info, bases) => {
    if (info.mode == 'relative')
        return info.ratio*bases[info.base];

    return info;
}

const fillRule = (value, base, setNull = false) => {
    const isRef = (typeof value) == "string" && value.charAt() == '@';
    if (isRef) {
        const ref = value.substring(1);
        if (ref in base)
            return base[ref];
        else if (setNull)
            return null;
    }
    return value;
}

const fill = (fill, base, setNull = false) => {
    if (fill == null)
        return {};
    // console.log(fill)
    // console.log(Array.isArray(fill))
    if (Array.isArray(fill)) {
        return fill.map(value => fillRule(value, base, setNull))
    } else {
        return Object.fromEntries(
            Object.entries(fill).map(
                ([attr, value], i) => [attr, fillRule(value, base, setNull)]
            )
        );
    }
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


const toValue = (prop, d, final) => {
    if (!prop.ref)
        return prop.value;

    const value = d[prop.value];
    if (value !== undefined)
        return value;

    // if (!final)
    //     return "@" + prop.value;

    if (!final)
        return prop;

    return null;
}

const fill2 = (fill, base, final = false) => {
    // console.log(fill)
    // console.log(base)
    if (fill == null)
        return {};

    return Object.fromEntries(
        Object.entries(fill).map(
            ([attr, value], i) => [attr, (typeof value === 'object' && value !== null && value.ref !== null ) ? toValue(value, base, final): value ]
        )
    );
}

const value2Prop = (name, value) => {
    if (typeof value === 'object' && value !== null) {
        // is object -> recursive
        value = Object.fromEntries(
            Object.entries(value).map(
                ([k, v], i) => [k, value2Prop(k, v)]
            )
        );
    }

    const ref = (typeof value) == "string" && value.charAt() == '@';

    if (ref)
        value = value.substring(1);

    return {name, ref, value}
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
    });

    if (!Array.isArray(def.plot))
        def.plot = [def.plot];

    def.plot.forEach(p => {
        p.categories ??= [];
    });


    def.plot.forEach(p => {
        const propRefs = Object.keys(p.props).map(name => value2Prop(name, p.props[name]));
        console.log(propRefs)
        p._fill = (d, final = false) => {
            // console.log(propRefs)
            const t = Object.fromEntries(
                propRefs.map(prop => [prop.name, toValue(prop, d, final)])
            );
            // console.log(t)
            return t;
        }

        // console.log(p)
    });


    return def;
}
