import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { migrate, conditionExpression } from '@/utils/migrate.js';
import { translate } from '@/utils/language.js';
import { resolve } from '@/utils/resolve.js';
import { normalize } from '@/utils/normalize.js';
import { parseExpression } from '@/utils/expr-parse.js';
import { isOperator } from '@/utils/expr.js';
import { resolveParents } from '@/utils/load.js';
import { plotTypes } from '@/plots';
import { definitions } from '@/dev/definitions.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = definitions(import.meta.glob('../data/**/*.json', { eager: true, import: 'default' })).map(d => `data/${d.path}`);
const load = async url => readFileSync(fileURLToPath(url), 'utf8');
const merged = async file => resolveParents(JSON.parse(readFileSync(path.join(root, file), 'utf8')), pathToFileURL(path.join(root, file)).href, load);

// the conditions of the filters of 4.x as the expressions of 5.0
const conditions = v => v && typeof v == 'object' && !Array.isArray(v) && !isOperator(v) ? parseExpression(conditionExpression(v)) : v;

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
        expect(def.controls).toEqual([{ type: 'radio', global: 'scale', values: [{ value: 'lin', name: 'linear' }, { value: 'log' }] }]);
        expect(def.subtitle).toBe("=match(@scale, {log: 'log'}, 'linear')");
        expect(def.dims.y.scale.type).toBe("=match(@scale, {log: 'log'}, 'linear')");
        // resolved with the global
        expect(translate(resolve(def, { scale: 'log' })).mapping.y.scale.type).toBe('log');
        expect(translate(resolve(def, { scale: 'lin' })).options.subtitle).toBe('linear');
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
