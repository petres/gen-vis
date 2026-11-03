# Changelog

The changes of the versions, the newest first, the ones on npm without
0.7.0 and 2.0.0-alpha.1. The details are in the commits.

## 4.0.0 (unreleased)

A shorter definition language, a core without a framework (Vue is an
optional adapter) and a renderer without d3-selection and d3-transition.
The charts are the ones of 3.x: a definition of 4.0 is written in the form
the renderer of 3.x reads (`normalize`), the elements are the ones of 3.x
without the scoped ids of Vue (`data-v-…`) and its comments, the attributes
of the default props of a plot type are before the ones of the
definition.

Changes from 3.x, made by hand (4.0 has no migration and reads no
definition of 3.x):

- Definitions, see the definition language below:
  - props of `prop`: `{"prop": "ref", "ref": "a"}` is `"@a"`, `"fixed"` the
    value (`{"literal": v}` of texts of `@`, objects and lists),
    `"relative"` `{"+": [{"*": ["@a", ratio]}, offset]}`, `"steps"`
    `{"steps": ["@a", {"<cut>": value}]}`, `"format"` `{"format": ["@a",
    f]}`, `"match"` `{"match": ["@a", {cases}, default]}`, `of` the
    expression instead of `"@a"`;
  - `calc` of `op` and `columns`: `expr`, e.g. `{"*": [{"/": ["@v",
    "@base"]}, 100]}` of `divide` with `scale` 100;
  - `props` of a mapping: its entries (`categories`, `scheme`, `common`,
    `fromData`, `order`, `ranks`) at the mapping;
  - `categories` of a plot: `by`; the props `highlight-<name>` and
    `others-<name>`: `"highlight": {"<name>": …}` and `"others": {…}`; a
    text of `highlight`: `"highlight": {"mode": "row"}`;
  - a mapping without a type was categorical: `"type": "categorical"`
    unless its parts or its values give the type, a scale without a type was
    linear: `"type": "linear"` where the type of the mapping gives another
    one; a position without a scale or an axis: `"scale": false`, `"axis":
    false` (`"orientation": null` of a scale without an orientation);
  - a plot type of its full name has the default props of the type, e.g.
    `cartesian:line` a stroke, `svg:text` the fill of `@color`: the props
    which are the defaults are left out (best with the short name), a
    default the plot must not have is `null`, e.g. `"fill": null`;
  - `validateDef` names the parts of 3.x which are left as unknown ones;
  - a definition file declares gen-vis 4: `"$schema":
    "https://unpkg.com/@preschen/gen-vis@4/schema.json"` (in itself or in a
    parent), the load of a file without it or with the one of gen-vis 3
    fails, an inline definition may have none, see the readme (Definition).
- Vue: the component `GenVis` and the plugin are the ones of
  `@preschen/gen-vis/vue` (`vue` is an optional peer dependency), `import
  GenVis from '@preschen/gen-vis/vue'` or `import { GenVis } from
  '@preschen/gen-vis/vue'` instead of `'@preschen/gen-vis'`, with the same
  props, `v-model:state`, events, slots and methods.
- The standalone script and the module of `dist-lib/` have no Vue,
  `gen-vis.novue.js`, `esm-novue/` and the export
  `@preschen/gen-vis/esm-novue` are gone; a page with Vue uses
  `GenVis.vuePlugin(Vue)` or `GenVis.createVueComponent(Vue)`.
- `registerCoord` and `registerPlotType`: the coordinate systems and plot
  types get DOM elements instead of d3 selections (`ctx.inner`, the `parent`
  of `hover.area`, the `line` of `hover.marker`), e.g.
  `ctx.inner.getAttribute('transform')` instead of
  `ctx.inner.node().getAttribute('transform')`.
- `createGenVis`, `mountGenVisElement` and `mountGenVisByClass` return the
  visualisation instead of a Vue component: its element is `.el` (not
  `$el`), its props `.props` (not `$props`).

The definition language, the breaking changes:

- The props are expressions, close to JSON Logic: an operator is an object of
  one key, e.g. `{"*": ["@innerWidth", 0.013]}`, `{"+": ["@x:scaled", -14]}`,
  `{"steps": ["@totalWidth", {"0": 220, "550": 250}]}`, `{"format": ["@y",
  ",.1f"]}`, `{"match": ["@level", {"header": 4.5}, 0]}`, `{"literal": v}`,
  also comparisons, `if`, `and`, `or`, `not`, `cat`, `min`, `max`, `round`
  and `var`. The props of `prop` of 3.x (`relative`, `steps`, `format`,
  `match`, `ref`, `fixed`) are no props anymore, an object of one key which is
  an operator is no nested prop anymore.
- `calc` is an expression of the row (`expr`), not `op`, `columns` and
  `scale`; the new transform `filter` keeps the rows of an expression, the
  later transforms, the plots and the scales have only them.
- A text is the mapping of a column, e.g. `"x": "Jahr"`. The parts of the
  categories of a mapping (`categories`, `scheme`, `common`, `fromData`,
  `order`, `ranks`) are parts of the mapping, not of `props`; `domain` and
  `nice` of a mapping are the ones of its scale, `format` is the one of its
  axis and hover which have none of their own.
- `x` and `y` (of polar plots also `angle` and `radius`) have a scale of the
  orientation of their name and an axis by default, `"axis": false`,
  `"scale": false` and `"orientation": null` leave them out; an axis is at the
  position of the orientation of its scale.
