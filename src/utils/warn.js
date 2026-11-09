export { warnOnce, markPath, withPath, distance, similar };

// the warnings given, by the store of a chart, a chart drawn again (e.g. by a
// slider) does not repeat them
const warned = new WeakMap();

/**
 * Warns of a problem of the definition of a chart once per `id`, in the style
 * of the warnings of validateDef, e.g. of rows not joined to a map.
 */
const warnOnce = (store, id, message) => {
    if (!warned.has(store))
        warned.set(store, new Set());
    const ids = warned.get(store);
    if (ids.has(id))
        return;
    ids.add(id);
    console.warn(`gen-vis ${store.defUrl ?? 'inline definition'}: ${message}`);
};

// the path of a plot of the engine (`def.plot`) in the definition, the mark
// of the same index, e.g. "marks[0]", `named` adds an id of its own, e.g.
// "marks[1] ('caps')"
const markPath = (def, plot, named = false) => {
    const i = [def?.plot ?? []].flat().indexOf(plot);
    const at = i < 0 ? 'marks' : `marks[${i}]`;
    return named && plot?.id !== undefined && plot.id !== `plot-${i}` ? `${at} ('${plot.id}')` : at;
};

// a message which begins with the path of a part of the definition, e.g.
// "marks[0].by: ..." or "dims.y.format: ..."
const pathed = /^(\$schema|marks|dims|controls|facets|transform|annotations|geo|filter|hover|legend|globals|coord|locale|margins|height|width|title|subtitle|source)\b[^\s:]*( \('[^']*'\))?: /;

// an error of the draw (or of the load) of a part as one which names its
// path, e.g. "marks[0]: ...", an error which names one already as it is
const withPath = (error, path) => {
    const message = error?.message ?? String(error);
    return pathed.test(message) ? error : new Error(`${path}: ${message}`, { cause: error });
};

// the number of the edits of one name to the other one (Levenshtein, a swap
// of two letters is one), e.g. 1 of "positon" and "position" or of "yaer"
// and "year"
const distance = (a, b) => {
    let before = null;
    let row = [...Array(b.length + 1).keys()];
    for (let i = 1; i <= a.length; i++) {
        const next = [i];
        for (let j = 1; j <= b.length; j++) {
            next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1));
            if (before && i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1])
                next[j] = Math.min(next[j], before[j - 2] + 1);
        }
        before = row;
        row = next;
    }
    return row[b.length];
};

// the known name a typo of a name probably is, at most two edits away and
// fewer than half of its length, e.g. not "y" of "x", undefined otherwise
const similar = (name, names) => typeof name != 'string' ? undefined : names
    .filter(n => typeof n == 'string')
    .map(n => [distance(name, n), n])
    .filter(([d]) => d <= 2 && 2*d < name.length)
    .sort(([a], [b]) => a - b)[0]?.[1];
