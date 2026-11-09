# gen-vis

**[Examples](https://petres.github.io/gen-vis/)**: nine charts with
different looks. You can edit their definitions and CSS on the page, and
the charts update as you type.

A declarative d3 visualisation library: a JSON definition (the *def*) and a
data file (CSV, TSV, JSON or parquet) describe a chart. It draws line,
point, bar (stacked, dodged), area and heatmap charts, error bars,
histograms and strip plots, polar charts (e.g. radar, rose and pie charts)
and maps, with legends, hover, facets (also grids of them) and controls. A page
draws a chart from a definition file or object and styles it with CSS; the
same definition exports to SVG, PNG or PDF for documents.

## Example

A definition `def.json` next to its data
[`data.csv`](data/bev/data.csv) (the population of the Austrian states; a
longer version is `data/bev/def.json`):

```json
{
    "$schema": "https://unpkg.com/@preschen/gen-vis@5/schema.json",
    "data": "data.csv",
    "transform": [{ "type": "filter", "expr": "@Bundesland != 'ÖSTERREICH'" }],
    "title": "Bevölkerung nach Bundesland",
    "height": 300,
    "dims": {
        "x": { "column": "Jahr", "format": "c" },
        "y": { "column": "Einwohner", "format": ",.0f", "zero": true, "grid": true },
        "land": { "column": "Bundesland", "scheme": "Tableau10", "legend": { "onlyData": true } }
    },
    "marks": { "type": "line", "by": "land", "stroke-width": 2, "highlight": { "stroke-width": 4 } }
}
```

The dims name the columns: `x` and `y` are the positions, with an axis
each, `land` has a category per state, with a color of the scheme and a
legend. The mark draws a line per state (`by`). The years are numbers, so
`"format": "c"` shows them as 2002, not 2.002; `zero` starts the axis at 0.
The filter drops the Austria total (`ÖSTERREICH`), and `onlyData` keeps it
out of the legend. The margins are measured of the axes, the hover lists
the states of the year under the pointer.

A page which draws it:

```html
<div class="genVis" data-def-file="def.json" data-download></div>

<script type="module">
import { mountGenVisByClass } from 'https://cdn.jsdelivr.net/npm/@preschen/gen-vis@5/dist-lib/esm/gen-vis.js';
mountGenVisByClass('genVis');
</script>
```

The `$schema` declares the definition language version (gen-vis 5).
Editors like VS Code use it to complete and check the definition. The
definition language is described in [docs/definition.md](docs/definition.md);
`npx gen-vis migrate` writes definitions of gen-vis 4 as ones of gen-vis 5.

## Usage

```sh
npm install @preschen/gen-vis
```

The package is a framework-free core, a browser module for pages
without a bundler and a Vue 3 adapter (`vue` is an optional peer
dependency). All three take the same props, events and methods (see
[docs/usage.md](docs/usage.md)):

- **ES module** for an application with a bundler: `createGenVis(element,
  props)` draws a visualisation in an element and returns it,
  `update(props)` changes it:

  ```js
  import { createGenVis } from '@preschen/gen-vis';

  const chart = createGenVis(document.getElementById('chart'), { defFile: '/data/bev/def.json', download: true });
  chart.on('select', e => console.log(e.key));
  chart.update({ globals: { lang: 'en' } });
  ```

- **Vue component** from `@preschen/gen-vis/vue`, with `v-model:state`, the
  events and the slots. The default export is the plugin, `{ GenVis }` the
  component:

  ```js
  import GenVis from '@preschen/gen-vis/vue';

  app.use(GenVis);
  ```

  ```html
  <GenVis def-file="/data/bev/def.json" @select="open"/>
  ```

- **Browser module** for a page without a bundler, e.g. from a CDN:
  `dist-lib/esm/gen-vis.js` (above; 87 kB gzipped at first, optional parts
  load when a chart needs them). `mountGenVisByClass(className)` mounts the
  elements with that class, the `data-` attributes are their props:

  ```html
  <div class="genVis" data-def-file="/data/bev/def.json" data-lazy></div>
  <script type="module">
  import { mountGenVisByClass } from 'https://cdn.jsdelivr.net/npm/@preschen/gen-vis@5/dist-lib/esm/gen-vis.js';
  const charts = mountGenVisByClass('genVis');
  </script>
  ```

## Features

- **Marks**: lines, areas, bars (also stacked, dodged and horizontal),
  rules (also error bars), points, labels, cells (heatmaps) and SVG
  elements, in cartesian and polar coordinates (radar, rose and pie
  charts) and on maps (GeoJSON or TopoJSON, choropleths, circles, labels
  which fit), facets by a column or grids of facets by two (rows and
  columns), axes at a value (e.g. at zero) and periods of dates (e.g. bars
  a month wide).
- **Short definitions**: a dim can be just its column name, types follow
  from the values, a mark names its dims by its channels and has the
  attributes it needs by default, the margins are measured of the axes.
  Parents and mixins for shared parts, data transforms (e.g. an index to a
  base year, the classes of a histogram or densities with `bin`, the jitter
  of a strip plot with `random`, wide to long with `fold`, `aggregate` and
  `window`), expressions in a string syntax (`"=@innerWidth * 0.5"`),
  annotations, controls (radio buttons, selects, sliders) of globals which
  every part of the definition can use (`match`), page globals, text
  templates and texts in several languages (`language`).
- **Interaction**: hover (also by keyboard), legends which show and hide
  categories (with symbols of the marks and entries of annotations), totals
  of stacks in the hover, highlight, hover and selection events, linked charts on a
  page, a state of the user's changes, transitions, lazy loading.
- **Styles** from the page: a default look of its own (the font Inter,
  which the package brings, grey axes, light grid lines, a hover card),
  classes start with `vis-`, the package styles are in a cascade layer,
  colors, font and margins are CSS variables. House color schemes
  (`registerScheme`) and the defaults of the axes and the margins
  (`registerDefaults`) apply to all charts on a page.
- **Images and data**: buttons and methods for PNG, SVG and a CSV of the
  data shown.
- **Static export**: `exportSvg` writes an SVG for Word, LaTeX and editors
  (texts stay texts, no HTML, no CSS). The CLI `gen-vis export` writes SVG,
  PNG and PDF files from definition files at a physical size (e.g. `--width
  16cm --font-size 8pt --dpi 300`) with the system's Chromium, Chrome or
  Edge. Other programs, e.g. Python or R wrappers, drive the same export
  page.
- **Checks**: `check` warns about mistakes while you write a definition,
  `@preschen/gen-vis/check` checks and migrates definitions in scripts, and
  the JSON Schema and TypeScript types describe the definitions.
- **Extensions**: register your own mark (plot) types, coordinate systems
  and color schemes.

```sh
npx gen-vis export data/bev/def.json bev.svg bev.png bev.pdf --width 16cm --font-size 8pt --dpi 300
npx gen-vis check data/*/def*.json --strict   # the schema, the checks and the data, without a browser
npx gen-vis migrate old/*.json --write   # definitions of gen-vis 4 as ones of gen-vis 5
```

## Documentation

- [Recipes](docs/recipes.md): definitions of common charts (sorted bars,
  a pyramid, error bars, bubbles, a donut, a choropleth, labelled lines)
  and the things to know.
- [Reference](docs/reference.md): the keys of every part of a definition in
  tables, with their types and texts (generated of the schema).
- [Definition](docs/definition.md): the definition language, `$schema`,
  parents and mixins, [data](docs/definition.md#data),
  [`transform`](docs/definition.md#transform),
  [the options](docs/definition.md#the-options) (texts, sizes,
  [margins](docs/definition.md#margins), [defaults](docs/definition.md#defaults)),
  [`dims`](docs/definition.md#dims) (scales, axes, categories, legends),
  [`marks`](docs/definition.md#marks), [polar
  charts](docs/definition.md#polar-charts), [maps](docs/definition.md#maps),
  [annotations](docs/definition.md#annotations),
  [`hover`](docs/definition.md#hover), [`facets`](docs/definition.md#facets),
  [`filter`](docs/definition.md#filter), [globals and
  controls](docs/definition.md#globals-and-controls),
  [expressions](docs/definition.md#expressions) and their
  [names](docs/definition.md#names), the [migration from
  4.x](docs/definition.md#migration-from-4x).
- [Usage](docs/usage.md): the [browser
  module](docs/usage.md#browser-module), the
  [JavaScript](docs/usage.md#javascript) API, the [Vue
  component](docs/usage.md#vue-component), [props](docs/usage.md#props),
  [events and slots](docs/usage.md#events-and-slots), [linked
  charts](docs/usage.md#linked-charts), [PNG](docs/usage.md#png), [layout
  shifts](docs/usage.md#layout-shifts), [lazy
  loading](docs/usage.md#lazy-loading),
  [accessibility](docs/usage.md#accessibility-and-the-data),
  [state](docs/usage.md#state), [styles](docs/usage.md#styles) (classes and
  css variables).
- [Static export](docs/export.md): [`exportSvg`](docs/export.md#exportsvg),
  the [export page](docs/export.md#export-page) (`window.genVisExport`) and
  the [CLI](docs/export.md#cli) `gen-vis export`.
- [Extensions](docs/extensions.md): `registerMarkType`, `registerCoord`,
  `registerScheme`, `registerDefaults`, the schema and the types, [checks
  outside the browser](docs/extensions.md#checks-outside-the-browser)
  (`validateDef`, `migrate`, `@preschen/gen-vis/check`).
- [Development](docs/development.md): the dev server, tests and
  snapshots, builds, publishing, the examples site, `spec/`; the design of
  the definition language of [5.0](docs/design-5.0.md) and of
  [4.0](docs/design-4.0.md).

Changes by version are in the [changelog](CHANGELOG.md).

## License

MIT, see [LICENSE](LICENSE). The example data in `data/` has its own
sources, see the definition footers and the READMEs in `data/geo/` and
`data/energy/`.
