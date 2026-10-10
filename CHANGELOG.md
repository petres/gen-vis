# Changelog

The changes of the versions on npm, the newest first. The details are in the
commits, the upgrade from 1.x in the [README](README.md#upgrading-from-1x).

## 2.0.0-alpha.2

Changes which need changes of definitions, styles or pages, see the
[README](README.md#upgrading-from-1x):

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

## 2.0.0-alpha.1

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

Changes which need changes of definitions, styles or extensions, see the
[README](README.md#upgrading-from-1x):

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
  standalone script is 359 kB instead of 503 kB (121 kB instead of 168 kB
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

## 0.7.0

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
