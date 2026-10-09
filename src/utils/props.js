export { outsideRows, getProps, toValue, entryToValue, fillDirect, fillProps, valuesOf, propsOf, isProp, refNames, entryToProp };

const mapObject = (d, t) => Object.fromEntries(
    Object.entries(d).map(([k, v]) => [k, t(v, k)])
);

const mapObjectOrArray = (d, t) =>
    Array.isArray(d) ? d.map(t) : mapObject(d, t);

// the bases without the names of the rows, the mappings and their values,
// e.g. `x:scaled`, so a global `year` does not replace the mapping `year`
const outsideRows = (bases, mappings) => Object.fromEntries(Object.entries(bases)
    .filter(([k]) => !Object.hasOwn(mappings, k.split(':')[0])));

// the props of every group are filled with the bases outside of the rows and
// the props of its categories
const getProps = (dataGrouped, plotDef, bases, mappings) => dataGrouped.map(g => ({
    group: Object.keys(g.group).map(d => ({
        dim: d,
        key: g.group[d],
    })),
    // categories without props only group the rows, e.g. a line per id
    props: plotDef._fill(Object.assign(outsideRows(bases, mappings), ...Object.keys(g.group).map(v => mappings[v].props?.[g.group[v]]))),
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

// the props filled of many rows, e.g. the points of a line, as fillProps with
// the row as base, a value or a ref is prepared once
const filler = (props, wrap) => {
    const fillers = Object.entries(props).map(([k, p]) => {
        if (p === null || typeof p != 'object' || !isProp(p))
            return [k, () => p];
        if (p.value !== undefined && p.value !== null)
            return [k, () => wrap(p, p.value)];
        if (p.prop == 'ref')
            return [k, row => wrap(p, row[p.ref])];
        return [k, row => toValue({ ...p }, row, !wrap.props)];
    });
    return row => {
        const o = {};
        for (const [k, f] of fillers)
            o[k] = f(row);
        return o;
    };
};

// the values of the props of a row, e.g. of `d` of a line
const valuesOf = props => filler(props, (p, v) => v);

// the props of a row with their values, e.g. of the element of a row
const propsOf = props => filler(props, Object.assign((p, v) => v === undefined ? { ...p } : { ...p, value: v }, { props: true }));

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
