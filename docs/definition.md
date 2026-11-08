# Definition

The definition language of gen-vis 5: a definition (a JSON object, the
*def*) names its data, the dims of its columns, the marks drawn of them and
the parts around them, the texts, the sizes, the legends, the hover and the
controls. A dim can be just its column, `x` and `y` have a scale and an axis
by default, the type of a dim follows from its parts or its values, a mark
names its dims by its channels (`x`, `y`, ...) and has the attributes it
needs by default, and the margins are measured. The example of
[`data/bev/data.csv`](../data/bev/data.csv), the population of the Austrian
states:

```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "data.csv",
    "title": "Bevölkerung",
    "subtitle": "nach Bundesland",
    "source": "Q: Statistik Austria",
    "height": 300,
    "dims": {
        "x": { "column": "Jahr", "format": "c" },
        "y": { "column": "Einwohner", "format": ",.0f", "zero": true, "grid": true },
        "land": {
            "column": "Bundesland",
            "scheme": "Tableau10",
            "fromData": "rows",
            "legend": {},
            "categories": { "ÖSTERREICH": { "name": "Gesamt", "color": "#1E4F77", "visible": false } }
        }
    },
    "marks": [
        { "type": "line", "by": "land", "stroke-width": 2.5, "opacity": 0.7, "highlight": { "opacity": 1, "stroke-width": 3 } },
        { "type": "point", "by": "land", "r": 3, "opacity": 0.7, "highlight": { "r": 5, "opacity": 1 } }
    ]
}
```

`Jahr` holds numbers, so the dim `x` is numeric and `"format": "c"` writes
the years without a thousands separator. `zero` starts the domain of `y` at
0, `grid` draws the lines of its ticks. The dim `land` has a category per
state, the total first, hidden at the start, the others of the data after
it in the order of the rows (`fromData`), with the colors of the scheme
`Tableau10`; its legend shows and hides them, its symbols are the ones of
the marks (a line with a dot). A line and a point per state (`by`) are drawn
in the color of its category, the hover lists the states of the year under
the pointer, the highlight is the one of the state under the pointer. The
margins are the space of the axes, measured.

The keys of a definition (all of them are optional, a definition can be a
part which is merged into its parent):

