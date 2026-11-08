# Changelog

Changes by version, newest first. Every version is on npm except 0.7.0 and
2.0.0-alpha.1. The details are in the commits.

## 5.0.0 (alpha)

A new definition language: dims instead of mappings, marks with channels
instead of plots with props of scaled positions, controls of globals
instead of form elements with patches, the options at the top level and
one expression language with a string syntax. The engine reads the same
form as before (the one of 4.x, normalized), a definition of 5.0 is
translated into it, so the charts are drawn as before; definitions of 4.x
are migrated when they are loaded, `gen-vis migrate` writes them as ones of
5.0. Besides the language: margins measured of the axes, dodged bars,
labels, cells and rules of ranges, the highlight by classes and a
stylesheet, PNG tests in a browser, the schema of one source and fewer
builds and dependencies. The design is in `docs/design-5.0.md`.

### The language

- The options are keys of the top level: `title`, `subtitle`, `source`
  (was `options.footer`), `height`, `width`, `margins`, `coord`, `locale`,
  `language`, `transition`, `class`, `message`, `empty`, `hover`,
  `highlight`, `fontFamily`. `options` is gone.
- `dims` instead of `mapping`, with shorthands of the parts of the scale
  and the axis: `zero: true` (a domain `[0, null]`), `pad`, `include`,
  `reverse`, `range` of the scale and `grid`, `ticks`, `tickSpacing` of the
  axis; a category which is a text is its color (`"Wien": "#C3423F"`). A
  dim of `null` removes the one of a parent.
- `marks` instead of `plot`. A mark has its type, its channels and its
  attributes side by side, without `props`: `{"type": "bar", "by": "type",
  "stack": true, "opacity": 0.7}`. The channels `x`, `y` (by default the
  dims `x` and `y`), `x0`, `x1`, `y0`, `y1`, `x2`, `y2`, `lon` and `lat`
  name dims, columns of the data (a dim of the column is added), numbers
  (a value on the scale of bars and rules, e.g. a target) or expressions;
  the translation writes the props of the scaled positions which a 4.x
  definition wrote by hand (`"cx": "@x:scaled"`, `"y0":
  "@y:start:scaled"`). A dim a channel names beside the dim of its axis
  (e.g. `"y2": "hi"`) is on the scale of the axis, `scale.of` is rarely
  written. `fill` or `stroke` naming a categorical dim are the colors of
  its categories (the dim is added to `by`), naming another dim the scaled
  value (a heatmap, a choropleth); `r`, `opacity`, `stroke-width` and
  `font-size` naming a dim its scaled value.
- The mark types are the kinds of the coordinate system of the definition:
  `line`, `area`, `bar`, `rule`, `point`, `text`, `label`, `cell` of
  cartesian charts, `line`, `area`, `arc`, `point`, `text` of polar ones,
  `base`, `region`, `point`, `text`, `mesh` of maps, the full names
  (`cartesian:bar`, `svg:rect`, `annotation:line`, ...) as before. New:
  `label` (a text beside its position, `anchor`), `cell` (a rect of the
  bands of `x` and `y`), `rule` of two dims (`"y1": "lo", "y2": "hi"`, an
  error bar) or at a value (`"y": 100`).
- `stack` of a mark stacks its values (`true` or an expression of the
  rows), instead of `stacked` of the dim and the props of the start and the
  end; `stacked` and `stackBy` of a dim stay for values which no mark
  stacks, e.g. a stacked histogram of a `bin`. `dodge` of bars puts the
  groups of `by` (or of another dim) beside each other in their band (also
  of a dim without categories, a hidden category leaves its place to the
  others), `dodge` of a label (true or a dim) puts it at the middle of the
  slot of its bar. `orient` of bars (horizontal by default if `y` is
  categorical and `x` is not). `anchor` of texts and labels (`start`, `end`,
  `top`, `bottom`, `center`) instead of `dx`, `text-anchor` and
  `dominant-baseline` written by hand. The names `@dim:index` and
  `@dim:count` are the place of the category of the row among the visible
  categories and their number.
- `controls` instead of `formElements`: a control sets a `global` (was
  `ref`), its `values` are entries or plain values (`["2024", "2025"]`),
  `id` is the global by default. The `patch` of an entry is gone: every
  part of the definition can be an expression of the globals, evaluated
  before the definition is read, e.g. `"column": "=match(@values, {share:
  'value.share'}, 'value')"`; `marks` and `annotations` can be an expression
  of a global as a whole. `@globals.<name>` is the global also where a dim
  of the same name shadows it. A change of a global evaluates the
  definition again; the definitions of all values of the controls are the
  variants which the load prepares and `check` checks.
- Expressions have a string syntax: a text starting with `=` (or `@`) is an
  expression, `"=@innerWidth * 0.5"`, `"=max(@a, 0)"`, `"=@v > 0 ? 'up' :
  'down'"`, `"=match(@lang, {de: 'Quelle', en: 'Source'})"`, parsed to the
  objects of 4.x (which stay valid), see `spec/expressions.md` and its
  fixtures `spec/expressions/syntax.json`. A filter is an expression of the
  row (`"@type != 'load' and @value > 0"`, dates compare as the texts of the
  data) or the object of values of dims as before; the conditions `not` and
  `range` are still read.
- `hover.columns` lists the dims of the hover; without it the hover has the
  dims the marks use, their `by` and the dims of their positions (and the
  dims with a `hover` of their own), so the `"hover": {}` of the dims of
  4.x is not needed.
- `facets.by` is the dim of the facets (was `facets.dim`) or `{"rows",
  "cols"}` of a grid (were `rows` and `cols`); `scales` is `"own"` (the
  default, was `[]`), `"shared"` (all dims), a list or an object of a grid
  as before.
