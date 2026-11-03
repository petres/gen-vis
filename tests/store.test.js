// @vitest-environment jsdom
import { describe, test, expect, vi, afterEach, onTestFinished } from 'vitest';
import { createStore } from '@/store';
import { resolveUrl, resolveParents, clearCache, requirements } from '@/utils/load';
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
const schema = 'https://unpkg.com/@preschen/gen-vis@4/schema.json';

const def = {
    $schema: schema,
    data: 'data.csv',
    options: { width: 500, height: 300 },
    mapping: {
        x: { column: 'year', type: 'numeric', scale: { orientation: 'horizontal' } },
        y: { column: 'value', type: 'numeric', scale: { orientation: 'vertical' } },
    },
    plot: { type: 'cartesian:line', props: { d: { x: '@x:scaled', y: '@y:scaled' } } },
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
            { $schema: schema, parent: '../shared/base.json', options: { width: 3 }, plot: [{ type: 'b' }] },
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
            { $schema: schema, parent: ['../lines.json', '../facets.json'], options: { title: 'def' } },
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

    test('a file of a definition declares gen-vis 4 by its $schema, in itself or in a parent, an inline one may omit it', async () => {
        const load = files => url => files[url];
        const of = s => JSON.stringify({ $schema: s, options: {} });
        // the major version of unpkg or jsdelivr, a full one or the schema of the installed package
        for (const s of [schema, 'https://unpkg.com/@preschen/gen-vis@4.1.0/schema.json', 'https://cdn.jsdelivr.net/npm/@preschen/gen-vis@4.0.0-beta.1/schema.json',
            '../../node_modules/@preschen/gen-vis/schema.json'])
            expect((await resolveParents({ $schema: s }, 'http://h/a.json')).$schema).toBe(s);
        // in a parent
        expect((await resolveParents({ parent: 'p.json' }, 'http://h/a.json', load({ 'http://h/p.json': of(schema) }))).$schema).toBe(schema);
        // an inline definition without one, its parents need none
        expect(await resolveParents({ parent: 'p.json', options: { title: 'a' } }, undefined, () => '{}')).toEqual({ parent: 'p.json', options: { title: 'a' } });
        const error = what => `'http://h/a.json' is no definition of gen-vis 4: ${what}, e.g. "$schema": "${schema}", see the changelog of gen-vis 4.0.0 of the changes of the definitions`;
        await expect(resolveParents({ options: {} }, 'http://h/a.json')).rejects.toThrow(error('its $schema is missing'));
        await expect(resolveParents({ $schema: 'https://unpkg.com/@preschen/gen-vis@3/schema.json' }, 'http://h/a.json')).rejects.toThrow(error('its $schema is the one of gen-vis 3'));
        await expect(resolveParents({ $schema: 'https://unpkg.com/@preschen/gen-vis/schema.json' }, 'http://h/a.json'))
            .rejects.toThrow(error('its $schema "https://unpkg.com/@preschen/gen-vis/schema.json" names no major version of gen-vis'));
        await expect(resolveParents({ $schema: 'https://vega.github.io/schema/vega-lite/v5.json' }, 'http://h/a.json'))
            .rejects.toThrow(error('its $schema "https://vega.github.io/schema/vega-lite/v5.json" is none of gen-vis'));
        // every part with one, also a parent of a file with the one of 4 and of an inline definition
        await expect(resolveParents({ $schema: schema, parent: 'p.json' }, 'http://h/a.json', load({ 'http://h/p.json': of('https://unpkg.com/@preschen/gen-vis@3/schema.json') })))
            .rejects.toThrow("'http://h/p.json' is no definition of gen-vis 4: its $schema is the one of gen-vis 3");
        await expect(resolveParents({ $schema: 'https://unpkg.com/@preschen/gen-vis@3.1.0/schema.json' }, undefined))
            .rejects.toThrow('the inline definition is no definition of gen-vis 4: its $schema is the one of gen-vis 3');
        // the load of a file
        serve({ 'http://h/data/def.json': JSON.stringify({ ...def, $schema: undefined }), 'http://h/data/data.csv': csv });
        await expect(createStore().init({ defUrl: 'http://h/data/def.json' })).rejects.toThrow("'http://h/data/def.json' is no definition of gen-vis 4: its $schema is missing");
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
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        onTestFinished(() => vi.useRealTimers());
        const stores = [createStore(), createStore()];
        await Promise.all(stores.map(s => s.init({ defUrl: 'http://h/data/def.json' })));
        expect(requested).toEqual(['http://h/data/def.json', 'http://h/data/data.csv', 'http://h/data/base.json']);
        expect(stores.map(s => s.def.options.title)).toEqual(['base', 'base']);

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
        // the rows are plain objects
        expect(Object.getPrototypeOf(store.data[0])).toBe(Object.prototype);
    });

    test('inline def and data', async () => {
        const store = createStore();
        await store.init({ def: JSON.stringify({ ...def, data: undefined }), data: [{ year: 1, value: 2 }] });
        expect(store.defUrl).toBe(null);
        expect(store.data).toEqual([{ x: 1, y: 2 }]);
    });

    // the legend of a scale of colors, of the definition or of a patch of a form element
    test('loads the legend of a scale of colors', async () => {
        const color = { column: 'value', type: 'numeric', scale: { type: 'sequential', interpolator: 'Blues' } };
        const withLegend = createStore();
        await withLegend.init({ def: { ...def, data: undefined, mapping: { ...def.mapping, color: { ...color, legend: {} } } }, data: csv });
        expect(withLegend.colorLegend).not.toBe(null);

        const patched = createStore();
        await patched.init({ def: { ...def, data: undefined, mapping: { ...def.mapping, color },
            globals: { legend: 'no' },
            formElements: [{ id: 'legend', ref: 'legend', type: 'radio', values: [
                { id: 'no', value: 'no' },
                { id: 'yes', value: 'yes', patch: { mapping: { color: { legend: {} } } } },
            ] }] }, data: csv });
        expect(patched.colorLegend).not.toBe(null);

        const without = createStore();
        await without.init({ def: { ...def, data: undefined, mapping: { ...def.mapping, color } }, data: csv });
        expect(without.colorLegend).toBe(null);
    });

    // the transforms of a patch, the definition has none
    test('the transforms of a patch of a form element', async () => {
        const store = createStore();
        await store.init({ def: { ...def, data: undefined,
            mapping: { ...def.mapping, y: { column: 'sum', type: 'numeric', scale: { orientation: 'vertical' } } },
            globals: { mode: 'sum' },
            formElements: [{ id: 'mode', ref: 'mode', type: 'radio', values: [
                { id: 'value', value: 'value' },
                { id: 'sum', value: 'sum', patch: { transform: [{ type: 'cumulative', column: 'value', as: 'sum' }] } },
            ] }] }, data: 'year,value\n2020,1\n2021,2' });
        expect(store.data.map(r => r.y)).toEqual([1, 3]);
    });

    // only with `check`, the check is not loaded otherwise
    test('warnings for the definition', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const wrong = { ...def, plot: { ...def.plot, type: 'path' } };
        await createStore().init({ def: wrong, data: csv });
        expect(warn).not.toHaveBeenCalled();
        const store = createStore();
        await store.init({ def: wrong, data: csv, check: true });
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^gen-vis inline definition: plot\[0\]\.type: unknown type 'path'/));
    });

    // the check reads the definition, not the normalized one, e.g. of the
    // default props
    test('no warnings of a definition of the parts of 4.0', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const short = { mapping: { x: 'year', y: 'value', k: { column: 'k', categories: { a: { color: 'red' } } } },
            plot: { type: 'line', by: 'k', highlight: { 'stroke-width': 3 } } };
        await createStore().init({ def: short, data: 'year,value,k\n2020,1,a\n2021,2,a', check: true });
        expect(warn).not.toHaveBeenCalled();
    });

    // the check has the rows, e.g. of years as numbers of a date mapping,
    // and warns also if the data could not be loaded
    test('warnings of the rows and of a failed load', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const dated = { mapping: { x: { column: 'year', type: 'date' }, y: { column: 'value' } }, plot: { type: 'cartesian:line' } };
        await createStore().init({ def: dated, data: [{ year: 2020, value: 1 }], check: true });
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/mapping\.x\.type: the values of 'year' are numbers, e\.g\. 2020/));
        warn.mockClear();
        const wrong = { ...def, data: 'http://h/missing.csv', plot: { ...def.plot, type: 'path' } };
        await expect(createStore().init({ def: wrong, check: true })).rejects.toThrow(/Could not load/);
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/plot\[0\]\.type: unknown type 'path'/));
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
            'http://h/a/def.json': JSON.stringify({ ...def, options: { title: 'a' } }),
            'http://h/a/data.csv': csv,
            'http://h/b/def.json': JSON.stringify({ ...def, options: { title: 'b' } }),
            'http://h/b/data.csv': csv,
        }, { 'http://h/b/data.csv': 30 });
        const store = createStore();
        await store.init({ defUrl: 'http://h/a/def.json' });
        expect([store.loaded, store.loading, store.loads]).toEqual([true, false, 1]);
        const loading = store.init({ defUrl: 'http://h/b/def.json' });
        expect([store.loaded, store.loading, store.def.options.title]).toEqual([true, true, 'a']);
        await loading;
        expect([store.loaded, store.loading, store.loads, store.def.options.title]).toEqual([true, false, 2, 'b']);
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

