export { warnOnce };

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