- `$schema` of gen-vis 5 (`https://unpkg.com/@preschen/gen-vis@5/schema.json`);
  the one of 4 is accepted, a definition of 4.x (by its keys) is migrated
  while it is loaded, with a notice in the console.

Removed keys: `options`, `mapping`, `plot`, the `props` of a plot,
`formElements`, `patch` (and the `ref` of a form element), `domainRel`
(`pad` replaces it), `facets.dim`. `stacked` and `stackBy` of a dim,
`scale.of`, `domainAbs`, `domainIgnores`, `once`, `place`, `dataFormat`,
`width`, `hover.mode` and `hover.radius` stay for the cases which need
them.

### Semantics decided

- Listed categories are all of them: a dim with `categories` has these,
  rows of other values are in no category; `fromData` adds the values of
  the data which are not listed (`true` ascending, `"rows"` in the order of
  the rows).
- A dim without listed categories which is a dim of the facets, has a
  legend (without a scale of colors) or parts of categories (`scheme`,
  `common`, `ranks`, `order`) has the categories of the data in the order
  of the rows (`"fromData": "rows"`); 4.x needed `fromData: true` and
  sorted them.
- `by` of a mark does not make a dim categorical, it groups rows of any
  type, e.g. a line per id (as in 4.x).
- A legend without a `symbol` has the symbols of the marks of its
  categories (`"auto"`: a box of bars and areas, a line of lines, a dot of
  points); 4.x had none. A migrated legend gets `"symbol": null`.
- An option of `null` is none, e.g. a `message` of a `match` without a
  case; an expression of the globals without a value leaves its key out
  (a `match` without a default over the value of another part is a switch
  over it, see below).
- The default dims of the hover are the ones the marks use (their `by`
  and the dims of their positions), not the dims of the facets (their
  panels have titles). The migration leaves the implied `"hover": {}` out;
  a migrated definition which uses a dim without a `hover` lists
  `hover.columns`, so its hover stays the one of 4.x.
- A `match` of a global without a default is a switch over the value of
  the other parts of the definition, merged as the patches of 4.x applied:
  the value of a parent or a child becomes its default, two matches of the
  same global merge their cases (see spec/merge.md). A mixin which switches
  a value writes its cases once, the children write only their own values
  and cases.

### Margins

`margins` are measured by default (`"auto"`, also per side): the layout
builds the facets with provisional margins, measures the axes of every
facet (the tick marks, the padding, the widest label of a left or right
axis, also of the texts of `labels.props` and at most their `max-width`,
the height of the labels of a top or bottom one, rotated labels by
their projection, the title of the axis, of a vertical axis at the top
above the plot area, the first and the last label of a
horizontal axis which reach beyond the plot area, the labels of an angular
axis around the circle; at least 8 pixels beside axes, none of a map) and
builds them again with the measured ones (`src/utils/margins.js`). The
texts are measured on a canvas in the font of the visualisation
(`src/utils/measure.js`). 57 of 63 examples of 4.x set their margins by
hand; 4.x had margins of 0 by default.

A side is the one of the definition, else the css variable of the page
(`--gen-vis-margin-top`, `-right`, `-bottom`, `-left` of `.vis` or an
element above it, a length in pixels or `auto`), else the one of the
defaults (`registerDefaults({ margins: { left: 64 } })` or the prop
`defaults` of a chart), else measured. So a house style gives its margins
once in a stylesheet and the definitions only the sides which differ. Not
measured: the texts of marks outside of the plot area, e.g. labels at the
ends of bars (give that side), the legends and the titles of facets (they
are not in the margins).

### Changed rendering

- The highlight is a class and a stylesheet: the hover and the legends give
  the elements of the highlight the class `vis-highlight` (their group
  `vis-highlight-group` of a highlight of a row) and the plots of the facet
  `vis-highlighting`, the chart has a `<style>` (scoped by `data-vis`) of
  the attributes of `highlight` and `others` of every mark; props of the
  categories, e.g. `@color`, are custom properties of the groups. The
  `highlight-*`, `others-*` and `default-*` attributes and their
  bookkeeping are gone, `highlight.transition` is a css transition. The
  attributes of a highlight are css properties of svg (colors, opacities,
  widths, `r`, `visibility`), not e.g. `dx`. The definitions are the same.
- The mount of a chart forces no layout of the page; the height of a chart
  drawn before is remembered by its definition (was its definition and
  width).
- The PNG is the export SVG drawn on a canvas (`src/utils/raster.js`) with
  the fonts of the package, the same drawing as the SVG and the PDF of the
  CLI (was a screenshot of the DOM of `modern-screenshot`).
- The categories of a vertical band or point scale without a range of
  its own run from the top down (were from the bottom up), as the rows of a
  table, e.g. horizontal bars and heatmaps; `"reverse": true` puts the first
  category at the bottom, `gen-vis migrate` writes it for such dims of 4.x.
- Snapshots were re-baselined once for the highlight; `data/` and the site
  examples are migrated, their images are the ones of 4.x.

### Transforms

`fold` (wide to long, a row per row and column of `columns`, a list or a
pattern with a `*`), `aggregate` (the `sum`, `mean`, `min`, `max`, `count`,
`median`, `first` or `last` of the group, a column of every row or a row
per group with `rows`) and `window` (`lag`, `lead`, `diff`, `pct` of
`offset` rows, or `sum`, `mean`, `min`, `max` of a window of `size` rows,
of which `rolling` is a case). The transforms of rows share one mechanism,
their rows replace the rows or follow them. Fixtures in `spec/transforms`.

