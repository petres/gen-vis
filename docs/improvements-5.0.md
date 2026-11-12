# Improvements for 5.0 and after: speed, size, architecture

The result of the review of 2026-11-10 of the branch `v5` (at `8b6b08e`): what was
measured, what it means and what to change. The bugs of the same review are
fixed in the code and listed in the CHANGELOG, not here.

Everything here is **done** (in 5.0). What is open or for later is in
[todo/](todo/README.md): the scheduler of the draws, the data in columns, the
lazy hover and the definitions compiled ahead moved there, with the open
points of the outside review of 2026-11-12.

## How it was measured

- Real Chromium (headless, software rendering, so only relative numbers
  count), the unminified build of the browser module, a CPU profile of the
  sampling profiler at 100 µs.
- All 72 example definitions of `data/`, each in an element of 800 px.
- Scenarios: every chart mounted and destroyed one after another (warm: the
  files are cached), all charts mounted at once on one page, 40 pointer moves
  over every facet, three resizes of the page, all charts destroyed.
- Comparisons of two builds ran interleaved in the same run, the median of
  12 passes.

## Speed

### Where the time goes

Mounting the 72 examples one after another takes 1374 ms warm. Five charts
are 60 % of it (the two of the large immo CSV, the two polar charts of the
ECAD parquet files, the load of the countries).

| Part | Share of the mount time |
|---|---|
| Loading and preparing the data (`load` of `utils/load.js`) | 40 % |
| of it: reading CSV into rows | 8 % (24 % of the large CSV) |
| of it: the types of the columns (`inferType`) | 7 % (13 % of the large CSV) |
| of it: the rows of the dims (`prepareData`) | 16 % |
| of it: the transforms | 11 % |
| Reading dates (`toDate`, `wallTime`), in all of the above | 7 % (11–23 % of time series) |
| Layout (scales, margins, groups) | 5 % |
| Drawing (axes, marks) | 18 % |
| Measuring the width (`plotsWidth`) | 4 % (13 % if all charts mount at once) |
| Garbage collection | 7 % |

So a chart is slow because of its data, not because of its drawing.

### Changes

| # | Change | Effect | Status |
|---|---|---|---|
| S1 | The rows of a file are parsed once for the charts which share it. Only the text of a request was cached, every chart parsed it again and inferred the types again. | −8 % overall, −24 % of a large CSV, more on dashboards of one file | done |
| S2 | A memo of the texts of dates (text → time, per time zone). A column of dates repeats few texts, and every value went through a regex, two array spreads and `new Date`; the transforms read the same dates again. | −11 to −23 % of time series | done |
| S3 | `destroy()` measures the height only if the frame after the last draw has not done it. The measure forced a layout per chart: 93 % of the time of removing the charts of a page. | 135 ms → 9 ms for 72 charts | done |
| S4 | A resize uses the width of the `ResizeObserver` entry instead of measuring again. | one forced layout less per chart and resize (about 20 % of a page resize) | done |
| S5 | The rows of a mark of its own `data` are kept between draws. They were new objects at every draw, so the keyed update re-created all their elements and they never animated. | fewer DOM changes at every redraw, transitions for these marks | done |
| S6 | The tick inset of the styles is read once per draw, not per axis (`getComputedStyle` between writes). | one style recalculation less per axis | done |
| S8 | The `window` transform: a sorted sliding window for median and quantiles (2.1 s for 100 000 rows at size 365), a monotonic deque for min and max (O(n·size) today), `rank` with the numbers read once. | seconds → milliseconds for long windows | done (a sliding window, the outside review) |
| S9 | `fitText` measures with the canvas (`textWidth` of `utils/measure.js`) instead of a binary search of `textContent` writes and `getComputedTextLength` reads per cut label. | fewer forced layouts in charts with cut labels | done (the canvas gets near, the element checks; the outside review) |
| S10 | The legend reads the font once per legend, not `getComputedStyle` per entry at every draw (also every frame of a slider). | one style recalculation less per entry | done (the outside review) |
| S11 | The highlight of marks without `by` indexes its elements by row once per draw instead of `querySelectorAll('*')` per change of the hover. | cheaper hover on scatter plots and bars of many rows | done (the outside review) |

S1 to S6 measured together, 5.0.0-alpha.2 against the branch with them (and
with the fixes of the review, which cost a little: the checks of the marks
without a position, the cleaned HTML), interleaved in one run:

| Scenario (72 charts) | 5.0.0-alpha.2 | With S1 to S6 |
|---|---|---|
| Mounted one after another | 1376 ms | 966 ms |
| All mounted at once | 1572 ms | 1187 ms |
| All destroyed | 141 ms | 10 ms |
| 40 pointer moves over every facet | 2343 ms | 2534 ms |
| `immo/def-final-fl` | 232 ms | 119 ms |
| `immo/def-final-f` | 117 ms | 54 ms |
| `energy/electricity/load-countries` | 96 ms | 46 ms |
| `ecad/polar-rr` | 181 ms | 151 ms |

The hover is 8 % slower in this run, within the noise of the box; its
profile shows the check of the attributes (`scriptAttr`) with 0.5 %.

### Looked at and left alone

- **The hover.** A pointer move costs about 0.5 ms on a page of 72 charts,
  half of it `getScreenCTM`. That is the layout which the browser needs for
  the box of the hover anyway, once per frame. Reading the position once per
  event is done, it changes nothing measurable. CSS `contain: layout` on the
  facet, the chart or its outer element changed nothing either.
