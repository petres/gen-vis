// @vitest-environment jsdom
import { describe, test, expect, vi, afterEach, onTestFinished } from 'vitest';
import { createStore } from '@/store';
import { resolveUrl, resolveParents, clearCache, requirements } from '@/utils/load';
import { translate } from '@/utils/language';
import { resolve, variants, namesOfGlobals } from '@/utils/resolve';
import { variantsOf } from '@/utils/def';
import { parquetWriteBuffer } from 'hyparquet-writer';
import { coords, loadCoord, registerCoord } from '@/coords';

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

// the version of the definition language, see utils/version.js
const schema = 'https://unpkg.com/@preschen/gen-vis@5/schema.json';

const def = {
    $schema: schema,
    data: 'data.csv',
    width: 500,
    height: 300,
    dims: {
        x: { column: 'year', type: 'numeric' },
        y: { column: 'value', type: 'numeric' },
    },
    marks: { type: 'line' },
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
            'http://h/data/shared/base.json': JSON.stringify({ parent: 'root.json', width: 1, height: 2, margins: { left: 1, top: 2 }, marks: [{ type: 'a' }] }),
            'http://h/data/shared/root.json': JSON.stringify({ width: 0, title: 'root', margins: { left: 0, right: 9 } }),
        };
        const loaded = [];
        const merged = await resolveParents(
            { $schema: schema, parent: '../shared/base.json', width: 3, margins: { left: 3 }, marks: [{ type: 'b' }] },
            'http://h/data/bev/def.json',
            url => { loaded.push(url); return files[url]; },
        );
        expect(loaded).toEqual(['http://h/data/shared/base.json', 'http://h/data/shared/root.json']);
        expect(merged).toMatchObject({ width: 3, height: 2, title: 'root' });
        // objects are merged key by key
        expect(merged.margins).toEqual({ left: 3, right: 9, top: 2 });
        // arrays are replaced, not merged
        expect(merged.marks).toEqual([{ type: 'b' }]);
    });

    test('mixins are merged in their order, with their own parents', async () => {
        const files = {
            'http://h/data/root.json': JSON.stringify({ title: 'root', height: 1, width: 1 }),
            'http://h/data/lines.json': JSON.stringify({ parent: 'root.json', height: 2, marks: [{ type: 'a' }] }),
            'http://h/data/facets.json': JSON.stringify({ parent: 'root.json', width: 3, facets: { by: 'type' } }),
        };
        const loaded = [];
        const merged = await resolveParents(
            { $schema: schema, parent: ['../lines.json', '../facets.json'], title: 'def' },
            'http://h/data/bev/def.json',
            url => { loaded.push(url); return files[url]; },
        );
        // the shared parent is loaded and merged once, it does not override lines.json,
        // the parents of a def are requested at once
        expect(loaded).toEqual(['http://h/data/lines.json', 'http://h/data/facets.json', 'http://h/data/root.json']);
        expect(merged).toMatchObject({ title: 'def', height: 2, width: 3 });
        expect(merged.marks).toEqual([{ type: 'a' }]);
        expect(merged.facets).toEqual({ by: 'type' });
    });

    test('cyclic parents', async () => {
        await expect(resolveParents({ parent: 'a.json' }, 'http://h/a.json', () => '{"parent": "a.json"}'))
            .rejects.toThrow("Cyclic parent definition 'http://h/a.json'");
        const files = { 'http://h/b.json': '{"parent": ["c.json"]}', 'http://h/c.json': '{"parent": "b.json"}' };
        await expect(resolveParents({ parent: ['x.json', 'b.json'] }, 'http://h/a.json', url => files[url] ?? '{}'))
            .rejects.toThrow("Cyclic parent definition 'http://h/b.json'");
    });

    test('a file of a definition declares gen-vis 5 by its $schema, in itself or in a parent, an inline one may omit it', async () => {
        const load = files => url => files[url];
        const of = s => JSON.stringify({ $schema: s, title: 'p' });
        // the major version of unpkg or jsdelivr, a full one or the schema of the installed package
        for (const s of [schema, 'https://unpkg.com/@preschen/gen-vis@5.1.0/schema.json', 'https://cdn.jsdelivr.net/npm/@preschen/gen-vis@5.0.0-alpha.1/schema.json',
            '../../node_modules/@preschen/gen-vis/schema.json'])
            expect((await resolveParents({ $schema: s }, 'http://h/a.json')).$schema).toBe(s);
        // in a parent
        expect((await resolveParents({ parent: 'p.json' }, 'http://h/a.json', load({ 'http://h/p.json': of(schema) }))).$schema).toBe(schema);
        // an inline definition without one, its parents need none
        expect(await resolveParents({ parent: 'p.json', title: 'a' }, undefined, () => '{}')).toEqual({ parent: 'p.json', title: 'a' });
        const error = what => `'http://h/a.json' is no definition of gen-vis 5: ${what}, e.g. "$schema": "${schema}", see the changelog of gen-vis 5.0.0 of the changes of the definitions`;
        await expect(resolveParents({ title: 'a' }, 'http://h/a.json')).rejects.toThrow(error('its $schema is missing'));
        await expect(resolveParents({ $schema: 'https://unpkg.com/@preschen/gen-vis@3/schema.json' }, 'http://h/a.json')).rejects.toThrow(error('its $schema is the one of gen-vis 3'));
        await expect(resolveParents({ $schema: 'https://unpkg.com/@preschen/gen-vis/schema.json' }, 'http://h/a.json'))
            .rejects.toThrow(error('its $schema "https://unpkg.com/@preschen/gen-vis/schema.json" names no major version of gen-vis'));
        await expect(resolveParents({ $schema: 'https://vega.github.io/schema/vega-lite/v5.json' }, 'http://h/a.json'))
            .rejects.toThrow(error('its $schema "https://vega.github.io/schema/vega-lite/v5.json" is none of gen-vis'));
        for (const s of ['https://unpkg.com/@preschen/gen-vis@4/schema.json', 'https://cdn.jsdelivr.net/npm/@preschen/gen-vis@4.1.0/schema.json'])
            await expect(resolveParents({ $schema: s }, 'http://h/a.json')).rejects.toThrow(error('its $schema is the one of gen-vis 4'));
        // every part with one, also a parent of a file and an inline definition
        await expect(resolveParents({ $schema: schema, parent: 'p.json' }, 'http://h/a.json', load({ 'http://h/p.json': of('https://unpkg.com/@preschen/gen-vis@3/schema.json') })))
            .rejects.toThrow("'http://h/p.json' is no definition of gen-vis 5: its $schema is the one of gen-vis 3");
        await expect(resolveParents({ $schema: 'https://unpkg.com/@preschen/gen-vis@3.1.0/schema.json' }, undefined))
            .rejects.toThrow('the inline definition is no definition of gen-vis 5: its $schema is the one of gen-vis 3');
        // the load of a file
        serve({ 'http://h/data/def.json': JSON.stringify({ ...def, $schema: undefined }), 'http://h/data/data.csv': csv });
        await expect(createStore().init({ defUrl: 'http://h/data/def.json' })).rejects.toThrow("'http://h/data/def.json' is no definition of gen-vis 5: its $schema is missing");
    });

    test('a definition of the keys of gen-vis 4 is not read: inline, a file, a parent of a definition of 5, one error which names the keys', async () => {
        const reads = 'gen-vis 5 reads "dims", "marks", "controls" and the options at the top level, see "Upgrading from 4.x" of the changelog of gen-vis 5.0.0';
        const old = { mapping: { x: { column: 'year' }, y: { column: 'value' } }, plot: { type: 'line' } };
        await expect(resolveParents({ ...old }, undefined)).rejects.toThrow(`the inline definition is a definition of gen-vis 4 (its "mapping", "plot"): ${reads}`);
        // also with the $schema of 5, and one key beside the ones of 5
        await expect(resolveParents({ $schema: schema, ...old, formElements: [], options: {} }, 'http://h/a.json'))
            .rejects.toThrow(`'http://h/a.json' is a definition of gen-vis 4 (its "mapping", "plot", "formElements", "options"): ${reads}`);
        await expect(resolveParents({ $schema: schema, dims: { x: 'year' }, options: { title: 'T' } }, 'http://h/a.json'))
            .rejects.toThrow(`'http://h/a.json' is a definition of gen-vis 4 (its "options"): ${reads}`);
        // a parent, of a file and of an inline definition: the error names its url
        const files = { 'http://h/p.json': JSON.stringify({ formElements: [{ ref: 'g', type: 'radio' }] }) };
        for (const url of ['http://h/a.json', undefined])
            await expect(resolveParents({ $schema: schema, parent: 'http://h/p.json', dims: { x: 'year' }, marks: { type: 'line' } }, url, u => files[u]))
                .rejects.toThrow(`'http://h/p.json' is a definition of gen-vis 4 (its "formElements"): ${reads}`);
        // the load of a store: of the attribute and of a file
        await expect(createStore().init({ def: { ...old, data: 'data.csv' }, data: csv })).rejects.toThrow('the inline definition is a definition of gen-vis 4 (its "mapping", "plot"): ');
        serve({ 'http://h/data/def.json': JSON.stringify({ $schema: 'https://unpkg.com/@preschen/gen-vis@4/schema.json', ...old }), 'http://h/data/data.csv': csv });
        await expect(createStore().init({ defUrl: 'http://h/data/def.json' })).rejects.toThrow("'http://h/data/def.json' is a definition of gen-vis 4 (its \"mapping\", \"plot\"): ");
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
            'http://h/data/base.json': JSON.stringify({ title: 'base' }),
            'http://h/data/data.csv': csv,
        };
        vi.stubGlobal('fetch', async url => {
            requested.push(url);
            return new Response(files[url]);
        });
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        onTestFinished(() => vi.useRealTimers());
        const stores = [createStore(), createStore()];
        await Promise.all(stores.map(s => s.init({ defUrl: 'http://h/data/def.json' })));
        expect(requested).toEqual(['http://h/data/def.json', 'http://h/data/data.csv', 'http://h/data/base.json']);
        expect(stores.map(s => s.def.title)).toEqual(['base', 'base']);

        // later ones load again, the content is not kept
        vi.advanceTimersByTime(5 * 60 * 1000);
        await createStore().init({ defUrl: 'http://h/data/def.json' });
        expect(requested.length).toBe(6);
    });

    test('data of a format of a parent is requested once, e.g. parquet', async () => {
        const requested = [];
        const files = {
            'http://h/data/def.json': JSON.stringify({ ...def, data: '/api/rows', parent: 'base.json' }),
            'http://h/data/base.json': JSON.stringify({ dataFormat: 'parquet' }),
            'http://h/api/rows': parquetWriteBuffer({ columnData: [{ name: 'year', data: [2020, 2021], type: 'INT32' }, { name: 'value', data: [1, 2], type: 'INT32' }] }),
        };
        vi.stubGlobal('fetch', async url => {
            requested.push(url);
            return new Response(files[url]);
        });
        const store = createStore();
        await store.init({ defUrl: 'http://h/data/def.json' });
        expect(requested.filter(u => u.endsWith('/api/rows'))).toHaveLength(1);
        expect(store.data).toHaveLength(2);
    });

    test('data which is no list of rows is an error of its url', async () => {
        serve({ 'http://h/data/def.json': JSON.stringify({ ...def, data: 'data.json' }), 'http://h/data/data.json': '{ "rows": [] }' });
        await expect(createStore().init({ defUrl: 'http://h/data/def.json' })).rejects
            .toThrow("Could not read the data 'http://h/data/data.json': the JSON is not a list of rows");
        await expect(createStore().init({ def, data: { rows: [] } })).rejects.toThrow('Could not read the data of the attribute: expected rows');
    });

    test('the parts of a coordinate system which could not be loaded are loaded again', async () => {
        const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ default: { loadedPart: true } });
        registerCoord('test:lazy', { ...coords.cartesian, load });
        await expect(loadCoord('test:lazy')).rejects.toThrow('offline');
        expect((await loadCoord('test:lazy')).loadedPart).toBe(true);
        await loadCoord('test:lazy');
        expect(load).toHaveBeenCalledTimes(2);
        delete coords['test:lazy'];
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
        // the rows are only their values, no proxies (the row of the data and
        // its index are private fields, see prepareData)
        expect(Object.keys(store.data[0])).toEqual(['x', 'y']);
        expect(Object.getOwnPropertySymbols(store.data[0])).toEqual([]);
        expect(JSON.parse(JSON.stringify(store.data[0]))).toEqual({ x: 2020, y: 1 });
    });

    test('inline def and data', async () => {
        const store = createStore();
        await store.init({ def: JSON.stringify({ ...def, data: undefined }), data: [{ year: 1, value: 2 }] });
        expect(store.defUrl).toBe(null);
        expect(store.data).toEqual([{ x: 1, y: 2 }]);
    });

    // the legend of a scale of colors, of the definition or of another value of a control
    test('loads the legend of a scale of colors', async () => {
        const color = { column: 'value', type: 'numeric', scale: { type: 'sequential', interpolator: 'Blues' } };
        const withLegend = createStore();
        await withLegend.init({ def: { ...def, data: undefined, dims: { ...def.dims, color: { ...color, legend: {} } } }, data: csv });
        expect(withLegend.colorLegend).not.toBe(null);

        const switched = createStore();
        await switched.init({ def: { ...def, data: undefined,
            globals: { legend: 'no' },
            controls: [{ type: 'radio', global: 'legend', values: ['no', 'yes'] }],
            dims: { ...def.dims, color: { ...color, legend: "=match(@legend, {yes: literal({})})" } } }, data: csv });
        expect(switched.def.dims.color.legend).toBeUndefined();
        expect(switched.colorLegend).not.toBe(null);

        const without = createStore();
        await without.init({ def: { ...def, data: undefined, dims: { ...def.dims, color } }, data: csv });
        expect(without.colorLegend).toBe(null);
    });

    // the transforms of a value of a control, the definition has none of the other values
    test('the transforms of a value of a control', async () => {
        const store = createStore();
        await store.init({ def: { ...def, data: undefined,
            globals: { mode: 'sum' },
            controls: [{ type: 'radio', global: 'mode', values: ['value', 'sum'] }],
            transform: "=match(@mode, {sum: literal([{type: 'cumulative', column: 'value', as: 'sum'}])})",
            dims: { ...def.dims, y: { column: 'sum', type: 'numeric' } } }, data: 'year,value\n2020,1\n2021,2' });
        expect(store.data.map(r => r.y)).toEqual([1, 3]);
    });

    // only with `check`, the check is not loaded otherwise
    test('warnings for the definition', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const wrong = { ...def, marks: [{ type: 'path' }] };
        await createStore().init({ def: wrong, data: csv });
        expect(warn).not.toHaveBeenCalled();
        const store = createStore();
        await store.init({ def: wrong, data: csv, check: true });
        // the places of the warnings are the ones of the definition
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^gen-vis inline definition: marks\[0\]\.type: unknown type 'path'/));
    });

    // the check reads the definition, not the normalized one, e.g. of the
    // default props
    test('no warnings of a definition of the short forms', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const short = { dims: { x: 'year', y: 'value', k: { column: 'k', categories: { a: 'red' } } },
            marks: { type: 'line', by: 'k', highlight: { 'stroke-width': 3 } } };
        await createStore().init({ def: short, data: 'year,value,k\n2020,1,a\n2021,2,a', check: true });
        expect(warn).not.toHaveBeenCalled();
    });

    // the check has the rows, e.g. of years as numbers of a date dim,
    // and warns also if the data could not be loaded
    test('warnings of the rows and of a failed load', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const dated = { dims: { x: { column: 'year', type: 'date' }, y: 'value' }, marks: { type: 'line' } };
        await createStore().init({ def: dated, data: [{ year: 2020, value: 1 }], check: true });
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/dims\.x\.type: the values of 'year' are numbers, e\.g\. 2020/));
        warn.mockClear();
        const wrong = { ...def, data: 'http://h/missing.csv', marks: [{ type: 'path' }] };
        await expect(createStore().init({ def: wrong, check: true })).rejects.toThrow(/Could not load/);
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/marks\[0\]\.type: unknown type 'path'/));
    });

    test('errors name the url', async () => {
        serve({ 'http://h/data/def.json': JSON.stringify(def) });
        const store = createStore();
        await expect(store.init({ defUrl: 'http://h/data/def.json' }))
            .rejects.toThrow("Could not load 'http://h/data/data.csv': 404 Not Found");
        await expect(store.init({ def: '{"a": ' })).rejects.toThrow(/^Invalid JSON in definition attribute/);
        await expect(store.init({ def: { ...def, data: undefined } })).rejects.toThrow(/^No data given/);
    });

    test('the definition before is kept while a new one is loaded', async () => {
        serve({
            'http://h/a/def.json': JSON.stringify({ ...def, title: 'a' }),
            'http://h/a/data.csv': csv,
            'http://h/b/def.json': JSON.stringify({ ...def, title: 'b' }),
            'http://h/b/data.csv': csv,
        }, { 'http://h/b/data.csv': 30 });
        const store = createStore();
        await store.init({ defUrl: 'http://h/a/def.json' });
        expect([store.loaded, store.loading, store.loads]).toEqual([true, false, 1]);
        const loading = store.init({ defUrl: 'http://h/b/def.json' });
        expect([store.loaded, store.loading, store.def.title]).toEqual([true, true, 'a']);
        await loading;
        expect([store.loaded, store.loading, store.loads, store.def.title]).toEqual([true, false, 2, 'b']);
    });

    test('an outdated init does not overwrite a newer one', async () => {
        serve({
            'http://h/slow/def.json': JSON.stringify({ ...def, title: 'slow' }),
            'http://h/slow/data.csv': csv,
            'http://h/fast/def.json': JSON.stringify({ ...def, title: 'fast' }),
            'http://h/fast/data.csv': csv,
        }, { 'http://h/slow/data.csv': 50 });
        const store = createStore();
        const slow = store.init({ defUrl: 'http://h/slow/def.json' });
        await store.init({ defUrl: 'http://h/fast/def.json' });
        await slow;
        expect(store.def.title).toBe('fast');
    });
});

