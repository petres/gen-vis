import { describe, test, expect } from 'vitest';
import Ajv from 'ajv';
import schema from '../schema.json';
import { plotTypes, curveNames } from '@/utils/validate';
import { localeNames } from '@/utils/else';

const validate = new Ajv({ allErrors: true, allowUnionTypes: true }).compile(schema);
const errors = def => validate(def) ? [] : validate.errors.map(e => `${e.instancePath} ${e.message}`);

// all definitions, also the shared parents
const examples = import.meta.glob(['../data/**/def*.json', '../data/**/shared*.json'], { eager: true, import: 'default' });

describe('the schema', () => {
    test.each(Object.entries(examples))('%s is valid', (file, def) => {
        expect(errors(def)).toEqual([]);
    });

    test('knows the plot types and locales', () => {
        expect(schema.definitions.plot.properties.type.enum).toEqual(plotTypes);
        expect(schema.definitions.plot.properties.curve.enum).toEqual(curveNames);
        expect(schema.definitions.locale.anyOf[0].enum).toEqual(localeNames);
    });

    test('parts of a definition are valid, e.g. patches of the parent', () => {
        expect(errors({ parent: '../shared.json', options: { title: 'A' } })).toEqual([]);
        expect(errors({ plot: { props: { 'stroke-dasharray': '2 2' } } })).toEqual([]);
        expect(errors({ facets: { cols: { steps: [{ cut: 0, value: 1 }] } } })).toEqual([]);
    });

    test('rejects typos and wrong values', () => {
        expect(errors({ option: {} })).not.toEqual([]);
        expect(errors({ mapping: { x: { axis: { positon: 'left' } } } })).not.toEqual([]);
        expect(errors({ mapping: { x: { type: 'number' } } })).not.toEqual([]);
        expect(errors({ plot: [{ type: 'line' }] })).not.toEqual([]);
        expect(errors({ options: { height: { prop: 'relative', ratio: 0.5 } } })).not.toEqual([]);
        expect(errors({ options: { locale: 'fr' } })).not.toEqual([]);
    });

    test('nested props and computed props', () => {
        expect(errors({ plot: { type: 'svg:path', props: {
            d: { x: '@x:scaled', y: '@y:scaled' },
            'stroke-width': { prop: 'relative', ref: 'innerWidth', ratio: 0.01 },
        } } })).toEqual([]);
    });
});