- A mapping without a type is not categorical anymore: its type follows from
  its parts (categories, the type of its scale, the categories of plots and
  facets) or from the values of the column (numbers numeric, dates date); a
  scale without a type is the one of the type of the mapping (`linear`,
  `time`, `band` of bars, `point`, `ordinal`), not `linear`.
- `by` of a plot instead of `categories`, `highlight` and `others` objects
  of props instead of the props `highlight-` and `others-`,
  `"highlight": {"mode": "row", ...}` instead of `"highlight": "row"`.
- Plot types without the prefix of the coordinate system, e.g. `line`,
  `area`, `bar`, `point`, `text`, `arc`, `region`, have default props (the
  `defaults` of the types, also of registered ones): a line draws
  `"d": {"x": "@x:scaled", "y": "@y:scaled"}` in the color of its category,
  a definition writes only the props which differ, `null` removes one; the
  full names (`cartesian:line`) are the same types with the same defaults.
- The schema is the one of 4.0 (`@preschen/gen-vis@4/schema.json`), the
  `$schema` of a definition is its version: a definition file needs the one
  of gen-vis 4, a part with another one is an error.

The definitions of `data/` and of the page are written in the shorter
forms of 4.0: the short types without the props of their defaults,
`highlight` and `others`, mappings without the types, scales, orientations
and positions of axes which follow from the rest (also without the types
their values infer), `domain` and `format` at the mapping and texts of
columns. The parts which are not bound to the browser, the expressions, the
transforms, merging and normalize, are specified by the fixtures of `spec/`,
e.g. for implementations in Python or R, the tests run them.

The package is a core without a framework. `@preschen/gen-vis` exports
`createGenVis(element, props)` (a visualisation with `update(props)`,
`on`/`off` of the events, `destroy()`, `state`, `el` and the methods
`exportPng`, `copyPng`, `image`, `exportCsv` and `setHighlight`),
`mountGenVisElement`, `mountGenVisByClass`, `unmountGenVisElement`,
`registerPlotType`, `registerCoord`, `perRow` and `perGroup`. Without Vue
the slots are functions of their props (the prop `slots`, they return a
node or a text) and the events are listeners (`on`, or the props `onHover`,
`onSelect`, `onRendered`, `onError` and `'onUpdate:state'`). Changes are
drawn together in a microtask, a new view only of a new state, new globals,
a toggle or a new width, the hover only draws itself. The styles are one
stylesheet (`src/styles.css`), still in the cascade layer `gen-vis`, with
the same classes and css variables.

The standalone script without Vue is smaller: the single file 120 kB gzipped
instead of 143 kB, the module 64 kB at first instead of 87 kB. A page with
Vue as a script or in its import map has the component of its Vue of the
same files: `GenVis.vuePlugin(Vue)` (the plugin, its `component`) and
`GenVis.createVueComponent(Vue)`.

The package draws without d3-selection and d3-transition
(`src/utils/dom.js`): the elements of the plots, the axes, the facets, the
legends and the hover, their transitions included. The charts are drawn
faster, the ones of `data/` together in ~14% less time.

The decompressors of parquet are loaded one by one, only the ones of the
file, e.g. zstd of polars (3 kB instead of 75 kB of all of
hyparquet-compressors).

`registerScheme(name, colors)`: a scheme of colors of its own for `scheme`
of the categories and the scales, e.g. `"scheme": "wifo"` of the colors of a
house style, known to `validateDef` (also of `@preschen/gen-vis/check`),
without the colors of d3.

## 3.1.0

The standalone script in more sizes: `dist-lib/gen-vis.core.js` (less than
1 kB) loads the module of `esm/` (90 kB gzipped at first, the other parts
when a chart needs them) for pages without modules, its globals return
promises; `gen-vis.novue.js` and `esm-novue/` use the Vue of the page (the
global `Vue` or the one of the import map, 126 kB and 66 kB gzipped). The
single file has no check of the definitions anymore (149 kB gzipped, it was
161 kB), `check` warns that it is missing. `npm run upload` writes the files
compressed next to them (brotli and gzip). The readme starts with the module.

The prop `lazy` (attribute `data-lazy`) loads a visualisation only when it
comes near the viewport, `true` within 400 pixels or a `rootMargin`, e.g.
of pages with many charts, it keeps the space of the loading state until
then.

Legends of categories with `"onlyData": true` only have the categories of
the rows after the `filter`, e.g. not the sources of a parent which a year
has no rows of, the entries follow the form elements.

Texts of plots without a `fill` are in the color of the css variable
`--gen-vis-text-color` (black by default, as before), e.g. of a dark page.
`halo` of `svg:text` and `polar:text` draws a halo behind the texts in the
color of `--gen-vis-halo-color`, `true` or its width, instead of the four
stroke props.

`dodge` of `polar:text` moves the texts of the same angle apart along the
radius (it was ignored), `validateDef` warns of `dodge` of the other types.

`"side": "center"` of the hover of the options places it on its position,
e.g. in the center of a polar plot, see `data/ecad/polar-rr.json` (the
day, the year and the mean beside each other, the difference below them,
as on ecad.abteil.org).

`"curved": true` of the `labels` of an angular axis writes them along the
circle, `"between"` between the tick and the next one, e.g. the names of
the months of `data/ecad/polar-rr.json`, the ones of the lower half are
not upside down.

