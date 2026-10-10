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

export default [
    {
        id: 'line',
        name: 'Line chart',
        look: 'Editorial',
        theme: 'theme-editorial',
        description: 'Two lines with labels at their ends, an annotated band, a reference line and a text. The euro sign is a change of the English locale in the definition.',
        features: ['cartesian:line', 'svg:text with select and dodge', 'annotations', 'locale'],
        def: fuelDef,
        css: fuelCss,
    },
    {
        id: 'bars',
        name: 'Stacked bars',
        look: 'Dark dashboard',
        theme: 'theme-dashboard',
        description: 'Two radio buttons change the column of the bars, a template of the globals: the unit (TWh or Mt CO₂) and absolute values or shares, which also patch the axis.',
        features: ['cartesian:bar', 'stacked', 'formElements: radio', 'column templates'],
        def: fossilDef,
        css: fossilCss,
    },
    {
        id: 'area',
        name: 'Stacked area',
        look: 'Soft',
        theme: 'theme-soft',
        description: 'Shares stacked to 100%, drawn below the grid so its lines run across the areas. Click a legend entry to hide it, double-click to show only it.',
        features: ['cartesian:area', 'stacked', 'layer', 'curve'],
        def: carsDef,
        css: carsCss,
    },
    {
        id: 'polar',
        name: 'Polar lines',
        look: 'Risograph poster',
        theme: 'theme-poster',
        description: 'Every year since 2019 around a circle, against the average of 1991–2020. German texts, months and number formats of the locale "de".',
        features: ['coord: polar', 'polar:line', 'annotations', 'locale: de'],
        def: temperatureDef,
        css: temperatureCss,
    },
    {
        id: 'map',
        name: 'Choropleth map',
        look: 'Atlas',
        theme: 'theme-atlas',
        description: 'TopoJSON of Europe, classes of a threshold scale, a slider over the years of the data and radio buttons of the source which also changes the colors.',
        features: ['coord: geo', 'geo:region', 'formElements: slider', 'filter'],
        def: electricityDef,
        css: electricityCss,
    },
];