describe('requirements', () => {
    const entries = patches => [{ id: 'e', ref: 'e', values: patches.map((patch, i) => ({ value: String(i), patch })) }];

    test('nothing of a plain definition but the coordinate system and the locale', () => {
        expect(requirements(def)).toEqual({
            colors: false, coords: [undefined], geo: false, transforms: false, colorLegend: false, locales: [undefined],
        });
    });

    test('the parts of the definition', () => {
        const need = requirements({
            options: { coord: 'polar', transition: 300, locale: 'de' },
            geo: { data: 'map.json' },
            transform: { type: 'share', column: 'value', as: 'share' },
            mapping: {
                c: { column: 'c', scale: { type: 'sequential', interpolator: 'Blues' }, legend: {} },
                k: { column: 'k', scheme: 'Tableau10', fromData: true, legend: {} },
            },
        });
        expect(need).toEqual({ colors: true, coords: ['polar'], geo: true, transforms: true, colorLegend: true, locales: ['de'] });
        expect(requirements({ mapping: { c: { scale: { scheme: 'Blues' } } } }).colors).toBe(true);
        expect(requirements({ mapping: { k: { scheme: 'Tableau10' } } }).colors).toBe(true);
        // a legend of categories is no legend of colors
        expect(requirements({ mapping: { k: { fromData: true, legend: {} } } }).colorLegend).toBe(false);
    });

    test('the parts of the patches of form elements', () => {
        const need = requirements({ ...def, formElements: entries([
            { mapping: { c: { scale: { interpolator: 'Reds' }, legend: {} } } },
            { transform: [{ type: 'rank', column: 'value', as: 'rank' }], options: { transition: true, locale: 'en' } },
            null,
            { mapping: { y: null } },
        ]) });
        expect(need).toEqual({ colors: true, coords: [undefined], geo: false, transforms: true, colorLegend: true, locales: [undefined, 'en'] });
    });

    test('a name of a color which is no part of a scale or of props needs no colors', () => {
        expect(requirements({ options: { title: '"scheme": "Blues"' }, mapping: { c: { column: 'interpolator' } } }).colors).toBe(false);
    });
});

