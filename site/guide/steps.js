// the steps of the page "How it works" (guide.html): a chart of the fuel
// prices, every step adds to the definition of the one before (`add`), its
// definition (`def`) is the merge of the additions, lists are replaced
import merge from 'deepmerge';

const steps = [
    {
        id: 'rows',
        title: 'A circle per row',
        text: `Two mappings name the columns of the data and their scales, the orientation of a scale is its
            place in the coordinate system. A plot draws an SVG element per row, its props are the attributes,
            <code>@x:scaled</code> is the position of the value of the mapping <code>x</code> of the row. Nothing
            else is drawn: no axes, no legend, no hover.`,
        add: {
            data: 'data/fuel-prices.csv',
            options: { height: 260, locale: 'en' },
            mapping: {
                x: { column: 'week', type: 'date', scale: { type: 'utc', orientation: 'horizontal' } },
                y: { column: 'price', type: 'numeric', scale: { orientation: 'vertical' } },
            },
            plot: { type: 'svg:circle', props: { cx: '@x:scaled', cy: '@y:scaled', r: 1.5 } },
        },
    },
    {
        id: 'categories',
        title: 'Categories and their props',
        text: `A mapping with <code>props</code> has categories, every category has its props, e.g. a name and a
            color, any other prop as well. <code>categories</code> of a plot groups its rows, a line is drawn per
            group, <code>@color</code> is the prop of the category of the group.`,
        add: {
            mapping: {
                fuel: { column: 'fuel', props: { categories: {
                    petrol: { name: 'Petrol', color: '#2A6EBB' },
                    diesel: { name: 'Diesel', color: '#C4452C' },
                } } },
            },
            plot: {
                type: 'cartesian:line', categories: ['fuel'],
                props: { d: { x: '@x:scaled', y: '@y:scaled' }, stroke: '@color', 'stroke-width': 2, fill: 'none' },
            },
        },
    },
    {
        id: 'axes',
        title: 'Axes',
        text: `An axis is a part of its mapping. The margins are the space around the plot area, the axes are
            drawn into them.`,
        add: {
            options: { margins: { top: 10, right: 10, bottom: 28, left: 40 } },
            mapping: {
                x: { axis: { position: 'bottom' } },
                y: { axis: { position: 'left', format: '.2f', grid: true } },
            },
        },
    },
    {
        id: 'legend',
        title: 'Legend and hover',
        text: `A legend and a hover are parts of mappings, too. The entries of the legend hide and show their
            categories, the hover shows the rows at the position of the pointer, also by the keyboard.
            <code>highlight-</code> props replace the ones of the elements of the category under the pointer.`,
        add: {
            mapping: {
                fuel: { name: 'Fuel', legend: { symbol: 'line' }, hover: {} },
            },
            plot: {
                type: 'cartesian:line', categories: ['fuel'],
                props: {
                    d: { x: '@x:scaled', y: '@y:scaled' }, stroke: '@color', 'stroke-width': 2, fill: 'none',
                    'highlight-stroke-width': 3.5,
                },
            },
        },
    },
    {
        id: 'labels',
        title: 'More plots, annotations',
        text: `Plots are layers, a text per category at its last row is one more plot (<code>select</code> picks
            the row, <code>dodge</code> moves the texts apart). <code>@name</code> is the prop of the category.
            Annotations are plots of their own values, e.g. a band from the start of the war in Ukraine and a line
            at 2 euros.`,
        add: {
            options: { margins: { right: 52 } },
            plot: [
                {
                    type: 'cartesian:line', categories: ['fuel'],
                    props: {
                        d: { x: '@x:scaled', y: '@y:scaled' }, stroke: '@color', 'stroke-width': 2, fill: 'none',
                        'highlight-stroke-width': 3.5,
                    },
                },
                {
                    type: 'svg:text', categories: ['fuel'], select: 'last', dodge: 13,
                    props: { x: '@x:scaled', dx: 5, y: '@y:scaled', 'dominant-baseline': 'middle', fill: '@color', 'font-size': 12, text: '@name' },
                },
            ],
            annotations: [
                { type: 'band', x: ['2022-02-24', null], label: 'War in Ukraine' },
                { type: 'line', y: 2, props: { 'stroke-dasharray': '3 3' } },
            ],
        },
    },
    {
        id: 'props',
        title: 'Props of the width',
        text: `A prop is a value, a reference or a computed value, e.g. <code>steps</code> of the width of the
            visualisation (<code>totalWidth</code>): a lower chart with fewer ticks on a phone. The same works for
            margins, fonts, the place of the legend or a message instead of the chart.`,
        add: {
            options: {
                height: { prop: 'steps', ref: 'totalWidth', steps: [{ cut: 0, value: 200 }, { cut: 560, value: 260 }] },
            },
            mapping: {
                x: { axis: { ticks: { prop: 'steps', ref: 'totalWidth', steps: [{ cut: 0, value: 3 }, { cut: 560, value: 8 }] } } },
            },
        },
    },
    {
        id: 'patches',
        title: 'Form elements patch the definition',
        text: `An entry of a form element sets a global and patches any part of the definition: the column of
            <code>y</code> is a template of the global, the index is a transform of the prices in the browser,
            its axis has another format and of the annotations only the band is left (lists are replaced,
            <code>null</code> removes a part). The choice is the state of the chart, a page can keep it.`,
        add: {
            globals: { unit: 'price' },
            transform: { type: 'index', column: 'price', as: 'index', by: 'fuel', base: { week: ['2021-01-01', '2021-12-31'] } },
            formElements: [{
                id: 'unit', name: 'Show', ref: 'unit', type: 'radio',
                values: [
                    { id: 'price', name: 'Euro per litre', value: 'price' },
                    { id: 'index', name: 'Index, 2021 = 100', value: 'index', patch: {
                        mapping: { y: { axis: { format: '.0f' } } },
                        annotations: [{ type: 'band', x: ['2022-02-24', null], label: 'War in Ukraine' }],
                    } },
                ],
            }],
            mapping: { y: { column: '{unit}' } },
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
