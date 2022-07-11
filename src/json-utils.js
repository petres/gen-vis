export { fill, merge, merged, getAttrs };

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


const getAttrs = (dataGrouped, attrs, g) => {
    return Object.keys(dataGrouped).map(d => ({
        group: d,
        attrs: fill(attrs, merged(g, d)),
        values: dataGrouped[d],
    }))
}
