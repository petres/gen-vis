// the parts of d3 the package uses, so a bundle has only them, not all of
// d3, e.g. without forces and zoom. The names of the definitions, e.g. of
// scales and interpolators, are looked up in the registries below. The
// colors of d3-scale-chromatic are only loaded for definitions which name
// one (see loadColors), the transitions for the ones with a transition (see
// loadTransition), the projections of maps with the first map (see
// coords/geo.js).
import * as d3Scale from 'd3-scale';
import { axisTop, axisBottom, axisLeft, axisRight } from 'd3-axis';
import { byPrefix, named } from '@/utils/registry';

export { bisectCenter, extent, greatest, group, least, max, mean, min, nice, range, tickStep, ticks } from 'd3-array';
export { csvFormat, csvParse, tsvParse } from 'd3-dsv';
export { formatLocale, precisionFixed } from 'd3-format';
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
import { lazy } from '@/utils/lazy';

export { byPrefix, named };

// the scales (`scale.type`), e.g. linear, time, band or sequential, not the
// value scaleImplicit
export const scales = Object.fromEntries(Object.entries(byPrefix(d3Scale, 'scale')).filter(([, v]) => typeof v == 'function'));

// the names of the colors of sequential and diverging scales
// (`scale.interpolator`), e.g. Blues or RdYlGn, and of the schemes of the
// ranges and categories (`scheme`), e.g. Tableau10, known before the colors
// are loaded, e.g. to validateDef
const registry = names => Object.fromEntries(names.map(n => [n, true]));
export const interpolatorNames = registry([
    'blues', 'brBG', 'buGn', 'buPu', 'cividis', 'cool', 'cubehelixDefault', 'gnBu', 'greens',
    'greys', 'inferno', 'magma', 'orRd', 'oranges', 'pRGn', 'piYG', 'plasma', 'puBu', 'puBuGn',
    'puOr', 'puRd', 'purples', 'rainbow', 'rdBu', 'rdGy', 'rdPu', 'rdYlBu', 'rdYlGn', 'reds',
    'sinebow', 'spectral', 'turbo', 'viridis', 'warm', 'ylGn', 'ylGnBu', 'ylOrBr', 'ylOrRd',
]);
export const schemeNames = registry([
    'accent', 'blues', 'brBG', 'buGn', 'buPu', 'category10', 'dark2', 'gnBu', 'greens', 'greys',
    'observable10', 'orRd', 'oranges', 'pRGn', 'paired', 'pastel1', 'pastel2', 'piYG', 'puBu',
    'puBuGn', 'puOr', 'puRd', 'purples', 'rdBu', 'rdGy', 'rdPu', 'rdYlBu', 'rdYlGn', 'reds',
    'set1', 'set2', 'set3', 'spectral', 'tableau10', 'ylGn', 'ylGnBu', 'ylOrBr', 'ylOrRd',
]);

// the colors of d3-scale-chromatic, loaded once by loadColors
let colors = null;
export const loadColors = async () => colors ??= await lazy.colors();

// the transitions of selections, e.g. of options.transition, d3-transition
// adds them to the selections of d3, e.g. `transition()` and `interrupt()`
let transitions = null;
export const loadTransition = () => transitions ??= lazy.transition().catch(error => {
    transitions = null;
    throw error;
});
export const hasTransitions = selection => typeof selection.interrupt == 'function';
const loaded = () => {
    if (!colors)
        throw new Error('The colors of d3 are not loaded, see loadColors');
    return colors;
};

// the interpolator of a name, e.g. "Blues", undefined if it is unknown
export const interpolator = name => named(loaded().interpolators, name);

// the axes of the cartesian coordinate system by their position
export const axes = { top: axisTop, bottom: axisBottom, left: axisLeft, right: axisRight };


// the colors of a scheme, e.g. "Tableau10", of a scheme of several sizes, e.g.
// "Blues", `n` colors (3 to the most of the scheme), undefined if it is unknown
export const schemeColors = (name, n) => {
    const scheme = named(loaded().schemes, name);
    if (!scheme)
        return undefined;
    if (typeof scheme.at(-1) == 'string')
        return scheme;
    return scheme[Math.min(Math.max(n, 3), scheme.length - 1)].slice(0, n);
};
