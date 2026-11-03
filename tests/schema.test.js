import { describe, test, expect } from 'vitest';
import Ajv from 'ajv';
import { dataFormats } from '@/utils/data';
import schema from '../schema.json';
import { curveNames } from '@/utils/validate';
import { plotTypes } from '@/plots';
import { coords } from '@/coords';
import { definitions } from '@/dev/definitions.js';
import { localeNames } from '@/utils/locale';
import { scales } from '@/utils/d3';
import { projectionNames } from '@/coords/geo.js';

// the strict mode of ajv, e.g. no union types, so other tools read it as well
const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
const errors = def => validate(def) ? [] : validate.errors.map(e => `${e.instancePath} ${e.message}`);

// all definitions, also the mixins and shared parents
const examples = Object.fromEntries(definitions(import.meta.glob('../data/**/*.json', { eager: true, import: 'default' }), true)
    .map(d => [d.path, d.def]));

describe('the schema', () => {
    test.each(Object.entries(examples))('%s is valid', (file, def) => {
        expect(errors(def)).toEqual([]);
    });

    test('the types of TypeScript of the definitions are the ones of the schema, see npm run types', async () => {
        const { readFileSync } = await import('node:fs');
        const { definitionTypes } = await import('../scripts/types.js');
        expect(readFileSync(new URL('../types/definition.d.ts', import.meta.url), 'utf8')).toBe(await definitionTypes());
    });

    test('knows the plot types, coordinate systems and locales', () => {
        expect(schema.definitions.plot.properties.type.anyOf[0].enum).toEqual(Object.keys(plotTypes));
        expect(schema.definitions.options.properties.coord.anyOf[0].enum).toEqual(Object.keys(coords));
        expect(schema.definitions.plot.properties.curve.enum).toEqual(curveNames);
        expect(schema.definitions.locale.anyOf[0].enum).toEqual(localeNames);
        expect(schema.properties.dataFormat.enum).toEqual(dataFormats);
        expect(schema.definitions.scale.properties.type.enum).toEqual(Object.keys(scales).sort());
        expect(schema.definitions.geo.properties.projection.properties.type.enum).toEqual(projectionNames);
    });

    test('references and computed props of numbers, domains and ranges', () => {
        expect(errors({ options: { height: '@height', transition: 300 }, facets: { cols: '@cols', scales: '@shared' } })).toEqual([]);
        expect(errors({ mapping: { x: { scale: { domain: [0, '@max'], range: [0, '@radius'], inset: '@inset' }, axis: { ticks: '@ticks', tickSpacing: 80 } } } })).toEqual([]);
        expect(errors({ mapping: { c: { scale: { type: 'band', domain: ['a'] } } } })).toEqual([]);
        expect(errors({ options: { height: 'tall' } })).not.toEqual([]);
        expect(errors({ options: { transition: -1 } })).not.toEqual([]);
    });

    test('an annotation or a list, a mapping or a list of categories, keys of numbers', () => {
        expect(errors({ annotations: { type: 'line', y: { '*': ['@target', 1.1] } } })).toEqual([]);
        expect(errors({ plot: { type: 'svg:circle', by: 'c' } })).toEqual([]);
        expect(errors({ plot: { type: 'svg:circle', by: ['c', 'd'] } })).toEqual([]);
        // the categories of a plot are by
        expect(errors({ plot: { type: 'svg:circle', categories: 'c' } })).not.toEqual([]);
        expect(errors({ geo: { include: ['AT', 40], fit: [40], projection: { type: 'conicConformal', parallels: [46, 49] } } })).toEqual([]);
        expect(errors({ geo: { projection: { type: 'round' } } })).not.toEqual([]);
        expect(errors({ options: { locale: { base: 'de', texts: { csv: 'CSV', keys: 'Tasten' } } } })).toEqual([]);
        expect(errors({ options: { locale: { texts: { downlaod: 'x' } } } })).not.toEqual([]);
    });

    test('the styles of the rows of the hover', () => {
        expect(errors({ mapping: { c: { hover: { row: { props: { 'font-style': '@hoverStyle', opacity: 0.6 } } } } } })).toEqual([]);
        expect(errors({ mapping: { c: { hover: { row: { style: {} } } } } })).not.toEqual([]);
    });

    test('parts of a definition are valid, e.g. patches of the parent', () => {
        expect(errors({ parent: '../shared.json', options: { title: 'A' } })).toEqual([]);
        expect(errors({ plot: { props: { 'stroke-dasharray': '2 2' } } })).toEqual([]);
        expect(errors({ facets: { cols: { steps: ['@totalWidth', { 0: 1, 550: 2 }] } } })).toEqual([]);
        expect(errors({ formElements: [{ id: 'scale', inImage: false }] })).toEqual([]);
        expect(errors({ mapping: { c: { legend: { symbol: 'line' } } } })).toEqual([]);
        expect(errors({ mapping: { c: { legend: { symbol: { type: 'rect', size: 12, props: { rx: 0 } } } } } })).toEqual([]);
        expect(errors({ mapping: { c: { legend: { symbol: 'star' } } } })).not.toEqual([]);
        expect(errors({ mapping: { c: { column: 'land', order: 'descending', ranks: [{ color: 'red' }] } } })).toEqual([]);
        expect(errors({ mapping: { c: { categories: { Wien: { color: 'red' } }, scheme: 'Tableau10', common: { width: 1 }, fromData: true } } })).toEqual([]);
        // a mapping of a text is the one of the column, the domain, nice and the format are the ones of the mapping
        expect(errors({ mapping: { c: 'land', y: { column: 'value', domain: [0, '@max'], nice: true, format: ',.1f' } } })).toEqual([]);
        // the props of the categories are parts of the mapping, not of props
        expect(errors({ mapping: { c: { props: { order: 'descending' } } } })).not.toEqual([]);
    });

    test('rejects typos and wrong values', () => {
        expect(errors({ option: {} })).not.toEqual([]);
        expect(errors({ mapping: { x: { axis: { positon: 'left' } } } })).not.toEqual([]);
        expect(errors({ mapping: { x: { type: 'number' } } })).not.toEqual([]);
        // a type without the prefix of the coordinate system, not of another case
        expect(errors({ plot: [{ type: 'line' }] })).toEqual([]);
        expect(errors({ plot: [{ type: 'Line' }] })).not.toEqual([]);
        // objects which are no operators, an operator and another key
        expect(errors({ options: { height: { prop: 'relative', ratio: 0.5 } } })).not.toEqual([]);
        expect(errors({ options: { height: { relative: ['@totalWidth', 0.5] } } })).not.toEqual([]);
        expect(errors({ options: { height: { '*': ['@totalWidth', 0.5], '+': [1] } } })).not.toEqual([]);
        expect(errors({ plot: { type: 'line', highlight: { mode: 'segment' } } })).not.toEqual([]);
        expect(errors({ options: { locale: 'fr' } })).toEqual([]);
        expect(errors({ options: { locale: 'not a locale' } })).not.toEqual([]);
    });

    test('nested props and computed props', () => {
        expect(errors({ plot: { type: 'cartesian:line', props: {
            d: { x: '@x:scaled', y: '@y:scaled' },
            'stroke-width': { '+': [{ '*': ['@innerWidth', 0.01] }, 1] },
            'stroke-opacity': { steps: ['@totalWidth', { 0: 0.5, 550: 1 }] },
            'data-label': { format: ['@y', ',.1f'] },
            'stroke-dasharray': { match: ['@level', { header: '2 2' }, null] },
            'data-at': { literal: '@a' },
            'data-if': { if: [{ '>': ['@y', 0] }, 'up', 'down'] },
        }, highlight: { 'stroke-width': 3 }, others: { opacity: 0.3 } } })).toEqual([]);
        expect(errors({ plot: { type: 'line', highlight: { mode: 'row', opacity: 1 } } })).toEqual([]);
        expect(errors({ plot: { type: 'line', highlight: { mode: 'row' } } })).toEqual([]);
    });
});

