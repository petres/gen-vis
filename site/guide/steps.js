// the steps of the page "How it works" (guide.html): a dumbbell chart of the
// share of renewables of the electricity of European countries, 2019 and
// 2025, every step adds to the definition of the one before (`add`), its
// definition (`def`) is the merge of the additions, lists are replaced
import merge from 'deepmerge';

// the colors of the years, the earlier one is muted
const colors = { from: '#A8A29E', to: '#0F766E' };

const steps = [
    {
        id: 'rows',
        title: 'A circle per row',
        text: `Mappings name the columns of the data, a text is the column. <code>x</code> and <code>y</code> are
            the places of the coordinate system: the share is horizontal, the countries are a <code>point</code>
            scale, one row of <code>step</code> pixels each, so the chart is as high as its countries, their axes
            are left out for now (<code>false</code>). The <code>filter</code> keeps the rows of renewables of two
            years. A plot of the type <code>point</code> draws a circle per row at <code>@x:scaled</code> and
            <code>@y:scaled</code>, the positions of the values, its props are the attributes which differ from
            the ones of the type. Nothing else is drawn: no axes, no legend, no hover.`,
        add: {
            data: 'data/electricity.csv',
            options: { locale: 'en', margins: { top: 10, right: 10, bottom: 10, left: 10 } },
            filter: { source: 'renewable', year: ['2019', '2025'] },
            mapping: {
                source: 'source',
                year: { column: 'year', type: 'categorical' },
                x: { column: 'share', domain: [0, 1], axis: false },
                y: { column: 'country', scale: { type: 'point', range: [0, '@height'], step: 15, padding: 0.5 }, axis: false },
            },
            plot: { type: 'point', props: { r: 4 } },
        },
    },
    {
        id: 'categories',
        title: 'Categories and their props',
        text: `A mapping with <code>categories</code> has props of every category, e.g. a name and a color, any
            other prop as well. <code>by</code> of a plot groups its rows by them, <code>@color</code> is the prop
            of the category of the row, the default color of a point: the earlier year is muted, the later one
            stands out.`,
        add: {
            mapping: {
                year: { categories: {
                    2019: { name: '2019', color: colors.from },
                    2025: { name: '2025', color: colors.to },
                } },
            },
            plot: { type: 'point', by: 'year', props: { r: 4.5 } },
        },
    },
    {
        id: 'layers',
        title: 'Plots are layers',
        text: `A list of plots is drawn in its order, the first one at the back. A <code>line</code> draws a path
            per group of <code>by</code>, here a country, through its two rows: the bar of the dumbbell, below the
            circles.`,
        add: {
            plot: [
                { type: 'line', by: 'y', props: { stroke: '#D6D3D1', 'stroke-width': 3, 'stroke-linecap': 'round' } },
                { type: 'point', by: 'year', props: { r: 4.5 } },
            ],
        },
    },
    {
        id: 'transforms',
        title: 'Transforms, axes and the order',
        text: `Transforms add columns in the browser: <code>lookup</code> the names of the countries of another
            file, <code>mean</code> the share of 2025 to every row of the country. The countries are in the
            <code>order</code> of this share. The axes are parts of their mappings, they are drawn into the
            margins.`,
        add: {
            transform: [
                { type: 'lookup', column: 'country', data: 'data/countries.csv', key: 'code', value: 'name', as: 'name' },
                { type: 'mean', column: 'share', by: ['country', 'source'], base: { year: ['2025', '2025'] }, as: 'latest' },
            ],
            options: { margins: { top: 30, right: 16, bottom: 10, left: 165 } },
            mapping: {
                latest: { column: 'latest', type: 'numeric' },
                x: { axis: { position: 'top', format: '.0%', grid: true, ticks: 5 } },
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
        text: `A legend and a hover are parts of mappings, too. The entries of the legend hide and show their
            year, their <code>symbol</code> <code>auto</code> is the one of the plots of the year, a dot in its
            color and size. The hover shows the rows of the country under the pointer, also by the keyboard, and
            highlights their year in the legend. The props of <code>highlight</code> replace the ones of the
            elements of the country under the pointer.`,
        add: {
            options: { title: 'Renewables in the electricity of Europe', subtitle: 'Share of the generation, 2019 and 2025' },
            mapping: {
                year: { name: 'Year', legend: { symbol: 'auto', onlyData: true }, hover: {} },
                x: { name: 'Share', hover: { format: '.1%' } },
            },
            plot: [
                {
                    type: 'line', by: 'y',
                    props: { stroke: '#D6D3D1', 'stroke-width': 3, 'stroke-linecap': 'round' },
                    highlight: { stroke: '#78716C' },
                },
                { type: 'point', by: 'year', props: { r: 4.5 }, highlight: { r: 6 } },
            ],
        },
    },
    {
        id: 'labels',
        title: 'Labels and annotations',
        text: `One more plot writes the share of 2025 in a column at the right, its <code>filter</code> keeps the
            rows of that year, its <code>x</code> is an expression of the width of the plot area and its text a
            <code>format</code> of the value. An annotation is a plot of its own values: a line at half of the
            electricity, with a label on the plot and an entry of the legend (<code>legend</code>), after the
            years.`,
        add: {
            options: { margins: { right: 44 } },
            plot: [
                {
                    type: 'line', by: 'y',
                    props: { stroke: '#D6D3D1', 'stroke-width': 3, 'stroke-linecap': 'round' },
                    highlight: { stroke: '#78716C' },
                },
                { type: 'point', by: 'year', props: { r: 4.5 }, highlight: { r: 6 } },
                {
                    type: 'text', filter: { year: '2025' },
                    props: {
                        x: { '+': ['@innerWidth', 10] }, 'dominant-baseline': 'central', 'font-size': 10.5,
                        fill: colors.to, text: { format: ['@x', '.0%'] },
                    },
                },
            ],
            annotations: [{ type: 'line', x: 0.5, label: 'half', legend: 'Half of the generation', props: { 'stroke-dasharray': '3 3' } }],
        },
    },
    {
        id: 'props',
        title: 'Props of the width',
        text: `A prop is a value, a reference or an expression, e.g. <code>steps</code> of the width of the
            visualisation (<code>totalWidth</code>): on a phone the rows are closer, the names have less space and
            the axis has fewer ticks. The same works for fonts, the place of the legend or a message instead of
            the chart.`,
        add: {
            options: { margins: { left: { steps: ['@totalWidth', { 0: 120, 560: 165 }] } } },
            mapping: {
                x: { axis: { ticks: { steps: ['@totalWidth', { 0: 3, 560: 5 }] } } },
                y: { scale: { step: { steps: ['@totalWidth', { 0: 13, 560: 15 }] } } },
            },
        },
    },
    {
        id: 'patches',
        title: 'Form elements patch the definition',
        text: `An entry of a form element sets a global and patches any part of the definition: the radio buttons
            choose the source, the <code>filter</code> refers to the global (<code>@source</code>), the subtitle is a
            template of it and nuclear power patches the annotation away (<code>null</code> removes a part). The
            select sets the first year, its entry patches the category of the year. The choice is the state of
            the chart, a page can keep it.`,
        add: {
            globals: { source: 'renewable', from: '2019' },
            filter: { source: '@source', year: ['@from', '2025'] },
            options: { subtitle: 'Share of the generation of {source:name}, {from} and 2025' },
            formElements: [
                {
                    id: 'source', name: 'Source', ref: 'source', type: 'radio',
                    values: [
                        { id: 'renewable', name: 'renewables', value: 'renewable' },
                        { id: 'nuclear', name: 'nuclear power', value: 'nuclear', patch: { annotations: null } },
                        { id: 'non-renewable', name: 'fossil fuels', value: 'non-renewable' },
                    ],
                },
                {
                    id: 'from', name: 'From', ref: 'from', type: 'select',
                    values: ['2019', '2020', '2021', '2022', '2023'].map(year => ({
                        id: year, name: year, value: year,
                        patch: { mapping: { year: { categories: { [year]: { name: year, color: colors.from } } } } },
                    })),
                },
            ],
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
