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
        text: `Mappings name the columns of the data, a scale with an <code>orientation</code> is a place in the
            coordinate system: the share is horizontal, the countries are a <code>point</code> scale, one row of
            <code>step</code> pixels each, so the chart is as high as its countries. The <code>filter</code> keeps
            the rows of renewables of two years. A plot draws an SVG element per row, its props are the
            attributes, <code>@x:scaled</code> is the position of the value of <code>x</code>. Nothing else is
            drawn: no axes, no legend, no hover.`,
        add: {
            data: 'data/electricity.csv',
            options: { locale: 'en', margins: { top: 10, right: 10, bottom: 10, left: 10 } },
            filter: { source: 'renewable', year: ['2019', '2025'] },
            mapping: {
                source: { column: 'source' },
                year: { column: 'year' },
                x: { column: 'share', type: 'numeric', scale: { orientation: 'horizontal', domain: [0, 1] } },
                y: { column: 'country', scale: { type: 'point', orientation: 'vertical', range: [0, '@height'], step: 15, padding: 0.5 } },
            },
            plot: { type: 'svg:circle', props: { cx: '@x:scaled', cy: '@y:scaled', r: 4 } },
        },
    },
    {
        id: 'categories',
        title: 'Categories and their props',
        text: `A mapping with <code>props</code> has categories, every category has its props, e.g. a name and a
            color, any other prop as well. <code>categories</code> of a plot groups its rows by them,
            <code>@color</code> is the prop of the category of the row: the earlier year is muted, the later
            one stands out.`,
        add: {
            mapping: {
                year: { props: { categories: {
                    2019: { name: '2019', color: colors.from },
                    2025: { name: '2025', color: colors.to },
                } } },
            },
            plot: { type: 'svg:circle', categories: ['year'], props: { cx: '@x:scaled', cy: '@y:scaled', r: 4.5, fill: '@color' } },
        },
    },
    {
        id: 'layers',
        title: 'Plots are layers',
        text: `A list of plots is drawn in its order, the first one at the back. <code>cartesian:line</code>
            draws a path per group of its <code>categories</code>, here a country, through its two rows: the bar
            of the dumbbell, below the circles.`,
        add: {
            plot: [
                {
                    type: 'cartesian:line', categories: ['y'],
                    props: { d: { x: '@x:scaled', y: '@y:scaled' }, stroke: '#D6D3D1', 'stroke-width': 3, 'stroke-linecap': 'round' },
                },
                { type: 'svg:circle', categories: ['year'], props: { cx: '@x:scaled', cy: '@y:scaled', r: 4.5, fill: '@color' } },
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
                    axis: { position: 'left', tickMarks: false },
                },
            },
        },
    },
    {
        id: 'legend',
        title: 'Legend and hover',
        text: `A legend and a hover are parts of mappings, too. The entries of the legend hide and show their
            year, the hover shows the rows of the country under the pointer, also by the keyboard.
            <code>highlight-</code> props replace the ones of the elements of the country under the pointer.`,
        add: {
            options: { title: 'Renewables in the electricity of Europe', subtitle: 'Share of the generation, 2019 and 2025' },
            mapping: {
                year: { name: 'Year', legend: { symbol: 'circle', onlyData: true }, hover: {} },
                x: { name: 'Share', hover: { format: '.1%' } },
            },
            plot: [
                {
                    type: 'cartesian:line', categories: ['y'],
                    props: {
                        d: { x: '@x:scaled', y: '@y:scaled' }, stroke: '#D6D3D1', 'stroke-width': 3, 'stroke-linecap': 'round',
                        'highlight-stroke': '#78716C',
                    },
                },
                {
                    type: 'svg:circle', categories: ['year'],
                    props: { cx: '@x:scaled', cy: '@y:scaled', r: 4.5, fill: '@color', 'highlight-r': 6 },
                },
            ],
        },
    },
    {
        id: 'labels',
        title: 'Labels and annotations',
        text: `One more plot writes the share of 2025 in a column at the right, its <code>filter</code> keeps the
            rows of that year, its <code>x</code> is relative to the width of the plot area and its text a
            <code>format</code> of the value. An annotation is a plot of its own values: a line at half of the
            electricity.`,
        add: {
            options: { margins: { right: 44 } },
            plot: [
                {
                    type: 'cartesian:line', categories: ['y'],
                    props: {
                        d: { x: '@x:scaled', y: '@y:scaled' }, stroke: '#D6D3D1', 'stroke-width': 3, 'stroke-linecap': 'round',
                        'highlight-stroke': '#78716C',
                    },
                },
                {
                    type: 'svg:circle', categories: ['year'],
                    props: { cx: '@x:scaled', cy: '@y:scaled', r: 4.5, fill: '@color', 'highlight-r': 6 },
                },
                {
                    type: 'svg:text', filter: { year: '2025' },
                    props: {
                        x: { prop: 'relative', ref: 'innerWidth', offset: 10 }, y: '@y:scaled', 'dominant-baseline': 'central', 'font-size': 10.5,
                        fill: colors.to, text: { prop: 'format', ref: 'x', format: '.0%' },
                    },
                },
            ],
            annotations: [{ type: 'line', x: 0.5, label: 'half', props: { 'stroke-dasharray': '3 3' } }],
        },
    },
    {
        id: 'props',
        title: 'Props of the width',
        text: `A prop is a value, a reference or a computed value, e.g. <code>steps</code> of the width of the
            visualisation (<code>totalWidth</code>): on a phone the rows are closer, the names have less space and
            the axis has fewer ticks. The same works for fonts, the place of the legend or a message instead of
            the chart.`,
        add: {
            options: { margins: { left: { prop: 'steps', ref: 'totalWidth', steps: [{ cut: 0, value: 120 }, { cut: 560, value: 165 }] } } },
            mapping: {
                x: { axis: { ticks: { prop: 'steps', ref: 'totalWidth', steps: [{ cut: 0, value: 3 }, { cut: 560, value: 5 }] } } },
                y: { scale: { step: { prop: 'steps', ref: 'totalWidth', steps: [{ cut: 0, value: 13 }, { cut: 560, value: 15 }] } } },
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
                        patch: { mapping: { year: { props: { categories: { [year]: { name: year, color: colors.from } } } } } },
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