Fixed: the values of DECIMAL columns of parquet (INT32, INT64 or
FIXED_LEN_BYTE_ARRAY with a scale, e.g. doubles written as decimals, less
than half the size) are the doubles of their decimals, the same as the ones
of a csv, e.g. `22.1637`, they were the products of the reader, e.g.
`22.163700000000002` in the csv of the button and the hover without a
format; the ones of only the logical type DECIMAL are scaled (they were the
integers).

A patch of a form element can change the coordinate system
(`options.coord`) and the map (`geo.data`), all of them are loaded with the
definition (they were the ones of the definition). The `globals` of an entry
select the entry of another form element at once (it needed a second
change). The parts of a definition, its data, files and maps are loaded at
the same time.

`validateDef` (with `check`) reports unknown keys of the schema, with the
name it probably is, checks the definition with the patch of every entry of
the form elements and the rows of the data (`validateDef(def, rows)`), e.g.
years as numbers of a `date` mapping, and warns of names which are not in
lower case, e.g. `Linear`, and of `nice` of other than numeric mappings. The
schema allows other fields of the entries of form elements (for
`{ref:field}`), `false` as `null` of the parts of a mapping, `null` of
`options` and `mapping` of a patch and of `geo` and `filter` of a child, and
registered plot types and coordinate systems. The events and the slots of
the component have types.

Accessibility: a chart without a title is named by its subtitle or `chart`
of the locale, the subtitle describes a chart with a title, the hover is read
when the keys move it, not the mouse, the legend of a scale of colors is a
named image.

Fixed:

- A definition removed (`null`) while one is loaded stays removed, globals
  changed while it is loaded are applied, a visualisation removed while it
  is loaded reports nothing.
- The buttons of the footer do not submit a form of the page, the label of
  the copy button says it was copied.
- `mountGenVisByClass` mounts elements by its own record, not the class
  `vis-mounted`, e.g. of a copy of a mounted element.
- The PNG and the CSV are an error while a new definition or new data is
  loaded (they could mix the new definition with the old data).
- Legends of `fromData` of a column of the globals, e.g. of a lookup of
  `{lang}`, have the categories of the values (they kept the old ones, all
  rows were hidden).
- Curved labels with a `max-width` stay on the circle (they were in the
  center), `"between"` of angles counterclockwise and of a single tick,
  values below the domain of the radius are at the inner radius (they were
  on the other side of the center), `dodge` of `polar:text` treats 0 and 360°
  as the same angle and stays outside the inner radius.
- A container smaller than its margins has no negative sizes.
- The hover is at the nearest position with rows (positions without values
  or of `options.hover.filter` hid it), the order of rows outside of stacks
  is stable, a double click of a legend with `onlyData` also hides the
  categories which are not shown, transitions stop with the visualisation.
- Parquet: decimals of bytes and of only the logical type, dates of only the
  logical type (they were of 1970), floats of 32 bits as their text (e.g.
  `22.1637`), integers of 64 bits in lists and structs are numbers.
- Numbers are numbers of the data or texts of decimal numbers (`0x10`,
  `true` and `[1]` were numbers), a `log` scale has the positive values only
  (0 gave an infinite domain), a domain without values is `[0, 1]` (it was
  NaN), filters and the ticks of a `date` mapping with the scale of another
  one in UTC match, `rolling` gives no mean to rows without a value.
- Maps: rows without a feature are not drawn, keys of integers match without
  leading zeros, a join without any match is a warning, unknown parameters
  of projections, TopoJSON without objects and empty maps are clear errors,
  annotations which a map has not are a warning.
- The radial labels of `data/bev/def-radar.json` are beside the spokes.

## 3.0.0

Definitions are more flexible: the entries of form elements patch all parts
of a definition, the page sets globals, plots and the hover have filters,
props are combined, scales have groups and include values, the hover and the
highlight have more options, legends their place, texts a width, three new
transforms, messages instead of the plots and linked charts. See the
`data/fti/` charts of the FTI Monitor, they need no workarounds anymore.

Fixed: a definition is the same for CSV, JSON and parquet data, the fixed
values of categorical mappings (the `values` of an axis, annotations, the
`data` of plots, `"@x:scaled:2004"`) were only the categories of the data of
the same type, e.g. the ticks `["2004", "2008"]` of a band scale of years
were all at 0 with parquet data and `[2004, 2008]` with csv data, now
strings and numbers are the same categories; fixed ticks which are no
category of a band or a point scale are left out (they were at 0); the
categories which are numbers are compared by their value in `range` of a
filter and `select` of a plot, e.g. `"9"` before `"10"`.

Fixed: the categories of a `point` scale of angles (polar plots) have the
same distance, also the last and the first one, as the ones of `band`
scales (it was 0.8 of a step, e.g. the radar of `data/bev/def-radar.json`).

Fixed: `validateDef` does not warn of a mapping which is removed by `null`,
e.g. one of a parent.

Fixed: `"ticks": null` of an axis is the number of `tickSpacing`, e.g. a
patch of the ticks of a parent, it was no number. The fixed ticks of an axis of dates (`axis.values`, e.g.
`"2020-04-01"`) are converted as the dates of the data, they had no
position.

Fixed: the parts a patch of a form element needs are loaded, also if the
definition has none of them, e.g. a transform or the legend of a scale of
colors only of a patch (the transforms were not loaded, the legend was not
shown).

