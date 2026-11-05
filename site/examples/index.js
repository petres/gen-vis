// the examples of the page, a definition and the css of its look, the texts
// of the files are shown in the editors as they are
import fuelDef from './fuel-prices.json?raw';
import fuelCss from './fuel-prices.css?raw';
import fossilDef from './fossil.json?raw';
import fossilCss from './fossil.css?raw';
import carsDef from './cars.json?raw';
import carsCss from './cars.css?raw';
import temperatureDef from './temperature.json?raw';
import temperatureCss from './temperature.css?raw';
import electricityDef from './electricity.json?raw';
import electricityCss from './electricity.css?raw';
import renewablesDef from './renewables.json?raw';
import renewablesCss from './renewables.css?raw';
import daysDef from './days.json?raw';
import daysCss from './days.css?raw';
import mixDef from './mix.json?raw';
import mixCss from './mix.css?raw';
import warmerDef from './warmer.json?raw';
import warmerCss from './warmer.css?raw';

export default [
    {
        id: 'line',
        name: 'Line chart',
        look: 'Editorial',
        theme: 'theme-editorial',
        description: 'Two lines with labels at their ends, an annotated band, a reference line and a text, the domain includes the line at €2. The other line fades while one is highlighted, by the hover or the legend. The euro sign is a change of the English locale in the definition.',
        features: ['line', 'text with select and dodge', 'annotations', 'scale: include', 'highlight, others', 'locale'],
        def: fuelDef,
        css: fuelCss,
    },
    {
        id: 'bars',
        name: 'Stacked bars',
        look: 'Dark dashboard',
        theme: 'theme-dashboard',
        description: 'Two radio buttons change the column of the bars, a template of the globals: the unit (TWh or Mt CO₂) and absolute values or shares, which also patch the axis and the subtitle, the subtitle names the unit of the entry. The bars and the axis move to their new values, the other segments fade while one is highlighted.',
        features: ['bar', 'stacked', 'formElements: radio, patch, globals', 'column templates', 'highlight, others', 'transition'],
        def: fossilDef,
        css: fossilCss,
    },
    {
        id: 'area',
        name: 'Stacked area',
        look: 'Soft',
        theme: 'theme-soft',
        description: 'Shares stacked to 100%, drawn below the grid so its lines run across the areas. Click a legend entry to hide it, the other areas slide into its place, double-click to show only it. The hover follows the pointer, the other areas fade.',
        features: ['area', 'stacked', 'layer', 'curve', 'hover: pointer', 'highlight, others', 'transition'],
        def: carsDef,
        css: carsCss,
    },
    {
        id: 'polar',
        name: 'Polar lines',
        look: 'Risograph poster',
        theme: 'theme-poster',
        description: 'Every year since 2019 around a circle, against the average of 1991–2020, the other years fade while one is highlighted. In German or English: the entries of the language patch the texts and the locale, the months and the numbers follow.',
        features: ['coord: polar', 'line', 'annotations', 'patch: locale', 'highlight, others'],
        def: temperatureDef,
        css: temperatureCss,
    },
    {
        id: 'map',
        name: 'Choropleth map',
        look: 'Atlas',
        theme: 'theme-atlas',
        description: 'TopoJSON of Europe, classes of a threshold scale, a slider over the years of the data and radio buttons of the source which also changes the colors and names the legend, a vertical scale beside the map. The countries fade into their new colors, the hover follows the pointer.',
        features: ['coord: geo', 'region', 'formElements: slider', 'filter', 'legend: right, vertical', 'transition'],
        def: electricityDef,
        css: electricityCss,
    },
    {
        id: 'ranking',
        name: 'Sorted bars',
        look: 'Annual report',
        theme: 'theme-report',
        description: 'The countries sorted by their share and grouped by region, with a space between the groups, their names and regions are looked up in a second file. The hover has no box, it highlights the bar and shows its value, also over the names. The slider moves the bars to the order of another year.',
        features: ['scale: order, groups', 'transform: lookup', 'axis.labels', 'hover: box false', 'highlight, others'],
        def: renewablesDef,
        css: renewablesCss,
    },
    {
        id: 'jitter',
        name: 'Histogram and jitter',
        look: 'Field notebook',
        theme: 'theme-field',
        description: 'The temperature of every day of a year in classes of 1 °C, computed from the days by a transform, and below it every day of every year as a dot, scattered vertically by random numbers which stay the same on every draw. The slider picks the year of the histogram and of the orange dots, the hover shows its days in the class under the pointer.',
        features: ['transform: bin, random', 'bar: x0, x1 (range bars)', 'stackBy', 'band scale + jitter', 'once, @plot:right', 'formElements: slider'],
        def: daysDef,
        css: daysCss,
    },
    {
        id: 'grid',
        name: 'Grid of facets',
        look: 'Swiss',
        theme: 'theme-swiss',
        description: 'A small chart per region and source of electricity, the regions of the countries are looked up in a second file. The rows have their headers at the left, vertical as titles of axes, the columns their names above them, the axes have labels only at the outer facets. Hover a line and the country is highlighted in every facet.',
        features: ['facets: rows, cols', 'rowHeaders', 'axisTitles: outer', 'facets.title.props', 'transform: lookup', 'highlight, others'],
        def: mixDef,
        css: mixCss,
    },
    {
        id: 'balance',
        name: 'Above and below zero',
        look: 'Newspaper',
        theme: 'theme-news',
        description: 'Every day of a year against its mean of 1991–2020, computed by two transforms from the same file as the polar lines. The bars of the days are a day wide (an interval of the dates), red above and blue below the line at zero, which crosses them while the months stay at the bottom.',
        features: ['axis.at', 'interval: day', 'transform: mean, calc', 'scale: center', 'formElements: radio', 'annotations'],
        def: warmerDef,
        css: warmerCss,
    },
];
