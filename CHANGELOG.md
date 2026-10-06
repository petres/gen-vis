# Changelog

The changes of the versions on npm, the newest first. The details are in the
commits, the upgrade from 0.9 in the [README](README.md#upgrading-from-09).

## 1.2.0

- PNG of a visualisation: the props `download` (a button to save it, a
  string is the name of the file) and `copy` (a button to copy it to the
  clipboard) at the right of the footer, at the right end of the plots
- the image is a copy with the same state, drawn outside of the screen in
  the width of `imageWidth` (the one of the definition or 1200), so it is
  the same on every screen, twice the size, without the form elements, their
  selection is a line below the subtitle, e.g. "Einheit: Anteil · Jahr:
  2024", the legends only have the entries shown
- the methods `exportPng(name)`, `copyPng()` and `image()` (a Blob) of the
  component, e.g. for a button of the page
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