The check of the definitions (`validateDef`) is only loaded and its warnings
are only logged with the prop `check` (`data-check`) or `debug`, e.g. while
a definition is written, a page loads less; a plot type of another
coordinate system is an error, e.g. `cartesian:bar` of a polar plot (it was
a warning of the check).

Changes which need changes of definitions:

- `filter`: `null` is the rows without a value (it was no row)
- `"ratio"` of `relative` props is 1 by default (it was required)
- the hover: a position without rows has no hover, e.g. a region of a map
  without a value (`"empty": true` shows its name as before)
- the values of categorical mappings (and of mappings without a `type`)
  are strings of every format of the data, as the ones of CSV, also the
  rows and the `key` of the events `hover` and `select` of JSON and parquet
  data, e.g. `"2004"` instead of `2004`, and the values of form elements of
  the values of a column (also their globals and the state); a missing
  category is `null` of every format, also an empty cell of CSV (it was an
  empty string), so `null` of a `filter` is it, and a row without the
  category of a mapping of the props of a plot is not drawn, as one of JSON
- form elements: the patches of an entry are `patch`, e.g.
  `"patch": { "mapping": { "y": { "column": "share" } } }` instead of
  `"mapping": { "y": { "column": "share" } }`

New:

- form elements: a `patch` of an entry changes any part of the definition
  (`options`, `mapping`, `plot`, `annotations`, `filter`, `facets`, `geo`,
  `transform`), e.g. the section of a map, `null` removes a part, e.g. a
  mapping; `globals` of an entry are set when it is selected; the templates
  name the fields of the selected entries, e.g. `{group:name}`, a patch of
  `options.locale` changes the formats, e.g. of a form element of the
  language
- the globals of the page: the prop `globals` (`data-globals`), e.g. of a
  menu of the page, and hidden form elements (`"type": "hidden"`), entries
  with `globals` and a `patch` without an element, e.g. of the language
- filters: the conditions of `filter` are also `null` (no value), `{"not":
  ...}` and `{"range": [from, to]}`, a plot (`filter` of the plot) and the
  hover (`options.hover.filter`) have their own
- props: `offset` of `relative` props (the `ratio` is 1 by default), the
  prop `match` (the prop of the case of a value), a prop `of` instead of a
  reference, the margins are props, e.g. steps of `totalWidth`
- scales: `include` (values of the domain taken from the data, e.g. 0),
  `center` (a symmetric domain), `"closed": "right"` of threshold scales
  (`value > limit`); the references `@y:bandwidth`, `@y:step` (also of
  annotations) and the position of any value, e.g. `@x:scaled:100`, the
  middle of a stacked value (`@y:mid`, `@y:mid:scaled`), e.g. of labels
  in the stacks; the fixed ticks of an axis (`axis.values`) are a prop, e.g.
  fewer on a phone
- `step` of a vertical band or point scale: the pixels of a category, the
  height of the plot follows the number of categories, e.g. the bars keep
  their size if some are hidden
- the order of the categories of the data of a scale (`scale.order`),
  ascending, descending or by the value of a mapping, e.g. sorted bars
- groups of the categories of band and point scales (`scale.groups`), with
  a space between them, `@y:group:start` and `@y:group:end` of the group of
  a row
- the hover (`options.hover`): `box` and `marker` (`false` leaves them out,
  the highlight and the events stay), `position` (`pointer`), `side`,
  `offset`, `area` (`facet`, also the margins, e.g. the labels of rows),
  `empty`; the styles of the rows of the categories (`hover.row.props` of
  a categorical mapping, e.g. the lines which are not stacked in italics,
  the nearest row stays bold) and the keys of the categories as attributes
  of the rows, e.g. `data-type="load"`, for the styles of a page
- the highlight: `others-` props of the elements which are not highlighted
  while an element is, `options.highlight.transition` (the elements end at
  their values also after quick changes of the highlight)
- default colors: categories without colors have the ones of d3's scheme
  Observable10, e.g. the lines of the categories of the data are not black
- legends: `"legend": false` of a category (no entry), `position` (`top`,
  `bottom`, `left`, `right`), of the scales of colors `orientation`
  (`vertical`), `size`, `values` (ticks) and `labels` (`before`), the
  position and the orientation are props of the width, e.g. below the plots
  of a phone
- texts: `max-width` of `svg:text` and of the labels of axes cuts them with
  an ellipsis (the full text is the tooltip, also below the area of the
  hover) or wraps them (`"text-overflow": "wrap"`); the props of the
  labels of cartesian axes (`axis.labels`), e.g. bold ones of headers or
  other texts of another mapping
- transforms: `calc` (columns added, subtracted, multiplied, divided, the
  least or the largest one), `rank` (in groups), `lookup` (a value of a file
  of rows by a key, e.g. names in a language) and `mean` (the mean of the
  group, of the rows of a `base`, of at least `min` values, e.g. the mean of
  a day of all years or of a period)
- the scale of another mapping (`"scale": {"of": "y"}`), e.g. the other end
  of a band between two columns, its values are in the domain
- examples (`data/ecad/`): the charts of ecad.abteil.org, the days of a
  year in a circle with the band above or below the mean of the day, the
  years and the means of two periods
- examples (`data/wifo-radar/`): the radar of competitiveness of WIFO, the
  percentile ranks of countries or of years of a country