describe('the entry for scripts', () => {
    test('merges and checks definitions', async () => {
        const check = await import('@/check');
        const merged = await check.resolveParents({ parent: 'base.json' }, 'http://h/def.json', () => JSON.stringify(def));
        expect(check.validateDef(merged)).toEqual([]);
    });
});

describe('form elements of globals, coordinate systems and maps', () => {
    const lookupDef = {
        globals: { lang: 'de' },
        formElements: [{ ref: 'lang', type: 'select', values: [{ value: 'de' }, { value: 'en' }] }],
        transform: [{ type: 'lookup', column: 'land', data: 'names.csv', key: 'code', value: '{lang}', as: 'label' }],
        mapping: { c: { column: 'label', fromData: true, legend: {} }, x: { column: 'year', type: 'numeric' } },
        plot: [],
    };
    const lookupRows = [{ land: 'W', year: 1 }, { land: 'T', year: 1 }];
    const names = { 'http://localhost:3000/names.csv': 'code,de,en\nW,Wien,Vienna\nT,Tirol,Tyrol\n' };

    test('the categories of the data of a column of the globals', async () => {
        serve(names);
        const store = createStore();
        await store.init({ def: lookupDef, data: lookupRows });
        expect(store.def.mapping.c.keys).toEqual(['Tirol', 'Wien']);
        store.setGlobals({ lang: 'en' });
        expect(store.def.mapping.c.keys).toEqual(['Tyrol', 'Vienna']);
        expect(store.data.map(r => r.c)).toEqual(['Vienna', 'Tyrol']);
        expect(store.prop('c', 'Vienna')).toMatchObject({ name: 'Vienna', visible: true });
    });

    test('the categories of the data of the globals of the page at the load', async () => {
        serve(names);
        const store = createStore();
        await store.init({ def: lookupDef, data: lookupRows, globals: { lang: 'en' } });
        expect(store.def.mapping.c.keys).toEqual(['Tyrol', 'Vienna']);
    });

    test('the globals of an entry select the entry of a later form element', async () => {
        const store = createStore();
        await store.init({ def: {
            globals: { a: '2', b: 'x' },
            formElements: [
                { ref: 'a', type: 'select', values: [{ value: '1', globals: { b: 'y' } }, { value: '2' }] },
                { ref: 'b', type: 'select', values: [{ value: 'x', patch: { mapping: { y: { column: 'cx' } } } }, { value: 'y', patch: { mapping: { y: { column: 'cy' } } } }] },
            ],
            mapping: { y: { column: 'c0', type: 'numeric' } }, plot: [],
        }, data: [{ cx: 1, cy: 2, c0: 0 }] });
        store.def.globals.a = '1';
        store.applyFormElements();
        expect(store.def.mapping.y.column).toBe('cy');
        expect(store.data[0].y).toBe(2);
    });

    test('a radio of the coordinate system', async () => {
        const store = createStore();
        await store.init({ def: {
            ...def,
            globals: { coord: 'cartesian' },
            formElements: [{ ref: 'coord', type: 'radio', values: [
                { value: 'cartesian' },
                { value: 'polar', patch: { options: { coord: 'polar' }, mapping: {
                    x: { scale: { orientation: 'angular' } }, y: { scale: { orientation: 'radial' } } } } },
            ] }],
        }, data: csv });
        expect(store.coord).toBe(coords.cartesian);
        store.def.globals.coord = 'polar';
        store.applyFormElements();
        expect(store.def.options.coord).toBe('polar');
        expect(store.coord).toBe(coords.polar);
        store.def.globals.coord = 'cartesian';
        store.applyFormElements();
        expect(store.coord).toBe(coords.cartesian);

        // the one of a patch selected at the load
        const polar = createStore();
        await polar.init({ def: { ...def, globals: { coord: 'polar' }, formElements: [{ ref: 'coord', type: 'radio', values: [
            { value: 'cartesian' }, { value: 'polar', patch: { options: { coord: 'polar' } } },
        ] }] }, data: csv });
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
            options: { coord: 'geo' },
            globals: { level: 'states' },
            geo: { data: 'states.json', join: 'region' },
            formElements: [{ ref: 'level', type: 'radio', values: [
                { value: 'states' },
                { value: 'districts', patch: { geo: { data: 'districts.json' } } },
            ] }],
            mapping: { region: { column: 'region' } },
            plot: [{ type: 'geo:base' }],
        }, data: [{ region: 'W' }] });
        expect(requested.sort()).toEqual(['http://localhost:3000/districts.json', 'http://localhost:3000/states.json']);
        expect(store.geo.features.map(store.geo.key)).toEqual(['W', 'T']);
        store.def.globals.level = 'districts';
        store.applyFormElements();
        expect(store.geo.features.map(store.geo.key)).toEqual(['901', '701', '702']);
        store.def.globals.level = 'states';
        store.applyFormElements();
        expect(store.geo.features.map(store.geo.key)).toEqual(['W', 'T']);
        expect(requested).toHaveLength(2);
    });

    test('an error of the data and of the parts is the one of the load, not an unhandled one', async () => {
        const unhandled = [];
        const listener = e => unhandled.push(e);
        process.on('unhandledRejection', listener);
        onTestFinished(() => process.off('unhandledRejection', listener));
        const failing = { ...def, data: undefined, formElements: [{ ref: 'c', values: [{ value: 'x', patch: { options: { coord: 'unknown' } } }] }] };
        await expect(createStore().init({ def: failing })).rejects.toThrow();
        await new Promise(r => setTimeout(r, 10));
        expect(unhandled).toEqual([]);
    });
});