### Schema, check and migration

- The schema is written in JavaScript, `src/schema/definition.js` (a
  vocabulary of JSON Schema nodes in `src/schema/dsl.js`), with the text of
  every key: `npm run schema` writes `schema.json` and
  `types/definition.d.ts`, `tests/schema.test.js` checks that both are
  current and that the names of the registries (mark types, coordinate
  systems, curves, locales, scales, projections, transforms) are the code's.
  The structural check of `validateDef` walks the same source (the
  `schema.json?check` plugin of the build is gone).
- `validateDef` takes a definition of 5.0 (one of 4.x is migrated first):
  the schema on the definition with the expressions of the globals
  evaluated, the semantic checks on the translated form with their paths
  and words mapped back (`dims`, `marks[0].fill`, `controls`), and the
  definition of every other value of the controls (`controls[0].values[1]
  > ...`), as the patches were checked before. It knows `@globals.<name>`,
  `@dim:index`, `@dim:count` and filters which are expressions.
- `gen-vis migrate <def.json>... [--write]` writes definitions of 4.x as
  ones of 5.0, to the standard output or into the files. A child is
  migrated with its parents merged (all files are read before any is
  written), so its form elements may give only the ids of the patched
  entries. A patch becomes a `match` of its global at the patched leaf
  (`"=match(@scale, {log: 'log'}, 'linear')"`), a patch of the plots, the
  annotations or the filter a `match` of the whole part, a patch of
  `scale.domainRel` one of `scale.pad`, a patch whose cases are all the
  base the base. The conditions of filters become expressions (a
  reference is `@globals.<name>`), objects of values stay; the objects of
  expressions are written in the string syntax. The chart stays the same:
  the margins stay, `"hover": {"columns": []}` and `"symbol": null` keep
  the hover and the legends of 4.x. `@preschen/gen-vis/check` exports
  `migrate`, `formatJson`, `translate`, `resolve`, `variants`,
  `isDefinition4`, `isDefinition5` and `normalize` (which resolves and
  translates a definition of 5.0 first).
- Every definition of `data/`, `site/examples/` and `site/public/charts/`
  is migrated; the 4.x originals of `data/` are fixtures
  (`tests/fixtures/v4/`), `tests/migrate.test.js` compares the migration of
  the merged 4.x definitions with the migrated files for every value of the
  controls.

Migration notes, to check by hand after `gen-vis migrate`:

- A patch of a part of a parent becomes a `match` of the global at the
  leaf it changes, without a default if the part has no value of the
  leaf: a switch over the value of the other parts, which applies after
  the merge as the patch did; a child which gives the leaf (e.g.
  `"column": "value"`) is its default.
- Two mixins which patch the same leaf by the same global merge their
  cases; by different globals the later one is the switch over the earlier
  one, a child's value is the default of the innermost one.
- A patch of the plots, the annotations or the filter is a `match` of the
  whole part; shorten it by hand if only an attribute differs.
- Remove `margins`, `"hover": {"columns": []}` and `"symbol": null` where
  the new defaults are wanted.
- A part without keys of 4.x (e.g. a parent of only `data`) is not
  rewritten, its `$schema` of 4 stays valid.

### Package and builds

- The deep merge is the package's own (`src/utils/merge.js`, the semantics
  of deepmerge, the keys in the order of the target): lists are merged by
  the `id`, the `global` or the `value` of their entries (the first of
  these which all entries have), so the controls and their entries merge
  by their globals and values without ids. `deepmerge` is no dependency.
- Two builds: the package (`dist/`) and the browser module
  (`dist-lib/esm/` and the export page). The single-file standalone script
  (`dist-lib/gen-vis.js`, `gen-vis-<version>.js`), the core loader
  (`gen-vis.core.js`), the `GenVis` globals and the export
  `@preschen/gen-vis/standalone` are gone, no page used them; the module
  sets `mountGenVisElement`, `mountGenVisByClass` and
  `unmountGenVisElement` as globals of the window.
- `modern-screenshot` is no dependency (the PNG is the export SVG).
- `tests/png.test.js` draws every definition of `data/` and the site
  examples with the CLI in one Chromium, 720 pixels wide, and compares the
  images pixel by pixel with `tests/png/` (a test fails above 0.2% of the
  pixels, the diff goes to `tests/png-diff/`, `UPDATE_PNG=1` takes new
  images); `npm run test:png` runs it alone, `npm test` includes it.
- `registerDefaults` and the prop `defaults` also take `margins`.
- Version 5.0.0-alpha.0.

## 4.1.0

Statistics (bins and random numbers in the transforms, histograms, densities
and strip plots), grids of facets, axes at a value, periods of dates, legend
symbols of the plots and of annotations, totals in the hover and labels of
maps which fit. Every 4.0 definition stays valid; some draw a little
differently, listed first.

### Changed rendering

What existing definitions draw differently:

- The labels of the axes are `padding` (3 pixels) after the end of the
  part of the tick marks outside of the plot area: their length without
  the part inside (`tickMarks.inset`, `--gen-vis-tick-inset` of a page or
  4 pixels of bottom and right axes, 5 of top and left ones); before, after
  the whole length, as if no part were inside, 7 to 8 pixels from the
  visible marks. The labels of cartesian axes move 4 (bottom, right) or 5
  (top, left) pixels towards their axis; polar axes are the same.
- The form elements and the legends above and below the plots start at the
  left edge of the title: the form elements without their margin of 4
  pixels at the left (16 pixels between them), the titles of legends
  without their margin of 3 pixels at the sides, the entries 10 pixels
  apart by a margin at their right (before 5 pixels at both sides), none
  after the last one, so a centered legend stays centered. The legends
  beside the plots keep their margins.