- the title of the hover (`options.hover.title`) has the names of the
  nearest row, e.g. `{definition}` of the category of the position; the
  `padding` of a `point` scale of angles is the place of its first category,
  `0` at the top, e.g. of a radar chart; the entries of categories of a
  legend beside the plots are one below the other
- `options.message` (a text instead of the plots, a prop, e.g. of a narrow
  screen or of an entry), `options.empty` (the text without rows),
  `options.class` and the globals as `data-global-` attributes of `.vis`
- linked charts: the prop `highlight` (`data-highlight`) and the method
  `setHighlight`, the rows of values of mappings highlighted by the page,
  e.g. of the hover of another chart
- pies and donuts: stacked angles (`stacked` of the angular mapping),
  `polar:arc` from `startAngle` to `endAngle`, the hover of the slice under
  the pointer, a ring per category of a radial mapping; `radius` is a name
  of the facets of polar plots, e.g. of the hole of a donut
- the types of TypeScript of the definitions, `Definition` and its parts,
  generated of the schema (`npm run types`)
- css variables in props, e.g. `"stroke": "var(--gen-vis-grid-color)"`, a
  value with `var(` is a style of the element, svg attributes do not know
  them, of plots, annotations, axes, legends and the highlight
- rows which are not stacked on a stacked mapping: `stacked` are the
  conditions of the rows which are stacked, as the ones of `filter`, e.g.
  `{"type": {"not": "load"}}`, the others have their own value as start and
  end, e.g. a line of the consumption on stacked areas, their values are in
  the domain and in the hover, above or below the stacked rows in the order
  of the categories
- the tick marks of axes (`axis.tickMarks`): `false` leaves them out, their
  length (`size`) and their `props`, of cartesian and angular axes
- axes: the `props` of the `labels` (`axis.labels`) also of the axes of
  polar plots, `angular` and `radial`, e.g. the values of a radial axis in
  the background, a `stroke` and a `stroke-width` replace the halo of the
  labels of radial axes, a `font-size` the one of the styles (also of
  cartesian axes, it had no effect); the props of the line of an axis
  (`axis.domain.props`), e.g. its stroke-opacity
- facets: the title of a facet spans its plot area (the margins of the
  facet are the css variables `--gen-vis-margin-left` and
  `--gen-vis-margin-right` of its style, it had an inline `margin-left`), a
  centered title is above the center of the plot area; the titles of polar
  plots are centered (`vis-facet-title-center`), above the circles
- `validateDef` warns of unknown keys of form elements and of their
  entries, e.g. a `mapping` of an entry which is not part of its `patch`

Faster and smaller:

- the module of the standalone script is minified, 86 kB (gzipped) at first
  instead of 95 kB
- a highlight of the elements which are highlighted already changes
  nothing, e.g. the hover of another point of the group of a scatter plot,
  the highlight reads the plots without the proxies of Vue
- the hover of the nearest point (`"mode": "point"`) compares the points
  near the pointer, not all of them
- the hover searches the cut texts once per draw, not at every move of the
  pointer; the bars take their scales and width once, not per row; the
  height of a drawn visualisation is measured at the next frame

Extensions, the charts are drawn as before:

- a plot type returns its marks (`marks(groups, plot, ctx)`, a layer of
  elements per row or per group, see `drawLayer` of `src/utils/draw.js`),
  the package draws them, instead of drawing them itself (`render(groups,
  parent, plot, ctx)`); `perRow` and `perGroup` are the marks of an element
  per row and of a path per group (they were `pointwise` and `groupwise`,
  which drew them)
- coordinate systems: `annotate(ctx, a)` returns the items of an annotation,
  `axes(ctx)` the parts of the axes (layers of the ticks, labels and grid
  lines, the axes of the sides), the package draws them; `ctx.keep` is left
  out
- the axes of the sides are drawn by the package, as the ones of d3-axis,
  also their transitions, `d3-axis` is no dependency anymore

## 2.1.0

- maps: the plot type `geo:mesh`, the borders of an object of TopoJSON as one
  path, every border once, `object` (the one of the features by default) and
  `borders` (`all`, `inner` or `outer`), e.g. the borders of the states above
  their districts

## 2.0.0

The changes since 1.2.0, the ones of the pre-releases below in one, and the
ones since 2.0.0-alpha.2 at the end.

Changes which need changes of definitions, styles or pages:

- definitions: `facets.dim` is the name of a mapping, not a list; the names
  of 0.9 are removed (svg:path, base:area, bar, stackedBar, "@y:st:e"); the
  categories of props are `categories` (they were `manual`), radio buttons
  `"type": "radio"` (`"switch"`); values of globals are the same as strings,
  but `0` and `""` are different; all texts are templates of the globals;
  `null` of an annotation is no value; only the footer and the templates of
  the hover are HTML, the names are text, the values of the globals in them
  too
- dates: a date without a time is the midnight of the time zone of the
  scale, local of `time` scales (it was midnight UTC), dates and times
  without a time zone are UTC of `utc` scales (they were local), dates of
  parquet and its timestamps without a time zone are strings
- the extension of a domain taken from the data is relative to the
  positions of `log`, `sqrt` and `symlog` scales
