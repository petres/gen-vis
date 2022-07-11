export { group, capitalize };

const group = (data, col) => {
    const dataGrouped = {};
    data.forEach((d, i) => {
        const g = d[col];
        if (!(g in dataGrouped))
            dataGrouped[g] = [];
        dataGrouped[g].push(d)
    });
    return dataGrouped;
}

const capitalize = w => w.charAt(0).toUpperCase() + w.slice(1)
