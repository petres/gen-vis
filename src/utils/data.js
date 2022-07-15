export { groupBy, prepareData, filter };

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
