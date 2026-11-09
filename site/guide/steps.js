// the steps of the page "How it works" (guide.html): a dumbbell chart of the
// share of renewables of the electricity of European countries, 2019 and
// 2025, every step adds to the definition of the one before (`add`), its
// definition (`def`) is the merge of the additions, lists are replaced
import { deepMerge as merge } from '../../src/utils/merge.js';

// the colors of the years, the earlier one is muted
const colors = { from: '#A8A29E', to: '#0F766E' };

const steps = [
    {
        id: 'rows',
        title: 'A circle per row',
        text: `Dims name the columns of the data, a text is the column. <code>x</code> and <code>y</code> are
            the places of the coordinate system: the share is horizontal, the countries are a <code>point</code>
            scale, one row of <code>step</code> pixels each, so the chart is as high as its countries, their axes
            are left out for now (<code>false</code>). The <code>filter</code> keeps the rows of renewables of two
            years. A mark of the type <code>point</code> draws a circle per row at the positions of its
            <code>x</code> and <code>y</code>, its other keys are the attributes which differ from the ones of
            the type. Nothing else is drawn: no axes, no legend, no hover.`,
        add: {
            data: 'data/electricity.csv',
            locale: 'en',
            filter: { source: 'renewable', year: ['2019', '2025'] },
            dims: {
                source: 'source',
                year: { column: 'year', type: 'categorical' },
                x: { column: 'share', domain: [0, 1], axis: false },
                y: { column: 'country', scale: { type: 'point', step: 15, padding: 0.5 }, axis: false },
            },
            marks: { type: 'point', r: 4 },
        },
    },
    {
        id: 'categories',
        title: 'Categories and their props',
        text: `A dim with <code>categories</code> has props of every category, e.g. a name and a color, any
            other prop as well. <code>by</code> of a mark groups its rows by them, the color of the category of
            the row is the default color of a point: the earlier year is muted, the later one stands out.`,
        add: {
            dims: {
                year: { categories: {
                    2019: { name: '2019', color: colors.from },
                    2025: { name: '2025', color: colors.to },
                } },
            },
            marks: { type: 'point', by: 'year', r: 4.5 },
        },
    },
    {
        id: 'layers',
        title: 'Marks are layers',
        text: `A list of marks is drawn in its order, the first one at the back. A <code>line</code> draws a path
            per group of <code>by</code>, here a country, through its two rows: the bar of the dumbbell, below the
            circles.`,
        add: {
            marks: [
                { type: 'line', by: 'y', stroke: '#D6D3D1', 'stroke-width': 3, 'stroke-linecap': 'round' },
                { type: 'point', by: 'year', r: 4.5 },
            ],
        },
    },
    {
        id: 'transforms',
        title: 'Transforms, axes and the order',
        text: `Transforms add columns in the browser: <code>lookup</code> the names of the countries of another
            file, <code>mean</code> the share of 2025 to every row of the country. The countries are in the
            <code>order</code> of this share. The axes are parts of their dims, the margins around the plot
            area are measured of their labels.`,
        add: {
            transform: [
                { type: 'lookup', column: 'country', data: 'data/countries.csv', key: 'code', value: 'name', as: 'name' },
                { type: 'mean', column: 'share', by: ['country', 'source'], base: { year: ['2025', '2025'] }, as: 'latest' },
            ],
            dims: {
                latest: { column: 'latest', type: 'numeric' },
                x: { axis: { position: 'top', format: '.0%', ticks: 5 }, grid: true },
                y: {
                    column: 'name',
                    scale: { order: { by: 'latest', descending: true } },
                    axis: { tickMarks: false },
                },
            },
        },
    },
    {
        id: 'legend',
        title: 'Legend and hover',
        text: `A legend and a hover are parts of dims, too. The entries of the legend hide and show their
            year, their <code>symbol</code> <code>auto</code> is the one of the marks of the year, a dot in its
            color and size. The hover shows the rows of the country under the pointer, also by the keyboard, and
            highlights their year in the legend. The attributes of <code>highlight</code> replace the ones of the
            elements of the country under the pointer.`,
        add: {
            title: 'Renewables in the electricity of Europe',
            subtitle: 'Share of the generation, 2019 and 2025',
            dims: {
                year: { name: 'Year', legend: { symbol: 'auto', onlyData: true }, hover: {} },
                x: { name: 'Share', hover: { format: '.1%' } },
            },
            marks: [
                { type: 'line', by: 'y', stroke: '#D6D3D1', 'stroke-width': 3, 'stroke-linecap': 'round', highlight: { stroke: '#78716C' } },
                { type: 'point', by: 'year', r: 4.5, highlight: { r: 6 } },
            ],
        },
    },
    {
        id: 'labels',
        title: 'Labels and annotations',
        text: `One more mark writes the share of 2025 in a column at the right, its <code>filter</code> keeps the
            rows of that year, its <code>x</code> is an expression of the width of the plot area and its text a
            <code>format</code> of the value, the right margin is measured of these texts. An annotation is a mark of its own values: a line at half of the
            electricity, with a label on the plot and an entry of the legend (<code>legend</code>), after the
            years.`,
        add: {
            marks: [
                { type: 'line', by: 'y', stroke: '#D6D3D1', 'stroke-width': 3, 'stroke-linecap': 'round', highlight: { stroke: '#78716C' } },
                { type: 'point', by: 'year', r: 4.5, highlight: { r: 6 } },
                {
                    type: 'text', filter: { year: '2025' },
                    x: '=@innerWidth + 10', 'dominant-baseline': 'central', 'font-size': 10.5,
                    fill: colors.to, text: "=format(@x, '.0%')",
                },
            ],
            annotations: [{ type: 'line', x: 0.5, label: 'half', legend: 'Half of the generation', props: { 'stroke-dasharray': '3 3' } }],
        },
    },
    {
        id: 'props',
        title: 'Expressions of the width',
        text: `A value can be an expression, e.g. <code>steps</code> of the width of the visualisation
            (<code>totalWidth</code>): on a phone the rows are closer, the names have less space and the axis
            has fewer ticks. The same works for fonts, the place of the legend or a message instead of the
            chart.`,
        add: {
            dims: {
                x: { axis: { ticks: '=steps(@totalWidth, {0: 3, 560: 5})' } },
                // the names are cut at their max-width, the margin is measured of them
                y: { scale: { step: '=steps(@totalWidth, {0: 13, 560: 15})' }, axis: { labels: { props: { 'max-width': '=steps(@totalWidth, {0: 110, 560: 160})' } } } },
            },
        },
    },
    {
        id: 'controls',
        title: 'Controls set globals',
        text: `A control sets a global, and any part of the definition can be an expression of it: the radio
            buttons choose the source, the <code>filter</code> refers to the global
            (<code>@globals.source</code>), the subtitle is a template of it and the annotation is left out for
            nuclear power (<code>match</code> of the global). The select sets the first year, the legend shows
            the years of the rows. The choice is the state of the chart, a page can keep it.`,
        add: {
            globals: { source: 'renewable', from: '2019' },
            filter: { source: '@globals.source', year: ['@globals.from', '2025'] },
            subtitle: 'Share of the generation of {source:name}, {from} and 2025',
            controls: [
                {
                    type: 'radio', global: 'source', name: 'Source',
                    values: [
                        { value: 'renewable', name: 'renewables' },
                        { value: 'nuclear', name: 'nuclear power' },
                        { value: 'non-renewable', name: 'fossil fuels' },
                    ],
                },
                { type: 'select', global: 'from', name: 'From', values: ['2019', '2020', '2021', '2022', '2023'] },
            ],
            dims: {
                year: { categories: Object.fromEntries(['2020', '2021', '2022', '2023'].map(year => [year, { name: year, color: colors.from }])) },
            },
            annotations: "=match(@source, {nuclear: literal([])}, literal([{type: 'line', x: 0.5, label: 'half', legend: 'Half of the generation', props: {'stroke-dasharray': '3 3'}}]))",
        },
    },
];

// the definitions of the steps, the additions of all steps before, lists are replaced
const replace = (target, source) => source;
let def = {};
export default steps.map(step => {
    def = merge(def, step.add, { arrayMerge: replace });
    return { ...step, def };
});
