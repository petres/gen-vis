import { describe, test, expect } from 'vitest';
import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { dataFormats } from '@/utils/data';
import schemaFile from '../schema.json';
import { schema, markTypes, coordNames, curveNames, localeNames, dataFormats as formats, scaleTypes, projectionNames, transformTypes, controlTypes } from '@/schema/definition.js';
import { curveNames as curves } from '@/utils/validate';
import { plotTypes } from '@/plots';
import { coords } from '@/coords';
import { definitions } from '@/dev/definitions.js';
import { localeNames as locales } from '@/utils/locale';
import { scales } from '@/utils/d3';
import { projectionNames as projections } from '@/coords/geo.js';
import { transformNames } from '@/utils/transform';
import { markNames } from '@/schema/definition.js';
import { typeOf } from '@/utils/language';

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

    test('schema.json is the one of src/schema/definition.js, see npm run schema', async () => {
        const { schemaText } = await import('../scripts/schema.js');
        expect(readFileSync(new URL('../schema.json', import.meta.url), 'utf8')).toBe(schemaText());
        expect(schemaFile).toEqual(JSON.parse(JSON.stringify(schema)));
    });

    test('the types of TypeScript of the definitions are the ones of the schema, see npm run types', async () => {
        const { definitionTypes } = await import('../scripts/types.js');
        expect(readFileSync(new URL('../types/definition.d.ts', import.meta.url), 'utf8')).toBe(await definitionTypes());
    });

    test('knows the plot types, the names of the marks, coordinate systems, curves, locales, scales, projections and transforms of the code', () => {
        expect(markTypes).toEqual(Object.keys(plotTypes));
        // every name of a mark is a type of a coordinate system
        markNames.forEach(n => expect(markTypes.includes(typeOf(n, 'cartesian')) || markTypes.includes(typeOf(n, 'polar')) || markTypes.includes(typeOf(n, 'geo'))).toBe(true));
        expect(coordNames).toEqual(Object.keys(coords));
        expect(curveNames).toEqual(curves);
        expect(localeNames).toEqual(locales);
        expect(formats).toEqual(dataFormats);
        expect(scaleTypes).toEqual(Object.keys(scales).sort());
        expect(projectionNames).toEqual(projections);
        expect(transformTypes).toEqual(transformNames);
        expect(controlTypes).toEqual(['radio', 'select', 'slider', 'hidden']);
    });

    test('expressions as strings or objects of numbers, domains and ranges', () => {
        expect(errors({ height: '@height', transition: 300, facets: { cols: '@cols', scales: '@shared' } })).toEqual([]);
        expect(errors({ height: '=steps(@totalWidth, {0: 220, 550: 250})', margins: { left: '=@totalWidth * 0.1' } })).toEqual([]);
        expect(errors({ dims: { x: { scale: { domain: [0, '@max'], range: [0, '@radius'], inset: '@inset' }, axis: { ticks: '@ticks', tickSpacing: 80 } } } })).toEqual([]);
        expect(errors({ dims: { x: { domain: '=match(@values, {share: literal([0, 1])}, null)', pad: 0.1, zero: true, grid: true } } })).toEqual([]);
        expect(errors({ dims: { c: { scale: { type: 'band', domain: ['a'] } } } })).toEqual([]);
        expect(errors({ height: 'tall' })).not.toEqual([]);
        expect(errors({ transition: -1 })).not.toEqual([]);
        expect(errors({ margins: 'auto' })).toEqual([]);
        expect(errors({ margins: 'none' })).not.toEqual([]);
    });

    test('the dims: a column, categories as colors, the shorthands of the scale and the axis', () => {
        expect(errors({ dims: { c: 'land', y: { column: 'value', domain: [0, '@max'], nice: true, format: ',.1f' } } })).toEqual([]);
        expect(errors({ dims: { c: { column: 'land', categories: { Wien: '#123', Tirol: { name: 'T', color: '#456', 'stroke-width': 2 } }, scheme: 'Tableau10', common: { width: 1 }, fromData: true } } })).toEqual([]);
        expect(errors({ dims: { c: { column: 'land', order: 'descending', ranks: [{ color: 'red' }], fromData: 'rows' } } })).toEqual([]);
        expect(errors({ dims: { c: { legend: { symbol: 'line' } } } })).toEqual([]);
        expect(errors({ dims: { c: { legend: { symbol: { type: 'rect', size: 12, props: { rx: 0 } } } } } })).toEqual([]);
        expect(errors({ dims: { c: { legend: { symbol: null } } } })).toEqual([]);
        expect(errors({ dims: { c: { legend: { symbol: 'star' } } } })).not.toEqual([]);
        // the keys of 4.x
        expect(errors({ dims: { c: { props: { order: 'descending' } } } })).not.toEqual([]);
        expect(errors({ dims: { c: { scale: { domainRel: [0, 0.1] } } } })).not.toEqual([]);
        expect(errors({ dims: { x: { type: 'number' } } })).not.toEqual([]);
        expect(errors({ mapping: { x: 'year' } })).not.toEqual([]);
    });

    test('the marks: a mark or a list, their channels and attributes, the names of 5.0 and the full names', () => {
        expect(errors({ marks: { type: 'line', by: 'c', 'stroke-width': 2, opacity: '=@value > 1 ? 1 : 0.5', highlight: { 'stroke-width': 3 }, others: { opacity: 0.3 } } })).toEqual([]);
        expect(errors({ marks: [{ type: 'bar', by: ['c', 'd'], stack: true, dodge: 'c', orient: 'horizontal', x0: 0, y1: 'hi' }, { type: 'label', text: '@x:formatted', anchor: 'end' }] })).toEqual([]);
        expect(errors({ marks: { type: 'svg:circle', cx: '@x:scaled', d: { x: '@x:scaled' } } })).toEqual([]);
        expect(errors({ marks: { type: 'rule', y: 100, 'stroke-dasharray': '2 2' } })).toEqual([]);
        expect(errors({ marks: { type: 'cell', fill: 'v' } })).toEqual([]);
        expect(errors({ marks: { type: 'point', filter: '@year == @globals.year' } })).toEqual([]);
        expect(errors({ marks: { type: 'point', filter: { year: '@globals.year', land: ['Wien', 'Tirol'] } } })).toEqual([]);
        expect(errors({ marks: { type: 'line', curve: 'monotoneX', select: 'last', layer: 'below', halo: true } })).toEqual([]);
        expect(errors({ marks: { type: 'Line' } })).not.toEqual([]);
        expect(errors({ marks: { type: 'line', highlight: { mode: 'segment' } } })).not.toEqual([]);
        expect(errors({ marks: { type: 'line', props: { fill: 'red' } } })).toEqual([]);
        expect(errors({ plot: { type: 'line' } })).not.toEqual([]);
    });

    test('the controls and their entries, other scalar fields are names of templates, e.g. {group:short}', () => {
        expect(errors({ controls: [{ type: 'radio', global: 'g', name: 'G', values: [{ value: 'a', name: 'A', short: 'a', rank: 1, main: true, none: null }, 'b', 2] }] })).toEqual([]);
        expect(errors({ controls: [{ type: 'slider', global: 'year', values: { column: 'year', format: '%Y' }, inImage: false }] })).toEqual([]);
        // a part of a parent: ids only
        expect(errors({ controls: [{ id: 'g', values: [{ id: 'a' }] }] })).toEqual([]);
        expect(errors({ controls: [{ global: 'g', values: [{ value: 'a', short: { de: 'A' } }] }] })).not.toEqual([]);
        expect(errors({ controls: [{ global: 'g', default: 'a' }] })).not.toEqual([]);
        expect(errors({ controls: [{ global: 'g', values: [{ value: 'a', patch: { title: 'A' } }] }] })).not.toEqual([]);
        expect(errors({ formElements: [{ id: 'g' }] })).not.toEqual([]);
    });

    test('the filter, the hover, the facets, the geometry and the locale', () => {
        expect(errors({ filter: '@year == @globals.year and @value > 0' })).toEqual([]);
        expect(errors({ filter: { '==': ['@year', '@globals.year'] } })).toEqual([]);
        expect(errors({ filter: { year: '@globals.year', land: ['Wien', 'Tirol'] }, parent: 'a.json', geo: null })).toEqual([]);
        expect(errors({ filter: { year: { not: 2020 }, d: { range: [1, 2] } } })).toEqual([]);
        expect(errors({ hover: { columns: ['c', 'y'], total: true, position: 'pointer', offset: [null, -10], filter: '@level != "header"' } })).toEqual([]);
        expect(errors({ hover: { offset: [0] } })).not.toEqual([]);
        expect(errors({ dims: { c: { hover: { row: { props: { 'font-style': '@hoverStyle', opacity: 0.6 } } } } } })).toEqual([]);
        expect(errors({ dims: { c: { hover: { row: { style: {} } } } } })).not.toEqual([]);
        expect(errors({ facets: { by: 'c', cols: 2, scales: 'own' } })).toEqual([]);
        expect(errors({ facets: { by: { rows: 'c', cols: 'g' }, scales: { y: 'row' }, rowHeaders: 'left', title: { props: { color: '@color' } } } })).toEqual([]);
        expect(errors({ facets: { cols: { steps: ['@totalWidth', { 0: 1, 550: 2 }] } } })).toEqual([]);
        expect(errors({ facets: { dim: 'c' } })).not.toEqual([]);
        expect(errors({ geo: { include: ['AT', 40], fit: [40], projection: { type: 'conicConformal', parallels: [46, 49] } } })).toEqual([]);
        expect(errors({ geo: { projection: { type: 'round' } } })).not.toEqual([]);
        expect(errors({ locale: { base: 'de', texts: { csv: 'CSV', keys: 'Tasten' } } })).toEqual([]);
        expect(errors({ locale: { texts: { downlaod: 'x' } } })).not.toEqual([]);
        expect(errors({ locale: 'fr' })).toEqual([]);
        expect(errors({ locale: 'not a locale' })).not.toEqual([]);
        expect(errors({ annotations: { type: 'line', y: { '*': ['@target', 1.1] }, label: 'Ziel' } })).toEqual([]);
    });

    test('false or null removes a part of a dim, the keys of a parent', () => {
        for (const part of ['scale', 'axis', 'hover', 'legend']) {
            expect(errors({ dims: { c: { [part]: false } } })).toEqual([]);
            expect(errors({ dims: { c: { [part]: null } } })).toEqual([]);
            expect(errors({ dims: { c: { [part]: true } } })).not.toEqual([]);
        }
        expect(errors({ dims: { c: null }, filter: null, geo: null })).toEqual([]);
    });

    test('rejects typos and wrong values, also at the top level', () => {
        expect(errors({ option: {} })).not.toEqual([]);
        expect(errors({ options: { title: 'A' } })).not.toEqual([]);
        expect(errors({ dims: { x: { axis: { positon: 'left' } } } })).not.toEqual([]);
        // objects which are no operators, an operator and another key
        expect(errors({ height: { prop: 'relative', ratio: 0.5 } })).not.toEqual([]);
        expect(errors({ height: { relative: ['@totalWidth', 0.5] } })).not.toEqual([]);
        expect(errors({ height: { '*': ['@totalWidth', 0.5], '+': [1] } })).not.toEqual([]);
    });

    test('registered plot types and coordinate systems beside the built-in ones', () => {
        expect(errors({ marks: { type: 'my-coord:dots' }, coord: 'my-coord' })).toEqual([]);
        expect(errors({ coord: 'test:coord' })).toEqual([]);
        expect(errors({ marks: { type: 'dots' } })).toEqual([]);
        expect(errors({ marks: { type: 'Dots' } })).not.toEqual([]);
        expect(errors({ marks: { type: 'my coord:dots' } })).not.toEqual([]);
        expect(errors({ coord: 'My coord' })).not.toEqual([]);
        // the names of d3 are the ones of the schema, validateDef warns of others
        expect(errors({ dims: { x: { scale: { type: 'Linear' } } } })).not.toEqual([]);
    });

    test('the types of TypeScript keep the built-in plot types and coordinate systems of registered ones', async () => {
        const types = readFileSync(new URL('../types/definition.d.ts', import.meta.url), 'utf8');
        expect(types).toContain(`coord?: ('cartesian' | 'polar' | 'geo') | (string & {});`);
        expect(types).toMatch(/'annotation:circle'\n\s+\)\n\s+\| \(string & \{\}\);/);
        expect(types).toContain('export interface Dim ');
        expect(types).toContain('export interface Mark ');
        expect(types).toContain('export interface Control ');
    });
});
