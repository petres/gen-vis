# Definition

The definition language of gen-vis 4: a definition (a JSON object, the
*def*) names its data, the mappings of the columns, the plots and the parts
around them. Its keys:

```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@4/schema.json",
    "parent": "../shared/def.json",
    "data": "data.csv",
    "dataFormat": "csv",
    "transform": [ ... ],
    "options": { ... },
    "globals": { ... },
    "filter": { ... },
    "mapping": { ... },
    "plot": [ ... ],
    "annotations": [ ... ],
    "facets": { ... },
    "formElements": [ ... ],
    "geo": { ... }
}
```

A definition of 4.0 is short: a mapping can be the name of its column, `x`
and `y` have a scale and an axis by default, the type of a mapping follows
from its parts or its values, a plot type of the coordinate system, e.g.
`line`, has the props it needs by default:

```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@4/schema.json",
    "data": "data.csv",
    "mapping": {
        "x": "Jahr",
        "y": { "column": "Einwohner", "format": ",.0f", "domain": [0, null], "axis": { "grid": true } },
        "land": { "column": "Bundesland", "fromData": true, "scheme": "Tableau10", "legend": {} }
    },
    "plot": { "type": "line", "by": "land", "highlight": { "stroke-width": 3 } }
}
```

The changes of the definitions of 3.x are listed in the
[changelog](../CHANGELOG.md).