describe('requirements', () => {
    // the definition of the engine with the ones of all values of its controls, as the load keeps them
    const engineOf = source => {
        const engine = translate(resolve(source, namesOfGlobals(source.globals, source.controls)));
        engine[variantsOf] = variants(source).map(translate);
        return engine;
    };

    test('nothing of a plain definition but the coordinate system and the locale', () => {
        expect(requirements(engineOf(def))).toEqual({
            colors: false, more: false, coords: [undefined], geo: false, transforms: false, colorLegend: false, inside: false, locales: [undefined],
        });
    });

    test('the parts of the definition', () => {
        const need = requirements({
            coord: 'polar', transition: 300, locale: 'de',
            geo: { data: 'map.json' },
            transform: { type: 'share', column: 'value', as: 'share' },
            dims: {
                c: { column: 'c', scale: { type: 'sequential', interpolator: 'Blues' }, legend: {} },
                k: { column: 'k', scheme: 'Tableau10', fromData: true, legend: {} },
            },
        });
        expect(need).toEqual({ colors: true, more: false, coords: ['polar'], geo: true, transforms: true, colorLegend: true, inside: false, locales: ['de'] });
        expect(requirements({ dims: { c: { scale: { scheme: 'Blues' } } } }).colors).toBe(true);
        expect(requirements({ dims: { k: { scheme: 'Tableau10' } } }).colors).toBe(true);
        // a legend of categories is no legend of colors
        expect(requirements({ dims: { k: { fromData: true, legend: {} } } }).colorLegend).toBe(false);
    });

    test('the parts of the other values of controls', () => {
        const need = requirements(engineOf({ ...def,
            controls: [{ global: 'e', values: ['0', '1', '2', '3'] }],
            transform: "=match(@e, {1: literal([{type: 'rank', column: 'value', as: 'rank'}])})",
            transition: "=match(@e, {1: true})",
            locale: "=match(@e, {1: 'en'})",
            dims: {
                x: def.dims.x,
                y: "=match(@e, {3: null}, literal({column: 'value', type: 'numeric'}))",
                c: { scale: { interpolator: "=match(@e, {0: 'Reds'})" }, legend: "=match(@e, {0: literal({})})" },
            } }));
        expect(need).toEqual({ colors: true, more: false, coords: [undefined], geo: false, transforms: true, colorLegend: true, inside: false, locales: [undefined, 'en'] });
        // the placement of labels inside the bands of an area, also of the marks of another value
        expect(requirements(engineOf({ controls: [{ global: 'e', values: ['a', 'b'] }],
            marks: "=match(@e, {b: literal([{type: 'area', id: 'a'}, {type: 'text', id: 't', place: {in: 'a'}}])}, literal([{type: 'area', id: 'a'}]))" })).inside).toBe(true);
    });

    test('a name of a color which is no part of a scale or of props needs no colors', () => {
        expect(requirements({ title: '"scheme": "Blues"', dims: { c: { column: 'interpolator' } } }).colors).toBe(false);
    });
});

