// the portable fixtures of spec/ run against the JS implementation, see
// spec/README.md, an implementation in another language runs the same files
import { describe, test, expect, beforeAll } from 'vitest';
import { applyTransforms, loadTransforms } from '@/utils/transform';
import { mergeAll, patchedParts } from '@/utils/def';
import { resolveParents } from '@/utils/load';

// the fixtures of a directory of spec/ by the name of their file, e.g. "rolling"
const fixtures = files => Object.entries(files).map(([file, cases]) => [file.split('/').pop().replace(/\.json$/, ''), cases]);
const clone = v => JSON.parse(JSON.stringify(v));

// numbers are the same up to a relative difference of 1e-12, e.g. of another
// order of a sum, the other values exactly
const close = (actual, expected) => {
    if (typeof expected == 'number' && typeof actual == 'number')
        return actual === expected || Math.abs(actual - expected) <= 1e-12*Math.max(Math.abs(actual), Math.abs(expected));
    if (Array.isArray(expected))
        return Array.isArray(actual) && actual.length == expected.length && expected.every((e, i) => close(actual[i], e));
    if (expected !== null && typeof expected == 'object')
        return actual !== null && typeof actual == 'object' && Object.keys(actual).length == Object.keys(expected).length
            && Object.keys(expected).every(k => Object.hasOwn(actual, k) && close(actual[k], expected[k]));
    return actual === expected;
};
const expectClose = (actual, expected) => {
    if (!close(actual, expected))
        expect(actual).toEqual(expected);
};

// the cases of a fixture in the time zone of `timezone`, by default the one of the tests
const inZone = (zone, f) => {
    const before = process.env.TZ;
    if (zone)
        process.env.TZ = zone;
    try {
        return f();
    } finally {
        process.env.TZ = before;
    }
};

describe('spec/transforms', () => {
    beforeAll(loadTransforms);
    const files = import.meta.glob('../spec/transforms/*.json', { eager: true, import: 'default' });
    describe.each(fixtures(files))('%s', (type, cases) => {
        test.each(cases.map(c => [c.name, c]))('%s', (name, c) => {
            const run = () => applyTransforms(clone(c.rows), clone(c.transform), c.globals ?? {}, new Set(c.utc ?? []), null,
                c.files ? new Map(Object.entries(c.files)) : null);
            inZone(c.timezone, () => {
                if (c.error !== undefined)
                    expect(run).toThrow(c.error);
                else
                    expectClose(Object.fromEntries(run()), c.columns);
            });
        });
    });
});

describe('spec/merge', () => {
    test.each(import.meta.glob('../spec/merge/merge.json', { eager: true, import: 'default' })['../spec/merge/merge.json'].map(c => [c.name, c]))('merge: %s', (name, c) => {
        const parts = clone(c.parts);
        expect(mergeAll(parts)).toEqual(c.result);
        // the parts are not changed
        expect(parts).toEqual(c.parts);
    });

    test.each(import.meta.glob('../spec/merge/parents.json', { eager: true, import: 'default' })['../spec/merge/parents.json'].map(c => [c.name, c]))('parents: %s', async (name, c) => {
        const resolved = resolveParents(clone(c.def), c.url, url => JSON.stringify(c.files[url]));
        if (c.error !== undefined)
            await expect(resolved).rejects.toThrow(c.error);
        else
            expect(await resolved).toEqual(c.result);
    });

    test.each(import.meta.glob('../spec/merge/patches.json', { eager: true, import: 'default' })['../spec/merge/patches.json'].map(c => [c.name, c]))('patches: %s', (name, c) => {
        const def = clone(c.def);
        def.globals ??= {};
        const parts = patchedParts(def, c.def);
        expect({ globals: def.globals, parts }).toEqual(c.result);
    });
});
