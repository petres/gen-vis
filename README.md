# gen-vis

A declarative d3 visualisation library: a chart is described by a JSON
definition (the *def*) and a data file (CSV, TSV, JSON or parquet). Line,
point, bar, stacked bar and area charts, polar plots (e.g. radar and rose
charts) and maps with legends, hover, facets and form elements are supported.

## Usage

### Standalone script

`npm run lib` builds `dist-lib/gen-vis-<version>.js`. It includes Vue, d3 and
the styles, and provides two global functions:

```html
<div class="genVis" data-def-file="/data/bev/def.json"></div>

<script src="gen-vis-1.2.0.js"></script>
<script>mountGenVisByClass('genVis')</script>
```

`mountGenVisByClass(className)` mounts all elements with the class which are
not mounted yet, `mountGenVisElement(element, props)` mounts a single element.
The props are taken from the `data-` attributes, see below, and from `props`,
e.g. the events:

```js
GenVis.mountGenVisElement(element, { onSelect: e => location.href = `/region/${e.key}` });
```

### Vue component

```js
import GenVis from '@preschen/gen-vis';

app.use(GenVis);
```

```html
<GenVis def-file="/data/bev/def.json"/>
<GenVis :def="def" :data="rows"/>
```

`import { GenVis } from '@preschen/gen-vis'` registers the component
locally instead. `vue` is a peer dependency, the package uses the Vue of the
application. `mountGenVisElement` and `mountGenVisByClass` are exported as
well.

### Props

