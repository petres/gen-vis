// @vitest-environment jsdom
import { describe, test, expect, vi, afterEach } from 'vitest';
import { isReactive } from 'vue';
import { createStore, resolveUrl, resolveParents, clearCache } from '@/store';

// serves files, a delay per url simulates slow responses
const serve = (files, delays = {}) => vi.stubGlobal('fetch', async url => {
    await new Promise(r => setTimeout(r, delays[url] ?? 0));
    return url in files
        ? new Response(files[url])
        : new Response('', { status: 404, statusText: 'Not Found' });
});

afterEach(() => {
    clearCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const def = {
    data: 'data.csv',
    options: { width: 500, height: 300 },
    mapping: {
        x: { column: 'year', type: 'numeric', scale: { orientation: 'horizontal' } },
        y: { column: 'value', type: 'numeric', scale: { orientation: 'vertical' } },
    },
    plot: { type: 'svg:path', props: { d: { x: '@x:scaled', y: '@y:scaled' } } },
};
const csv = 'year,value\n2020,1\n2021,\n2022,3';

describe('resolveUrl', () => {
    test('relative to the base', () => {
        expect(resolveUrl('data.csv', 'http://h/data/bev/def.json')).toBe('http://h/data/bev/data.csv');
        expect(resolveUrl('../x/data.csv', 'http://h/data/bev/def.json')).toBe('http://h/data/x/data.csv');
        expect(resolveUrl('/data/x.json', 'http://h/data/bev/def.json')).toBe('http://h/data/x.json');
        expect(resolveUrl('https://o/x.csv', 'http://h/data/def.json')).toBe('https://o/x.csv');
    });

    test('relative to the page by default', () => {
        expect(resolveUrl('data/def.json')).toBe(new URL('data/def.json', document.baseURI).href);
    });
});

describe('resolveParents', () => {
    test('merges the parents, relative to the def referencing them', async () => {
        const files = {
            'http://h/data/shared/base.json': JSON.stringify({ parent: 'root.json', options: { width: 1, height: 2 }, plot: [{ type: 'a' }] }),
            'http://h/data/shared/root.json': JSON.stringify({ options: { width: 0, title: 'root' } }),
        };
        const loaded = [];
        const merged = await resolveParents(
            { parent: '../shared/base.json', options: { width: 3 }, plot: [{ type: 'b' }] },
            'http://h/data/bev/def.json',
            url => { loaded.push(url); return files[url]; },
        );
        expect(loaded).toEqual(['http://h/data/shared/base.json', 'http://h/data/shared/root.json']);
        expect(merged.options).toEqual({ width: 3, height: 2, title: 'root' });
        // arrays are replaced, not merged
        expect(merged.plot).toEqual([{ type: 'b' }]);
    });

    test('mixins are merged in their order, with their own parents', async () => {
        const files = {
            'http://h/data/root.json': JSON.stringify({ options: { title: 'root', height: 1, width: 1 } }),
            'http://h/data/lines.json': JSON.stringify({ parent: 'root.json', options: { height: 2 }, plot: [{ type: 'a' }] }),
            'http://h/data/facets.json': JSON.stringify({ parent: 'root.json', options: { width: 3 }, facets: { dim: ['type'] } }),
        };
        const loaded = [];
        const merged = await resolveParents(
            { parent: ['../lines.json', '../facets.json'], options: { title: 'def' } },
            'http://h/data/bev/def.json',
            url => { loaded.push(url); return files[url]; },
        );
        // the shared parent is loaded and merged once, it does not override lines.json,
        // the parents of a def are requested at once
        expect(loaded).toEqual(['http://h/data/lines.json', 'http://h/data/facets.json', 'http://h/data/root.json']);
        expect(merged.options).toEqual({ title: 'def', height: 2, width: 3 });
        expect(merged.plot).toEqual([{ type: 'a' }]);
        expect(merged.facets).toEqual({ dim: ['type'] });
    });

    test('cyclic parents', async () => {
        await expect(resolveParents({ parent: 'a.json' }, 'http://h/a.json', () => '{"parent": "a.json"}'))
            .rejects.toThrow("Cyclic parent definition 'http://h/a.json'");
        const files = { 'http://h/b.json': '{"parent": ["c.json"]}', 'http://h/c.json': '{"parent": "b.json"}' };
        await expect(resolveParents({ parent: ['x.json', 'b.json'] }, 'http://h/a.json', url => files[url] ?? '{}'))
            .rejects.toThrow("Cyclic parent definition 'http://h/b.json'");
    });

    test('invalid JSON', async () => {
        await expect(resolveParents({ parent: 'a.json' }, 'http://h/b.json', () => '{"parent": '))
            .rejects.toThrow(/^Invalid JSON in definition 'http:\/\/h\/a.json'/);
    });
});

describe('Store.init', () => {
    test('requests are shared, the data is requested together with the parents', async () => {
        const requested = [];
        const files = {
            'http://h/data/def.json': JSON.stringify({ ...def, parent: 'base.json' }),
            'http://h/data/base.json': JSON.stringify({ options: { title: 'base' } }),
            'http://h/data/data.csv': csv,
        };
        vi.stubGlobal('fetch', async url => {
            requested.push(url);
            return new Response(files[url]);
        });
        const stores = [createStore(), createStore()];
        await Promise.all(stores.map(s => s.init({ defUrl: 'http://h/data/def.json' })));
        expect(requested).toEqual(['http://h/data/def.json', 'http://h/data/data.csv', 'http://h/data/base.json']);
        expect(stores.map(s => s.def.options.title)).toEqual(['base', 'base']);

        // later ones load again
        const now = Date.now();
        vi.spyOn(Date, 'now').mockReturnValue(now + 5 * 60 * 1000);
        await createStore().init({ defUrl: 'http://h/data/def.json' });
        expect(requested.length).toBe(6);
    });

    test('failed requests are not kept', async () => {
        serve({ 'http://h/data/def.json': JSON.stringify(def) });
        await expect(createStore().init({ defUrl: 'http://h/data/def.json' })).rejects.toThrow(/404/);
        serve({ 'http://h/data/def.json': JSON.stringify(def), 'http://h/data/data.csv': csv });
        const store = createStore();
        await store.init({ defUrl: 'http://h/data/def.json' });
        expect(store.data.length).toBe(3);
    });

    test('loads the def and the data relative to it', async () => {
        serve({ 'http://h/data/def.json': JSON.stringify(def), 'http://h/data/data.csv': csv });
        const store = createStore();
        await store.init({ defUrl: 'http://h/data/def.json' });
        expect(store.loaded).toBe(true);
        expect(store.defUrl).toBe('http://h/data/def.json');
        expect(store.axis).toEqual({ h: 'x', v: 'y' });
        expect(store.data).toEqual([{ x: 2020, y: 1 }, { x: 2021, y: null }, { x: 2022, y: 3 }]);
        // the rows are not reactive
        expect(isReactive(store.data)).toBe(false);
        expect(isReactive(store.data[0])).toBe(false);
        expect(isReactive(store.def)).toBe(true);
    });

    test('inline def and data', async () => {
        const store = createStore();
        await store.init({ def: JSON.stringify({ ...def, data: undefined }), data: [{ year: 1, value: 2 }] });
        expect(store.defUrl).toBe(null);
        expect(store.data).toEqual([{ x: 1, y: 2 }]);
    });

    test('warnings for the definition', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const store = createStore();
        await store.init({ def: { ...def, plot: { ...def.plot, type: 'path' } }, data: csv });
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^gen-vis inline definition: plot\[0\]\.type: unknown type 'path'/));
    });

    test('errors name the url', async () => {
        serve({ 'http://h/data/def.json': JSON.stringify(def) });
        const store = createStore();
        await expect(store.init({ defUrl: 'http://h/data/def.json' }))
            .rejects.toThrow("Could not load 'http://h/data/data.csv': 404 Not Found");
        await expect(store.init({ def: '{"a": ' })).rejects.toThrow(/^Invalid JSON in definition attribute/);
        await expect(store.init({ def: { ...def, data: undefined } })).rejects.toThrow(/^No data given/);
    });

    test('an outdated init does not overwrite a newer one', async () => {
        serve({
            'http://h/slow/def.json': JSON.stringify({ ...def, options: { title: 'slow' } }),
            'http://h/slow/data.csv': csv,
            'http://h/fast/def.json': JSON.stringify({ ...def, options: { title: 'fast' } }),
            'http://h/fast/data.csv': csv,
        }, { 'http://h/slow/data.csv': 50 });
        const store = createStore();
        const slow = store.init({ defUrl: 'http://h/slow/def.json' });
        await store.init({ defUrl: 'http://h/fast/def.json' });
        await slow;
        expect(store.def.options.title).toBe('fast');
    });
});
