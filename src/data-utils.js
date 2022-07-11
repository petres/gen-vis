export { group };

const group = (data, v, col) => {
    const dataGrouped = {};
    data.forEach((d, i) => {
        const g = d[col];
        if (!(g in dataGrouped))
            dataGrouped[g] = [];
        dataGrouped[g].push(v[i])
    });
    return dataGrouped;
}
