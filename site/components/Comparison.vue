<template>
    <div class="comparison">
        <div class="table-scroll" tabindex="0" role="region" aria-label="Comparison with other chart libraries">
            <table>
                <thead>
                    <tr>
                        <th scope="col"/>
                        <th v-for="lib in libraries" :key="lib.name" scope="col">
                            <a v-if="lib.url" :href="lib.url">{{ lib.name }}</a>
                            <template v-else>{{ lib.name }}</template>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in rows" :key="row.label">
                        <th scope="row">{{ row.label }}</th>
                        <td v-for="(cell, i) in row.cells" :key="i" :class="{ none: cell == '—' }">{{ cell }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <p class="note">
            From the documentation of the libraries in October 2026, the sizes are the gzipped
            browser builds of their npm packages (all of each, smaller with fewer modules or
            tree shaking in a bundler). Corrections are welcome as
            <a href="https://github.com/petres/gen-vis/issues">issues</a>.
        </p>
    </div>
</template>

<script>
// gen-vis and other libraries of charts in the browser, the cells in the order of the libraries
const libraries = [
    { name: 'gen-vis' },
    { name: 'Vega-Lite', url: 'https://vega.github.io/vega-lite/' },
    { name: 'ECharts', url: 'https://echarts.apache.org/' },
    { name: 'Plotly.js', url: 'https://plotly.com/javascript/' },
    { name: 'Highcharts', url: 'https://www.highcharts.com/' },
    { name: 'Chart.js', url: 'https://www.chartjs.org/' },
    { name: 'Observable Plot', url: 'https://observablehq.com/plot/' },
];

const rows = [
    {
        label: 'A chart is',
        cells: ['a JSON file', 'a JSON file', 'a JS object (options)', 'a JSON figure', 'a JS object (options)', 'a JS object (config)', 'JS code'],
    },
    {
        label: 'Shared parts of definitions',
        cells: ['parents and mixins, any part', 'config of defaults', 'themes', 'templates of the layout', 'global options, themes', 'global defaults', '—'],
    },
    {
        label: 'Loads its data',
        cells: ['CSV, TSV, JSON, parquet', 'CSV, TSV, JSON, TopoJSON', '—', '—', 'CSV, JSON, Google Sheets (data module)', '—', '—'],
    },
    {
        label: 'Transforms of the data',
        cells: ['index, share, rolling, cumulative, year, align', 'calculate, aggregate, window, fold, …', 'filter, sort (dataset)', '— (removed in v3)', '—', '—', 'bin, group, stack, window, …'],
    },
    {
        label: 'Controls in the definition',
        cells: ['radio, select, slider, they change columns, filters, scales', 'inputs bound to parameters', 'legend, data zoom, timeline', 'buttons, dropdowns, sliders', 'legend, range selector (Stock)', 'legend', '—'],
    },
    {
        label: 'Kinds of charts',
        cells: ['lines, areas, bars, points, texts, polar plots, maps', 'many (a grammar of marks)', 'many, also graphs, sankey, 3D (GL)', 'many, also 3D and statistical', 'many, also stock and Gantt', '8 types', 'many (a grammar of marks)'],
    },
    {
        label: 'Maps',
        cells: ['GeoJSON, TopoJSON, d3 projections', 'GeoJSON, TopoJSON, projections', 'GeoJSON', 'geo, choropleth, tiles', 'Highcharts Maps (a product of its own)', 'plugin', 'GeoJSON, projections'],
    },
    {
        label: 'Rendering',
        cells: ['SVG', 'SVG or canvas', 'canvas or SVG', 'SVG, WebGL', 'SVG', 'canvas', 'SVG'],
    },
    {
        label: 'Keyboard and screen readers',
        cells: ['hover by keys, read by screen readers', 'ARIA of SVG marks', 'ARIA description, decal patterns', 'limited', 'accessibility module, also keys', 'up to the page (canvas)', 'ARIA of marks'],
    },
    {
        label: 'Export',
        cells: ['PNG, CSV, clipboard', 'PNG, SVG (vega-embed)', 'PNG, SVG, data view', 'PNG, SVG', 'PNG, JPEG, PDF, SVG, CSV, XLS (modules)', 'image by its API', '—'],
    },
    {
        label: 'Vue',
        cells: ['a component of Vue 3, a standalone script', 'vega-embed into an element', 'vue-echarts', 'wrappers of the community', 'highcharts-vue', 'vue-chartjs', 'an element of its own'],
    },
    {
        label: 'Size (gzipped)',
        cells: ['141 kB with Vue, as a module 90 kB at first', '280 kB (Vega, Vega-Lite, vega-embed)', '367 kB', '1 475 kB', '102 kB, more with modules', '70 kB', '68 kB, with d3 160 kB'],
    },
    {
        label: 'License',
        cells: ['MIT', 'BSD-3-Clause', 'Apache-2.0', 'MIT', 'commercial, free for personal and educational use', 'MIT', 'ISC'],
    },
    {
        label: 'Made by',
        cells: ['one author', 'UW Interactive Data Lab and others', 'Apache Software Foundation', 'Plotly', 'Highsoft', 'community', 'Observable'],
    },
];

export default {
    data: () => ({ libraries, rows }),
};
</script>
