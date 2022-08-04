export { fill, getProps, prepareDef, calcValue };

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

const getProps = (dataGrouped, props, mappings) => {
    // dataGrouped.forEach(g => {
    //     Object.keys(g.group).forEach((item, i) => {
    //         console.log([item, g.group[item].props])
    //     });
    // });
    return dataGrouped.map(g => ({
        group: Object.keys(g.group).map(d => ({
            dim: d,
            key: g.group[d],
            // visible: mappings[d].props[g.group[d]].visible,
        })),
        // TODO: SPEED UP
        props: Object.keys(g.group).reduce(
            (storage, item) => fill(storage, mappings[item].props[g.group[item]])
        , props),
        values: g.entries,
    }))
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

    return def;
}
