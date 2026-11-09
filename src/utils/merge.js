export { deepMerge, mergeAll };

// a deep merge of plain objects, as the one of deepmerge (which the package
// used before): the entries of `source` replace or, if both are objects, are
// merged into the ones of `target`, values are copied, so the parts are not
// shared with the result; `arrayMerge(target, source, options)` merges two
// lists (by default the source replaces the target), `customMerge(key)`
// returns the merge of the values of a key, e.g. of the mappings, or
// undefined for the default; `leafMerge(target, source, options)` merges
// two values of which one is no object or list or an operator (see
// def.js), e.g. a switch of a global over the value below it, undefined for
// the default (the source replaces the target)

const isPlain = v => v !== null && typeof v == 'object' && !Array.isArray(v);
const clone = v => Array.isArray(v) ? v.map(clone) : isPlain(v) ? Object.fromEntries(Object.entries(v).map(([k, e]) => [k, clone(e)])) : v;
const mergeable = v => Array.isArray(v) || isPlain(v);
// an entry of an object, also one named __proto__ (e.g. a category of the
// data), which an assignment would make the prototype of the object
const put = (o, k, v) => k === '__proto__'
    ? Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true })
    : (o[k] = v, o);

const deepMerge = (target, source, options = {}) => {
    // `isOperator(value)`: an object which is an expression, e.g. { "match": [...] }, a leaf of the merge
    // (of leafMerge), on either side: it is not merged key by key with an object
    const { arrayMerge = (t, s) => clone(s), customMerge, leafMerge, isOperator = () => false } = options;
    if (Array.isArray(target) && Array.isArray(source))
        return arrayMerge(target, source, options);
    if (!isPlain(target) || !isPlain(source))
        return clone(source);
    // the keys in the order of the target, the new ones of the source after them
    const result = {};
    const merged = k => {
        const merge = customMerge?.(k) ?? deepMerge;
        if (Object.hasOwn(target, k) && mergeable(target[k]) && mergeable(source[k]) && !isOperator(source[k]) && !isOperator(target[k]))
            return merge(target[k], source[k], options);
        const leaf = leafMerge?.(Object.hasOwn(target, k) ? target[k] : undefined, source[k], options);
        return leaf === undefined ? clone(source[k]) : leaf;
    };
    Object.keys(target).forEach(k => put(result, k, Object.hasOwn(source, k) ? merged(k) : clone(target[k])));
    Object.keys(source).filter(k => !Object.hasOwn(target, k)).forEach(k => put(result, k, merged(k)));
    return result;
};

// the parts merged in their order, later ones override earlier ones
const mergeAll = (parts, options = {}) => parts.reduce((a, b) => deepMerge(a, b, options), {});
