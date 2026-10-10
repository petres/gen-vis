// the colors of d3-scale-chromatic by their names, loaded by loadColors of
// utils/d3.js only for definitions which name one, e.g. "Blues"
import * as chromatic from 'd3-scale-chromatic';
import { byPrefix } from '@/utils/d3';

// the colors of sequential and diverging scales, e.g. Blues or RdYlGn, and
// the schemes of the ranges and categories, e.g. Tableau10
export const interpolators = byPrefix(chromatic, 'interpolate');
export const schemes = byPrefix(chromatic, 'scheme');