- styles: all classes start with `vis-`, e.g. vis-title, vis-legend, the
  form elements are named by `data-id`, mounted elements have `vis-mounted`,
  the default colors of annotations are styles, the charts fill `.vis`
  inside its padding and border, a facet with a hover is an application of
  screen readers (`role="application"`)
- pages: the data attributes of the standalone script are read as their
  props, e.g. `data-copy="false"` is off, `data-state` is JSON; the package
  depends on the modules of d3, not on `d3`
- extensions: plot types get plain values, the groups have `rows`,
  `at(row)`, `prop(name)`, `attrs` and `complete(row)`, `ctx` has `rows`,
  `scales`, `axis`, `stackOf` and `scope`, `groupwise(groups, parent, d)`,
  a type with `update: true` draws into its elements of the draw before

New:

- data: `transform` (year, align, index, share, rolling, cumulative, of the
  globals), parquet in the columns the definition uses
- plots: `data` (rows of their own or a url), `select`, `dodge`, `layer`,
  `facet`, horizontal bars, `@y:formatted`, the prop `format`,
  `@y:scaled:center`, annotations as plots of rows
- categories: of the data (`fromData`), the colors of a scheme, `order`,
  `ranks`, the symbols `line`, `rect` and `circle` of legends
- scales: references in `domain`, `inset`, `axis.tickSpacing`, all scales
  of d3, e.g. `ordinal` and `sequentialQuantile`, fixed categories of `band`
  and `point` scales
- hover: templates (`options.hover`), `"mode": "point"`, every hover prop
  of a category is a column, the keyboard (the arrows, enter and space
  select it), screen readers read it
- `options.transition`, without motion if the user prefers it
- any language of `Intl` as the locale, `texts` of a locale
- the CSV of the data shown, the colors as css variables, fewer layout
  shifts while a chart is loaded
- `unmountGenVisElement`, the mount functions return the components, the
  types of TypeScript, the standalone script in the package, also as a module
  of a page (`dist-lib/esm/gen-vis.js`, e.g. of a CDN)
- the page of the examples, https://petres.github.io/gen-vis/

Faster and smaller:

- the standalone script is 415 kB instead of 503 kB (141 kB instead of 168
  kB gzipped), as a module of a page it loads 90 kB gzipped at first
- the parts which not every chart needs are loaded when a chart needs them,
  chunks of their own of a bundle of an application: the check of the
  definitions, the colors of d3, the parts of maps and of polar plots, the
  transitions, the transforms, the legend of scales of colors, the languages
  of Intl, the parquet reader, the PNG and the CSV, the rest is ~65 kB
  gzipped (without Vue)
- a change draws into the elements of the draw before, the hover formats
  only the rows it shows, the view is computed without Vue, a slider is drawn
  at most once a frame, a change of a global computes the transforms from
  the first one it changes

Since 2.0.0-alpha.2:

- validateDef does not name the names of 1.x (`manual`, `switch`), they are
  unknown
- fixed: the values of the globals in the footer are text (also of the data,
  e.g. of a select of the values of a column); a state of a url can not
  change the prototype of objects (`__proto__`); a definition loaded after a
  newer one was given replaced it or its error; plots of the same id shared
  their elements; a fixed domain of a string of a global, e.g. "100", was
  "10000"; a highlight during a transition kept the values before it; a log
  scale with `nice`, of negative values; form elements of definitions
  without globals; formats of dates of mappings without a time scale; a
  patch of the props of a form element; the categories of the data of
  another column of a form element; the keyboard hover without positions
  after a change; the hover after a new width of a polar plot; the title
  template of the hover without the one of the rows; a coordinate system
  whose parts could not be loaded once; the gregorian calendar of Intl
- dates and times without a time zone, e.g. "2024-06-01 13:00", are the ones
  of the scale, also of parquet, German dates of the day first, e.g.
  "01.06.2024", year and align in UTC of `utc` scales
- validateDef warns of entries which are no objects (they were errors) and
  of definitions which can not be drawn, these are errors which name the
  part, the defaults of `options.height` (400), `facets.cols` (1) and the
  offset of the titles of axes
- the schema has references of numbers, all scales and projections, it is
  valid in the strict mode of ajv
- the names of templates of letters of any language, e.g. `{größe}`
- `null` removes a part of a mapping of a parent or a patch, e.g. its hover,
  infinite values are missing, `exportCsv` returns a promise
- rolling means of large windows, e.g. 365 days of 250 000 rows 8.7 s ->
  ~0.1 s, the requests are kept 5 minutes, data of the format of a parent is
  requested once, data which is no list of rows is an error of its url

## 2.0.0-alpha.2

Changes which need changes of definitions, styles or pages:

- the categories of props are `categories` (they were `manual`), radio
  buttons are `"type": "radio"` (they were `"switch"`, the class `vis-radio`
  was `vis-switch`), validateDef names the old ones
- only the footer is HTML, the names of the legends and the hover are text,
  e.g. `\u00a0` instead of `&nbsp;`
- form elements and their entries have their id as `data-id`, not the id
  `container-<id>`, which was twice on a page of charts with the same form
  elements; the class of mounted elements is `vis-mounted` (`gen-vis-attached`)
- the hover without format has the decimal mark of the locale, e.g. `1234,5`
  in German, it was `1234.5`; of several vertical mappings the one with a
  hover has the values of the hover, it was the last one
- the data attributes of the standalone script are read as their props,
  e.g. `data-copy="false"` is off, `data-state` is JSON
