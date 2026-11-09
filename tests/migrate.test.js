import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { migrate, conditionExpression } from '@/utils/migrate.js';
import { translate } from '@/utils/language.js';
import { resolve, variants } from '@/utils/resolve.js';
import { normalize } from '@/utils/normalize.js';
import { parseExpression } from '@/utils/expr-parse.js';
import { isOperator } from '@/utils/expr.js';
import { resolveParents } from '@/utils/load.js';
import { plotTypes } from '@/plots';
import { definitions } from '@/dev/definitions.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// the definitions of 4.x of data/ as they were before their migration, with their parents
const files = definitions(Object.fromEntries(Object.entries(import.meta.glob('./fixtures/v4/**/*.json', { eager: true, import: 'default' }))
    .map(([file, def]) => [file.replace('./fixtures/v4/', 'data/'), def]))).map(d => `tests/fixtures/v4/${d.path}`);
const load = async url => readFileSync(fileURLToPath(url), 'utf8');
const merged = async file => resolveParents(JSON.parse(readFileSync(path.join(root, file), 'utf8')), pathToFileURL(path.join(root, file)).href, load);

// the conditions of the filters of 4.x and the objects of 5.0 as expressions
const conditions = v => v && typeof v == 'object' && !Array.isArray(v) && !isOperator(v) ? parseExpression(String(conditionExpression(v)).replace(/^=/, '')) : v;

// the parts which 5.0 writes differently but means the same
const same = def => JSON.parse(JSON.stringify(def, function (k, v) {
    if ((k == 'filter' || k == 'stacked') && this.column !== undefined || k == 'filter' && (this.type !== undefined || this.mapping !== undefined || this.box !== undefined || this.title !== undefined))
        v = conditions(v);
    if (k == 'by' && Array.isArray(v) && v.length == 0)
        return undefined;
    if (k == 'fromData' || k == 'domainRel' || k == 'pad' || k == '$schema')
        return undefined;
    // a legend of 4.x without a symbol has none in 5.0 (`null`), the default is the one of the plots
    if (k == 'symbol' && (v === null || (v && v.elements)))
        return undefined;
    if (k == 'hover' && v && typeof v == 'object' && Object.keys(v).length == 0 && this.footer !== undefined)
        return undefined;
    if (k == 'id' && typeof v == 'string' && /^plot-\d+$/.test(v))
        return undefined;
    if (k == 'by' && typeof v == 'string')
        return [v];
    if (k == 'plot' && v && !Array.isArray(v))
        return [v];
    if (['cx', 'cy', 'angle', 'x', 'y'].includes(k) && typeof v == 'string' && v.endsWith(':scaled:center'))
        return v.replace(/:center$/, '');
    if ((k == 'stroke' || k == 'fill') && v && v.or && v.or[0] == '@color')
        return '@color';
    return v;
}));

