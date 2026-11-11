// the parts which are loaded when a chart needs them, so a bundler of an
// application puts them into chunks of their own: the check of the
// definitions, the migration of definitions of gen-vis 4, the colors of d3,
// the parts of maps, the parquet reader, the SVG of the images and their PNG and the table of
// the rows shown.
export const lazy = {
    validate: () => import('@/utils/validate.js'),
    migrate: () => import('@/utils/migrate.js'),
    transform: () => import('@/utils/transform-types.js'),
    inside: () => import('@/marks/inside.js'),
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
    table: () => import('@/utils/table.js'),
};
