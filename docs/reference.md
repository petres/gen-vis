# Reference of the definition

The keys of every part of a definition of gen-vis 5, with their types, their defaults and the
texts editors show, written of `src/schema/definition.js` (`npm run schema`, do not edit this
file). The language with its examples is [definition.md](definition.md). "expression" is a value
which can also be an [expression](definition.md#expressions), e.g. `"=@innerWidth * 0.5"` or a
`match` of a global.

## The top level<a id="top"></a>

See [definition.md](definition.md#definition).

| Key | Type | Default | |
|-----|------|---------|-|
| `$schema` | string |  | The version of the definition language, the schema of gen-vis 5 (https://unpkg.com/@preschen/gen-vis@5/schema.json, also of jsdelivr, a full version, e.g. @5.0.0, or node_modules/@preschen/gen-vis/schema.json of the installed package), a definition file needs it, in itself or in a parent; a definition of gen-vis 4 is migrated when it is loaded, 'gen-vis migrate' writes it as one of gen-vis 5. |
| `parent` | string \| list of string |  | Url of the definition this one is deep merged into, relative to this definition, or a list of them (mixins) merged in their order, later ones override earlier ones. Lists are replaced, lists of entries with ids (marks, controls and their entries) are merged by them. A match of a global (of globals or of a control) without a default is a switch over the value of the other parts. |
| `data` | string |  | Url of the data, relative to the definition, CSV, TSV, JSON or parquet, by the extension or dataFormat. |
| `dataFormat` | `"csv"`, `"tsv"`, `"json"`, `"parquet"` |  | The format of the data, by default the one of the extension of its url, without one parquet, CSV or JSON by the content. |
| `transform` | list of transform \| transform |  | Columns computed of the data, e.g. an index of a base year, in their order, see https://github.com/petres/gen-vis/blob/main/docs/definition.md#transform. |
| `filter` | condition |  | The rows of the chart: an expression of the values of the rows (`@dim`) and the globals, e.g. "@year == @globals.year and @value > 0", or the values of dims, e.g. { "year": "@globals.year" }, null removes the one of a parent. |
| `globals` | map |  | Values the controls change, with their defaults, e.g. { "year": "2025" }; the parts of the definition refer to them in expressions ("=match(@year, ...)", "@globals.year" of a global a dim shadows) and in templates ("{year}"). |
| `controls` | list of [control](#control) |  | The controls of the globals, e.g. radio buttons of the scale or a slider over the years. |
| `title` | string \| text |  |  |
| `subtitle` | string \| text |  |  |
| `source` | string \| text |  | The source of the data below the chart, HTML, e.g. a link, a template of the globals, their values are text. |
| `height` | number |  | The height of a facet in pixels, 400 by default, e.g. steps of totalWidth. |
| `width` | number |  | The width of the image of the export without one given, the one of the container otherwise. |
| `margins` | margins |  | The space around the plot area of a facet in pixels, of the axes and their titles, e.g. { "left": 60 }; a side without one is the one of the styles of the page (--gen-vis-margin-left: 60px, also of rem, em or pt, or auto) or of its defaults (registerDefaults, e.g. of a house style), else measured ("auto") of the labels of the axes, their tick marks and their titles; an expression of totalWidth, e.g. steps of it, also of "auto" (an expression without a value is no side). |
| `coord` | expression \| `"cartesian"`, `"polar"`, `"geo"` \| string \| `"cartesian"`, `"polar"`, `"geo"` |  | The coordinate system of the marks, cartesian (a horizontal and a vertical axis) by default, polar (an angle and a radius) or geo (a map). |
| `locale` | locale |  | Number and date formats, the name of a built-in locale, a language of Intl (e.g. fr or de-CH) or a d3 locale definition merged into one. |
| `language` | string |  | The language of the texts in several languages (e.g. { "de": "Bevölkerung", "en": "Population" }), a tag, e.g. en, or a global, e.g. @lang of a control or of the page; the locale of the numbers and dates without `locale`; by default the language of `locale`. |
| `transition` | number \| boolean |  | The elements move to their new values in this many milliseconds (true for 300) after a change of a legend, a control or the state. |
| `class` | string |  | The class of the element of the visualisation (vis), a template of the globals, e.g. for the styles of a page. |
| `message` | string \| null \| expression |  | A text instead of the marks and the legends, a template and an expression of the globals and totalWidth, e.g. steps of a narrow screen, null or an empty text for the marks. |
| `empty` | string \| text \| expression |  | A text instead of the marks if there are no rows, e.g. of a filter, a template of the globals. |
| `hover` | [hover](#hover) |  | The hover: the dims of its rows (columns) and its box, templates of html, their values are text. |
| `highlight` | [highlight](#highlight) |  | The highlight of the elements, see highlight and others of the marks. |
| `fontFamily` | string |  | Css font-family, by default the css variable --gen-vis-font-family or Inter (in the package). |
| `dims` | map |  | The dims of the columns of the data by their names, the marks and all other parts of the definition refer to them, a text is the column, null removes a dim, e.g. of a parent. |
| `marks` | list of [mark](#mark) \| expression \| expression \| [mark](#mark) |  | A mark or a list of marks, the layers of the chart, drawn in order; also an expression of a global, e.g. "=match(@kind, {map: literal([...])}, literal([...]))". |
| `annotations` | list of [annotation](#annotation) \| expression \| expression \| [annotation](#annotation) |  | An annotation or a list of them, bands, lines, texts and circles at values of the dims, e.g. { "type": "band", "x": ["2025-07-01", null], "label": "Schätzung" }; also an expression of a global. |
| `facets` | [facets](#facets) |  | A plot per category of a dim, or a grid of two dims. |
| `geo` | [geo](#geo) \| null |  | The geometry of a map (coord geo), the rows are joined to its features, null removes the one of a parent. |

## A dim (`dims.<name>`)<a id="dim"></a>

See [definition.md](definition.md#dims).

| Key | Type | Default | |
|-----|------|---------|-|
| `column` | string |  | The column of the data, can be a template of globals, e.g. "{values}{share}", see controls. |
| `name` | string \| text |  | The title of the legend (the title of the axis is axis.title). |
| `type` | expression \| `"numeric"`, `"date"`, `"categorical"` |  | Without a type it follows from the other parts (categories or a band, point or ordinal scale are categorical, a time or utc scale date, other scales numeric, a dim of the facets categorical, not one only used as `by` of a mark) or from the values of the column: numbers numeric, dates date, otherwise categorical (a column without values, e.g. of empty data, date of a time format of the dim, its axis or its hover, numeric of the parts of numbers, otherwise categorical). The usual texts of missing values, e.g. NA, NaN, n/a, -, . or :, are missing values; other texts among numbers are missing values with a warning if the dim has parts of numbers (a number format, a domain or include of numbers, zero, nice, pad, an open domain) or if more than half of the values are numbers and the texts have digits, e.g. 1,234 or <5. Missing and invalid numeric and date values are null, dates are timestamps or strings, a date without a time zone, e.g. 2024-06-01 or 01.06.2024 13:00, is the one of the time zone of the scale, local or UTC (utc). Categorical values are strings of every format of the data, e.g. "2004" of the number 2004 of JSON or parquet. |
| `format` | string \| text |  | The d3 format of the values (a time format of dates), the one of the axis and of the hover without their own, e.g. ",.0f". |
| `interval` | string |  | Of a date dim of a time or utc scale: a value is the period starting at it, day, week, month, quarter, half (a year), year or a number of them, e.g. "6 months": the domain of the data reaches the end of the last period; @x:scaled (also @x:scaled:center) is the middle of the period of a row, so bars, points, lines and the hover are in the middle of their period, @x:scaled:start and @x:scaled:end are its start and end, @x:step its length in pixels (bars 80% of it by default); ticks, grid lines and annotations stay at their dates; the hover shows the period, e.g. H2 2023 (%K is the half of the year in formats). |
| `scale` | [scale](#scale) \| null |  |  |
| `axis` | [axis](#axis) \| null |  |  |
| `legend` | [legend](#legend) \| null |  |  |
| `hover` | [dimHover](#dimHover) \| null |  |  |
| `domain` | list of domainValue \| expression |  | The domain of the scale, see scale.domain, e.g. [0, null]. |
| `zero` | boolean |  | The domain includes 0 and an end at 0 is not extended, e.g. of bars, negative values below it; bars and areas from 0 include it by default, false keeps the domain of the data; also `scale.zero`. |
| `nice` | boolean \| number |  | Rounds the ends of the domain of the scale, see scale.nice. |
| `pad` | number \| list of number \| expression |  | Extends the ends of the domain taken from the data relative to its size, see scale.pad, e.g. 0.1. |
| `include` | domainValue \| list of domainValue \| expression |  | Values the domain includes, see scale.include, e.g. 0. |
| `reverse` | boolean |  | The range in the other direction, see scale.reverse. |
| `range` | list of number \| string \| expression \| expression |  | The range of the scale, see scale.range, e.g. [0, "@height"] of a vertical band from the top. |
| `grid` | boolean |  | Lines at the ticks of the axis, see axis.grid. |
| `ticks` | number \| null |  | The number of the ticks of the axis, see axis.ticks. |
| `tickSpacing` | number |  | A tick per this many pixels, see axis.tickSpacing. |
| `categories` | map |  | The categories by their key (the value of the column) and their props, e.g. colors, in the order of the legend, the facets and the stacks, a text is the color; listed categories are all of them (`fromData` adds the others), without listed ones the ones of the data. |
| `scheme` | string |  | The colors of the categories in their order as the prop color, a d3 scheme, e.g. Tableau10. |
| `common` | categoryProps |  | The props of all categories. |
| `fromData` | boolean \| `"rows"` |  | The values of the column which are not in categories are categories as well, after them, in ascending order (true) or in the order of the rows ("rows", the default of a dim without listed categories). |
| `order` | expression \| `"ascending"`, `"descending"`, `"rows"` \| list of key |  | The order of the categories: the one of categories (keys which are integers ascending first), ascending, descending (numbers by their value), rows (all in the order of the rows of the data, also the listed ones) or a list of keys which are first. |
| `ranks` | list of categoryProps |  | The props of the categories by their rank in the order: of the first one, the second one, ..., the last entry is the one of all others, e.g. the newest year red. |
| `stacked` | boolean \| expression \| condition |  | Of a dim of values which no mark stacks (`stack` of a mark stacks its values): the values are stacked, true all rows or the condition of the rows which are stacked, the others have their own value as start and end. |
| `stackBy` | string |  | Of a stacked dim: the dim of the positions of the stacks, by default the one of the positions of the coordinate system (x of vertical bars), e.g. the start of the class of a bin (lo) of a histogram whose x are the values of the rows; rows without a value of it are not stacked. |

## The scale of a dim (`dims.<name>.scale`)<a id="scale"></a>

See [definition.md](definition.md#scales).

| Key | Type | Default | |
|-----|------|---------|-|
| `of` | string |  | The scale of another dim, e.g. "y", the values of this one are positions on it too, e.g. the other end of a band, and they are in its domain, without the other parts of a scale. |
| `type` | expression \| `"band"`, `"diverging"`, `"divergingLog"`, `"divergingPow"`, `"divergingSqrt"`, `"divergingSymlog"`, `"identity"`, `"linear"`, `"log"`, `"ordinal"`, `"point"`, `"pow"`, `"quantile"`, `"quantize"`, `"radial"`, `"sequential"`, `"sequentialLog"`, `"sequentialPow"`, `"sequentialQuantile"`, `"sequentialSqrt"`, `"sequentialSymlog"`, `"sqrt"`, `"symlog"`, `"threshold"`, `"time"`, `"utc"` |  | By default linear for a numeric dim, time for a date one, band (bars) or point for a categorical position and ordinal for other categorical ones. A d3 scale, continuous scales and the ones of classes (quantize, quantile, threshold) need a numeric or date dim, point and band a categorical one, ordinal ones are of any values, e.g. colors of categories, positions of dates need a time or utc scale. |
| `orientation` | expression \| expression \| `"horizontal"`, `"vertical"`, `"angular"`, `"radial"`, `null` |  | null: no position, e.g. a y dim of the sizes of points. Places the scale on the plot, horizontal and vertical in the cartesian coordinate system, angular and radial in the polar one. |
| `domain` | list of domainValue \| expression |  | Fixes the domain, a null first or last entry is taken from the data, the values are converted as the ones of the data, e.g. dates, and can be references, e.g. to a global. A diverging scale has a middle entry, a threshold scale the values between its classes, a point or band scale its categories in their order; also `domain` of the dim. |
| `include` | domainValue \| list of domainValue \| expression |  | Values the domain taken from the data includes, e.g. 0 or 100, a value or a list, also references; also `include` of the dim. |
| `center` | domainValue |  | The domain taken from the data is symmetric around this value, e.g. 0 of changes; the middle of a diverging scale. |
| `zero` | boolean |  | The domain taken from the data includes 0 and an end at 0 is not extended (by pad), e.g. of the base of bars, which include it by default (false: not), not of a log scale; also `zero` of the dim. |
| `closed` | expression \| `"left"`, `"right"` | `"left"` | The end of the classes of a threshold scale they include, the lower one (left, value >= limit) or the upper one (right, value > limit). |
| `domainAbs` | pair |  | Extends the domain by absolute values, [start, end], the values are added. |
| `pad` | number \| list of number \| expression |  | Extends the ends of the domain taken from the data (not fixed ones, e.g. 0 of bars) relative to its size, both (a number) or at the start and the end ([start, end]), positive values extend, e.g. 0.1 of 10% below and above; also `pad` of the dim. |
| `domainIgnores` | boolean \| list of string |  | The conditions of the filter of the definition (their dims, true all) the domain taken from the data ignores, e.g. ["month"] of a slider over months: the scale is the same for all months, the marks draw the rows of the month. |
| `nice` | boolean \| number |  | Numeric dims only: rounds the ends of the domain taken from the data, e.g. 0.951 to 1, true for steps of about a tenth of the domain or the number of steps; also `nice` of the dim. |
| `reverse` | boolean |  | The range in the other direction, e.g. the largest value at the bottom; also `reverse` of the dim. |
| `range` | list of number \| string \| expression \| expression |  | By default the width or height of the plot, e.g. colors, references to the sizes of the coordinate system, e.g. "@radius"; also `range` of the dim. |
| `padding` | number |  | Band and point scales: the space between the categories and at the ends in steps, 0.4 by default; of a point scale of angles the place of the first category in steps, half a step after the top (0.5) by default, 0 at the top, e.g. of a radar chart. |
| `step` | number |  | The pixels of a category of a vertical band or point scale, the height of the plot is the one of its categories (instead of height), e.g. the rows of horizontal bars keep their size if some are hidden. |
| `order` | expression \| `"ascending"`, `"descending"` \| object |  | The order of the categories of the data of a band, point or ordinal scale: of the rows (default), ascending, descending or by the value of a dim of their first row, e.g. bars by their length. |
| `groups` | object |  | The categories of a band or point scale in groups of the values of a dim of their rows, with a space between the groups. |
| `inset` | number \| list of number \| expression |  | The space at the start and the end of the range in pixels (of positions), a number for both or [start, end], e.g. so the first and the last point are not at the edges of the plot area. |
| `interpolator` | string |  | The colors of a sequential or diverging scale, a d3 interpolator, e.g. Blues, Viridis or RdYlGn. |
| `scheme` | string |  | The colors of the range, a d3 scheme, e.g. Blues or Tableau10. |
| `classes` | number |  | The number of colors of a scheme of several sizes, by default the number of classes of a threshold scale or 5. |

## The axis of a dim (`dims.<name>.axis`)<a id="axis"></a>

See [definition.md](definition.md#axes).

| Key | Type | Default | |
|-----|------|---------|-|
| `position` | expression \| `"top"`, `"bottom"`, `"left"`, `"right"`, `"angular"`, `"radial"` |  | top, bottom, left or right of the cartesian coordinate system, angular (around the circle) or radial (from the center) of the polar one. |
| `at` | domainValue |  | Cartesian axes: the line of the axis at this value of the dim of the other axis, e.g. 0 of an axis of x at y = 0 or a date of an axis of y, converted as the values of the data, also a reference "@zero"; a value outside of the domain of the other scale leaves it at its edge (`position`, also the side of its labels and tick marks). |
| `angle` | number |  | The angle of a radial axis in degrees, clockwise from the top, 0 by default. |
| `gridShape` | expression \| `"circle"`, `"polygon"` |  | The grid lines of a radial axis, circles or polygons through the ticks of the angle, e.g. of radar charts. |
| `ticks` | number \| null |  | The number of the ticks, null for the ones of tickSpacing, e.g. of a parent; also `ticks` of the dim. |
| `tickSpacing` | number |  | Without ticks, a tick per this many pixels of the length of the axis, e.g. 80; also `tickSpacing` of the dim. |
| `values` | list of values \| expression |  | Fixed ticks, converted as the values of the data, categories as strings, e.g. [2004, 2008] or ["2004", "2008"] of the years of any format of the data, the ones outside of the domain or which are no category of a band or point scale are left out, also an expression, e.g. steps of totalWidth; all of them are labelled (other labels of a horizontal axis which overlap show every n-th one). |
| `format` | string \| text |  | A d3 number or time format. |
| `labels` | object |  | The props of the labels of the ticks (svg attributes and text), of the props of the categories of the tick and of the categories of its row of the dims `by`, its values and the names of the facet, e.g. { "by": ["level"], "props": { "font-weight": "@weight", "text": "@short", "max-width": 300 } }, of all axes, e.g. { "props": { "fill": "#777", "font-size": 10, "stroke-width": 2 } } of the values of a radial axis in the background, the stroke and its width replace the halo of the labels of radial axes. |
| `tickMarks` | `false` \| object |  | The tick marks: false leaves them out (the labels stay at their places), their length (size, 9 pixels across the line of cartesian axes, 6 outside of the circle of angular ones by default, the labels move with it), the part of it inside the plot area (inset, by default 4 pixels of bottom and right axes, 5 of top and left ones, 0 of angular ones, e.g. 0 for marks outside only) and their props (svg attributes of the names of the facet), e.g. { "props": { "stroke": "var(--gen-vis-grid-color)" } }, radial axes have none. |
| `domain` | object |  | The props of the line of the axis (svg attributes, its class is domain, a circle of an angular axis) of the names of the facet, e.g. { "props": { "stroke-opacity": 0.4 } }. |
| `rotate` | number |  | The angle of the labels in degrees, positive counterclockwise, negative clockwise. |
| `grid` | boolean |  | Lines at the ticks; also `grid` of the dim. |
| `title` | object |  |  |
| `padding` | number | `3` | The gap between the tick marks and the labels in pixels, also of polar axes, 3 by default (see the prop defaults). |

## The legend of a dim (`dims.<name>.legend`)<a id="legend"></a>

See [definition.md](definition.md#legends).

| Key | Type | Default | |
|-----|------|---------|-|
| `position` | expression \| expression \| `"top"`, `"bottom"`, `"left"`, `"right"` |  | The place of the legend, above or below the plots or beside them, the plots have the rest of the width, an expression of totalWidth (the width of the visualisation), e.g. below the plots of a phone. |
| `orientation` | expression \| expression \| `"horizontal"`, `"vertical"` |  | The direction of the scale of the colors, a vertical one has the high values at the top, an expression of totalWidth (the width of the visualisation). |
| `classes` | boolean |  | Of a legend of the colors of a threshold, quantize or quantile scale: a label per class in its middle, e.g. < 50, 50–100, ≥ 300, instead of ticks at the limits. |
| `onlyData` | boolean | `false` | Only the entries of the categories of the rows after the filter, e.g. of the selected year, also the hidden ones. |
| `size` | number | `240` | The length of the scale of the colors in pixels. |
| `values` | list of number |  | The ticks of a gradient of colors, e.g. [0, 50, 100]. |
| `labels` | expression \| `"before"`, `"after"` | `"after"` | The labels of the scale of colors after it (below, right of a vertical one) or before it. |
| `format` | string \| text |  | The format of the values of the colors of a scale, by default the one of the hover. |
| `missing` | object |  | An entry of the regions without a value beside the colors of a scale, e.g. { "name": "no data", "color": "#EEE" }. |
| `symbol` | legendSymbol |  | The symbol before the name of a category: auto (the default) of the marks of the categories (a box of their bars or areas, a line of their lines, a dot of their points), line, rect or circle in its color, or the svg elements, drawn in a box of width x height pixels (size both, by default the one of the defaults of the chart, 16) from 0, 0, at the middle of the capitals of the name; null (or an object without elements) is none, e.g. instead of the one of a parent. |
| `props` | map |  | HTML attributes of the entries, e.g. a title, props of the categories. |

## The hover of a dim (`dims.<name>.hover`)<a id="dimHover"></a>

See [definition.md](definition.md#the-hover-of-a-dim).

| Key | Type | Default | |
|-----|------|---------|-|
| `cell` | boolean | `true` | false: the value is a name of the templates of the hover (e.g. {half} of the title), without a cell of the table. |
| `format` | string \| text |  | By default the format of the axis. |
| `props` | map |  | The columns of the entries of a categorical dim, name by default. |
| `row` | object |  | The rows of the hover of the categories of a categorical dim. |

## A mark (`marks[]`)<a id="mark"></a>

See [definition.md](definition.md#marks).

| Key | Type | Default | |
|-----|------|---------|-|
| `type` | expression \| `"arc"`, `"area"`, `"bar"`, `"base"`, `"cell"`, `"circle"`, `"label"`, `"line"`, `"mesh"`, `"point"`, `"rect"`, `"region"`, `"rule"`, `"text"` \| `"svg:circle"`, `"svg:line"`, `"svg:rect"`, `"svg:text"`, `"cartesian:line"`, `"cartesian:area"`, `"cartesian:rule"`, `"cartesian:bar"`, `"polar:line"`, `"polar:area"`, `"polar:arc"`, `"polar:circle"`, `"polar:text"`, `"geo:base"`, `"geo:region"`, `"geo:circle"`, `"geo:text"`, `"geo:mesh"`, `"annotation:band"`, `"annotation:line"`, `"annotation:text"`, `"annotation:circle"` \| string \| `"arc"`, `"area"`, `"bar"`, `"base"`, `"cell"`, `"circle"`, `"label"`, `"line"`, `"mesh"`, `"point"`, `"rect"`, `"region"`, `"rule"`, `"text"`, `"svg:circle"`, `"svg:line"`, `"svg:rect"`, `"svg:text"`, `"cartesian:line"`, `"cartesian:area"`, `"cartesian:rule"`, `"cartesian:bar"`, `"polar:line"`, `"polar:area"`, `"polar:arc"`, `"polar:circle"`, `"polar:text"`, `"geo:base"`, `"geo:region"`, `"geo:circle"`, `"geo:text"`, `"geo:mesh"`, `"annotation:band"`, `"annotation:line"`, `"annotation:text"`, `"annotation:circle"` |  | The type of the mark, line, area, bar, rule, point, label, text or cell of cartesian charts, arc of polar ones, base, region, mesh of maps, with the default attributes of the type, a definition writes only the ones which differ. |
| `id` | string |  | The class and the data-mark of the group of the mark, mark-<index> by default, the marks of a parent are merged by their ids. |
| `by` | string \| list of string |  | The rows are grouped by this dim or these dims, e.g. a line per category, the props of their categories are known to the attributes (@color, @name, ...). |
| `x` | dim, number or expression |  | The dim of the horizontal position (x by default); a number is a value on the scale of x of a rule, a point or a text (cartesian), pixels otherwise (=literal(n) are pixels). |
| `y` | dim, number or expression |  | The dim of the vertical position (y by default); a number is a value on the scale of y of a bar, a rule, a point or a text (cartesian), pixels otherwise (=literal(n) are pixels). |
| `x0` | dim, number or expression |  | The start of a bar or an area (a dim, a number on the scale of x), e.g. the start of a class of a bin, 0 by default. |
| `x1` | dim, number or expression |  | The end of a bar of a class of a bin, or of an area; of a rule its start (a number on the scale of x). |
| `x2` | dim, number or expression |  | The other end of a rule (a number on the scale of x). |
| `y0` | dim, number or expression |  | The start of a bar or an area (a dim, a number on the scale of y), 0 by default. |
| `y1` | dim, number or expression |  | The end of a bar or an area, e.g. the upper edge of a band of a range; of a rule its start (its other end is y2, a number on the scale of y). |
| `y2` | dim, number or expression |  | The other end of a rule, e.g. "hi" of an error bar (a number on the scale of y). |
| `lon` | dim, number or expression |  | Of a map: the dim of the longitude of a point or a text, or an expression of the row. |
| `lat` | dim, number or expression |  | Of a map: the dim of the latitude, or an expression of the row. |
| `stack` | boolean \| expression \| condition |  | Stacks the values of the mark (bars, areas, arcs) by the groups of `by`, true all rows or the condition of the rows which are stacked, the others have their own value as start and end. |
| `dodge` | boolean \| string \| number |  | Bars: the groups of `by` (true, the first one) or of this dim beside each other in the band of their position, with `stack` a stack per slot; texts, points and rules (true or a dim): at the middle of the slot of their category, e.g. labels or error bars of dodged bars; texts (a number): the texts are moved apart vertically to at least this distance, e.g. labels at the ends of lines. |
| `orient` | expression \| `"horizontal"`, `"vertical"` |  | Bars: horizontal bars (the values of x, the categories of y), by default of a categorical y or of a continuous x (e.g. zero) and a y which is not. |
| `anchor` | expression \| `"start"`, `"end"`, `"top"`, `"bottom"`, `"center"`, `"top-start"`, `"top-end"`, `"bottom-start"`, `"bottom-end"` |  | Labels: the text beside its position, after it (end, e.g. of horizontal bars), before it (start), above it (top), below it (bottom), on it (center) or at a corner, above and after it (top-end), .... |
| `filter` | expression \| condition |  | The rows of the mark, an expression of the row or the values of dims, see filter of the definition. |
| `curve` | expression \| `"linear"`, `"monotoneX"`, `"natural"`, `"catmullRom"`, `"basis"`, `"step"`, `"stepBefore"`, `"stepAfter"`, `"linearClosed"`, `"catmullRomClosed"`, `"basisClosed"` | `"linear"` | The interpolation of the paths and areas between their points, monotoneX is smooth without overshooting the values, the closed ones connect the last point with the first one, e.g. of radar charts. |
| `data` | string \| list of map |  | Rows of the mark instead of the ones of the data, e.g. events, with the names of the dims and others, e.g. a label, or the url of a file of them. The values of rows of the definition are expressions, e.g. references to globals. |
| `dataFormat` | `"csv"`, `"tsv"`, `"json"`, `"parquet"` |  | The format of the url of the data, by default the one of its extension. |
| `select` | expression \| `"first"`, `"last"` \| object |  | One row of every group: the first or the last one along the dim of x (as the points of a line, see order), or the one with the least or the most value of a dim, e.g. labels at the ends of lines. |
| `order` | expression \| `"x"`, `"y"`, `"rows"` |  | Lines and areas (and the first and the last row of select): the order of the points, along x (the angle of polar charts) by default, along y if y is categorical and x is not; along a categorical dim in the order of its categories, a continuous one ascending; rows keeps the order of the rows, e.g. of a connected scatter plot. |
| `layer` | expression \| `"below"`, `"above"` |  | below: below the axes and grid lines, above: above the other marks, between them by default. |
| `facet` |  |  | The facets of the mark, a key or a list of them, all by default; of a grid also the values of the dims of its rows and columns, e.g. { "group": "Bau" } (a column, a row or a cell). |
| `once` | boolean |  | One element per facet, of no row: its attributes are the names of the facet, e.g. a header or a unit label at the edge of the plot area, "y": "@plot:top", "text": "@facet:name". |
| `place` | expression \| `"pole"`, `"centroid"` \| object |  |  |
| `fit` | boolean |  | geo:text: only the labels which fit into the area around the pole of their feature (estimated of their characters and font size), also of place centroid; texts of place in: true (default) leaves out a label without room in its band, false places it where it violates the least. |
| `overlap` | boolean | `true` | geo:text: false leaves out the labels which overlap the one of a larger area, so a map needs no list of the labels shown; texts of place in: false (default) places the labels apart, true lets them overlap. |
| `ends` | expression \| `"base"`, `"open"` | `"base"` | Of the stairs of a line of x0 and x1: down to the base at both ends (base) or from the first step to the last one (open), e.g. of shares. |
| `halo` | boolean \| number |  | Texts (also of maps): a halo behind the texts in the color of --gen-vis-halo-color, true (3 pixels) or its width, the stroke attributes of the mark replace its stroke. |
| `object` | string |  | geo:mesh: the object of the TopoJSON of the borders, the one of the geometry by default, e.g. the states above the districts. |
| `borders` | expression \| `"all"`, `"inner"`, `"outer"` | `"all"` | geo:mesh: all borders, the ones between two features (inner) or the outline (outer). |
| `before` | string |  | Right before the mark of this id, in its layer, e.g. lines above the bars but below the labels whose halo cuts them. |
| `highlight` | object |  | The attributes of the elements of the category of the hover or of the entry of the legend, e.g. { "stroke-width": 3 }, mode: the elements of the category (group, default) or only the one of its row (row), e.g. a segment of a stacked bar. |
| `others` | map |  | The attributes of the other elements of the mark while an element is highlighted, e.g. { "opacity": 0.3 }. |

## An annotation (`annotations[]`)<a id="annotation"></a>

See [definition.md](definition.md#annotations).

| Key | Type | Default | |
|-----|------|---------|-|
| `type` | `"band"`, `"line"`, `"text"`, `"circle"` |  |  |
| `props` | attributes |  | Svg attributes (and text), values, references "@name", expressions or nested props, e.g. d of a path. |
| `label` | string \| text |  | A label of a band or a line, a template of the globals. |
| `text` | string \| text |  | The text of a text, a template of the globals. |
| `above` | boolean |  | Above the marks, below them by default, as layer above. |
| `layer` | `"below"`, `"above"` |  | Below the marks and the axes (default) or above all marks. |
| `legend` | string |  | The name of the annotation in the legend (a template of the globals), with a symbol of it: a vertical line of a line at a value of x, a horizontal one of y, a box of a band, a dot of a circle; one entry per name, after the legends of the dims. |
| `before` | string |  | Right before the mark of this id, in its layer, e.g. lines above the bars but below the labels whose halo cuts them. |
| `facet` |  |  | The facets of the annotation, a key or a list of them, all by default; of a grid also the values of the dims of its rows and columns, e.g. { "group": "Bau" } (a column, a row or a cell). |
| `lon` | number |  | The longitude of a map. |
| `lat` | number |  | The latitude of a map. |

## The hover (`hover`)<a id="hover"></a>

See [definition.md](definition.md#hover).

| Key | Type | Default | |
|-----|------|---------|-|
| `columns` | list of string |  | The dims of the hover beside the value of the position (its rows of their values, in this order), by default the dims the marks use, of their `by` and their positions x and y (not the ends of ranges, not the ones of the facets); a dim with a `hover` of its own is in it as well, [] only those. |
| `value` | boolean |  | The value of the position (e.g. y of a line, x of horizontal bars) as a cell of the rows, true by default; false shows only the categories and the dims of the columns, e.g. the unsigned values of a population pyramid. |
| `total` | boolean \| string \| text |  | A row of the sum of the stacked values of the position below the rows (true, or its name, e.g. Gesamt), in the format of the values; also {total} of the title. |
| `mode` | expression \| `"position"`, `"point"` |  | The rows of the nearest position of the axis (position, by default) or the row of the nearest point, e.g. of a scatter plot. |
| `radius` | number |  | The distance of the nearest point in pixels, 30 by default. |
| `filter` | expression \| condition |  | The rows with a hover, e.g. not the ones of headers, an expression of the row or the values of dims. |
| `box` | boolean | `true` | false: no box of the hover, its highlight and the events stay, e.g. a hover of the highlight only. |
| `marker` | boolean | `true` | false: no line of the position of the hover. |
| `empty` | boolean | `false` | true: a hover also without rows, e.g. the name of a region without a value. |
| `position` | expression \| `"marker"`, `"pointer"` | `"marker"` | The hover is beside the marker of the position (or the center of a region) or at the pointer. |
| `side` | expression \| `"left"`, `"right"`, `"above"`, `"below"`, `"center"` |  | The side of the hover, by default the one with more space, center on the position, e.g. in the center of a polar plot. |
| `offset` | pair |  | Moves the hover by [x, y] pixels. |
| `area` | expression \| `"plot"`, `"facet"` | `"plot"` | The area of the hover, the plot area or the facet with its margins, e.g. the labels of the rows of horizontal bars. |
| `title` | string \| text |  | The title, {title} is the default one, e.g. the date, and the globals. |
| `row` | string \| text |  | A row instead of the table: {land} the name of a category, {land.unit} another hover prop, {y} the formatted value, {y.value} the value, and the globals. |

## The highlight (`highlight`)<a id="highlight"></a>

See [definition.md](definition.md#highlight).

| Key | Type | Default | |
|-----|------|---------|-|
| `transition` | number |  | The attributes move to the ones of the highlight in this many milliseconds, e.g. 50. |

## The facets (`facets`)<a id="facets"></a>

See [definition.md](definition.md#facets).

| Key | Type | Default | |
|-----|------|---------|-|
| `by` | string \| object |  | The dim of the facets, or the dims of the rows and the columns of a grid. |
| `cols` | number |  | The number of the columns of the facets of `by`, 1 by default, e.g. steps of totalWidth. |
| `rowHeaders` | expression \| `"left"`, `"right"` \| object | `"right"` | The headers of the rows of a grid: right of them vertical (default), left of them horizontal, in a column of the width of the longest one, or { "side": "left", "vertical": true }, e.g. as a title of an axis. |
| `axisTitles` | expression \| `"all"`, `"outer"` | `"all"` | The titles of the axes in every facet (all) or only at the outer ones (outer): of the bottom axis in the bottom row, of the left one in the first column, of the right one in the last column, of the top one in the first row. |
| `title` | object |  | The titles of the facets (.vis-facet-title). |
| `scales` | expression \| `"own"`, `"shared"` \| list of string \| map \| expression |  | The scales of the facets, own (default), shared, the dims which share their scale, of a grid an object of the dims and all, row or col, or an expression of a global. |

## A map (`geo`)<a id="geo"></a>

See [definition.md](definition.md#maps).

| Key | Type | Default | |
|-----|------|---------|-|
| `data` | string \| map |  | Url of GeoJSON or TopoJSON, relative to the definition, or the GeoJSON or TopoJSON itself. |
| `object` | string |  | The object of TopoJSON, the first one by default. |
| `key` | string |  | The key of the features, id (default) or a property, e.g. NUTS_ID. |
| `name` | string |  | The property of the names of the features, name by default. |
| `join` | string |  | The dim whose values are the keys of the features. |
| `include` | list of key |  | Only the features of these keys, e.g. the countries of the EU. |
| `exclude` | list of key |  | The features of these keys are not drawn at all, e.g. ["RU", "BY"]. |
| `projection` | object |  | A d3 projection (type, mercator by default) and its parameters, e.g. rotate, center or parallels. |
| `fit` | expression \| `"all"`, `"data"` \| list of key |  | The features the projection is fitted to, all (default), the ones with data or a list of keys. |

## A control (`controls[]`)<a id="control"></a>

See [definition.md](definition.md#globals-and-controls).

| Key | Type | Default | |
|-----|------|---------|-|
| `type` | `"radio"`, `"select"`, `"slider"`, `"hidden"` |  | Radio buttons, a drop down list, a slider over the entries or hidden, the global is set by the page (the prop globals). |
| `global` | string |  | The global the control sets, the parts of the definition refer to it in expressions, e.g. "=match(@scale, {log: 'log'}, 'linear')". |
| `name` | string \| text |  | The label of the control. |
| `id` | string |  | The id of the control, the global by default; the controls of a parent and its children are merged by it (by the global if one of them has no id), so a child may give only the id and the ids (or values) of the entries it changes. |
| `inImage` | boolean | `true` | The selection is named below the subtitle of the PNG, false for ones which only change the presentation, e.g. shared scales. |
| `values` | list of [controlValue](#controlValue) \| string \| number \| object |  |  |

## An entry of a control (`controls[].values[]`)<a id="controlValue"></a>

See [definition.md](definition.md#globals-and-controls).

| Key | Type | Default | |
|-----|------|---------|-|
| `value` | string \| number \| boolean \| null \| list of values |  | The value of the global while the entry is selected. |
| `name` | string \| text |  | The value by default. |
| `id` | string |  | The value by default, of the merge with the entries of a parent. |
| `globals` | map |  | Globals which are set when the entry is selected, e.g. a name used by the texts. |
