export { applyTransforms, loadTransforms, transformNames, transformColumns, utcColumns, madeColumns, madeBy };

import { fillTemplate } from "@/utils/def";
import { scaleDef } from "@/utils/data";
import { lazy } from "@/utils/lazy";
import { refNames } from "@/utils/expr";

/**
 * The transforms of a definition compute columns of the data in the browser,
 * e.g. an index of a base year, see utils/transform-types.js, they are loaded
 * for definitions with transforms (loadTransforms).
 */

// the types of the transforms, e.g. for validateDef
const transformNames = ['year', 'align', 'format', 'index', 'mean', 'share', 'rolling', 'cumulative', 'calc', 'filter', 'rank', 'random', 'lookup', 'bin', 'fold', 'aggregate', 'window', 'regression'];

const list = transforms => [transforms ?? []].flat();

// the columns of the values of a transform which adds columns: `as` (by
// default `column`, which it replaces); of an aggregate of a list of ops
// (e.g. ["q1", "median", "q3"]) a column per op, `as` the list of their
// names, by default the names of the ops
const madeBy = t => t.type == 'aggregate' && Array.isArray(t.op) ? t.op.map((op, j) => Array.isArray(t.as) ? t.as[j] : op) : [t.as ?? t.column];

let types = null;
const loadTransforms = async () => types ??= await lazy.transform();

/**
 * The columns of the transforms, see applyTransforms of utils/transform-types.js,
 * without transforms none, otherwise they are loaded, see loadTransforms.
 */
const applyTransforms = (rows, transforms = [], globals = {}, utc = new Set(), before = null, files = null) => {
    if (list(transforms).length == 0)
        return Object.assign(new Map(), { steps: [], changed: new Set(), kept: null, rows: null, notes: [] });
    if (!types)
        throw new Error('The transforms are not loaded, see loadTransforms');
    return types.applyTransforms(rows, transforms, globals, utc, before, files);
};

// the columns of the mappings of dates of `utc` scales, with the values of
// the globals, the transforms of them are in UTC
const utcColumns = def => new Set(Object.values(def.mapping ?? {})
    .filter(m => scaleDef(def.mapping, m)?.type == 'utc' && typeof m.column == 'string')
    .map(m => fillTemplate(m.column, def.globals ?? {})));

// the columns of the data the transforms use, e.g. for parquet, the ones of
// the transforms themselves are no columns of the data, null if they are
// not known, e.g. of a pattern of a fold ("20*")
const transformColumns = transforms => {
    const { used, unknown } = columnsOf(transforms);
    return unknown ? null : [...used];
};

// the columns the transforms make (e.g. the start, the end and the count
// of a bin), a column of a pattern of a fold unknown
const madeColumns = transforms => columnsOf(transforms).own;

const columnsOf = transforms => {
    const own = new Set();
    const used = new Set();
    let unknown = false;
    list(transforms).forEach(t => {
        const folded = t.type == 'fold' ? [t.columns ?? []].flat() : [];
        if (folded.some(c => typeof c == 'string' && c.includes('*')))
            unknown = true;
        [t.column, ...[t.by ?? []].flat(), t.order, t.weight, t.type == 'random' ? t.key : undefined, t.type == 'regression' ? t.x : undefined,
            ...Object.keys(t.base ?? {}), ...(t.expr === undefined ? [] : refNames(t.expr)), ...folded]
            .filter(c => typeof c == 'string' && !own.has(c)).forEach(c => used.add(c));
        // the columns of the rows of a bin or a fold are its own
        if (t.type == 'bin')
            [t.start ?? 'start', t.end ?? 'end', t.as ?? 'count'].forEach(c => own.add(c));
        else if (t.type == 'fold')
            [t.key ?? 'key', t.value ?? 'value'].forEach(c => own.add(c));
        else if (t.type != 'filter')
            madeBy(t).forEach(c => own.add(c));
    });
    return { own, used, unknown };
};
