import { describe, test, expect, beforeAll } from 'vitest';
import * as d3 from '@/utils/d3';
import { scaleLinear, scaleSequentialLog } from 'd3-scale';
import * as chromatic from 'd3-scale-chromatic';
import { geoConicConformal } from 'd3-geo';
import { projections } from '@/coords/geo-map';
import { projectionNames } from '@/coords/geo';

beforeAll(d3.loadColors);

describe('the registries of the names of definitions', () => {
    test('scales, interpolators, schemes and projections', () => {
        expect(d3.named(d3.scales, 'linear')).toBe(scaleLinear);
        expect(d3.named(d3.scales, 'sequentialLog')).toBe(scaleSequentialLog);
        expect(d3.interpolator('Blues')).toBe(chromatic.interpolateBlues);
        expect(d3.schemeColors('Tableau10')).toBe(chromatic.schemeTableau10);
        expect(d3.named(projections, 'conicConformal')).toBe(geoConicConformal);
    });

    test('the first letter in any case', () => {
        expect(d3.interpolator('blues')).toBe(chromatic.interpolateBlues);
        expect(d3.named(d3.scales, 'Linear')).toBe(scaleLinear);
    });

    test('unknown names', () => {
        expect(d3.named(d3.scales, 'unknown')).toBeUndefined();
        expect(d3.named(d3.scales, 'constructor')).toBeUndefined();
        expect(d3.named(projections, 'path')).toBeUndefined();
        expect(d3.interpolator(undefined)).toBeUndefined();
    });

    // the names are known before the colors and the projections are loaded
    test('the names of the colors and the projections are the ones of d3', async () => {
        const colors = await import('@/utils/colors.js');
        expect(Object.keys(d3.interpolatorNames)).toEqual(Object.keys(colors.interpolators));
        expect(Object.keys(d3.schemeNames)).toEqual(Object.keys(colors.schemes));
        expect(projectionNames).toEqual(Object.keys(projections));
    });
});
