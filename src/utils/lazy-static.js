// the parts of lazy.js in the standalone script, it is one file, so they are
// part of it anyway, imported directly they are smaller than as chunks
// inlined into it, see vite.config.js
import * as colors from '@/utils/colors.js';
import * as geoMap from '@/coords/geo-map.js';
import * as geo from '@/utils/geo.js';
import * as parquet from '@/utils/parquet.js';
import * as screenshot from 'modern-screenshot';
import 'd3-transition';

export const lazy = {
    colors: async () => colors,
    geoMap: async () => geoMap,
    geo: async () => geo,
    parquet: async () => parquet,
    screenshot: async () => screenshot,
    transition: async () => ({}),
};