describe('the entry for scripts', () => {
    test('merges and checks definitions', async () => {
        const check = await import('@/check');
        const merged = await check.resolveParents({ parent: 'base.json' }, 'http://h/def.json', () => JSON.stringify(def));
        expect(check.validateDef(merged)).toEqual([]);
    });
});

describe('controls of globals, coordinate systems and maps', () => {
    const lookupDef = {
        globals: { lang: 'de' },
        controls: [{ type: 'select', global: 'lang', values: ['de', 'en'] }],
        transform: [{ type: 'lookup', column: 'land', data: 'names.csv', key: 'code', value: '{lang}', as: 'label' }],
        dims: { c: { column: 'label', fromData: true, legend: {} }, x: 'year' },
        marks: [],
    };
    const lookupRows = [{ land: 'W', year: 1 }, { land: 'T', year: 1 }];
    const names = { 'http://localhost:3000/names.csv': 'code,de,en\nW,Wien,Vienna\nT,Tirol,Tyrol\n' };

    test('the categories of the data of a column of the globals', async () => {
        serve(names);
        const store = createStore();
        await store.init({ def: lookupDef, data: lookupRows });
        expect(store.def.dims.c.keys).toEqual(['Tirol', 'Wien']);
        store.setGlobals({ lang: 'en' });
        expect(store.def.dims.c.keys).toEqual(['Tyrol', 'Vienna']);
        expect(store.data.map(r => r.c)).toEqual(['Vienna', 'Tyrol']);
        expect(store.prop('c', 'Vienna')).toMatchObject({ name: 'Vienna', visible: true });
    });

    test('the categories of the data of the globals of the page at the load', async () => {
        serve(names);
        const store = createStore();
        await store.init({ def: lookupDef, data: lookupRows, globals: { lang: 'en' } });
        expect(store.def.dims.c.keys).toEqual(['Tyrol', 'Vienna']);
    });

    test('the globals of an entry select the entry of a later control', async () => {
        const store = createStore();
        await store.init({ def: {
            globals: { a: '2', b: 'x' },
            controls: [
                { type: 'select', global: 'a', values: [{ value: '1', globals: { b: 'y' } }, '2'] },
                { type: 'select', global: 'b', values: ['x', 'y'] },
            ],
            dims: { y: "=match(@b, {x: 'cx', y: 'cy'})" }, marks: [],
        }, data: [{ cx: 1, cy: 2 }] });
        expect(store.def.dims.y.column).toBe('cx');
        store.def.globals.a = '1';
        store.applyControls();
        expect(store.def.dims.y.column).toBe('cy');
        expect(store.data[0].y).toBe(2);
    });

    // review of 5.0: the entry kept setting the global, the other control snapped back
    test('the globals of an entry are set when it becomes selected, the other control stays free', async () => {
        const def = () => ({
            globals: { unit: 'v', yr: '2022', label: '' },
            controls: [
                { type: 'radio', global: 'unit', values: [{ value: 'v', globals: { yr: '2020', label: 'V' } }, { value: 'w', globals: { yr: '2021', label: 'W' } }] },
                { type: 'select', global: 'yr', values: ['2020', '2021', '2022'] },
            ],
            dims: { y: 'v' }, marks: [],
        });
        const store = createStore();
        await store.init({ def: def(), data: [{ v: 1 }] });
        // the initial entry sets it at the load
        expect(store.def.globals).toEqual({ unit: 'v', yr: '2020', label: 'V' });
        // the user chooses another year: it stays
        store.def.globals.yr = '2022';
        store.applyControls();
        expect(store.def.globals.yr).toBe('2022');
        expect(store.state).toEqual({ globals: { yr: '2022' } });
        // another unit sets its year, a global without a control follows the entry
        store.def.globals.unit = 'w';
        store.applyControls();
        expect(store.def.globals).toEqual({ unit: 'w', yr: '2021', label: 'W' });
        store.def.globals.yr = '2020';
        store.applyControls();
        expect(store.def.globals).toEqual({ unit: 'w', yr: '2020', label: 'W' });
        // a state has the globals of both controls, also of a year of the defaults
        store.setState({ globals: { unit: 'w', yr: '2022' } });
        expect(store.def.globals).toEqual({ unit: 'w', yr: '2022', label: 'W' });
        store.setState({ globals: { unit: 'w' } });
        expect(store.def.globals).toEqual({ unit: 'w', yr: '2020', label: 'W' });
        store.setState(null);
        expect(store.def.globals).toEqual({ unit: 'v', yr: '2020', label: 'V' });
        // also of the load
        const again = createStore();
        await again.init({ def: def(), data: [{ v: 1 }], state: { globals: { unit: 'w' } } });
        expect(again.def.globals).toEqual({ unit: 'w', yr: '2020', label: 'W' });
    });

    test('a radio of the coordinate system', async () => {
        const store = createStore();
        await store.init({ def: {
            ...def,
            globals: { coord: 'cartesian' },
            controls: [{ type: 'radio', global: 'coord', values: ['cartesian', 'polar'] }],
            coord: '=@coord',
        }, data: csv });
        expect(store.coord).toBe(coords.cartesian);
        store.def.globals.coord = 'polar';
        store.applyControls();
        expect(store.def.coord).toBe('polar');
        expect(store.coord).toBe(coords.polar);
        store.def.globals.coord = 'cartesian';
        store.applyControls();
        expect(store.coord).toBe(coords.cartesian);

        // the one of a value which is not the first, selected at the load
        const polar = createStore();
        await polar.init({ def: { ...def, globals: { coord: 'polar' }, controls: [{ type: 'radio', global: 'coord', values: ['cartesian', 'polar'] }],
            coord: "=match(@coord, {polar: 'polar'})" }, data: csv });
        expect(polar.coord).toBe(coords.polar);
    });

    test('a radio of the geometry of a map', async () => {
        const topo = (object, ids) => JSON.stringify({ type: 'Topology', objects: { [object]: { type: 'GeometryCollection',
            geometries: ids.map(id => ({ type: 'Polygon', id, arcs: [[0]] })) } }, arcs: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] });
        const requested = [];
        const files = { 'http://localhost:3000/states.json': topo('states', ['W', 'T']), 'http://localhost:3000/districts.json': topo('districts', ['901', '701', '702']) };
        vi.stubGlobal('fetch', async url => {
            requested.push(url);
            return new Response(files[url]);
        });
        const store = createStore();
        await store.init({ def: {
            coord: 'geo',
            globals: { level: 'states' },
            geo: "=match(@level, {districts: literal({data: 'districts.json', join: 'region'})}, literal({data: 'states.json', join: 'region'}))",
            controls: [{ type: 'radio', global: 'level', values: ['states', 'districts'] }],
            dims: { region: 'region' },
            marks: [{ type: 'base' }],
        }, data: [{ region: 'W' }] });
        expect(requested.sort()).toEqual(['http://localhost:3000/districts.json', 'http://localhost:3000/states.json']);
        expect(store.geo.features.map(store.geo.key)).toEqual(['W', 'T']);
        store.def.globals.level = 'districts';
        store.applyControls();
        expect(store.geo.features.map(store.geo.key)).toEqual(['901', '701', '702']);
        store.def.globals.level = 'states';
        store.applyControls();
        expect(store.geo.features.map(store.geo.key)).toEqual(['W', 'T']);
        expect(requested).toHaveLength(2);
    });

    test('a geometry and data of an expression of the globals are requested once the globals are resolved, not as urls as written', async () => {
        const topo = (object, ids) => JSON.stringify({ type: 'Topology', objects: { [object]: { type: 'GeometryCollection',
            geometries: ids.map(id => ({ type: 'Polygon', id, arcs: [[0]] })) } }, arcs: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] });
        const requested = [];
        const files = { 'http://localhost:3000/states.json': topo('states', ['W', 'T']), 'http://localhost:3000/districts.json': topo('districts', ['901', '701', '702']),
            'http://localhost:3000/regions-states.csv': 'region\nW\n', 'http://localhost:3000/plain.csv': 'region\nT\n' };
        vi.stubGlobal('fetch', async url => {
            requested.push(url);
            return url in files ? new Response(files[url]) : new Response('', { status: 404, statusText: 'Not Found' });
        });
        const map = more => ({
            coord: 'geo',
            globals: { level: 'states' },
            controls: [{ type: 'radio', global: 'level', values: ['states', 'districts'] }],
            dims: { region: 'region' },
            marks: [{ type: 'base' }],
            ...more,
        });
        const store = createStore();
        await store.init({ def: map({ geo: { data: "=match(@level, {districts: 'districts.json'}, 'states.json')", join: 'region' }, data: "=match(@level, {states: 'regions-states.csv'})" }) });
        // no request of the text of the expressions, e.g. http://localhost:3000/=match(@level,…
        expect(requested.sort()).toEqual(['http://localhost:3000/districts.json', 'http://localhost:3000/regions-states.csv', 'http://localhost:3000/states.json']);
        expect(store.geo.features.map(store.geo.key)).toEqual(['W', 'T']);
        // plain urls, each once
        clearCache();
        requested.length = 0;
        await createStore().init({ def: map({ geo: { data: 'states.json', join: 'region' }, data: 'plain.csv' }) });
        expect(requested.sort()).toEqual(['http://localhost:3000/plain.csv', 'http://localhost:3000/states.json']);
    });

    test('an error of the data and of the parts is the one of the load, not an unhandled one', async () => {
        const unhandled = [];
        const listener = e => unhandled.push(e);
        process.on('unhandledRejection', listener);
        onTestFinished(() => process.off('unhandledRejection', listener));
        const failing = { ...def, data: undefined, controls: [{ global: 'c', values: ['x'] }], coord: "=match(@c, {x: 'unknown'})" };
        await expect(createStore().init({ def: failing })).rejects.toThrow();
        await new Promise(r => setTimeout(r, 10));
        expect(unhandled).toEqual([]);
    });
});