| Prop       | Attribute       | Description |
|------------|-----------------|-------------|
| `defFile`  | `data-def-file` | url of the definition |
| `def`      | `data-def`      | the definition, an object or a JSON string |
| `data`     | `data-data`     | the data as rows, a CSV/JSON string or parquet (an `ArrayBuffer`), if not given it is loaded from the `data` url of the definition |
| `debug`    | `data-debug`    | shows the prepared definition |
| `state`    |                 | the changes of the user, see [state](#state) |
| `download` | `data-download` | a button at the right of the footer to save it as a PNG, a string is the name of the file (default the title) |
| `copy`     | `data-copy`     | a button at the right of the footer to copy the PNG to the clipboard (only on https or localhost) |
| `csv`      | `data-csv`      | a button at the right of the footer to save the data shown as CSV, a string is the name of the file (default the title) |
| `imageWidth` | `data-image-width` | the width of the PNG in pixels, the one of the definition otherwise or 1200, `screen` for the one on the screen (as it is seen, e.g. on a phone) |

Every visualisation has its own state, several of them can be used on a page.
If the props change, the visualisation is loaded again. Errors are shown in
place of the visualisation.

### Events and slots

Besides `update:state` (see [state](#state)) the component emits `rendered`
once it is drawn the first time, `error` with the message of an error and
`hover` and `select` (a click or a tap) with the rows under the mouse, `hover`
with `null` at its end:

```js
{ key: 2023, title: "2023", rows: [{ x: 2023, y: 4, land: "Wien" }, ...], nearest: { x: 2023, y: 4, land: "Wien" } }
```

`key` is the value of the position, e.g. of the horizontal axis or the key of
the region of a map, `title` the title of the hover, the rows are the values
of the mappings, `nearest` the row of the element under the mouse.

The slots replace parts of the visualisation, `hover` the content of the
hover (it also has `entries`, the formatted values of the default table),
`header` the title and the subtitle and `footer` the footer. `buttons` adds
buttons of the page at the right of the footer, before the ones of `copy`,
`csv` and `download`, e.g. own icons, with `save()`, `copy()` and `canCopy` of
the [PNG](#png) and `csv()` of the [data](#accessibility-and-the-data):

```html
<GenVis def-file="/data/bev/def.json" @select="open">
    <template #hover="{ title, nearest }">
        <strong>{{ title }}</strong> {{ nearest?.land }}: {{ nearest?.y }}
    </template>
    <template #footer="{ footer }"><small v-html="footer"/></template>
    <template #buttons="{ save }"><button @click="save">PNG</button></template>
</GenVis>
```

### PNG

The image is a copy of the visualisation with the same state, drawn outside
of the screen in the width of `imageWidth`, so it is the same on every
screen, e.g. the facets have the columns of this width, or with `screen` in
the width it has on the screen, e.g. the layout of a phone. It is twice the
size, narrow ones more (at least 1200 pixels wide, e.g. four times of 360),
has no form elements, their selection is a line below the subtitle, e.g.
`Einheit: Anteil · Jahr: 2024`, the legends only have the entries shown and
the legend of the facets is left out, their titles name them.
The titles of the buttons are in the language of `options.locale`, see
[options](#options).

Besides the buttons of `download` and `copy`, the methods of the component
are `exportPng(name)` (saves the file), `copyPng()` (copies it, in the click
of the user) and `image()` (the PNG as a `Blob`), e.g. for a button of the
page:

```html
<GenVis ref="chart" def-file="/data/bev/def.json"/>
<button @click="$refs.chart.exportPng('bev')">PNG</button>
```

### Accessibility and the data

Every facet is an image (`role="img"`) named by the title and the name of the
facet, the entries of the legends are checkboxes of the keyboard, the titles
of the form elements are their labels. The data shown can be saved as CSV:
the button of `csv` or the method `exportCsv(name)` save the rows shown (of
the visible categories and the filter) in the columns of the mappings, with
the values as they are in the data.

### State

The state holds what the user changed compared to the definition: the
globals of the form elements and the entries of the legends shown or hidden.

```json
{ "globals": { "column": "share" }, "visible": { "year": { "2019": true, "2022": false } } }
```

The component emits `update:state` on every change of the user, so with
`v-model:state` the page can keep it, e.g. in the local storage. A given state
is applied when the visualisation is loaded, a new one (`null` for the
definition) is applied without loading it again. Globals, values and entries
the definition does not have (anymore) are ignored, new entries of the
definition keep their defaults.

```html
<GenVis def-file="/data/bev/def.json" v-model:state="state"/>
```

### Styles

The styles of the package are in the cascade layer `gen-vis`, so every style
of the page overrides them, regardless of its specificity and of the order of
the styles, e.g.:

```css
.vis-form-element { display: block; margin: 6px 4px; }
.vis-subtitle { font-size: 15px; }
```

All classes of the package start with `vis-`, so styles of the page for
other elements do not apply to them, e.g. `.title` of a CSS framework:

| Part | Classes |
|------|---------|
| the visualisation | `vis`, `vis-header` (`vis-title`, `vis-subtitle`, in the [PNG](#png) `vis-selection`), `vis-body`, `vis-error` |
| form elements | `vis-form-elements`, `vis-form-element` (`vis-form-element-title`, `vis-switch`, `vis-slider`, `vis-slider-value`) |
| legends | `vis-legends`, `vis-legend` (`vis-legend-title`, `vis-legend-entries`, `vis-legend-entry`), `vis-color-legend` (`vis-color-scale`, `vis-legend-missing`, `vis-swatch`) |
| facets | `vis-facet` (a facet), `vis-facet-title`, `vis-svg` |
| plots | `vis-plot` (with the `id` of the plot and its `data-plot`, `vis-below` or `vis-above` of its layer), `vis-group` (the elements of a group of a plot with an element per row), `vis-highlight` (the highlighted elements), `vis-features` (geo:base) |
| axes | `vis-axis` and `vis-axis-bottom`, `-top`, `-left`, `-right`, `-angular` or `-radial` (the mapping as `data-mapping`), `vis-axis-title`, `vis-grid` |
| annotations | `vis-annotations` (the plot), `vis-annotation` and `vis-band`, `vis-line`, `vis-text` or `vis-circle`, `vis-annotation-label`, `vis-annotation-labels` |
| hover | `vis-hover` (`vis-hover-title`, `vis-hover-entries`, `vis-hover-entry`, `vis-nearest`, the cells of the values `vis-value`, the mapping of a cell as `data-mapping`), `vis-hover-marker`, `vis-events` |
| footer | `vis-footer` (`vis-footer-content`, `vis-buttons`, the buttons `vis-copy` and `vis-download`) |

Styles of the page which are in a cascade layer themselves only override the
package if their layer is declared after it, e.g. `@layer gen-vis, page;`.

The font and the colors of the package are css variables, e.g. for a dark
page (the default in brackets):

```css
.vis {
    --gen-vis-font-family: Arial, sans-serif;  /* Century Gothic */
    --gen-vis-grid-color: #444;                /* #CCC, the grid lines */
    --gen-vis-hover-background: #222D;         /* #FFFFFFCC */
    --gen-vis-halo-color: #111;                /* white, behind labels on the plots */
    --gen-vis-background: #111;                /* #FFF, of the PNG */
    color: #EEE;                               /* the texts, axes and ticks */
}
```

The others are `--gen-vis-marker-color` (`#AAA`, the line of the hover),
`--gen-vis-band-color` (`#EEE`), `--gen-vis-line-color` (`#999`),
`--gen-vis-annotation-color` (`#444` of texts, `#555` of labels, `#666` of
circles), `--gen-vis-missing-color` (`#EEE`, the missing values of a legend),
`--gen-vis-button-color` (`#BBB`), `--gen-vis-button-hover-color` (`#777`),
`--gen-vis-focus-color` (`#1E4F77`, the entries of legends) and
`--gen-vis-error-color` (`#B00`). The colors of annotations are only the ones
without a color of their `props`.

## Definition

```json
{
    "parent": "../shared/def.json",
    "data": "data.csv",
    "options": { ... },
    "globals": { ... },
    "mapping": { ... },
    "plot": [ ... ],
    "facets": { ... },
    "formElements": [ ... ]
}
```

Relative urls are resolved against the definition referencing them, e.g.
`data.csv` is next to the definition file, the `data` of a parent against the
loaded definition. A definition is deep merged into
its `parent` (and its parent into its own parent), arrays are replaced, not
merged, except arrays whose entries all have an `id`, e.g. the form elements
and their values, these are merged by the ids, entries with a new id are
appended. The merged definition is checked for common mistakes, e.g. unknown
plot types, the findings are logged as warnings in the console.

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

The package contains a JSON Schema of the definitions, `schema.json`. With
`"$schema"` in a definition, editors like VS Code complete and check it:

```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis/schema.json",
    ...
}
```

or with a local path, e.g. `"./node_modules/@preschen/gen-vis/schema.json"`.
The schema also allows parts of definitions, e.g. definitions with a `parent`.

### Data

`data` is CSV, TSV, JSON (a list of rows) or [parquet](https://parquet.apache.org/),
by the extension of the url (`.csv`, `.tsv`, `.json`, `.parquet`), without one
CSV or JSON by the content. `dataFormat` sets it, e.g. for an url of an api:

```json
{ "data": "/api/prices?year=2024", "dataFormat": "json" }
```

Parquet is read with [hyparquet](https://github.com/hyparam/hyparquet) (no
wasm), it is only loaded for parquet data. Integers of 64 bits are numbers,
unless they are too large for them, e.g. ids, then they are strings, dates and
timestamps are timestamps as the ones of the other formats. Snappy, the
default of arrow (R, Python), pandas and duckdb, is read directly, other
compressions, e.g. zstd of polars, load the decompressors of
`hyparquet-compressors` (~70 kB), the standalone script reads only snappy and
uncompressed parquet. Keys of categories are compared as strings, e.g. the
years of a parquet or JSON column as keys of `props`.

### `options`

`title`, `subtitle`, `footer` (HTML), `width` (the width of the container if
not given), `height` and `margins` (`{"top", "right", "bottom", "left"}` in
pixels). `height` can be a prop based on `totalWidth`, see [props](#props-1).
`{name}` in `title`, `subtitle` and `footer` is replaced by the value of the
global, e.g. `"Durchschnitt {base} = 100"` of a form element of the base year,
also in the image and the name of its file, see
[templates](#formelements-and-globals).

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
times and the names of the days and months of the browser, the currency is
the euro and the buttons are in english (german of german languages).
`timeTicks` of the object are the tick formats of time axes without `format`,
by the interval of the date (`millisecond`, `second`, `minute`, `hour`, `day`,
`week`, `month`, `year`), `texts` the titles of the buttons (`download`,
`copy` and `copied`).

`coord` is the coordinate system of the plots, `cartesian` (the default, a
horizontal and a vertical axis), `polar` (an angle and a radius, see
[polar plots](#polar-plots)), `geo` (a map, see [maps](#maps)) or a
registered one, see [extensions](#extensions).

`fontFamily` sets the font, by default the css variable
`--gen-vis-font-family` or Century Gothic, so the font of all visualisations of
a page can be set with css (see [styles](#styles) for the colors):

```css
.vis { --gen-vis-font-family: Arial, sans-serif; }
```

### `mapping`

Maps columns of the data to named dimensions, the plots and all other parts of
the definition refer to these names.

```json
"y": {
    "column": "value",
    "type": "numeric",
    "stacked": false,
    "scale": { "type": "linear", "orientation": "vertical", "domain": [0, null] },
    "axis": { "position": "left", "ticks": 8, "format": ".1f", "grid": true, "title": { "name": "€/l", "offset": 50 } },
    "hover": { "format": ".2f" }
}
```

- `type`: `numeric`, `date` or `categorical`. Numeric and date values which
  are missing or invalid are `null`: they are gaps in lines and areas, points
  and bars are not drawn, and they are not shown in the hover. Dates are
  parsed with `Date.parse` or are timestamps.
- `scale`: `type` is a d3 scale (`linear`, `time`, `log`, `point`, `band`,
  ...), continuous scales need a `numeric` or `date` type, `point` and `band`
  a `categorical` one. `orientation` (`horizontal` or `vertical`) places the
  scale on the plot, `angular` or `radial` in polar plots. `domain` fixes the
  domain, `null` entries are taken from the data, dates are parsed as the ones
  of the data, entries can be references, e.g. `[0, "@max"]` of a global. `domainRel` (relative to the domain, of a `log` scale to its
  positions) and `domainAbs` (absolute) extend it, by default a domain of a
  position taken from the data is extended by 2%. `nice` rounds the ends taken from the data of a numeric
  mapping, e.g. 0.951 to 1, `true` for steps of about a tenth of the domain
  or the number of steps, e.g. so the legend of colors ends at 100%. `padding` for categorical scales. A scale without
  `orientation` has the `range` given, e.g. colors or the radius of points.
- Scales of colors: `sequential` and `diverging` scales (a domain with a
  middle entry, e.g. `[null, 0, null]`) have an `interpolator` of d3, e.g.
  `Blues`, `Viridis` or `RdYlGn`. `quantize`, `quantile` and `threshold`
  scales (the `domain` are the values between the classes) are classes of
  colors, the `range` or a `scheme` of d3, e.g. `Blues`, with `classes`
  colors. Scales without orientation are the same in all facets.
- `name`: the title of the legend.
- `axis`: `position` (`top`, `bottom`, `left`, `right`, in polar plots
  `angular` and `radial`), `ticks`, `values` (fixed ticks, the ones outside
  of the domain are left out), `format` (d3 number or time format), `rotate`
  (the angle of the labels in degrees, positive counterclockwise, negative
  clockwise), `grid` (lines at the ticks), `title` (`{"name", "offset"}`) and
  `padding`.
- `hover`: the hover shows the values of the vertical axis at the position of
  the mouse. On touch devices it is shown by a tap and stays until a tap
  outside of the plot, horizontal swipes move it, vertical ones scroll the
  page. `format` of the horizontal and vertical axis, it defaults to the
  axis format. For categorical mappings `props` are the columns of the entries,
  `name` by default.
- `props`: the categories and their props, e.g. colors. `common` props are
  used for all `manual` entries, `name` and `visible` are set by default. Only
  visible categories are shown. The order of the `manual` entries is the order
  of the legend, the facets and the stacks, not the order of the rows. Keys
  which are integers, e.g. years, are ordered ascending by JavaScript.
  With `"fromData": true` the values of the column which are not listed are
  categories as well, after the listed ones, in ascending order (numbers by
  their value), e.g. new regions of the data. `scheme` sets the prop `color`
  of the categories in their order, a d3 scheme, e.g. `Tableau10` or `Blues`
  (of the number of categories), a `color` of the props is kept:

  ```json
  "land": { "column": "Bundesland", "props": { "fromData": true, "scheme": "Tableau10", "manual": { "ÖSTERREICH": { "name": "Gesamt", "color": "#000" } } } }
  ```
- `legend`: a toggle for every category, `symbol` draws svg `elements` (with
  props) of the given `size` before the name. A click shows or hides the
  category, a double click shows only it, the next double click all of them.
  The entries are checkboxes of the keyboard (tab, enter or space), the mouse
  and the focus highlight their category. A mapping with a scale but
  without props has the colors of its scale as legend, a gradient or the
  classes, the ticks of a gradient at the positions of their colors, e.g. of
  a sqrt scale steps of 1, 2 and 5 with more space for the small values,
  `format` of the values, by default the one of the hover, `missing`
  an entry beside them, e.g. of the regions of a map without a value
  (`{"name": "keine Daten", "color": "#DADADA"}`, the color of `geo:base`).
- `stacked`: stacks the values of a vertical (or radial) axis, the first
  category is at the bottom. `@y:start` and `@y:end` are the start and the end
  of the stacked value, `@y:start:scaled` and `@y:end:scaled` their positions,
  e.g. `y0` and `y1` of `cartesian:bar`, `@y:height:scaled` the difference,
  e.g. the height of an `svg:rect`.

### `plot`

A plot or a list of plots, drawn in order:

```json
{
    "type": "cartesian:line",
    "categories": ["nuts"],
    "props": {
        "stroke": "@color",
        "fill": "none",
        "d": { "x": "@x:scaled", "y": "@y:scaled" },
        "highlight-stroke-width": "@highlight-stroke-width"
    }
}
```

- `type`: the types are named by their coordinate system:
  - `svg:circle`, `svg:rect`, `svg:line`, `svg:text`: an svg element per row
    in any coordinate system, the props are its attributes, e.g.
    `"cx": "@x:scaled"`
  - `cartesian:line`: a line per group, `d` with `x` and `y`
  - `cartesian:area`: an area per group, `d` with `x`, `y0` and `y1`
  - `cartesian:bar`: a bar per row from `y0` to `y1`, by default from the
    position of 0, e.g. `"y1": "@y:scaled"`, or a stacked value with
    `"y0": "@y:start:scaled", "y1": "@y:end:scaled"`. The bars are centered at
    `x`, in the middle of a band, `width` defaults to the width of a band or
    the step of a point scale, a continuous scale needs a `width`.
  - `polar:*` of [polar plots](#polar-plots) and `geo:*` of [maps](#maps)
- `categories`: the rows are grouped by these mappings, the props of their
  categories are available in the plot props. Mappings without `props` only
  group the rows, e.g. a line per id.
- `props`: svg attributes (and `text`). Props starting with `highlight-` are
  used for the elements of the category under the mouse or the legend entry.
- `highlight`: `group` (default) highlights the elements of the category under
  the mouse, `row` only the element of its row, e.g. the segment of a stacked
  bar, an entry of the legend highlights all of its category.
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
  `{ "max": "x" }`, e.g. labels at the ends of lines.
- `dodge` (`svg:text`): the texts are moved apart vertically to at least
  this distance in pixels, e.g. labels at the ends of lines.
- `layer`: `below` draws the plot below the axes and grid lines, e.g. a
  background, `above` above the other plots, e.g. labels, by default the
  plots are drawn between them in their order.
- `facet`: a key or a list of keys of the facets of the plot, by default it
  is in all facets.

Labels at the ends of lines, in the color of the line:

```json
{
    "type": "svg:text",
    "categories": ["nuts"],
    "select": { "max": "x" },
    "dodge": 12,
    "props": { "x": "@x:scaled", "y": "@y:scaled", "dx": 4, "text": "@name", "fill": "@color" }
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
    "type": "svg:text",
    "data": [{ "y": "@target", "label": "Ziel" }],
    "props": { "x": "@x:scaled:max", "y": "@y:scaled", "dy": -4, "text-anchor": "end", "text": "@label" }
}
```

### Polar plots

With `"coord": "polar"` the plots are in a circle in the center of the facet,
the mapping with the `angular` orientation goes around it, clockwise from the
top, the one with the `radial` orientation from the center outwards, the
margins are the space of the labels:

```json
"options": { "coord": "polar", "height": 400, "margins": {"top": 30, "right": 60, "bottom": 30, "left": 60} },
"mapping": {
    "x": {
        "column": "date", "type": "date",
        "scale": { "type": "utc", "orientation": "angular", "domain": ["2020-01-01", "2021-01-01"] },
        "axis": { "position": "angular", "ticks": 12, "format": "%b", "grid": true }
    },
    "y": {
        "column": "value", "type": "numeric",
        "scale": { "orientation": "radial", "domain": [0, null] },
        "axis": { "position": "radial", "ticks": 4, "grid": true }
    }
},
"plot": { "type": "polar:line", "categories": ["year"], "props": { "stroke": "@color", "fill": "none", "d": { "angle": "@x:scaled", "radius": "@y:scaled" } } }
```

- The angle is a cycle, the end of its domain is at the angle of its start,
  e.g. a year from `2020-01-01` to `2021-01-01`, a domain taken from the data
  is not extended. The categories of `point` and `band` scales have the same
  distance, also the last and the first one.
- The range of the radius is `[0, "@radius"]` by default, the half of the
  smaller side of the facet, e.g. `[20, "@radius"]` leaves a hole in the
  center.
- `angular` axes are around the circle, `grid` draws lines from the center.
  `radial` axes go from the center outwards, at the `angle` of the axis
  (degrees, clockwise from the top, 0 by default), `grid` draws circles, or
  polygons through the ticks of the angle with `"gridShape": "polygon"`, e.g.
  of radar charts. The labels of radial axes are above the plots.
- The plot types: `polar:line` (a line per group, `d` with `angle` and
  `radius`), `polar:area` (an area per group, `d` with `angle`,
  `innerRadius` and `outerRadius`), `polar:arc` (a segment of a ring per row,
  props `angle`, `innerRadius` and `outerRadius`, optional `width` in radians,
  `padAngle` and `cornerRadius`, e.g. the bars of a rose chart), and
  `polar:circle` and `polar:text` (an element per row at `angle` and
  `radius`). The angles of a band scale are in the center of the band. The
  `svg:` types draw with the center as origin, the `cartesian:` types are
  cartesian only.
- Stacked values (`stacked` of the radius) are stacked from the center, e.g.
  `"innerRadius": "@y:start:scaled", "outerRadius": "@y:end:scaled"` of
  `polar:arc`.
- The hover shows the values of the angle nearest to the mouse, also across
  the top, it is in the center, on the other side of the marker.

See `data/bev/def-radar.json` and `data/rechtsform/def-rose.json`.

### Maps

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
    "country": { "column": "country", "type": "categorical" },
    "type": { "column": "variable", "type": "categorical" },
    "price": {
        "name": "€/Liter", "column": "value", "type": "numeric",
        "scale": { "type": "sequential", "interpolator": "YlOrRd" },
        "legend": { "format": ",.1f" }, "hover": { "format": "$,.3f" }
    }
},
"plot": [
    { "type": "geo:base", "props": { "fill": "#EEE", "stroke": "white" } },
    { "type": "geo:region", "categories": ["country"], "props": { "fill": "@price:scaled", "highlight-stroke": "#333" } }
]
```

- `geo.data` is the url of GeoJSON or TopoJSON (or the GeoJSON or TopoJSON
  itself), `object` the object of TopoJSON (the first one by default), `key`
  the key of the features (`id`, the default, or a property, e.g. `NUTS_ID`)
  and `name` the property of their names (`name` by default). Polygons of
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
- The plot types: `geo:base` (all features, e.g. as background, the props
  are fixed), `geo:region` (the feature of every row), `geo:circle` and
  `geo:text` (an element per row at the center of its feature or at the `lon`
  and `lat` of its props, e.g. proportional circles with a `sqrt` scale of
  `r`).
- The hover shows the region under the mouse: its name (the `name` of the
  props of the `join` mapping, of the feature or the key) and the rows of it,
  the region is highlighted.
- One row per region is usually shown, `filter` (see
  [formElements](#formelements-and-globals)) or facets select them, e.g. a map
  per fuel type.

See `data/bev/def-map.json`, `data/sprit-nuts/def-map.json` and the maps of
`data/energy/`. The geometries of `data/geo/` are of Eurostat (GISCO), see
`data/geo/README.md`.

### Annotations

`annotations` are bands, lines, texts and circles at values of mappings, e.g.
estimated values or events, the keys are the names of the mappings, a value
or a range `[from, to]`, values are converted as the ones of the rows, e.g.
dates, and can be references to globals, e.g. `"@target"`:

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
  `above` draws the annotation above the plots, by default it is below the
  plots and grid lines, labels are above them. `facet` is a key or a list of
  keys of the facets of the annotation, by default it is in all facets.
- Polar plots: a `band` of the angle is a sector (also across the top, e.g.
  from November to February), of the radius a ring, a `line` of the angle a
  spoke, of the radius a circle. Maps: `text` and `circle` at `lon` and `lat`.
- The classes are `annotation` and `band`, `line`, `text` or `circle`, the
  labels `annotation-label`.

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

### Props

Most values of a definition can be props:

- fixed values, e.g. `3` or `"none"`
- references `"@name"`, see below
- `{"prop": "relative", "ref": "innerWidth", "ratio": 0.01}`: a ratio of a
  reference
- `{"prop": "steps", "ref": "totalWidth", "steps": [{"cut": 0, "value": 220}, {"cut": 550, "value": 250}]}`:
  the value of the last step with a cut below the reference

Objects without `prop` are nested props, e.g. `d` of a path.

The names of the references depend on the part of the definition, the inner
parts add names:

| Part | Names |
|------|-------|
| everywhere | the `globals` and `totalWidth`, the width of the visualisation |
| `options.height`, `facets.cols`, `facets.scales`, `filter` | only these |
| the `props` of `legend` (also of the `symbol`) and `hover` of a mapping | the props of its categories, e.g. `@color` and `@name` |
| `axis.ticks`, `scale.domain`, the values and `props` of annotations, the values of the `data` of a plot | the size of the facet: `width`, `innerWidth`, `height`, `innerHeight` |
| `scale.range` | the sizes of the coordinate system, e.g. `@radius` of polar plots, `width` and `height` are the ones of the inner area |
| the `props` of a plot | the props of its categories and the values of the row: a mapping (e.g. `@x`), the scaled value (`@x:scaled`, `@x:scaled:0` for the position of 0, `@x:scaled:min` and `@x:scaled:max` of the domain), stacked values (`@y:start`, `@y:end:scaled`, ..., see `stacked`) |

Inner names replace outer ones, in a plot the mappings replace globals of the
same name, e.g. `@year` is the one of the row. A reference to an unknown name
is undefined, `validateDef` warns of it.

### `facets`

A plot for every category of `dim` (the name of a mapping with `props`), in
`cols` columns. The mappings listed in `scales` share their scale across all facets.
`cols` can be a prop based on `totalWidth`, `scales` a reference to `globals`.

### `formElements` and `globals`

Form elements change `globals`, e.g. the shared scales of the facets, as
radio buttons (`"type": "switch"`), a drop down list (`"type": "select"`) or
a slider over the entries (`"type": "slider"`, e.g. of years, the
visualisation changes while it is moved).
The selected entries are named below the subtitle of the [PNG](#png),
`"inImage": false` leaves out a form element which only changes the
presentation, which the image shows anyway, e.g. shared or separate scales of
the facets.
`filter` shows only the rows of values of mappings, e.g. of a global, the
values are compared as the ones of the rows, e.g. dates:

```json
"globals": { "year": "2025" },
"filter": { "year": "@year" },
"formElements": [{
    "id": "year", "name": "Jahr", "ref": "year", "type": "select",
    "values": [{ "id": "2024", "name": "2024", "value": "2024" }, { "id": "2025", "name": "2025", "value": "2025" }]
}]
```

`values` can also be the distinct values of a column of the data, in
ascending order (numbers by their value), named as the values, so new
values of the data are added, e.g. a new year. If the global is none of them,
e.g. it is missing, it is the last one:

```json
"filter": { "year": "@year" },
"formElements": [{ "id": "year", "name": "Jahr", "ref": "year", "type": "slider", "values": { "column": "year" } }]
```

An entry
with a `mapping` also patches the mappings while it is selected, e.g. to switch
the column of an axis:

```json
"globals": { "column": "value" },
"formElements": [{
    "id": "column", "name": "Wert", "ref": "column", "type": "switch",
    "values": [
        { "id": "value", "name": "Wert", "value": "value" },
        { "id": "share", "name": "Anteil", "value": "share", "mapping": { "y": { "column": "share" } } }
    ]
}]
```

If the column depends on several form elements, it can be a template of the
globals, e.g. the values and their shares in the columns `twh`, `co2`,
`twh.share` and `co2.share`:

```json
"globals": { "values": "twh", "share": "" },
"formElements": [{
    "id": "values", "name": "Werte", "ref": "values", "type": "switch",
    "values": [
        { "id": "twh", "name": "TWh", "value": "twh" },
        { "id": "co2", "name": "CO₂", "value": "co2" }
    ]
}, {
    "id": "share", "name": "Darstellung", "ref": "share", "type": "switch",
    "values": [
        { "id": "abs", "name": "Absolut", "value": "" },
        { "id": "rel", "name": "Anteil", "value": ".share", "mapping": { "y": { "axis": { "format": ".0%" } } } }
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

### Checks outside the browser

`@preschen/gen-vis/check` merges and checks definitions in scripts, e.g. all
definitions of a page before a deploy, `load` reads the file of an url:

```js
import { resolveParents, validateDef } from '@preschen/gen-vis/check';

const url = pathToFileURL('data/gas/price.json').href;
const def = await resolveParents(JSON.parse(readFileSync(new URL(url), 'utf8')), url,
    u => readFileSync(new URL(u), 'utf8'));
console.log(validateDef(def));  // the warnings, e.g. unknown plot types
```

### Extensions

Plot types and coordinate systems can be registered, before the
visualisations are loaded. A plot type draws the groups of rows of a plot,
one per combination of its categories. A group has its `rows`, the props of
its categories (`props`) and the values of the props of the plot: of a row
`at(row)`, of one prop `prop(name)(row)` and the ones which are the same for
all rows `attrs`, e.g. the color of a line. The values are plain values, e.g.
the position of `"@x:scaled"`. `pointwise` draws an element per row (without
the rows of missing values) with the values of its props as attributes,
`groupwise` a path per group with `attrs`:

```js
import { registerPlotType, pointwise } from '@preschen/gen-vis';

registerPlotType('my:tick', {
    render: (groups, parent, plot, ctx) => pointwise(groups, parent, 'rect', v => ({
        ...v, x: v.cx - 1, width: 2, height: ctx.innerHeight,
    })),
});
```

`ctx` is the facet: the `store`, the d3 selection `inner` of the plot area,
its `rows`, the `scales` by the names of the mappings, `axis` (the names of
the mappings of the positions and of the values), `stackOf(row)` (the start
and the end of a stacked value), `scope` (the names of the references of the
facet, see [props](#props-1)), `innerWidth` and `innerHeight`, of maps also
the `projection` and the `path`. `curve: true` passes the `curve` of the plot, `coords` limits
a type to coordinate systems, e.g. `cartesian:bar` to `cartesian`. A
coordinate system (`registerCoord(name, coord)`) has the default ranges of the
orientations of its scales, the axes and the geometry of the hover, see
`src/coords/index.js` and e.g. `src/coords/polar.js`. Both are known to
`validateDef`, `@preschen/gen-vis/check` exports `registerPlotType` and
`registerCoord` as well, the standalone script has them as
`GenVis.registerPlotType`, `GenVis.registerCoord`, `GenVis.pointwise` and
`GenVis.groupwise`. The schema only knows the built-in ones.

## Development

```sh
npm install
npm run dev     # dev server with all definitions in data/, ?def=bev/def.json shows one with the prepared definition
npm test        # unit tests, rendering and schema check of all definitions in data/
npm run build   # es module for bundlers in dist/
npm run watch   # rebuilds dist/ on changes, e.g. for `npm link`
npm run lib     # standalone script in dist-lib/
npm run deploy  # builds and uploads the standalone script
```

The page of the dev server (`index.html`, `src/dev/`) shows the definitions in
`data/`, also of linked directories, e.g. of the pages using the package,
without the mixins (`_*.json`). All definitions in `data/` are rendered,
hovered and checked by the tests, so they have to stay valid. `data/energy/`
is a selection of the energy dashboard, see its `README.md`.

To try changes in an application, `npm install --no-save ../gen-vis` links the
directory (with `npm run watch`). The `vue` of the linked package would be the
one of its own `node_modules`, a second Vue, so the bundler of the application
has to resolve `vue` to its own, e.g. `resolve.alias: { vue:
path.resolve('node_modules/vue') }` of webpack or `resolve.dedupe: ['vue']` of
vite. The changes of the versions are in `CHANGELOG.md`.

## License

MIT, see `LICENSE`. The example data in `data/` has its own sources, see the
footers of the definitions and the readmes of `data/geo/` and `data/energy/`.
