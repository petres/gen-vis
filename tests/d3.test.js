import { describe, test, expect } from 'vitest';
import * as d3 from '@/utils/d3';
import { scaleLinear, scaleSequentialLog } from 'd3-scale';
import { interpolateBlues, schemeTableau10 } from 'd3-scale-chromatic';
import { geoConicConformal } from 'd3-geo';

describe('the registries of the names of definitions', () => {
    test('scales, interpolators, schemes and projections', () => {
        expect(d3.named(d3.scales, 'linear')).toBe(scaleLinear);
        expect(d3.named(d3.scales, 'sequentialLog')).toBe(scaleSequentialLog);
        expect(d3.named(d3.interpolators, 'Blues')).toBe(interpolateBlues);
        expect(d3.named(d3.schemes, 'Tableau10')).toBe(schemeTableau10);
        expect(d3.named(d3.projections, 'conicConformal')).toBe(geoConicConformal);
    });

    test('the first letter in any case', () => {
        expect(d3.named(d3.interpolators, 'blues')).toBe(interpolateBlues);
        expect(d3.named(d3.scales, 'Linear')).toBe(scaleLinear);
    });

    test('unknown names', () => {
        expect(d3.named(d3.scales, 'unknown')).toBeUndefined();
        expect(d3.named(d3.scales, 'constructor')).toBeUndefined();
        expect(d3.named(d3.projections, 'path')).toBeUndefined();
        expect(d3.named(d3.interpolators, undefined)).toBeUndefined();
    });
});
