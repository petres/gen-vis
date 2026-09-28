export { groupBy, parseData, prepareData, filter, addDimInfo, addScaledData, addStackedData };

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

const missing = v => v === null || v === undefined || v === '';

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
            info.extent = d3.extent(data.map(d => d[`${info.dim}:st:e`]));
        } else {
            info.extent = d3.extent(info.values);
        }
    }
}


const addStackedData = (data, axis, dims = []) => {
    groupBy(data, [...dims, axis.h]).forEach(g => {
        let tp = 0;
        let tn = 0;
        g.entries.forEach(e => {
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


const groupBy = (data, keys) => {
    return Object.values(data.reduce((storage, item) => {
        var group = keys.map(k => item[k]).join('-');
        storage[group] = storage[group] || {
            group: Object.fromEntries(keys.map(k => [k, item[k]])),
            entries: []
        };
        storage[group].entries.push(item);
        return storage;
    }, {}));
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
