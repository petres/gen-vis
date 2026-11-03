// the migration of the definitions of 3.x: the internal form of every
// definition of data/ migrated and normalized is the one of 3.x, see
// utils/migrate.js and utils/normalize.js
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { definitions } from '@/dev/definitions.js';
import { resolveParents } from '@/utils/load';
import { migrate, migrateExpr, migrateParts } from '@/utils/migrate';
import { isLegacy, normalize } from '@/utils/normalize';
import { plotTypes } from '@/plots';
import { isObject } from '@/utils/values';
import { formatOf, mergeAll } from '@/utils/def';
import { root } from './dom.js';

// the definitions of data/ of 4.0 and the ones of 3.x (tests/legacy/data/,
// the ones of 3.1), resolved with their parents
const files = import.meta.glob('../data/**/*.json', { eager: true, import: 'default' });
const examples = definitions(files);

const load = async (path, dir = 'data') => {
    const url = pathToFileURL(`${root}/${dir}/${path}`).href;
    return resolveParents(JSON.parse(readFileSync(new URL(url), 'utf8')), url, u => readFileSync(new URL(u), 'utf8'));
};

// the parts of a definition and its parents in the order of their merge, see resolveParents
const partsOf = (path, dir = 'data') => {
    const parts = [];
    const included = new Set();
    const add = url => {
        const def = JSON.parse(readFileSync(new URL(url), 'utf8'));
        [def.parent ?? []].flat().map(p => new URL(p, url).href).filter(u => !included.has(u)).forEach(u => {
            included.add(u);
            add(u);
        });
        parts.push(def);
    };
    add(pathToFileURL(`${root}/${dir}/${path}`).href);
    return parts;
};

// the internal form of 3.x with the expressions of 4.0 (the renderer has no
// props of 3.x anymore) and the defaults of the preparation: the type of a
// mapping without one is categorical, a part false or null is none; the
// formats of a mapping are the ones of its axis, hover and legend (see
// formatOf), of a mapping of a patch the ones of it merged into the one of
// the definition, as the patch is applied
const canonical = def => {
    const d = migrateExpr(JSON.parse(JSON.stringify(def)));
    const patches = (d.formElements ?? []).flatMap(e => Array.isArray(e.values) ? e.values : []).map(v => v?.patch).filter(isObject);
    const base = JSON.parse(JSON.stringify(isObject(d.mapping) ? d.mapping : {}));
    const formats = m => ['axis', 'hover', 'legend'].map(part => formatOf(m, part));
    const mappings = [d.mapping, ...patches.map(p => p.mapping)].filter(isObject);
    mappings.forEach((mapping, i) => Object.entries(mapping).filter(([, m]) => isObject(m)).forEach(([n, m]) => {
        if (i == 0)
            m.type ??= 'categorical';
        ['scale', 'axis', 'legend', 'hover', 'props'].filter(k => m[k] === false || m[k] === null).forEach(k => delete m[k]);
        // a scale without a type is linear, see prepareMapping
        if (i == 0 && isObject(m.scale) && m.scale.of === undefined)
            m.scale.type ??= 'linear';
        m.formats = formats(i == 0 || !isObject(base[n]) ? m : mergeAll([base[n], m]));
        delete m.format;
        ['axis', 'hover', 'legend'].filter(k => isObject(m[k])).forEach(k => delete m[k].format);
    }));
    // the categories of a plot are a list, also of one
    [d, ...patches].flatMap(p => [p.plot ?? []].flat()).filter(p => isObject(p) && p.categories !== undefined).forEach(p => p.categories = [p.categories].flat());
    // calc of 3.x is an expression
    const calc = t => t?.type == 'calc' && t.op !== undefined ? migrate({ transform: t }).transform : t;
    [d, ...patches].filter(p => p.transform !== undefined).forEach(p => p.transform = Array.isArray(p.transform) ? p.transform.map(calc) : calc(p.transform));
    return d;
};

// the order of the keys of an object of a path is no difference where it is
// none of the drawing: the props of a plot (attributes, normalize merges them
// into the defaults of its type and appends the ones of the highlight and the
// others), the parts of a plot and of a mapping, read by their names (its
// scale, axis, hover, legend and the props of its categories, but not the
// categories)
const unordered = path => /\.plot(\.\d+)?(\.props(\..*)?)?$/.test(path) || /\.mapping\.[^.]+(\.(scale|axis|hover|legend|props))?$/.test(path);

// the paths of the values which differ, e.g. "mapping.x.scale.type: linear != undefined",
// also of the keys of objects in another order, e.g. of the categories
const differences = (a, b, path = '') => {
    if (isObject(a) && isObject(b) || Array.isArray(a) && Array.isArray(b)) {
        const order = isObject(a) && !unordered(path) && Object.keys(a).join() != Object.keys(b).join()
            && Object.keys(a).length == Object.keys(b).length ? [`${path}: the keys ${Object.keys(a)} != ${Object.keys(b)}`] : [];
        return [...order, ...[...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(k => differences(a[k], b[k], `${path}.${k}`))];
    }
    return JSON.stringify(a) === JSON.stringify(b) ? [] : [`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`];
};

describe('migrate', () => {
    test.each(examples.map(e => e.path))('%s: normalize of the migrated definition is the one of 3.x and the one of 4.0', async path => {
        const def = await load(path, 'tests/legacy/data');
        const migrated = migrate(def);
        expect(isLegacy(migrated)).toBe(false);
        // migrate is idempotent
        expect(migrate(migrated)).toEqual(migrated);
        const internal = normalize(migrated, { plotTypes });
        expect(differences(canonical(internal), canonical(def))).toEqual([]);
        // the definition of 4.0 in data/, migrated by its parts (migrateParts)
        // and written shorter, has the same internal form
        const own = await load(path);
        expect(isLegacy(own)).toBe(false);
        expect(differences(canonical(normalize(own, { plotTypes })), canonical(internal))).toEqual([]);
    });

    test.each(examples.map(e => e.path).filter(p => partsOf(p, 'tests/legacy/data').length > 1))('%s: the merge of the parts migrated by migrateParts is the one of 3.x', path => {
        const parts = partsOf(path, 'tests/legacy/data');
        const migrated = migrateParts(parts);
        expect(migrated).toHaveLength(parts.length);
        expect(differences(canonical(normalize(mergeAll(migrated), { plotTypes })), canonical(mergeAll(parts)))).toEqual([]);
        expect(migrateParts(migrated)).toEqual(migrated);
    });
});
