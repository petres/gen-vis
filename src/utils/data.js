export { groupBy, prepareData, filter, addDimInfo, addScaledData, addStackedData };

import * as d3 from "d3";

const prepareData = (data, def) => {
    data = d3.csvParse(data);

    // TODO: CLEANUP
    const mapping = Object.keys(def.mapping).map(n => ({
        name: n,
        column: def.mapping[n].column,
        numeric: def.mapping[n].type == 'numeric',
        date: def.mapping[n].type == 'date',
    }));

    return data.map(d => {
        const e = {};
        mapping.forEach(c => {
            let ev = d[c.column];
            if (c.date)
                ev = Date.parse(ev);
            if (c.numeric)
                ev = 1 * ev;
            e[c.name] = ev;
        });
        return e;
    })
};

const addDimInfo = (info, data) => {
    info.values = data.map(d => d[info.dim]);
    if (info.mapping.type == 'numeric' || info.mapping.type == 'date' ) {
        if (info.mapping.stacked) {
            info.extent = d3.extent(data.map(d => d[`${info.dim}:st:e`]));
        } else {
            info.extent = d3.extent(info.values);
        }
    } else if (info.mapping.type == 'categorical') {

    }
}


const addStackedData = (data, axis, dims = []) => {
    groupBy(data, [...dims, axis.h]).forEach(g => {
        let t = 0;
        g.entries.forEach(e => {
            e[`${axis.v}:st:s`] = t;
            t += e[axis.v];
            e[`${axis.v}:st:e`] = t;
        });
    });
}


const addScaledData = (data, infos) => {
    // console.log(infos)
    data.forEach(d => {
        Object.values(infos).forEach(i => {
            d[`${i.dim}:scaled`] = i.scale(d[i.dim]);
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
        var group = keys.map(k => item[k]).join('-'); //item[key];
        storage[group] = storage[group] || {
            group: Object.fromEntries(keys.map(k => [k, item[k]])),
            entries: []
        };
        storage[group].entries.push(item);
        return storage;
    }, {}));
};


// const filter = (data, conditions) => {
//     // console.log(conditions)
//     return data.filter(e => conditions.reduce((s, c) => {
//         return (s && e[c.dim] == c.key)
//     }, true));
// };

const filter = (data, conditions) => {
    // console.log(conditions)
    return data.filter(e => conditions.reduce((s, c) => {
        if (Array.isArray(c.key))
            return (s && c.key.includes(e[c.dim]))
        else
            return (s && e[c.dim] == c.key)
    }, true));
};