- A new default look of its own, not the one of a house style: the font
  is Inter, which the package brings (woff2 files of Latin and Latin
  Extended and of its symbols, e.g. CO₂, m³, ≤, →, ½, ℃, weights 400 and
  600, SIL Open Font License, loaded only by
  charts which use it, also of the PNG and the PDF of the export, so
  images are the same on every computer; `fonts/` next to the scripts,
  see the font in `docs/usage.md`; before Century Gothic, of the export
  page URW Gothic), the numbers of the hover with figures of the same width
  (`tabular-nums`); its digits are wider than the ones of Century Gothic,
  so fixed margins sized for long tick labels may need a few pixels more
  (three examples of `data/` got 6 more); the title 20px semibold, the subtitle and the footer
  grey (`--gen-vis-muted-color`), the lines and marks of the axes grey
  (`--gen-vis-axis-color`) and their labels and titles 12px a darker grey
  (`--gen-vis-axis-label-color`), the grid lines lighter, 1px and translucent (`#01132E1C`, `#E3E5E8` on white, a darker shade of the plots below them, e.g. areas of `"layer": "below"`, instead of grey stripes), the
  hover an opaque card (before 80% white) with a border
  (`--gen-vis-hover-border-color`) and a shadow whose title is one line, the focus in the first color of
  `observable10` (the colors of categories without colors, as before),
  bold texts semibold. All are css variables (see the styles of
  `docs/usage.md`); a house style sets its font and colors there, e.g.
  `--gen-vis-font-family: "Century Gothic"`. The export's `fontSize`
  scales the new sizes.
- The categories of a band, point or ordinal scale are in the order of the
  `categories` of the mapping (as the legend, the stacks and the facets),
  the ones not listed after them in the order of the rows; before, in the
  order of the rows. Lines and areas on a band or point scale connect their
  points in the order of its categories, not of the rows (also of a fixed
  `domain`, which 4.0 drew in the order of the rows, e.g. a radar as a
  star). Charts with categories listed in another order than the rows
  change, e.g. the angles of `data/bev/def-radar.json`.
- Legend symbols are centered on the middle of the capitals of the name
  (`--gen-vis-legend-symbol-middle`, 0.36em above its baseline) at any font
  size and symbol size; before, the name was 4 pixels above the bottom of
  the box of the symbol, about 1.5 pixels above its middle at 13px and more
  at 8pt. The font size of the names is the one of the entry
  (`.vis-legend-entry`, 13px), a style sets it there, not on the `span`. A
  rect symbol is at the middle of its box. The rows of the entries stay 20
  pixels high (a line height of 20/13 em, the entries at the top of the
  row), the symbol and its name are in the middle of the row: names move
  about 3 pixels down, symbols about 2 pixels, the legends and the plots
  stay where they were. The `fontSize` of the export (CLI `--font-size`)
  sizes the entries, so their symbols are centered at that size too.
- Horizontal and vertical annotation lines (cartesian plots) are at the
  position of the tick of their value, with the half pixel of the axes
  (`pixelOffset` of utils/axis.js, 0.5 on screens of one pixel per CSS
  pixel): before, they were between two pixel rows (blurry, twice as wide
  as the axis) and a pixel away from the tick of the same value. Labels
  and bands keep their positions.
- The labels of maps (`geo:text`) are at the pole of inaccessibility of the
  largest polygon of a feature, not at its centroid, so labels of long or
  bent countries are inside them; `"place": "centroid"` keeps the centroid,
  e.g. of labels on bubbles (`data/bev/def-map.json`).
- Rows without a value of a mapping of categories (e.g. an empty cell of a
  column with `fromData`) stay in the chart: they are in no category, so
  plots `by` the mapping and its scale leave them out, but other plots draw
  them. Before, they were left out of the whole chart without a message,
  e.g. all rows of other plots in one CSV. A plot only needs the values of
  the row its props use, not e.g. `@y:scaled:max` (the end of the scale).
  The categories of a scale no longer include `null`.
- A rotated axis title is in the middle of the range of its scale, not of
  the plot area (the same without a `range`).

### Features

Scales:

- `scale.domainIgnores`: the conditions of `filter` (their mappings, `true`
  all) the domain of a scale taken from the data ignores, e.g.
  `"domainIgnores": ["month"]` of a slider over months: the scale (also of
  colors and their legend) is the one of all months, the plots draw the
  rows of the month. Fixed `domain` entries still win, stacked values are
  stacked per month, facets and rows or columns of grids with own scales
  get the rows of their part.
- `pad` of a scale: extends the ends of the domain taken from the data (as
  the 2% it replaces, a fixed end such as 0 stays), positive values extend
  (a number or `[start, end]`), instead of `domainRel`, whose values are
  added; `validateDef` warns of a positive start of `domainRel` or
  `domainAbs`, which shrinks the domain and cuts off data.
- Periods of dates: `"interval": "half"` (also day, week, month, quarter,
  year, "6 months") of a date mapping of a time or utc scale: a value is
  the period starting at it (also of fiscal years, e.g. halves from
  April), the domain reaches the end of the last period, a value is at the
  middle of its period (`@x:scaled`, also of points, lines and the hover),
  `@x:scaled:start`, `@x:scaled:end` and `@x:step` are its start, end and
  length, the hover shows the period; `%K` is the half of the year in time
  formats. Bars on time scales need no `domainAbs` and widths of the plot
  width.

Transforms:

- Statistics: `bin` adds a row per class and group of the values of a
  column (`edges` of numbers and `{from, to, step}` ranges, unequal
  classes, or a `step`; `by`, `weight`, the columns `start`, `end` and
  `as`), empty classes with 0, values outside the edges left out with a
  warning; `normalize`: `"share"` of the group or `"density"` (the area is
  1), and `per` (e.g. 5 of the count per 5k of unequal classes). The rows
  stay, so a histogram and a strip plot of the same values are one chart,
  the plots draw the rows with the values they use; `"replace": true` keeps
  only the classes. The later transforms (`share`, `calc`) compute values
  of the classes. `random`: a random number per row in a `range`, the same
  on every draw (`seed`, a hash of the row's index or of a `key` column),
  e.g. the jitter of a strip plot. Both are in `spec/` with the rules of
  their numbers, for other implementations.
- Transforms can change the rows: the store prepares them again when they
  change, e.g. other edges of a global.

Plots:

- Histograms: `bar` with `x0`, `x1` and `y1` is a bar from start to end on
  a continuous scale (crisp edges, so neighbours meet without a seam), a
  `line` with `x0` and `x1` in `d` draws stairs down to the base at both
  ends (`"ends": "open"` without the drops, e.g. of shares), e.g. the outline of a density per category, an `area` with them
  fills the stairs. Examples `data/stats/histogram.json`,
  `data/stats/density.json` and `data/stats/jitter.json`.
- `stackBy` of a stacked mapping: the mapping of the positions of the
  stacks, e.g. the start of the classes of a bin (`lo`) of a stacked
  histogram whose `x` are the values of the rows, also the positions of the
  hover: the class under the pointer, the marker in its middle (example
  `data/stats/jitter.json`, with a strip plot of the values below it).
- `rule`: a line per row across the plot area at a value of x (or y), in
  the color of its category, optionally from `y1` to `y2`, e.g. the caps of
  regimes, instead of an `svg:line` with four props.
- `"once": true`: a plot drawn once per facet, of no row, e.g. a header or
  a unit label at the edge of the plot area (`@plot:top`).
- Names of the props: `@plot:top`, `@plot:bottom`, `@plot:left`,
  `@plot:right`, `@plot:width` and `@plot:height`, the edges and the size
  of the plot area in the coordinates of the plots, also of polar plots
  (around their center); `@facet` and `@facet:name`, the key and the name
  of the facet (of grids also `@facet:row`, `@facet:col` and their
  `:name`); `@row:index`, the place of the row among the rows of the plot
  in the facet, e.g. the lines of a small table per facet. `@height` of a
  prop is the one of the facet with its margins, of a `scale.range` the one
  of the plot area, so `"y2": "@height"` ends below the plot area; the docs
  say it now.
- The layer of annotations: `"layer": "below"` (default) or `"above"`, and
  `"before": "<plot id>"` right before a plot, e.g. lines above the bars
  but below labels whose halo cuts them.

- Labels inside the bands of an area plot: `"place": {"in": "areas"}` of an
  `svg:text` or `polar:text` puts a label per category inside the band of
  the area of the same category (stacked or not, of the curve of the
  area) where its whole text box has the most room, the narrowest bands
  first, without overlaps (`"overlap": true`); a label without room is left
  out (`"fit": false` places it nevertheless); `near` and `padding`. Instead
  of `select` and `dodge`, which put labels of peaks on the edges of the
  bands. Examples `data/energy/electricity/generation-hourly-inside.json`,
  `-radial.json` and `-overlap.json`.

Axes:

- Axes at a value of the other axis: `"axis": {"at": 0}` puts the line and
  the tick marks of a cartesian axis at y = 0 (or a vertical one at a value
  of x, e.g. a date), at the half pixel of the tick of the value and above
  the plots; outside of the other domain (or 0 of a log scale) it stays at
  its edge. The labels stay at the edge (`"labels": {"at": "edge"}`, the
  default) or move with the line (`"axis"`, without the label at the
  crossing). Example `data/axis/balance.json`.
- The title of a vertical axis at the top: `"title": {"name": "in €",
  "position": "top"}` draws it horizontal above the range of the scale,
  e.g. the unit at the top left.

Legends:

- The entries of the categories of the hovered row are highlighted in every
  legend (class `vis-legend-highlight`, bold of the same width, so no entry
  moves), of the hover of the plot, of a legend entry and of the highlight
  of the page.
- Legend symbols: a box of a `width` and a `height` (both `size` by
  default), e.g. a longer line of a dash without a higher box, and a
  `symbol` per category (`"categories": {"A": {"symbol": "rect"}}`), e.g.
  an area in a legend of lines. The size of the symbols is a default of the
  chart (`legend.symbol` of the defaults: `size`, `width`, `height`, per
  shortcut also `props`), e.g. 9px rects and 18×9 lines of a house style.
- `"symbol": "auto"`: the symbol of a legend of the plots of its
  categories, a box of their bars or areas, a line of their lines and a
  dot of their points together, with their style, e.g. a light area under
  a line; also of the plots of a patch of a form element, per category of
  plots with a `filter` of the mapping (a line of one, bars of the others).
- Annotations in the legend: `"legend": "name"` of an annotation is an
  entry of the legend with a symbol of it (a vertical line of a line at a
  value of x, a horizontal one of y, a box of a band), after the legends
  of the mappings.
- `"classes": true` of the legend of a threshold scale: a label per class
  (`< 50`, `50–100`, …, `≥ 300`) instead of ticks at the limits, the legend
  as wide as the labels.

Facets:

- Grids of facets: `"facets": {"cols": "group", "rows": "band"}`, a facet
  per category of the two mappings, the names of the columns above the
  first row and the ones of the rows beside them (`"rowHeaders": "right"`,
  vertical, `"left"`, horizontal, wrapped if longer than 40% of the width,
  or `{"side": "left", "vertical": true}`), empty
  boxes of combinations without rows, scales of all facets, per row or per
  column (`"scales": {"y": "row"}`, the labels only at the outer facets,
  also beside empty cells), `facet` of plots and annotations of a row, a
  column or a cell (`{"group": "Bau"}`). The facets of `dim` and a number
  of `cols` (also `"@cols"` of a global) are the ones before.
- `"facets": {"axisTitles": "outer"}`: the titles of the axes only at the
  outer facets, e.g. of x in the bottom row and of y in the first column.
- `facets.title.props`: CSS properties of the titles of the facets in the
  definition, also of the props of the category of a facet, e.g. its
  color.

Hover:

- `"total": true` (the name of the locale, e.g. `Gesamt`) or a name of
  `options.hover` is a row of the sum of the stacked values of the
  position, also `{total}` of the title; `"cell": false` of the `hover` of
  a mapping keeps its value for the templates without a column; a row
  which is not stacked is not the nearest one in a segment of a stack.

Maps and form elements:

- `"fit": true` of `geo:text` shows only the labels which fit into their
  area, `"overlap": false` only the ones which do not overlap the label of
  a larger area, without a list of them.
- The names of the values of a form element of a column: `format` (e.g.
  `"%b %Y"` of `2026-10`) or a column of `names`, instead of the raw
  values.

Languages:

- Texts in several languages: `{"de": "Bevölkerung", "en": "Population"}`
  where a text of the definition is, e.g. the title, the names of mappings,
  categories, axes and form elements, the labels of annotations, the
  templates of the hover and formats (`{"de": "%-d. %B", "en": "%B %-d"}`),
  in the language of `options.language`, a tag or a global (`"@lang"` of a
  form element or of the page), by default the one of `options.locale`,
  else the one without the region (`de` of `de-AT`) or the first one.
  Without a `locale` of its own the language is the locale of the numbers
  and dates. A language switch is a form element of the global, without a
  patch of every text (example: the polar lines of the site).

Page integration:

- `vis-button`: the class of the buttons of the footer, also of buttons of
  the page in the slot `buttons`, which then look like the ones of the
  package (an svg of strokes in `--gen-vis-button-color`, darker under the
  pointer, `--gen-vis-button-disabled-color` of a disabled one, the color
  of the text with `aria-pressed="true"`), without copies of their styles.

Warnings (console, CLI, `messages` of the export page):

- A plot none of whose rows has the values it uses, e.g. `plot 'caps': none
  of its 312 rows is drawn, 312 without a value of mapping 'y'`.
- A key of a `filter` (of the definition, a plot or the hover) which is no
  mapping, e.g. a column instead of its mapping, when the chart is drawn;
  before, only `validateDef` named it and the plot stayed empty.
- Values outside the edges of a bin and edges of no class.
- `validateDef` checks the new keys, e.g. a `facet` object of a plot
  without a grid, a `total` without a stacked mapping, keys of a bin on
  another transform.

### Fixes

- `lazy` loads ahead: the files and the data of a lazy chart are loaded and
  prepared when it is within three heights of the viewport and the browser
  is idle, it is drawn within one height (before: everything when it came
  within 400 pixels, so a chart scrolled to was often still empty). A
  string of `lazy` is still the margin of the drawing.
- A legend entry without a symbol (`{"size": 0, "elements": []}`, an
  object without elements) has no empty svg before its name, so no space
  of 5 pixels before the name and between the entries. `"symbol": null`
  is no symbol, e.g. instead of the one of a parent (the schema accepts it).
- The hover of a facet is above the facets after it: the box of a facet in
  the upper row of facets (of `dim` or a grid) was below the next row,
  whose labels and lines crossed it.
- The values of a form element of a column of a transform (`"values":
  {"column": …}`) follow the globals: of the page and the state when the
  chart is loaded and of a change of a global, e.g. the classes of a bin of
  another step or a `calc` of a global. Before, they were the ones of the
  globals of the definition and stayed.
- A band or point scale of a numeric or date mapping has a band (or a
  point) per value, in ascending order; before, its domain was the two ends
  of the values (extended by 2%), so the bars were drawn at wrong places,
  and the hover failed (`nearest is not a function`).
- Export page: each `genVisExport(options)` call (and
  `genVisExport.resolve`) loads its files fresh. Before, the page's
  5-minute cache of requests outlived a call, so a definition whose data
  file or parent had changed was drawn with the old content when the same
  page exported it again within 5 minutes (e.g. one `Renderer` of
  `wifo_genvis`), and a server rendering for several clients on one page
  could draw one client's file for another when their urls were equal.
  Within a call the files are still loaded once (e.g. the merged
  definition of function-valued `schemes`/`defaults` and the chart). Normal
  pages keep the shared cache. The CLI loads a parent shared by several
  definitions once per definition now (the files come from disk, so this
  costs little).

## 4.0.0

A shorter definition language, a core without a framework (Vue is an
optional adapter) and a renderer without d3-selection and d3-transition.
The charts look as in 3.x: the elements are the same, without Vue's scoped
ids (`data-v-…`) and comments, and a plot type's default props come before
the definition's attributes.

### Upgrading from 3.x

4.0 reads no 3.x definitions and has no migration. The migration code that
was dropped before the release is still in git
(`git show b1ab6bf^:src/utils/migrate.js`); energy-monitor was ported with
it.

Package and API:

- Node 22 or newer (`engines`), as the CLI uses node's built-in WebSocket.
- Vue is optional (`vue` is an optional peer dependency). The component and
  the plugin moved to `@preschen/gen-vis/vue`: `import GenVis from
  '@preschen/gen-vis/vue'` is the plugin, `import { GenVis } from
  '@preschen/gen-vis/vue'` the component, with the same props,
  `v-model:state`, events, slots and methods. The root
  `@preschen/gen-vis` has no default export and no `GenVis` export.
- Root exports: `createGenVis` (new), `mountGenVisElement`,
  `mountGenVisByClass`, `unmountGenVisElement`, `registerPlotType`,
  `registerCoord`, `registerScheme` (new), `registerDefaults` (new),
  `perRow`, `perGroup`.
- `mountGenVisElement` and `mountGenVisByClass` return the visualisation,
  not a Vue component: its element is `.el` (was `$el`), its props `.props`
  (was `$props`). Its methods are `exportPng`, `copyPng`, `image`,
  `exportSvg` (new), `exportCsv` and `setHighlight`, plus `update`,
  `on`/`off`, `destroy` and `state`.
- Types: `GenVis`, `GenVisSlots` and the plugin type are in
  `@preschen/gen-vis/vue`. `GenVisInstance` is now the core visualisation;
  a component ref is `GenVisComponentInstance`. The types import
  `./definition.js`, so they work with `node16`/`nodenext` resolution.
- The standalone files contain no Vue. `gen-vis.novue.js`, `esm-novue/` and
  the `@preschen/gen-vis/esm-novue` export are gone. A page with its own Vue
  uses `GenVis.vuePlugin(Vue)` (single file), `vuePlugin(Vue)` (module) or
  `(await GenVis.ready).vuePlugin(Vue)` (core loader); `createVueComponent`
  likewise.
- d3-selection and d3-transition are no longer dependencies.
  `registerCoord` and `registerPlotType` get DOM elements instead of d3
  selections (`ctx.inner`, the `parent` of `hover.area`, the `line` of
  `hover.marker`), e.g. `ctx.inner.getAttribute('transform')` instead of
  `ctx.inner.node().getAttribute('transform')`.
- Page images (PNG and SVG) are 800 px wide by default, as in the export
  (was 1200). Set `imageWidth` to keep 1200.

Definitions:

- `$schema` is required in a definition file (in the file or a parent):
  `"$schema": "https://unpkg.com/@preschen/gen-vis@4/schema.json"`. A file
  without one or with the gen-vis 3 schema fails to load;
  `./node_modules/@preschen/gen-vis/schema.json` counts as 4. An inline
  definition may have none.
- Props are expressions, close to JSON Logic. The 3.x `{"prop": …}` objects
  become: `ref` → `"@a"`; `fixed` → the value itself (`{"literal": v}` for
  texts starting with `@`, objects and lists); `relative` → `{"+": [{"*":
  ["@a", ratio]}, offset]}`; `steps` → `{"steps": ["@a", {"<cut>":
  value}]}`; `format` → `{"format": ["@a", f]}`; `match` → `{"match": ["@a",
  {cases}, default]}`; `of` → the expression instead of `"@a"`. An object
  with a single key that is an operator is now that operator, not a nested
  prop. `validateDef` does not flag leftover `{"prop": …}` objects (they
  read as nested props), so search for them.
- `calc`: `op`, `columns` and `scale` → `expr`, e.g. `divide` with `scale`
  100 → `{"*": [{"/": ["@v", "@base"]}, 100]}`.
- Mappings: the entries of `props` (`categories`, `scheme`, `common`,
  `fromData`, `order`, `ranks`) move directly onto the mapping.
- Plots: `categories` → `by`; `highlight-<name>` and `others-<name>` →
  `"highlight": {"<name>": …}` and `"others": {…}`; `"highlight": "row"` →
  `"highlight": {"mode": "row"}`. `validateDef` reports the old keys as
  unknown.
- Axes: `labels.categories` → `labels.by`.
- Types are inferred. A mapping without a type is no longer categorical: it
  is categorical by its categories, a band, point or ordinal scale, or as
  `facets.dim` or `scale.groups.by`, otherwise its type follows from the
  values (numbers numeric, dates date). A plot's `by` does not make a
  mapping categorical, so a 3.x mapping of years used only by `by` needs
  `"type": "categorical"`. A scale without a type follows the mapping
  (`linear`, `time`, `band` for bars, `point`, `ordinal`), not `linear`.
- `x` and `y` (polar: also `angle` and `radius`) get a scale with the
  matching orientation and an axis by default. Opt out with `"scale":
  false`, `"axis": false` or `"orientation": null`.
- Plot types have default props, also under their full names
  (`cartesian:line` draws a stroke in `@color`, `svg:text` fills with
  `@color`). Props equal to the defaults can go; drop an unwanted default
  with `null`, e.g. `"fill": null`.

### New

- `createGenVis(element, props)` draws a visualisation without a framework
  and returns it: `update(props)`, `on`/`off`, `destroy()`, `state`, `el`,
  `props` and the image methods. Slots are functions (the prop `slots`,
  returning a node or a text), events are listeners (`on`, or the props
  `onHover`, `onSelect`, `onRendered`, `onError`, `'onUpdate:state'`).
  Changes are drawn together in a microtask; a new state, new globals, a
  legend toggle or a new width draw a new view without loading again, the
  hover draws only itself. The styles are one stylesheet
  (`src/styles.css`), still in the cascade layer `gen-vis`, with the same
  classes and CSS variables.
- Shorter definitions: a text is a mapping's column (`"x": "Jahr"`),
  `domain` and `nice` at a mapping are its scale's, `format` the default of
  its axis and hover, short plot types (`line`, `area`, `bar`, `point`,
  `text`, `arc`, `region`) with default props, `highlight` and `others`
  objects. The definitions in `data/` and `site/` use these forms.
- Expressions: operators `+ - * /`, comparisons, `if`, `and`, `or`, `not`,
  `cat`, `min`, `max`, `round`, `var`, `format`, `steps`, `match`,
  `literal`. The new transform `filter` keeps the rows of an expression; the
  later transforms, plots and scales only see them.
- `spec/` has fixtures for the browser-independent parts (expressions,
  transforms, merging, normalize) for implementations in Python or R;
  `tests/spec.test.js` runs them. `normalize` is exported from
  `@preschen/gen-vis/check`.
- Static export (docs/export.md): `exportSvg(options)` writes an SVG for
  Word and editors (HTML texts as `<text>`, styles as attributes, no
  foreignObject, classes or CSS variables) of the chosen `parts`, sized in
  `px`, `cm`, `mm` or `in`, loaded with the first SVG (~4.5 kB gzipped); the
  prop `svg` adds a button. The export page `dist-lib/export.html`
  (`@preschen/gen-vis/export.html`, protocol version 1) is the entry for
  programs outside the browser: `window.genVisExport(options)` draws a chart
  at an exact width (e.g. `16cm`) with stylesheets, globals, a state,
  schemes, defaults and a font size, and returns the SVG and the image
  rectangle; `genVisExport.resolve(options)` returns the merged definition.
  The CLI `gen-vis export <def.json> <out.svg|out.png|out.pdf>...` uses the
  system's Chromium, Chrome or Edge (DevTools protocol over node 22's
  WebSocket, no dependencies): PNG by `--dpi` or `--scale`, PDF as a print
  of the SVG.