describe('controls of the values of a column (review of 4.1)', () => {
    const binDef = () => ({ globals: { step: '5' },
        transform: [{ type: 'bin', column: 'v', step: '{step}', start: 'lo', end: 'hi' }],
        controls: [{ type: 'select', global: 'lo', values: { column: 'lo' } }],
        dims: { x: 'v', y: 'count' },
        marks: { type: 'bar', x0: 'lo', x1: 'hi' } });
    const binData = 'v,g\n1,a\n3,a\n7,b\n9,b';

    test('a global which is none of the values of other classes is the last one', async () => {
        const s = createStore();
        await s.init({ def: binDef(), data: binData, globals: { step: '2' } });
        expect(s.def.controls[0].values.map(v => v.value)).toEqual(['0', '2', '4', '6', '8']);
        expect(s.def.globals.lo).toBe('8');
        const t = createStore();
        await t.init({ def: binDef(), data: binData });
        t.setGlobals({ step: '3' });
        expect(t.def.controls[0].values.map(v => v.value)).toEqual(['0', '3', '6']);
        expect(t.def.globals.lo).toBe('6');
    });

    test('a global of the page stays, also one which is none of the values', async () => {
        const s = createStore();
        await s.init({ def: binDef(), data: binData, globals: { step: '2', lo: '5' } });
        expect(s.def.globals.lo).toBe('5');
    });

    const monthDef = (format, language) => ({ width: 500, height: 300, language, globals: { lang: 'de', m: '2026-10' },
        controls: [{ type: 'select', global: 'm', values: { column: 'month', format } }],
        dims: { x: { column: 'month', type: 'categorical' }, y: 'value' },
        marks: { type: 'bar' } });
    const monthData = 'month,value\n2026-09,1\n2026-10,2';
    const names = s => s.def.controls[0].values.map(v => v.name);

    test('the names of a format in the language of the definition, also of a format per language', async () => {
        let s = createStore();
        await s.init({ def: monthDef('%B', 'en'), data: monthData });
        expect(names(s)).toEqual(['September', 'October']);
        s = createStore();
        await s.init({ def: monthDef({ de: '%B %Y', en: '%B, %Y' }, 'en'), data: monthData });
        expect(names(s)).toEqual(['September, 2026', 'October, 2026']);
    });

    test('the names of another language of a global', async () => {
        const s = createStore();
        await s.init({ def: monthDef('%B', '@lang'), data: monthData });
        expect(names(s)).toEqual(['September', 'Oktober']);
        s.setGlobals({ lang: 'en' });
        expect(names(s)).toEqual(['September', 'October']);
    });
});

