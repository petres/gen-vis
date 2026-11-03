// the parts of d3 the package uses, so a bundle has only them, not all of
// d3, e.g. without forces and zoom. The names of the definitions, e.g. of
// scales and interpolators, are looked up in the registries below. The
// colors of d3-scale-chromatic are only loaded for definitions which name
// one (see loadColors), the projections of maps with the first map (see
// coords/geo.js).
import * as d3Scale from 'd3-scale';
import { byPrefix, named } from '@/utils/registry';

export { bisectCenter, bisectLeft, extent, greatest, group, least, max, mean, min, nice, range, tickStep, ticks } from 'd3-array';
export { csvFormat, csvParse, tsvParse } from 'd3-dsv';
export { formatLocale, precisionFixed } from 'd3-format';
export { scaleLinear } from 'd3-scale';
export {
    area, line,
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

// the schemes registered by the page (registerScheme), e.g. the colors of
// a house style, by their names with the first letter in lower case as the
// ones of d3, they need no colors of d3 and take precedence over them
const ownSchemes = {};

/**
 * A scheme of its own (`name`, e.g. "wifo") of `colors` (CSS colors), for
 * `scheme` of the categories and of the scales as the ones of d3, known to
 * validateDef, registered before the visualisations are loaded.
 */
export const registerScheme = (name, colors) => {
    if (typeof name != 'string' || !name)
        throw new Error('registerScheme: the name of a scheme is a string, e.g. "wifo"');
    if (!Array.isArray(colors) || !colors.length || !colors.every(c => typeof c == 'string' && c))
        throw new Error(`registerScheme: the colors of the scheme '${name}' are an array of CSS colors, e.g. ["#1F77B4", "#FF7F0E"]`);
    const key = name.charAt(0).toLowerCase() + name.slice(1);
    ownSchemes[key] = [...colors];
    schemeNames[key] = true;
};

// a scheme registered by the page, e.g. a definition of one needs no colors of d3
export const ownScheme = name => named(ownSchemes, name);

// the colors of d3-scale-chromatic, loaded once by loadColors
let colors = null;
export const loadColors = async () => colors ??= await lazy.colors();

const loaded = () => {
    if (!colors)
        throw new Error('The colors of d3 are not loaded, see loadColors');
    return colors;
};

// the interpolator of a name, e.g. "Blues", undefined if it is unknown
export const interpolator = name => named(loaded().interpolators, name);

// the colors of a scheme, e.g. "Tableau10" or one registered, of a scheme of
// several sizes, e.g. "Blues", `n` colors (3 to the most of the scheme), undefined if it is unknown
export const schemeColors = (name, n) => {
    const own = ownScheme(name);
    if (own)
        return own;
    const scheme = named(loaded().schemes, name);
    if (!scheme)
        return undefined;
    if (typeof scheme.at(-1) == 'string')
        return scheme;
    return scheme[Math.min(Math.max(n, 3), scheme.length - 1)].slice(0, n);
};
