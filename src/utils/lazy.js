// the parts which are loaded when a chart needs them, so a bundler of an
// application puts them into chunks of their own: the check of the
// definitions, the colors of d3, the parts of maps, the parquet reader, the
// screenshot of the images and the transitions. The standalone script has
// them in itself, see lazy-static.js.
export const lazy = {
    validate: () => import('@/utils/validate.js'),
    transform: () => import('@/utils/transform-types.js'),
    intl: () => import('@/utils/locale-intl.js'),
    colorLegend: () => import('@/comp/ColorLegend.vue'),
    colors: () => import('@/utils/colors.js'),
    geoMap: () => import('@/coords/geo-map.js'),
    polar: () => import('@/coords/polar-plot.js'),
    geo: () => import('@/utils/geo.js'),
    parquet: () => import('@/utils/parquet.js'),
    exporting: () => import('@/utils/export.js'),
    screenshot: () => import('modern-screenshot'),
    transition: () => import('d3-transition'),
};
