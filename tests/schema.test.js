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

    test('knows the plot types, coordinate systems and locales', () => {
        expect(schema.definitions.plot.properties.type.enum).toEqual(Object.keys(plotTypes));
        expect(schema.definitions.options.properties.coord.enum).toEqual(Object.keys(coords));
        expect(schema.definitions.plot.properties.curve.enum).toEqual(curveNames);
        expect(schema.definitions.locale.anyOf[0].enum).toEqual(localeNames);
        expect(schema.properties.dataFormat.enum).toEqual(dataFormats);
        expect(schema.definitions.scale.properties.type.enum).toEqual(Object.keys(scales).sort());
        expect(schema.properties.geo.properties.projection.properties.type.enum).toEqual(projectionNames);
    });

    test('references and computed props of numbers, domains and ranges', () => {
        expect(errors({ options: { height: '@height', transition: 300 }, facets: { cols: '@cols', scales: '@shared' } })).toEqual([]);
        expect(errors({ mapping: { x: { scale: { domain: [0, '@max'], range: [0, '@radius'], inset: '@inset' }, axis: { ticks: '@ticks', tickSpacing: 80 } } } })).toEqual([]);
        expect(errors({ mapping: { c: { scale: { type: 'band', domain: ['a'] } } } })).toEqual([]);
        expect(errors({ options: { height: 'tall' } })).not.toEqual([]);
        expect(errors({ options: { transition: -1 } })).not.toEqual([]);
    });

    test('an annotation or a list, a mapping or a list of categories, keys of numbers', () => {
        expect(errors({ annotations: { type: 'line', y: { prop: 'ref', ref: 'target' } } })).toEqual([]);
        expect(errors({ plot: { type: 'svg:circle', categories: 'c' } })).toEqual([]);
        expect(errors({ geo: { include: ['AT', 40], fit: [40], projection: { type: 'conicConformal', parallels: [46, 49] } } })).toEqual([]);
        expect(errors({ geo: { projection: { type: 'round' } } })).not.toEqual([]);
        expect(errors({ options: { locale: { base: 'de', texts: { csv: 'CSV', keys: 'Tasten' } } } })).toEqual([]);
        expect(errors({ options: { locale: { texts: { downlaod: 'x' } } } })).not.toEqual([]);
    });

    test('parts of a definition are valid, e.g. patches of the parent', () => {
        expect(errors({ parent: '../shared.json', options: { title: 'A' } })).toEqual([]);
        expect(errors({ plot: { props: { 'stroke-dasharray': '2 2' } } })).toEqual([]);
        expect(errors({ facets: { cols: { steps: [{ cut: 0, value: 1 }] } } })).toEqual([]);
        expect(errors({ formElements: [{ id: 'scale', inImage: false }] })).toEqual([]);
        expect(errors({ mapping: { c: { legend: { symbol: 'line' } } } })).toEqual([]);
        expect(errors({ mapping: { c: { legend: { symbol: { type: 'rect', size: 12, props: { rx: 0 } } } } } })).toEqual([]);
        expect(errors({ mapping: { c: { legend: { symbol: 'star' } } } })).not.toEqual([]);
        expect(errors({ mapping: { c: { props: { order: 'descending', ranks: [{ color: 'red' }] } } } })).toEqual([]);
    });

    test('rejects typos and wrong values', () => {
        expect(errors({ option: {} })).not.toEqual([]);
        expect(errors({ mapping: { x: { axis: { positon: 'left' } } } })).not.toEqual([]);
        expect(errors({ mapping: { x: { type: 'number' } } })).not.toEqual([]);
        expect(errors({ plot: [{ type: 'line' }] })).not.toEqual([]);
        expect(errors({ options: { height: { prop: 'relative', ratio: 0.5 } } })).not.toEqual([]);
        expect(errors({ options: { locale: 'fr' } })).toEqual([]);
        expect(errors({ options: { locale: 'not a locale' } })).not.toEqual([]);
    });

    test('nested props and computed props', () => {
        expect(errors({ plot: { type: 'cartesian:line', props: {
            d: { x: '@x:scaled', y: '@y:scaled' },
            'stroke-width': { prop: 'relative', ref: 'innerWidth', ratio: 0.01 },
        } } })).toEqual([]);
    });
});
