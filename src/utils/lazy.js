// the parts which are loaded when a chart needs them, so a bundler of an
// application puts them into chunks of their own: the check of the
// definitions, the colors of d3, the parts of maps, the parquet reader,
// the SVG of the images and their PNG.
export const lazy = {
    validate: () => import('@/utils/validate.js'),
    transform: () => import('@/utils/transform-types.js'),
    inside: () => import('@/plots/inside.js'),
    intl: () => import('@/utils/locale-intl.js'),
    colorLegend: () => import('@/comp/color-legend.js'),
    colors: () => import('@/utils/colors.js'),
    geoMap: () => import('@/coords/geo-map.js'),
    polar: () => import('@/coords/polar-plot.js'),
    geo: () => import('@/utils/geo.js'),
    parquet: () => import('@/utils/parquet.js'),
    exporting: () => import('@/utils/export.js'),
    svg: () => import('@/utils/export-svg.js'),
    raster: () => import('@/utils/raster.js'),
};