describe('the type of a dim of a column of a transform of a global (review of 5.0)', () => {
    const indexDef = () => ({
        $schema: schema,
        globals: { measure: 'value' },
        transform: [{ type: 'index', column: '{measure}', base: { year: '2000' }, as: '{measure}_idx' }],
        dims: { x: 'year', y: '{measure}_idx' },
        controls: [{ type: 'select', global: 'measure', values: ['value', 'other'] }],
        marks: { type: 'line' },
    });
    const indexData = 'year,value,other\n2000,1,2\n2001,2,8\n2002,4,16';

    test('numeric of another value of its control, the values are numbers', async () => {
        const s = createStore();
        await s.init({ def: indexDef(), data: indexData });
        expect(s.def.dims.y).toMatchObject({ column: 'value_idx', type: 'numeric' });
        expect(s.data.map(r => r.y)).toEqual([100, 200, 400]);
        s.setState({ globals: { measure: 'other' } });
        expect(s.def.dims.y).toMatchObject({ column: 'other_idx', type: 'numeric' });
        expect(s.data.map(r => r.y)).toEqual([100, 400, 800]);
        s.setState({ globals: { measure: 'value' } });
        expect(s.def.dims.y).toMatchObject({ column: 'value_idx', type: 'numeric' });
        expect(s.data.map(r => r.y)).toEqual([100, 200, 400]);
    });

    test('also of a visualisation of that state and of the globals of the page', async () => {
        const s = createStore();
        await s.init({ def: indexDef(), data: indexData, state: { globals: { measure: 'other' } } });
        expect(s.def.dims.y).toMatchObject({ column: 'other_idx', type: 'numeric' });
        expect(s.data.map(r => r.y)).toEqual([100, 400, 800]);
        const t = createStore();
        await t.init({ def: indexDef(), data: indexData, globals: { measure: 'other' } });
        expect(t.def.dims.y.type).toBe('numeric');
        expect(t.data.map(r => r.y)).toEqual([100, 400, 800]);
    });
});

