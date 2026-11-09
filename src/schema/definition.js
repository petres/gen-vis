// the schema of the definitions of gen-vis 5 (JSON Schema, draft-07), the
// one source of schema.json (`npm run schema`, see scripts/schema.js), of the
// types of TypeScript (`npm run types`, types/definition.d.ts, see
// scripts/types.js) and of the structural check of the definitions (the
// unknown keys and the values which are not of their type, see
// schemaWarnings of utils/validate.js); the names of the registries of the
// code (plot types, coordinate systems, ...) are listed here and checked
// against the code by tests/schema.test.js
export { schema, markTypes, markNames, coordNames, curveNames, localeNames, dataFormats, scaleTypes, projectionNames, transformTypes, annotationTypes, controlTypes };

import { describe, string, number, integer, boolean, nul, constant, choice, option, object, map, array, anyOf, oneOf, cases, ref, pattern, text, globalText, isArray, isString, isObject } from './dsl.js';

const schemaUrl = 'https://unpkg.com/@preschen/gen-vis@5/schema.json';
const docs = 'https://github.com/petres/gen-vis/blob/main/docs/definition.md';

// --- the names of the registries of the code ---

// the full names of the mark types of the engine (`<coordinate system>:<kind>`), see plots/
const markTypes = ['svg:circle', 'svg:line', 'svg:rect', 'svg:text', 'cartesian:line', 'cartesian:area', 'cartesian:rule', 'cartesian:bar',
    'polar:line', 'polar:area', 'polar:arc', 'polar:circle', 'polar:text', 'geo:base', 'geo:region', 'geo:circle', 'geo:text', 'geo:mesh',
    'annotation:band', 'annotation:line', 'annotation:text', 'annotation:circle'];
// the names of the marks of the definitions, the kinds of the coordinate
// system of the definition and the ones of 5.0 (point, label, cell), see typeOf of utils/language.js
const markNames = ['arc', 'area', 'bar', 'base', 'cell', 'circle', 'label', 'line', 'mesh', 'point', 'rect', 'region', 'rule', 'text'];
const coordNames = ['cartesian', 'polar', 'geo'];
const curveNames = ['linear', 'monotoneX', 'natural', 'catmullRom', 'basis', 'step', 'stepBefore', 'stepAfter', 'linearClosed', 'catmullRomClosed', 'basisClosed'];
const localeNames = ['de', 'en'];
const dataFormats = ['csv', 'tsv', 'json', 'parquet'];
const scaleTypes = ['band', 'diverging', 'divergingLog', 'divergingPow', 'divergingSqrt', 'divergingSymlog', 'identity', 'linear', 'log', 'ordinal', 'point', 'pow',
    'quantile', 'quantize', 'radial', 'sequential', 'sequentialLog', 'sequentialPow', 'sequentialQuantile', 'sequentialSqrt', 'sequentialSymlog', 'sqrt', 'symlog',
    'threshold', 'time', 'utc'];
const projectionNames = ['albers', 'albersUsa', 'azimuthalEqualArea', 'azimuthalEquidistant', 'conicConformal', 'conicEqualArea', 'conicEquidistant', 'equalEarth',
    'equirectangular', 'gnomonic', 'identity', 'mercator', 'naturalEarth1', 'orthographic', 'stereographic', 'transverseMercator'];
const transformTypes = ['year', 'align', 'index', 'mean', 'share', 'rolling', 'cumulative', 'calc', 'filter', 'rank', 'random', 'lookup', 'bin', 'fold', 'aggregate', 'window'];
const annotationTypes = ['band', 'line', 'text', 'circle'];
const controlTypes = ['radio', 'select', 'slider', 'hidden'];

// --- the parts of the values ---

// the string syntax of an expression, e.g. "=@innerWidth * 0.5" or a reference "@height", see spec/expressions.md
const expressionText = pattern('^[=@]', 'An expression in its string syntax, e.g. "=@innerWidth * 0.5", or a reference "@name", e.g. to a global.');
const expression = ref('expression');
// an object of an operator, e.g. { "match": [...] }, not a part, e.g. a
// mark, the operators are the ones of the expression below
const isOperator = { type: 'object', maxProperties: 1, propertyNames: { enum: [] } };

// one of the values or an expression of the globals or of the sizes (a
// reference or an operator), e.g. a legend position of steps of totalWidth
const optionOfSizes = (values, description) => cases([[{ type: 'string', pattern: '^[=@]' }, expressionText], [isOperator, expression]], { enum: values }, description);

// the name of a registered plot type or coordinate system, e.g. "my-coord:dots"
const registeredName = '^[a-z][\\w-]*(:[\\w-]+)?$';

// a part of a definition which expressions of the globals replace, e.g. a list of a match
const ofGlobals = (node, what) => anyOf([node, expressionText, expression], what);

// null or false removes a part of a parent, e.g. an axis
const removable = (node, description) => cases([[isObject, node]], ref('removed'), description);

const dataFormat = choice(dataFormats, 'The format of the data, by default the one of the extension of its url, without one parquet, CSV or JSON by the content.');

// the conditions of the rows: an expression of the values of the rows
// (`@dim`) and the globals, or the object of the values of dims
const conditions = description => anyOf([
    expressionText,
    expression,
    ref('conditions'),
], description);

// an object of attributes (and expressions of them)
const props = description => ref('props', description);

// --- the schema ---