- `registerScheme(name, colors)` adds a color scheme for `scheme`, e.g. a
  house style, also in several sizes like the d3 ones; `validateDef` and
  `@preschen/gen-vis/check` know it. A registered `observable10` replaces
  the default category colors. It returns a function that restores the
  scheme before.
- Defaults (docs/definition.md "Defaults"): the built-in axis values
  (`builtInDefaults` in `src/utils/defaults.js`: label `padding` 3,
  `tickMarks.size` 9 cartesian / 6 angular, the new `tickMarks.inset`,
  `title.offset`) can be replaced for all charts by the prop `defaults`
  (`data-defaults`), `registerDefaults(defaults)`, the export option
  `defaults` and the CLI's `--defaults`. The definition wins, then the prop,
  then the page.
- Sizes: the single file `dist-lib/gen-vis.js` is 130 kB gzipped and the
  module `dist-lib/esm/gen-vis.js` loads 70 kB at first (3.1 with Vue: 149
  and 90 kB, 3.1 without Vue: 126 and 66 kB; 4.0 adds the SVG export). A
  Vue app built with the npm package ships about as much as with 3.1 (98
  kB gzipped at first), a page without Vue 74 kB instead of 98 kB.
  `@preschen/gen-vis/vue` imports only `h` and `render`, so a Vue app's
  bundle no longer includes all of Vue. The core loader also forwards `createGenVis`. `dist/` keeps
  dependency subpaths (e.g. `hyparquet-compressors/src/gzip.js`) external.
