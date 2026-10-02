// the definitions of the json files in data/, e.g. of import.meta.glob, they
// have a mapping or a parent, mixins (_*.json) and shared parents only if
// `mixins` is set, not the data or geometries
export const definitions = (files, mixins = false) => Object.entries(files)
    .map(([file, def]) => ({ path: file.replace(/^.*?data\//, ''), def }))
    .filter(({ path, def }) => {
        if (def === null || typeof def != 'object' || Array.isArray(def))
            return false;
        const name = path.split('/').pop();
        if (name.startsWith('_') || name.startsWith('shared'))
            return mixins;
        return 'mapping' in def || 'parent' in def;
    })
    .sort((a, b) => a.path.localeCompare(b.path));