describe('the schema of the parts the code accepts', () => {
    test('other scalar fields of entries, names of templates, e.g. {group:short}', () => {
        expect(errors({ formElements: [{ id: 'g', values: [{ id: 'a', value: 'a', short: 'A', rank: 1, main: true, none: null }] }] })).toEqual([]);
        expect(errors({ formElements: [{ id: 'g', values: [{ id: 'a', short: { de: 'A' } }] }] })).not.toEqual([]);
        expect(errors({ formElements: [{ id: 'g', default: 'a' }] })).not.toEqual([]);
    });

    test('false or null removes a part of a mapping', () => {
        for (const part of ['scale', 'axis', 'hover', 'legend']) {
            expect(errors({ mapping: { c: { [part]: false } } })).toEqual([]);
            expect(errors({ mapping: { c: { [part]: null } } })).toEqual([]);
            expect(errors({ mapping: { c: { [part]: true } } })).not.toEqual([]);
        }
    });

    test('null removes the geometry and the filter of a parent and the options and the mappings of a patch', () => {
        expect(errors({ parent: 'map.json', geo: null, filter: null })).toEqual([]);
        expect(errors({ formElements: [{ id: 'g', values: [{ id: 'a', patch: { options: null, mapping: null, geo: null, filter: null } }] }] })).toEqual([]);
        // the coordinate system and the geometry of a patch, e.g. a map instead of bars
        expect(errors({ formElements: [{ id: 'g', values: [{ id: 'a', patch: { options: { coord: 'geo' }, geo: { data: 'map.json' } } }] }] })).toEqual([]);
    });

    test('a direction of the offset of the hover can be left out (null)', () => {
        expect(errors({ options: { hover: { offset: [null, -10] } } })).toEqual([]);
        expect(errors({ options: { hover: { offset: [0] } } })).not.toEqual([]);
    });

    test('registered plot types and coordinate systems beside the built-in ones', () => {
        expect(errors({ plot: { type: 'my-coord:dots' }, options: { coord: 'my-coord' } })).toEqual([]);
        expect(errors({ options: { coord: 'test:coord' } })).toEqual([]);
        // a registered type without the prefix of its coordinate system
        expect(errors({ plot: { type: 'dots' } })).toEqual([]);
        expect(errors({ plot: { type: 'Dots' } })).not.toEqual([]);
        expect(errors({ plot: { type: 'my coord:dots' } })).not.toEqual([]);
        expect(errors({ options: { coord: 'My coord' } })).not.toEqual([]);
        // the names of d3 are the ones of the schema, validateDef warns of others
        expect(errors({ mapping: { x: { scale: { type: 'Linear' } } } })).not.toEqual([]);
    });

    test('the types of TypeScript keep the built-in plot types and coordinate systems of registered ones', async () => {
        const { readFileSync } = await import('node:fs');
        const types = readFileSync(new URL('../types/definition.d.ts', import.meta.url), 'utf8');
        expect(types).toContain(`coord?: ('cartesian' | 'polar' | 'geo') | (string & {});`);
        // the full names, the names without the prefix of the coordinate system, registered ones
        expect(types).toMatch(/'annotation:circle'\n\s+\)\n\s+\| \('arc' \| 'area' \| [^)]*'line' \| [^)]*'point' \| [^)]*'text'\)\n\s+\| \(string & \{\}\);/);
    });
});