| Key | |
|-----|-|
| `$schema` | the version of the definition language, see [`$schema`](#schema) |
| `parent` | the definitions this one is merged into, see [parents and mixins](#parents-and-mixins) |
| `data`, `dataFormat` | the data, see [data](#data) |
| `transform` | columns computed of the data, see [`transform`](#transform) |
| `filter` | the rows of the chart, see [`filter`](#filter) |
| `globals`, `controls` | the values the controls and the page change, see [globals and controls](#globals-and-controls) |
| `title`, `subtitle`, `source`, `height`, `width`, `margins`, `coord`, `locale`, `language`, `transition`, `class`, `message`, `empty`, `fontFamily` | the texts, sizes and the look, see [the options](#the-options) |
| `dims` | the dims of the columns, see [`dims`](#dims) |
| `marks` | the layers of the chart, see [`marks`](#marks) |
| `annotations` | bands, lines, texts and circles at values, see [annotations](#annotations) |
| `hover`, `highlight` | the hover and the highlight, see [`hover`](#hover) and [`highlight`](#highlight) |
| `facets` | a plot per category, see [`facets`](#facets) |
| `geo` | the geometry of a map, see [maps](#maps) |

Values are [expressions](#expressions) almost everywhere, e.g.
`"=@innerWidth * 0.5"` or a `match` of a global. Definitions of gen-vis 4
are migrated when they are loaded, `gen-vis migrate` writes them as ones
of gen-vis 5, see [migration from 4.x](#migration-from-4x).

## Parents and mixins

Relative urls are resolved against the definition referencing them, e.g.
`data.csv` is next to the definition file, the `data` of a parent against the
loaded definition. A definition is deep merged into its `parent` (and its
parent into its own parent): objects key by key, other values and lists are
replaced, except lists whose entries all have an `id` (e.g. the marks), all a
`global` (the controls) or all a `value` (the entries of a control): these
are merged by that key, an entry with a new key is appended, see
[spec/merge.md](../spec/merge.md). A `null` removes a part of a parent, e.g.
`"dims": {"y": null}` or `"geo": null`.

`parent` can also be a list of definitions (mixins), merged in their order,
later ones override earlier ones, e.g. a chart type and a control:

```json
{
    "parent": ["../shared/years.json", "../shared/scale-switch.json"],
    "data": "data.csv"
}
```

A parent shared by several mixins is merged once, before the first mixin
using it, so it does not override the mixins in between. The merge comes
first, then the expressions of the globals are evaluated. A `match` of a
global without a default (see [globals and controls](#globals-and-controls))
is a switch over the value of the other parts: a mixin which switches the
column of `y` for the shares, `"column": "=match(@values, {share:
'value.share'})"`, applies to the `"column": "value"` of an earlier parent
and of a child alike (the value becomes the default of the match); two
matches of the same global merge their cases. A child replaces the switch
with a `match` of its own (with a default) or removes the key with `null`.

With `check` (or `debug`) the merged definition is checked for common
mistakes, e.g. unknown mark types, unknown keys of the
[schema](#schema) (with the name it probably is, e.g. `domian` of
`domain`), also the definition of every other value of the controls
(`controls[0].values[1] > marks[0].type: ...`) and the data, e.g. years as
numbers of a `date` dim, the findings are logged as warnings in the
console, the check is only loaded then, see also [checks outside the
browser](extensions.md#checks-outside-the-browser); a definition which can
not be drawn, e.g. a dim which is no object, is an error which names the
part. Only the `source` and the templates of the hover are HTML, e.g. the
link of a source, so a definition is trusted, texts of users, e.g. of a
form of a page, must not be part of it, and so are its urls (`defFile`,
`data`, the parents, maps and files), they are loaded as they are, the
values of the globals and of the data in them are text. All other texts,
e.g. the title, the names of the legends and the hover and the titles of
the axes, are text, `<` is shown as it is.

The charts of a page share their requests of the last 5 minutes, e.g. a parent
used by all of them or a csv of two charts is loaded once, later ones load
again, e.g. for updated data. The parents of a definition and its data are
requested at once. The export page loads the files of each chart fresh, see
[export](export.md#export-page).

## `$schema`

The package contains a JSON Schema of the definitions, `schema.json`. Its
`$id` as the `"$schema"` of a definition declares the version of the
definition language, gen-vis 5, and editors like VS Code complete and check
the definition with it:

```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "data.csv"
}
```

- A definition file (`defFile`, also `resolveParents` of a url) needs a
  `$schema` of gen-vis 5 (or 4, see below), in itself or in one of its
  parents, otherwise the load fails, e.g. "'…/def.json' is no definition of
  gen-vis 5: its $schema is missing" (or "is the one of gen-vis 3"); every
  part with a `$schema` (a parent too) needs one of gen-vis 5 or 4.
- A definition object or text (`def`) may have none.
- A `$schema` of gen-vis 5 is a url or a path which ends in
  `@preschen/gen-vis@<version>/schema.json` of the major version 5: `@5`,
  `@5.0`, `@5.0.2`, `@5.0.0-alpha.1`, of unpkg or jsdelivr
  (`https://cdn.jsdelivr.net/npm/@preschen/gen-vis@5/schema.json`), or the
  schema of the installed package, a path which ends in
  `node_modules/@preschen/gen-vis/schema.json`, e.g.
  `"./node_modules/@preschen/gen-vis/schema.json"`. A schema of gen-vis
  without a version (the newest one of unpkg) is none of 5, the one of
  another major version neither, nor any other schema.
- A `$schema` of gen-vis 4 is accepted too. Whether a merged definition is
  one of 4.x follows from its keys (`options`, `mapping`, `plot` or
  `formElements`, without `dims`, `marks` or `controls`): it is migrated
  while it is loaded, with a notice in the console, see
  [migration from 4.x](#migration-from-4x).

The schema also allows parts of definitions, e.g. definitions with a
`parent`. The definitions of `data/` and of the site have the `$schema` in
every file, also in the parents and mixins, so the editors check each of
them (a definition file needs it only in itself or in a parent).

## Data

`data` is CSV, TSV, JSON (a list of rows) or [parquet](https://parquet.apache.org/),
by the extension of the url (`.csv`, `.tsv`, `.json`, `.parquet`), without one
by the content: parquet (which begins with `PAR1`), JSON or CSV. `dataFormat` sets it, e.g. for an url of an api,
also the one of a parent, data which can not be read is an error of its url:

```json
{ "data": "/api/prices?year=2024", "dataFormat": "json" }
```

Parquet is read with [hyparquet](https://github.com/hyparam/hyparquet) (no
wasm), it is only loaded for parquet data. Only the columns the definition
can use are read: the ones of the dims (also of every value of the
controls, a column template in every value of its globals), of the
transforms and of the values of controls, so a wide file costs only its
columns which are used. Integers of 64 bits are numbers, unless they are too
large for them, e.g. ids, then they are strings, also in lists and structs, timestamps are the ones of
the other formats, dates (without a time) and timestamps without a time zone
(e.g. of pandas, polars and duckdb) are strings as the ones of csv, e.g.
`2024-06-01` and `2024-06-01T13:00:00.000`, see `type` of
[dims](#the-type-of-a-dim), decimals (`DECIMAL`, e.g. doubles written as integers
with a scale, less than half the size, also of bytes and of only the logical
type) and floats of 32 bits are the numbers of their text, the
same as the ones of csv, e.g. `22.1637`. Snappy, the default of arrow (R, Python), pandas and
duckdb, is read directly, other compressions, e.g. zstd of polars, load the
decompressors of `hyparquet-compressors` (~75 kB gzipped).

The values of a `categorical` dim (and of a dim without a `type`)
are strings, as the ones of CSV, whatever the format of the data, e.g. the
year 2004 of a parquet or JSON column is `"2004"`, so a definition is the same
for every format. A missing category is `null`, also an empty cell of CSV: the row is in no
category of the dim, it stays in the chart, e.g. a row of another mark
which does not use the dim, a mark `by` the dim and its scale (e.g.
the bands of an axis) leave it out, a `filter` selects it with `null`. Numbers are numbers
of the data or texts of decimal numbers, e.g. `-1.5e3`, not `0x10`, `1,234`
or `true`, other values are missing values. The values of the definition are converted the same way:
the keys of `categories`, the fixed `values` of an axis, the `domain` of a scale,
the values of annotations, of the `data` of marks, of `filter` and of
references such as `"@x:scaled:2004"`, so they can be strings or numbers,
e.g. `"values": ["2004", "2008"]` or `[2004, 2008]`. Categories which are
numbers are compared by their value, e.g. `"9"` before `"10"` (the order of
a scale, a comparison of a filter, `select` of a mark).

## `transform`

Transforms compute data columns in the browser, e.g. an index to a base
year that a slider changes, instead of one column per base year in the
file. A transform (or a list of them, applied in order) computes the column
`as` (by default its `column`, which it replaces) from the values of
`column`, grouped by the columns `by` (a column or a list; rows with the
same values form a group). Dims and later transforms can use the new
column:

```json
{
    "globals": { "base": "2019" },
    "transform": [
        { "type": "year", "column": "date", "as": "year" },
        { "type": "index", "column": "value", "as": "index", "by": "type", "base": { "year": "{base}" } }
    ],
    "controls": [{ "type": "slider", "global": "base", "name": "Basisjahr", "values": { "column": "year" } }],
    "dims": { "x": "date", "y": { "column": "index", "format": ",.0f" } }
}
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
- `share`: the value's share of its group's sum, e.g. `"by": "date"` for
  each category's share per date.
- `rolling`: the mean of the values of `size` rows of the group, the ones
  before the row (`"align": "end"`, the default) or around it (`"center"`),
  only of whole windows, missing values are left out (a row without a value
  has no mean, as of `cumulative`), in the order of the
  column `order`, e.g. `{"type": "rolling", "column": "value", "as": "mean28",
  "by": "country", "order": "date", "size": 28}`.
- `cumulative`: the sum of the values of the group up to the row, in the order
  of `order`, e.g. the sum of a year so far with `"by": "year"`.
- `calc`: the value of the [expression](#expressions) `expr`
  of the row in the column `as`, its names are the columns of the row (also
  the ones of the transforms before) and the globals, without a value if a
  number is missing or of a division by 0, e.g. a value relative to the one
  of a group in another column, `{"type": "calc", "expr": "@value / @inno *
  100", "as": "rel"}`, or the larger one of two columns, e.g. the end of a
  band above a mean, `"=max(@value, @mean)"`.
- `filter`: only the rows whose expression `expr` is true (the names are
  the ones of `calc`), the later transforms, the marks and the scales have
  only them, e.g. `{"type": "filter", "expr": "@value > 0"}`, a
  `share` after it is the one of these rows. The values of controls of
  a column and the categories of the data are the ones of all rows. The
  `filter` of the definition is one of the values of dims, see
  [`filter`](#filter).
- `rank`: the rank of the value in its group, 1 of the least one or of the
  largest one with `"descending": true`, the same values have the same
  rank, e.g. the place of a country in a year with `"by": "year"`.
- `lookup`: the value of the column `value` of the row of a file of rows
  (`data`, its url relative to the definition, the format of its extension
  or `dataFormat`) whose column `key` is the value of `column`, e.g. country
  names for the country codes of the data, in the page language: `{"type": "lookup", "column": "country", "data": "countries.csv",
  "key": "code", "value": "name_{lang}", "as": "countryName"}`. The file is
  loaded with the data, its url is no template.
- `random`: a random number of the row in `range` (`[0, 1]` by default) in
  the column `as`, the same on every draw: a hash of the `seed` (0 by
  default, another seed gives other numbers) and of the row, its index in
  the data or its value of the column `key` (e.g. an id, so the numbers stay
  if the rows of the file come in another order). A row keeps its number if
  others are left out (by a `filter`, the `filter` of the definition or a
  hidden category), e.g. the jitter of the points of a strip plot within the
  band of their category:
  ```json
  {
      "transform": { "type": "random", "as": "jitter", "range": [0.06, 0.94], "seed": 1 },
      "dims": { "jitter": { "column": "jitter", "type": "numeric" } },
      "marks": { "type": "point", "by": "group", "y": "@group:scaled + @jitter * @group:bandwidth", "r": 1 }
  }
  ```
- `bin`: the classes of the values of `column`, e.g. a histogram. It adds a
  row per class and group (`by`, the groups of the rows with values) after
  the rows, with the columns `by`, the start of the class (`start`, by
  default `"start"`), its end (`end`, `"end"`) and the number of its values
  (`as`, `"count"`) or the sum of their `weight` (a column, e.g. a weight of
  a reporting lag), also of empty classes (0), so an outline goes down to 0.
  `edges` are numbers and ranges `{"from", "to", "step"}`, e.g. classes of 5
  from 50 to 250 and an edge at 143, so no class crosses a threshold: `[{"from":
  50, "to": 250, "step": 5}, 143]`; without them `step` gives classes of the
  multiples of it from the largest one not above the least value to the
  smallest one not below the largest value (a single 10 of a step of 10 is
  the class 10 to 20). A class includes its start, the last
  one also its end, the values outside the edges are left out (a warning
  says how many). The rows stay, so the marks draw both: a mark draws the
  rows with the values it uses, e.g. the bars the rows of the classes and
  the points of a strip plot the rows of the data, see
  `data/stats/histogram.json`. With `"replace": true` the rows of the
  classes replace the rows, they only have their own columns. The transforms
  after it compute values of the rows of the classes too, e.g. the
  awards per month and class of 5 (`months` a global):
  ```json
  {
      "transform": [
          { "type": "bin", "column": "value", "edges": [{ "from": 50, "to": 250, "step": 5 }, 143], "start": "lo", "end": "hi" },
          { "type": "calc", "as": "perMonth", "expr": "@count / @months / ((@hi - @lo) / 5)" }
      ]
  }
  ```
  or a density per category, its share of the group, divided by the width:
  `{"type": "share", "column": "count", "as": "share", "by": "regime"}`,
  `{"type": "calc", "as": "density", "expr": "@share / (@hi - @lo)"}`.
  `normalize` does these in the bin: `"share"` (of
  the sum of the group), `"density"` (the share per unit of `column`, so
  the area of the classes is 1) or `"count"` (the default); `per` divides
  by the width of the class in units of it, e.g. `"per": 5` of the count per
  5k, of a density the share per 5k, so the example above is a `bin` with
  `"per": 5` and a `calc` of `@months`. The rows of the data have no count, so they are no
  part of these values. The transforms are computed before the `filter`
  of the definition: the classes of the values of a selected month need the
  month in `by`, e.g. `"by": ["month"]` and `"filter": {"month": "@globals.month"}`.
  The bars of the classes are a `bar` with `x0` and `x1`, an outline is
  a `line` with `x0` and `x1`, see [marks](#marks).
- `fold`: wide to long, e.g. a file with a column per year. It replaces the
  rows by a row per row and column of `columns`, a list of names or a
  pattern with a `*` (`"20*"`, the columns which match, also the ones of
  the transforms before), with the other columns of the row, the name of
  the column in `key` (`"key"` by default) and its value in `value`
  (`"value"`), as it is: `{"type": "fold", "columns": "20*", "key":
  "year"}` of the columns `2019`, `2020`, ... With `"replace": false` the
  folded rows follow the rows instead, as the ones of a `bin`.
- `aggregate`: an aggregate of the values of `column` of the group (`op`):
  `sum`, `mean`, `min`, `max`, `count` (the number of values), `median`,
  `first` or `last` (in the order of `order`), missing values are left out.
  By default a column, the value of every row of the group, e.g. the total
  of a country of all years, `{"type": "aggregate", "column": "value", "by":
  "country", "op": "sum", "as": "total"}`, so a `calc` can divide by it.
  With `"rows": true` a row per group replaces the rows, with the columns
  `by` (the values of the first row of the group) and `as`, e.g. the mean
  per category of a bar chart: `{"type": "aggregate", "column": "value",
  "by": "category", "op": "mean", "rows": true}`.
- `window`: a value of another row of the group in the order of `order`:
  `lag` or `lead`, the value `offset` rows (1 by default) before or after
  the row, `diff`, the value minus the one before, or `pct`, the change in
  percent, e.g. the change to the previous month, `{"type": "window",
  "column": "value", "by": "country", "order": "date", "op": "pct", "as":
  "change"}`, without a value at the ends or of a missing one (also of a
  division by 0). Or the `sum`, `mean`, `min` or `max` of the window of
  `size` rows, as the mean of `rolling` (`align`), e.g. the sum of the last
  7 days, `{"type": "window", "column": "cases", "order": "date", "op":
  "sum", "size": 7, "as": "week"}`.

The strings of a transform are templates of the globals, e.g. `{base}`, the
transforms are computed again when the globals change, from the first one
which they change. The CSV of the data has the computed values. See
`data/bev/def-index.json`.

## The options

The texts, the sizes and the look are keys of the top level:

- `title`, `subtitle` and `source` (below the chart, HTML, e.g. a link)
  are texts, templates of the globals: `{name}` is the value of the global,
  e.g. `"Durchschnitt {base} = 100"` of a control of the base year, also in
  the image and the name of its file, see [templates](#templates).
- `height`: the height of a facet in pixels, 400 by default, an
  [expression](#expressions) of `totalWidth` (the width of the
  visualisation), e.g. `"=steps(@totalWidth, {0: 220, 550: 250})"`.
- `width`: the width of the image of the export (and of the PNG) without
  one given, the chart fills the width of its element otherwise.
- `margins`: the space around the plot area of a facet, see
  [margins](#margins).
- `coord`: the coordinate system of the marks, `cartesian` (the default, a
  horizontal and a vertical axis), `polar` (an angle and a radius, see
  [polar charts](#polar-charts)), `geo` (a map, see [maps](#maps)) or a
  registered one, see [extensions](extensions.md#coordinate-systems).
- `transition`: the elements move to their new values in this many
  milliseconds (`true` for 300) after a change of a legend, a control or
  the state, e.g. `"transition": 400`: the points, bars and lines of the
  draw before and the axes of cartesian charts move, new elements are drawn
  at once, a new width is drawn at once, nothing moves if the user prefers
  less motion (`prefers-reduced-motion` of the system).
- `message`: a text instead of the marks and the legends, an expression of
  the globals and `totalWidth` (a template), e.g. of a narrow screen, `null`
  or an empty text for the marks:
  ```json
  { "message": "=steps(@totalWidth, {0: 'The display is too narrow, please rotate your device.', 600: null})" }
  ```
  or of a value of a control, e.g. of a comparison which the chart can not
  show, `"=match(@group, {top3: 'The Top 3 are other countries for every
  indicator.'}, null)"`.
- `empty`: the text if there are no rows, e.g. of a filter (`vis-message`).
- `class`: a class of the element `.vis` (a template of the globals), e.g.
  for the styles of a page of several charts. `.vis` also has the globals of
  text and numbers as `data-global-` attributes (the names in lower case with
  hyphens, e.g. `data-global-share-scale` of `shareScale`), e.g. a style of
  a value of a control: `.vis[data-global-group="eu"] .vis-title`.
- `fontFamily`: the font, by default the css variable
  `--gen-vis-font-family` or Inter (of the package, see
  [the font](usage.md#the-font)), so the font of all visualisations of a
  page can be set with css (see [styles](usage.md#styles) for the colors):
  ```css
  .vis { --gen-vis-font-family: Arial, sans-serif; }
  ```
- `hover` and `highlight`: see [`hover`](#hover) and [`highlight`](#highlight).

`locale` sets the number and date formats of the axes and the hover, also of
axes without `format`: `de` (the default) or `en`, a language of the browser
(`Intl`), e.g. `fr`, `it` or `de-CH`, or an object with a `base` locale and the
parts which are changed, see d3's
[formatLocale](https://d3js.org/d3-format#formatLocale) and
[timeFormatLocale](https://d3js.org/d3-time-format#timeFormatLocale):

```json
{ "locale": { "base": "de", "number": { "currency": ["", " EUR"] } } }
```

A language of `Intl` has its separators of numbers, the formats of dates and
times and the names of the days and months (of the gregorian calendar) of
the browser, the currency is the euro and the texts are in English (German
for German languages). `timeTicks` of the object are the tick formats of
time axes without `format`, by the interval of the date (`millisecond`,
`second`, `minute`, `hour`, `day`, `week`, `month`, `year`), `texts` the
titles of the buttons (`download`, `copy`, `copied`, `csv` and `svg`), the
texts of screen readers (`chart`, the kind of a facet with a hover, and
`keys`, the description of its keys) and `total`, the name of the total of
the hover.

`language` is the language of the texts of the definition which are written
in several languages, an object of language tags and texts:

```json
{
    "language": "@lang",
    "title": { "de": "Bevölkerung", "en": "Population" },
    "globals": { "lang": "de" },
    "controls": [{ "type": "radio", "global": "lang", "values": [{ "value": "de", "name": "Deutsch" }, { "value": "en", "name": "English" }] }]
}
```

A text is the one of the language (`en`), of its language without the
region (`de` of `de-AT`) or the first one. `language` is a tag or a global
(`"@lang"`, e.g. of a control as above or of the page, see
[globals](#globals-and-controls)), by default the language of `locale`;
without a `locale` of its own the language is also the locale of the numbers
and dates, e.g. the names of the months (a language of `Intl` is loaded with
the definition if it is a value of the global of a control or the
global). The texts which can be in several languages are the title, the
subtitle, the source and `empty`, `title`, `row` and `total` of `hover`, of
the dims their `name`, `format` (e.g. `{"de": "%-d. %B", "en": "%B %-d"}` of
the order of the day and the month), the `format` and the `title` (or its
`name`) of the axis, the `format` of the hover and of the legend, the
`name` of `legend.missing`, of `common`, of the categories and of the
ranks, the `label` and the `text` of annotations and the names of the
controls and of their entries. The attributes of marks are expressions, a
text of them in several languages is a `match` of the global, e.g.
`"=match(@lang, {de: 'Quelle', en: 'Source'})"`, the names of the data are
the ones of a column of the language, e.g. `"column": "name_{lang}"` or a
`lookup` of `"value": "name_{lang}"`.

### Margins

`margins` is the space around the plot area of a facet in pixels, of the
axes and their titles: `{"top", "right", "bottom", "left"}`, each a number,
an expression of `totalWidth` (e.g. `"=steps(@totalWidth, {0: 40, 560:
80})"`) or `"auto"`. A side is, the first one which gives it:

1. the side of the definition, e.g. `"margins": {"left": 60}`;
2. the css variable of the side of the styles of the page, of the element
   `.vis` or an element above it: `--gen-vis-margin-top`,
   `--gen-vis-margin-right`, `--gen-vis-margin-bottom`,
   `--gen-vis-margin-left`, a length in pixels or `auto`;
3. the margins of the defaults of the chart (the prop `defaults`, e.g.
   `{"margins": {"left": 60}}`) or of the page (`registerDefaults`), see
   [defaults](#defaults);
4. measured (`"auto"`, the default of every side).

So a house style gives its margins once, in its stylesheet, and the
definitions give only the sides which differ:

```css
.vis.house { --gen-vis-margin-left: 64px; --gen-vis-margin-right: 16px; }
```

A measured side is the space of the axes of every facet: the tick marks,
the padding of the labels, the widest label of a left or right axis (the
text of `labels.props` if it has one, at most its `max-width`), the
height of the labels of a top or bottom one, rotated labels by their
projection, the title of the axis (of a vertical axis at the top above the
plot area), the first and the last label of a
horizontal axis which reach beyond the plot area (the left and the right
side), the labels of an angular axis around the circle; at least 8 pixels
beside axes (e.g. a point at the end of a line), none of a map. The texts
are measured in the font of the visualisation. Not measured are the texts
of marks outside of the plot area, e.g. labels at the ends of lines or
bars: give that side, e.g. `"margins": {"right": 60}`. The legends and the
titles of facets are not part of the margins, they are beside or above the
facets. `"margins": "auto"` is the same as no margins.

### Defaults

The built-in defaults of the parts are the values a definition does not
have to give, `builtInDefaults` of `src/utils/defaults.js`, the ones of
the axes, of the symbols of the legends and of the margins:

```json
{
    "axis": { "padding": 3, "tickMarks": { "size": 9, "inset": null }, "title": { "offset": null } },
    "angularAxis": { "tickMarks": { "size": 6, "inset": 0 } },
    "radialAxis": { "title": { "offset": 16 } },
    "legend": { "symbol": { "size": 16 } },
    "margins": {}
}
```

`legend.symbol` is the box of the symbols of the shortcuts (`size`, or
`width` and `height`), for all and per shortcut, with props of their own,
e.g. smaller symbols of a house style, `{"legend": {"symbol": {"rect":
{"width": 9, "height": 9}, "line": {"width": 18, "height": 9, "props":
{"stroke-width": 1.6}}}}}`; the box and the props of a symbol of the
definition win. `margins` are the sides of the charts without one (a
number of pixels or `"auto"`), see [margins](#margins).

`axis` are the ones of all axes, `<position>Axis` the ones of the axes of a
position before them, e.g. `angularAxis` and `radialAxis` of polar charts or
`leftAxis`; an `inset` of `null` is the one of the styles (the css variable
`--gen-vis-tick-inset`, 4 pixels of bottom and right axes, 5 of top and
left ones), a `title.offset` of `null` of cartesian axes 8 pixels inside
the edge of the margin. Defaults of the same shape replace them without
changing a definition: the prop `defaults` of a chart (also
`data-defaults`, the Vue component, `defaults` of the [export
page](export.md#export-page) and `--defaults` of the [CLI](export.md#cli))
and `registerDefaults(defaults)` of all charts of the page (called before
the charts are drawn, `null` removes them). Precedence: the definition,
then the prop, then the page, then the built-in defaults (of the margins
the styles of the page come after the definition). Within one level an
axis-specific entry (e.g. `angularAxis`) beats `axis`, but a higher level
always wins, so the prop's `axis` beats the page's `angularAxis`. E.g.
ggplot2 spacing (3pt tick marks outside the plot area, labels close to
them) and the margins of a house style for every definition:

```js
import { registerDefaults } from '@preschen/gen-vis';

registerDefaults({ axis: { padding: 2, tickMarks: { size: 4, inset: 0 } }, margins: { left: 64 } });
```

## `dims`

A dim is a column of the data with a name, its type, its scale, its axis,
its legend, its categories and its part of the hover; the marks and all
other parts of the definition refer to it by its name. A text is the
column, `"x": "Jahr"` is `"x": {"column": "Jahr"}`. `null` (or `false`)
removes a dim or a part of a dim of a parent, e.g. `"hover": null`.

```json
{
    "dims": {
        "y": {
            "column": "value",
            "name": "€/l",
            "format": ".1f",
            "zero": true,
            "grid": true,
            "ticks": 8,
            "hover": { "format": ".2f" }
        }
    }
}
```

is the dim `y` of the numbers of the column `value` with all its parts
which follow from the rest: `"type": "numeric"` (of the values),
`"scale": {"type": "linear", "orientation": "vertical", "domain": [0, null]}`
and `"axis": {"position": "left", "format": ".1f", "ticks": 8, "grid": true}`.

The dims of the positions of the coordinate system have a scale of the
orientation of their name and an axis: of cartesian charts `x` (horizontal,
an axis at the bottom) and `y` (vertical, at the left), of polar charts `x`
and `angle` (angular) and `y` and `radius` (radial), so `"x": "Jahr"` is
enough. `"axis": false` leaves out the axis, `"scale": false` the scale,
`"orientation": null` of the scale is none (e.g. a dim `y` of the sizes
of points). An axis without a `position` is at the one of the orientation of
its scale (`bottom`, `left`, `angular`, `radial`), e.g. of a second vertical
axis `"axis": {}` or `"axis": {"position": "right"}`. A dim a mark names in
a channel beside the dim of the axis of the channel (e.g. `"y2": "hi"` of a
rule) is on the scale of that axis, see [channels](#channels).

The shorthands of a dim are parts of its scale and its axis:

| Shorthand | Is |
|-----------|----|
| `zero: true` | `"domain": [0, null]`, the domain starts at 0, e.g. of bars |
| `domain` | `scale.domain` |
| `nice` | `scale.nice` |
| `pad` | `scale.pad` |
| `include` | `scale.include` |
| `reverse` | `scale.reverse` |
| `range` | `scale.range` |
| `grid` | `axis.grid` |
| `ticks` | `axis.ticks` |
| `tickSpacing` | `axis.tickSpacing` |

- `format`: the d3 format of the values (a time format of dates), the one
  of the axis and of the hover (and of `@y:formatted`) which have none of
  their own.
- `name`: the title of the legend (the title of the axis is `axis.title`).

### The type of a dim

`type` is `numeric`, `date` or `categorical`. Without a type it follows from
the parts of the dim: `categories` (or a `band`, `point` or `ordinal`
scale) are categorical, a `time` or `utc` scale is a date, other scales
are numeric, a dim of the facets is categorical (one only used as `by` of
a mark is not, it groups rows of any type), otherwise it is the one of the
values of the column: numbers are numeric, dates (as below) a date, others
categorical (a column without values, e.g. of empty data, is a date with a
time `format` of the dim, its axis or its hover, otherwise categorical),
e.g. years of a column are numeric, so a dim of the categories of years is
categorical by its `categories` or with `"type": "categorical"`. The type
of the values reads the values of the column (once per value, until one is
neither a number nor a date), a few milliseconds of data of hundred
thousands of rows, a dim with a `type` does not read them.

Numeric and date values which are missing, invalid or infinite are `null`:
they are gaps in lines and areas, points and bars are not drawn, and they
are not shown in the hover, only of the marks which use the value of the row
(not e.g. `@y:scaled:max`, the end of the scale). A mark none of whose rows
has the values it uses is named in a warning of the console (also of the
CLI), e.g. `plot 'caps': none of its 312 rows is drawn, 312 without a value
of mapping 'y'`. Dates are timestamps or strings. A date without a time
zone, e.g. `2024-06-01`, `2024-06`, `2024`, `2024-06-01 13:00` (also with a
`T`, seconds and their fraction, `24:00` is the end of the day) or
`01.06.2024` (the day first, also with a time), is the one of the time zone
of the scale, local of a `time` scale (and the other ones) and UTC of a
`utc` scale, so it is the same day and time in every time zone
(`Date.parse` reads a date without a time as midnight UTC, the day before
west of UTC in local time, and `01.06.2024` as the 6th of January). A date
and a time with a time zone, `Z` or an offset, e.g. `2024-06-01T13:00:00Z`
or `2024-06-01 13:00+02:00`, is the same time of every scale, other strings
are no dates, e.g. `Phase 1` (which `Date.parse` of some browsers reads as
one).

`interval` makes the dates of a time (or utc) scale periods which start
at them, e.g. half years of `2023-01-01` and `2023-07-01`: `day`, `week`,
`month`, `quarter`, `half`, `year` or a number of them, e.g. `"6 months"`
(a band scale of dates has a band per date instead, in their order). The
domain of the data reaches the end of the last period (without the 2% of
other positions), so bars at the ends fit; `@x:scaled` (also
`@x:scaled:center`) is the middle of the period of a row, so bars, points
and lines are in the middle of their periods, `@x:scaled:start` and
`@x:scaled:end` are its start and end, `@x:step` its length in pixels, e.g.
`"width": "=@x:step * 0.6"` of a bar (80% of it by default); the hover is
at the middle of the period under the pointer (ticks, grid lines and
annotations are at their dates) and shows the period (`%b %Y` of months,
`Q%q %Y` of quarters, `H%K %Y` of halves, `%Y` of years, a `format` of the
hover replaces it). `%K` is the half of the year (1 or 2) in the time
formats, e.g. `"%K. Halbjahr %Y"`, d3's `%q` the quarter.

### Scales

`scale` of a dim:

- `type` is a d3 scale (`linear`, `time`, `log`, `symlog`, `sqrt`, `point`,
  `band`, ...), continuous scales need a `numeric` or `date` dim (positions
  of dates a `time` or `utc` one), `point` and `band` a `categorical` one,
  `ordinal` scales are of any values, e.g. the colors of categories
  (`range`). Without a type it is the one of the type of the dim: `linear`
  of numeric ones, `time` of dates, of categorical ones `band` of the
  positions of bars (`bar`, `arc`) and of cells, `point` of other positions
  and `ordinal` otherwise. `type` and the names of projections are written
  in lower case, e.g. `linear` and `mercator`, others work but `validateDef`
  warns.
- `orientation` (`horizontal` or `vertical`) places the scale on the plot,
  `angular` or `radial` in polar charts.
- `domain` (also of the dim) fixes the domain, `null` entries are taken
  from the data, the values are converted as the ones of the data, e.g.
  dates or numbers of strings, categories as strings, e.g. `[2004, 2008]`
  of the years of any data, entries can be references, e.g. `[0, "@max"]`
  of a global, the domain of a `point` or `band` scale are its categories
  in their order.
- `pad` (also of the dim) extends the ends taken from the data relative to
  the size of the domain (a fixed end stays, e.g. `0` of bars), positive
  values extend: a number, e.g. `0.1` of 10% below and above, or `[start,
  end]`, e.g. `[0, 0.1]` of room above bars. By default a domain of a
  position taken from the data is extended by 2%. `domainAbs` adds its
  values to the ends, e.g. `[-0.5, 0.5]` of years, so they extend with a
  negative start and a positive end (a positive start shrinks the domain
  and cuts off data, `validateDef` warns of it).
- A `log` scale has the positive values only (the negative ones if there
  are none), a value of 0 is not drawn, a domain without values is `[0,
  1]` (`[1, 10]` of a `log` scale) or the one of `include`.
- `include` (also of the dim) are values the domain taken from the data
  includes, e.g. `0` or `[0, 100]`, around `center` it is symmetric, e.g.
  `0` of changes, e.g. `"include": 0, "pad": 0.4` is the domain of the
  values and 0 extended by 40% of its size on both sides.
- `nice` (also of the dim) rounds the ends taken from the data of a
  numeric dim, e.g. 0.951 to 1, of a `log` scale to powers of 10, `true`
  for steps of about a tenth of the domain or the number of steps, e.g. so
  the legend of colors ends at 100%, only of numeric dims, `validateDef`
  warns of others.
- `reverse` (also of the dim) turns the range around, e.g. the largest
  value at the bottom or the first category of a vertical axis at the
  bottom.
- `range` (also of the dim): by default the width or the height of the
  plot area, of a scale without `orientation` the range given, e.g. colors
  or the radius of points; references to the sizes of the coordinate
  system, e.g. `"@radius"` of polar charts.
- `domainIgnores` are the conditions of the [`filter`](#filter) of the
  definition (their dims, `true` all of them) the domain taken from the
  data ignores, e.g. `["month"]` of a slider over months: the domain is the
  one of the rows of the other conditions and the visible categories, e.g.
  of all months of the selected fuel, the marks draw the rows of the month.
  So the scale and its legend stay the same while the slider moves. Of a
  filter which is an expression its comparisons of the dims are left out.
  Fixed entries of `domain` still win, `include`, `center`, `pad`,
  `domainAbs` and `nice` apply to the wider domain, of a `band` or `point`
  scale it has the categories of all months, of stacked values the stacks
  of each month, of facets with their own scales the rows of the facet.
- `step` of a vertical `band` or `point` scale are the pixels of a
  category (also an expression of `totalWidth`), the height of the plot is
  the one of its categories (and the space of their `groups`), not
  `height`, e.g. the rows of horizontal bars keep their size if some of
  them are hidden, the plot is less high.
- The categories of a `band`, `point` or `ordinal` scale are in the order
  of the `categories` of the dim (the one of the legend, the stacks and
  the facets). The first category is at the start of the range: left of a
  horizontal scale, at the top of a vertical one (a `band` or `point`
  scale of a vertical orientation without a range of its own runs from the
  top down, `[0, "@height"]`, as the rows of a table), so horizontal bars
  are from the top down; `"reverse": true` puts the first category at the
  bottom.
- `order` of a `band`, `point` or `ordinal` scale is the order of its
  categories taken from the data: the one of the rows (by default, after
  the listed `categories`), `ascending`, `descending` or by the value of a
  dim of their first row, e.g. bars by their length, `{"by": "x",
  "descending": true}`.
- `groups` of a `band` or `point` scale are the groups of its categories,
  of the values of a dim (`by`) of their rows, with a space of `padding`
  steps between them (1 by default), e.g. the rows of horizontal bars of
  the groups of indicators, `@y:group:start` and `@y:group:end` are where
  the row's group starts (its first band) and ends (its last band), e.g. a
  line along a group:
  ```json
  { "dims": { "y": { "column": "label", "type": "categorical", "scale": { "groups": { "by": "group", "padding": 0.8 } } } } }
  ```
- `padding` of categorical scales, the space between the categories in
  steps (0.4 by default) of `point` and `band` scales; of a `point` scale
  of angles the place of the first category, see [polar
  charts](#polar-charts). `inset` is the space at the start and the end of
  the range in pixels (of positions), a number for both or `[start, end]`,
  e.g. `10` so the first and the last point are not at the edges, of every
  type of scale, also of dates.
- `of` is the scale of another dim, e.g. `"scale": {"of": "y"}`: the values
  of this one are positions on it too and they are in its domain, e.g. the
  other end of a band between two columns, without the other parts of a
  scale. A channel of a mark sets it (see [channels](#channels)), so it is
  rarely written.
- Scales of colors: `sequential` and `diverging` scales (a domain with a
  middle entry, e.g. `[null, 0, null]`) have an `interpolator` of d3, e.g.
  `Blues`, `Viridis` or `RdYlGn`, `sequentialQuantile` the colors of the
  quantiles of the values. `quantize`, `quantile` and `threshold` scales
  (the `domain` are the values between the classes) are classes of colors,
  the `range` or a `scheme` of d3, e.g. `Blues`, with `classes` colors, the
  classes of a `threshold` scale include their lower limit (`value >=
  limit`), with `"closed": "right"` their upper one (`value > limit`),
  `ordinal` scales the colors of categories. Scales without orientation are
  the same in all facets. A mark draws the color of such a dim with
  `"fill": "value"` (the scaled value of the row, see [attributes](#attributes)).

### Axes

`axis` of a dim:

- `position`: `top`, `bottom`, `left`, `right`, in polar charts `angular`
  and `radial`.
- `at` (cartesian axes): the line of the axis at this value of the dim of
  the other axis instead of at the edge, e.g. `"x": {"axis": {"at": 0}}` at
  y = 0 of bars of negative values, or `"y": {"axis": {"at":
  "2020-01-01"}}` at a date of x, converted as the values of the data, also
  a reference, e.g. `"@zero"`; the line is at the half pixel of the tick of
  the value, on the tick and the grid line of it, above the marks (class
  `vis-axis-at`), a value outside of the domain of the other scale or
  without a position, e.g. 0 of a log scale, leaves the axis at its edge.
  `position` is the side of its tick marks and labels. The labels stay at
  the edge of the plot area (`"labels": {"at": "edge"}`, the default), only
  the line and the tick marks are at the value, so they cover no bars, or
  are with the line, `"labels": {"at": "axis"}`, then without the label
  where the line of the other axis crosses it; the title stays at the edge.
- `ticks` (also of the dim): the number of the ticks, `tickSpacing` (also
  of the dim): without `ticks` a tick per this many pixels of the axis,
  e.g. `80`, so a narrow chart has fewer ticks. `values`: fixed ticks,
  converted as the values of the data, e.g. dates of strings or categories
  as strings, so `["2004", "2008"]` and `[2004, 2008]` are the same ticks
  of a band scale of years, the ones outside of the domain are left out,
  also the ones which are no category of a `band` or `point` scale, also an
  expression of the names of the facet, e.g. steps of `totalWidth`. A band
  or point scale has a tick per category.
- `format`: a d3 number or time format.
- `rotate`: the angle of the labels in degrees, positive counterclockwise,
  negative clockwise.
- `labels` (of all axes, also of polar charts): the `props` of the labels,
  svg attributes and `text`, e.g. `{"font-weight": "@weight", "text":
  "@short", "max-width": 300}`, their names are the ones of the facet, the
  values of the first row of the tick, e.g. `@short` of another dim, the
  props of the categories of the tick and of the categories of its row of
  the dims `by`, e.g. `"by": ["level"]` for `@weight` of the categories of
  a level, a `font-size` replaces the one of the styles. A `max-width`
  (pixels) cuts a label with an ellipsis, the full text is its title (the
  tooltip of the browser), or wraps it into lines with `"text-overflow":
  "wrap"`, of the `line-height` in em (1.2 by default).
- `domain`: the `props` of the line of the axis, svg attributes of the
  names of the facet, e.g. `{"props": {"stroke-opacity": 0.4}}`, of an
  angular axis the circle.
- `tickMarks`: the short lines of the ticks: `false` leaves them out, the
  labels stay at their places, their length `size`, 9 pixels across the
  line of a cartesian axis, 6 outside of the circle of an angular axis by
  default, the labels move with it, the part of it inside the plot area
  `inset`, by default 4 pixels of bottom and right axes, 5 of top and left
  ones (the styles), 0 of angular axes, e.g. `0` for marks only outside,
  and their `props`, as the ones of `domain`, radial axes have none.
- `grid` (also of the dim): lines at the ticks.
- `title`: `{"name", "offset"}`, its text and the distance from the
  axis, by default 8 pixels inside the edge of the margin, of a radial axis
  16 pixels outside of the circle; in the middle of the range of the scale,
  rotated beside a left or right axis, `"position": "side"`, the default;
  of a left or right axis `"position": "top"` puts it horizontal above the
  range of the scale, `gap` pixels (8) above it, starting at `offset` from
  the axis, e.g. the unit at the top left, class `vis-axis-title-top`.
- `padding`: the space between the tick marks and the labels, 3 pixels by
  default, also of polar axes.

The defaults are the ones of [defaults](#defaults), a page or an export
replaces them for all axes.

### Categories

`categories` are the categories of a dim and their props by their key (the
value of the column): a `name`, a `color` (the `fill` and `stroke` of their
marks by default), `visible`, `legend`, `symbol` and any other prop, e.g.
`"stroke-width"`, which the attributes of the marks refer to (`"@stroke-width"`);
a text is the color, `"Wien": "#C3423F"` is `"Wien": {"color": "#C3423F"}`:

```json
{
    "dims": {
        "land": {
            "column": "Bundesland",
            "common": { "stroke-width": 2 },
            "categories": { "Wien": "#C3423F", "Tirol": "#4269D0", "ÖSTERREICH": { "name": "Gesamt", "color": "#000", "stroke-width": 4 } }
        }
    }
}
```

- Listed categories are all of them: rows of other values are in no
  category of the dim, e.g. a line `by` it leaves them out. `fromData` adds
  the values of the column which are not listed, after them: in ascending
  order (`true`, numbers by their value), e.g. new regions of the data, or
  in the order of the rows (`"rows"`).
- Without listed categories a dim with a legend or with parts of its
  categories (`scheme`, `common`, `ranks`, `order`) and a dim of the
  facets has the categories of the data, in the order of the rows
  (`"fromData": "rows"` by default). The categories of the data are the
  ones of all rows, also of the rows a transform `filter` leaves out.
- The order of the `categories` is the order of the legend, the facets, the
  stacks and of a band, point or ordinal scale, not the order of the rows.
  Keys which are integers, e.g. years, are ordered ascending by JavaScript,
  first. `order` sets the order: `"ascending"`, `"descending"` (numbers by
  their value, e.g. the newest year first) or a list of keys, which are
  first, the others after them.
- `common` props are the ones of all categories, `name` and `visible` are
  set by default (the key, `true`). Only visible categories are shown.
- `scheme` sets the prop `color` of the categories in their order, a d3
  scheme, e.g. `Tableau10` or `Blues` (of the number of categories), a
  registered one (see [extensions](extensions.md#schemes-of-colors)), a
  `color` of the props is kept.
- `ranks` are the props of the categories by their place in the order, of
  the first one, the second one, ..., the last entry of all others, e.g. the
  newest year is red, whichever year it is, the props of a category override
  them, they override `common`:
  ```json
  { "dims": { "year": { "column": "year", "order": "descending", "common": { "stroke-width": 2 },
      "ranks": [{ "color": "#C3423F", "opacity": 1 }, { "color": "#CF8E02", "opacity": 0.7 }, { "color": "#BBB", "opacity": 0.3 }] } } }
  ```
- Categories without a `color` (none of the dim has one, no `scheme`)
  have the default colors of d3's scheme Observable10 in their order, a mark
  or a legend uses the default color of the first of its categories if none
  of them has a color, e.g. the colors of the lines of the categories of the
  data.

A change of the categories by a global (e.g. other colors of a `match`)
replaces them, the entries of the legend keep their state.

### Legends

`legend` of a dim with categories is a toggle for every category (`{}` is
one of the defaults): a click shows or hides the category, a double click
shows only it, the next double click all of them. The entries are
checkboxes of the keyboard (tab, enter or space), the mouse and the focus
highlight their category. A category with `"legend": false` in its props
has no entry, it stays visible, e.g. headers. With `"onlyData": true` the
legend only has the categories of the rows after the `filter`, also the
hidden ones, e.g. the sources of the selected year, the entries follow the
controls, a double click hides also the categories which are not shown, so
they stay hidden when they come back.

`symbol` is the symbol before the name of a category:

- `"auto"` (the default, also `{"type": "auto", "width": 18}`): the symbol
  of the marks of the categories (with the dim in `by` or as their `fill`
  or `stroke`): a box of the ones which fill (bars, areas, cells), a line of
  the lines and rules and a dot of the points, in this order, e.g. a light
  area under a line, with the attributes of their style which are the same
  for all rows of a category (values and references to the props of the
  categories, e.g. `@color`, `"fill-opacity": 0.08`, `"stroke-dasharray":
  "@dash"`), in the box of the line of the defaults, without a line of the
  box or the dot; the `props` of the symbol apply to all its parts; without
  a mark `by` the dim it is a rect. Marks with a `filter` of the dim (e.g.
  `{"land": "Wien"}`, a list or a negation, not a global) give each category
  the symbol of the marks which draw it, e.g. a line of one category and
  boxes of the bars of the others.
- `"line"` (with the `stroke-width`, `stroke-dasharray` and `opacity` of the
  categories if they have them, a width of 2 otherwise), `"rect"` or
  `"circle"` (with their `opacity`), in the color of the category
  (`@color`); the object `{"type": "line", "size": 20, "props":
  {"stroke-width": 3}}` sets the size (16 by default) and props of the
  element.
- svg `elements` (with props) in a box of `width` × `height` pixels from
  (0, 0) (both `size` by default), e.g. `{"size": 16, "elements": [{"type":
  "circle", "props": {"cx": 8, "cy": 8, "r": 4, "fill": "@color"}}]}`.
- `null` (or an object without `elements` or of a size of 0) is no symbol,
  e.g. instead of the one of a parent: the entry has only its name.

The middle of the box is at the middle of the capitals of the name
(`--gen-vis-legend-symbol-middle` above its baseline, 0.36em of the font
size of the entry, `.vis-legend-entry`, 13 pixels by default; a style sets
the size of the names there, not on their `span`), so an element at half
the height is at the middle of the text. Without a size the ones of the
[defaults](#defaults) (per shortcut, e.g. smaller symbols of a house
style), 16 pixels. A category can have a `symbol` of its own (in the same
forms), e.g. `"categories": {"Direktvergabe": {"symbol": "rect"}}` of an
area in a legend of lines.

A dim with a scale but without categories has the colors of its scale as
legend, a gradient or the classes, the ticks of a gradient at the positions
of their colors, e.g. of a sqrt scale steps of 1, 2 and 5 with more space
for the small values, `format` of the values, by default the one of the
hover, `missing` an entry beside them, e.g. of the regions of a map without
a value (`{"name": "keine Daten", "color": "#DADADA"}`, the color of the
base of a map). The scale of the colors is horizontal or vertical
(`orientation`, the high values at the top, also an expression of
`totalWidth`, the width of the visualisation), `size` pixels long (240 by
default), its labels are after it (`labels`, below or right of it) or
`before` it, `values` are the ticks of a gradient, e.g. `[0, 50, 100]`.
`"classes": true` labels the classes of a threshold, quantize or quantile
scale in their middle instead of their limits, the open ends with `<` and
`≥` (`≤` and `>` of `"closed": "right"`), e.g. `< 50`, `50–100`, …, `≥
300`; a horizontal legend without a `size` is at least as wide as the
labels of its classes (estimated of their characters), a vertical one as
wide as its labels.

`position` places the legend above the plots (`top`, the default), below
them (`bottom`) or beside them (`left`, `right`, the plots have the rest
of the width, the class of the legends is `vis-legends-left` or
`vis-legends-right`, the entries of categories are one below the other),
an expression of `totalWidth`, e.g. below the plots of a phone, e.g. a
vertical scale of colors left of a map:

```json
{ "dims": { "value": { "column": "value", "legend": { "position": "left", "orientation": "vertical", "size": 160, "labels": "before" } } } }
```

`props` of a legend are HTML attributes of the entries, e.g. a `title`, of
the props of the categories.

### The hover of a dim

`hover` of a dim puts it into the hover (also `{}` for its defaults), see
[`hover`](#hover) of the dims which are in it by default:

- `format`: the format of its value, by default the one of the axis or of
  the dim, without one dates are the date of the locale and numbers have
  its decimal mark and up to 6 decimals (without trailing zeros),
  thousands separators only if the domain reaches 10 000, so years are
  e.g. `2024`.
- `props` of a categorical dim are the columns of its entries, the `name`
  of the category first, e.g. `{"unit": "@unit"}` adds a column of the prop
  `unit` of the categories, `"name": null` leaves out the name.
- `props` of `row` are CSS properties of the row of a category (of the
  table or of the template `row` of the hover), props of the props of the
  categories, e.g. the sources which are not stacked in italics: `"hover":
  {"row": {"props": {"font-style": "@hoverStyle"}}}` with `"common":
  {"hoverStyle": "normal"}` and `"hoverStyle": "italic"` of the categories
  `total` and `load`. The nearest row stays semibold, its `font-weight` is
  the one of `vis-nearest`, of several dims with a `row` the later ones
  override the ones before. The rows also have the keys of their categories
  as attributes, see [styles](usage.md#styles).
- `"cell": false` keeps a value out of the table, it is a name of the
  templates of `hover`, e.g. `{half}` of the title.

### Stacked values of a dim

`stack` of a [mark](#stacking-and-dodging) stacks the values of its dim;
`stacked` of a dim does the same without a mark which stacks them, e.g. the
values of the hover of a pie of a mark of its own: `true` stacks all rows,
an expression of the rows (or the values of dims, as a [`filter`](#filter))
only the rows of it, the others are not stacked, their start and end are
their value. `stackBy` is the dim of the positions of the stacks, by default
the one of the other axis (`x` of vertical bars), e.g. the start of the
class of a [bin](#transform) (`"stackBy": "lo"`) of a stacked histogram
above a strip plot whose `x` are the values; rows without a value of it are
not stacked. The hover is at the positions of the stacks then, e.g. a row
per category of the class under the pointer (example
`data/stats/jitter.json`).

## `marks`

A mark or a list of marks, the layers of the chart, drawn in order, the
first one at the back. A mark has a type, the dims of its channels (by
default `x` and `y`), the dims of its groups (`by`) and the attributes of
its elements, e.g. `"stroke-width": 2`:

```json
{ "marks": { "type": "line", "by": "land", "stroke-width": 1.5, "highlight": { "stroke-width": 3 } } }
```

draws a line per category of `land` from the positions of the dims `x` and
`y` of its rows, in the color of the category (`"stroke": "@color"` is the
default of a line). `marks` can also be an expression of a global, e.g.
other marks of a map than of a chart, see [globals and
controls](#globals-and-controls).

### Mark types

The type names a kind of the coordinate system of the definition (`coord`),
with the default attributes of the type, a mark writes only the ones which
differ, `null` removes one, e.g. `"fill": null` of a text in the color of
the page:

| Type | Cartesian | Polar | Map (`geo`) |
|------|-----------|-------|-------------|
| `line` | a line per group (`cartesian:line`) | a line per group (`polar:line`) | |
| `area` | an area per group (`cartesian:area`) | an area per group (`polar:area`) | |
| `bar` | a bar per row (`cartesian:bar`) | | |
| `rule` | a line per row across the plot area or between two values (`cartesian:rule`) | | |
| `point` | a circle per row (`svg:circle`) | `polar:circle` | at its feature or at `lon` and `lat` (`geo:circle`) |
| `text`, `label` | a text per row (`svg:text`) | `polar:text` | at its feature or at `lon` and `lat` (`geo:text`) |
| `cell` | a rect per row of the bands of `x` and `y` (`svg:rect`), e.g. a heatmap | | |
| `arc` | | a segment of a ring per row (`polar:arc`), e.g. a pie | |
| `base` | | | all features (`geo:base`), e.g. as background |
| `region` | | | the feature of every row (`geo:region`) |
| `mesh` | | | the borders of an object of TopoJSON as one path (`geo:mesh`) |
| `circle`, `rect` | svg elements per row (`svg:circle`, `svg:rect`) | | |

The full names, `<coordinate system>:<kind>`, are the same types: `line` of
a cartesian chart is `cartesian:line`. `svg:circle`, `svg:rect`, `svg:line`
and `svg:text` draw an svg element per row in any coordinate system (the
center of polar charts is their origin), their attributes are the ones of
the element, e.g. `"cx"`. `annotation:band`, `annotation:line`,
`annotation:text` and `annotation:circle` draw an annotation per row, see
[annotations](#annotations). A registered type of an extension is named
with or without its prefix, see [extensions](extensions.md#plot-types).

`label` is a `text` without the color of its category (`"fill": null`, the
text color of the page, `--gen-vis-text-color`), placed beside its
position by `anchor`; `point` is a circle of the coordinate system.

The default attributes of the types, `color` is `{"or": ["@color",
"currentColor"]}`, the color of the category of the group, without one the
color of the text:

| Type | Default attributes |
|------|--------------------|
| `line` | `stroke`: color, `fill`: `none` |
| `area`, `bar`, `arc` | `fill`: color |
| `point` | `r`: 3, `fill`: color |
| `text` | `fill`: `@color` |
| `rule` | `stroke`: color, at the half pixel of the ticks |

The ones of maps (`base`, `region`, `point`, `text`, `mesh`) have none:
`"fill": "value"` colors a region by the scale of the dim `value`.

### Channels

The channels of a mark are its positions. A channel names a dim, a column
of the data (a dim of it is added) or is a number or an expression of the
row:

| Channel | |
|---------|-|
| `x`, `y` | the dims of the horizontal and the vertical position, `x` and `y` by default; of polar charts the angle and the radius |
| `x0`, `x1` | the start and the end of a bar or an area on the horizontal axis, e.g. the start and the end of a class of a [bin](#transform) |
| `y0`, `y1` | the start (0 by default) and the end of a bar or an area, e.g. the lower and the upper edge of a band; `y1` of a rule its start |
| `x2`, `y2` | the other end of a rule, e.g. `"y1": "lo", "y2": "hi"` of an error bar |
| `lon`, `lat` | of maps: the dims of the longitude and the latitude of a point or a text |

- A dim of a channel is drawn at the scaled value of the row (`@x:scaled`),
  a categorical one of a band at the center of the band
  (`@x:scaled:center`) of points and texts; a bar is in its band.
- A dim a channel names beside the dim of its axis (e.g. `"y2": "hi"` of a
  rule, `"x1": "hi"` of a bar) is on the scale of that axis
  (`"scale": {"of": "y"}`), so its values are positions of the axis and
  they are in its domain.
- A number is a value on the scale of the axis of the channel
  (`@y:scaled:100`) of `x0` and `y0` of bars, areas and rules, of `y` of
  bars and of `x` and `y` of rules, e.g. the base of bars or a rule at a
  target: `{"type": "rule", "y": 100}`; other numbers are pixels.
- An expression is the position in pixels, e.g. `"y": "@group:scaled +
  @jitter * @group:bandwidth"` of the points of a strip plot within the
  band of their category, or `"x": "=@innerWidth + 10"` of texts in a
  column right of the plot area. References to scaled values (`@x:scaled`,
  ...) are written by hand only in such expressions, see the
  [names](#names).

Of `rect` and `svg:line` (elements of svg) the channels `x`, `y`, `x1`,
`y1`, `x2` and `y2` given are the attributes of the same names at the
positions of their dims, other attributes are given as they
are, e.g. `"width": "=@hi:scaled - @lo:scaled"`.

### Attributes

The keys of a mark which are no options (`type`, `id`, `by`, the channels
and the keys below) are the attributes of its elements, svg attributes (and
`text` of texts) whose values are [expressions](#expressions): of the row,
of the props of its categories, of the names of the facet and of the
globals, e.g. `"stroke-width": "@stroke-width"` of a prop of the
categories, `"text": "@x:formatted"` or `"r": "=@value / 10"`. Nested
attributes are merged into the defaults, e.g. `d` of a path.

- `fill` or `stroke` naming a categorical dim of `dims` is the color of its
  categories (`@color`), the dim is added to `by`; naming another dim, e.g.
  of a scale of colors, the scaled value of the row (`@value:scaled`),
  e.g. `"fill": "value"` of a heatmap or a choropleth.
- `r`, `opacity`, `stroke-width` and `font-size` naming a dim which is not
  categorical are its scaled value, e.g. `"r": "size"` of a dim `size` with
  `"scale": {"type": "sqrt", "range": [0, 20]}`.
- Values with `var(` are css variables, e.g. `"stroke":
  "var(--gen-vis-grid-color)"`, set as a style, see [styles](usage.md#styles).
- The texts of `text`, `label` and of the labels of axes with a `max-width`
  attribute (pixels) are cut with an ellipsis, the full text is their title
  (the tooltip of the browser, also below the area of the hover, e.g. of
  labels with `"area": "facet"`), or wrapped into lines with
  `"text-overflow": "wrap"`, of the `line-height` in em (1.2 by default),
  around the text of a `middle` or `central` baseline, e.g. long names of
  rows. Texts without a `fill` are in the color of `--gen-vis-text-color`
  (`#1F2328`, nearly black, by default), see [styles](usage.md#styles).

### Stacking and dodging

- `stack`: stacks the values of a bar, an area or an arc by the groups of
  `by` (the first category at the bottom), `true` all rows or an expression
  of the rows which are stacked (or the values of dims, as a
  [`filter`](#filter)), the others are not stacked, their start and end are
  their value, e.g. a line of the consumption or a total on stacked areas
  of the same dim, their values are in the domain and in the hover:
  ```json
  {
      "marks": [
          { "type": "area", "by": "type", "stack": "@type != 'load'", "filter": "@type != 'load'" },
          { "type": "line", "filter": { "type": "load" } }
      ]
  }
  ```
  The value dim of a stacked mark has the start and the end of the stacked
  value of a row, `@y:start`, `@y:end`, `@y:start:scaled`, `@y:end:scaled`,
  `@y:height:scaled` the difference and `@y:mid`, `@y:mid:scaled` the
  middle, e.g. of a label in its stack. The hover lists the rows of stacked
  values in the order of the stacks, from the top, a row which is not
  stacked is above them if its category is after theirs in the order of the
  categories, below them if it is before them, e.g. the consumption above
  the sources; `hover.total` adds the sum.
- `dodge` of bars: the groups of `by` (`true`, the first dim of `by`) or of
  this dim beside each other in the band of their position, a hidden
  category leaves its place to the others; of a `text` or a `label` (`true`
  or a dim) the text at the middle of the slot of its category, as its bar:
  ```json
  {
      "marks": [
          { "type": "bar", "by": "type", "dodge": true },
          { "type": "label", "by": "type", "dodge": true, "anchor": "top", "text": "=format(@y / 1000, '.0f')", "font-size": 9 }
      ]
  }
  ```
  A number of `dodge` of texts moves them apart vertically to at least this
  distance in pixels, e.g. labels at the ends of lines, the ones of a polar
  chart of the same angle along the radius (outwards from the inner radius,
  0 and 360° are the same angle), labels of other angles are not moved.
- `orient`: `horizontal` or `vertical` bars, by default horizontal ones if
  `y` is categorical and `x` is not: the bars go from 0 (or `x0`) to `x`,
  their thickness is the band of `y`.
- `anchor` of texts and labels: the text beside its position, after it
  (`end`, e.g. of horizontal bars, 4 pixels to the right), before it
  (`start`), above it (`top`), below it (`bottom`) or on it (`center`),
  with the `text-anchor` and `dominant-baseline` of it; `dx` and `dy` of
  the mark replace the distance.

### Examples

Horizontal bars of a year of a slider, with their values beside them
(a shorter form of `data/bev/def-hbar.json`, which is migrated from 4.x):

```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "data.csv",
    "title": "Bevölkerung {year}",
    "height": 320,
    "margins": { "right": 60 },
    "globals": { "year": "2022" },
    "controls": [{ "type": "slider", "global": "year", "name": "Jahr", "values": { "column": "Jahr" } }],
    "filter": "@year == @globals.year and @y != 'ÖSTERREICH'",
    "dims": {
        "year": "Jahr",
        "x": { "column": "Einwohner", "format": ",.0f", "zero": true, "grid": true, "tickSpacing": 100 },
        "y": { "column": "Bundesland", "type": "categorical", "scale": { "order": { "by": "x", "descending": true } } }
    },
    "marks": [
        { "type": "bar", "fill": "#1E4F77", "highlight": { "fill": "#5BC5F2" } },
        { "type": "label", "text": "@x:formatted", "anchor": "end", "font-size": 11 }
    ]
}
```

The labels are beyond the plot area, so the right margin is given; the
dim `year` is the column of the filter, `@globals.year` the global of the
same name.

Stacked bars, a facet per region, the total in the hover
(a shorter form of `data/rechtsform/def-stacked.json`, which is migrated from 4.x):

```json
{
    "data": "data.csv",
    "dims": {
        "x": { "column": "Jahr", "type": "categorical" },
        "y": { "column": "Anzahl", "format": ",.0f", "zero": true, "grid": true },
        "type": { "column": "Type", "legend": {}, "categories": {
            "Hauseigentum": "#BBD7EE", "Wohnungseigentum": "#5BC5F2", "GBV Miete": "#559BD5",
            "Gemeinde Miete": "#C7DF71", "Private Miete": "#4B9847", "Sonstige": "#9CE1F8" } },
        "geo": "Geo"
    },
    "facets": { "by": "geo", "cols": 2 },
    "hover": { "total": true },
    "marks": { "type": "bar", "by": "type", "stack": true, "highlight": { "mode": "row", "stroke": "#333", "stroke-width": 1.5 } }
}
```

Bars with error bars and a target line, rules of two dims and at a value:

```json
{
    "dims": {
        "x": { "column": "group", "type": "categorical" },
        "y": { "column": "value", "zero": true, "grid": true },
        "lo": "lo",
        "hi": "hi"
    },
    "marks": [
        { "type": "bar", "fill": "#BBD7EE" },
        { "type": "rule", "y1": "lo", "y2": "hi", "stroke": "#333", "stroke-width": 1.5 },
        { "type": "rule", "y": 5, "stroke": "#C3423F", "stroke-dasharray": "3 3" }
    ]
}
```

A rule with `x` (by default the dim `x`) is vertical, from `y1` to `y2`
(by default the edges of the plot area), one with only `y` horizontal,
from `x1` to `x2`; a rule at a category of a band is at the middle of its
band, as bars and points.

A heatmap, a cell per year and type colored by a scale, with its values:

```json
{
    "dims": {
        "x": { "column": "Jahr", "type": "categorical" },
        "y": { "column": "Type", "type": "categorical" },
        "value": { "column": "Anzahl", "format": ",.0f", "hover": {}, "legend": {}, "scale": { "type": "sequential", "interpolator": "Blues" } }
    },
    "hover": { "mode": "point" },
    "marks": [
        { "type": "cell", "fill": "value", "stroke": "white" },
        { "type": "label", "text": "=format(@value / 1000, ',.0f')", "anchor": "center", "font-size": 10 }
    ]
}
```

A cell gives the dims of its positions band scales, its `width` and
`height` are the bands (`@x:bandwidth`, `@y:bandwidth`).

A histogram: the bars of the classes of a [bin](#transform) from their
start to their end on a continuous scale (with crisp edges, so neighbours
meet without a seam), or a `line` with `x0` and `x1`, stairs, its outline,
down to the base at the ends (`"ends": "open"` starts and ends it at its
first and last step, e.g. of shares):

```json
{
    "transform": { "type": "bin", "column": "value", "step": 10, "start": "lo", "end": "hi" },
    "dims": { "x": "value", "y": { "column": "count", "zero": true } },
    "marks": [
        { "type": "bar", "x0": "lo", "x1": "hi", "fill": "#4269D0" },
        { "type": "line", "x0": "lo", "x1": "hi", "stroke": "#333" }
    ]
}
```

Labels at the ends of lines, in the color of the line, moved apart:

```json
{ "marks": [{ "type": "line", "by": "land" }, { "type": "text", "by": "land", "select": { "max": "x" }, "dodge": 12, "dx": 4, "text": "@name" }] }
```

Labels inside the bands of an area mark, e.g. the names of the sources of
stacked areas: `"place": {"in": "areas"}` (the `id` of an `area` mark,
cartesian or polar) of a `text` or a `label` puts a label per group of the
mark (its text and font are the attributes of its first row) inside the
band of the area of the same categories, at the place with the most room:
its whole box (the width and the height of the text at its font size, the
halo and `padding`, 2 pixels by default) is between the edges of the band
over its width, on the curve of the area (e.g. `monotoneX`), as far as
possible from them; of the same room the one nearest to `near` (a value of
x, by default the middle of the positions of its rows). The positions are
the ones of the rows of the label (each the space to its neighbours), e.g.
a `filter` of x keeps the labels off the edges of the plot. The labels of
the least room are placed first, the others at their best places which do
not overlap them (`"overlap": true` lets them overlap). A label without
room is left out (`"fit": false` puts it at its best place nevertheless).
The labels follow the hidden categories, the controls and the width, the
texts are centered at their place, the mark has no `select`. Of polar
charts the box is checked at the angles of its points against the rings of
the areas. Known inconsistency: the room is measured with the text and font
of the first row of the group, but the label is drawn with the attributes
of the row nearest to its place, so a text or font which differs per row
(e.g. a value of the row) may not fit its box; give a group one text and
font.

```json
{
    "marks": [
        { "id": "areas", "type": "area", "by": "type", "stack": true, "curve": "monotoneX" },
        { "type": "label", "by": "type", "place": { "in": "areas" }, "halo": true,
          "filter": "=1 <= @x <= 22", "text": "@name", "font-size": 11, "font-weight": "bold" }
    ]
}
```

Examples `data/energy/electricity/generation-hourly-inside.json`,
`-radial.json` (polar) and `-overlap.json` (areas which are not stacked).

A text at a value of the vertical axis, at the end of the horizontal one,
of rows of the mark (`data`):

```json
{ "marks": { "type": "text", "data": [{ "y": "@target", "label": "Ziel" }], "x": "@x:scaled:max", "dy": -4, "text-anchor": "end", "text": "@label" } }
```

A small table per facet: a header `once` and a text mark per column whose
lines are the rows of the mark, `@row:index` is the place of a row among
them (from 0), e.g. the counts of the categories at the top right:

```json
{
    "marks": [
        { "type": "text", "once": true, "x": "@plot:right", "y": "@plot:top", "text": "n",
          "text-anchor": "end", "dominant-baseline": "hanging" },
        { "type": "text", "by": "regime", "filter": "@n != null", "x": "@plot:right", "y": "=@plot:top + 12 + @row:index * 11",
          "text": "@n:formatted", "text-anchor": "end", "dominant-baseline": "hanging" }
    ]
}
```

### The other keys of a mark

- `id`: the class and the `data-plot` of the group of the mark,
  `plot-<index>` by default, the marks of a parent are merged by their ids
  (if all of them have one), `place` and `before` name it.
- `by`: the rows are grouped by this dim or these dims, e.g. a line per
  category, the props of their categories are names of the attributes
  (`@color`, `@name`, ...). A dim without categories only groups the rows,
  e.g. a line per id, `by` does not make a dim categorical.
- `filter`: only the rows of the mark of an expression of the row or of the
  values of dims, see [`filter`](#filter), e.g. `{"level": "header"}` or
  `"@y != null"`, the references are also the names of the facet.
- `curve`: the interpolation of the paths and areas between their points,
  `linear` (default), `monotoneX`, `natural`, `catmullRom`, `basis`, `step`,
  `stepBefore` or `stepAfter`. `monotoneX` is smooth without overshooting the
  values, e.g. for monthly data, `basis` does not pass through the points.
  `linearClosed`, `catmullRomClosed` and `basisClosed` connect the last point
  with the first one, e.g. of radar charts.
- `data`: rows of the mark instead of the rows of the data, e.g. events or
  a target value. The rows have the names of the dims and others, e.g. a
  `label`, all of them are names of the attributes. The values of the dims
  are converted as the ones of the data, e.g. dates, and the values of the
  rows are expressions, e.g. references to globals. A row with a value of
  the dim of the facets is only in its facet. `data` can also be the url of
  a file of rows (`dataFormat` as the one of the definition), relative to
  the definition, its values are no expressions.
- `select`: one row of every group, of the rows with values of the dims of
  the attributes: `first` or `last` (in the order of the rows) or the one
  with the least or the most value of a dim, `{"min": "y"}` or `{"max":
  "x"}` (categories which are numbers by their value, e.g. `"10"` after
  `"9"`), e.g. labels at the ends of lines.
- `once`: one element per facet, of no row (no `data`, `by` or `filter`),
  its attributes are the names of the facet, e.g. a header or a unit label
  at the edges of the plot area, `{"type": "text", "once": true, "x":
  "@plot:left", "y": "=@plot:top - 6", "text": "in €"}`; the key and the
  name of the facet are `@facet` and `@facet:name`.
- `layer`: `below` draws the mark below the axes and grid lines, e.g. a
  background, `above` above the other marks, e.g. labels, by default the
  marks are drawn between them in their order. `before`: right before the
  mark of this id, in its layer.
- `facet`: a key or a list of keys of the facets of the mark, by default it
  is in all facets; of a grid also the values of the dims of its rows and
  columns, e.g. `{"group": "Bau"}`.
- `halo` (texts): a halo behind the texts in the color of
  `--gen-vis-halo-color`, `true` (3 pixels) or its width in pixels, e.g.
  labels on areas, the attributes of the mark replace its `stroke`,
  `stroke-width`, `paint-order` and `stroke-linejoin`.
- `place`, `fit`, `overlap`: of texts the labels inside the bands of an
  area mark (above), of maps the labels of the regions, see [maps](#maps).
- `ends` (lines of `x0` and `x1`): `base` or `open`, see the histogram
  above.
- `object`, `borders` (`mesh`): see [maps](#maps).

### Highlight and others

`highlight` of a mark are the attributes of the elements of the category
under the pointer (of the hover) or of the entry of the legend under the
pointer, e.g. `{"stroke-width": 3}`, `others` the attributes of the other
elements of the mark while an element is highlighted, also of marks without
categories, e.g. `"others": {"opacity": 0.3}` fades the others,
`{"visibility": "hidden"}` hides the label of the last value while the one
of another value is shown. `mode` of `highlight`: `group` (default)
highlights the elements of the category under the pointer, `row` only the
element of its row, e.g. the segment of a stacked bar, an entry of the
legend highlights all of its category. The values are expressions of the
props of the categories, e.g. `{"stroke-width": "@highlight-width"}`, so
every category has its own.

They are the rules of a stylesheet of the chart: the hover and the legends
give the elements of the highlight the class `vis-highlight` (their group
`vis-highlight-group` of the mode `row`) and the plots of the facet the
class `vis-highlighting`, the rules have the attributes of `highlight` of
`.vis-highlight` and the ones of `others` of the other elements of the
mark. So the attributes are css properties of svg: colors, `opacity`,
`fill-opacity`, `stroke-width`, `stroke-dasharray`, `r`, `visibility`,
..., not e.g. `dx` or the `d` of a path. The styles win over the
attributes of the elements, the attributes come back when the class goes.
A page can style the highlight itself, e.g. `.vis-highlight { filter:
drop-shadow(0 0 2px #0006) }`, see [styles](usage.md#styles), and the
prop `highlight` of a chart highlights the rows of another one, see
[linked charts](usage.md#linked-charts).

## Polar charts

With `"coord": "polar"` the marks are in a circle in the center of the
facet, the dim with the `angular` orientation (by default `x` or `angle`)
goes around it, clockwise from the top, the one with the `radial`
orientation (`y` or `radius`) from the center outwards, the margins are the
space of the labels, measured as the ones of cartesian charts:

```json
{
    "coord": "polar",
    "height": 400,
    "transform": [{ "type": "year", "column": "date", "as": "year" }, { "type": "align", "column": "date" }],
    "dims": {
        "x": { "column": "date", "format": "%b", "domain": ["2020-01-01", "2021-01-01"], "scale": { "type": "utc" }, "ticks": 12, "grid": true },
        "y": { "column": "value", "zero": true, "ticks": 4, "grid": true },
        "year": { "column": "year", "scheme": "Tableau10", "legend": {} }
    },
    "marks": { "type": "line", "by": "year" }
}
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
  of radar charts. The labels of radial axes are above the marks, with a
  halo (`--gen-vis-halo-color`, see [styles](usage.md#styles)), the `props` of the
  `labels` of an axis style them, as the ones of cartesian axes, a `stroke`
  and a `stroke-width` replace the halo, `domain` the line of the axis,
  `tickMarks` the tick marks (of angular axes), e.g. the values of a radial
  axis in the background and the circle and the marks of the angle in the
  color of the grid lines:
  ```json
  {
      "coord": "polar",
      "dims": {
          "x": { "column": "hour", "grid": true, "axis": {
              "position": "angular", "values": [0, 6, 12, 18],
              "domain": { "props": { "stroke": "var(--gen-vis-grid-color)", "stroke-width": 0.75 } },
              "tickMarks": { "props": { "stroke": "var(--gen-vis-grid-color)", "stroke-width": 0.75 } }
          } },
          "y": { "column": "value", "ticks": 3, "grid": true, "axis": {
              "position": "radial", "angle": 90,
              "labels": { "props": { "fill": "#777", "font-size": 10, "stroke-width": 2, "stroke-opacity": 0.5 } },
              "domain": { "props": { "stroke-opacity": 0.4 } }
          } }
      }
  }
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
- The mark types: `line` (a line per group, of `x` the angle and of `y` the
  radius), `area` (an area per group, from the inner radius or the stack
  below to `y`), `arc` (a segment of a ring per row, attributes `angle`,
  `innerRadius` and `outerRadius`, optional `width` in radians, `padAngle`
  and `cornerRadius`, e.g. the bars of a rose chart, or from `startAngle` to
  `endAngle` instead of `angle` and `width`, e.g. the slices of a pie),
  `point` and `text` (an element per row at the angle and the radius, texts
  with a `halo` and `dodge`, see [marks](#marks)). The angles of a band
  scale are in the center of the band. The `svg:` types draw with the
  center as origin, the cartesian types are cartesian only.
- Stacked values (`stack` of an area or an arc) are stacked from the
  center, of an arc of a `y` from the inner radius.
- The hover shows the values of the angle nearest to the pointer, also
  across the top, it is in the center, on the other side of the marker.

Pies and donuts are stacked angles: the arcs of the slices stack the values
of `x`, the dim of the angle, their values are the ones of the hover,
`innerRadius` leaves a hole:

```json
{
    "coord": "polar",
    "height": 360,
    "dims": {
        "x": { "column": "value", "axis": false, "hover": {} },
        "type": { "column": "type", "scheme": "Tableau10", "legend": {} }
    },
    "marks": { "type": "arc", "by": "type", "stack": true, "stroke": "white", "innerRadius": "@radius * 0.55", "highlight": { "opacity": 0.8 } }
}
```

The circle is the sum of the values. The hover shows the slice under the
pointer and the values of all slices, beside the slice. With a dim `y` of
the radius, e.g. a `band` scale of years, every ring is stacked by itself,
the slices are from `"innerRadius": "@y:scaled"` to `"outerRadius":
"@y:group:end"`, the hover shows the ring under the pointer, the circle is
the largest sum, a `share` transform by year closes every ring.

See `data/bev/def-radar.json`, `data/rechtsform/def-rose.json` and
`data/rechtsform/def-pie.json`.

## Maps

With `"coord": "geo"` the marks are a map, `geo` is its geometry and the
dim (`join`) whose values are the keys of the features:

```json
{
    "coord": "geo",
    "height": 480,
    "geo": {
        "data": "../geo/europe.json",
        "key": "id",
        "join": "country",
        "fit": "data",
        "projection": { "type": "azimuthalEqualArea", "rotate": [-10, -52] }
    },
    "globals": { "type": "euroSuper95" },
    "filter": { "type": "@globals.type" },
    "dims": {
        "country": "country",
        "type": "variable",
        "price": {
            "name": "€/Liter", "column": "value",
            "scale": { "type": "sequential", "interpolator": "YlOrRd" },
            "legend": { "format": ",.1f" }, "hover": { "format": "$,.3f" }
        }
    },
    "marks": [
        { "type": "base", "fill": "#EEE", "stroke": "white" },
        { "type": "region", "by": "country", "fill": "price", "highlight": { "stroke": "#333" } }
    ]
}
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
- The mark types (`region` is `geo:region` of maps, they have no default
  attributes): `base` (all features, e.g. as background, the attributes are
  fixed), `region` (the feature of every row), `point` and `text` (an
  element per row at the center of its feature or at `lon` and `lat`, the
  channels of the dims of its longitude and latitude, e.g. proportional
  circles with a `sqrt` scale of `r`) and `mesh` (the borders of an object
  of TopoJSON as one path, every border once, the attributes are fixed). A
  map has no margins by default.
- The labels of `text` are at the pole of inaccessibility of the largest
  polygon of their feature, the point farthest from its edges, also in long
  or bent countries (`"place": "centroid"`: the center as `point`).
  `"fit": true` shows only the labels which fit into the area around their
  pole (not of `"place": "centroid"`, which has none), `"overlap": false`
  leaves out the ones which overlap the label of a larger area, so a map
  needs no list of the labels: e.g. all zones, `{"type": "text", "by":
  "country", "fit": true, "overlap": false, "text": "@label:formatted"}`.
  The sizes of the labels are estimated of their characters and their
  `font-size` (11 by default).
- `mesh` draws the borders of `object`, by default the one of the
  features (without the ones left out by `include` and `exclude`), e.g. the
  states above their districts, `borders` are all of them (`all`, default),
  the ones between two features (`inner`) or the outline (`outer`). The
  objects share the arcs of the topology, so the borders are the same lines:
  ```json
  {
      "coord": "geo",
      "geo": { "data": "../geo/austria-districts.json", "object": "districts", "join": "district" },
      "dims": { "district": "district", "value": { "column": "value", "scale": { "type": "sequential", "interpolator": "Blues" } } },
      "marks": [
          { "type": "region", "by": "district", "fill": "value", "stroke": "white", "stroke-width": 0.5 },
          { "type": "mesh", "object": "states", "borders": "inner", "stroke": "white", "stroke-width": 1.5 }
      ]
  }
  ```
- The hover shows the region under the pointer: its name (the `name` of the
  props of the `join` dim, of the feature or the key) and the rows of it
  with the values of the first numeric dim with a `hover`, the region is
  highlighted.
- One row per region is usually shown, `filter` or facets select them, e.g.
  a map per fuel type.

See `data/bev/def-map.json`, `data/sprit-nuts/def-map.json` and the maps of
`data/energy/`. The geometries of `data/geo/` are of Eurostat (GISCO), see
`data/geo/README.md`.

## Annotations

`annotations` (an annotation or a list) are bands, lines, texts and circles
at values of dims, e.g. estimated values or events, the keys are the
names of the dims, a value or a range `[from, to]`, values are converted
as the ones of the rows, e.g. dates or categories as strings (`"x": 2020` is
the category `"2020"` of every format of the data), and can be references to
globals, e.g. `"@target"`:

```json
{
    "annotations": [
        { "type": "band", "x": ["2025-07-01", null], "label": "Schätzung" },
        { "type": "line", "y": 0, "props": { "stroke": "#999", "stroke-dasharray": "3 3" } },
        { "type": "text", "x": "2020-03-16", "y": 30, "text": "Lockdown" },
        { "type": "circle", "x": "2022-02-24", "y": 1.8, "above": true }
    ]
}
```

- `band`: a rectangle, a dim without value is over the whole plot area,
  e.g. a band of the horizontal axis has the height of the plot area, `null`
  in a range is the edge of the domain, a category of a `band` or `point`
  scale is its band, `label` is its name.
- `line`: a value of the horizontal axis is a vertical line, of the vertical
  one a horizontal line, with a `label` at its end. The line is at the
  position of the tick of its value, like the axes at the half pixel on
  screens of one pixel per CSS pixel, so it is as sharp as them and on the
  tick, e.g. a zero line, without `"shape-rendering": "crispEdges"`.
- `text` (`text`) and `circle` at the values, without one (or with `null`)
  of an axis at the start of the other one.
- `label` and `text` are templates of the globals, e.g. `"Ziel {target}"`.
- `props` are svg attributes, e.g. `fill` or `stroke`, the defaults are grey,
  their names are the ones of the facet and of the annotation, e.g. `@y`,
  `above` (or `"layer": "above"`) draws the annotation above the marks, by
  default it is below the marks and grid lines (`"layer": "below"`), labels
  are above them; `"before": "<mark id>"` draws it right before that mark,
  in its layer, e.g. cap lines above the bars and points but below the
  labels whose `halo` cuts them. `legend` is the name of the annotation in
  the legend (a template of the globals), e.g. `{"type": "line", "x":
  "2025-07-22", "legend": "SchwellenwerteVO 2025"}`: an entry per name with
  a symbol of the annotation (a vertical line of a line at a value of a
  horizontal scale, a horizontal line of one of a vertical scale, a box of a
  band, a dot of a circle, with its props and classes, in the box of the
  [defaults](#defaults) of the line), after the legends of the dims at
  the position of the first one (`.vis-legend-annotations`, the entries are
  no toggles). `facet` is a key or a list of
  keys of the facets of the annotation, by default it is in all facets.
- Polar charts: a `band` of the angle is a sector (also across the top, e.g.
  from November to February), of the radius a ring, a `line` of the angle a
  spoke, of the radius a circle. Maps: `text` and `circle` at `lon` and `lat`.
- The classes are `vis-annotation` and `vis-band`, `vis-line`, `vis-text` or
  `vis-circle`, the labels `vis-annotation-label`, see [styles](usage.md#styles).

`annotations` can also be an expression of a global, e.g. none of a value
of a control: `"=match(@source, {nuclear: literal([])}, literal([{type:
'line', x: 0.5, label: 'half'}]))"`.

An annotation is a mark of the type `annotation:band`, `annotation:line`,
`annotation:text` or `annotation:circle` of a row of its values (the mark
`annotation-<index>`, in the layer `below` or `above`). These types draw an
annotation per row, so the annotations can also be rows of data, e.g. a file
of events, the attributes can have the names of the rows:

```json
{ "marks": { "type": "annotation:line", "data": "events.json", "stroke": "@color" } }
```

See `data/sprit-nuts/def.json`, `data/rechtsform/def-stacked-p.json` and
`data/energy/weather/temperature-polar.json`.

## `hover`

The hover shows the rows of the position under the pointer: of the
vertical axis at the horizontal position of the pointer, of horizontal bars
(a horizontal dim is stacked, or the vertical one is categorical and the
horizontal one is not) the values of the horizontal axis at the vertical
position. Of several dims of an orientation, e.g. a second vertical axis,
the stacked one or the one with a `hover` (or the first one) has the values
of the hover, the other numeric ones with a `hover` are further columns.
On touch devices it is shown by a tap and stays until a tap outside of the
plot, horizontal swipes move it, vertical ones scroll the page.

- `columns`: the dims of the hover, by default the dims the marks use,
  their `by` and the dims of their positions (`x`, `y`, `y1`, ... of the
  channels; not the dims of the facets, their panels have titles); a dim
  with a `hover` of its own is in it as well, `[]` only those. The columns
  are in the order of the dims.
  ```json
  { "hover": { "columns": ["land", "unit"] } }
  ```
- `total`: a row of the sum of the stacked values of the position below the
  rows (`true`: the name of the locale, `Gesamt` of `de`, `Total` of `en`,
  `texts.total` of a locale of the definition, or a name, e.g. `"Summe"`),
  in the format of the values, `vis-hover-total` with a line above it, also
  `{total}` of the `title`.
- `mode`: `"point"` shows the row of the point nearest to the pointer
  (within `radius` pixels, 30 by default) instead of the rows of the
  nearest position of the axis (`"position"`, the default), e.g. of a
  scatter plot or a heatmap, in cartesian and polar charts.
- `filter`: the rows with a hover, an expression of the row or the values
  of dims as the ones of [`filter`](#filter), e.g. `{"level": "item"}`. A
  position without rows has no hover, e.g. a region of a map without a
  value, the hover is at the nearest position with rows, `"empty": true`
  shows it, e.g. the name of every region.
- `title` and `row`: templates of HTML of the hover, `title` with
  `{title}`, the default one, e.g. the date, above the table or the rows,
  and `row`, a line per row instead of the table, with `{land}` (the name
  of the category of the dim `land`), `{land.unit}` (another hover prop),
  `{y}` (the formatted value) and `{y.value}` (the value). Both have the
  globals, the title also the names of the nearest row (or the first one),
  e.g. the definition of a category of the position, `{definition}` of a
  dim `definition` with a hover and props, the values are text, e.g. `<` of
  the data is shown as it is:
  ```json
  { "hover": { "title": "<b>{title}</b>", "row": "{land}: {y} <small>{land.unit}</small>" } }
  ```
  The slot `hover` of a page replaces them, see [events and
  slots](usage.md#events-and-slots).
- `box`: `false` leaves out the box of the hover, the highlight of its
  elements (see [highlight](#highlight-and-others)) and the events stay,
  e.g. a larger circle with its value as the hover of a row of bars.
- `marker`: `false` leaves out the line of the position.
- `position`: the hover is beside the marker of the position, of a map the
  center of the region (`marker`, the default), or at the pointer
  (`pointer`, it moves with it, by the keyboard it is at the marker).
- `side`: `left`, `right`, `above` or `below` of the position, by default
  the side with more space, or on it (`center`), e.g. in the center of a
  polar chart, and `offset`, `[x, y]` in pixels, e.g. `"side": "above",
  "offset": [0, -10]` of a text above a region of a map, `null` is 0.
- `area`: the hover of the plot area (`plot`, the default) or of the facet
  with its margins (`facet`), e.g. the labels of the rows of horizontal bars
  are part of the row, a click on them is a `select` of the row.

The part of every dim in the hover (its format, its columns, the styles of
its rows) is the [`hover` of the dim](#the-hover-of-a-dim).

## `highlight`

`highlight` of the top level has the `transition` of the highlights, the
attributes move to the ones of the highlight in this many milliseconds,
e.g. `{"transition": 50}` (a css transition, none if the user prefers less
motion). The attributes of the highlight are the ones of the marks, see
[highlight and others](#highlight-and-others).

## `facets`

A plot for every category of the dim `by`, in `cols` columns (1 by
default); the dim of the facets has the categories of the data in the
order of the rows, unless it lists them. `cols` can be an expression of
`totalWidth`, e.g. `"=steps(@totalWidth, {0: 1, 600: 2})"`. `scales`: every
facet has its own scales (`"own"`, the default), all facets share the
scales of their dims (`"shared"`), or a list of the dims which share their
scale, e.g. `["x"]`, also an expression of a global, e.g. of a control of
shared or separate scales:

```json
{
    "dims": { "x": "date", "y": "value", "region": { "column": "region", "categories": { "AT": { "name": "Österreich" }, "DE": { "name": "Deutschland" } } } },
    "facets": { "by": "region", "cols": 2, "scales": ["x"] }
}
```

`"axisTitles": "outer"` draws the titles of the axes only at the outer
facets: of the bottom axis in the bottom row (the facets without one
below), of the left axis in the first column, of the right one in the last
column, of the top one in the first row (`"all"`, in every facet, by
default). `title.props` are CSS properties of the titles, e.g.
`{"font-weight": "normal", "text-align": "center"}`, of the props of the
category of the facet (e.g. `@color`), `@facet:name` and the globals, so a
definition looks the same everywhere without a style of the page. The
title of a facet (`vis-facet-title`) spans its plot area, it has the
margins of the facet (the css variables `--gen-vis-margin-left` and
`--gen-vis-margin-right` of its style), so a title centered by the page,
`.vis-facet-title { text-align: center }`, is above the center of the plot
area, the ones of polar charts are centered (`vis-facet-title-center`), a
style of the page replaces both, e.g. its `margin-left`.

A grid of facets of two dims, with a header per column and per row, e.g.
the contract types in the columns and the value bands in the rows:

```json
{
    "dims": {
        "group": { "column": "contract_group", "categories": { "Bau": { "name": "Bauaufträge" }, "Liefer/DL": {} } },
        "band": { "column": "value_band", "categories": { "50–100k": { "name": "50.000–100.000 €" }, "100–140k": {} } }
    },
    "facets": { "by": { "cols": "group", "rows": "band" }, "scales": { "x": "all", "y": "row" }, "rowHeaders": "left" }
}
```

`by` of `cols` and `rows` are dims with categories, one of them alone is
one row or one column. The cells are in the order of the categories of the
two dims, the ones with rows; a combination without rows is an empty box
of the size of a facet (`.vis-facet-empty`, without axes). The names of the
columns are the titles above the first row (`.vis-facet-title
.vis-facet-col-title`), the names of the rows are the headers beside them
(`.vis-facet-row-title`): `"rowHeaders": "right"` (the default) vertical
right of the last column (an svg, also in the export, downwards), `"left"`
horizontal left of the first column, in a column of the width of the
longest one (at most 40% of the width, the facets have the rest), or the
side and the direction, `{"side": "left", "vertical": true}` (upwards, as a
title of an axis) or `{"side": "right", "vertical": false}`; the classes
`vis-facet-row-title-left` or `-right` and `-vertical` or `-horizontal`.
All have the `title.props` of the facets, of the props of the category of
the column or the row. `scales` of a grid is also an object of the dims and
`"all"`, `"row"` (a scale per row, e.g. of `y`) or `"col"` (per column,
e.g. of `x`); the labels of the ticks of a scale of all facets or of the
row (of `y`) or of the column (of `x`) are only at the outer facets, e.g.
of `y` in the first column. The names of a facet of a grid are also
`@facet:row`, `@facet:col`, `@facet:row:name` and `@facet:col:name`; the
`facet` of a mark or an annotation is a key or the values of the dims of
the rows and columns, e.g. `{"group": "Bau"}` (a column), `{"band":
"50–100k"}` (a row) or both (a cell). `axisTitles` works as in other
facets, e.g. `"outer"`.

## `filter`

`filter` shows only the rows of an expression of the row: its names are
the dims (the values of the row), then the columns of the data (also of the
transforms) and the globals, e.g. `"@year == @globals.year and @value >
0"`. Dates compare as the texts of the data, e.g. `"@date >=
'2020-01-01'"`. A dim of the same name as a global shadows it,
`@globals.<name>` is the global.

An object is the shorthand of conditions of the values of dims, every
condition holds: a value or a list of values, e.g. of a global, `null` (the
rows without a value), the keys are names of dims, not columns (a key of no
dim matches no row and is named in a warning of the console), the values
are compared as the ones of the rows, e.g. dates, categories as strings and
the ones which are numbers by their value:

```json
{ "filter": { "year": "@globals.year", "land": ["Wien", "Tirol"] } }
```

is `"@year == @globals.year and (@land == 'Wien' or @land == 'Tirol')"`.
The objects of a parent and a child are merged, an expression replaces the
filter of the parent, `null` removes it. (The conditions `{"not": ...}` and
`{"range": [from, to]}` of 4.x are still read, an expression says the same,
e.g. `"@type != 'load'"` or `"=2000 <= @year <= 2020"`.)

The same expressions and objects are the `filter` of a mark (its rows),
of the hover (`hover.filter`, the rows with a hover) and the `stack` of a
mark (the rows which are stacked). The scales are the ones of the filtered
rows, `domainIgnores` of a [scale](#scales) keeps one of all values of a
condition, e.g. `"scale": {"domainIgnores": ["year"]}` of the same y-axis
for all years. The transforms are computed before the filter.

## Globals and controls

`globals` are values which the controls and the page change, with their
defaults, e.g. the year of a slider, the column of a radio button or the
language of a menu of the page. A control changes a global, as radio
buttons (`"type": "radio"`), a drop down list (`"type": "select"`) or a
slider over the entries (`"type": "slider"`, e.g. of years, the
visualisation changes while it is moved); every part of the definition can
be an expression of the globals:

```json
{
    "globals": { "year": "2025", "unit": "twh" },
    "controls": [
        { "type": "select", "global": "year", "name": "Jahr", "values": ["2024", "2025"] },
        { "type": "radio", "global": "unit", "name": "Einheit",
          "values": [{ "value": "twh", "name": "TWh" }, { "value": "pj", "name": "PJ" }] }
    ],
    "filter": { "year": "@globals.year" },
    "subtitle": "in {unit:name}",
    "dims": {
        "year": "year",
        "y": { "column": "{unit}", "format": "=match(@unit, {pj: ',.0f'}, ',.1f')" }
    }
}
```

- `type`: `radio`, `select`, `slider` or `hidden`. A hidden control has no
  element, its global is set by the page (the prop `globals`), e.g. the
  language or the year of a menu of the page, with the `globals` of its
  entries, it is not part of the state of the user. The page can also set
  globals without a control, e.g. a text; the globals of the selected
  entries override them.
- `global`: the global the control sets.
- `name`: the label of the control.
- `values`: the entries, a list of values (`["2024", "2025"]`, a value is
  also its name and id) or of entries `{"value", "name", "id"}` (`name` and
  `id` are the value by default); or the distinct values of a column of the
  data, in ascending order (numbers by their value), named as the values
  (`format` formats the names in the locale, of dates a time format, e.g.
  `"%b %Y"` of `2026-10` as `Okt 2026` or `"%K. Halbjahr %Y"`, a number
  format otherwise; `names` is a column of the names, the one of the first
  row of a value, e.g. `{"column": "month", "names": "monthName"}`),
  strings as the ones of CSV of every format of the data (also the globals
  and the state of them), so new values of the data are added, e.g. a new
  year. If the global is none of them, e.g. it is missing, it is the last
  one:
  ```json
  {
      "filter": { "year": "@globals.year" },
      "controls": [{ "type": "slider", "global": "year", "name": "Jahr", "values": { "column": "year" } }]
  }
  ```
- `globals` of an entry are set when it is selected, e.g. texts of other
  globals or the global of another control, whose entry follows. The other
  fields of an entry are names while it is selected: `{group:name}` of the
  templates and `@group:name` of the expressions is the field `name` of the
  entry selected of the global `group` (its `name`, `id`, `value` or another
  one), e.g. `"title": "Relative to {group:name}"`.
- `inImage`: the selected entries are named below the subtitle of the
  [PNG](usage.md#png), `false` leaves out a control which only changes the
  presentation, which the image shows anyway, e.g. shared or separate scales
  of the facets.
- `id`: the id of the control, of `data-id` of its element and of the merge
  with the controls of a parent (the global by default). The controls of a
  parent and its children are merged by their `id` (if all of them have
  one, otherwise by their `global`), their entries by their `id` (otherwise
  by their `value`), so a child may give only the ids of the control and of
  the entries it changes, e.g. another name:
  ```json
  { "controls": [{ "id": "values", "values": [{ "id": "valuesAbs", "name": "Anzahl" }] }] }
  ```

### Expressions of the globals

An expression whose names are all globals (or fields of the selected
entries, `@year:name`) is evaluated before the definition is read, with
the globals of the state, at any place of the definition: a column, a type
of a scale, a coordinate system, a part of a dim, the marks (the schema of
the editors knows expressions only at the places of values; at a name of a
fixed list, e.g. `"scale": {"type": "=match(@scale, {log: 'log'},
'linear')"}`, an editor marks it, the chart and `check` take it). `match` of a
global chooses a value per entry, the last argument is the value of the
other entries:

```json
{
    "globals": { "values": "abs" },
    "controls": [{ "type": "radio", "global": "values", "name": "Werte",
                   "values": [{ "value": "abs", "name": "Absolut" }, { "value": "share", "name": "Anteil" }] }],
    "dims": {
        "y": {
            "column": "=match(@values, {share: 'value.share'}, 'value')",
            "domain": "=match(@values, {share: literal([0, 1])}, literal([0, null]))",
            "axis": { "format": "=match(@values, {share: '.0%'}, ',.0f')" }
        }
    }
}
```

A part which is an object or a list is a `literal` in the expression, so it
is not evaluated itself, e.g. the domain above, or other marks of a
control of the kind of the chart:

```json
{
    "globals": { "kind": "lines" },
    "dims": { "x": "year", "y": "value", "land": { "column": "land", "legend": {} } },
    "marks": "=match(@kind, {bars: literal([{type: 'bar', by: 'land', dodge: true}])}, literal([{type: 'line', by: 'land'}]))"
}
```

- An expression of the globals without a value (`null`, e.g. a `match`
  without a case of the value and without a default) leaves the key out (an
  expression of the string syntax; an object of an operator is `null`, which
  the options and the parts of dims read as none):
  `"title": "=match(@lang, {en: 'Population'})"` has no title in German.
  A `match` of a global without a default is a switch over the value of
  the other parts of the definition (see [parents and
  mixins](#parents-and-mixins)): `"column": "=match(@values, {share:
  'value.share'})"` of a mixin over `"column": "value"` of a parent or a
  child is `value.share` for the share and `value` otherwise; only without
  a value anywhere the key is left out.
- Expressions of the rows, the categories or the sizes (e.g. `@x`,
  `@color`, `@innerWidth`, `@totalWidth`) are evaluated when they are
  drawn, at the places which have such names, see [names](#names); a part
  of an expression of the globals in them is evaluated with them.
- A change of a global evaluates the definition again, only the parts which
  change are prepared again, the entries of the legends of the same
  categories keep their state. The definitions of all values of the
  controls are known at the load, e.g. the coordinate system and the maps
  of every value are loaded with the definition, and `check` checks each of
  them.
- `@globals.<name>` is the global also where a dim of the same name
  shadows it, e.g. in a filter of a dim `year` and a global `year`.

### Templates

`{name}` in a text is the value of the global (unknown globals are kept and
reported as warnings), `{group:name}` a field of the entry selected. All
texts of a definition are templates: the title, the subtitle and the source,
the names of the dims and of their categories (e.g. of the legends, the
hover and the facets), the titles of the axes, the labels and texts of
annotations, `class`, the templates of the hover, the strings of the
transforms (not the url of a lookup), e.g. `"subtitle": "Durchschnitt {base}
= 100"`. The `column` of a dim is a template too, e.g. the values and their
shares in the columns `twh`, `co2`, `twh.share` and `co2.share` of two
controls:

```json
{
    "globals": { "values": "twh", "share": "" },
    "controls": [
        { "type": "radio", "global": "values", "name": "Werte", "values": [{ "value": "twh", "name": "TWh" }, { "value": "co2", "name": "CO₂" }] },
        { "type": "radio", "global": "share", "name": "Darstellung", "values": [{ "value": "", "name": "Absolut", "id": "abs" }, { "value": ".share", "name": "Anteil", "id": "rel" }] }
    ],
    "dims": { "y": { "column": "{values}{share}", "axis": { "format": "=match(@share, {'.share': '.0%'}, ',.0f')" } } }
}
```

## Expressions

Most values of a definition are expressions, close to
[JSON Logic](https://jsonlogic.com/), also the `expr` of the transforms
`calc` and `filter`, see `spec/expressions.md` (the rules for other
languages):

- values, e.g. `3`, `"none"` or `null`, and lists of expressions;
- references `"@name"`, see [names](#names), also `{"var": "name"}`,
  `{"var": ["name", 0]}` is `0` if the name is unknown;
- an operator, an object of exactly one key, the operator, and its
  arguments (a list, or one of them), e.g. `{"*": ["@innerWidth", 0.5]}`;
- the same as a text, the string syntax: a text starting with `=` is an
  expression, e.g. `"=@innerWidth * 0.5"`, `"=max(@a, 0)"` or `"=@value >
  0 ? 'up' : 'down'"`, a text starting with `@` too, e.g. `"@x:scaled +
  4"`, a text which is only a reference is the reference, e.g. `"@name"`.

The operators and their string syntax:

| Operator | String syntax | Value |
|----------|---------------|-------|
| `+`, `-`, `*`, `/` | `a + b`, `a - b`, `-a`, `a * b`, `a / b` | the sum, the difference (of one argument its negation), the product, the quotient; no value if a value is no number (also a text of the data which is no decimal number) or of a division by 0 |
| `min`, `max`, `round` | `min(a, b)`, `max(a, b)`, `round(a, digits)` | the least, the largest value, the value rounded to digits (0 by default), halves up |
| `==`, `!=` | `a == b`, `a != b` | the same as texts, e.g. `2024` and `"2024"`, missing values are the same, e.g. `null` and `""` |
| `<`, `<=`, `>`, `>=` | `a < b`, `0 < @x < 10` | numbers by their value, otherwise texts, false of a missing value, also of `""`, more values are a chain |
| `and`, `or`, `not` | `a and b`, `a or b`, `not a` | the first false value, the first true value (e.g. a default `@color or 'black'`), the negation |
| `if` | `c ? a : b`, `if(c, a, c2, b, d)` | the value of the first true condition, otherwise the last one |
| `cat` | `cat(@name, ': ', @y)` | the values as a text |
| `format` | `format(@y, ',.1f')`, `format(@x, '%b %Y')` | a value as a text of a d3 format in the locale, of a date dim a time format |
| `steps` | `steps(@totalWidth, {0: 220, 550: 250})` | the value of the largest cut below the value |
| `match` | `match(@level, {header: 4.5, item: @r}, 0)` | the value of the case of a value (as a text), otherwise (also of a missing value) the default (no value without one) |
| `literal` | `literal([1, 2])`, `literal('@a')` | a value which is not evaluated, e.g. an object or a text starting with `@` |

Texts in the string syntax are quoted with `'` or `"`, a quoted text
starting with `@` is a text, not a reference; objects are `{key: value}`,
lists `[a, b]`. The texts of names are no expressions: a `column`,
`columns`, `key`, `as`, `data`, `parent` and `$schema` starting with `@` is
the name itself, e.g. a column `@x` (a `column` starting with `=` is an
expression of the globals). Other texts starting with `@` or `=` which are
no expressions are an error which names their place; a text which starts
with `@` but is no reference is written `"=literal('@a b')"`.

An object of one key which is an operator is an operator at the places of
expressions: the attributes of marks, annotations and `props` (also
`highlight` and `others`), `height`, `margins`, `message`, `filter`, `stack`,
`expr`, the parts of scales and axes which are values (`domain`, `include`,
`range`, `ticks`, `values`, ...), `cols` and `scales` of facets; elsewhere it
is a part, e.g. `{"format": ".1f"}` of a hover. The string syntax is an
expression everywhere. Other objects are nested props, e.g. `d` of a path,
see `spec/expressions.md`. A reference to an unknown name has no value,
`validateDef` warns of it.

### Names

The names of the references depend on the part of the definition, the inner
parts add names:

| Part | Names |
|------|-------|
| everywhere | the `globals` (also as `globals.<name>`), the fields of the selected entries of the controls (`year:name`) and `totalWidth`, the width of the visualisation |
| `height`, `margins`, `message`, `facets.cols`, `facets.scales`, `filter` | only these, `filter` also the values of the row (see [filter](#filter)) |
| the `props` of `legend` (also of the `symbol`) and `hover` of a dim | the props of its categories, e.g. `@color` and `@name` |
| `axis.ticks`, `axis.values`, `scale.domain`, the values and `props` of annotations, the values of the `data` of a mark | the size of the facet: `width`, `innerWidth`, `height`, `innerHeight` (of facets also its key `facet` and its name `facet:name`, of a grid the keys and the names of its row and its column, `facet:row`, `facet:col`, `facet:row:name`, `facet:col:name`; `width` and `height` with the margins, the others of the plot area), the edges and the size of the plot area in the coordinates of the marks: `plot:left`, `plot:top`, `plot:right`, `plot:bottom` (e.g. a line from the top to the bottom of the plot area, `"y1": "@plot:top", "y2": "@plot:bottom"`, around the center of polar charts), `plot:width`, `plot:height`, of polar charts `radius` (e.g. of the hole of a donut), the sizes of the band and point scales, e.g. `y:bandwidth` and `y:step` |
| `scale.range` | the sizes of the coordinate system, e.g. `@radius` of polar charts; `width` and `height` are the ones of the plot area here (`plot:width`, `plot:height`), not the ones of the facet with its margins |
| `facets.title.props` | the names of the facet (`facet`, `facet:name`) and the props of its category, of a grid the one of the column (or of the row of the headers of the rows), e.g. `@color` |
| the attributes of a mark | the names of the facet above, the props of its categories, the place of the row among the rows of the mark in the facet (`row:index`, from 0, unless a dim is named `row`) and the values of the row, see below |

The values of a row of a dim `x`:

| Name | |
|------|-|
| `@x` | the value |
| `@x:formatted` | the value as a text of the format of its hover, e.g. `1.234,5`, a label |
| `@x:scaled` | the position of the value; of a date dim with an `interval` the middle of the period of the row |
| `@x:scaled:center` | the center of the band of a category; of an `interval` the middle of the period |
| `@x:scaled:start`, `@x:scaled:end` | of an `interval` the start and the end of the period of the row |
| `@x:scaled:0`, `@x:scaled:100` | the position of a value, e.g. of 0 |
| `@x:scaled:min`, `@x:scaled:max` | the position of the start and the end of the domain |
| `@x:bandwidth`, `@x:step` | the size of a band and the distance of the categories, of an `interval` the pixels of the period of the row |
| `@x:group:start`, `@x:group:end` | the extent of the group of the row, see `groups` of [scales](#scales) |
| `@x:index`, `@x:count` | the place of the category of the row among the visible categories of the dim (from 0) and their number, of a dim without categories the distinct values of the rows of the mark, e.g. of dodged bars |
| `@y:start`, `@y:end`, `@y:mid` | of a stacked value its start, its end and its middle |
| `@y:start:scaled`, `@y:end:scaled`, `@y:mid:scaled`, `@y:height:scaled` | their positions and the difference, e.g. the height of a `rect` |

Other names of a row of the `data` of a mark are its keys, e.g. `@label`.
Inner names replace outer ones, in a mark the dims replace globals of the
same name, e.g. `@year` is the one of the row, `@globals.year` the global.

## Migration from 4.x

The language of 5.0 says the same as the one of 4.x with fewer keys: the
options are keys of the top level, the mappings are dims with shorthands of
their scale and axis, the plots are marks whose channels name dims instead
of props of scaled positions, the form elements are controls of globals and
their patches are expressions of the globals. The engine reads the same
form as before, a definition of 5.0 is translated into it (see
[design-5.0.md](design-5.0.md)), so a migrated chart is drawn as before.

| 4.x | 5.0 |
|-----|-----|
| `"options": {"title": ..., "height": ...}` | `"title": ..., "height": ...` at the top level |
| `options.footer` | `source` |
| `mapping` | `dims` |
| `"domain": [0, null]` | `"zero": true` |
| `"axis": {"grid": true}`, `"axis": {"ticks": 5}` | `"grid": true`, `"ticks": 5` (the axis parts stay valid) |
| `"scale": {"domainRel": [-0.1, 0.1]}` | `"scale": {"pad": [0.1, 0.1]}` (`pad` of the dim too) |
| `"categories": {"Wien": {"color": "#C3423F"}}` | `"categories": {"Wien": "#C3423F"}` (both are valid) |
| `"fromData": true` of a dim with a legend | the categories of the data by default (in the order of the rows); listed categories are all of them, `fromData` adds the others |
| a legend without a `symbol`: names only | `"symbol": "auto"` by default, the symbols of the marks; `"symbol": null` for none |
| `plot` | `marks` |
| `"props": {"stroke-width": 2}` | `"stroke-width": 2` beside the type |
| `"props": {"cx": "@x:scaled", "cy": "@y:scaled"}` | the default channels `x` and `y`, or `"x": "lo"` of another dim |
| `"props": {"y1": "@hi:scaled"}` with `"hi": {"scale": {"of": "y"}}` | `"y1": "hi"` (the scale of the axis is set) |
| `"stacked": true` of a dim and `"y0": "@y:start:scaled", "y1": "@y:end:scaled"` | `"stack": true` of the mark |
| `"type": "svg:text"` with `"y": "@y:scaled:center", "dominant-baseline": "middle"` | `"type": "label"`, `"anchor": "end"` |
| grouped bars by hand | `"dodge": true` |
| `formElements` with `ref` | `controls` with `global` |
| `patch` of an entry | expressions of the global at the patched places, e.g. `"=match(@scale, {log: 'log'}, 'linear')"` |
| `filter` conditions with `not` and `range` | expressions, e.g. `"@type != 'load'"`; an object of values stays |
| `{"*": ["@innerWidth", 0.5]}` | `"=@innerWidth * 0.5"` (the object stays valid) |
| `"hover": {}` of the dims of the plots' `by` | the default; `hover.columns` lists the dims of the hover |
| `facets.dim` | `facets.by` |
| `facets.cols` and `rows` of the dims of a grid | `"by": {"cols": ..., "rows": ...}` |
| `"scales": []` of facets | `"own"` (the default), `"shared"` all dims |
| margins of 0 by default | measured by default |

Removed (their replacements are above): `options`, `mapping`,
`plot` and the `props` of a plot, `formElements`, `patch`, `domainRel`.
Kept for the rare case: `stacked` and `stackBy` of a dim (values stacked
by no mark, e.g. of a histogram of a bin), `scale.of`, `domainAbs`,
`domainIgnores`, `once`, `place`, `dataFormat`, `width`, the conditions
`not` and `range` of filters.

`gen-vis migrate` writes definitions of 4.x as ones of 5.0, to the
standard output, with `--write` into the files themselves:

```sh
npx gen-vis migrate data/energy/_years.json data/energy/mobility/*.json --write
```

A child is migrated with its parents merged, the files are read before any
of them is written, so give a directory's parents and children in one call;
a part which has no keys of 4.x (e.g. a parent of only `data` or `geo`)
stays as it is, its `$schema` too (the one of 4 is accepted, change it by
hand). The migration keeps the chart as it was:

- The margins of the definition stay, remove them to have them measured.
- A definition whose marks are by a dim without a `hover` gets
  `"hover": {"columns": []}`, the hover of 4.x had only the dims with a
  `hover`; remove it for the dims of `by` in the hover.
- A legend without a symbol gets `"symbol": null`, remove it for the
  symbols of the marks.
- A dim with `fromData: true` keeps it (ascending order).
- A reference of a condition of a filter is written `@globals.<name>`,
  4.x read the globals there.
- The objects of expressions are written in the string syntax where it has
  a text of them.

To check by hand:

- **Patches of parts of a parent.** A patch becomes a `match` of the
  global at the leaf it changes, without a default if the part has no
  value of the leaf: a switch over the value of the other parts, which
  applies after the merge as the patch did (see [parents and
  mixins](#parents-and-mixins)). A mixin which switches the column of `y`
  reads `"column": "=match(@values, {share: 'value.share'})"`, a child
  which gives `"column": "value"` keeps it. Two mixins which patch the
  same leaf by the same global merge their cases; by different globals the
  later one is the switch over the earlier one, a child's value is the
  default of the innermost one, so both apply.
- **Patches of whole parts.** A patch of the plots, the annotations or the
  filter is a `match` of the whole list or filter (the marks of every value
  in it), shorten it by hand if only an attribute differs.
- **Types of dims.** A dim with a legend gets the categories of the data
  and is categorical, a dim only used as `by` is not, as in 4.x.

A definition of 4.x which is loaded (by its keys, also with the `$schema`
of 4) is migrated while it is loaded, with a notice in the console
(`a definition of gen-vis 4, migrated while it is loaded`), so pages keep
working until their files are migrated. `@preschen/gen-vis/check` exports
`migrate(def, {parents})` and `formatJson(def)` of a script of its own, see
[checks outside the browser](extensions.md#checks-outside-the-browser).