See [data](#data) (also `dataFormat`), [`transform`](#transform),
[`options`](#options), [`mapping`](#mapping), [`plot`](#plot),
[annotations](#annotations), [`facets`](#facets), [`formElements`, `globals`
and `filter`](#formelements-and-globals), [maps](#maps) (`geo`), [polar
plots](#polar-plots), the [props](#props-of-the-definition) (expressions) and
the [defaults](#defaults) of the axes.

## Parents and mixins

Relative urls are resolved against the definition referencing them, e.g.
`data.csv` is next to the definition file, the `data` of a parent against the
loaded definition. A definition is deep merged into
its `parent` (and its parent into its own parent), arrays are replaced, not
merged, except arrays whose entries all have an `id`, e.g. the form elements
and their values, these are merged by the ids, entries with a new id are
appended. With `check` (or `debug`) the merged definition is checked for
common mistakes, e.g. unknown plot types, unknown keys of the
[schema](#schema) (with the name it probably is, e.g. `domian` of
`domain`), also the definition with the patch of every entry of the form
elements (`formElements[0].values[1] > plot[0].type: ...`) and the data,
e.g. years as numbers of a `date` mapping, the findings are logged as
warnings in the console, the check is only loaded then, see also [checks
outside the browser](extensions.md#checks-outside-the-browser), a definition
which can not be drawn, e.g. a mapping which is no object, is an error which
names the part. Only the footer and the templates of the hover
(`options.hover`) are HTML, e.g. the link of a source, so a definition is
trusted, texts of users, e.g. of a form of a page, must not be part of it,
and so are its urls (`defFile`, `data`, the parents, maps and files), they
are loaded as they are,
the values of the globals and of the data in them are text. All other texts,
e.g. the title, the names of the legends and the hover and the titles of the
axes, are text, `<` is shown as it is.

`parent` can also be a list of definitions (mixins), merged in their order,
later ones override earlier ones, e.g. a chart type and a form element:

```json
{
    "parent": ["../shared/years.json", "../shared/scale-switch.json"],
    "data": "data.csv"
}
```

A parent shared by several mixins is merged once, before the first mixin
using it, so it does not override the mixins in between.

The charts of a page share their requests of the last 5 minutes, e.g. a parent
used by all of them or a csv of two charts is loaded once, later ones load
again, e.g. for updated data. The parents of a definition and its data are
requested at once.

## `$schema`

The package contains a JSON Schema of the definitions, `schema.json`. Its
`$id` as the `"$schema"` of a definition declares the version of the
definition language, gen-vis 4, and editors like VS Code complete and check
the definition with it:

```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@4/schema.json",
    ...
}
```

- A definition file (`defFile`, also `resolveParents` of a url) needs a
  `$schema` of gen-vis 4, in itself or in one of its parents, otherwise the
  load fails, e.g. "'…/def.json' is no definition of gen-vis 4: its $schema
  is missing" (or "is the one of gen-vis 3"); every part with a `$schema`
  (a parent too) needs the one of gen-vis 4.
- A definition object or text (`def`) may have none, but one it has is the
  one of gen-vis 4; `validateDef` warns of another one.
- A `$schema` of gen-vis 4 is a url or a path which ends in
  `@preschen/gen-vis@<version>/schema.json` of the major version 4: `@4`,
  `@4.1`, `@4.0.2`, `@4.0.0-beta.1`, of unpkg or jsdelivr
  (`https://cdn.jsdelivr.net/npm/@preschen/gen-vis@4/schema.json`), or the
  schema of the installed package, a path which ends in
  `node_modules/@preschen/gen-vis/schema.json`, e.g.
  `"./node_modules/@preschen/gen-vis/schema.json"`. A schema of gen-vis
  without a version (the newest one of unpkg) is none of 4, the one of
  another major version neither, nor any other schema.

The schema also allows parts of definitions, e.g. definitions with a
`parent`. The definitions of `data/` and of the page have the `$schema` in
every file, also in the parents and mixins, so the editors check each of
them (a definition file needs it only in itself or in a parent).

## Data

`data` is CSV, TSV, JSON (a list of rows) or [parquet](https://parquet.apache.org/),
by the extension of the url (`.csv`, `.tsv`, `.json`, `.parquet`), without one
CSV or JSON by the content. `dataFormat` sets it, e.g. for an url of an api,
also the one of a parent, data which can not be read is an error of its url:

```json
{ "data": "/api/prices?year=2024", "dataFormat": "json" }
```

Parquet is read with [hyparquet](https://github.com/hyparam/hyparquet) (no
wasm), it is only loaded for parquet data. Only the columns the definition
can use are read: the ones of the mappings (also of the patches of form
elements, a column template in every value of its globals), of the
transforms and of the values of form elements, so a wide file costs only its
columns which are used. Integers of 64 bits are numbers, unless they are too
large for them, e.g. ids, then they are strings, also in lists and structs, timestamps are the ones of
the other formats, dates (without a time) and timestamps without a time zone
(e.g. of pandas, polars and duckdb) are strings as the ones of csv, e.g.
`2024-06-01` and `2024-06-01T13:00:00.000`, see `type` of
[mapping](#mapping), decimals (`DECIMAL`, e.g. doubles written as integers
with a scale, less than half the size, also of bytes and of only the logical
type) and floats of 32 bits are the numbers of their text, the
same as the ones of csv, e.g. `22.1637`. Snappy, the default of arrow (R, Python), pandas and
duckdb, is read directly, other compressions, e.g. zstd of polars, load the
decompressors of `hyparquet-compressors` (~75 kB gzipped), the standalone
script (its single files) reads only snappy and uncompressed parquet, its
module loads the decompressors as well.

The values of a `categorical` mapping (and of a mapping without a `type`)
are strings, as the ones of CSV, whatever the format of the data, e.g. the
year 2004 of a parquet or JSON column is `"2004"`, so a definition is the same
for every format. A missing category is `null`, also an empty cell of CSV. Numbers are numbers
of the data or texts of decimal numbers, e.g. `-1.5e3`, not `0x10`, `1,234`
or `true`, other values are missing values. The values of the definition are converted the same way,
the keys of `props`, the fixed `values` of an axis, the `domain` of a scale,
the values of annotations, of the `data` of plots, of `filter` and of
references such as `"@x:scaled:2004"`, so they can be strings or numbers,
e.g. `"values": ["2004", "2008"]` or `[2004, 2008]`. Categories which are
numbers are compared by their value, e.g. `"9"` before `"10"` (the order of
a scale, `range` of a filter, `select` of a plot).

## `transform`

Transforms compute columns of the data in the browser, e.g. an index of a
base year which a slider changes, instead of columns of every base year in the
file. A transform (or a list of them, in their order) computes the column
`as` (by default its `column`, which it replaces) of the values of `column`,
in groups of the rows of the same values of the columns `by` (a column or a
list), the mappings and the later transforms can use the new column:

```json
"globals": { "base": "2019" },
"transform": [
    { "type": "year", "column": "date", "as": "year" },
    { "type": "index", "column": "value", "as": "index", "by": "type", "base": { "year": "{base}" } }
],
"formElements": [{ "id": "base", "name": "Basisjahr", "ref": "base", "type": "slider", "values": { "column": "year" } }],
"mapping": { "y": { "column": "index", ... } }
```

- `year`: the year of a date, e.g. `2024` of `2024-06-01`.
- `align`: the same day of a date in the year `year` (2020 by default, a
  leap year), e.g. to compare the years of daily data on one axis, with
  `year` as the categories.
- The dates of `year` and `align` are the ones of the time zone of the
  scale of the column (`column` or `as`), local or UTC of a `utc` scale.
- `index`: the values relative to the mean of the values of the rows of
  `base` in the group, times `scale` (100 by default). `base` is a column and
  its value, e.g. `{"year": "{base}"}`, or a range `[from, to]` (`null` is
  open), e.g. of dates `{"date": ["2019-01-01", "2019-12-31"]}`.
- `mean`: the mean of the values of the rows of `base` (all rows by default,
  a column and its value or a range, as the `base` of `index`) in the group,
  a value of every row of the group, without one if there are less than
  `min` values (1 by default), e.g. the mean of a day of all years (`"by":
  "day"`, the day of `align`) or the one of a period, `{"type": "mean",
  "column": "value", "base": {"year": [1961, 1990]}, "min": 22, "as":
  "p1"}`.
- `share`: the share of the value of the sum of the values of the group, e.g.
  `"by": "date"` for the shares of the categories of a date.
- `rolling`: the mean of the values of `size` rows of the group, the ones
  before the row (`"align": "end"`, the default) or around it (`"center"`),
  only of whole windows, missing values are left out (a row without a value
  has no mean, as of `cumulative`), in the order of the
  column `order`, e.g. `{"type": "rolling", "column": "value", "as": "mean28",
  "by": "country", "order": "date", "size": 28}`.
- `cumulative`: the sum of the values of the group up to the row, in the order
  of `order`, e.g. the sum of a year so far with `"by": "year"`.
- `calc`: the value of the [expression](#props-of-the-definition) `expr`
  of the row in the column `as`, its names are the columns of the row (also
  the ones of the transforms before) and the globals, without a value if a
  number is missing or of a division by 0, e.g. a value relative to the one
  of a group in another column, `{"type": "calc", "expr": {"*": [{"/":
  ["@value", "@inno"]}, 100]}, "as": "rel"}`, or the larger one of two
  columns, e.g. the end of a band above a mean, `{"max": ["@value", "@mean"]}`.
- `filter`: only the rows whose expression `expr` is true (the names are
  the ones of `calc`), the later transforms, the plots and the scales have
  only them, e.g. `{"type": "filter", "expr": {">": ["@value", 0]}}`, a
  `share` after it is the one of these rows. The values of form elements of
  a column are the ones of all rows. The `filter` of the definition is one of
  the values of mappings, see [formElements](#formelements-and-globals).
- `rank`: the rank of the value in its group, 1 of the least one or of the
  largest one with `"descending": true`, the same values have the same
  rank, e.g. the place of a country in a year with `"by": "year"`.
- `lookup`: the value of the column `value` of the row of a file of rows
  (`data`, its url relative to the definition, the format of its extension
  or `dataFormat`) whose column `key` is the value of `column`, e.g. the
  names of the countries of the codes of the data in the language of the
  page: `{"type": "lookup", "column": "country", "data": "countries.csv",
  "key": "code", "value": "name_{lang}", "as": "countryName"}`. The file is
  loaded with the data, its url is no template.

The strings of a transform are templates of the globals, e.g. `{base}`, the
transforms are computed again when the globals change, from the first one
which they change. The CSV of the data has the computed values. See
`data/bev/def-index.json`.

## `options`

`title`, `subtitle`, `footer` (HTML), `width` (the width of the container if
not given), `height` (of a facet, 400 by default) and `margins` (`{"top",
"right", "bottom", "left"}` in pixels). `height` and the margins can be props
based on `totalWidth`, see [props](#props-of-the-definition), e.g. a smaller
margin of the labels on a phone.
`{name}` in `title`, `subtitle` and `footer` is replaced by the value of the
global, e.g. `"Durchschnitt {base} = 100"` of a form element of the base year,
also in the image and the name of its file, see
[templates](#formelements-and-globals).

`message` is a text instead of the plots and the legends, a prop of the
globals and `totalWidth` (a template), e.g. of a narrow screen:

```json
"message": { "steps": ["@totalWidth", { "0": "The display is too narrow, please rotate your device.", "600": null }] }
```

or of an entry of a form element (`"patch": { "options": { "message":
"..." } }`), e.g. of a comparison which the chart can not show, `empty` the
text if there are no rows, e.g. of a filter (`vis-message`). `class` is a
class of the element `.vis` (a template of the globals), e.g. for the styles
of a page of several charts, `.vis` also has the globals of text and
numbers as `data-global-` attributes (the names in lower case with
hyphens, e.g. `data-global-share-scale` of `shareScale`), e.g. a style of
an entry of a form element: `.vis[data-global-group="eu"] .vis-title`.

`locale` sets the number and date formats of the axes and the hover, also of
axes without `format`: `de` (the default) or `en`, a language of the browser
(`Intl`), e.g. `fr`, `it` or `de-CH`, or an object with a `base` locale and the
parts which are changed, see d3's
[formatLocale](https://d3js.org/d3-format#formatLocale) and
[timeFormatLocale](https://d3js.org/d3-time-format#timeFormatLocale):

```json
"locale": { "base": "de", "number": { "currency": ["", " EUR"] } }
```

A language of `Intl` has its separators of numbers, the formats of dates and
times and the names of the days and months (of the gregorian calendar) of
the browser, the currency is the euro and the texts are in English (German
for German languages). `timeTicks` of the object are the tick formats of
time axes without `format`, by the interval of the date (`millisecond`,
`second`, `minute`, `hour`, `day`, `week`, `month`, `year`), `texts` the
titles of the buttons (`download`, `copy`, `copied` and `csv`) and the texts
of screen readers (`chart`, the kind of a facet with a hover, and `keys`,
the description of its keys).

`coord` is the coordinate system of the plots, `cartesian` (the default, a
horizontal and a vertical axis), `polar` (an angle and a radius, see
[polar plots](#polar-plots)), `geo` (a map, see [maps](#maps)) or a
registered one, see [extensions](extensions.md#extensions).

`transition` moves the elements to their new values in this many
milliseconds (`true` for 300) after a change of a legend, a form element or
the state, e.g. `"transition": 400`: the points, bars and lines of the draw
before and the axes of cartesian plots move, new elements are drawn at once,
a new width is drawn at once, nothing moves if the user prefers less motion
(`prefers-reduced-motion` of the system).

`fontFamily` sets the font, by default the css variable
`--gen-vis-font-family` or Century Gothic, so the font of all visualisations of
a page can be set with css (see [styles](usage.md#styles) for the colors):

```css
.vis { --gen-vis-font-family: Arial, sans-serif; }
```

## `mapping`

Maps columns of the data to named dimensions, the plots and all other parts of
the definition refer to these names. `null` (or `false`) removes a part of a
mapping of a parent or of a patch, e.g. `"hover": null`. A text is the
column, `"x": "Jahr"` is `"x": {"column": "Jahr"}`.

```json
"y": {
    "column": "value",
    "format": ".1f",
    "domain": [0, null],
    "axis": { "ticks": 8, "grid": true, "title": { "name": "€/l", "offset": 50 } },
    "hover": { "format": ".2f" }
}
```

is the mapping `y` of the numbers of the column `value` with all its parts
which follow from the rest: `"type": "numeric"` (of the values),
`"scale": {"type": "linear", "orientation": "vertical", "domain": [0, null]}`
and `"axis": {"position": "left", "format": ".1f", ...}`.

The mappings of the positions of the coordinate system have a scale of the
orientation of their name and an axis: of cartesian plots `x` (horizontal,
an axis at the bottom) and `y` (vertical, at the left), of polar plots `x`
and `angle` (angular) and `y` and `radius` (radial), so `"x": "Jahr"` is
enough. `"axis": false` leaves out the axis, `"scale": false` the scale,
`"orientation": null` of the scale is none (e.g. a mapping `y` of the sizes
of points). An axis without a `position` is at the one of the orientation of
its scale (`bottom`, `left`, `angular`, `radial`), e.g. of a second vertical
axis `"axis": {}` or `"axis": {"position": "right"}`.

- `format`: the d3 format of the values, the one of the axis and of the
  hover (and of `@y:formatted`) which have none of their own.
- `domain` and `nice` are the ones of the scale (see below), e.g.
  `"domain": [0, null]`.

- `type`: `numeric`, `date` or `categorical`. Without a type it follows from
  the parts of the mapping: `categories` (or a `band`, `point` or `ordinal`
  scale) are categorical, a `time` or `utc` scale is a date, other scales
  are numeric, a mapping of the facets is categorical (one of the
  categories of a plot, `by`, is not, it groups rows of any type), otherwise it is the one of the values of the
  column: numbers are numeric, dates (as below) a date, others categorical,
  e.g. years of a column are numeric, so a mapping of the categories of
  years is categorical by its `categories` or with `"type": "categorical"`.
  The type of the values reads the values of the column (once per value,
  until one is neither a number nor a date), a few milliseconds of data of
  hundred thousands of rows, a mapping with a `type` does not read them.
  Numeric and date values which
  are missing, invalid or infinite are `null`: they are gaps in lines and
  areas, points and bars are not drawn, and they are not shown in the hover. Dates are
  timestamps or strings. A date without a time zone, e.g. `2024-06-01`,
  `2024-06`, `2024`, `2024-06-01 13:00` (also with a `T`, seconds and their
  fraction, `24:00` is the end of the day) or `01.06.2024` (the day first,
  also with a time), is the one of the time zone of the
  scale, local of a `time` scale (and the other ones) and UTC of a `utc`
  scale, so it is the same day and time in every time zone (`Date.parse`
  reads a date without a time as midnight UTC, the day before west of UTC in
  local time, and `01.06.2024` as the 6th of January). A date and a time
  with a time zone, `Z` or an offset, e.g. `2024-06-01T13:00:00Z` or
  `2024-06-01 13:00+02:00`, is the same time of every scale, other strings
  are no dates, e.g. `Phase 1` (which `Date.parse` of some browsers reads as
  one).
- `scale`: `type` is a d3 scale (`linear`, `time`, `log`, `point`, `band`,
  ...), continuous scales need a `numeric` or `date` type (positions of dates
  a `time` or `utc` one), `point` and `band` a `categorical` one, `ordinal`
  scales are of any values, e.g. the colors of categories (`range`). Without
  a type it is the one of the type of the mapping: `linear` of numeric ones,
  `time` of dates, of categorical ones `band` of the positions of bars
  (`bar`, `arc`), `point` of other positions and `ordinal` otherwise.
  `"scale": {"of": "y"}` is the scale of another mapping, the values of this
  one are positions on it too and they are in its domain, e.g. the other end
  of a band between two columns, `"y0": "@low:scaled", "y1": "@high:scaled"`,
  or a second date of a `utc` scale (it is read in UTC as well), without
  the other parts of a scale.
  `orientation` (`horizontal` or `vertical`) places the scale on the plot,
  `angular` or `radial` in polar plots. `domain` fixes the domain, `null`
  entries are taken from the data, the values are converted as the ones of
  the data, e.g. dates or numbers of strings, categories as strings, e.g.
  `[2004, 2008]` of the years of any data, entries can be references,
  e.g. `[0, "@max"]` of a global, the domain of a `point` or `band` scale
  are its categories in their order. `domainRel` (relative to the positions,
  e.g. of a `log` or a `sqrt` scale) and `domainAbs` (absolute) extend it, by
  default a domain of a position taken from the data is extended by 2%.
  A `log` scale has the positive values only (the negative ones if there are
  none), a value of 0 is not drawn, a domain without values is `[0, 1]`
  (`[1, 10]` of a `log` scale) or the one of `include`.
  `include` are values the domain taken from the data includes, e.g. `0` or
  `[0, 100]`, around `center` it is symmetric, e.g. `0` of changes, e.g.
  `"include": 0, "domainRel": [-0.4, 0.4]` is the domain of the values and 0
  extended by 40% of its size on both sides.
  `step` of a vertical `band` or `point` scale are the pixels of a
  category (also a prop of the globals and `totalWidth`), the height of the
  plot is the one of its categories (and the space of their `groups`), not
  `options.height`, e.g. the rows of horizontal bars keep their size if
  some of them are hidden, the plot is less high.
  `order` of a `band`, `point` or `ordinal` scale is the order of
  its categories taken from the data: the one of the rows (by default),
  `ascending`, `descending` or by the value of a mapping of their first row,
  e.g. bars by their length, `{"by": "x", "descending": true}`.
  `groups` of a `band` or `point` scale are the groups of its
  categories, of the values of a mapping (`by`) of their rows, with a space
  of `padding` steps between them (1 by default), e.g. the rows of horizontal
  bars of the groups of indicators, `@y:group:start` and `@y:group:end` are
  the start of the first band and the end of the last band of the group of
  the row, e.g. a line along a group:

  ```json
  "y": { "column": "label", "type": "categorical", "scale": { "groups": { "by": "group", "padding": 0.8 } } }
  ```

  `nice` rounds the ends taken from the data of a numeric mapping, e.g. 0.951
  to 1, of a `log` scale to powers of 10, `true` for steps of about a tenth
  of the domain or the number of steps, e.g. so the legend of colors ends at
  100%, only of numeric mappings, `validateDef` warns of others. `padding`
  of categorical scales, the space between the categories in steps (0.4 by
  default) of `point` and `band` scales. `type` and the names of
  projections are written in lower case, e.g. `linear` and `mercator`, others
  work but `validateDef` warns. `inset` is the space at the start
  and the end of the range in pixels (of positions), a number for both or
  `[start, end]`, e.g. `10` so the first and the last point are not at the
  edges, of every type of scale, also of dates, e.g. instead of a
  `domainAbs` of milliseconds. A scale without `orientation` has the
  `range` given, e.g. colors or the radius of points.
- Scales of colors: `sequential` and `diverging` scales (a domain with a
  middle entry, e.g. `[null, 0, null]`) have an `interpolator` of d3, e.g.
  `Blues`, `Viridis` or `RdYlGn`, `sequentialQuantile` the colors of the
  quantiles of the values. `quantize`, `quantile` and `threshold` scales (the
  `domain` are the values between the classes) are classes of colors, the
  `range` or a `scheme` of d3, e.g. `Blues`, with `classes` colors, the
  classes of a `threshold` scale include their lower limit (`value >= limit`),
  with `"closed": "right"` their upper one (`value > limit`), `ordinal`
  scales the colors of categories. Scales without orientation are the same in
  all facets.
- `name`: the title of the legend.
- `axis`: `position` (`top`, `bottom`, `left`, `right`, in polar plots
  `angular` and `radial`), `ticks`, `tickSpacing` (without `ticks` a tick per
  this many pixels of the axis, e.g. `80`, so a narrow chart has fewer ticks,
  instead of a `relative` prop of `ticks`), `values` (fixed ticks, converted
  as the values of the data, e.g. dates of strings or categories as strings,
  so `["2004", "2008"]` and `[2004, 2008]` are the same ticks of a band
  scale of years, the ones outside of the domain are left out, also the ones
  which are no category of a `band` or `point` scale, also a prop of the
  names of the facet, e.g. steps of `totalWidth`), `format` (d3 number or
  time format),
  `rotate` (the angle of the labels in degrees, positive counterclockwise,
  negative clockwise), `labels` (of all axes, also of polar plots: the
  `props` of the labels, svg attributes and `text`, e.g. `{"font-weight":
  "@weight", "text": "@short", "max-width": 300}`, their names are the ones
  of the facet, the values of the first row of the tick, e.g. `@short` of
  another mapping, the props of the categories of the tick and of the
  mappings `categories` of its row, e.g. `"categories": ["level"]` for
  `@weight` of the categories of a level, a `font-size` replaces the one of
  the styles), `domain` (the `props` of the line of the axis, svg
  attributes of the names of the facet, e.g. `{"props": {"stroke-opacity":
  0.4}}`, of an angular axis the circle), `tickMarks` (the short lines of
  the ticks: `false` leaves them out, the labels stay at their places, their
  length `size`, 9 pixels across the line of a cartesian axis, 6 outside of
  the circle of an angular axis by default, the labels move with it, the
  part of it inside the plot area `inset`, by default 4 pixels of bottom
  and right axes, 5 of top and left ones (the styles), 0 of angular axes,
  e.g. `0` for marks only outside, and their `props`, as the ones of
  `domain`, radial axes have none), `grid` (lines at the ticks),
  `title` (`{"name", "offset"}`, the distance from the axis, by default 8
  pixels inside the edge of the margin, of a radial axis 16 pixels outside
  of the circle) and `padding` (the space between the tick marks and the
  labels, 3 pixels by default, also of polar axes). The defaults are the
  ones of [defaults](#defaults), a page or an export replaces them for all
  axes.
- `hover`: the hover shows the values of the vertical axis at the position of
  the mouse, of horizontal bars (a horizontal mapping is stacked, or the
  vertical one is categorical and the horizontal one is not) the values of
  the horizontal axis at the vertical position. Of several mappings of an
  orientation, e.g. a second vertical axis, the stacked one or the one with a
  `hover` (or the first one) has the values of the hover, the other numeric
  ones with a `hover` are further columns. The rows of stacked values are in
  the order of the stacks, from the top, a row which is not stacked (see
  `stacked`) is above them if its category is after theirs in the order of
  the categories, below them if it is before them, e.g. the consumption
  above the sources. On touch devices it is shown by a
  tap and stays until a tap outside of the plot, horizontal swipes move it,
  vertical ones scroll the page. `format` of the horizontal and vertical
  axis, it defaults to the axis format, without one dates are the date of
  the locale and numbers have its decimal mark and up to 6 decimals (without
  trailing zeros), thousands separators only if the domain reaches 10 000,
  so years are e.g. `2024`.
  For categorical mappings `props` are the columns of the entries, the
  `name` of the category first, e.g. `{"unit": "@unit"}` adds a column of
  the prop `unit` of the categories, `"name": null` leaves out the name.
  `props` of `row` are CSS properties of the row of a category (of the
  table or of the template `row` of the options), props of the props of the
  categories, e.g. the sources which are not stacked in italics:
  `"hover": {"row": {"props": {"font-style": "@hoverStyle"}}}` with
  `"common": {"hoverStyle": "normal"}` and `"hoverStyle": "italic"` of the
  categories `total` and `load`. The nearest row stays bold, its
  `font-weight` is the one of `vis-nearest`, of several mappings with a
  `row` the later ones override the ones before. The rows also have the
  keys of their categories as attributes, see [styles](usage.md#styles).
- `categories`: the categories and their props, e.g. colors, by their key
  (the value of the column). `common` props are
  used for all `categories`, `name` and `visible` are set by default. Only
  visible categories are shown. The order of the `categories` is the order
  of the legend, the facets and the stacks, not the order of the rows. Keys
  which are integers, e.g. years, are ordered ascending by JavaScript, first.
  `order` sets the order: `"ascending"`, `"descending"` (numbers by their
  value, e.g. the newest year first) or a list of keys, which are first, the
  others after them. A patch of the categories by a form element, e.g. other
  colors, replaces them, the entries of the legend keep their state.
  `ranks` are the props of the categories by their place
  in the order, of the first one, the second one, ..., the last entry of all
  others, e.g. the newest year is red, whichever year it is, the props of a
  category override them, they override `common`:

  ```json
  "year": { "column": "year", "fromData": true, "order": "descending", "common": { "stroke-width": 2 },
      "ranks": [{ "color": "#C3423F", "opacity": 1 }, { "color": "#CF8E02", "opacity": 0.7 }, { "color": "#BBB", "opacity": 0.3 }] }
  ```

  Categories without a `color` (none of the mapping has one, no `scheme`)
  have the default colors of d3's scheme Observable10 in their order, a plot
  or a legend uses the default color of the first of its categories if none
  of them has a color, e.g. the colors of the lines of the categories of the
  data.
  With `"fromData": true` the values of the column which are not listed are
  categories as well, after the listed ones, in ascending order (numbers by
  their value), e.g. new regions of the data, also of the column of a form
  element, e.g. of a template `{col}`. `scheme` sets the prop `color`
  of the categories in their order, a d3 scheme, e.g. `Tableau10` or `Blues`
  (of the number of categories), a `color` of the props is kept:

  ```json
  "land": { "column": "Bundesland", "fromData": true, "scheme": "Tableau10", "categories": { "ÖSTERREICH": { "name": "Gesamt", "color": "#000" } } }
  ```
- `legend`: a toggle for every category, `symbol` draws svg `elements` (with
  props) of the given `size` before the name, or is a shortcut in the color
  of the category (`@color`): `"line"` (with the `stroke-width`,
  `stroke-dasharray` and `opacity` of the categories if they have them, a
  width of 2 otherwise), `"rect"` or `"circle"` (with their `opacity`), the
  object `{"type": "line", "size": 20, "props": {"stroke-width": 3}}` sets
  the size (16 by default) and props of the element. A click shows or hides the
  category, a double click shows only it, the next double click all of them.
  The entries are checkboxes of the keyboard (tab, enter or space), the mouse
  and the focus highlight their category. A mapping with a scale but
  without props has the colors of its scale as legend, a gradient or the
  classes, the ticks of a gradient at the positions of their colors, e.g. of
  a sqrt scale steps of 1, 2 and 5 with more space for the small values,
  `format` of the values, by default the one of the hover, `missing`
  an entry beside them, e.g. of the regions of a map without a value
  (`{"name": "keine Daten", "color": "#DADADA"}`, the color of `geo:base`).
  The scale of the colors is horizontal or vertical (`orientation`, the high
  values at the top, also a prop of `totalWidth`, the width of the
  visualisation), `size` pixels long (240 by default), its labels are
  after it (`labels`, below or right of it) or `before` it, `values` are the
  ticks of a gradient, e.g. `[0, 50, 100]`. A category with `"legend":
  false` in its props has no entry, it stays visible, e.g. headers. With
  `"onlyData": true` the legend only has the categories of the rows after
  the `filter`, also the hidden ones, e.g. the sources of the selected
  year, the entries follow the form elements, a double click hides also the
  categories which are not shown, so they stay hidden when they come back.
  `position` places the legend above the plots (`top`, the default), below
  them (`bottom`) or beside them (`left`, `right`, the plots have the rest
  of the width, the class of the legends is `vis-legends-left` or
  `vis-legends-right`, the entries of categories are one below the other),
  a prop of `totalWidth` (the width of the visualisation), e.g. below the
  plots of a phone, e.g. a vertical scale of colors left of a map:

  ```json
  "legend": { "position": "left", "orientation": "vertical", "size": 160, "labels": "before" }
  ```
- `stacked`: stacks the values of the axis of the values, a vertical, a
  horizontal (of horizontal bars), a radial or an angular one (of pies, see
  [polar plots](#polar-plots)), the first category is at the bottom. `@y:start` and `@y:end` are the start and the end
  of the stacked value, `@y:start:scaled` and `@y:end:scaled` their positions,
  e.g. `y0` and `y1` of `bar`, `@y:height:scaled` the difference,
  e.g. the height of an `svg:rect`, `@y:mid` and `@y:mid:scaled` the middle,
  e.g. of a label in its stack. `true` stacks all rows, conditions of
  mappings, as the ones of [`filter`](#formelements-and-globals), only the
  rows of them, the other rows are not stacked, their start and end are
  their value, e.g. a line of the consumption or a total on stacked areas of
  the same mapping, also of a patch of its column, e.g. the share of the
  consumption, their values are in the domain and in the hover:

  ```json
  "y": { "column": "value", "stacked": { "type": { "not": "load" } }, ... },
  "plot": [
      { "type": "area", "by": "type", "filter": { "type": { "not": "load" } }, "props": { "d": { "y0": "@y:start:scaled", "y1": "@y:end:scaled" } } },
      { "type": "line", "filter": { "type": "load" } }
  ]
  ```

### Defaults

The built-in defaults of the parts are the values a definition does not
have to give, `builtInDefaults` of `src/utils/defaults.js`, so far the ones
of the axes:

```json
{
    "axis": { "padding": 3, "tickMarks": { "size": 9, "inset": null }, "title": { "offset": null } },
    "angularAxis": { "tickMarks": { "size": 6, "inset": 0 } },
    "radialAxis": { "title": { "offset": 16 } }
}
```

`axis` are the ones of all axes, `<position>Axis` the ones of the axes of a
position before them, e.g. `angularAxis` and `radialAxis` of polar plots or
`leftAxis`; an `inset` of `null` is the one of the styles (the css variable
`--gen-vis-tick-inset`, 4 pixels of bottom and right axes, 5 of top and
left ones), a
`title.offset` of `null` of cartesian axes 8 pixels inside the edge of the
margin. Defaults of the same shape replace them without changing a
definition: the prop `defaults` of a chart (also `data-defaults`, the Vue
component, `defaults` of the [export page](export.md#export-page) and `--defaults`
of the [CLI](export.md#cli)) and `registerDefaults(defaults)` of all charts of the
page (`GenVis.registerDefaults` of the standalone script, called before the
charts are drawn, `null` removes them). A value of the definition takes
precedence, then the prop, then the page, then the built-in one; in each
the one of the kind of the axis before the one of `axis`, so `axis` of the
prop is before `angularAxis` of the page. E.g. the spacing of ggplot2 (tick
marks of 3pt outside of the plot area, the labels close to them) of every
axis of every definition:

```js
import { registerDefaults } from '@preschen/gen-vis';

registerDefaults({ axis: { padding: 2, tickMarks: { size: 4, inset: 0 } } });
```

## `plot`

A plot or a list of plots, drawn in order:

```json
{
    "type": "line",
    "by": "nuts",
    "props": { "stroke-width": 1.5 },
    "highlight": { "stroke-width": 3 }
}
```

- `type`: a type of the coordinate system of the definition, `line`,
  `area`, `bar`, `point` (or `circle`) and `text` of cartesian plots, of
  polar plots `line`, `area`, `arc`, `point` and `text`, of maps `base`,
  `region`, `circle`, `text` and `mesh`, has default props, the ones it
  needs, a plot writes only the ones which differ, `null` removes one, nested
  props (e.g. `d`) are merged into the defaults:

  | Type | Default props |
  |------|---------------|
  | `line` | `"stroke": {"or": ["@color", "currentColor"]}, "fill": "none", "d": {"x": "@x:scaled", "y": "@y:scaled"}` (polar `"angle"` and `"radius"`) |
  | `area` | `"fill"` as the stroke of a line, `"d": {"x": "@x:scaled", "y0": "@y:scaled:0", "y1": "@y:scaled"}` (polar `angle`, `innerRadius`, `outerRadius`) |
  | `bar` | `"fill"`, `"x": "@x:scaled", "y1": "@y:scaled"`, of a horizontal one (`x1`) `"x1": "@x:scaled", "y": "@y:scaled"` |
  | `point` | `"cx": "@x:scaled", "cy": "@y:scaled", "r": 3, "fill"` (polar `angle` and `radius`) |
  | `text` | `"x": "@x:scaled", "y": "@y:scaled", "fill": "@color"` (polar `angle` and `radius`) |
  | `arc` | `"fill"` |

  The full names of the types, the name of the coordinate system and the
  type, are the same types with the same defaults (`line` is
  `cartesian:line`), `null` removes a default a plot must not have, e.g.
  `"fill": null` of a text in black:
  - `svg:circle`, `svg:rect`, `svg:line`, `svg:text`: an svg element per row
    in any coordinate system, the props are its attributes, e.g.
    `"cx": "@x:scaled"`
  - `cartesian:line`: a line per group, `d` with `x` and `y`
  - `cartesian:area`: an area per group, `d` with `x`, `y0` and `y1`
  - `cartesian:bar`: a bar per row from `y0` to `y1`, by default from the
    position of 0, e.g. `"y1": "@y:scaled"`, or a stacked value with
    `"y0": "@y:start:scaled", "y1": "@y:end:scaled"`. The bars are centered at
    `x`, in the middle of a band, `width` defaults to the width of a band or
    the step of a point scale, a continuous scale needs a `width`. With `x1`
    the bars are horizontal, from `x0` (by default 0) to `x1` at `y`, `height`
    is their thickness, e.g. of the countries of a band scale of `y`.
  - `polar:*` of [polar plots](#polar-plots) and `geo:*` of [maps](#maps)
- `by`: the rows are grouped by this mapping or these mappings, the
  props of their categories are available in the plot props. Mappings
  without `categories` only group the rows, e.g. a line per id.
- `id`: the class and the `data-plot` of the group of the plot, `plot-<index>`
  by default, the plots of a parent are merged by their ids (if all of them
  have one).
- `props`: svg attributes (and `text`), [props](#props-of-the-definition).
- `highlight`: the props of the elements of the category under the mouse or
  of the legend entry, e.g. `{"stroke-width": 3}`, `others` the props of
  the other elements of the plot while an element is highlighted, also of
  plots without categories, e.g. `"others": {"opacity": 0.3}` fades the
  others, `{"visibility": "hidden"}` hides the label of the last value while
  the one of another value is shown. `mode` of `highlight`: `group`
  (default) highlights the elements of the category under the mouse, `row`
  only the element of its row, e.g. the segment of a stacked bar, an entry
  of the legend highlights all of its category. `options.highlight.transition` moves the attributes to the ones of
  the highlight in this many milliseconds, e.g. `{"transition": 50}`.
- `curve`: the interpolation of the paths and areas between their points,
  `linear` (default), `monotoneX`, `natural`, `catmullRom`, `basis`, `step`,
  `stepBefore` or `stepAfter`. `monotoneX` is smooth without overshooting the
  values, e.g. for monthly data, `basis` does not pass through the points.
  `linearClosed`, `catmullRomClosed` and `basisClosed` connect the last point
  with the first one, e.g. of radar charts.
- `data`: rows of the plot instead of the rows of the data, e.g. events or
  a target value, see below.
- `select`: one row of every group, of the rows with values of the mappings
  of the props: `first` or `last` (in the order of the rows) or the one with
  the least or the most value of a mapping, `{ "min": "y" }` or
  `{ "max": "x" }` (categories which are numbers by their value, e.g. `"10"`
  after `"9"`), e.g. labels at the ends of lines.
- `dodge` (`text`): the texts are moved apart vertically
  to at least this distance in pixels, e.g. labels at the ends of lines, the
  ones of `polar:text` of the same angle along the radius (outwards from
  the inner radius, 0 and 360° are the same angle), e.g. labels of
  the same hour, labels of other angles are not moved.
- `halo` (`text`): a halo behind the texts in the color
  of `--gen-vis-halo-color`, `true` (3 pixels) or its width in pixels, e.g.
  labels on areas, the props of the plot replace its `stroke`,
  `stroke-width`, `paint-order` and `stroke-linejoin`. Texts without a
  `fill` are in the color of `--gen-vis-text-color` (black by default), see
  [styles](usage.md#styles).

The texts of `text` and of the labels of axes with a `max-width` prop
(pixels) are cut with an ellipsis, the full text is their title (the
tooltip of the browser, also below the area of the hover, e.g. of labels
with `"area": "facet"`), or wrapped into lines with `"text-overflow":
"wrap"`, of the `line-height` in em (1.2 by default), around the text of a
`middle` or `central` baseline, e.g. long names of rows.
- `layer`: `below` draws the plot below the axes and grid lines, e.g. a
  background, `above` above the other plots, e.g. labels, by default the
  plots are drawn between them in their order.
- `facet`: a key or a list of keys of the facets of the plot, by default it
  is in all facets.
- `filter`: only the rows of the conditions of mappings, see
  [filter](#formelements-and-globals), e.g. `{"level": "header"}` or `{"y":
  {"not": null}}`, the references are the names of the facet.

Labels of values, of the bars of a band scale at their center, with the
format of the hover of the mapping (`@x:formatted`), see
`data/bev/def-hbar.json`:

```json
{
    "type": "text",
    "props": { "dx": 4, "y": "@y:scaled:center", "dominant-baseline": "middle", "text": "@x:formatted" }
}
```

Labels at the ends of lines, in the color of the line:

```json
{
    "type": "text",
    "by": "nuts",
    "select": { "max": "x" },
    "dodge": 12,
    "props": { "dx": 4, "text": "@name" }
}
```

The rows of `data` have the names of the mappings and others, e.g. a
`label`, all of them are names of the props. The values of the mappings are
converted as the ones of the data, e.g. dates, and the values of the rows
are props, e.g. references to globals. A row with a value of the mapping of
the facets is only in its facet. `data` can also be the url of a file of
rows (`dataFormat` as the one of the definition), relative to the definition,
its values are not props. A text at a value of the vertical axis, at the end
of the horizontal one:

```json
{
    "type": "text",
    "data": [{ "y": "@target", "label": "Ziel" }],
    "props": { "x": "@x:scaled:max", "dy": -4, "text-anchor": "end", "text": "@label" }
}
```

## Polar plots

With `"coord": "polar"` the plots are in a circle in the center of the facet,
the mapping with the `angular` orientation (by default `x` or `angle`) goes
around it, clockwise from the top, the one with the `radial` orientation (`y`
or `radius`) from the center outwards, the margins are the space of the labels:

```json
"options": { "coord": "polar", "height": 400, "margins": {"top": 30, "right": 60, "bottom": 30, "left": 60} },
"transform": [{ "type": "year", "column": "date", "as": "year" }, { "type": "align", "column": "date" }],
"mapping": {
    "x": { "column": "date", "format": "%b", "domain": ["2020-01-01", "2021-01-01"], "scale": { "type": "utc" }, "axis": { "ticks": 12, "grid": true } },
    "y": { "column": "value", "domain": [0, null], "axis": { "ticks": 4, "grid": true } },
    "year": { "column": "year", "fromData": true, "scheme": "Tableau10", "legend": {} }
},
"plot": { "type": "line", "by": "year" }
```

The years of daily data, the dates aligned to 2020, a line per year.

- The angle is a cycle, the end of its domain is at the angle of its start,
  e.g. a year from `2020-01-01` to `2021-01-01`, a domain taken from the data
  is not extended. The categories of `point` and `band` scales have the same
  distance, also the last and the first one, the `padding` of a `point`
  scale is the place of the first category in steps, half a step after the
  top by default, `0` at the top, e.g. the first axis of a radar chart.
- The range of the radius is `[0, "@radius"]` by default, the half of the
  smaller side of the facet, e.g. `[20, "@radius"]` leaves a hole in the
  center.
- `angular` axes are around the circle, `grid` draws lines from the center.
  `radial` axes go from the center outwards, at the `angle` of the axis
  (degrees, clockwise from the top, 0 by default), `grid` draws circles, or
  polygons through the ticks of the angle with `"gridShape": "polygon"`, e.g.
  of radar charts. The labels of radial axes are above the plots, with a
  halo (`--gen-vis-halo-color`, see [styles](usage.md#styles)), the `props` of the
  `labels` of an axis style them, as the ones of cartesian axes, a `stroke`
  and a `stroke-width` replace the halo, `domain` the line of the axis,
  `tickMarks` the tick marks (of angular axes), e.g. the values of a radial
  axis in the background and the circle and the marks of the angle in the
  color of the grid lines:

  ```json
  "x": { "axis": {
      "position": "angular", "values": [0, 6, 12, 18], "grid": true,
      "domain": { "props": { "stroke": "var(--gen-vis-grid-color)", "stroke-width": 0.75 } },
      "tickMarks": { "props": { "stroke": "var(--gen-vis-grid-color)", "stroke-width": 0.75 } }
  } },
  "y": { "axis": {
      "position": "radial", "angle": 90, "ticks": 3, "grid": true,
      "labels": { "props": { "fill": "#777", "font-size": 10, "stroke-width": 2, "stroke-opacity": 0.5 } },
      "domain": { "props": { "stroke-opacity": 0.4 } }
  } }
  ```
- `"curved": true` of the `labels` of an angular axis writes them along
  the circle, centered at the tick, `"between"` between the tick and the
  next one, e.g. the names of the months, the ones of the lower half are
  not upside down: `"labels": { "curved": "between" }`, see
  `data/ecad/polar-rr.json`, also of angles counterclockwise, a single
  tick has its label at the tick. A `max-width` cuts them along the circle
  with an ellipsis (also with `"text-overflow": "wrap"`).
- Values below the domain of the radius are drawn at the inner radius, not
  on the other side of the center.
- The titles of the facets are centered above the circles.
- The plot types (`line` is `polar:line` of polar plots): `polar:line` (a line per group, `d` with `angle` and
  `radius`), `polar:area` (an area per group, `d` with `angle`,
  `innerRadius` and `outerRadius`), `polar:arc` (a segment of a ring per row,
  props `angle`, `innerRadius` and `outerRadius`, optional `width` in radians,
  `padAngle` and `cornerRadius`, e.g. the bars of a rose chart, or from
  `startAngle` to `endAngle` instead of `angle` and `width`, e.g. the slices
  of a pie), and
  `polar:circle` and `polar:text` (an element per row at `angle` and
  `radius`, texts with a `halo` and `dodge`, see [plot](#plot)). The angles of a band scale are in the center of the band. The
  `svg:` types draw with the center as origin, the `cartesian:` types are
  cartesian only.
- Stacked values (`stacked` of the radius) are stacked from the center, e.g.
  `"innerRadius": "@y:start:scaled", "outerRadius": "@y:end:scaled"` of
  `polar:arc`.
- The hover shows the values of the angle nearest to the mouse, also across
  the top, it is in the center, on the other side of the marker.

Pies and donuts are stacked angles: the mapping of the angle is `stacked`,
its values are the ones of the hover, the slices are `polar:arc` from
`@<angle>:start:scaled` to `@<angle>:end:scaled`, `innerRadius` leaves a hole:

```json
"options": { "coord": "polar", "height": 360 },
"mapping": {
    "value": { "column": "value", "stacked": true, "scale": { "orientation": "angular" }, "hover": {} },
    "type": { "column": "type", "fromData": true, "scheme": "Tableau10", "legend": {}, "hover": {} }
},
"plot": { "type": "arc", "by": "type", "props": { "stroke": "white", "startAngle": "@value:start:scaled", "endAngle": "@value:end:scaled", "innerRadius": 60 }, "highlight": { "opacity": 0.8 } }
```

The circle is the sum of the values. The hover shows the slice under the
pointer and the values of all slices, beside the slice. With a mapping of
the radius, e.g. a `band` scale of years, every ring is stacked by itself,
the slices are from `@year:scaled` to `@year:group:end` (`innerRadius` and
`outerRadius`), the hover shows the ring under the pointer, the circle is
the largest sum, a `share` transform by year closes every ring.

See `data/bev/def-radar.json`, `data/rechtsform/def-rose.json` and
`data/rechtsform/def-pie.json`.

## Maps

With `"coord": "geo"` the plots are a map, `geo` is its geometry and the
mapping (`join`) whose values are the keys of the features:

```json
"options": { "coord": "geo", "height": 480 },
"geo": {
    "data": "../geo/europe.json",
    "key": "id",
    "join": "country",
    "fit": "data",
    "projection": { "type": "azimuthalEqualArea", "rotate": [-10, -52] }
},
"globals": { "type": "euroSuper95" },
"filter": { "type": "@type" },
"mapping": {
    "country": "country",
    "type": "variable",
    "price": {
        "name": "€/Liter", "column": "value",
        "scale": { "type": "sequential", "interpolator": "YlOrRd" },
        "legend": { "format": ",.1f" }, "hover": { "format": "$,.3f" }
    }
},
"plot": [
    { "type": "base", "props": { "fill": "#EEE", "stroke": "white" } },
    { "type": "region", "by": "country", "props": { "fill": "@price:scaled" }, "highlight": { "stroke": "#333" } }
]
```

- `geo.data` is the url of GeoJSON or TopoJSON (or the GeoJSON or TopoJSON
  itself), `object` the object of TopoJSON (the first one by default), `key`
  the key of the features (`id`, the default, or a property, e.g. `NUTS_ID`)
  and `name` the property of their names (`name` by default). Keys of
  integers are the same without leading zeros, e.g. `"01"` and `1`, rows of
  keys without a feature are not drawn, if no row has one the console
  names the keys, e.g. of a wrong `key`. Polygons of
  GeoJSON of both orders of their rings are drawn, e.g. of RFC 7946.
  `include` are the keys of the only features, `exclude` the ones of features
  which are left out, they are not drawn at all, e.g. `"include": ["AT",
  "DE", ...]` for the countries of the EU or `"exclude": ["RU", "BY"]`.
- `projection` is a d3 projection (`type`, `mercator` by default, e.g.
  `conicConformal`, `azimuthalEqualArea` or `equalEarth`) and its parameters.
  The projection is fitted to the facet, so the section of the map is the
  one of `fit`: all features (default), the ones with data (`"data"`) or the
  ones of a list of keys, e.g. `["AT", "DE", "CH"]`. The parameters change
  the shape, e.g. `rotate` (`[-longitude, -latitude]`) is the center of an
  azimuthal projection, `"rotate": [-10, -52]` of `azimuthalEqualArea` is the
  common projection of Europe (EPSG:3035), `parallels` are the ones of a
  conic projection, e.g. `"parallels": [46, 49]` of `conicConformal` for
  Austria, `rotate` of `mercator` its central meridian.
- The plot types (`region` is `geo:region` of maps, they have no default props): `geo:base` (all features, e.g. as background, the props
  are fixed), `geo:region` (the feature of every row), `geo:circle` and
  `geo:text` (an element per row at the center of its feature or at the `lon`
  and `lat` of its props, e.g. proportional circles with a `sqrt` scale of
  `r`) and `geo:mesh` (the borders of an object of TopoJSON as one path,
  every border once, the props are fixed).
- `geo:mesh` draws the borders of `object`, by default the one of the
  features (without the ones left out by `include` and `exclude`), e.g. the
  states above their districts, `borders` are all of them (`all`, default),
  the ones between two features (`inner`) or the outline (`outer`). The
  objects share the arcs of the topology, so the borders are the same lines:

  ```json
  { "type": "region", "by": "district", "props": { "fill": "@value:scaled", "stroke": "white", "stroke-width": 0.5 } },
  { "type": "mesh", "object": "states", "borders": "inner", "props": { "stroke": "white", "stroke-width": 1.5 } }
  ```
- The hover shows the region under the mouse: its name (the `name` of the
  props of the `join` mapping, of the feature or the key) and the rows of it
  with the values of the first numeric mapping with a `hover`, the region is
  highlighted.
- One row per region is usually shown, `filter` (see
  [formElements](#formelements-and-globals)) or facets select them, e.g. a map
  per fuel type.

See `data/bev/def-map.json`, `data/sprit-nuts/def-map.json` and the maps of
`data/energy/`. The geometries of `data/geo/` are of Eurostat (GISCO), see
`data/geo/README.md`.

## Annotations

`annotations` (an annotation or a list) are bands, lines, texts and circles
at values of mappings, e.g. estimated values or events, the keys are the
names of the mappings, a value or a range `[from, to]`, values are converted
as the ones of the rows, e.g. dates or categories as strings (`"x": 2020` is
the category `"2020"` of every format of the data), and can be references to
globals, e.g. `"@target"`:

```json
"annotations": [
    { "type": "band", "x": ["2025-07-01", null], "label": "Schätzung" },
    { "type": "line", "y": 0, "props": { "stroke": "#999", "stroke-dasharray": "3 3" } },
    { "type": "text", "x": "2020-03-16", "y": 30, "text": "Lockdown" },
    { "type": "circle", "x": "2022-02-24", "y": 1.8, "above": true }
]
```

- `band`: a rectangle, a mapping without value is over the whole plot area,
  e.g. a band of the horizontal axis has the height of the plot area, `null`
  in a range is the edge of the domain, a category of a `band` or `point`
  scale is its band, `label` is its name.
- `line`: a value of the horizontal axis is a vertical line, of the vertical
  one a horizontal line, with a `label` at its end.
- `text` (`text`) and `circle` at the values, without one (or with `null`)
  of an axis at the start of the other one.
- `label` and `text` are templates of the globals, e.g. `"Ziel {target}"`.
- `props` are svg attributes, e.g. `fill` or `stroke`, the defaults are grey,
  their names are the ones of the facet and of the annotation, e.g. `@y`,
  `above` draws the annotation above the plots, by default it is below the
  plots and grid lines, labels are above them. `facet` is a key or a list of
  keys of the facets of the annotation, by default it is in all facets.
- Polar plots: a `band` of the angle is a sector (also across the top, e.g.
  from November to February), of the radius a ring, a `line` of the angle a
  spoke, of the radius a circle. Maps: `text` and `circle` at `lon` and `lat`.
- The classes are `vis-annotation` and `vis-band`, `vis-line`, `vis-text` or
  `vis-circle`, the labels `vis-annotation-label`, see [styles](usage.md#styles).

An annotation is a plot of the type `annotation:band`, `annotation:line`,
`annotation:text` or `annotation:circle` of a row of its values (the plot
`annotation-<index>`, in the layer `below` or `above`). These types draw an
annotation per row, so the annotations can also be rows of data, e.g. a file
of events, the props can have the names of the rows:

```json
{ "type": "annotation:line", "data": "events.json", "props": { "stroke": "@color" } }
```

See `data/sprit-nuts/def.json`, `data/rechtsform/def-stacked-p.json` and
`data/energy/weather/temperature-polar.json`.

## Props of the definition

Most values of a definition are props, expressions close to
[JSON Logic](https://jsonlogic.com/), also the `expr` of the transforms
`calc` and `filter`, see `spec/expressions.md` (the rules for other
languages):

- values, e.g. `3`, `"none"` or `null`, and lists of props
- references `"@name"`, see below, also `{"var": "name"}`, `{"var": ["name",
  0]}` is `0` if the name is unknown
- an operator, an object of exactly one key, the operator, and its
  arguments (a list, or one of them):
  - `+`, `-`, `*`, `/`, `min`, `max`, `round` (`[x, digits]`), e.g.
    `{"*": ["@innerWidth", 0.013]}` or `{"+": ["@x:scaled", -14]}`, a
    position moved by 14 pixels; no value if a value is no number (also a
    text of the data which is no decimal number) or of a division by 0
  - `==`, `!=` (the same as texts, e.g. `2024` and `"2024"`), `<`, `<=`, `>`,
    `>=` (numbers by their value, otherwise texts, false of a missing value,
    `{"<": [0, "@x", 10]}` is a value between), `and`, `or` (the first true
    value, e.g. a default `{"or": ["@color", "black"]}`), `not`, `if`
    (`[condition, value, ..., otherwise]`)
  - `cat`: the values as a text, e.g. `{"cat": ["@name", ": ", "@y"]}`
  - `format`: a value as a text of a d3 format in the locale, of a date
    mapping a time format, e.g. `{"format": ["@y", ",.1f"]}` or `["@x", "%b %Y"]`
  - `steps`: the value of the largest cut below the value, e.g. `{"steps":
    ["@totalWidth", {"0": 220, "550": 250}]}`
  - `match`: the value of the case of a value (as a text), otherwise the
    default (null without one), e.g. `{"match": ["@level", {"header": 4.5,
    "item": "@r"}, 0]}`
  - `literal`: a value which is not evaluated, e.g. an object or a text
    starting with `@`

Other objects are nested props, e.g. `d` of a path, see
`spec/expressions.md`.

The names of the references depend on the part of the definition, the inner
parts add names:

| Part | Names |
|------|-------|
| everywhere | the `globals` and `totalWidth`, the width of the visualisation |
| `options.height`, `options.margins`, `options.message`, `facets.cols`, `facets.scales`, `filter` | only these |
| the `props` of `legend` (also of the `symbol`) and `hover` of a mapping | the props of its categories, e.g. `@color` and `@name` |
| `axis.ticks`, `scale.domain`, the values and `props` of annotations, the values of the `data` of a plot | the size of the facet: `width`, `innerWidth`, `height`, `innerHeight`, of polar plots `radius` (e.g. of the hole of a donut), the sizes of the band and point scales, e.g. `y:bandwidth` and `y:step` |
| `scale.range` | the sizes of the coordinate system, e.g. `@radius` of polar plots, `width` and `height` are the ones of the inner area |
| the `props` of a plot | the props of its categories and the values of the row: a mapping (e.g. `@x`), the value as a text of the format of its hover (`@x:formatted`, e.g. `1.234,5`, a label), the scaled value (`@x:scaled`, `@x:scaled:center` for the center of a band, the position of a value, e.g. `@x:scaled:0` or `@x:scaled:100`, `@x:scaled:min` and `@x:scaled:max` of the domain), the size of a band and the distance of the categories (`@y:bandwidth`, `@y:step`), the extent of the group of the row (`@y:group:start`, `@y:group:end`, see `groups` of scales), stacked values (`@y:start`, `@y:end:scaled`, ..., see `stacked`) |

Inner names replace outer ones, in a plot the mappings replace globals of the
same name, e.g. `@year` is the one of the row. A reference to an unknown name
is undefined, `validateDef` warns of it.

## `facets`

A plot for every category of `dim` (the name of a mapping with `categories`, also `fromData`), in
`cols` columns (1 by default). The mappings listed in `scales` share their
scale across all facets. `cols` can be a prop based on `totalWidth`,
`scales` a reference to `globals`. The title of a facet (`vis-facet-title`)
spans its plot area, it has the margins of the facet (the css variables
`--gen-vis-margin-left` and `--gen-vis-margin-right` of its style), so a
title centered by the page, `.vis-facet-title { text-align: center }`, is
above the center of the plot area, the ones of polar plots are centered
(`vis-facet-title-center`), a style of the page replaces both, e.g. its
`margin-left`.

## `formElements` and `globals`

Form elements change `globals`, e.g. the shared scales of the facets, as
radio buttons (`"type": "radio"`), a drop down list (`"type": "select"`) or
a slider over the entries (`"type": "slider"`, e.g. of years, the
visualisation changes while it is moved). A hidden form element (`"type":
"hidden"`) has no element, its global is set by the page (the prop
`globals`), e.g. the language or the year of a menu of the page, with the
`globals` and the `patch` of its entries, it is not part of the state of
the user. The page can also set globals without a form element, e.g. a
text, the globals of the selected entries override them.
The selected entries are named below the subtitle of the [PNG](usage.md#png),
`"inImage": false` leaves out a form element which only changes the
presentation, which the image shows anyway, e.g. shared or separate scales of
the facets.
`filter` shows only the rows of the conditions of mappings: a value or a
list of them, e.g. of a global, `null` (the rows without a value),
`{"not": ...}` (the rows which do not fulfil the condition, so a patch
removes a condition only with the whole `filter`, `"filter": null`) or `{"range":
[from, to]}` (from and to included, `null` is open), the values are compared
as the ones of the rows, e.g. dates, categories as strings and the ones which
are numbers by their value, and can be references, e.g. `"@year"`
or `{"range": [null, "@max"]}`. The same conditions are the `filter` of a
plot (its rows) and of the hover (`options.hover.filter`, the rows with a
hover):

```json
"globals": { "year": "2025" },
"filter": { "year": "@year" },
"formElements": [{
    "id": "year", "name": "Jahr", "ref": "year", "type": "select",
    "values": [{ "id": "2024", "name": "2024", "value": "2024" }, { "id": "2025", "name": "2025", "value": "2025" }]
}]
```

`values` can also be the distinct values of a column of the data, in
ascending order (numbers by their value), named as the values, strings as
the ones of CSV of every format of the data (also the globals and the state
of them), so new
values of the data are added, e.g. a new year. If the global is none of them,
e.g. it is missing, it is the last one:

```json
"filter": { "year": "@year" },
"formElements": [{ "id": "year", "name": "Jahr", "ref": "year", "type": "slider", "values": { "column": "year" } }]
```

An entry with a `patch` changes the definition while it is selected, e.g.
the column of an axis. A patch has the parts `options`, `mapping`, `plot`,
`annotations`, `filter`, `facets`, `geo` and `transform`, it is merged into
the definition as a parent is (plots and other lists of entries with an `id`
by their ids), the patches of several form elements in their order, `null`
removes a part, e.g. a mapping. The mappings of a patch are parts of the ones of the
definition, they have no default scale or axis of their own, a plot of a type
without prefix has the default props of its type. Only the parts which change are prepared
again, the entries of the legends of the same categories keep their state:

```json
"globals": { "column": "value" },
"formElements": [{
    "id": "column", "name": "Wert", "ref": "column", "type": "radio",
    "values": [
        { "id": "value", "name": "Wert", "value": "value" },
        { "id": "share", "name": "Anteil", "value": "share", "patch": { "mapping": { "y": { "column": "share" } } } }
    ]
}]
```

A patch can change any part, e.g. the section of a map and its height, the
coordinate system (`options.coord`) and the map (`geo.data`), all of them
are loaded with the definition, or the language with `options.locale` and
the texts:

```json
{ "id": "europe", "name": "Europa", "value": "europe", "patch": { "geo": { "fit": "data" }, "options": { "height": 600 }, "filter": { "region": "Europe" } } }
```

`globals` of an entry are set when it is selected, e.g. texts of other
globals or the global of another form element, whose entry follows, `{group:name}` is a field of the entry selected of the global
`group` (its `name`, `id`, `value` or another one) in all templates, e.g.
`"title": "Relative to {group:name}"`.

If the column depends on several form elements, it can be a template of the
globals, e.g. the values and their shares in the columns `twh`, `co2`,
`twh.share` and `co2.share`:

```json
"globals": { "values": "twh", "share": "" },
"formElements": [{
    "id": "values", "name": "Werte", "ref": "values", "type": "radio",
    "values": [
        { "id": "twh", "name": "TWh", "value": "twh" },
        { "id": "co2", "name": "CO₂", "value": "co2" }
    ]
}, {
    "id": "share", "name": "Darstellung", "ref": "share", "type": "radio",
    "values": [
        { "id": "abs", "name": "Absolut", "value": "" },
        { "id": "rel", "name": "Anteil", "value": ".share", "patch": { "mapping": { "y": { "axis": { "format": ".0%" } } } } }
    ]
}],
"mapping": { "y": { "column": "{values}{share}" } }
```

`{name}` is replaced by the value of the global, unknown globals are kept and
reported as warnings. All texts of a definition are templates as well: the
title, the subtitle and the footer, the names of the mappings and of their
categories (e.g. of the legends, the hover and the facets), the titles of the
axes and the labels and texts of annotations, e.g.
`"subtitle": "Durchschnitt {base} = 100"`.