const definitions = {
    inLanguages: describe(map(string(), 'The text in several languages by their tags, e.g. { "de": "Bevölkerung", "en": "Population" }: the one of `language`, else the one of its language without the region (de of de-AT), else the first one.', { minProperties: 1, propertyNames: { pattern: '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$' } })),

    none: nul('Removes the part of a parent.'),
    removed: choice([null, false], 'null or false removes the part, e.g. the one of a parent.'),
    key: anyOf([{ type: 'string' }, { type: 'number' }], 'A key of a feature of a map or of a category, compared as a string.'),
    pair: array({ anyOf: [{ type: 'number' }, { type: 'null' }] }, undefined, { minItems: 2, maxItems: 2 }),

    expression: describe(object(Object.fromEntries([
        ['+', 'The sum of the values.'],
        ['-', 'The first value minus the others, of one value its negation.'],
        ['*', 'The product of the values.'],
        ['/', 'The first value divided by the others, no value of a division by 0.'],
        ['min', 'The least value.'],
        ['max', 'The largest value.'],
        ['round', '[value, digits]: the value rounded to digits (0 by default), halves up.'],
        ['==', 'The same values, as texts, e.g. 2024 and "2024", more values are a chain of every pair of neighbours.'],
        ['!=', 'Not the same values, more values are a chain of every pair of neighbours.'],
        ['<', 'Numbers by their value, otherwise texts, false of a missing value, more values are a chain, e.g. [0, "@x", 10].'],
        ['<=', 'See <.'],
        ['>', 'See <.'],
        ['>=', 'See <.'],
        ['not', 'True of a false value (false, 0, "", null, an empty list).'],
        ['cat', 'The values as texts, joined.'],
        ['if', '[condition, value, condition, value, ..., otherwise]: the value of the first true condition.'],
        ['and', 'The first false value, otherwise the last one.'],
        ['or', 'The first true value, otherwise the last one, e.g. a default ["@color", "black"].'],
        ['steps', '[value, { "cut": value, ... }]: the value of the largest cut below the value, e.g. ["@totalWidth", { "0": 220, "550": 250 }].'],
        ['match', '[value, { "case": value, ... }, default]: the value of the case of the value (as a text), otherwise the default.'],
        ['format', '[value, format]: the value as a text of a d3 format in the locale, e.g. ["@y", ",.1f"] or of dates ["@x", "%b %Y"].'],
    ].map(([op, description]) => [op, ref('args', description)]).concat([
        ['literal', { description: 'A value which is not evaluated, e.g. a text starting with @.' }],
        ['var', anyOf([{ type: 'string' }, array(true, undefined, { minItems: 1, maxItems: 2 })], 'A reference, a name or [name, default], the default of an unknown name.')],
    ])), 'An operator, an object of one key, the operator, and its arguments, e.g. { "*": ["@innerWidth", 0.5] } or { "steps": ["@totalWidth", { "0": 220, "550": 250 }] }; the string syntax writes it as "=@innerWidth * 0.5", see spec/expressions.md of the package.',
    { minProperties: 1, maxProperties: 1 })),
    args: anyOf([array(ref('propEntry')), ref('propEntry')], 'The arguments of an operator, a list of expressions or a single one.'),

    value: anyOf([{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' }, expression],
        'A value, a reference "@name", an expression in its string syntax ("=...") or an object of an operator.'),
    number: anyOf([{ type: 'number' }, expressionText, expression], 'A number, a reference "@name", e.g. to a global, or an expression, e.g. of totalWidth.'),
    domainValue: anyOf([{ type: 'number' }, { type: 'string' }, { type: 'null' }, expression],
        'A value of a dim, e.g. a date of a string, a reference "@name", e.g. to a global, or an expression, null is taken from the data.'),
    props: map(ref('propEntry'), 'Svg attributes (and text), values, references "@name", expressions or nested props, e.g. d of a path.'),
    propEntry: anyOf([ref('value'), map(ref('propEntry'), 'Nested props, e.g. d of a path, an object which is no operator.')]),

    conditions: map({}, 'The rows of the values of dims, e.g. { "year": "@globals.year", "land": ["Wien", "Tirol"] }: a value, a reference to a global or a list of values (also null, { "not": ... } or { "range": [from, to] }), every condition holds.'),
    filter: anyOf([expressionText, expression, ref('conditions'), ref('none')],
        'The rows of the chart: an expression of the values of the rows (`@dim`) and the globals, e.g. "@year == @globals.year and @value > 0", or the values of dims, e.g. { "year": "@globals.year" }, null removes the one of a parent.'),

    locale: anyOf([
        choice(localeNames),
        pattern('^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
        object({
            base: string('de, en or a language of Intl.', { default: 'de' }),
            texts: object({
                download: string('The button of the PNG.'),
                copy: string('The button of the copy of the PNG.'),
                copied: string('The title of the copy after a copy.'),
                csv: string('The button of the CSV.'),
                svg: string('The button of the SVG.'),
                chart: string('The kind of a facet with a hover, e.g. chart.'),
                keys: string('The description of the keys of the hover.'),
                total: string('The name of the row of the sum of the stacked values of the hover (hover.total true), Gesamt of de.'),
            }, 'The titles of the buttons, the texts of screen readers and the name of the total of the hover.'),
            number: describe({ type: 'object' }, 'See d3.formatLocale, e.g. decimal, thousands, grouping and currency ([prefix, suffix]).'),
            time: describe({ type: 'object' }, 'See d3.timeFormatLocale, e.g. date, months and shortMonths.'),
            timeTicks: object(Object.fromEntries(['millisecond', 'second', 'minute', 'hour', 'day', 'week', 'month', 'year'].map(k => [k, string()])),
                'The formats of the ticks of time axes without format, by the interval of the date.'),
        }),
    ], 'Number and date formats, the name of a built-in locale, a language of Intl (e.g. fr or de-CH) or a d3 locale definition merged into one.'),

    margins: anyOf([
        object(Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side => [side, anyOf([ref('number'), constant('auto')])]))),
        constant('auto', 'All sides measured.'),
    ], 'The space around the plot area of a facet in pixels, of the axes and their titles, e.g. { "left": 60 }; a side without one is the one of the styles of the page (--gen-vis-margin-left: 60px, also auto) or of its defaults (registerDefaults, e.g. of a house style), else measured ("auto") of the labels of the axes, their tick marks and their titles; an expression of totalWidth, e.g. steps of it.'),

    hover: object({
        columns: array(string(), 'The dims of the hover beside the value of the position (its rows of their values, in this order), by default the dims the marks use, of their `by` and their positions (not the ones of the facets); a dim with a `hover` of its own is in it as well, [] only those.'),
        value: boolean('The value of the position (e.g. y of a line, x of horizontal bars) as a cell of the rows, true by default; false shows only the categories and the dims of the columns, e.g. the unsigned values of a population pyramid.'),
        total: anyOf([{ type: 'boolean' }, { type: 'string' }, ref('inLanguages')], 'A row of the sum of the stacked values of the position below the rows (true, or its name, e.g. Gesamt), in the format of the values; also {total} of the title.'),
        mode: option(['position', 'point'], 'The rows of the nearest position of the axis (position, by default) or the row of the nearest point, e.g. of a scatter plot.'),
        radius: number('The distance of the nearest point in pixels, 30 by default.'),
        filter: conditions('The rows with a hover, e.g. not the ones of headers, an expression of the row or the values of dims.'),
        box: boolean('false: no box of the hover, its highlight and the events stay, e.g. a hover of the highlight only.', { default: true }),
        marker: boolean('false: no line of the position of the hover.', { default: true }),
        empty: boolean('true: a hover also without rows, e.g. the name of a region without a value.', { default: false }),
        position: option(['marker', 'pointer'], 'The hover is beside the marker of the position (or the center of a region) or at the pointer.', { default: 'marker' }),
        side: option(['left', 'right', 'above', 'below', 'center'], 'The side of the hover, by default the one with more space, center on the position, e.g. in the center of a polar plot.'),
        offset: ref('pair', 'Moves the hover by [x, y] pixels.'),
        area: option(['plot', 'facet'], 'The area of the hover, the plot area or the facet with its margins, e.g. the labels of the rows of horizontal bars.', { default: 'plot' }),
        title: text('The title, {title} is the default one, e.g. the date, and the globals.'),
        row: text('A row instead of the table: {land} the name of a category, {land.unit} another hover prop, {y} the formatted value, {y.value} the value, and the globals.'),
    }, 'The hover: the dims of its rows (columns) and its box, templates of html, their values are text.'),

    highlight: object({
        transition: number('The attributes move to the ones of the highlight in this many milliseconds, e.g. 50.', { minimum: 0 }),
    }, 'The highlight of the elements, see highlight and others of the marks.'),

    scale: object({
        of: string('The scale of another dim, e.g. "y", the values of this one are positions on it too, e.g. the other end of a band, and they are in its domain, without the other parts of a scale.'),
        type: option(scaleTypes, 'By default linear for a numeric dim, time for a date one, band (bars) or point for a categorical position and ordinal for other categorical ones. A d3 scale, continuous scales and the ones of classes (quantize, quantile, threshold) need a numeric or date dim, point and band a categorical one, ordinal ones are of any values, e.g. colors of categories, positions of dates need a time or utc scale.'),
        orientation: optionOfSizes(['horizontal', 'vertical', 'angular', 'radial', null], 'null: no position, e.g. a y dim of the sizes of points. Places the scale on the plot, horizontal and vertical in the cartesian coordinate system, angular and radial in the polar one.'),
        domain: ofGlobals(array(ref('domainValue'), undefined, { minItems: 1 }), 'Fixes the domain, a null first or last entry is taken from the data, the values are converted as the ones of the data, e.g. dates, and can be references, e.g. to a global. A diverging scale has a middle entry, a threshold scale the values between its classes, a point or band scale its categories in their order; also `domain` of the dim.'),
        include: ofGlobals(anyOf([ref('domainValue'), array(ref('domainValue'))]), 'Values the domain taken from the data includes, e.g. 0 or 100, a value or a list, also references; also `include` of the dim.'),
        center: ref('domainValue', 'The domain taken from the data is symmetric around this value, e.g. 0 of changes.'),
        closed: option(['left', 'right'], 'The end of the classes of a threshold scale they include, the lower one (left, value >= limit) or the upper one (right, value > limit).', { default: 'left' }),
        domainAbs: ref('pair', 'Extends the domain by absolute values, [start, end], the values are added.'),
        pad: ofGlobals(anyOf([{ type: 'number' }, array({ type: 'number' }, undefined, { minItems: 2, maxItems: 2 })]), 'Extends the ends of the domain taken from the data (not fixed ones, e.g. 0 of bars) relative to its size, both (a number) or at the start and the end ([start, end]), positive values extend, e.g. 0.1 of 10% below and above; also `pad` of the dim.'),
        domainIgnores: anyOf([{ type: 'boolean' }, array(string())], 'The conditions of the filter of the definition (their dims, true all) the domain taken from the data ignores, e.g. ["month"] of a slider over months: the scale is the same for all months, the marks draw the rows of the month.'),
        nice: anyOf([{ type: 'boolean' }, { type: 'number' }], 'Numeric dims only: rounds the ends of the domain taken from the data, e.g. 0.951 to 1, true for steps of about a tenth of the domain or the number of steps; also `nice` of the dim.'),
        reverse: boolean('The range in the other direction, e.g. the largest value at the bottom; also `reverse` of the dim.'),
        range: ofGlobals(array(anyOf([{ type: 'number' }, { type: 'string' }, expression])), 'By default the width or height of the plot, e.g. colors, references to the sizes of the coordinate system, e.g. "@radius"; also `range` of the dim.'),
        padding: number('Band and point scales: the space between the categories and at the ends in steps, 0.4 by default; of a point scale of angles the place of the first category in steps, half a step after the top (0.5) by default, 0 at the top, e.g. of a radar chart.'),
        step: ref('number', 'The pixels of a category of a vertical band or point scale, the height of the plot is the one of its categories (instead of height), e.g. the rows of horizontal bars keep their size if some are hidden.'),
        order: anyOf([
            option(['ascending', 'descending']),
            object({ by: string(), descending: boolean() }, undefined, { required: ['by'] }),
        ], 'The order of the categories of the data of a band, point or ordinal scale: of the rows (default), ascending, descending or by the value of a dim of their first row, e.g. bars by their length.'),
        groups: object({
            by: string('The dim of the groups, e.g. a column of the group of a row.'),
            padding: number('The space between the groups in steps of the categories, 1 by default.'),
        }, 'The categories of a band or point scale in groups of the values of a dim of their rows, with a space between the groups.', { required: ['by'] }),
        inset: ofGlobals(anyOf([ref('number'), array(ref('number'), undefined, { minItems: 2, maxItems: 2 })]), 'The space at the start and the end of the range in pixels (of positions), a number for both or [start, end], e.g. so the first and the last point are not at the edges of the plot area.'),
        interpolator: string('The colors of a sequential or diverging scale, a d3 interpolator, e.g. Blues, Viridis or RdYlGn.'),
        scheme: string('The colors of the range, a d3 scheme, e.g. Blues or Tableau10.'),
        classes: number('The number of colors of a scheme of several sizes, by default the number of classes of a threshold scale or 5.'),
    }, 'The scale of a dim, by default of its type and its position (x and y, polar angle and radius, have a scale of the orientation of their name).'),

    axis: object({
        position: option(['top', 'bottom', 'left', 'right', 'angular', 'radial'], 'top, bottom, left or right of the cartesian coordinate system, angular (around the circle) or radial (from the center) of the polar one.'),
        at: ref('domainValue', 'Cartesian axes: the line of the axis at this value of the dim of the other axis, e.g. 0 of an axis of x at y = 0 or a date of an axis of y, converted as the values of the data, also a reference "@zero"; a value outside of the domain of the other scale leaves it at its edge (`position`, also the side of its labels and tick marks).'),
        angle: number('The angle of a radial axis in degrees, clockwise from the top, 0 by default.'),
        gridShape: option(['circle', 'polygon'], 'The grid lines of a radial axis, circles or polygons through the ticks of the angle, e.g. of radar charts.'),
        ticks: anyOf([ref('number'), ref('none')], 'The number of the ticks, null for the ones of tickSpacing, e.g. of a parent; also `ticks` of the dim.'),
        tickSpacing: ref('number', 'Without ticks, a tick per this many pixels of the length of the axis, e.g. 80; also `tickSpacing` of the dim.'),
        values: ofGlobals({ type: 'array' }, 'Fixed ticks, converted as the values of the data, categories as strings, e.g. [2004, 2008] or ["2004", "2008"] of the years of any format of the data, the ones outside of the domain or which are no category of a band or point scale are left out, also an expression, e.g. steps of totalWidth.'),
        format: text('A d3 number or time format.'),
        labels: object({
            by: anyOf([{ type: 'string' }, array(string())], 'The dims of categories whose props the labels have, of the categories of the row of the tick, a dim or a list of them, as `by` of a mark.'),
            props: props(),
            at: option(['edge', 'axis'], 'Of an axis at a value (`at`): the labels at the edge of the plot area (edge, by default), only the line and the tick marks at the value, or with them (axis), without the label where the other axis crosses.', { default: 'edge' }),
            curved: anyOf([{ type: 'boolean' }, constant('between')], 'Angular axes: the labels along the circle, centered at the tick (true) or between it and the next one (between), e.g. the names of the months, the ones of the lower half are not upside down.'),
        }, 'The props of the labels of the ticks (svg attributes and text), of the props of the categories of the tick and of the categories of its row of the dims `by`, its values and the names of the facet, e.g. { "by": ["level"], "props": { "font-weight": "@weight", "text": "@short", "max-width": 300 } }, of all axes, e.g. { "props": { "fill": "#777", "font-size": 10, "stroke-width": 2 } } of the values of a radial axis in the background, the stroke and its width replace the halo of the labels of radial axes.'),
        tickMarks: anyOf([
            constant(false),
            object({
                size: number(undefined, { minimum: 0 }),
                inset: number(),
                props: props(),
            }),
        ], 'The tick marks: false leaves them out (the labels stay at their places), their length (size, 9 pixels across the line of cartesian axes, 6 outside of the circle of angular ones by default, the labels move with it), the part of it inside the plot area (inset, by default 4 pixels of bottom and right axes, 5 of top and left ones, 0 of angular ones, e.g. 0 for marks outside only) and their props (svg attributes of the names of the facet), e.g. { "props": { "stroke": "var(--gen-vis-grid-color)" } }, radial axes have none.'),
        domain: object({ props: props() }, 'The props of the line of the axis (svg attributes, its class is domain, a circle of an angular axis) of the names of the facet, e.g. { "props": { "stroke-opacity": 0.4 } }.'),
        rotate: number('The angle of the labels in degrees, positive counterclockwise, negative clockwise.'),
        grid: boolean('Lines at the ticks; also `grid` of the dim.'),
        title: object({
            name: text(),
            offset: number('The distance from the axis in pixels, by default of cartesian axes 8 pixels inside the edge of the margin, of radial axes 16 pixels outside of the circle (see the prop defaults).'),
            position: option(['side', 'top'], 'Of a vertical axis: beside it, rotated, in the middle of the range of its scale (side), or horizontal above its range (top), e.g. the unit at the top left, starting at the distance offset from the axis.', { default: 'side' }),
            gap: number('Of a title at the top: its distance above the range of the scale, 8 pixels by default.'),
        }),
        padding: number('The gap between the tick marks and the labels in pixels, also of polar axes, 3 by default (see the prop defaults).', { default: 3 }),
    }, 'The axis of a dim of a position, x and y have one by default.'),

    legendSymbol: anyOf([
        { type: 'null' },
        option(['line', 'rect', 'circle', 'auto']),
        object({
            type: option(['line', 'rect', 'circle', 'auto']),
            size: number(),
            width: number('The width of the box, size by default, e.g. a longer line of a dash.'),
            height: number('The height of the box, size by default.'),
            props: props(),
            elements: describe({ $ref: '#/definitions/symbolElements/properties/elements' }, 'Left out, the type replaces them, e.g. the ones of a parent.'),
        }, undefined, { required: ['type'] }),
        ref('symbolElements'),
    ], 'The symbol before the name of a category: auto (the default) of the marks of the categories (a box of their bars or areas, a line of their lines, a dot of their points), line, rect or circle in its color, or the svg elements, drawn in a box of width x height pixels (size both, by default the one of the defaults of the chart, 16) from 0, 0, at the middle of the capitals of the name; null (or an object without elements) is none, e.g. instead of the one of a parent.'),
    symbolElements: object({
        size: number(),
        width: number(),
        height: number(),
        elements: array(object({
            type: string('An svg element, e.g. line or circle.'),
            props: props(),
        }, undefined, { required: ['type'] })),
    }),

    legend: object({
        position: optionOfSizes(['top', 'bottom', 'left', 'right'], 'The place of the legend, above or below the plots or beside them, the plots have the rest of the width, an expression of totalWidth (the width of the visualisation), e.g. below the plots of a phone.'),
        orientation: optionOfSizes(['horizontal', 'vertical'], 'The direction of the scale of the colors, a vertical one has the high values at the top, an expression of totalWidth (the width of the visualisation).'),
        classes: boolean('Of a legend of the colors of a threshold, quantize or quantile scale: a label per class in its middle, e.g. < 50, 50–100, ≥ 300, instead of ticks at the limits.'),
        onlyData: boolean('Only the entries of the categories of the rows after the filter, e.g. of the selected year, also the hidden ones.', { default: false }),
        size: number('The length of the scale of the colors in pixels.', { default: 240 }),
        values: array(number(), 'The ticks of a gradient of colors, e.g. [0, 50, 100].'),
        labels: option(['before', 'after'], 'The labels of the scale of colors after it (below, right of a vertical one) or before it.', { default: 'after' }),
        format: text('The format of the values of the colors of a scale, by default the one of the hover.'),
        missing: object({
            name: text(),
            color: string('By default #EEE.'),
        }, 'An entry of the regions without a value beside the colors of a scale, e.g. { "name": "no data", "color": "#EEE" }.', { required: ['name'] }),
        symbol: ref('legendSymbol'),
        props: map(ref('value'), 'HTML attributes of the entries, e.g. a title, props of the categories.'),
    }, 'Toggles of the categories of the dim (a legend of the colors of its scale of a dim with a scale), {} is one of the defaults.'),

    categoryProps: map(ref('value'), 'The props of a category (name, color, visible, legend, symbol and any attribute of the marks of the category, e.g. "stroke-width"), a text is its color.', {
        properties: {
            name: text('The key by default.'),
            color: string('The color of the category, the fill and stroke of its marks by default.'),
            visible: boolean(undefined, { default: true }),
            legend: boolean('false: the category has no entry in the legend, it stays visible, e.g. headers.', { default: true }),
            symbol: ref('legendSymbol', 'The symbol of the entry of the category in the legend instead of the one of the legend, e.g. a rect of an area beside lines.'),
        },
    }),

    dimHover: object({
        cell: boolean('false: the value is a name of the templates of the hover (e.g. {half} of the title), without a cell of the table.', { default: true }),
        format: text('By default the format of the axis.'),
        props: map(ref('value'), 'The columns of the entries of a categorical dim, name by default.'),
        row: object({
            props: map(ref('value'), 'CSS properties of the row of a category, props of the props of the categories, e.g. { "font-style": "@hoverStyle" }, the nearest row stays bold.'),
        }, 'The rows of the hover of the categories of a categorical dim.'),
    }, 'The dim in the hover (also {} for its defaults), the format of its value; null or false removes it, e.g. of a parent.'),

    dim: object({
        column: string('The column of the data, can be a template of globals, e.g. "{values}{share}", see controls.'),
        name: text('The title of the legend (the title of the axis is axis.title).'),
        type: option(['numeric', 'date', 'categorical'], 'Without a type it follows from the other parts (categories or a band, point or ordinal scale are categorical, a time or utc scale date, other scales numeric, a dim of the facets categorical, not one only used as `by` of a mark) or from the values of the column: numbers numeric, dates date, otherwise categorical (a column without values, e.g. of empty data, date of a time format of the dim, its axis or its hover, otherwise categorical). Missing and invalid numeric and date values are null, dates are timestamps or strings, a date without a time zone, e.g. 2024-06-01 or 01.06.2024 13:00, is the one of the time zone of the scale, local or UTC (utc). Categorical values are strings of every format of the data, e.g. "2004" of the number 2004 of JSON or parquet.'),
        format: text('The d3 format of the values (a time format of dates), the one of the axis and of the hover without their own, e.g. ",.0f".'),
        interval: pattern('^\\s*([1-9]\\d*)?\\s*(day|week|month|quarter|half|year)s?\\s*$', 'Of a date dim of a time or utc scale: a value is the period starting at it, day, week, month, quarter, half (a year), year or a number of them, e.g. "6 months": the domain of the data reaches the end of the last period; @x:scaled (also @x:scaled:center) is the middle of the period of a row, so bars, points, lines and the hover are in the middle of their period, @x:scaled:start and @x:scaled:end are its start and end, @x:step its length in pixels (bars 80% of it by default); ticks, grid lines and annotations stay at their dates; the hover shows the period, e.g. H2 2023 (%K is the half of the year in formats).'),
        scale: removable(ref('scale')),
        axis: removable(ref('axis')),
        legend: removable(ref('legend')),
        hover: removable(ref('dimHover')),
        domain: ofGlobals(array(ref('domainValue'), undefined, { minItems: 1 }), 'The domain of the scale, see scale.domain, e.g. [0, null].'),
        zero: boolean('The domain starts at 0, e.g. of bars (a domain [0, null]).'),
        nice: anyOf([{ type: 'boolean' }, { type: 'number' }], 'Rounds the ends of the domain of the scale, see scale.nice.'),
        pad: ofGlobals(anyOf([{ type: 'number' }, array({ type: 'number' }, undefined, { minItems: 2, maxItems: 2 })]), 'Extends the ends of the domain taken from the data relative to its size, see scale.pad, e.g. 0.1.'),
        include: ofGlobals(anyOf([ref('domainValue'), array(ref('domainValue'))]), 'Values the domain includes, see scale.include, e.g. 0.'),
        reverse: boolean('The range in the other direction, see scale.reverse.'),
        range: ofGlobals(array(anyOf([{ type: 'number' }, { type: 'string' }, expression])), 'The range of the scale, see scale.range, e.g. [0, "@height"] of a vertical band from the top.'),
        grid: boolean('Lines at the ticks of the axis, see axis.grid.'),
        ticks: anyOf([ref('number'), ref('none')], 'The number of the ticks of the axis, see axis.ticks.'),
        tickSpacing: ref('number', 'A tick per this many pixels, see axis.tickSpacing.'),
        categories: map(anyOf([ref('categoryProps'), string('The color of the category.')]), 'The categories by their key (the value of the column) and their props, e.g. colors, in the order of the legend, the facets and the stacks, a text is the color; listed categories are all of them (`fromData` adds the others), without listed ones the ones of the data.'),
        scheme: string('The colors of the categories in their order as the prop color, a d3 scheme, e.g. Tableau10.'),
        common: ref('categoryProps', 'The props of all categories.'),
        fromData: anyOf([{ type: 'boolean' }, constant('rows')], 'The values of the column which are not in categories are categories as well, after them, in ascending order (true) or in the order of the rows ("rows", the default of a dim without listed categories).'),
        order: anyOf([option(['ascending', 'descending']), array(ref('key'))], 'The order of the categories: the one of categories (keys which are integers ascending first), ascending, descending (numbers by their value) or a list of keys which are first.'),
        ranks: array(ref('categoryProps'), 'The props of the categories by their rank in the order: of the first one, the second one, ..., the last entry is the one of all others, e.g. the newest year red.'),
        stacked: anyOf([{ type: 'boolean' }, expressionText, expression, ref('conditions')], 'Of a dim of values which no mark stacks (`stack` of a mark stacks its values): the values are stacked, true all rows or the condition of the rows which are stacked, the others have their own value as start and end.'),
        stackBy: string('Of a stacked dim: the dim of the positions of the stacks, by default the one of the positions of the coordinate system (x of vertical bars), e.g. the start of the class of a bin (lo) of a histogram whose x are the values of the rows; rows without a value of it are not stacked.'),
    }, 'A dim of a column of the data, the marks and all other parts of the definition refer to its name; x and y (polar also angle and radius) have a scale of their orientation and an axis, false removes them. The shorthands zero, grid, pad, include, reverse, range, ticks and tickSpacing are parts of the scale and the axis.'),

    mark: describe(map(ref('propEntry'), 'A mark, a layer of the chart: its type and the dims of its channels (x, y, ...), the attributes of its elements (e.g. "stroke-width": 2, "fill": "@color" of its categories), expressions of the row, the names of the facet and the globals, nested props, e.g. d of a path.', {
        properties: {
            type: cases([[globalText, globalText], [{ type: 'string', pattern: registeredName }, anyOf([
                choice(markNames, 'A type of the coordinate system of the definition (line is cartesian:line or polar:line), of svg elements (circle is svg:circle of cartesian charts); point is a circle per row, label a text beside its position (see anchor), cell a rect of the bands of x and y, e.g. of a heatmap.'),
                choice(markTypes, 'The full name of a type of a coordinate system, as the name without the prefix. The svg types draw an svg element per row in any coordinate system, the others are the ones of their coordinate system, the lines and areas a path per group, geo:base all features, geo:mesh the borders of an object of TopoJSON as one path, the others an element per row. The annotation types draw an annotation per row, e.g. of events, see annotations.'),
                pattern('^[a-z][\\w-]*:[\\w-]+$', 'A registered plot type, see registerPlotType.'),
                pattern('^[a-z][\\w-]*$', 'A registered plot type of the coordinate system without its prefix, see registerPlotType.'),
            ])]],
                { enum: [...markNames, ...markTypes] }, 'The type of the mark, line, area, bar, rule, point, label, text or cell of cartesian charts, arc of polar ones, base, region, mesh of maps, with the default attributes of the type, a definition writes only the ones which differ.'),
            id: string('The class and the data-plot of the group of the mark, plot-<index> by default, the marks of a parent are merged by their ids.'),
            by: anyOf([{ type: 'string' }, array(string())], 'The rows are grouped by this dim or these dims, e.g. a line per category, the props of their categories are known to the attributes (@color, @name, ...).'),
            x: ref('channel', 'The dim of the horizontal position (x by default); a number is a value on the scale of x of a rule, pixels otherwise.'),
            y: ref('channel', 'The dim of the vertical position (y by default); a number is a value on the scale of y of a bar or a rule, pixels otherwise.'),
            x0: ref('channel', 'The start of a bar or an area (a dim, a number on the scale of x), e.g. the start of a class of a bin, 0 by default.'),
            x1: ref('channel', 'The end of a bar of a class of a bin, or of an area; of a rule its start (a number on the scale of x).'),
            x2: ref('channel', 'The other end of a rule (a number on the scale of x).'),
            y0: ref('channel', 'The start of a bar or an area (a dim, a number on the scale of y), 0 by default.'),
            y1: ref('channel', 'The end of a bar or an area, e.g. the upper edge of a band of a range; of a rule its start (its other end is y2, a number on the scale of y).'),
            y2: ref('channel', 'The other end of a rule, e.g. "hi" of an error bar (a number on the scale of y).'),
            lon: ref('channel', 'Of a map: the dim of the longitude of a point or a text, or an expression of the row.'),
            lat: ref('channel', 'Of a map: the dim of the latitude, or an expression of the row.'),
            stack: anyOf([{ type: 'boolean' }, expressionText, expression, ref('conditions')], 'Stacks the values of the mark (bars, areas, arcs) by the groups of `by`, true all rows or the condition of the rows which are stacked, the others have their own value as start and end.'),
            dodge: anyOf([{ type: 'boolean' }, { type: 'string' }, { type: 'number' }], 'Bars: the groups of `by` (true, the first one) or of this dim beside each other in the band of their position; texts: the texts are moved apart vertically to at least this distance, e.g. labels at the ends of lines.'),
            orient: option(['horizontal', 'vertical'], 'Bars: horizontal bars (the values of x, the categories of y), by default of a categorical y.'),
            anchor: option(['start', 'end', 'top', 'bottom', 'center'], 'Labels: the text beside its position, after it (end, e.g. of horizontal bars), before it (start), above it (top), below it (bottom) or on it (center).'),
            filter: conditions('The rows of the mark, an expression of the row or the values of dims, see filter of the definition.'),
            curve: option(curveNames, 'The interpolation of the paths and areas between their points, monotoneX is smooth without overshooting the values, the closed ones connect the last point with the first one, e.g. of radar charts.', { default: 'linear' }),
            data: anyOf([{ type: 'string' }, array({ type: 'object' })], 'Rows of the mark instead of the ones of the data, e.g. events, with the names of the dims and others, e.g. a label, or the url of a file of them. The values of rows of the definition are expressions, e.g. references to globals.'),
            dataFormat: choice(dataFormats, 'The format of the url of the data, by default the one of its extension.'),
            select: anyOf([
                option(['first', 'last']),
                object({ min: string(), max: string() }, undefined, { minProperties: 1, maxProperties: 1 }),
            ], 'One row of every group: the first or the last one, or the one with the least or the most value of a dim, e.g. labels at the ends of lines.'),
            layer: option(['below', 'above'], 'below: below the axes and grid lines, above: above the other marks, between them by default.'),
            facet: { description: 'The facets of the mark, a key or a list of them, all by default; of a grid also the values of the dims of its rows and columns, e.g. { "group": "Bau" } (a column, a row or a cell).' },
            once: boolean('One element per facet, of no row: its attributes are the names of the facet, e.g. a header or a unit label at the edge of the plot area, "y": "@plot:top", "text": "@facet:name".'),
            place: anyOf([
                option(['pole', 'centroid'], 'geo:text: a label at the pole of inaccessibility of the largest polygon of its feature, the point farthest from its edges (default), or at its centroid.', { default: 'pole' }),
                object({
                    in: string('The id of the area mark (cartesian or polar), its bands are the ones of the same categories.'),
                    near: { description: 'A value of x (of the angle of polar charts) the labels are near of the places of the same room, by default the middle of the positions of their rows.' },
                    padding: number('The pixels around a text inside its band, besides the halo.', { default: 2 }),
                }, 'Texts: a label per group inside the band of its categories of an area mark, at the place of the most room over the width of the text, at the positions of its rows (e.g. a filter of x).', { required: ['in'] }),
            ]),
            fit: boolean('geo:text: only the labels which fit into the area around their place (estimated of their characters and font size); texts of place in: true (default) leaves out a label without room in its band, false places it where it violates the least.'),
            overlap: boolean('geo:text: false leaves out the labels which overlap the one of a larger area, so a map needs no list of the labels shown; texts of place in: false (default) places the labels apart, true lets them overlap.', { default: true }),
            ends: option(['base', 'open'], 'Of the stairs of a line of x0 and x1: down to the base at both ends (base) or from the first step to the last one (open), e.g. of shares.', { default: 'base' }),
            halo: anyOf([{ type: 'boolean' }, { type: 'number' }], 'Texts: a halo behind the texts in the color of --gen-vis-halo-color, true (3 pixels) or its width, the stroke attributes of the mark replace its stroke.'),
            object: string('geo:mesh: the object of the TopoJSON of the borders, the one of the geometry by default, e.g. the states above the districts.'),
            borders: option(['all', 'inner', 'outer'], 'geo:mesh: all borders, the ones between two features (inner) or the outline (outer).', { default: 'all' }),
            before: string('Right before the mark of this id, in its layer, e.g. lines above the bars but below the labels whose halo cuts them.'),
            highlight: describe(map(ref('propEntry')), 'The attributes of the elements of the category of the hover or of the entry of the legend, e.g. { "stroke-width": 3 }, mode: the elements of the category (group, default) or only the one of its row (row), e.g. a segment of a stacked bar.', { properties: { mode: choice(['group', 'row']) } }),
            others: map(ref('propEntry'), 'The attributes of the other elements of the mark while an element is highlighted, e.g. { "opacity": 0.3 }.'),
        },
    })),
    channel: anyOf([{ type: 'string' }, { type: 'number' }, expression], 'A dim by its name (a column of the data is a dim of it, of x or y without a dim x or y the dim of the axis), a number (a value on the scale of the axis of the channel of bars and rules, else pixels) or an expression of the row, e.g. "@y:scaled:center".'),

    annotation: describe(map(anyOf([ref('domainValue'), array(ref('domainValue'), undefined, { minItems: 2, maxItems: 2 })],
        'A value or a range [from, to] of the dim, a reference to a global, e.g. "@target", or an expression, null is no value, of a range the edge of the domain.')),
    'An annotation, a band, a line, a text or a circle at values of the dims, e.g. { "type": "band", "x": ["2025-07-01", null], "label": "Schätzung" }.', {
        required: ['type'],
        properties: {
            type: choice(annotationTypes),
            props: props(),
            label: text('A label of a band or a line, a template of the globals.'),
            text: text('The text of a text, a template of the globals.'),
            above: boolean('Above the marks, below them by default, as layer above.'),
            layer: choice(['below', 'above'], 'Below the marks and the axes (default) or above all marks.'),
            legend: string('The name of the annotation in the legend (a template of the globals), with a symbol of it: a vertical line of a line at a value of x, a horizontal one of y, a box of a band, a dot of a circle; one entry per name, after the legends of the dims.'),
            before: string('Right before the mark of this id, in its layer, e.g. lines above the bars but below the labels whose halo cuts them.'),
            facet: { description: 'The facets of the annotation, a key or a list of them, all by default; of a grid also the values of the dims of its rows and columns, e.g. { "group": "Bau" } (a column, a row or a cell).' },
            lon: number('The longitude of a map.'),
            lat: number('The latitude of a map.'),
        },
    }),

    facets: object({
        by: anyOf([
            string('The dim of the facets, a plot for every category of it, in `cols` columns.'),
            object({
                rows: string('The dim of the rows of a grid, its categories are the rows (their names the headers beside them).'),
                cols: string('The dim of the columns of a grid, its categories are the columns (their names the headers above them).'),
            }, 'A grid of the categories of the dims of its rows and columns, one of them alone is one column or one row.'),
        ], 'The dim of the facets, or the dims of the rows and the columns of a grid.'),
        cols: ref('number', 'The number of the columns of the facets of `by`, 1 by default, e.g. steps of totalWidth.'),
        rowHeaders: anyOf([
            option(['left', 'right']),
            object({
                side: choice(['left', 'right'], 'Left or right of the rows.', { default: 'right' }),
                vertical: boolean('Vertical text (upwards at the left, downwards at the right), by default at the right; horizontal text is in a column of the width of the longest header.'),
            }),
        ], 'The headers of the rows of a grid: right of them vertical (default), left of them horizontal, in a column of the width of the longest one, or { "side": "left", "vertical": true }, e.g. as a title of an axis.', { default: 'right' }),
        axisTitles: option(['all', 'outer'], 'The titles of the axes in every facet (all) or only at the outer ones (outer): of the bottom axis in the bottom row, of the left one in the first column, of the right one in the last column, of the top one in the first row.', { default: 'all' }),
        title: object({
            props: props('CSS properties of the titles, e.g. { "font-weight": "normal", "text-align": "center" }, of the props of the category of the facet (e.g. @color), @facet:name and the globals.'),
        }, 'The titles of the facets (.vis-facet-title).'),
        scales: anyOf([
            option(['own', 'shared'], 'Every facet has its own scales (own, the default) or all facets share the scales of their dims (shared).'),
            array(string(), 'The dims which share their scale across all facets.'),
            map(choice(['all', 'row', 'col']), 'Of a grid: the dims and all, row (a scale per row, e.g. y) or col (per column, e.g. x), the labels of such a scale only at the outer facets.'),
            expressionText,
            expression,
        ], 'The scales of the facets, own (default), shared, the dims which share their scale, of a grid an object of the dims and all, row or col, or an expression of a global.'),
    }, 'A plot per category of a dim, or a grid of two dims.'),

    geo: object({
        data: anyOf([{ type: 'string' }, { type: 'object' }], 'Url of GeoJSON or TopoJSON, relative to the definition, or the GeoJSON or TopoJSON itself.'),
        object: string('The object of TopoJSON, the first one by default.'),
        key: string('The key of the features, id (default) or a property, e.g. NUTS_ID.'),
        name: string('The property of the names of the features, name by default.'),
        join: string('The dim whose values are the keys of the features.'),
        include: array(ref('key'), 'Only the features of these keys, e.g. the countries of the EU.'),
        exclude: array(ref('key'), 'The features of these keys are not drawn at all, e.g. ["RU", "BY"].'),
        projection: object({
            type: option(projectionNames, undefined, { default: 'mercator' }),
        }, 'A d3 projection (type, mercator by default) and its parameters, e.g. rotate, center or parallels.', { additional: true }),
        fit: anyOf([option(['all', 'data']), array(ref('key'))], 'The features the projection is fitted to, all (default), the ones with data or a list of keys.'),
    }, 'The geometry of a map (coord geo), the rows are joined to its features.'),

    control: object({
        type: choice(controlTypes, 'Radio buttons, a drop down list, a slider over the entries or hidden, the global is set by the page (the prop globals).'),
        global: string('The global the control sets, the parts of the definition refer to it in expressions, e.g. "=match(@scale, {log: \'log\'}, \'linear\')".'),
        name: text('The label of the control.'),
        id: string('The id of the control, the global by default; the controls of a parent and its children are merged by it (by the global if one of them has no id), so a child may give only the id and the ids (or values) of the entries it changes.'),
        inImage: boolean('The selection is named below the subtitle of the PNG, false for ones which only change the presentation, e.g. shared scales.', { default: true }),
        values: cases([[isArray,
            array(anyOf([
                ref('controlValue'),
                describe({ type: 'string' }, 'A value, also its name and id.'),
                describe({ type: 'number' }, 'A value, also its name and id.'),
            ]), 'The entries, values with their names, or values.')]],
            object({
                column: string(),
                format: string('The format of the names of the values in the locale: of dates a time format, e.g. "%b %Y" (Okt 2026), "%K. Halbjahr %Y", a number format otherwise.'),
                names: string('The column of the names of the values, of the first row of a value, e.g. monthName.'),
            }, 'The distinct values of a column of the data, ascending.', { required: ['column'] })),
    }, 'A control of a global, e.g. { "type": "radio", "global": "scale", "values": ["linear", "log"] }: its value is the one of the global, the parts of the definition are expressions of it.'),
    controlValue: describe(map(anyOf([{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' }]),
        'An entry, other fields of scalars are names of the templates while it is selected, e.g. {group:short} of a field short of the entry of the global group.', {
            properties: {
                value: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' }, { type: 'array' }], description: 'The value of the global while the entry is selected.' },
                name: text('The value by default.'),
                id: string('The value by default, of the merge with the entries of a parent.'),
                globals: describe({ type: 'object' }, 'Globals which are set when the entry is selected, e.g. a name used by the texts.'),
            },
        })),

    transform: object({
        type: choice(transformTypes, 'year: the year of a date, align: the date in the year `year`, index: relative to the mean of the base, mean: the mean of the base (all rows by default) of the group, share: of the sum of the group, rolling: the mean of `size` rows, cumulative: the sum up to the row, calc: the value of the expression `expr` of the row, filter: only the rows whose expression `expr` is true, rank: the rank in the group, random: a random number of the row in `range`, the same of every draw (`seed`), lookup: the `value` of the row of a file of `data` of the `key`, bin: a row per class of `edges` and group of `by` with its `start`, `end` and the number of the values of `column` in it (`as`), after the rows or instead of them (`replace`), fold: wide to long, a row per row and column of `columns` with its name (`key`) and its value (`value`), aggregate: the `op` (sum, mean, ...) of the values of the group, a column or a row per group (`rows`), window: the value `offset` rows before or after the row (`op` lag, lead, diff, pct) or the `op` (sum, mean, min, max) of a window of `size` rows.'),
        column: string('The column of the values, a template of the globals, of a lookup the one of the keys.'),
        expr: ref('value', 'calc: the expression of the value of the row, filter: the expression of the rows which are kept, its names are the columns of the row and the globals, e.g. "@value / @inno * 100" or "@value > 0".'),
        min: integer('mean: the least number of values, without as many values the mean is missing, 1 by default.', { minimum: 1 }),
        descending: boolean('rank: the largest value is the first one.', { default: false }),
        data: string('lookup: the url of a file of rows, relative to the definition, not a template.'),
        dataFormat: choice(dataFormats, 'lookup: the format of the file, by default the one of the extension of its url.'),
        key: string('fold: the column of the names of the folded columns, key by default; lookup: the column of the keys of the rows of the file; random: the column of the keys of the rows, e.g. an id, a row keeps its number also if the rows of the file are in another order (by default its index in the data).'),
        value: string('fold: the column of the values of the folded columns, value by default; lookup: the column of the values of the rows of the file, a template of the globals, e.g. "name_{lang}".'),
        as: string('The name of the new column, by default the one of `column`, which it replaces; bin: the column of the number of the values of the class, count by default; aggregate with `rows`: the column of the aggregate of the group.'),
        edges: array(anyOf([
            { type: 'number' },
            { type: 'string' },
            object({ from: number(), to: number(), step: number(undefined, { exclusiveMinimum: 0 }) }, undefined, { required: ['from', 'to', 'step'] }),
        ]), 'bin: the edges of the classes, numbers and ranges { "from": 50, "to": 250, "step": 5 }, sorted together, e.g. [{ "from": 50, "to": 250, "step": 5 }, 143]. A class includes its start, the last one also its end, values outside the edges are left out.'),
        step: anyOf([number(undefined, { exclusiveMinimum: 0 }), { type: 'string' }], 'bin: the width of the classes without edges, also a template of the globals, e.g. "{step}", from the largest multiple of it not above the least value to the smallest one not below the largest value.'),
        weight: string('bin: the column of the weights of the rows, the value of a class is the sum of the weights of its values, e.g. of a reporting lag.'),
        normalize: choice(['count', 'share', 'density'], 'bin: the value of a class, the count (or the sum of the weights), the share of the sum of the group or the density (the share per unit of column, per `per` units), e.g. densities of categories of different sizes.', { default: 'count' }),
        per: number('bin: the value per this many units of the width of a class, e.g. 5 of the count per 5k of classes of unequal widths, of a density the share per 5 units.', { exclusiveMinimum: 0 }),
        start: string('bin: the column of the start of the class, start by default.'),
        end: string('bin: the column of the end of the class, end by default.'),
        replace: boolean('bin, fold: the rows of the transform replace the rows (by default of a fold); without it they come after them (by default of a bin), e.g. a histogram and a strip plot of the same values, the marks draw the rows with the values they use.'),
        range: array(number(), 'random: the least and the largest number, [0, 1] by default.', { minItems: 2, maxItems: 2 }),
        seed: anyOf([{ type: 'number' }, { type: 'string' }], 'random: another seed gives other numbers, 0 by default.'),
        by: anyOf([{ type: 'string' }, array(string())], 'The groups of the rows of the same values of these columns, e.g. a line per category.'),
        order: string('The column of the order of the rows of rolling, cumulative, window and of the first and last values of aggregate, e.g. the date, the order of the rows by default.'),
        base: describe({ type: 'object', additionalProperties: true }, 'The rows of the base of an index or of a mean: a column and its value, e.g. { "year": "{base}" }, or a range [from, to], e.g. of dates or years, { "year": [1961, 1990] }.'),
        scale: number('The value of the base of an index (100 by default).'),
        size: integer('The number of the rows of the window of rolling and of the sums, means, least and largest values of window.', { minimum: 1 }),
        align: choice(['end', 'center'], 'The window of rolling and window: the rows before the row (end, by default) or around it.'),
        columns: anyOf([{ type: 'string' }, array(string())], 'fold: the columns to fold, a list of names or a pattern with a single `*`, e.g. "20*", the columns which match, in their order, templates of the globals.'),
        op: choice(['sum', 'mean', 'min', 'max', 'count', 'median', 'first', 'last', 'lag', 'lead', 'diff', 'pct'], 'aggregate: the aggregate of the values of the group, sum, mean, min, max, count (the number of values), median, first or last (in the order of `order`), missing values are left out; window: lag or lead (the value `offset` rows before or after the row), diff (the value minus the one before) or pct (the change in percent), or sum, mean, min, max of the window of `size` rows.'),
        rows: boolean('aggregate: a row per group instead of a column, with the columns `by` and `as`, the rows replace the rows.', { default: false }),
        offset: integer('window: the number of rows before (lag, diff, pct) or after (lead) the row, 1 by default.', { minimum: 1 }),
        year: integer('The year of align, 2020 by default.'),
    }, 'A column computed of the data, e.g. an index of a base year.', { required: ['type'] }),
};

// the operators of the expressions, see isOperator
isOperator.propertyNames.enum.push(...Object.keys(definitions.expression.properties));

const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: schemaUrl,
    title: 'gen-vis definition',
    description: `A chart of gen-vis 5, see https://github.com/petres/gen-vis: its data, the dims of its columns, the marks drawn of them, the controls of its globals and its texts and sizes. A definition can be a part which is merged into its parent, so no entry is required.`,
    type: 'object',
    additionalProperties: false,
    properties: {
        $schema: string(`The version of the definition language, the schema of gen-vis 5 (${schemaUrl}, also of jsdelivr, a full version, e.g. @5.0.0, or node_modules/@preschen/gen-vis/schema.json of the installed package), a definition file needs it, in itself or in a parent; a definition of gen-vis 4 is migrated when it is loaded, 'gen-vis migrate' writes it as one of gen-vis 5.`),
        parent: oneOf([{ type: 'string' }, array(string())], 'Url of the definition this one is deep merged into, relative to this definition, or a list of them (mixins) merged in their order, later ones override earlier ones. Lists are replaced, lists of entries with ids (marks, controls and their entries) are merged by them. A match of a global (of globals or of a control) without a default is a switch over the value of the other parts.'),
        data: string('Url of the data, relative to the definition, CSV, TSV, JSON or parquet, by the extension or dataFormat.'),
        dataFormat,
        transform: cases([[isArray, array(ref('transform'))]], ref('transform'), `Columns computed of the data, e.g. an index of a base year, in their order, see ${docs}#transform.`),
        filter: ref('filter'),
        globals: describe({ type: 'object' }, 'Values the controls change, with their defaults, e.g. { "year": "2025" }; the parts of the definition refer to them in expressions ("=match(@year, ...)", "@globals.year" of a global a dim shadows) and in templates ("{year}").'),
        controls: array(ref('control'), 'The controls of the globals, e.g. radio buttons of the scale or a slider over the years.'),
        title: text(),
        subtitle: text(),
        source: text('The source of the data below the chart, HTML, e.g. a link, a template of the globals, their values are text.'),
        height: ref('number', 'The height of a facet in pixels, 400 by default, e.g. steps of totalWidth.'),
        width: number('The width of the image of the export without one given, the one of the container otherwise.'),
        margins: ref('margins'),
        coord: cases([[globalText, globalText], [{ type: 'string', pattern: registeredName }, anyOf([
            choice(coordNames),
            pattern(registeredName, 'A registered coordinate system, see registerCoord.'),
        ])]], { enum: coordNames }, 'The coordinate system of the marks, cartesian (a horizontal and a vertical axis) by default, polar (an angle and a radius) or geo (a map).'),
        locale: ref('locale'),
        language: string('The language of the texts in several languages (e.g. { "de": "Bevölkerung", "en": "Population" }), a tag, e.g. en, or a global, e.g. @lang of a control or of the page; the locale of the numbers and dates without `locale`; by default the language of `locale`.'),
        transition: anyOf([number(undefined, { minimum: 0 }), { type: 'boolean' }], 'The elements move to their new values in this many milliseconds (true for 300) after a change of a legend, a control or the state.'),
        class: string('The class of the element of the visualisation (vis), a template of the globals, e.g. for the styles of a page.'),
        message: anyOf([{ type: 'string' }, { type: 'null' }, expressionText, expression], 'A text instead of the marks and the legends, a template and an expression of the globals and totalWidth, e.g. steps of a narrow screen, null or an empty text for the marks.'),
        empty: anyOf([{ type: 'string' }, ref('inLanguages'), expression], 'A text instead of the marks if there are no rows, e.g. of a filter, a template of the globals.'),
        hover: ref('hover'),
        highlight: ref('highlight'),
        fontFamily: string('Css font-family, by default the css variable --gen-vis-font-family or Inter (in the package).'),
        dims: map(cases([[isObject, ref('dim')], [isString, string('The column, e.g. "year".')]], ref('none')), 'The dims of the columns of the data by their names, the marks and all other parts of the definition refer to them, a text is the column, null removes a dim, e.g. of a parent.'),
        marks: cases([[isArray, array(ref('mark'))], [isString, expressionText], [isOperator, expression]], ref('mark'), 'A mark or a list of marks, the layers of the chart, drawn in order; also an expression of a global, e.g. "=match(@kind, {map: literal([...])}, literal([...]))".'),
        annotations: cases([[isArray, array(ref('annotation'))], [isString, expressionText], [isOperator, expression]], ref('annotation'), 'An annotation or a list of them, bands, lines, texts and circles at values of the dims, e.g. { "type": "band", "x": ["2025-07-01", null], "label": "Schätzung" }; also an expression of a global.'),
        facets: ref('facets'),
        geo: anyOf([ref('geo'), ref('none')], 'The geometry of a map (coord geo), the rows are joined to its features, null removes the one of a parent.'),
    },
    definitions,
    $comment: 'gen-vis 5.0, written by scripts/schema.js of src/schema/definition.js',
};