- **The resize.** 4.4 ms per chart and resize, a full layout and redraw. Fine.
- **The drawing.** The keyed update of the layers (`drawLayer`) keeps the
  elements, the axes are kept per part. Nothing stands out.

## Size

The first load of the browser module is 99.8 kB gzip (the chunk `base`,
292.6 kB minified; 4.1 had 79.8 kB). About a third is d3 (`d3-shape`,
`d3-scale`, `d3-time-format`, `d3-array`, `d3-color`, `d3-time`,
`d3-interpolate`, `d3-format`), the rest is own code, spread evenly:
`layout.js`, `language.js`, `data.js`, `def.js` (6 kB gzip each, estimated by
their share), `load.js`, `vis.js`, `facet-hover.js`, `scales.js` (4 kB each).

The texts of errors and warnings are only 2–3 % of the source of the base
chunk: moving the diagnostics behind `check` is not worth it.

The fixes and features of the review added 5.3 kB gzip to the first load
(99.3 → 104.6 kB with `gzip -9`), spread over many modules: the reader of
CSV of semicolons and the shared rows (`data.js`, `load.js`), the cleaned
HTML (`html.js`), the marks without a position and the tweens of arcs
(`marks/elements.js`, `draw.js`), the table button (0.7 kB, its table is a
lazy chunk).

| # | Change | Saves (gzip, estimated by share) | Status |
|---|---|---|---|
| Z1 | Parts of d3 which only lazy chunks use are in `base`: `arc`, `areaRadial`, `lineRadial` and the radial curve of `d3-shape` (only polar charts), `quickselect` and `quantile` of `d3-array` (only transforms). They are reached through the barrel file of their package, which `base` imports. Removing the manual chunk group (`atOnce` of `vite.config.js`) does not move them; it needs deep imports of these files (an alias around the `exports` of the packages) or a plugin which assigns them to the chunk of their only user. | 2.5–3 kB | done (the outside review, see the CHANGELOG) |
| Z2 | The scales by name instead of `import * as d3Scale` (`utils/d3.js`): without radial, identity and the sequential and diverging variants of log, pow, sqrt, symlog and quantile, unless a definition names one (then loaded as the colors are). | about 1 kB | done (the outside review, see the CHANGELOG) |
| Z4 | The curves which few charts use (basis, catmullRom, cardinal, natural, their closed forms) loaded as the colors of d3 are, by `requirements` of `utils/load.js`. | about 2 kB | done (the outside review, see the CHANGELOG) |
| Z5 | The PNG has only the faces of Inter its texts use, not all six (188 kB of base64 in every rasterised image). | size and time of every PNG, not the bundle | done |
| Z6 | One vocabulary in the engine, see A1; the language of 4.x and its migration are removed (its lazy chunk of 6.4 kB is gone). | 0.5 kB of the first load (104.6 → 104.1 kB): the renames were a small part of the translation, the expansion of the marks stays | done |
| Z7 | A lazy chunk of the times (`scaleTime`, `d3-time`, `d3-time-format`, the periods) for charts without dates. | about 7 kB for charts without dates, one more request for all others | not worth it: most charts are time series |

Z1, Z2 and Z4 are done; the lazy hover (5–6 kB) is in [todo/speed-size.md](todo/speed-size.md). The size of 4.1 is not
in reach without dropping features: 5.0 has more of them.

## Architecture

### What to keep

- No framework and no `d3-selection` in the core: elements with a keyed
  update (`utils/draw.js`, `comp/html.js`). It is small and the profile of
  the drawing is flat.
- The store with the prepared definition, `layout(store, width)` as a pure
  function of it, the facets drawing a view.
- The lazy chunks of maps, polar charts, parquet, the check, the migration,
  the transforms, the colors and the exports.
- The registries of mark types and coordinate systems.

### A1: one vocabulary (done, internal)

A definition of 5.0 (`dims`, `marks`, `controls`, the options at the top) was
translated at every load into the form of the engine of 4.x (`mapping`,
`plot`, `formElements`, `options`), and the paths of errors were translated
back (`authoredPath`): everybody who read the code had to know both
vocabularies, the tests, the messages, the types and the docs spoke 5, the
engine spoke 4.

The engine has the vocabulary of 5 now (`dims`, `marks`, `controls` of a
`global`, the options at the top level, `src/marks/`): the translation is a
set of shorthand expansions, the paths of the checks are the ones of the
definition (but for the `props` of a mark), and nothing changes for a
definition.

### Smaller points (done)

- `store.scope` and `store.names` are built once per state of the globals,
  not at every read.
- The keys of the remembered heights of inline definitions are a hash.
- The ticks of an axis with a grid are computed once.
- A definition is resolved, translated and normalized once per load
  (`utils/compile.js`), it was four times.
- Dead code is removed: `finish` of `utils/draw.js`, the outer ticks of
  `utils/axis.js`, `propScale` beside `propDim`, `dateComparisons`, exports
  nothing imports; `tickInset` is one.

## Content security policy

The CSV reader of d3 (`csvParse`) builds a function from text and so needs
`unsafe-eval`; 5.0 reads CSV and TSV without it. The prop `nonce`
(`data-nonce`) is the nonce of the `<style>` elements of the package (its
stylesheet and the one of the highlights of a chart), see
[usage.md](usage.md). What still violates a strict policy is in
[todo/bugs.md](todo/bugs.md).