- plot types: `groupwise(groups, parent, d)` sets the path, a type with
  `update: true` draws into its elements of the draw before, the elements of
  the others are removed before

New:

- `transform`: columns computed in the browser, `year`, `align` (the day in
  one year), `index` (e.g. of a base year of a slider), `share`, `rolling`
  and `cumulative`, templates of the globals, see data/bev/def-index.json
- horizontal bars (`x1` of cartesian:bar), the hover and the stacks of
  horizontal values, the values of a second axis with a hover in the hover
- `@y:formatted` and the prop `format` for labels of values, `@y:scaled:center`
  the center of a band, see data/bev/def-hbar.json
- `order` and `ranks` of the props of categories, e.g. the newest year first
  and red, whichever year it is
- `"symbol": "line"`, `"rect"` or `"circle"` of legends
- `scale.inset` and `axis.tickSpacing` in pixels
- `options.hover`: templates of the title and the rows (also without the slot
  of Vue), `"mode": "point"` the row of the nearest point, e.g. of a scatter plot
- every hover prop of a category is a column of the hover
- the hover by the keyboard: a facet is in the order of the tab key, the arrows
  move the hover, screen readers read it
- `options.transition`: the elements move after a change of the user, the
  regions of a map change their colors also after a filter, e.g. of a slider
- `unmountGenVisElement`, the mount functions return the components

Faster and smaller:

- a change, e.g. a toggle, draws into the elements of the draw before and sets
  only the attributes which change, a toggle of 40 lines of 1000 circles
  340 -> 145 ms in Chrome; the hover formats only the rows it shows, the
  highlight finds its elements once
- the colors of d3 and the parts of maps are loaded when a chart needs them,
  20.7 kB gzipped of a bundle of an application in chunks of their own
- parquet is read in the columns the definition uses, 3 of 10 columns of
  200 000 rows ~250 -> ~70 ms

## 2.0.0-alpha.1 (not published)

- a date without a time, e.g. `2024-06-01`, is the midnight of the time zone
  of the scale, local (`time`) or UTC (`utc`), so it is the same day in every
  time zone, it was midnight UTC, so west of UTC the day before in the hover
  and the axis of a `time` scale, e.g. "April" for the 1st of May; dates of
  parquet are strings as the ones of csv. The first tick of a time axis, e.g.
  "Jan" of a year, is drawn now if the data starts at it
- the charts fill the width of `.vis` inside its padding and border, so the
  page can style it as a card, the svg was wider than the padding left
- a definition which could not be drawn, e.g. of an unknown plot type, is
  replaced by a new valid one, its error was kept
- the page of the examples on GitHub Pages: five charts of different looks,
  their definitions and CSS can be edited, the chart follows
- the tests run in the time zone of Vienna, the one of their snapshots

## 2.0.0-alpha.0

Changes which need changes of definitions, styles or extensions:

- `facets.dim` is the name of a mapping, not a list
- the names of 0.9 are removed (svg:path, base:area, bar, stackedBar, "@y:st:e")
- all classes start with `vis-`, e.g. vis-title, vis-legend, vis-plot,
  vis-axis vis-axis-left, so styles of the page for other elements, e.g.
  `.title` of a CSS framework, do not apply to them
- the default colors of annotations are styles, not attributes
- plot types get plain values, the groups have `rows`, `at(row)`,
  `prop(name)`, `attrs` and `complete(row)`, `ctx` has `rows`, `scales`,
  `axis`, `stackOf` and `scope`
- values of globals are the same as strings, but `0` and `""` are different
- all texts are templates of the globals, `null` of an annotation is no value

New:

- plots: `data` (rows of their own or a url, e.g. events or a target value),
  `select` (one row of a group, e.g. labels at the ends of lines), `dodge`
  (texts moved apart), `layer` (below the axes or above the other plots) and
  `facet` (only in some facets)
- annotations are plots of the types annotation:band, annotation:line,
  annotation:text and annotation:circle, so they can also be rows of data,
  their values can be references to globals, `label` and `text` templates
- categories of the data (`"fromData": true` of props) and the colors of a
  scheme (`scheme`, e.g. Tableau10)
- `{name}` of globals in all texts: title, subtitle, footer, names of
  mappings and categories, titles of axes, labels and texts of annotations,
  also in the image and its file name, unknown globals are warnings
- references in `scale.domain`, e.g. `[0, "@max"]`
- the colors are css variables, e.g. `--gen-vis-grid-color`, for a dark page,
  `--gen-vis-background` of the PNG
- any language of `Intl` as `options.locale`, e.g. fr or de-CH, `texts` of a
  locale object
- every facet is an image named by the title, the titles of form elements are
  their labels, the prop `csv` and `exportCsv(name)` save the rows shown
- fewer layout shifts: while a visualisation is loaded it has the space of
  the css variable `--gen-vis-loading-height` or the height it had when it was
  drawn before on the page (e.g. after a navigation), a changed definition is
  drawn when it is loaded, the one before is shown until then (it was removed),
  e.g. the CLS of a page of four charts is 0.011 instead of 0.269
- the example bev/def-labels.json: labels at the ends of lines, a text at a
  value of the vertical axis, annotations

Faster and smaller:

- only the parts of d3 which are used, the dependencies are d3 modules, the
  standalone script is 369 kB instead of 503 kB (125 kB instead of 168 kB
  gzipped)
