export { groupBy, parseData, prepareData, filter, addDimInfo, addScaledData, addStackedData, categoryOrder, toDate };

import * as d3 from "d3";

// strings are parsed as JSON or CSV, already parsed data is passed through
const parseData = data => {
    if (typeof data != "string")
        return data;
    data = data.replace(/^﻿/, '');
    if (/^\s*\[/.test(data))
        return JSON.parse(data);
    return d3.csvParse(data);
};

const missing = v => v === null || v === undefined || (typeof v == 'string' && v.trim() === '');

// missing and invalid values are null
const toNumber = v => {
    const n = missing(v) ? NaN : +v;
    return isNaN(n) ? null : n;
};

// dates are strings or timestamps
const toDate = v => {
    const t = missing(v) ? NaN : (typeof v == 'number' ? v : Date.parse(v));
    return isNaN(t) ? null : t;
};

const converters = { numeric: toNumber, date: toDate };

// maps the parsed rows to the mappings, e.g. column `share` to `y`
const prepareData = (data, def) => {
    const mapping = Object.keys(def.mapping).map(n => ({
        name: n,
        column: def.mapping[n].column,
        convert: converters[def.mapping[n].type] ?? (v => v),
    }));

    return data.map(d => {
        const e = {};
        mapping.forEach(c => {
            e[c.name] = c.convert(d[c.column]);
        });
        return e;
    })
};

const addDimInfo = (info, data) => {
    // get unique values
    info.values = [...new Set(data.map(d => d[info.dim]))];
    if (info.mapping.type == 'numeric' || info.mapping.type == 'date' ) {
        // sorted for the lookup of the nearest value
        info.values = info.values.filter(v => v !== null).sort((a, b) => a - b);
        if (info.mapping.stacked) {
            // the starts of the stacks, e.g. 0, are part of the extent
            info.extent = d3.extent(data.flatMap(d => [d[`${info.dim}:st:s`], d[`${info.dim}:st:e`]]));
        } else {
            info.extent = d3.extent(info.values);
        }
    }
}


// compares rows by the order of the categories in the definition, e.g. the
// order of the `manual` props, `orders` are the dims with their ordered keys
const categoryOrder = orders => {
    const ranks = orders.map(({ dim, keys }) => ({ dim, rank: new Map(keys.map((k, i) => [k, i])) }));
    return (a, b) => {
        for (const { dim, rank } of ranks) {
            const d = (rank.get(a[dim]) ?? Infinity) - (rank.get(b[dim]) ?? Infinity);
            if (d)
                return d;
        }
        return 0;
    };
};

// the values are stacked in the order of `compare`, by default in the order of the rows
const addStackedData = (data, axis, dims = [], compare = null) => {
    groupBy(data, [...dims, axis.h]).forEach(g => {
        let tp = 0;
        let tn = 0;
        const entries = compare ? [...g.entries].sort(compare) : g.entries;
        entries.forEach(e => {
            const v = e[axis.v];
            if (v >= 0) {
                e[`${axis.v}:st:s`] = tp;
                tp += v;
                e[`${axis.v}:st:e`] = tp;
            } else {
                e[`${axis.v}:st:s`] = tn;
                tn += v;
                e[`${axis.v}:st:e`] = tn;
            }
        });
    });
}


const addScaledData = (data, infos) => {
    data.forEach(d => {
        Object.values(infos).forEach(i => {
            d[`${i.dim}:scaled`] = i.scale(d[i.dim]);

            d[`${i.dim}:scaled:min`] = i.scale(i.domain[0]);
            d[`${i.dim}:scaled:0`] = i.scale(0);
            d[`${i.dim}:scaled:max`] = i.scale(i.domain[1]);

            if (i.mapping.stacked) {
                d[`${i.dim}:st:e:scaled`] = i.scale(d[`${i.dim}:st:e`]);
                d[`${i.dim}:st:s:scaled`] = i.scale(d[`${i.dim}:st:s`]);
                d[`${i.dim}:st:h:scaled`] = d[`${i.dim}:st:s:scaled`] - d[`${i.dim}:st:e:scaled`];
            }
        });
    })
}


// the groups are in the order of their first entry, the values of the keys
// are not joined, so e.g. 'a-b', 'c' and 'a', 'b-c' are different groups
const groupBy = (data, keys) => {
    const groups = new Map();
    data.forEach(item => {
        const key = JSON.stringify(keys.map(k => item[k]));
        if (!groups.has(key))
            groups.set(key, { group: Object.fromEntries(keys.map(k => [k, item[k]])), entries: [] });
        groups.get(key).entries.push(item);
    });
    return [...groups.values()];
};


// always a new array, the facets are rendered again if their data changes
const filter = (data, conditions) => {
    if (conditions.length == 0)
        return [...data];
    return data.filter(e => conditions.reduce((s, c) => {
        if (Array.isArray(c.key))
            return (s && c.key.includes(e[c.dim]))
        else if (typeof c.key == 'function')
            return (s && c.key(e[c.dim]))
        else
            return (s && e[c.dim] == c.key)
    }, true));
};
