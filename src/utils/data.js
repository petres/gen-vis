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
    info.extent = d3.extent(info.values);
}

const addScaledData = (data, infos) => {
    // console.log(infos)
    data.forEach(d => {
        Object.values(infos).forEach(i => {
            d[`${i.dim}:scaled`] = i.scale(d[i.dim]);
            // d[`${n}:scaled`] = def.mapping[n]._scale(d[n]);
        });
    })
}

const addStackedData = (data, infos) => {
    console.log([infos.dim, infos.mapping.stacked])
    data.forEach(d => {
        Object.values(infos).forEach(i => {
            // d[`${i.dim}:scaled`] = i.scale(d[i.dim]);
            // d[`${n}:scaled`] = def.mapping[n]._scale(d[n]);
        });
    })
}






// const group = (data, col) => {
//     const dataGrouped = {};
//     data.forEach((d, i) => {
//         const g = d[col];
//         if (!(g in dataGrouped))
//             dataGrouped[g] = [];
//         dataGrouped[g].push(d)
//     });
//     return dataGrouped;
// };

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


const filter = (data, conditions) => {
    // console.log(conditions)
    return data.filter(e => conditions.reduce((s, c) => {
        return (s && e[c.dim] == c.key)
    }, true));
};