- a form element converts only the mappings it changes, e.g. a slider over
  250,000 rows converted all mappings of all rows at every step (110 ms)
- a slider is drawn at most once a frame
- the projections and paths of maps are computed once, e.g. for the steps of
  a slider (about 45 ms for the countries of Europe before)
- the image takes the rows already loaded instead of parsing the data again
- props are compiled once, values of the rows (e.g. `@x:scaled`) are only
  computed if a prop needs them, the rows are not changed

Inside:

- the view (rows, facets, scales) is computed by src/layout.js, without Vue,
  the legend of colors has the scale of the plots
- the modules are named by their content (utils/def.js, props.js, scales.js,
  draw.js, locale.js, d3.js), the defaults of formats in one place
- snapshots of the html of all examples in tests/snapshots/

Fixed:

- the values of the hover are right-aligned by their role, before only a
  mapping named `y`
- a text annotation at `null` was not drawn, references to globals in
  annotations were NaN
- `axis.values` outside of the domain were drawn in the margins, e.g. 10 of
  a log scale from 14, also their grid lines
- `domainRel` of a log scale is relative to the positions, e.g. 5% of
  the height below and above, linear it could get below 0, also the default
  extension of 2%

## 1.2.0

- PNG of a visualisation: the props `download` (a button to save it, a
  string is the name of the file) and `copy` (a button to copy it to the
  clipboard) at the right of the footer, at the right end of the plots
- the image is a copy with the same state, drawn outside of the screen in
  the width of `imageWidth` (the one of the definition or 1200), so it is
  the same on every screen, or `screen` for the width on the screen (the
  layout of a phone), twice the size (narrow ones more, at least 1200
  pixels), without the form elements, their
  selection is a line below the subtitle, e.g. "Einheit: Anteil · Jahr:
  2024", the legends only have the entries shown, without the legend of the
  facets (their titles name them), `"inImage": false` of a form element
  leaves it out of the selection, e.g. of shared scales
- the methods `exportPng(name)`, `copyPng()` and `image()` (a Blob) of the
  component, e.g. for a button of the page
- the slot `buttons`: buttons of the page before the ones of `copy` and
  `download`, with `save()`, `copy()` and `canCopy`, e.g. other icons
- the events `rendered` (drawn the first time) and `error` (its message)
- the titles of the buttons in the language of `options.locale`
- modern-screenshot is a dependency, loaded with the first image

## 1.1.0

- form elements: a slider over the entries (`"type": "slider"`),
  `"values": { "column": "year" }` are the distinct values of a column
- legends of colors: the gradient with ticks at the positions of the colors,
  `missing` as an entry of the regions without a value
- scales: `nice` rounds the ends of the domain taken from the data
- references: the globals and `totalWidth` in all parts, e.g. the legends,
  filters, `facets.cols` and ranges, unknown references are warned of
- annotations: bands, lines, texts and circles at values of mappings, also
  of polar plots and maps, below or above the plots
- maps: `geo.include` and `geo.exclude` of features by their keys
- `"highlight": "row"` only highlights the element of the row of the hover
- legends by keyboard (tab, enter, space), a double click shows only an
  entry, the next one all
- the events `hover` and `select` with the rows under the mouse, the slots
  `hover`, `header` and `footer`, `mountGenVisElement` takes props
- faster toggles of the legends and a faster hover
- fixed: a radio button changed twice by a click on its label, an old hover
  where nothing is under the pointer, the max of a diverging scale

## 1.0.0

- consistent names of the plot types by their coordinate system:
  `svg:circle`, `cartesian:line`, `cartesian:bar` (also stacked),
  `polar:arc`, `geo:region`, ..., the names of 0.9 still work with a warning
- the plot types and coordinate systems are registries, `registerPlotType`
  and `registerCoord`
- polar coordinates (`"coord": "polar"`), e.g. radar and rose charts
- maps (`"coord": "geo"`) of GeoJSON or TopoJSON, scales of colors
  (sequential, diverging, quantize, quantile, threshold) with their legends
- `filter` of rows by values of mappings, select as form element
- data as CSV, TSV, JSON or parquet
- the standalone script has the exports as the global `GenVis`, importing
  the package outside of the browser works
- MIT license

## 0.9.0

- shared requests of the last minutes, parents and data requested at once
- arrays of entries with an id (e.g. form elements) are merged by it
- curves of lines and areas, e.g. `monotoneX`
- `@preschen/gen-vis/check` for checks of definitions in scripts

## 0.8.0

- `parent` can be a list of definitions, merged as mixins
- the radio buttons of a form element are a group per visualisation

## 0.7.0 (not published)

- the state of the user (globals and visible entries) as the prop `state`
  and the event `update:state`, e.g. for `v-model:state`

## 0.6.0

- the column of a mapping can be a template of the globals
- facets and stacks in the order of the categories, not of the rows
- form elements in one line
- the styles are in the cascade layer `gen-vis`

## 0.5.0

- an own store per visualisation and the `GenVis` component, several
  visualisations on a page
- built with vite: an es module for bundlers, Vue as a peer dependency, and
  the standalone script
- `validateDef`, `schema.json`, tests
- touch, `options.locale`, `options.fontFamily`
- fixed: missing values are gaps instead of 0, and other rendering bugs

## 0.4.0

- the package name as published on npm, `@preschen/gen-vis`
- form elements can patch mappings
