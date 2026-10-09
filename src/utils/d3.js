// the parts of d3 the package uses, so a bundle has only them, not all of
// d3, e.g. without forces and zoom. The names of the definitions, e.g. of
// scales and interpolators, are looked up in the registries below.
import * as d3Scale from 'd3-scale';
import * as chromatic from 'd3-scale-chromatic';
import {
    geoAlbers, geoAlbersUsa, geoAzimuthalEqualArea, geoAzimuthalEquidistant, geoConicConformal,
    geoConicEqualArea, geoConicEquidistant, geoEqualEarth, geoEquirectangular, geoGnomonic, geoIdentity,
    geoMercator, geoNaturalEarth1, geoOrthographic, geoStereographic, geoTransverseMercator,
} from 'd3-geo';
import { axisTop, axisBottom, axisLeft, axisRight } from 'd3-axis';

export { bisectCenter, extent, greatest, group, least, mean, min, nice, range, tickStep, ticks } from 'd3-array';
export { csvParse, tsvParse } from 'd3-dsv';
export { formatLocale, precisionFixed } from 'd3-format';
export { geoArea, geoContains, geoPath } from 'd3-geo';
export { scaleLinear } from 'd3-scale';
export { pointer, select } from 'd3-selection';
export {
    arc, area, areaRadial, line, lineRadial, pointRadial,
    curveBasis, curveBasisClosed, curveCatmullRom, curveCatmullRomClosed, curveLinear, curveLinearClosed,
    curveMonotoneX, curveNatural, curveStep, curveStepAfter, curveStepBefore,
} from 'd3-shape';
export {
    timeSecond, timeMinute, timeHour, timeDay, timeWeek, timeMonth, timeYear,
    utcSecond, utcMinute, utcHour, utcDay, utcWeek, utcMonth, utcYear,
} from 'd3-time';
export { timeFormatLocale } from 'd3-time-format';

const lowerFirst = w => w.charAt(0).toLowerCase() + w.slice(1);

// the exports of a module of d3 with a prefix, by their names without it,
// e.g. "linear" of scaleLinear
const byPrefix = (module, prefix) => Object.fromEntries(Object.entries(module)
    .filter(([k]) => k.startsWith(prefix) && k.length > prefix.length)
    .map(([k, v]) => [lowerFirst(k.slice(prefix.length)), v]));

// the scales (`scale.type`), e.g. linear, time, band or sequential
export const scales = byPrefix(d3Scale, 'scale');

// the colors of sequential and diverging scales (`scale.interpolator`), e.g.
// Blues or RdYlGn, and the schemes of the ranges (`scale.scheme`), e.g. Tableau10
export const interpolators = byPrefix(chromatic, 'interpolate');
export const schemes = byPrefix(chromatic, 'scheme');

// the projections of maps (`geo.projection.type`), e.g. mercator
export const projections = {
    albers: geoAlbers, albersUsa: geoAlbersUsa, azimuthalEqualArea: geoAzimuthalEqualArea,
    azimuthalEquidistant: geoAzimuthalEquidistant, conicConformal: geoConicConformal,
    conicEqualArea: geoConicEqualArea, conicEquidistant: geoConicEquidistant, equalEarth: geoEqualEarth,
    equirectangular: geoEquirectangular, gnomonic: geoGnomonic, identity: geoIdentity, mercator: geoMercator,
    naturalEarth1: geoNaturalEarth1, orthographic: geoOrthographic, stereographic: geoStereographic,
    transverseMercator: geoTransverseMercator,
};

// the axes of the cartesian coordinate system by their position
export const axes = { top: axisTop, bottom: axisBottom, left: axisLeft, right: axisRight };

// an entry of a registry, the first letter in any case, e.g. "Blues" or
// "blues", undefined for unknown names
export const named = (registry, name) => typeof name == 'string' && Object.hasOwn(registry, lowerFirst(name))
    ? registry[lowerFirst(name)] : undefined;

// the names of a registry for messages, e.g. of validateDef
export const names = registry => Object.keys(registry);