- Parquet decompressors load one by one, only the ones a file uses, e.g.
  zstd for polars files (3 kB instead of 75 kB for all of
  hyparquet-compressors).
- The renderer draws without d3-selection and d3-transition
  (`src/utils/dom.js`), the charts of `data/` in ~14% less time. A resize
  reuses the rows and scale values, and the highlight only touches the
  elements whose state changes.
- The README is an overview; the details are in `docs/` (definition, usage,
  export, extensions, development).

### Fixes and other changes

- Export CLI: `--root <dir>` serves site-absolute paths of definitions
  (e.g. `"/geo/europe.json"`) from a directory.
- Transforms (`calc`, `filter`) recompute when a global used in their
  expression changes.
- Dates: besides the ISO and day-first formats only ISO dates with a time
  zone (`Z` or an offset) are read; there is no `Date.parse` fallback, so
  texts like `Phase 1` or `AT-1` are no longer dates.
- Empty data renders without an error (a column without values is a date if
  its mapping has a time format).
- `""` and whitespace are missing in comparisons, `match` and equality
  (`==` and `!=` treat them as `null`, `<`, `>`, `<=` and `>=` are false).
- `validateDef` checks filter conditions that are operators as expressions
  and infers types with the load's `inferTypes` (also for transform
  columns).
- A patch with another coordinate system keeps `false` scales and axes.
- Parquet is detected by its content (`PAR1`) wherever data is loaded, also
  for URLs without an extension and the export page's `dataUrl`.
- SVG export: opacity is applied once (0.5 was 0.25), `em` lengths are
  written as px (labels in Word and LibreOffice were ~9 px off), `href` also
  as `xlink:href`, all colors (e.g. `oklch()`) as hex.
- Export CLI and page: SIGINT, SIGTERM and SIGHUP and failed starts close
  the browser and remove its profile; `--padding` and `padding` must be
  numbers ≥ 0; schemes of one `genVisExport` call are restored at the next.
- Schema: no `"linear"` default for the scale type, `orientation` may be
  `null`.
- Faster `wallTime` and type inference; a resize reuses the filtered rows
  and scale values (resize ~11% faster), the highlight only touches
  elements whose state changes (40% fewer DOM mutations per hover move).
- Removed: `utils/props.js`, the 3.x calc `columns`, the sass dev
  dependency.
- `normalize` returns 4.0 key names instead of the 3.x internal form.

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
