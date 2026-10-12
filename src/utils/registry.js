// the names of the registries of d3, e.g. of the scales and the colors

const lowerFirst = w => w.charAt(0).toLowerCase() + w.slice(1);

// the exports of a module of d3 with a prefix, by their names without it,
// e.g. "linear" of scaleLinear
export const byPrefix = (module, prefix) => Object.fromEntries(Object.entries(module)
    .filter(([k]) => k.startsWith(prefix) && k.length > prefix.length)
    .map(([k, v]) => [lowerFirst(k.slice(prefix.length)), v]));

// an entry of a registry, the first letter in any case, e.g. "Blues" or
// "blues", undefined for unknown names
export const named = (registry, name) => typeof name == 'string' && Object.hasOwn(registry, lowerFirst(name))
    ? registry[lowerFirst(name)] : undefined;
