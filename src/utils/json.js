export { fill, merge, merged, getProps };

const fillRule = (value, base) => {
    const isRef = (typeof value) == "string" && value.charAt() == '@';
    if (isRef) {
        const ref = value.substring(1);
        if (ref in base)
            return base[ref]
    }
    return value;
}

const fill = (fill, base) => {
    // console.log(fill)
    // console.log(Array.isArray(fill))
    if (Array.isArray(fill)) {
        return fill.map(value => fillRule(value, base))
    } else {
        return Object.fromEntries(
            Object.entries(fill).map(
                ([attr, value], i) => [attr, fillRule(value, base)]
            )
        );
    }
}

const merge = (o1, o2) => {
    return Object.assign({}, o1, o2)
}

const merged = (str, k) => {
    return merge(str.common, str.manual[k])
}


// const getAProps = (dataGrouped, props, g) => {
//     return Object.keys(dataGrouped).map(d => ({
//         group: d,
//         props: fill(props, merged(g, d)),
//         values: dataGrouped[d],
//     }))
// }


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
            visible: merged(mappings[d].props, g.group[d])['visible'],
        })),
        // TODO: SPEED UP
        props: Object.keys(g.group).reduce(
            (storage, item) => fill(storage, merged(mappings[item].props, g.group[item]))
        , props),
        values: g.entries,
    }))
}