describe('the migration of the definitions of 4.x', () => {
    test('the conditions of filters as expressions', () => {
        expect(conditionExpression({ year: '@year' })).toBe('@year == @globals.year');
        // the filter of a definition keeps conditions of values as an object, the shorthand of 5.0
        expect(conditionExpression({ year: '@year', land: ['Wien', 'Tirol'] }, true)).toEqual({ year: '@globals.year', land: ['Wien', 'Tirol'] });
        expect(conditionExpression({ year: '@year', y: { not: null } }, true)).toBe('@year == @globals.year and @y != null');
        expect(conditionExpression({ type: { not: 'load' }, land: ['Wien', 'Tirol'] })).toBe("@type != 'load' and (@land == 'Wien' or @land == 'Tirol')");
        expect(conditionExpression({ value: { range: [0, null] } })).toBe('@value >= 0');
        expect(conditionExpression({ d: { range: [1, 22] } })).toBe('=1 <= @d <= 22');
        expect(conditionExpression({ y: { not: null } })).toBe('@y != null');
        expect(conditionExpression({ d: { range: ['2020-01-01', '2020-12-31'] } })).toBe("='2020-01-01' <= @d <= '2020-12-31'");
    });

    test('the README example', () => {
        const def = migrate({
            data: 'data.csv',
            transform: [{ type: 'filter', expr: { '!=': ['@Bundesland', 'ÖSTERREICH'] } }],
            options: { title: 'Bevölkerung nach Bundesland', height: 300, margins: { top: 10, right: 10, bottom: 30, left: 80 } },
            mapping: {
                x: { column: 'Jahr', format: 'c' },
                y: { column: 'Einwohner', format: ',.0f', domain: [0, null], axis: { grid: true } },
                land: { column: 'Bundesland', fromData: true, scheme: 'Tableau10', legend: { symbol: 'line', onlyData: true } },
            },
            plot: { type: 'line', by: 'land', props: { 'stroke-width': 2 }, highlight: { 'stroke-width': 4 } },
        });
        expect(def).toEqual({
            $schema: 'https://unpkg.com/@preschen/gen-vis@5/schema.json',
            data: 'data.csv',
            transform: [{ type: 'filter', expr: "@Bundesland != 'ÖSTERREICH'" }],
            title: 'Bevölkerung nach Bundesland', height: 300, margins: { top: 10, right: 10, bottom: 30, left: 80 },
            // the dims of the marks' `by` are in the hover by default, the definition of 4.x had none
            hover: { columns: [] },
            dims: {
                x: { column: 'Jahr', format: 'c' },
                y: { column: 'Einwohner', format: ',.0f', zero: true, grid: true },
                land: { column: 'Bundesland', fromData: true, scheme: 'Tableau10', legend: { symbol: 'line', onlyData: true } },
            },
            marks: { type: 'line', by: 'land', 'stroke-width': 2, highlight: { 'stroke-width': 4 } },
        });
    });

    test('patches of form elements are expressions of the globals', () => {
        const def = migrate({
            globals: { scale: 'lin' },
            formElements: [{ id: 'scale', ref: 'scale', type: 'radio', values: [
                { id: 'lin', name: 'linear', value: 'lin' },
                { id: 'log', name: 'log', value: 'log', patch: { mapping: { y: { scale: { type: 'log' } } }, options: { subtitle: 'log' } } },
            ] }],
            options: { subtitle: 'linear' },
            mapping: { y: { column: 'v', scale: { type: 'linear' } } },
        });
        expect(def.controls).toEqual([{ type: 'radio', global: 'scale', id: 'scale', values: [{ id: 'lin', name: 'linear', value: 'lin' }, { id: 'log', name: 'log', value: 'log' }] }]);
        expect(def.subtitle).toBe("=match(@scale, {log: 'log'}, 'linear')");
        expect(def.dims.y.scale.type).toBe("=match(@scale, {log: 'log'}, 'linear')");
        // resolved with the global
        expect(translate(resolve(def, { scale: 'log' })).mapping.y.scale.type).toBe('log');
        expect(translate(resolve(def, { scale: 'lin' })).options.subtitle).toBe('linear');
    });

    test('a child with a parent: the patches of both, their globals and the leaves of the child', () => {
        const parents = {
            globals: { v: 'a' },
            formElements: [{ id: 'v', ref: 'v', type: 'radio', values: [
                { id: 'a', name: 'A', value: 'a' },
                { id: 'b', name: 'B', value: 'b', patch: { mapping: { y: { column: 'b', scale: { domainRel: [0, 0.1] } } }, options: { subtitle: 'B' } } },
            ] }],
            options: { subtitle: 'A' },
            mapping: { y: { column: 'a', axis: { format: '.0f' } } },
        };
        const child = {
            parent: 'parent.json',
            formElements: [{ id: 'v', values: [{ id: 'b', patch: { mapping: { y: { axis: { format: '.0%' } } }, options: { title: 'B' } } }] }],
            options: { title: 'Child' },
            mapping: { y: { axis: { format: '.1f' } } },
        };
        const def = migrate(child, { parents });
        // the own patches with the own base
        expect(def.controls).toEqual([{ id: 'v', values: [{ id: 'b' }] }]);
        expect(def.title).toBe("=match(@v, {b: 'B'}, 'Child')");
        expect(def.dims.y.axis.format).toBe("=match(@v, {b: '.0%'}, '.1f')");
        // the leaves the parent patches are its own, a switch over the values of the merge (see leafMerge of utils/def.js)
        expect(def.dims.y.column).toBeUndefined();
        expect(def.subtitle).toBeUndefined();
        expect(def.dims.y.scale).toBeUndefined();
        const parent = migrate(parents);
        expect(parent.dims.y.column).toBe("=match(@v, {b: 'b'}, 'a')");
        expect(parent.dims.y.scale.pad).toBe("=match(@v, {b: literal([0, 0.1])})");
        expect(parent.subtitle).toBe("=match(@v, {b: 'B'}, 'A')");
        // without a ref: an error, not an expression of '@undefined'
        expect(() => migrate(child)).toThrow('formElements[0]: no ref');
    });

    test.each(files)('%s migrated and translated is the same normalized definition', async file => {
        const def4 = await merged(file);
        if (JSON.stringify(def4).includes('"patch"'))
            return;
        const a = same(normalize(def4, { plotTypes }));
        const b = same(normalize(translate(resolve(migrate(def4), {})), { plotTypes }));
        // the dims of the marks' `by` are categorical in 5.0, 4.x infers their type from the values
        Object.keys(b.mapping ?? {}).forEach(n => {
            if (a.mapping?.[n] && a.mapping[n].type === undefined && b.mapping[n].type == 'categorical') {
                delete b.mapping[n].type;
                if (a.mapping[n].scale?.type === undefined && b.mapping[n].scale)
                    delete b.mapping[n].scale.type;
            }
        });
        expect(b).toEqual(a);
    });
});

