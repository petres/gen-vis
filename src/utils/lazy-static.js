// the parts of lazy.js in the standalone script, it is one file, so they are
// part of it anyway, imported directly they are smaller than as chunks
// inlined into it, see vite.config.js
import * as validate from '@/utils/validate.js';
import * as transform from '@/utils/transform-types.js';
import * as intl from '@/utils/locale-intl.js';
import ColorLegend from '@/comp/ColorLegend.vue';
import * as colors from '@/utils/colors.js';
import * as geoMap from '@/coords/geo-map.js';
import * as polar from '@/coords/polar-plot.js';
import * as geo from '@/utils/geo.js';
import * as parquet from '@/utils/parquet.js';
import * as exporting from '@/utils/export.js';
import * as screenshot from 'modern-screenshot';
import 'd3-transition';

export const lazy = {
    validate: async () => validate,
    transform: async () => transform,
    intl: async () => intl,
    colorLegend: async () => ({ default: ColorLegend }),
    colors: async () => colors,
    geoMap: async () => geoMap,
    polar: async () => polar,
    geo: async () => geo,
    parquet: async () => parquet,
    exporting: async () => exporting,
    screenshot: async () => screenshot,
    transition: async () => ({}),
};
