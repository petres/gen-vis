// the migration of the definitions of 3.x: the internal form of every
// definition of data/ migrated and normalized is the one of 3.x, see
// utils/migrate.js and utils/normalize.js
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { definitions } from '@/dev/definitions.js';
import { resolveParents } from '@/utils/load';
import { migrate, migrateExpr } from '@/utils/migrate';
import { isLegacy, normalize } from '@/utils/normalize';
import { plotTypes } from '@/plots';
import { isObject } from '@/utils/values';
import { root } from './dom.js';

// the definitions of 3.x of data/, the ones of git (HEAD of the branch of
// 4.0 has the migrated ones), resolved with their parents
const files = import.meta.glob('../data/**/*.json', { eager: true, import: 'default' });
const examples = definitions(files);

const load = async path => {
    const url = pathToFileURL(`${root}/data/${path}`).href;
    return resolveParents(JSON.parse(readFileSync(new URL(url), 'utf8')), url, u => readFileSync(new URL(u), 'utf8'));
};

// the internal form of 3.x with the expressions of 4.0 (the renderer has no
// props of 3.x anymore) and the defaults of the preparation: the type of a
// mapping without one is categorical, a part false or null is none
const canonical = def => {
    const d = migrateExpr(JSON.parse(JSON.stringify(def)));
    const mappings = [d.mapping, ...(d.formElements ?? []).flatMap(e => Array.isArray(e.values) ? e.values : []).map(v => v?.patch?.mapping)].filter(isObject);
    mappings.forEach((mapping, i) => Object.values(mapping).filter(isObject).forEach(m => {
        if (i == 0)
            m.type ??= 'categorical';
        ['scale', 'axis', 'legend', 'hover', 'props'].filter(k => m[k] === false || m[k] === null).forEach(k => delete m[k]);
        // a scale without a type is linear, see prepareMapping
        if (i == 0 && isObject(m.scale) && m.scale.of === undefined)
            m.scale.type ??= 'linear';
    }));
    // the categories of a plot are a list, also of one
    [d, ...(d.formElements ?? []).flatMap(e => Array.isArray(e.values) ? e.values : []).map(v => v?.patch).filter(isObject)]
        .flatMap(p => [p.plot ?? []].flat()).filter(p => isObject(p) && p.categories !== undefined).forEach(p => p.categories = [p.categories].flat());
    // calc of 3.x is an expression
    const calc = t => t?.type == 'calc' && t.op !== undefined ? migrate({ transform: t }).transform : t;
    [d, ...(d.formElements ?? []).flatMap(e => Array.isArray(e.values) ? e.values : []).map(v => v?.patch).filter(isObject)]
        .filter(p => p.transform !== undefined).forEach(p => p.transform = Array.isArray(p.transform) ? p.transform.map(calc) : calc(p.transform));
    return d;
};

// the paths of the values which differ, e.g. "mapping.x.scale.type: linear != undefined"
const differences = (a, b, path = '') => {
    if (isObject(a) && isObject(b) || Array.isArray(a) && Array.isArray(b))
        return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(k => differences(a[k], b[k], `${path}.${k}`));
    return JSON.stringify(a) === JSON.stringify(b) ? [] : [`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`];
};

describe('migrate', () => {
    test.each(examples.map(e => e.path))('%s: normalize of the migrated definition is the one of 3.x', async path => {
        const def = await load(path);
        const migrated = migrate(def);
        expect(isLegacy(migrated)).toBe(false);
        // migrate is idempotent
        expect(migrate(migrated)).toEqual(migrated);
        expect(differences(canonical(normalize(migrated, { plotTypes })), canonical(def))).toEqual([]);
    });
});