// the files of data/ were migrated one by one (`gen-vis migrate`, a child
// with its parents), the merged definition is the one of the merged 4.x
// definition for every value of the controls (a patch of a child written
// as a plain value, one of a parent as an expression, mean the same)
describe('the order of categories of a vertical scale', () => {
    test('one of 4.x without a range had its first category at the bottom: reverse keeps it, 5.0 is top-down', () => {
        const dims = def => migrate(def).dims;
        expect(dims({ mapping: { y: { column: 'land', type: 'categorical' }, x: 'v' } }).y.reverse).toBe(true);
        expect(dims({ mapping: { y: { column: 'land', categories: { a: {} } }, x: 'v' } }).y.reverse).toBe(true);
        expect(dims({ mapping: { y: { column: 'land', type: 'categorical', scale: { range: [0, '@height'] } }, x: 'v' } }).y.reverse).toBeUndefined();
        expect(dims({ mapping: { y: { column: 'v' }, x: { column: 'land', type: 'categorical' } } }).y.reverse).toBeUndefined();
        expect(dims({ options: { coord: 'polar' }, mapping: { y: { column: 'land', type: 'categorical' }, x: 'v' } }).y.reverse).toBeUndefined();
    });
});

describe('the migrated files of data/ (file by file) are the migration of the merged definitions', () => {
    const merged5 = async file => resolveParents(JSON.parse(readFileSync(path.join(root, file), 'utf8')), pathToFileURL(path.join(root, file)).href, load);
    const engine = def => variants(def).map(v => same(normalize(translate(v), { plotTypes })));
    test.each(files)('%s', async file => {
        const def4 = await merged(file);
        const def5 = await merged5(file.replace('tests/fixtures/v4/', 'data/'));
        const a = engine(migrate(def4));
        const b = engine(def5);
        expect(b.length).toBeGreaterThan(0);
        expect(b).toEqual(a);
    });
});

describe('the dims of groups of marks in the colors of their categories', () => {
    test('one of 4.x without categories keeps none: fromData false', () => {
        const def = migrate({ mapping: { x: 'year', y: 'value', land: 'land' }, plot: { type: 'cartesian:line', by: ['land'] } });
        expect(def.dims.land).toEqual({ column: 'land', fromData: false });
        expect(translate(def).mapping.land.fromData).toBeUndefined();
        // a mark of a color of its own, a dim of categories: as it is
        expect(migrate({ mapping: { x: 'year', y: 'value', land: 'land' }, plot: { type: 'cartesian:line', by: ['land'], props: { stroke: '#333' } } }).dims.land).toBe('land');
        expect(migrate({ mapping: { x: 'year', y: 'value', land: { column: 'land', fromData: true } }, plot: { type: 'cartesian:line', by: ['land'] } }).dims.land).toEqual({ column: 'land', fromData: true });
    });
});

describe('categorical dims of the migration (review of 5.0)', () => {
    test('the center of the band of a dim of the type or the scale of categories is the channel', () => {
        const marks = x => migrate({ mapping: { x, y: { column: 'v' } }, plot: { type: 'svg:text', props: { x: '@x:scaled:center', y: '@y:scaled', text: 'a' } } }).marks;
        expect(marks({ column: 'g', type: 'categorical' })).toEqual({ type: 'text', text: 'a' });
        expect(marks({ column: 'g', scale: { type: 'band' } })).toEqual({ type: 'text', text: 'a' });
        expect(marks({ column: 'g', categories: {} })).toEqual({ type: 'text', text: 'a' });
        // of a numeric dim the center is no channel
        expect(marks({ column: 'g', type: 'numeric' })).toEqual({ type: 'text', x: '@x:scaled:center', text: 'a' });
    });
});
