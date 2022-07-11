export { fill, merge, merged, getAttrs };

const fill = (fill, base) => {
    // console.log(fill)
    return Object.fromEntries(
        Object.entries(fill).map(
            ([k, v], i) => [k, (typeof v) == "string" && v.charAt() == ':' ? base[v.substring(1)] : v]
        )
    );
}

const merge = (o1, o2) => {
    return Object.assign({}, o1, o2)
}

const merged = (str, k) => {
    return merge(str.common, str.manual[k])
}


const getAttrs = (dataGrouped, attrs, g) => {
    return Object.keys(dataGrouped).map(d => ({
        g: d,
        a: fill(attrs, merged(g, d)),
        vs: dataGrouped[d],
    }))
}
