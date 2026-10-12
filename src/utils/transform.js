export { applyTransforms, loadTransforms, transformNames, transformColumns, transformGlobals, utcColumns };

import { fillTemplate, templateRefs } from "@/utils/def";
import { lazy } from "@/utils/lazy";

/**
 * The transforms of a definition compute columns of the data in the browser,
 * e.g. an index of a base year, see utils/transform-types.js, they are loaded
 * for definitions with transforms (loadTransforms).
 */

// the types of the transforms, e.g. for validateDef
const transformNames = ['year', 'align', 'index', 'share', 'rolling', 'cumulative'];

const list = transforms => [transforms ?? []].flat();

let types = null;
const loadTransforms = async () => types ??= await lazy.transform();

/**
 * The columns of the transforms, see applyTransforms of utils/transform-types.js,
 * without transforms none, otherwise they are loaded, see loadTransforms.
 */
const applyTransforms = (rows, transforms = [], globals = {}, utc = new Set(), before = null) => {
    if (list(transforms).length == 0)
        return Object.assign(new Map(), { steps: [], changed: new Set() });
    if (!types)
        throw new Error('The transforms are not loaded, see loadTransforms');
    return types.applyTransforms(rows, transforms, globals, utc, before);
};

// the names of the globals of the transforms, e.g. `base` of "{base}"
const transformGlobals = transforms => [...new Set(templateRefs(JSON.stringify(transforms ?? [])))];

// the columns of the mappings of dates of `utc` scales, with the values of
// the globals, the transforms of them are in UTC
const utcColumns = def => new Set(Object.values(def.mapping ?? {})
    .filter(m => m?.scale?.type == 'utc' && typeof m.column == 'string')
    .map(m => fillTemplate(m.column, def.globals ?? {})));

// the columns of the data the transforms use, e.g. for parquet, the ones of
// the transforms themselves are no columns of the data
const transformColumns = transforms => {
    const own = new Set();
    const used = new Set();
    list(transforms).forEach(t => {
        [t.column, ...[t.by ?? []].flat(), t.order, ...Object.keys(t.base ?? {})]
            .filter(c => typeof c == 'string' && !own.has(c)).forEach(c => used.add(c));
        own.add(t.as ?? t.column);
    });
    return [...used];
};
