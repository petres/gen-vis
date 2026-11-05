export { deepMerge, mergeAll };

// a deep merge of plain objects, as the one of deepmerge (which the package
// used before): the entries of `source` replace or, if both are objects, are
// merged into the ones of `target`, values are copied, so the parts are not
// shared with the result; `arrayMerge(target, source, options)` merges two
// lists (by default the source replaces the target), `customMerge(key)`
// returns the merge of the values of a key, e.g. of the mappings, or
// undefined for the default

const isPlain = v => v !== null && typeof v == 'object' && !Array.isArray(v);
const clone = v => Array.isArray(v) ? v.map(clone) : isPlain(v) ? Object.fromEntries(Object.entries(v).map(([k, e]) => [k, clone(e)])) : v;
const mergeable = v => Array.isArray(v) || isPlain(v);

const deepMerge = (target, source, options = {}) => {
    const { arrayMerge = (t, s) => clone(s), customMerge } = options;
    if (Array.isArray(target) && Array.isArray(source))
        return arrayMerge(target, source, options);
    if (!isPlain(target) || !isPlain(source))
        return clone(source);
    // the keys in the order of the target, the new ones of the source after them
    const result = {};
    const merged = k => {
        const merge = customMerge?.(k) ?? deepMerge;
        return Object.hasOwn(target, k) && mergeable(target[k]) && mergeable(source[k]) ? merge(target[k], source[k], options) : clone(source[k]);
    };
    Object.keys(target).forEach(k => result[k] = Object.hasOwn(source, k) ? merged(k) : clone(target[k]));
    Object.keys(source).filter(k => !Object.hasOwn(target, k)).forEach(k => result[k] = merged(k));
    return result;
};

// the parts merged in their order, later ones override earlier ones
const mergeAll = (parts, options = {}) => parts.reduce((a, b) => deepMerge(a, b, options), {});
