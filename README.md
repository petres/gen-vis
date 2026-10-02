# gen-vis

A declarative d3 visualisation library: a chart is described by a JSON
definition (the *def*) and a CSV or JSON data file. Line, point, bar, stacked
bar and area charts with legends, hover, facets and form elements are
supported.

## Usage

### Standalone script

`npm run lib` builds `dist-lib/gen-vis-<version>.js`. It includes Vue, d3 and
the styles, and provides two global functions:

```html
<div class="genVis" data-def-file="/data/bev/def.json"></div>

<script src="gen-vis-0.8.0.js"></script>
<script>mountGenVisByClass('genVis')</script>
```

`mountGenVisByClass(className)` mounts all elements with the class which are
not mounted yet, `mountGenVisElement(element)` mounts a single element. The
props are taken from the `data-` attributes, see below.

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
| `data`     | `data-data`     | the data as rows or a CSV/JSON string, if not given it is loaded from the `data` url of the definition |
| `debug`    | `data-debug`    | shows the prepared definition |
| `state`    |                 | the changes of the user, see [state](#state) |

Every visualisation has its own state, several of them can be used on a page.
If the props change, the visualisation is loaded again. Errors are shown in
place of the visualisation.

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
.formElement { display: block; margin: 6px 4px; }
.vis-header .subtitle { font-size: 15px; }
```

The main classes are `vis`, `vis-header` (with `title` and `subtitle`),
`vis-form-elements` (with a `formElement` for every form element),
`vis-legends`, `facet-title` and `vis-footer`. Styles of the page which are in
a cascade layer themselves only override the package if their layer is
declared after it, e.g. `@layer gen-vis, page;`.

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
`data.csv` is next to the definition file. A definition is deep merged into
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

### `options`

`title`, `subtitle`, `footer` (HTML), `width` (the width of the container if
not given), `height` and `margins` (`{"top", "right", "bottom", "left"}` in
pixels). `height` can be a prop based on `totalWidth`, see [props](#props-1).

`locale` sets the number and date formats of the axes and the hover, also of
axes without `format`: `de` (the default) or `en`, or an object with a `base`
locale and the parts which are changed, see d3's
[formatLocale](https://d3js.org/d3-format#formatLocale) and
[timeFormatLocale](https://d3js.org/d3-time-format#timeFormatLocale):

```json
"locale": { "base": "de", "number": { "currency": ["", " EUR"] } }
```

`timeTicks` of the object are the tick formats of time axes without `format`,
by the interval of the date (`millisecond`, `second`, `minute`, `hour`, `day`,
`week`, `month`, `year`).

`fontFamily` sets the font, by default the css variable
`--gen-vis-font-family` or Century Gothic, so the font of all visualisations of
a page can be set with css:

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
  scale on the plot. `domain` fixes the domain, `null` entries are taken from
  the data. `domainRel` (relative to the domain) and `domainAbs` (absolute)
  extend it. `padding` for categorical scales.
- `axis`: `position` (`top`, `bottom`, `left`, `right`), `ticks`, `values`
  (fixed ticks), `format` (d3 number or time format), `rotate` (the angle of
  the labels in degrees, positive counterclockwise, negative clockwise), `grid`
  (lines at the ticks), `title` (`{"name", "offset"}`) and `padding`.
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
- `legend`: a toggle for every category, `symbol` draws svg `elements` (with
  props) of the given `size` before the name.
- `stacked`: stacks the values of a vertical axis, see `stackedBar`, the first
  category is at the bottom.

### `plot`

A plot or a list of plots, drawn in order:

```json
{
    "type": "svg:path",
    "categories": ["nuts"],
    "props": {
        "stroke": "@color",
        "fill": "none",
        "d": { "x": "@x:scaled", "y": "@y:scaled" },
        "highlight-stroke-width": "@highlight-stroke-width"
    }
}
```

- `type`: `svg:path` (a line per group, `d` with `x` and `y`), `base:area`
  (an area per group, `d` with `x`, `y0` and `y1`), `svg:circle`, `svg:rect`,
  `svg:line`, `svg:text` (an element per row), `bar` (props `cx` and
  `height`, `width` defaults to the step of a categorical scale) and
  `stackedBar` (props `x`, `y` and `width`).
- `categories`: the rows are grouped by these mappings, the props of their
  categories are available in the plot props.
- `props`: svg attributes (and `text`). Props starting with `highlight-` are
  used for the elements of the category under the mouse or the legend entry.

### Props

Most values of a definition can be props:

- fixed values, e.g. `3` or `"none"`
- references `"@name"`: in a plot a column of the row (e.g. `@x`), the scaled
  value (`@x:scaled`, `@x:scaled:0` for the position of 0, `@y:st:e:scaled`
  for the end of a stacked value), a prop of the categories (e.g. `@color`) or
  the size of the plot (`@width`, `@innerWidth`, `@height`, `@innerHeight`)
- `{"prop": "relative", "ref": "innerWidth", "ratio": 0.01}`: a ratio of a
  reference
- `{"prop": "steps", "ref": "totalWidth", "steps": [{"cut": 0, "value": 220}, {"cut": 550, "value": 250}]}`:
  the value of the last step with a cut below the reference

Objects without `prop` are nested props, e.g. `d` of a path.

### `facets`

A plot for every category of `dim` (the name of a mapping with `props`), in
`cols` columns. The mappings listed in `scales` share their scale across all facets.
`cols` can be a prop based on `totalWidth`, `scales` a reference to `globals`.

### `formElements` and `globals`

Form elements change `globals`, e.g. the shared scales of the facets. An entry
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
reported as warnings.

## Development

```sh
npm install
npm run dev     # dev server, the definition shown by dev.html is set in src/globals.js
npm test        # unit tests, rendering and schema check of all definitions in data/
npm run build   # es module for bundlers in dist/
npm run watch   # rebuilds dist/ on changes, e.g. for `npm link`
npm run lib     # standalone script in dist-lib/
npm run deploy  # builds and uploads the standalone script
```

`lib.html` shows the embedding with the dev server. The examples in `data/`
are rendered by the tests, so they have to stay valid.