describe('charts of the same data file share its rows (review of 5.0)', () => {
    const lineDef = (more = {}) => ({ ...def, ...more });
    const base = document.baseURI;

    test('the file is requested and read once, the rows are the same list', async () => {
        const fetched = [];
        vi.stubGlobal('fetch', async url => {
            fetched.push(url);
            return new Response('year,value\n2020,1\n2021,2\n2022,3');
        });
        const a = createStore();
        const b = createStore();
        await Promise.all([a.init({ def: lineDef() }), b.init({ def: lineDef({ width: 300, height: 200 }) })]);
        const c = createStore();
        await c.init({ def: lineDef({ dims: { x: 'year', y: 'value' } }) });
        expect(fetched).toHaveLength(1);
        expect(b.rows).toBe(a.rows);
        expect(c.rows).toBe(a.rows);
        expect(c.def.dims.y.type).toBe('numeric');
        // the rows of the dims are the ones of each chart
        expect(b.data).not.toBe(a.data);
        expect(b.data).toEqual(a.data);
        // after the cache new rows
        clearCache();
        const d = createStore();
        await d.init({ def: lineDef() });
        expect(fetched).toHaveLength(2);
        expect(d.rows).not.toBe(a.rows);
        expect(d.rows).toEqual(a.rows);
    });

    test('the warnings of the data are the ones of every chart, also the header of a file without rows', async () => {
        serve({ [new URL('data.csv', base).href]: 'year,value,value\n2020,1,2\n', [new URL('empty.csv', base).href]: 'year,value\n' });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const a = createStore();
        await a.init({ def: lineDef() });
        const b = createStore();
        await b.init({ def: lineDef() });
        const twice = warn.mock.calls.map(c => c[0]).filter(m => m.includes("the column 'value' is in the header 2 times"));
        expect(twice).toHaveLength(2);
        expect(b.rows).toBe(a.rows);
        warn.mockClear();
        for (const store of [createStore(), createStore()])
            await store.init({ def: lineDef({ data: 'empty.csv' }) });
        expect(warn.mock.calls.map(c => c[0]).filter(m => m.includes("no rows (only the header 'year', 'value')"))).toHaveLength(2);
    });

    test('data which can not be read is the error of every chart', async () => {
        serve({ [new URL('data.csv', base).href]: '<!doctype html><html></html>' });
        for (const store of [createStore(), createStore()])
            await expect(store.init({ def: lineDef() })).rejects.toThrow(`Could not read the data '${new URL('data.csv', base).href}': it is a page of HTML`);
    });

    test('parquet by the columns which are read, a chart of other columns reads them', async () => {
        const buffer = parquetWriteBuffer({ columnData: [
            { name: 'year', data: [2020, 2021], type: 'DOUBLE' },
            { name: 'value', data: [1, 2], type: 'DOUBLE' },
            { name: 'other', data: [10, 20], type: 'DOUBLE' },
        ] });
        serve({ [new URL('data.parquet', base).href]: buffer });
        const stores = [createStore(), createStore(), createStore()];
        const y = column => ({ ...def.dims, y: { ...def.dims.y, column } });
        await stores[0].init({ def: lineDef({ data: 'data.parquet' }) });
        await stores[1].init({ def: lineDef({ data: 'data.parquet' }) });
        await stores[2].init({ def: lineDef({ data: 'data.parquet', dims: y('other') }) });
        expect(stores[1].rows).toBe(stores[0].rows);
        expect(Object.keys(stores[0].rows[0])).toEqual(['year', 'value']);
        expect(Object.keys(stores[2].rows[0])).toEqual(['year', 'other']);
        expect(stores[2].data.map(r => r.y)).toEqual([10, 20]);
    });

    test('a chart does not change the shared rows, e.g. of its transforms and of a change of its globals', async () => {
        serve({ [new URL('data.csv', base).href]: 'year,value\n2020,1\n2021,2\n2022,4' });
        const withTransform = () => lineDef({ globals: { factor: 2 },
            transform: [{ type: 'calc', expr: { '*': ['@value', '@factor'] }, as: 'value' }, { type: 'filter', expr: { '>': ['@year', 2020] } }] });
        const a = createStore();
        await a.init({ def: lineDef() });
        const before = JSON.stringify(a.rows);
        const b = createStore();
        await b.init({ def: withTransform() });
        b.setGlobals({ factor: 10 });
        expect(b.rows).toBe(a.rows);
        expect(b.data.map(r => r.y)).toEqual([10, 20, 40]);
        expect(b.columns.kept).toEqual([1, 2]);
        expect(JSON.stringify(a.rows)).toBe(before);
        expect(a.data.map(r => r.y)).toEqual([1, 2, 4]);
    });
});
